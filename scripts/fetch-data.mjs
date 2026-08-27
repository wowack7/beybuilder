/**
 * 抓取兩個資料來源並重新生成 src/data/*.json。
 * 轉換邏輯在 src/lib/transform.ts（與瀏覽器「立即更新」共用；Node 24 原生 TS import）。
 * 執行：npm run data:update（需 Node >= 23.6，見 .nvmrc）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SOURCES,
  parseCsv,
  buildCxPartImages,
  buildPhEnrichment,
  buildPhMap,
  transformAll,
} from '../src/lib/transform.ts'

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
  const cxPartImg = buildCxPartImages(phMain)

  // --- 不變式：整類零件的階級不該全空 ---------------------------------------
  // 2026-07-27 的每週更新把固鎖 36/36、軸心 52/54 的階級全洗成空字串（程式那週沒動過，
  // 是來源表的欄位變了），天梯頁的固鎖/軸心區從此整片沒有評級，五週沒人發現。
  // 來源表換欄名不會報錯，只會讓某一欄靜默變空——所以在寫檔前擋下來。
  // 輔助刃（assists）不在名單裡：來源站從來就沒有評級過。
  const TIER_REQUIRED = [
    ['blades', '戰刃階級 (Blade Tier)'],
    ['ratchets', '固鎖階級 (Ratchet Tier)'],
    ['bits', '軸心階級 (Bit Tier)'],
  ]
  const empty = TIER_REQUIRED.filter(([k]) => !bundle.parts[k].some((x) => x.tier))
  if (empty.length && !process.argv.includes('--allow-missing-tiers')) {
    const headers = [...new Set(parseCsv(tierCsv)[0] ?? [])].filter((h) => h.includes('階級'))
    throw new Error(
      `這幾類零件一個階級都沒抓到：${empty.map(([k, col]) => `${k}（讀 ${col}）`).join('、')}\n` +
        `來源表目前含「階級」的欄位：${headers.length ? headers.map((h) => JSON.stringify(h)).join(' / ') : '(一個都沒有)'}\n` +
        `→ 多半是來源表改了欄名，對照上面的清單改 src/lib/transform.ts 的欄位鍵。\n` +
        `→ 確認來源站真的移除了評級，才加 --allow-missing-tiers 放行。`,
    )
  }

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
  write('cx_part_img.json', cxPartImg)
  write('meta.json', { generatedAt: new Date().toISOString() })
  console.log(
    `ph_map: sets=${Object.keys(phMap.sets).length} blades=${Object.keys(phMap.blades).length}` +
      ` ratchets=${Object.keys(phMap.ratchets).length} bits=${Object.keys(phMap.bits).length}` +
      ` assists=${Object.keys(phMap.assists).length}`,
  )

  const tierCoverage = ['blades', 'ratchets', 'bits', 'assists']
    .map((k) => `${k} ${bundle.parts[k].filter((x) => x.tier).length}/${bundle.parts[k].length}`)
    .join(' / ')
  console.log(`階級涵蓋率: ${tierCoverage}`)

  const withStats = bundle.parts.blades.filter((b) => b.stats).length
  const cxSplit = bundle.products.filter((p) => p.lockChip && p.mainBlade).length
  const siteWithAssist = bundle.siteCombos.filter((c) => c.assist).length
  console.log(
    `products=${bundle.products.length} blades=${bundle.parts.blades.length} (stats matched ${withStats})` +
      ` ratchets=${bundle.parts.ratchets.length} bits=${bundle.parts.bits.length} assists=${bundle.parts.assists.length}` +
      ` combos=${bundle.combos.length} siteCombos=${bundle.siteCombos.length} (assist 指定 ${siteWithAssist})` +
      ` cx 拆名=${cxSplit}` +
      ` cx零件圖: 紋章=${Object.keys(cxPartImg.lockChip).length} 主刃=${Object.keys(cxPartImg.mainBlade).length}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
