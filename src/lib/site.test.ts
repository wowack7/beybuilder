/**
 * 守門測試：index.html 與 vite.config.ts 無法 import src/lib/site.ts，
 * 只能寫死字面量。這裡實際讀那兩個檔比對，漏改一處就紅燈——
 * 不然改 repo 名或換自訂網域時，canonical／og:image／sitemap 會靜默指向舊網址
 * （站還是開得起來，但 Search Console 會退回 sitemap、分享縮圖 404）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { PALETTE } from './palette'
import { BASE_PATH, OG_IMAGE_URL, SITE_URL, TIER_PATH } from './site'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8')
const viteConfig = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')

const attr = (html: string, re: RegExp): string | undefined => html.match(re)?.[1]

describe('site 常數本身', () => {
  test('SITE_URL 以斜線結尾（用於字串串接子路徑）', () => {
    expect(SITE_URL.endsWith('/')).toBe(true)
  })

  test('SITE_URL 的路徑部分等於 BASE_PATH', () => {
    expect(new URL(SITE_URL).pathname).toBe(BASE_PATH)
  })
})

describe('index.html 與 site.ts 一致', () => {
  test('canonical 指向 SITE_URL', () => {
    expect(attr(indexHtml, /<link rel="canonical" href="([^"]+)"/)).toBe(SITE_URL)
  })

  test('og:url 指向 SITE_URL', () => {
    expect(attr(indexHtml, /property="og:url" content="([^"]+)"/)).toBe(SITE_URL)
  })

  test('og:image 與 twitter:image 都是絕對 URL 且指向 OG_IMAGE_URL', () => {
    expect(attr(indexHtml, /property="og:image" content="([^"]+)"/)).toBe(OG_IMAGE_URL)
    expect(attr(indexHtml, /name="twitter:image" content="([^"]+)"/)).toBe(OG_IMAGE_URL)
  })

  test('JSON-LD 可解析且 url 指向 SITE_URL', () => {
    const raw = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
    expect(raw).toBeTruthy()
    const ld = JSON.parse(raw as string)
    const urls = ld['@graph'].map((n: { url: string }) => n.url)
    expect(urls).toContain(SITE_URL)
    expect(urls.every((u: string) => u === SITE_URL)).toBe(true)
  })

  test('靜態骨架含一條連往天梯頁的絕對連結（爬蟲唯一入口，不能是相對路徑）', () => {
    expect(indexHtml).toContain(`href="${SITE_URL}${TIER_PATH}"`)
  })

  test('theme-color 與 tokens 的背景色一致', () => {
    expect(attr(indexHtml, /name="theme-color" content="([^"]+)"/)).toBe(PALETTE.bg)
  })
})

describe('vite.config.ts 與 site.ts 一致', () => {
  test('base 設定值等於 BASE_PATH', () => {
    // 解析實際的 `base: '...'` 那行來比對，而非 toContain（BASE_PATH 為 '/' 時
    // toContain 會被註解裡的 '/' 誤中而變成永遠通過的空洞守門）。
    const m = viteConfig.match(/base:\s*'([^']*)'/)
    expect(m?.[1]).toBe(BASE_PATH)
  })
})
