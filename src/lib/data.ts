/**
 * 靜態資料載入與索引。
 * 資料由 npm run data:update 生成（scripts/fetch-data.mjs），
 * 每週經 GitHub Actions 自動更新並重新部署——前端一律使用內建資料，
 * 不在瀏覽器端抓取（避免每個訪客各自觸發外部請求）。
 */
import combosJson from '../data/combos.json'
import imgMapJson from '../data/img_map.json'
import metaJson from '../data/meta.json'
import partsJson from '../data/parts.json'
import phMapJson from '../data/ph_map.json'
import productsJson from '../data/products.json'
import siteCombosJson from '../data/site_combos.json'
import type { MetaCombo, PartsDb, Product, SiteCombo } from '../types'
import type { PhMap } from './transform'

/** phstudy 倉庫匯入映射表（隨每週資料更新重生） */
export const phMap = phMapJson as PhMap

/**
 * 圖片路徑解析：自架的壓縮版（public/img，同源快）優先，
 * 沒對應到（新品尚未跑 data:update）退回原圖床。
 */
export function imgUrl(src: string): string {
  if (!src) return src
  const local = (imgMapJson as Record<string, string>)[src]
  return local ? import.meta.env.BASE_URL + local : src
}

export const products = productsJson as Product[]
export const partsDb = partsJson as PartsDb
export const metaCombos = combosJson as MetaCombo[]
export const siteCombos = siteCombosJson as SiteCombo[]

/** 資料生成時間（顯示用；來自 data:update 寫入的 meta.json） */
export const dataStatus = { at: (metaJson as { generatedAt: string }).generatedAt }

export const productById = new Map(products.map((p) => [p.id, p]))
export const bladeByName = new Map(partsDb.blades.map((b) => [b.name, b]))
export const ratchetById = new Map(partsDb.ratchets.map((r) => [r.id, r]))
export const bitById = new Map(partsDb.bits.map((b) => [b.id, b]))
export const assistById = new Map((partsDb.assists ?? []).map((a) => [a.id, a]))

/**
 * CX 紋章/主刃 → 代表整刃圖：自訂混搭（紋章＋主刃湊不出具名整刃）無圖時，
 * 退而顯示各自的來源整刃圖（本站無單零件圖，只有整刃圖）。
 */
export const cxPartImg = (() => {
  const byLockChip = new Map<string, string>()
  const byMainBlade = new Map<string, string>()
  for (const p of products) {
    if (!p.lockChip || !p.mainBlade) continue
    const img = bladeByName.get(p.name)?.img || p.img
    if (!img) continue
    if (!byLockChip.has(p.lockChip)) byLockChip.set(p.lockChip, img)
    if (!byMainBlade.has(p.mainBlade)) byMainBlade.set(p.mainBlade, img)
  }
  return { byLockChip, byMainBlade }
})()

/** 產品系列（BX / UX / CX / 其他），供庫存頁篩選 */
export function productSeries(id: string): string {
  const m = id.match(/^(BX|UX|CX)/i)
  return m ? m[1].toUpperCase() : '其他'
}

export const SERIES_OPTIONS = ['全部', 'BX', 'UX', 'CX', '其他'] as const

export const TYPE_LABEL: Record<string, string> = {
  attack: '攻擊',
  defense: '防禦',
  stamina: '持久',
  balance: '平衡',
  special: '特殊',
}

export const COMBO_SOURCE_LABEL: Record<string, string> = {
  meta: '實戰組合',
  site: '站方推薦',
  custom: '自組組合',
}
