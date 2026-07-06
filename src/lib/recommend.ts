/**
 * Deck 推薦引擎：
 * 1. 由庫存（產品 + 零散零件）解出擁有的 blade / ratchet / bit
 * 2. 產生候選陀螺：已知實戰組合（meta）＋ 自組組合（synth）
 * 3. 在「同一 deck 內 blade / ratchet / bit 皆不得重複」的官方 3on3 規則下，
 *    搜尋總分最高的三顆（全域最佳，非貪婪）。
 */
import type {
  BeyCombo,
  Blade,
  DeckResult,
  Inventory,
  MetaCombo,
  PartsDb,
  Product,
  SimplePart,
  SiteCombo,
} from '../types'
import { bladeFamilyKey } from './family'
import { META_WEIGHT, SITE_TRUST, metaScoreNormalizer, partScore, tierValue } from './score'

export interface OwnedParts {
  blades: Blade[]
  ratchets: SimplePart[]
  bits: SimplePart[]
  assists: SimplePart[]
  /** blade 名稱 → 原裝輔助刃字母（CX 專用；取自擁有產品，缺則無） */
  stockAssistByBlade: Map<string, string>
  /** blade 名稱 → CX 鎖片/主刃拆名（顯示與重複判定用） */
  cxPartsByBlade: Map<string, { lockChip?: string; mainBlade?: string }>
}

/** 每顆 blade 最多保留的候選數（保證 deck 的 blade 多樣性） */
const PER_BLADE_CAP = 8
/** 全域候選上限（搜尋成本控制） */
const MAX_CANDIDATES = 200
const MAX_ALTERNATES = 8

export function resolveOwnedParts(inv: Inventory, products: Product[], db: PartsDb): OwnedParts {
  const productById = new Map(products.map((p) => [p.id, p]))
  const bladeNames = new Set(inv.extraBlades)
  const ratchetIds = new Set(inv.extraRatchets)
  const bitIds = new Set(inv.extraBits)
  const assistIds = new Set(inv.extraAssists ?? [])
  const stockAssistByBlade = new Map<string, string>()
  const cxPartsByBlade = new Map<string, { lockChip?: string; mainBlade?: string }>()
  for (const id of inv.productIds) {
    const p = productById.get(id)
    if (!p) continue
    bladeNames.add(p.name)
    if (p.ratchet) ratchetIds.add(p.ratchet)
    if (p.bit) bitIds.add(p.bit)
    if (p.assist) {
      assistIds.add(p.assist)
      if (!stockAssistByBlade.has(p.name)) stockAssistByBlade.set(p.name, p.assist)
    }
    if ((p.lockChip || p.mainBlade) && !cxPartsByBlade.has(p.name)) {
      cxPartsByBlade.set(p.name, { lockChip: p.lockChip, mainBlade: p.mainBlade })
    }
  }
  // 未擁有產品、僅登錄零散 blade 者：仍可從產品表補 CX 拆名（顯示用）
  for (const p of products) {
    if (bladeNames.has(p.name) && (p.lockChip || p.mainBlade) && !cxPartsByBlade.has(p.name)) {
      cxPartsByBlade.set(p.name, { lockChip: p.lockChip, mainBlade: p.mainBlade })
    }
  }
  return {
    blades: db.blades.filter((b) => bladeNames.has(b.name)),
    ratchets: db.ratchets.filter((r) => ratchetIds.has(r.id)),
    bits: db.bits.filter((b) => bitIds.has(b.id)),
    assists: (db.assists ?? []).filter((a) => assistIds.has(a.id)),
    stockAssistByBlade,
    cxPartsByBlade,
  }
}

const comboKey = (blade: string, ratchet: string, bit: string, assist = '') =>
  `${blade}|${ratchet}|${bit}|${assist}`

