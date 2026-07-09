/**
 * 圖片自架：下載 products/parts 引用的遠端圖（i.ibb.co 圖床 TTFB ~1s，太慢），
 * 以 sharp 壓成 ≤360px webp 存 public/img/，並生成 src/data/img_map.json
 * （遠端 URL → 本地路徑）。增量執行：已存在的檔案直接沿用；下載失敗者
 * 不進 map，前端自動退回原圖床。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMG_DIR = join(ROOT, 'public', 'img')
const MAP_PATH = join(ROOT, 'src', 'data', 'img_map.json')

const MAX_SIZE = 360 // 最大顯示 180px 卡片 ×2 retina
const WEBP_QUALITY = 80
const CONCURRENCY = 8
const FETCH_TIMEOUT_MS = 15000

function collectUrls() {
  const products = JSON.parse(readFileSync(join(ROOT, 'src/data/products.json'), 'utf8'))
  const parts = JSON.parse(readFileSync(join(ROOT, 'src/data/parts.json'), 'utf8'))
  const urls = new Set()
  for (const p of products) if (p.img?.startsWith('http')) urls.add(p.img)
  for (const list of [parts.blades, parts.ratchets, parts.bits, parts.assists ?? []])
    for (const p of list) if (p.img?.startsWith('http')) urls.add(p.img)
  // CX 紋章/主刃零件圖（phstudy，無 CORS → 必須自架供 canvas 分享卡使用）
  const cxImgPath = join(ROOT, 'src/data/cx_part_img.json')
  if (existsSync(cxImgPath)) {
    const cx = JSON.parse(readFileSync(cxImgPath, 'utf8'))
    for (const field of [cx.lockChip, cx.mainBlade])
      for (const url of Object.values(field ?? {})) if (url?.startsWith('http')) urls.add(url)
  }
  return [...urls]
}

const fileNameFor = (url) => `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.webp`

async function processOne(url, stats) {
  const name = fileNameFor(url)
  const outPath = join(IMG_DIR, name)
  if (existsSync(outPath)) {
    stats.cached++
    return name
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await sharp(buf)
      .resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(outPath)
    stats.downloaded++
    return name
  } catch (e) {
    stats.failed.push(`${url} → ${e.message}`)
    return null
  }
}

async function main() {
  mkdirSync(IMG_DIR, { recursive: true })
  const urls = collectUrls()
  const stats = { downloaded: 0, cached: 0, failed: [] }
  const map = {}

  let cursor = 0
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      const name = await processOne(url, stats)
      if (name) map[url] = `img/${name}`
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  writeFileSync(MAP_PATH, JSON.stringify(map))
  console.log(
    `images: total=${urls.length} downloaded=${stats.downloaded} cached=${stats.cached} failed=${stats.failed.length}`,
  )
  for (const f of stats.failed) console.warn('  failed:', f)
  console.log('wrote src/data/img_map.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
