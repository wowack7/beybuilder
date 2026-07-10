/**
 * scripts/gen-seo.mjs 的純函式測試（import 時不會寫檔——該檔尾端有 argv 守衛）。
 * 這頁是唯一給爬蟲看的內容，錯了不會有任何 runtime 錯誤，只會靜默發布錯資料，
 * 所以用測試把幾條規範釘住：階級排序、未評級殿後、不外洩 score、HTML escape。
 */
import { describe, expect, test } from 'vitest'
import { SITE_URL, TIER_PATH } from '../src/lib/site.ts'
import { buildSitemap, buildTierPage, groupByTier } from './gen-seo.mjs'

const PARTS = {
  blades: [
    { name: '天馬爆擊', tier: 'X' },
    { name: '蒼龍勇氣', tier: 'S' },
    { name: '八岐大蛇', tier: 'A+' },
    { name: '未知刃', tier: '' },
  ],
  ratchets: [{ id: '3-60', tier: 'A' }],
  bits: [{ id: 'J', tier: 'S+' }],
  assists: [{ id: 'S', tier: '' }],
}
const COMBOS = [
  { blade: '蒼穹龍騎士(左)', ratchet: '5-60', bit: 'E', wins: 791, champRate: 0.1922, score: 1468.25 },
  { blade: '天馬爆擊', ratchet: '6-60', bit: 'V', wins: 12, champRate: 0, score: 99.5 },
]
const GENERATED_AT = '2026-07-09T17:00:00.000Z'

const page = (over = {}) =>
  buildTierPage({ parts: PARTS, combos: COMBOS, generatedAt: GENERATED_AT, ...over })

describe('groupByTier', () => {
  test('依 TIER_ORDER 由高到低排序，X 在最前', () => {
    const groups = groupByTier(PARTS.blades, (b) => b.name)
    expect(groups.map((g) => g.tier)).toEqual(['X', 'S', 'A+', '未評級'])
  })

  test('TIER_ORDER 之外的階級（含空字串）歸為未評級並殿後', () => {
    const groups = groupByTier([{ name: 'a', tier: 'ZZ' }, { name: 'b', tier: 'X' }], (x) => x.name)
    expect(groups.at(-1)).toEqual({ tier: '未評級', names: ['a'] })
  })

  test('不變動傳入的陣列', () => {
    const items = [{ name: 'b', tier: 'X' }, { name: 'a', tier: 'X' }]
    const snapshot = [...items]
    groupByTier(items, (x) => x.name)
    expect(items).toEqual(snapshot)
  })
})

describe('buildTierPage', () => {
  test('列出每個零件名稱（長尾關鍵字的全部來源）', () => {
    const html = page()
    for (const b of PARTS.blades) expect(html).toContain(b.name)
    expect(html).toContain('3-60')
    expect(html).toContain('輔助S')
  })

  test('不外洩引擎內部分數——CLAUDE.md：分數僅供排序，UI 一律不顯示', () => {
    const html = page()
    expect(html).not.toContain('1468')
    expect(html).not.toContain('99.5')
    expect(html.toLowerCase()).not.toContain('score')
  })

  test('顯示勝場與奪冠率（來源站真實資料）', () => {
    const html = page()
    expect(html).toContain('791')
    expect(html).toContain('19%')
  })

  test('組合依勝場由多到少排序', () => {
    const html = page()
    expect(html.indexOf('蒼穹龍騎士(左)')).toBeLessThan(html.indexOf('6-60'))
  })

  test('缺 assists 欄位時不炸掉（data.ts 也視為選用；否則整個 build 會掛）', () => {
    const { assists: _drop, ...noAssists } = PARTS
    expect(() => page({ parts: noAssists })).not.toThrow()
    expect(page({ parts: noAssists })).toContain('0 款輔助刃')
  })

  test('缺 wins/champRate 時當成 0，不印出 undefined/NaN', () => {
    const html = page({ combos: [{ blade: 'x', ratchet: '1-60', bit: 'A' }] })
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('NaN')
  })

  test('HTML 特殊字元被 escape，不會壞掉標記', () => {
    const html = page({ parts: { ...PARTS, blades: [{ name: '<img src=x onerror=1>&"', tier: 'X' }] } })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=1&gt;&amp;&quot;')
  })

  test('保留資料出處聲明（CLAUDE.md 要求 attribution）', () => {
    const html = page()
    expect(html).toContain('stan-yao')
    expect(html).toContain('phstudy')
  })

  test('canonical 指向天梯頁自身', () => {
    expect(page()).toContain(`<link rel="canonical" href="${SITE_URL}${TIER_PATH}">`)
  })
})

describe('buildSitemap', () => {
  test('列出首頁與天梯頁，lastmod 取資料產生日期', () => {
    const xml = buildSitemap(GENERATED_AT)
    expect(xml).toContain(`<loc>${SITE_URL}</loc>`)
    expect(xml).toContain(`<loc>${SITE_URL}${TIER_PATH}</loc>`)
    expect(xml).toContain('<lastmod>2026-07-09</lastmod>')
  })

  test('是合法的 sitemap XML 外殼', () => {
    const xml = buildSitemap(GENERATED_AT)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  })
})
