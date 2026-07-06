import { phMap, products } from '../../lib/data'
import { parsePhInventory } from '../../lib/importPh'
import type { Inventory } from '../../types'

/** 解析＋確認＋合併；回傳給用戶看的結果訊息（App 的 hash 匯入與匯入面板共用） */
export function performPhImport(raw: string, merge: (add: Inventory) => void): string {
  const r = parsePhInventory(raw, phMap, products)
  const partCount =
    r.additions.extraBlades.length +
    r.additions.extraRatchets.length +
    r.additions.extraBits.length +
    (r.additions.extraAssists?.length ?? 0)
  const summary =
    `${r.additions.productIds.length} 件產品、${partCount} 顆零散零件` +
    (r.unmatched.length ? `；${r.unmatched.length} 筆對應不到（將略過）` : '')
  if (!window.confirm(`從 phstudy 解析出 ${summary}。\n要與現有庫存合併嗎？`)) {
    return '已取消匯入'
  }
  merge(r.additions)
  const missed = r.unmatched.length
    ? `\n對應不到：${r.unmatched.map((u) => u.partId).join('、')}`
    : ''
  return `已匯入 ${summary}${missed}`
}
