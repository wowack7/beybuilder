/**
 * 資料轉換共用模組——Node 抓取腳本（scripts/fetch-data.mjs，Node 24 原生 TS import）
 * 與瀏覽器「立即更新」（src/lib/data.ts）共用同一份轉換邏輯。
 * 來源：stan-yao tier 表（Google Sheets CSV，允許 CORS）＋ phstudy 零件庫（僅 Node 可抓）。
 */
import type { Blade, MetaCombo, PartStats, PartsDb, Product, SimplePart, SiteCombo } from '../types.ts'
import { bladeFamilyKey } from './family.ts'

const SHEET_BASE =
  'https://docs.google.com/spreadsheets/d/1TBHOpcsv25bBfWERq14CBIy4P1G7j-qpPhmclx_nTWI/gviz/tq?tqx=out:csv'

export const SOURCES = {
  tierCsv: SHEET_BASE,
  comboCsv:
    'https://docs.google.com/spreadsheets/d/18eTJLjyNmqDz5MH0-VD03TX4wobUCdHdrRMyo4uojDo/gviz/tq?tqx=out:csv&sheet=Combo%20Summary',
  partsCsv: SHEET_BASE + '&sheet=' + encodeURIComponent('零件圖鑑'),
  phMain: 'https://beyblade.phstudy.org/data/main.json',
} as const

/** 極簡 CSV 解析（處理雙引號欄位與欄內逗號/換行） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some((f) => f !== '')) rows.push(row)
  }
  return rows
}

type Row = Record<string, string>

export function toObjects(rows: string[][]): Row[] {
  const header = rows[0] ?? []
  return rows.slice(1).map((r) => {
    const o: Row = {}
    header.forEach((h, i) => (o[h] = (r[i] ?? '').trim()))
    return o
  })
}

const TIER_ORDER = ['X', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E+', 'E']
const tierRank = (t: string) => {
  const i = TIER_ORDER.indexOf(t)
  return i === -1 ? TIER_ORDER.length : i
}
const bestTier = (a: string, b: string) => (tierRank(a) <= tierRank(b) ? a : b)

/** 零件補充資料（phstudy 或既有內建資料皆可作為來源） */
export interface Enrichment {
  ratchetStats: (id: string) => PartStats | undefined
  bitStats: (id: string) => PartStats | undefined
  assistStats: (id: string) => PartStats | undefined
  cxNames: (productId: string) => { lockChip?: string; mainBlade?: string } | undefined
  bladeExtras: (familyBase: string) => { stats?: PartStats; rotation?: string } | undefined
}

