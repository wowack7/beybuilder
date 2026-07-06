/**
 * phstudy「零件倉庫」匯入：解析 beyblade.phstudy.org localStorage 的
 * `beybladePartInventory:<profile>` JSON，透過 ph_map（data:update 生成）
 * 對應成本站庫存。全程瀏覽器離線解析，資料不外傳。
 *
 * 規則（與站上模型一致）：
 * - 同套組 BL+RC+BT 齊全且套組對得到產品 → 記為擁有該產品
 * - 其餘零件逐一對應為額外零件（已被所選產品涵蓋者略過）
 * - CX 組件 MB+LC 齊全 → 視為擁有該套組的組合刃（blade）
 * - ME/OV（金屬刃/上蓋刃）本站不建模，忽略不計
 */
import type { Inventory, Product } from '../types'
import type { PhMap } from './transform'

export interface PhImportResult {
  additions: Inventory
  unmatched: { partId: string; reason: string }[]
  /** 解析到的零件總數（含忽略者） */
  totalParts: number
}

interface PhPart {
  partId: string
  sourceSetId?: string
}

const KIND_PREFIX = /^(BL|RC|BT|AB|MB|LC|ME|OV)-/

export function parsePhInventory(
  raw: string,
  map: PhMap,
  products: Product[],
): PhImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('不是有效的 JSON——請貼上 phstudy 倉庫的完整內容')
  }
  const parts = (parsed as { parts?: PhPart[] })?.parts
  if (!Array.isArray(parts) || parts.some((p) => typeof p?.partId !== 'string')) {
    throw new Error('格式不符——找不到 parts 清單（應為 phstudy 的 beybladePartInventory 內容）')
  }

  const productById = new Map(products.map((p) => [p.id, p]))
  const suffixOf = (id: string) => id.replace(KIND_PREFIX, '')
  const kindOf = (id: string) => id.match(KIND_PREFIX)?.[1] ?? ''

  // 依套組尾碼聚合零件種類
  const kindsBySuffix = new Map<string, Set<string>>()
  for (const p of parts) {
    const kind = kindOf(p.partId)
    if (!kind) continue
    const suffix = suffixOf(p.partId)
    if (!kindsBySuffix.has(suffix)) kindsBySuffix.set(suffix, new Set())
    kindsBySuffix.get(suffix)!.add(kind)
  }

  const productIds = new Set<string>()
  const unmatched: PhImportResult['unmatched'] = []

  // 完整套組（BL+RC+BT）→ 產品
  const productSuffixes = new Set<string>()
  for (const [suffix, kinds] of kindsBySuffix) {
    if (!(kinds.has('BL') && kinds.has('RC') && kinds.has('BT'))) continue
    const pid = map.sets[suffix]
    if (pid && productById.has(pid)) {
      productIds.add(pid)
      productSuffixes.add(suffix)
    }
  }
  // CX 組件齊全（MB+LC）→ 該套組的組合刃
  const cxBladeSuffixes = new Set<string>()
  for (const [suffix, kinds] of kindsBySuffix) {
    if (productSuffixes.has(suffix)) continue
    if (!(kinds.has('MB') && kinds.has('LC'))) continue
    const pid = map.sets[suffix]
    const name = pid ? productById.get(pid)?.name : map.blades[suffix]
    if (name) cxBladeSuffixes.add(suffix)
  }

  // 已被產品涵蓋的零件不再列入額外零件
  const covered = { blades: new Set<string>(), ratchets: new Set<string>(), bits: new Set<string>(), assists: new Set<string>() }
  for (const pid of productIds) {
    const p = productById.get(pid)!
    covered.blades.add(p.name)
    if (p.ratchet) covered.ratchets.add(p.ratchet)
    if (p.bit) covered.bits.add(p.bit)
    if (p.assist) covered.assists.add(p.assist)
  }

  const extras = { blades: new Set<string>(), ratchets: new Set<string>(), bits: new Set<string>(), assists: new Set<string>() }
  for (const p of parts) {
    const kind = kindOf(p.partId)
    const suffix = suffixOf(p.partId)
    if (!kind) {
      unmatched.push({ partId: p.partId, reason: '無法辨識的零件類型' })
      continue
    }
    if (productSuffixes.has(suffix)) continue // 整組已折算成產品
    switch (kind) {
      case 'BL': {
        const name = map.blades[suffix]
        if (name && !covered.blades.has(name)) extras.blades.add(name)
        else if (!name) unmatched.push({ partId: p.partId, reason: 'blade 對應不到本站資料' })
        break
      }
      case 'RC': {
        const id = map.ratchets[suffix]
        if (id && !covered.ratchets.has(id)) extras.ratchets.add(id)
        else if (!id) unmatched.push({ partId: p.partId, reason: 'ratchet 對應不到本站資料' })
        break
      }
      case 'BT': {
        const id = map.bits[suffix]
        if (id && !covered.bits.has(id)) extras.bits.add(id)
        else if (!id) unmatched.push({ partId: p.partId, reason: 'bit 對應不到本站資料' })
        break
      }
      case 'AB': {
        const id = map.assists[suffix]
        if (id && !covered.assists.has(id)) extras.assists.add(id)
        else if (!id) unmatched.push({ partId: p.partId, reason: '輔助刃對應不到本站資料' })
        break
      }
      case 'MB':
      case 'LC': {
        if (cxBladeSuffixes.has(suffix) && kind === 'MB') {
          const pid = map.sets[suffix]
          const name = pid ? productById.get(pid)?.name : map.blades[suffix]
          if (name && !covered.blades.has(name)) extras.blades.add(name)
        } else if (!cxBladeSuffixes.has(suffix)) {
          unmatched.push({ partId: p.partId, reason: 'CX 組件不齊（需紋章＋主刃）' })
        }
        break
      }
      default:
        break // ME / OV：本站不建模，靜默忽略
    }
  }

  return {
    additions: {
      productIds: [...productIds].sort(),
      extraBlades: [...extras.blades].sort(),
      extraRatchets: [...extras.ratchets].sort(),
      extraBits: [...extras.bits].sort(),
      extraAssists: [...extras.assists].sort(),
    },
    unmatched,
    totalParts: parts.length,
  }
}

/** 產生 phstudy 端的一鍵匯出書籤小工具（跳轉回本站並以 hash 帶入資料） */
export function buildBookmarklet(siteUrl: string): string {
  const code = `(()=>{const p=localStorage.getItem('beybladeInventoryProfileCurrent')||'default';const d=localStorage.getItem('beybladePartInventory:'+p);if(!d){alert('這個頁面沒有 phstudy 倉庫資料，請在 beyblade.phstudy.org 使用');return}location.href='${siteUrl}#phimport='+encodeURIComponent(btoa(unescape(encodeURIComponent(d))))})()`
  return `javascript:${encodeURI(code)}`
}

/** 解 hash 匯入資料（#phimport=<base64>）；非本功能 hash 回傳 null */
export function decodeImportHash(hash: string): string | null {
  if (!hash.startsWith('#phimport=')) return null
  try {
    return decodeURIComponent(escape(atob(decodeURIComponent(hash.slice('#phimport='.length)))))
  } catch {
    return null
  }
}
