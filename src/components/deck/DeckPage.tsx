import { useMemo } from 'react'
import { COMBO_SOURCE_LABEL, bladeByName, metaCombos, partsDb, products, siteCombos } from '../../lib/data'
import { buildCandidates, pickBestDeck, resolveOwnedParts } from '../../lib/recommend'
import type { BeyCombo, Inventory } from '../../types'
import { TierBadge } from '../ui/TierBadge'
import { BeyCard } from './BeyCard'
import './deck.css'

interface DeckPageProps {
  inventory: Inventory
  onGoInventory: () => void
}

const hasAnyParts = (inv: Inventory) =>
  inv.productIds.length > 0 ||
  inv.extraBlades.length > 0 ||
  inv.extraRatchets.length > 0 ||
  inv.extraBits.length > 0

export function DeckPage({ inventory, onGoInventory }: DeckPageProps) {
  const candidates = useMemo(() => {
    const owned = resolveOwnedParts(inventory, products, partsDb)
    return buildCandidates(owned, metaCombos, siteCombos)
  }, [inventory])
  const deck = useMemo(() => pickBestDeck(candidates), [candidates])

  // 候補依陀螺分組（排除已進 deck 的組合），組內沿用候選排序（分數遞減）
  const alternateGroups = useMemo(() => {
    const inDeck = new Set(deck.beys.map((b) => `${b.blade}|${b.ratchet}|${b.bit}`))
    const groups = new Map<string, BeyCombo[]>()
    for (const c of candidates) {
      if (inDeck.has(`${c.blade}|${c.ratchet}|${c.bit}`)) continue
      const list = groups.get(c.blade) ?? []
      list.push(c)
      groups.set(c.blade, list)
    }
    return [...groups.entries()]
      .map(([blade, combos]) => ({ blade, combos }))
      .sort((a, b) => b.combos[0].score - a.combos[0].score)
  }, [candidates, deck])

  if (!hasAnyParts(inventory)) {
    return (
      <section className="page" aria-labelledby="deck-title">
        <h2 className="page-title" id="deck-title">
          最強戰隊
        </h2>
        <div className="empty-state">
          <h3>先登錄你的零件庫</h3>
          <p>勾選你擁有的陀螺產品後，這裡會自動算出手上零件能組出的最強 3on3 出戰組合。</p>
          <button type="button" className="btn btn-primary" onClick={onGoInventory}>
            前往登錄庫存
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="page" aria-labelledby="deck-title">
      <header className="deck-hero">
        <div>
          <h2 className="page-title" id="deck-title">
            最強戰隊
          </h2>
          <p className="page-desc">
            依你的庫存，在「同一 deck 內 Blade / Ratchet / Bit 不得重複」的 3on3 規則下算出的最佳三顆。
          </p>
        </div>
        <div className="deck-total">
          <span className="label">Deck Score</span>
          <span className="value">{deck.totalScore.toFixed(0)}</span>
        </div>
      </header>

      {deck.incomplete && (
        <p className="deck-warning" role="status">
          <strong>湊不滿三顆：</strong>
          本站只推薦有實戰紀錄或站方建議的完整組合，目前庫存湊不出{' '}
          {deck.beys.length > 0 ? `第 ${deck.beys.length + 1} 顆` : '任何一顆'}
          零件互不重複的推薦組合——參考天梯頁的「缺件」提示補零件吧。
        </p>
      )}

      <div className="deck-grid">
        {deck.beys.map((bey, i) => (
          <BeyCard key={`${bey.blade}|${bey.ratchet}|${bey.bit}`} bey={bey} slot={i + 1} />
        ))}
      </div>

      {alternateGroups.length > 0 && (
        <section className="alternates" aria-label="候補組合">
          <h3>候補組合</h3>
          <p className="alt-hint">依陀螺分組——點開上蓋看每顆的其他推薦配置。</p>
          {alternateGroups.map(({ blade, combos }, i) => {
            const info = bladeByName.get(blade)
            return (
              <details className="alt-group" key={blade} open={i === 0}>
                <summary>
                  {info?.img ? (
                    <img src={info.img} alt="" width="40" height="40" loading="lazy" />
                  ) : (
                    <span className="alt-img-empty" aria-hidden="true">
                      X
                    </span>
                  )}
                  <span className="alt-blade">{blade}</span>
                  <TierBadge tier={info?.tier ?? ''} inherited={info?.tierInherited} />
                  <span className="alt-count">{combos.length} 組</span>
                  <span className="alt-best">最佳 {combos[0].score.toFixed(1)} 分</span>
                </summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">組合</th>
                      <th scope="col">分數</th>
                      <th scope="col">來源</th>
                      <th scope="col">勝場</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combos.map((c) => (
                      <tr key={`${c.ratchet}|${c.bit}|${c.assist ?? ''}`}>
                        <td>
                          {c.blade} {c.ratchet}
                          {c.bit}
                          {c.assist ? `（輔助${c.assist}）` : ''}
                        </td>
                        <td>{c.score.toFixed(1)}</td>
                        <td>{COMBO_SOURCE_LABEL[c.source] ?? c.source}</td>
                        <td>{c.meta?.wins ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )
          })}
        </section>
      )}

      <p className="score-note">
        候選組合只來自兩個來源：實戰組合（stan-yao 天梯站賽事統計，60% 實戰分＋40% 零件階級分）與站方推薦（該站「建議配置」欄，零件階級分
        ×0.9）——不做零件自由重組。權重為本站自訂近似值，僅供參考。
      </p>
    </section>
  )
}
