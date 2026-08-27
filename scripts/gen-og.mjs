/**
 * 產生社群分享縮圖（1200×630）：
 *   public/og.png       —— 全站預設（首頁／分享 App）
 *   public/og-tier.png  —— /tier/ 靜態天梯頁專用（同一套版型，換文案）
 *   public/og-draw.png  —— /draw/ 抽選目錄專用
 * 一次性腳本：改了視覺才需重跑（`node scripts/gen-og.mjs`），產物已 commit，
 * 不掛在 build 上（省 build 時間）。
 *
 * 色碼由 src/lib/palette.ts 依 tokens.css 的 oklch 算出——librsvg 不支援 oklch()，
 * 但也不該手打 hex，否則 tokens.css 一改縮圖就與站上調性靜默走鐘。
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { PALETTE as C } from '../src/lib/palette.ts'
import { DRAW_PATH, SITE_URL, TIER_PATH } from '../src/lib/site.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const W = 1200
const H = 630

const TIERS = ['X', 'S+', 'S', 'A+']

const chips = TIERS.map((t, i) => {
  const x = 96 + i * 104
  return `
    <g transform="translate(${x} 486)">
      <rect width="84" height="52" rx="10" fill="${i === 0 ? C.accent : C.bgOverlay}"
            stroke="${i === 0 ? C.accent : C.textFaint}" stroke-opacity="${i === 0 ? 1 : 0.35}"/>
      <text x="42" y="35" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="26" font-weight="700" fill="${i === 0 ? C.accentInk : C.textDim}">${t}</text>
    </g>`
}).join('')

const domainLabel = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')

/**
 * 兩張圖共用同一套版型（背景、斜切光帶、階級籤都一樣），只換三行字與右下角網址——
 * 分享出去要一眼認得出是同一個站，不是兩套設計。
 */
const render = ({ kicker, kickerAccent, title, sub, pathLabel }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.18" cy="0" r="0.85">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="surface" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${C.bgRaised}"/>
      <stop offset="1" stop-color="${C.bg}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#surface)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- 右側斜切光帶，避免死板的置中版型 -->
  <path d="M ${W - 300} 0 L ${W} 0 L ${W} ${H} L ${W - 430} ${H} Z" fill="${C.accent}" fill-opacity="0.05"/>
  <path d="M ${W - 296} 0 L ${W - 272} 0 L ${W - 402} ${H} L ${W - 426} ${H} Z" fill="${C.accent}" fill-opacity="0.5"/>

  <text x="96" y="250" font-family="Helvetica, Arial, sans-serif" font-size="104"
        font-weight="700" letter-spacing="-1" fill="${C.text}">${kicker}<tspan fill="${C.accent}">${kickerAccent}</tspan></text>

  <text x="98" y="330" font-family="PingFang TC, Heiti TC, Noto Sans CJK TC, sans-serif"
        font-size="44" font-weight="600" fill="${C.text}">${title}</text>

  <text x="98" y="392" font-family="PingFang TC, Heiti TC, Noto Sans CJK TC, sans-serif"
        font-size="28" fill="${C.textDim}">${sub}</text>

  <rect x="96" y="424" width="132" height="6" rx="3" fill="${C.accent}"/>

  ${chips}

  <text x="${W - 96}" y="566" text-anchor="end" font-family="Helvetica, Arial, sans-serif"
        font-size="24" fill="${C.textFaint}">${pathLabel}</text>
</svg>`

const PAGES = [
  {
    file: 'og.png',
    kicker: 'BEY',
    kickerAccent: 'BUILDER X',
    title: '戰鬥陀螺 Beyblade X 配裝模擬器',
    sub: '登錄你擁有的零件，自動算出最強 3on3 出戰組合',
    pathLabel: domainLabel,
  },
  {
    // /tier/ 是站上唯一被爬蟲讀得到內容的頁，分享時該說自己是天梯總表，
    // 而不是沿用首頁那張「配裝模擬器」
    file: 'og-tier.png',
    kicker: '天梯',
    kickerAccent: '總表',
    title: '戰刃・固鎖・軸心・輔助刃 階級一覽',
    sub: '含實戰組合 Top 60（資料來源：stan-yao 天梯站）',
    pathLabel: `${domainLabel}/${TIER_PATH}`.replace(/\/$/, ''),
  },
  {
    file: 'og-draw.png',
    kicker: '抽選',
    kickerAccent: '目錄',
    title: '戰鬥陀螺各店 LINE 抽選連結一次看',
    sub: '依縣市、店家、品項篩選；連結一律在 LINE 內開啟',
    pathLabel: `${domainLabel}/${DRAW_PATH}`.replace(/\/$/, ''),
  },
]

for (const page of PAGES) {
  // palette 量化：這是平面向量稿，色數少；truecolor PNG 會是 3 倍大小而肉眼無差
  const buf = await sharp(Buffer.from(render(page)))
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toBuffer()
  writeFileSync(join(ROOT, 'public', page.file), buf)
  const meta = await sharp(buf).metadata()
  console.log(`wrote public/${page.file} ${meta.width}×${meta.height} ${(buf.length / 1024).toFixed(1)}kB`)
}
