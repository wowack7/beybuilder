/**
 * 設計 tokens 的程式端鏡像（來源仍是 src/styles/tokens.css）。
 *
 * 為什麼需要：og 縮圖（sharp/librsvg）與靜態天梯頁（無 bundler）都吃不到 CSS 變數，
 * 只能拿具體色碼。與其在各處手打 hex（改 tokens.css 就靜默走鐘），
 * 統一在這裡放 oklch 數值並換算——只剩 CSS 與本檔兩份表示，且色碼是算出來的、不是目測。
 * src/lib/palette.test.ts 比對本檔與 tokens.css 的 oklch 數值，改一邊沒改另一邊會測試失敗。
 */

/** oklch(L% C H) → #rrggbb（Björn Ottosson 的 Oklab → linear sRGB 矩陣） */
export function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180
  const L = l / 100
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)

  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]

  const hex = linear
    .map((v) => {
      const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
      return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')
  return `#${hex}`
}

/** 與 src/styles/tokens.css 對應的 oklch 三元組 [L%, C, H] */
export const TOKENS = {
  bg: [15, 0.018, 265],
  bgRaised: [20, 0.022, 265],
  bgOverlay: [25, 0.028, 265],
  text: [94, 0.008, 250],
  textDim: [72, 0.015, 255],
  textFaint: [56, 0.015, 255],
  accent: [76, 0.19, 55],
  accentDeep: [62, 0.17, 50],
  accentInk: [20, 0.05, 55],
} as const satisfies Record<string, readonly [number, number, number]>

export type TokenName = keyof typeof TOKENS

/** 各 token 的 hex 色碼（由 TOKENS 算出，非手打） */
export const PALETTE = Object.fromEntries(
  Object.entries(TOKENS).map(([name, [l, c, h]]) => [name, oklchToHex(l, c, h)]),
) as Record<TokenName, string>
