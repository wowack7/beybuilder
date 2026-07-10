/**
 * 守門測試：palette.ts 的 oklch 數值必須與 src/styles/tokens.css 相同。
 * 兩者是同一組設計 token 的兩種表示（CSS 給瀏覽器、TS 給 og 縮圖與靜態頁），
 * 改了一邊沒改另一邊，分享縮圖與 SEO 頁會靜默保留舊配色。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { PALETTE, TOKENS, oklchToHex } from './palette'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const tokensCss = readFileSync(join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8')

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** 從 tokens.css 讀出 `--name: oklch(L% C H);` 的三元組（帶 alpha 的變體不在 TOKENS 內） */
function cssOklch(varName: string): [number, number, number] | null {
  const m = tokensCss.match(
    new RegExp(`--${varName}:\\s*oklch\\(\\s*([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)`),
  )
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

describe('oklchToHex', () => {
  test('純黑與純白為已知邊界值', () => {
    expect(oklchToHex(0, 0, 0)).toBe('#000000')
    expect(oklchToHex(100, 0, 0)).toBe('#ffffff')
  })

  test('超出 sRGB 色域時夾在 00–ff，不產生非法色碼', () => {
    expect(oklchToHex(76, 0.4, 55)).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('TOKENS 與 tokens.css 同步', () => {
  for (const [name, triple] of Object.entries(TOKENS)) {
    test(`--${kebab(name)} 的 oklch 值一致`, () => {
      expect(cssOklch(kebab(name)), `tokens.css 找不到 --${kebab(name)}`).toEqual([...triple])
    })
  }
})

describe('PALETTE', () => {
  test('每個 token 都算出合法 hex', () => {
    for (const hex of Object.values(PALETTE)) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('accent 是橘色（R 最大、B 最小）——防止色相角打錯', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(PALETTE.accent.slice(i, i + 2), 16))
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
  })
})