export function buildCandidates(
  owned: OwnedParts,
  metaCombos: MetaCombo[],
  siteCombos: SiteCombo[] = [],
): BeyCombo[] {
  const ratchetById = new Map(owned.ratchets.map((r) => [r.id, r]))
  const bitById = new Map(owned.bits.map((b) => [b.id, b]))
  const ownedAssists = new Set(owned.assists.map((a) => a.id))

  // 同家族變體（重塗/特別版）功能等價：每個家族取階級最高者當代表
  const bladeByFamily = new Map<string, Blade>()
  for (const b of owned.blades) {
    const fam = bladeFamilyKey(b.name)
    const cur = bladeByFamily.get(fam)
    if (!cur || tierValue(b.tier) > tierValue(cur.tier)) bladeByFamily.set(fam, b)
  }

  const maxRaw = metaCombos.reduce((m, c) => Math.max(m, c.score), 0)
  const normalize = metaScoreNormalizer(maxRaw)

  const seen = new Set<string>()
  const candidates: BeyCombo[] = []
  const cxFields = (bladeName: string, assist: string | undefined) => {
    const cx = owned.cxPartsByBlade.get(bladeName)
    return {
      ...(assist ? { assist } : {}),
      ...(cx?.lockChip ? { lockChip: cx.lockChip } : {}),
      ...(cx?.mainBlade ? { mainBlade: cx.mainBlade } : {}),
    }
  }

  for (const m of metaCombos) {
    const blade = bladeByFamily.get(bladeFamilyKey(m.blade))
    const ratchet = ratchetById.get(m.ratchet)
    const bit = bitById.get(m.bit)
    if (!blade || !ratchet || !bit) continue
    // 實戰統計未記錄輔助刃：CX 刃帶入該產品的原裝輔助刃
    const assist = owned.stockAssistByBlade.get(blade.name)
    // 以家族鍵去重：同一實戰組合的不同變體記錄只留最高分的一筆
    const key = comboKey(bladeFamilyKey(m.blade), m.ratchet, m.bit, assist)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      blade: blade.name, // 顯示玩家實際擁有的變體名
      ratchet: m.ratchet,
      bit: m.bit,
      ...cxFields(blade.name, assist),
      score: META_WEIGHT * normalize(m.score) + (1 - META_WEIGHT) * partScore(blade, ratchet, bit),
      source: 'meta',
      meta: m,
    })
  }

  // 站方推薦：天梯站「建議配置」欄解析出的完整組合。與實戰組合重複時以實戰版為準
  //（實戰迴圈在前，seen 以家族鍵去重）。不做任何零件自由重組。
  for (const s of siteCombos) {
    const blade = bladeByFamily.get(bladeFamilyKey(s.blade))
    const ratchet = ratchetById.get(s.ratchet)
    const bit = bitById.get(s.bit)
    if (!blade || !ratchet || !bit) continue
    // 站方指定輔助刃：沒擁有就不可組；未指定則帶原裝輔助刃
    if (s.assist && !ownedAssists.has(s.assist)) continue
    const assist = s.assist ?? owned.stockAssistByBlade.get(blade.name)
    const key = comboKey(bladeFamilyKey(s.blade), s.ratchet, s.bit, assist)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      blade: blade.name,
      ratchet: s.ratchet,
      bit: s.bit,
      ...cxFields(blade.name, assist),
      score: partScore(blade, ratchet, bit) * SITE_TRUST,
      source: 'site',
    })
  }

  // 排序後裁剪：每 blade 上限 + 全域上限
  candidates.sort((a, b) => b.score - a.score)
  const perBlade = new Map<string, number>()
  const trimmed: BeyCombo[] = []
  for (const c of candidates) {
    const n = perBlade.get(c.blade) ?? 0
    if (n >= PER_BLADE_CAP) continue
    perBlade.set(c.blade, n + 1)
    trimmed.push(c)
    if (trimmed.length >= MAX_CANDIDATES) break
  }
  return trimmed
}

/**
 * 在候選中找總分最高的互不衝突三顆。候選已按分數遞減排序時，
 * 對固定 (i, j)，第一個不衝突的 k 即該組最佳 → O(K²) 加上界剪枝。
 * 找不到三顆時退而求其次找最佳兩顆、一顆。
 * 衝突以 blade「家族」判定：重塗變體視為同一顆零件，不得同場。
 */
export function pickBestDeck(candidates: BeyCombo[]): DeckResult {
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const s = sorted.map((c) => c.score)
  const fam = sorted.map((c) => bladeFamilyKey(c.blade))
  const n = sorted.length
  // CX 五層規則：輔助刃/鎖片/主刃同名也不得同場（未抗辯假設：官方「同零件不重複」延伸解讀）
  const partClash = (a?: string, b?: string) => !!a && a === b
  const conflicts = (i: number, j: number) =>
    fam[i] === fam[j] ||
    sorted[i].ratchet === sorted[j].ratchet ||
    sorted[i].bit === sorted[j].bit ||
    partClash(sorted[i].assist, sorted[j].assist) ||
    partClash(sorted[i].lockChip, sorted[j].lockChip) ||
    partClash(sorted[i].mainBlade, sorted[j].mainBlade)

  let best: BeyCombo[] = []
  let bestTotal = 0

  for (let i = 0; i < n; i++) {
    if (i + 2 < n && s[i] + s[i + 1] + s[i + 2] <= bestTotal) break
    if (i + 2 >= n) break
    for (let j = i + 1; j < n; j++) {
      if (j + 1 < n && s[i] + s[j] + s[j + 1] <= bestTotal) break
      if (conflicts(i, j)) continue
      for (let k = j + 1; k < n; k++) {
        if (s[i] + s[j] + s[k] <= bestTotal) break
        if (conflicts(i, k) || conflicts(j, k)) continue
        best = [sorted[i], sorted[j], sorted[k]]
        bestTotal = s[i] + s[j] + s[k]
        break // 已排序 → 此 (i,j) 之後的 k 不會更好
      }
    }
  }

  if (best.length === 0) {
    // 找最佳互不衝突兩顆
    for (let i = 0; i < n; i++) {
      if (i + 1 < n && s[i] + s[i + 1] <= bestTotal) break
      for (let j = i + 1; j < n; j++) {
        if (s[i] + s[j] <= bestTotal) break
        if (conflicts(i, j)) continue
        best = [sorted[i], sorted[j]]
        bestTotal = s[i] + s[j]
        break
      }
    }
  }
  if (best.length === 0 && n > 0) {
    best = [sorted[0]]
    bestTotal = s[0]
  }

  const inDeck = new Set(best.map((b) => comboKey(b.blade, b.ratchet, b.bit)))
  const alternates = sorted
    .filter((c) => !inDeck.has(comboKey(c.blade, c.ratchet, c.bit)))
    .slice(0, MAX_ALTERNATES)

  return { beys: best, totalScore: bestTotal, incomplete: best.length < 3, alternates }
}

export function recommendDeck(
  inv: Inventory,
  products: Product[],
  db: PartsDb,
  metaCombos: MetaCombo[],
  siteCombos: SiteCombo[] = [],
): DeckResult {
  const owned = resolveOwnedParts(inv, products, db)
  return pickBestDeck(buildCandidates(owned, metaCombos, siteCombos))
}
