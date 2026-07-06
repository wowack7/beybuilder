/**
 * 抓取兩個資料來源並重新生成 src/data/*.json。
 * 轉換邏輯在 src/lib/transform.ts（與瀏覽器「立即更新」共用；Node 24 原生 TS import）。
 * 執行：npm run data:update（需 Node >= 23.6，見 .nvmrc）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCES, buildPhEnrichment, transformAll } from '../src/lib/transform.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'src', 'data')

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return res.text()
}

async function main() {
  console.log('downloading sources...')
  const [tierCsv, comboCsv, partsCsv, phMainText] = await Promise.all([
    fetchText(SOURCES.tierCsv),
    fetchText(SOURCES.comboCsv),
    fetchText(SOURCES.partsCsv),
    fetchText(SOURCES.phMain),
  ])
  const enrich = buildPhEnrichment(JSON.parse(phMainText).data)
  const bundle = transformAll({ tierCsv, comboCsv, partsCsv }, enrich)

  mkdirSync(OUT_DIR, { recursive: true })
  const write = (file, data) => {
    writeFileSync(join(OUT_DIR, file), JSON.stringify(data))
    console.log(`wrote src/data/${file}`)
  }
  write('products.json', bundle.products)
  write('parts.json', bundle.parts)
  write('combos.json', bundle.combos)
  write('site_combos.json', bundle.siteCombos)
  write('meta.json', { generatedAt: new Date().toISOString() })

  const withStats = bundle.parts.blades.filter((b) => b.stats).length
  const cxSplit = bundle.products.filter((p) => p.lockChip && p.mainBlade).length
  const siteWithAssist = bundle.siteCombos.filter((c) => c.assist).length
  console.log(
    `products=${bundle.products.length} blades=${bundle.parts.blades.length} (stats matched ${withStats})` +
      ` ratchets=${bundle.parts.ratchets.length} bits=${bundle.parts.bits.length} assists=${bundle.parts.assists.length}` +
      ` combos=${bundle.combos.length} siteCombos=${bundle.siteCombos.length} (assist 指定 ${siteWithAssist})` +
      ` cx 拆名=${cxSplit}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
