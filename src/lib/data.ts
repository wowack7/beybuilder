/**
 * 靜態資料載入與索引。
 * 內建資料由 npm run data:update 生成；「立即更新」會從 Google Sheets 直抓
 * 競技資料（tier/組合），phstudy 慢資料（數值/CX 拆名）沿用內建，
 * 結果快取於 localStorage——與內建資料比時間戳，新者勝。
 */
import combosJson from '../data/combos.json'
import metaJson from '../data/meta.json'
import partsJson from '../data/parts.json'
import phMapJson from '../data/ph_map.json'
import productsJson from '../data/products.json'
import siteCombosJson from '../data/site_combos.json'
import type { MetaCombo, PartsDb, Product, SiteCombo } from '../types'
import {
  SOURCES,
  bakedEnrichment,
  shouldUseCache,
  transformAll,
  type DataBundle,
  type PhMap,
} from './transform'

/** phstudy 倉庫匯入映射表（永遠用內建版；隨每週資料更新重生） */
export const phMap = phMapJson as PhMap

const CACHE_KEY = 'beybuilder.datacache.v1'

const baked: DataBundle = {
  products: productsJson as Product[],
  parts: partsJson as PartsDb,
  combos: combosJson as MetaCombo[],
  siteCombos: siteCombosJson as SiteCombo[],
}
export const bakedGeneratedAt: string = (metaJson as { generatedAt: string }).generatedAt

interface DataCache extends DataBundle {
  savedAt: string
}

function loadCache(): DataCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<DataCache>
    if (
      typeof c.savedAt !== 'string' ||
      !Array.isArray(c.products) ||
      !Array.isArray(c.combos) ||
      !Array.isArray(c.siteCombos) ||
      !c.parts ||
      !Array.isArray(c.parts.blades)
    )
      return null
    if (!shouldUseCache(c.savedAt, bakedGeneratedAt)) return null // 內建較新 → 棄快取
    return c as DataCache
  } catch {
    return null
  }
}

const cache = loadCache()
const active: DataBundle = cache ?? baked

/** 目前資料來源與時間（顯示用） */
export const dataStatus = {
  source: cache ? ('online' as const) : ('baked' as const),
  at: cache ? cache.savedAt : bakedGeneratedAt,
}

export const products = active.products
export const partsDb = active.parts
export const metaCombos = active.combos
export const siteCombos = active.siteCombos

/**
 * 從 Google Sheets 直抓最新競技資料並寫入快取。
 * 成功後呼叫端應 reload 頁面讓模組層資料重新載入；失敗擲錯、不動既有快取。
 */
export async function refreshData(): Promise<{ combos: number; products: number }> {
  const get = async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`資料來源回應 ${res.status}`)
    return res.text()
  }
  const [tierCsv, comboCsv, partsCsv] = await Promise.all([
    get(SOURCES.tierCsv),
    get(SOURCES.comboCsv),
    get(SOURCES.partsCsv),
  ])
  const bundle = transformAll({ tierCsv, comboCsv, partsCsv }, bakedEnrichment(baked.products, baked.parts))
  // 合理性防呆：抓到空資料就當失敗，不覆蓋快取
  if (bundle.products.length < 50 || bundle.combos.length < 100) {
    throw new Error(`抓到的資料不完整（products=${bundle.products.length}, combos=${bundle.combos.length}）`)
  }
  const payload: DataCache = { ...bundle, savedAt: new Date().toISOString() }
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  return { combos: bundle.combos.length, products: bundle.products.length }
}

/** 清除線上快取，回到內建資料（顯示用途） */
export function clearDataCache(): void {
  localStorage.removeItem(CACHE_KEY)
}

export const productById = new Map(products.map((p) => [p.id, p]))
export const bladeByName = new Map(partsDb.blades.map((b) => [b.name, b]))
export const ratchetById = new Map(partsDb.ratchets.map((r) => [r.id, r]))
export const bitById = new Map(partsDb.bits.map((b) => [b.id, b]))
export const assistById = new Map((partsDb.assists ?? []).map((a) => [a.id, a]))

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
}
