/**
 * 抓取兩個資料來源並重新生成 src/data/*.json。
 * 轉換邏輯在 src/lib/transform.ts（與瀏覽器「立即更新」共用；Node 24 原生 TS import）。
 * 執行：npm run data:update（需 Node >= 23.6，見 .nvmrc）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCES, buildPhEnrichment, buildPhMap, transformAll } from '../src/lib/transform.ts'

const PH_HARDCODED_URL = 'https://beyblade.phstudy.org/data/hardcoded.json'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'src', 'data')

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return res.text()
}

async function main() {
  console.log('downloading sources...')
  const [tierCsv, comboCsv, partsCsv, phMainText, phHardcodedText] = await Promise.all([
    fetchText(SOURCES.tierCsv),
    fetchText(SOURCES.comboCsv),
    fetchText(SOURCES.partsCsv),
    fetchText(SOURCES.phMain),
    // 聯名/特例套組（如漫威）在 hardcoded.json；抓不到不致命
    fetchText(PH_HARDCODED_URL).catch(() => 'null'),
  ])
  const phMain = JSON.parse(phMainText).data
  const phHardcodedRaw = JSON.parse(phHardcodedText)
  const phHardcoded = phHardcodedRaw?.data ?? phHardcodedRaw ?? {}
  const enrich = buildPhEnrichment(phMain)
  const bundle = transformAll({ tierCsv, comboCsv, partsCsv }, enrich)
  const phMap = buildPhMap([phMain, phHardcoded], bundle.products, bundle.parts)

  mkdirSync(OUT_DIR, { recursive: true })
  const write = (file, data) => {
    writeFileSync(join(OUT_DIR, file), JSON.stringify(data))
    console.log(`wrote src/data/${file}`)
  }
  write('products.json', bundle.products)
  write('parts.json', bundle.parts)
  write('combos.json', bundle.combos)
  write('site_combos.json', bundle.siteCombos)
  write('ph_map.json', phMap)
  write('meta.json', { generatedAt: new Date().toISOString() })
  console.log(
    `ph_map: sets=${Object.keys(phMap.sets).length} blades=${Object.keys(phMap.blades).length}` +
      ` ratchets=${Object.keys(phMap.ratchets).length} bits=${Object.keys(phMap.bits).length}` +
      ` assists=${Object.keys(phMap.assists).length}`,
  )

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
