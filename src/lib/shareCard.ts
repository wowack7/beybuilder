/**
 * 戰隊分享卡：把 deck 以 Canvas 排成 1200×675 的分享圖（PNG）。
 * 純前端渲染；陀螺圖用自架同源檔案，canvas 不會被跨域污染。
 */
import type { BeyCombo, DeckResult } from '../types'
import { bladeByName, cxPartImg, imgUrl } from './data'
import { SITE_URL } from './site'

/** 分享卡右下角網域字樣，由 SITE_URL 去掉協定與結尾斜線（單一來源，換域自動跟著變） */
const SITE_LABEL = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')

const W = 1200
const H = 675
const SCALE = 2 // retina 輸出 2400×1350

const C = {
  bg: 'oklch(15% 0.018 265)',
  card: 'oklch(20% 0.022 265)',
  cardTop: 'oklch(25% 0.028 265)',
  line: 'oklch(31% 0.02 265)',
  text: 'oklch(94% 0.008 250)',
  dim: 'oklch(72% 0.015 255)',
  faint: 'oklch(56% 0.015 255)',
  accent: 'oklch(76% 0.19 55)',
  accentGlow: 'oklch(76% 0.19 55 / 0.14)',
  gold: 'oklch(82% 0.13 85)',
} as const

const TIER_COLOR: Record<string, string> = {
  X: C.accent,
  'S+': C.gold,
  S: C.gold,
  'A+': 'oklch(78% 0.11 230)',
  A: 'oklch(78% 0.11 230)',
  'B+': 'oklch(74% 0.1 180)',
  B: 'oklch(74% 0.1 180)',
}
const tierColor = (t: string) => TIER_COLOR[t] ?? C.faint

const DISPLAY = '"Barlow Condensed", "Noto Sans TC", sans-serif'
const BODY = '"Noto Sans TC", sans-serif'

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** 文字過長時自動縮小字級塞進 maxWidth */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseSize: number,
  weight: string,
  family: string,
): number {
  let size = baseSize
  do {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 1
  } while (size > 12)
  return size
}

/** 單張整刃圖，或自訂混搭時的紋章/主刃來源整刃圖組 */
interface BeyImage {
  main?: HTMLImageElement | null
  pair?: (HTMLImageElement | null)[]
}

function drawBeyCard(
  ctx: CanvasRenderingContext2D,
  bey: BeyCombo,
  imgInfo: BeyImage,
  x: number,
  y: number,
  w: number,
  h: number,
  slot: number,
) {
  // 卡底
  ctx.fillStyle = C.card
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 16)
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1.5
  ctx.stroke()
  // 頂部 accent 線
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 16)
  ctx.clip()
  const grad = ctx.createLinearGradient(x, y, x + w, y)
  grad.addColorStop(0, C.accent)
  grad.addColorStop(0.7, 'transparent')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, 4)
  ctx.restore()

  // 編號
  ctx.fillStyle = C.line
  ctx.font = `900 44px ${DISPLAY}`
  ctx.textAlign = 'right'
  ctx.fillText(String(slot).padStart(2, '0'), x + w - 18, y + 48)

  // 陀螺圖
  const imgSize = 128
  const pair = imgInfo.pair?.filter(Boolean) as HTMLImageElement[] | undefined
  if (imgInfo.main) {
    ctx.drawImage(imgInfo.main, x + (w - imgSize) / 2, y + 22, imgSize, imgSize)
  } else if (pair && pair.length > 0) {
    // 自訂混搭：紋章/主刃來源整刃圖並排
    const ps = 92
    const gap = 4
    const totalW = pair.length * ps + (pair.length - 1) * gap
    let px = x + (w - totalW) / 2
    const py = y + 22 + (imgSize - ps) / 2
    for (const im of pair) {
      ctx.drawImage(im, px, py, ps, ps)
      px += ps + gap
    }
  } else {
    ctx.strokeStyle = C.line
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.arc(x + w / 2, y + 22 + imgSize / 2, imgSize / 2 - 8, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C.faint
    ctx.font = `900 40px ${DISPLAY}`
    ctx.textAlign = 'center'
    ctx.fillText('X', x + w / 2, y + 22 + imgSize / 2 + 14)
  }

  // 組合名（blade / 配置兩行）
  ctx.textAlign = 'center'
  ctx.fillStyle = C.text
  const nameSize = fitText(ctx, bey.blade, w - 40, 30, '700', BODY)
  ctx.font = `700 ${nameSize}px ${BODY}`
  ctx.fillText(bey.blade, x + w / 2, y + 192)
  const comboLine = `${bey.ratchet}${bey.bit}${bey.assist ? `（輔助${bey.assist}）` : ''}`
  ctx.fillStyle = C.accent
  ctx.font = `700 34px ${DISPLAY}`
  ctx.fillText(comboLine, x + w / 2, y + 232)

  const blade = bladeByName.get(bey.blade)

  // 來源與戰績（不放本站自訂分數——實戰勝負另關乎技術，僅列真實統計）
  const TAG: Record<string, { text: string; color: string }> = {
    meta: { text: '實戰組合', color: C.accent },
    site: { text: '站方推薦', color: C.gold },
    custom: { text: '自組組合', color: C.dim },
  }
  const tag = TAG[bey.source] ?? TAG.custom
  ctx.font = `600 20px ${BODY}`
  const tagW = ctx.measureText(tag.text).width + 32
  const tagX = x + (w - tagW) / 2
  const tagY = y + 262
  ctx.strokeStyle = tag.color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(tagX, tagY, tagW, 38, 19)
  ctx.stroke()
  ctx.fillStyle = tag.color
  ctx.fillText(tag.text, x + w / 2, tagY + 27)

  ctx.fillStyle = C.dim
  ctx.font = `500 18px ${BODY}`
  const record = bey.meta
    ? `勝場 ${bey.meta.wins}｜奪冠率 ${(bey.meta.champRate * 100).toFixed(0)}%`
    : bey.source === 'site'
      ? '站方建議配置'
      : '自訂配置'
  ctx.fillText(record, x + w / 2, y + h - 28)

  // blade 階級徽章（圖右上）
  const tier = blade?.tier
  if (tier) {
    ctx.fillStyle = tierColor(tier)
    ctx.beginPath()
    ctx.roundRect(x + 18, y + 20, 52, 34, 8)
    ctx.fill()
    ctx.fillStyle = C.bg
    ctx.font = `900 24px ${DISPLAY}`
    ctx.fillText(tier, x + 18 + 26, y + 45)
  }
}

