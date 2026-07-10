/**
 * 產生社群分享縮圖 public/og.png（1200×630）。
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
import { SITE_URL } from '../src/lib/site.ts'

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

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
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
        font-weight="700" letter-spacing="-1" fill="${C.text}">BEY<tspan fill="${C.accent}">BUILDER X</tspan></text>

  <text x="98" y="330" font-family="PingFang TC, Heiti TC, Noto Sans CJK TC, sans-serif"
        font-size="44" font-weight="600" fill="${C.text}">戰鬥陀螺 Beyblade X 配裝模擬器</text>

  <text x="98" y="392" font-family="PingFang TC, Heiti TC, Noto Sans CJK TC, sans-serif"
        font-size="28" fill="${C.textDim}">登錄你擁有的零件，自動算出最強 3on3 出戰組合</text>

  <rect x="96" y="424" width="132" height="6" rx="3" fill="${C.accent}"/>

  ${chips}

  <text x="${W - 96}" y="566" text-anchor="end" font-family="Helvetica, Arial, sans-serif"
        font-size="24" fill="${C.textFaint}">${domainLabel}</text>
</svg>`

// palette 量化：這張圖是平面向量稿，色數少；truecolor PNG 會是 3 倍大小而肉眼無差
const buf = await sharp(Buffer.from(svg))
  .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
  .toBuffer()
writeFileSync(join(ROOT, 'public', 'og.png'), buf)

const meta = await sharp(buf).metadata()
console.log(`wrote public/og.png ${meta.width}×${meta.height} ${(buf.length / 1024).toFixed(1)}kB`)
