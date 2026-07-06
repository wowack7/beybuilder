import { describe, expect, test } from 'vitest'
import { parseCsv, parseSiteCombos, shouldUseCache, transformAll } from './transform'

describe('parseCsv', () => {
  test('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('"a,b",c\n"say ""hi""",d\n')
    expect(rows).toEqual([
      ['a,b', 'c'],
      ['say "hi"', 'd'],
    ])
  })

  test('skips fully empty rows', () => {
    expect(parseCsv('a,b\n,\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('parseSiteCombos', () => {
  test('expands ratchet options × bit list and keeps explicit pairs', () => {
    const combos = parseSiteCombos('固鎖：9-60, W / 1-60 | 軸心：LF', '鮫')
    expect(combos).toEqual([
      { blade: '鮫', ratchet: '9-60', bit: 'W' },
      { blade: '鮫', ratchet: '9-60', bit: 'LF' },
      { blade: '鮫', ratchet: '1-60', bit: 'LF' },
    ])
  })

  test('captures assist tokens and strips # comments', () => {
    const combos = parseSiteCombos('固鎖：3-60, 輔助J, H #備註\n冠軍配置：9-70, 輔助W, T', '天馬')
    expect(combos).toContainEqual({ blade: '天馬', ratchet: '3-60', bit: 'H', assist: 'J' })
    expect(combos).toContainEqual({ blade: '天馬', ratchet: '9-70', bit: 'T', assist: 'W' })
  })
})

describe('transformAll tier inheritance', () => {
  const header =
    '"型號 (ID)","中文名稱 (Name)","分類 (Category)","類型 (Type)","階級 (Tier)","購買建議 (Buy)","原裝固鎖 (Ratchet)","固鎖階級 (Ratchet Tier)","原裝軸心 (Bit)","軸心階級 (Bit Tier)","原裝輔助戰刃 (Assist Blade","來源產品 (Source)","圖片網址 (Img)","建議配置 (Combo)"'
  const row = (id: string, name: string, tier: string) =>
    `"${id}","${name}","blade","attack","${tier}","","3-60","S","F","A","","","",""`
  const tierCsv = [
    header,
    row('BX-01', '蒼穹龍騎士(左)', 'S+'),
    row('BX-02', '蒼穹龍騎士', ''),
    row('BX-03', '魔導神杖', 'X'),
    row('BX-04', '魔導神杖(綠)', ''),
  ].join('\n')
  const comboCsv = 'site_recommendation_rank,site_combo_display\n'
  const partsCsv = '"原裝固鎖、軸心","分類 (Category)","圖片網址 (Img)"\n'

  test('recolor inherits family tier; right-spin does NOT inherit from left-spin', () => {
    const { parts } = transformAll({ tierCsv, comboCsv, partsCsv })
    const byName = new Map(parts.blades.map((b) => [b.name, b]))
    expect(byName.get('魔導神杖(綠)')).toMatchObject({ tier: 'X', tierInherited: true })
    expect(byName.get('蒼穹龍騎士')).toMatchObject({ tier: '', tierInherited: false })
    expect(byName.get('蒼穹龍騎士(左)')).toMatchObject({ tier: 'S+', tierInherited: false })
  })
})

describe('shouldUseCache', () => {
  test('newer cache wins, older or equal cache is discarded', () => {
    expect(shouldUseCache('2026-07-06T10:00:00Z', '2026-07-06T09:00:00Z')).toBe(true)
    expect(shouldUseCache('2026-07-06T08:00:00Z', '2026-07-06T09:00:00Z')).toBe(false)
    expect(shouldUseCache('2026-07-06T09:00:00Z', '2026-07-06T09:00:00Z')).toBe(false)
  })
})