export interface DeckCardOptions {
  /** 標頭副標（預設「我的最強戰隊｜Beyblade X 3on3」） */
  subtitle?: string
}

export async function renderDeckCard(deck: DeckResult, opts: DeckCardOptions = {}): Promise<Blob> {
  await document.fonts.ready
  await Promise.all([
    document.fonts.load(`900 60px ${DISPLAY}`),
    document.fonts.load(`700 30px ${BODY}`),
  ])

  const beys = deck.beys
  const images: BeyImage[] = await Promise.all(
    beys.map(async (b): Promise<BeyImage> => {
      const bladeSrc = bladeByName.get(b.blade)?.img
      if (bladeSrc) return { main: await loadImage(imgUrl(bladeSrc)) }
      // 自訂混搭：載入紋章/主刃各自的真零件圖（僅自架者，避免 canvas 跨源污染）
      if (b.lockChip && b.mainBlade) {
        const srcs = [cxPartImg.byLockChip.get(b.lockChip), cxPartImg.byMainBlade.get(b.mainBlade)].filter(
          Boolean,
        ) as string[]
        if (srcs.length) return { pair: await Promise.all(srcs.map((s) => loadImage(imgUrl(s)))) }
      }
      return { main: null }
    }),
  )

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('瀏覽器不支援 Canvas')
  ctx.scale(SCALE, SCALE)

  // 背景＋光暈
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W * 0.7)
  glow.addColorStop(0, C.accentGlow)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // 標頭
  ctx.textAlign = 'left'
  ctx.font = `900 46px ${DISPLAY}`
  ctx.fillStyle = C.text
  ctx.fillText('BEY', 48, 84)
  const beyW = ctx.measureText('BEY').width
  ctx.fillStyle = C.accent
  ctx.fillText('BUILDER X', 48 + beyW, 84)
  ctx.fillStyle = C.dim
  ctx.font = `500 20px ${BODY}`
  ctx.fillText(opts.subtitle ?? '我的最強戰隊｜Beyblade X 3on3', 50, 118)

  // 右上：3 ON 3 標記（不放本站自訂分數）
  ctx.textAlign = 'right'
  ctx.fillStyle = C.faint
  ctx.font = `500 16px ${BODY}`
  ctx.fillText('DECK BATTLE', W - 48, 66)
  ctx.fillStyle = C.accent
  ctx.font = `900 54px ${DISPLAY}`
  ctx.fillText('3 ON 3', W - 48, 116)

  // 三張卡
  const pad = 48
  const gap = 24
  const cardW = (W - pad * 2 - gap * (beys.length - 1)) / beys.length
  const cardY = 165
  const cardH = 400
  beys.forEach((bey, i) => {
    drawBeyCard(ctx, bey, images[i], pad + i * (cardW + gap), cardY, cardW, cardH, i + 1)
  })

  // 頁腳
  ctx.textAlign = 'left'
  ctx.fillStyle = C.faint
  ctx.font = `400 16px ${BODY}`
  const today = new Date()
  ctx.fillText(
    `資料：stan-yao 天梯站賽事統計｜${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`,
    48,
    H - 32,
  )
  ctx.textAlign = 'right'
  ctx.fillStyle = C.dim
  ctx.font = `600 18px ${DISPLAY}`
  ctx.fillText(SITE_LABEL, W - 48, H - 32)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('圖片輸出失敗'))), 'image/png')
  })
}

/**
 * 分享或下載 PNG：觸控裝置（手機/平板）走原生分享，電腦一律下載。
 *（Windows Chrome/Edge 桌機也支援檔案分享，故不能只靠 canShare 判斷。）
 * 用戶取消原生分享會擲 AbortError，由呼叫端處理。
 */
export async function shareOrDownloadPng(blob: Blob, filename: string, shareTitle: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' })
  const isTouch = window.matchMedia('(pointer: coarse)').matches
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: shareTitle })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** YYYYMMDD 檔名戳記 */
export function dateStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
