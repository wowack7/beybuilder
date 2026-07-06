import { phMap, products } from '../../lib/data'
import { parsePhInventory } from '../../lib/importPh'
import type { Inventory } from '../../types'

/**
 * 解析並合併 phstudy 匯入資料，回傳結果摘要（合併為非破壞性聯集，不需事前確認）。
 * 解析失敗會擲錯，由呼叫端處理。App 的 hash 匯入與匯入面板共用。
 */
export function performPhImport(raw: string, merge: (add: Inventory) => void): string {
  const r = parsePhInventory(raw, phMap, products)
  const partCount =
    r.additions.extraBlades.length +
    r.additions.extraRatchets.length +
    r.additions.extraBits.length +
    (r.additions.extraAssists?.length ?? 0)
  merge(r.additions)
  const summary =
    `已匯入 ${r.additions.productIds.length} 件產品、${partCount} 顆零散零件` +
    (r.unmatched.length ? `（${r.unmatched.length} 筆對應不到、已略過）` : '')
  return summary
}