function pickStats(defaultStatus: Record<string, unknown> | undefined): PartStats | undefined {
  if (!defaultStatus) return undefined
  const n = (k: string) => (typeof defaultStatus[k] === 'number' ? (defaultStatus[k] as number) : 0)
  return {
    attack: n('attack'),
    defense: n('defense'),
    stamina: n('stamina'),
    burst: n('burst'),
    dash: n('dash'),
    height: n('height'),
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- phstudy 外部資料無 schema 保證 */
/** 由 phstudy main.json 建立補充資料（Node 端用；瀏覽器因 CORS 抓不到 phstudy） */
export function buildPhEnrichment(phData: any): Enrichment {
  const phList = (v: any): any[] => (Array.isArray(v) ? v : Object.values(v ?? {}))
  const title = (p: any): string => p.catalog_title?.['zh-TW'] ?? ''

  const byTailPattern = (items: any[], pattern: RegExp) => {
    const map = new Map<string, PartStats | undefined>()
    for (const p of items) {
      const m = title(p).match(pattern)
      if (m && !map.has(m[1])) map.set(m[1], pickStats(p.defaultStatus))
    }
    return map
  }
  const ratchetStats = byTailPattern(phList(phData.BeybladePartsRatchet), /(\d+-\d+)\s*$/)
  const bitStats = byTailPattern(phList(phData.BeybladePartsBit), /\s([A-Z]{1,2})\s*$/)
  const assistStats = byTailPattern(phList(phData.BeybladePartsAssistBlade), /\s([A-Z])\s*$/)

  // CX 拆名（未抗辯假設：stan-yao 以整刃評級，拆名僅供顯示與重複判定，配不到就留空）
  const cxNameBySet = new Map<string, { lockChip?: string; mainBlade?: string }>()
  const setCodeOf = (t: string) => t.match(/^([A-Z]{2,4}-\d+(?:-\d+)?)/)?.[1] ?? ''
  const cleanCxName = (t: string) =>
    t
      .replace(/^[A-Z]{2,4}-\d+(?:-\d+)?\s*/, '')
      .replace(/\s*金屬塗層.*$/, '')
      .split(/\s+/)
      .filter((w) => w && !/^>+$/.test(w) && !/版$|籤王/.test(w))
      .join(' ')
      .trim()
  const setCxName = (code: string, field: 'lockChip' | 'mainBlade', name: string) => {
    if (!code || !name) return
    if (!cxNameBySet.has(code)) cxNameBySet.set(code, {})
    cxNameBySet.get(code)![field] = name
  }
  for (const p of phList(phData.BeybladePartsLockChip))
    setCxName(setCodeOf(title(p)), 'lockChip', cleanCxName(title(p)))
  for (const p of phList(phData.BeybladePartsMainBlade))
    setCxName(setCodeOf(title(p)), 'mainBlade', cleanCxName(title(p)))

  // blade 數值：zh-TW 名稱包含比對（兩站皆用台灣官方譯名，取第一個含基底名者）
  const phBlades = phList(phData.BeybladePartsBlade).map((p: any) => ({
    title: title(p),
    stats: pickStats(p.defaultStatus),
    rotation: (p.defaultStatus?.rotation as string | undefined) ?? undefined,
  }))

  return {
    ratchetStats: (id) => ratchetStats.get(id),
    bitStats: (id) => bitStats.get(id),
    assistStats: (id) => assistStats.get(id),
    cxNames: (productId) => cxNameBySet.get(productId),
    bladeExtras: (base) => {
      const hit = phBlades.find((b) => base && b.title.includes(base))
      return hit?.stats ? { stats: hit.stats, rotation: hit.rotation } : undefined
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** 由既有內建資料建立補充資料（瀏覽器「立即更新」用：phstudy 慢資料沿用內建） */
export function bakedEnrichment(products: Product[], parts: PartsDb): Enrichment {
  const stat = (list: SimplePart[]) => {
    const m = new Map(list.map((p) => [p.id, p.stats]))
    return (id: string) => m.get(id)
  }
  const cxByProduct = new Map(
    products
      .filter((p) => p.lockChip || p.mainBlade)
      .map((p) => [p.id, { lockChip: p.lockChip, mainBlade: p.mainBlade }]),
  )
  const bladeByBase = new Map<string, Blade>()
  for (const b of parts.blades) {
    const base = bladeFamilyKey(b.name)
    if (b.stats && !bladeByBase.has(base)) bladeByBase.set(base, b)
  }
  return {
    ratchetStats: stat(parts.ratchets),
    bitStats: stat(parts.bits),
    assistStats: stat(parts.assists ?? []),
    cxNames: (productId) => cxByProduct.get(productId),
    bladeExtras: (base) => {
      const b = bladeByBase.get(base)
      return b?.stats ? { stats: b.stats, rotation: b.rotation } : undefined
    },
  }
}

/**
 * 解析「建議配置 (Combo)」半結構化文字 → 站方推薦組合（未抗辯假設：解析規則）。
 * #後為註解（逐行剝除）；固鎖/冠軍配置段的每個 / 項可含 ratchet、成對 bit、輔助X；
 * 軸心段為 bit 選項清單；ratchet 項 × 軸心清單全展開，成對者另外成立。
 */
export function parseSiteCombos(comboText: string, bladeName: string): SiteCombo[] {
  const bitList: string[] = []
  const pairs: { ratchet: string; bit?: string; assist: string }[] = []
  for (const rawLine of comboText.split(/\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    for (const section of line.split('|')) {
      const m = section.trim().match(/^(固鎖|軸心|冠軍配置)[：:](.*)$/)
      if (!m) continue
      if (m[1] === '軸心') {
        for (const tok of m[2].split('/')) {
          const t = tok.trim()
          if (/^[A-Z]{1,2}$/.test(t)) bitList.push(t)
        }
      } else {
        for (const entry of m[2].split('/')) {
          const toks = entry.split(/[，,]/).map((t) => t.trim())
          const ratchet = toks.find((t) => /^\d+-\d+$/.test(t))
          const bit = toks.find((t) => /^[A-Z]{1,2}$/.test(t))
          const assistTok = toks.find((t) => /^輔助[A-Z]$/.test(t))
          if (ratchet) pairs.push({ ratchet, bit, assist: assistTok ? assistTok.slice(-1) : '' })
        }
      }
    }
  }
  const seen = new Set<string>()
  const combos: SiteCombo[] = []
  const push = (ratchet: string, bit: string, assist: string) => {
    const k = `${ratchet}|${bit}|${assist}`
    if (seen.has(k)) return
    seen.add(k)
    combos.push({ blade: bladeName, ratchet, bit, ...(assist ? { assist } : {}) })
  }
  for (const p of pairs) {
    if (p.bit) push(p.ratchet, p.bit, p.assist)
    for (const b of bitList) push(p.ratchet, b, p.assist)
  }
  return combos
}

export interface RawSheets {
  tierCsv: string
  comboCsv: string
  partsCsv: string
}

export interface DataBundle {
  products: Product[]
  parts: PartsDb
  combos: MetaCombo[]
  siteCombos: SiteCombo[]
}

/** 三張 Google Sheets CSV → 完整資料包（enrich 提供 phstudy 或內建的慢資料） */
export function transformAll(raw: RawSheets, enrich?: Enrichment): DataBundle {
  const tierRows = toObjects(parseCsv(raw.tierCsv))
  const comboRows = toObjects(parseCsv(raw.comboCsv))
  const partRows = toObjects(parseCsv(raw.partsCsv))

  // ---- 產品（tier 主表，每列一個產品） ----
  const products: Product[] = tierRows
    .filter((r) => r['型號 (ID)'])
    .map((r) => ({
      id: r['型號 (ID)'],
      name: r['中文名稱 (Name)'],
      type: r['類型 (Type)'] || '',
      tier: r['階級 (Tier)'] === '-' ? '' : r['階級 (Tier)'] || '',
      buy: r['購買建議 (Buy)'] || '',
      ratchet: r['原裝固鎖 (Ratchet)'] || '',
      ratchetTier: r['固鎖階級 (Ratchet Tier)'] || '',
      bit: r['原裝軸心 (Bit)'] || '',
      bitTier: r['軸心階級 (Bit Tier)'] || '',
      // 來源表頭有一欄拼寫缺右括號，兩種都接
      assist: r['原裝輔助戰刃 (Assist Blade'] || r['原裝輔助戰刃 (Assist Blade)'] || '',
      source: r['來源產品 (Source)'] || '',
      img: r['圖片網址 (Img)'] || '',
      ...(enrich?.cxNames(r['型號 (ID)']) ?? {}),
    }))

  // ---- blades：以名稱聚合產品，變體無階級時自家族基底繼承 ----
  const bladeMap = new Map<string, Blade>()
  for (const p of products) {
    const b: Blade = bladeMap.get(p.name) ?? {
      name: p.name,
      type: p.type,
      tier: '',
      tierInherited: false,
      img: p.img,
      productIds: [],
    }
    b.productIds.push(p.id)
    if (!b.type && p.type) b.type = p.type
    if (p.tier) b.tier = b.tier ? bestTier(b.tier, p.tier) : p.tier
    if (!b.img && p.img) b.img = p.img
    bladeMap.set(p.name, b)
  }
  const tierByBase = new Map<string, string>()
  for (const b of bladeMap.values()) {
    if (!b.tier) continue
    const base = bladeFamilyKey(b.name)
    tierByBase.set(base, bestTier(tierByBase.get(base) ?? b.tier, b.tier))
  }
  for (const b of bladeMap.values()) {
    if (!b.tier) {
      const inherited = tierByBase.get(bladeFamilyKey(b.name))
      if (inherited) {
        b.tier = inherited
        b.tierInherited = true
      }
    }
    const extra = enrich?.bladeExtras(bladeFamilyKey(b.name))
    if (extra?.stats) {
      b.stats = extra.stats
      if (extra.rotation) b.rotation = extra.rotation
    }
  }

  // ---- ratchets / bits：零件圖鑑表 + 主表階級欄 + 實戰組合出現過的 ----
  const ratchetImgs = new Map<string, string>()
  const bitImgs = new Map<string, string>()
  const assistImgs = new Map<string, string>()
  for (const r of partRows) {
    const name = r['原裝固鎖、軸心']
    const img = r['圖片網址 (Img)'] || ''
    if (r['分類 (Category)'] === 'ratchet') ratchetImgs.set(name, img)
    if (r['分類 (Category)'] === 'bit') bitImgs.set(name, img)
    if (r['分類 (Category)'] === 'assist') assistImgs.set(name, img)
  }
  const ratchetTiers = new Map<string, string>()
  const bitTiers = new Map<string, string>()
  for (const p of products) {
    if (p.ratchet && p.ratchetTier)
      ratchetTiers.set(p.ratchet, bestTier(ratchetTiers.get(p.ratchet) ?? p.ratchetTier, p.ratchetTier))
    if (p.bit && p.bitTier) bitTiers.set(p.bit, bestTier(bitTiers.get(p.bit) ?? p.bitTier, p.bitTier))
  }
  const ratchetIds = new Set([...ratchetImgs.keys(), ...ratchetTiers.keys()])
  const bitIds = new Set([...bitImgs.keys(), ...bitTiers.keys()])
  for (const c of comboRows) {
    if (c.ratchet) ratchetIds.add(c.ratchet)
    if (c.bit) bitIds.add(c.bit)
  }
  const ratchets: SimplePart[] = [...ratchetIds].sort().map((id) => ({
    id,
    tier: ratchetTiers.get(id) ?? '',
    img: ratchetImgs.get(id) ?? '',
    stats: enrich?.ratchetStats(id),
  }))
  const bits: SimplePart[] = [...bitIds].sort().map((id) => ({
    id,
    tier: bitTiers.get(id) ?? '',
    img: bitImgs.get(id) ?? '',
    stats: enrich?.bitStats(id),
  }))

  // ---- combos：實戰統計 ----
  const combos: MetaCombo[] = comboRows
    .filter((c) => c.site_blade_name && c.ratchet && c.bit)
    .map((c) => ({
      rank: Number(c.site_recommendation_rank) || 0,
      blade: c.site_blade_name,
      bladeId: c.site_blade_id,
      ratchet: c.ratchet,
      bit: c.bit,
      score: Number(c.recommendation_score) || 0,
      wins: Number(c.total_wins) || 0,
      champRate: Number(c.champion_rate) || 0,
      recent90: Number(c.recent_90_count) || 0,
    }))
    .sort((a, b) => b.score - a.score)

  // ---- 站方推薦 ----
  const siteCombos: SiteCombo[] = []
  for (const r of tierRows) {
    const text = r['建議配置 (Combo)']
    if (!text || !r['中文名稱 (Name)']) continue
    siteCombos.push(...parseSiteCombos(text, r['中文名稱 (Name)']))
  }

  // ---- assists：零件圖鑑（輔助X）∪ 產品原裝 ∪ 站方組合指定 ----
  const assistIds = new Set<string>()
  for (const name of assistImgs.keys()) {
    const m = name.match(/^輔助([A-Z])$/)
    if (m) assistIds.add(m[1])
  }
  for (const p of products) if (p.assist) assistIds.add(p.assist)
  for (const c of siteCombos) if (c.assist) assistIds.add(c.assist)
  const assists: SimplePart[] = [...assistIds].sort().map((id) => ({
    id,
    tier: '', // 天梯站未對輔助刃評級
    img: assistImgs.get(`輔助${id}`) ?? '',
    stats: enrich?.assistStats(id),
  }))

  return {
    products,
    parts: { blades: [...bladeMap.values()], ratchets, bits, assists },
    combos,
    siteCombos,
  }
}

/** 快取 vs 內建：新者勝（未抗辯假設；ISO 8601 字串可直接字典序比較） */
export const shouldUseCache = (cacheSavedAt: string, bakedGeneratedAt: string): boolean =>
  cacheSavedAt > bakedGeneratedAt
