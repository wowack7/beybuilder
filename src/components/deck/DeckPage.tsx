import { useMemo, useState } from 'react'
import {
  COMBO_SOURCE_LABEL,
  assistById,
  bitById,
  bladeByName,
  imgUrl,
  metaCombos,
  partsDb,
  products,
  ratchetById,
  siteCombos,
} from '../../lib/data'
import { buildCandidates, pickBestDeck, resolveOwnedParts } from '../../lib/recommend'
import { renderDeckCard } from '../../lib/shareCard'
import type { BeyCombo, Inventory } from '../../types'
import { ImportPhBody } from '../inventory/ImportPh'
import { HoverThumb } from '../ui/HoverThumb'
import { TierBadge } from '../ui/TierBadge'
import { BeyCard } from './BeyCard'
import './deck.css'

interface DeckPageProps {
  inventory: Inventory
  onGoInventory: () => void
  onMerge: (add: Inventory) => void
}

const hasAnyParts = (inv: Inventory) =>
  inv.productIds.length > 0 ||
  inv.extraBlades.length > 0 ||
  inv.extraRatchets.length > 0 ||
  inv.extraBits.length > 0

export function DeckPage({ inventory, onGoInventory, onMerge }: DeckPageProps) {
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'error'>('idle')
  const candidates = useMemo(() => {
    const owned = resolveOwnedParts(inventory, products, partsDb)
    return buildCandidates(owned, metaCombos, siteCombos)
  }, [inventory])
  const deck = useMemo(() => pickBestDeck(candidates), [candidates])

  const handleShare = async () => {
    setShareState('busy')
    try {
      const blob = await renderDeckCard(deck)
      const today = new Date()
      const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      const file = new File([blob], `beybuilder-deck-${stamp}.png`, { type: 'image/png' })
      // 行動裝置優先走原生分享；不支援就下載
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '我的 Beyblade X 最強戰隊' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      }
      setShareState('idle')
    } catch (error: unknown) {
      // 用戶取消原生分享不算錯誤
      if (error instanceof Error && error.name === 'AbortError') {
        setShareState('idle')
        return
      }
      setShareState('error')
    }
  }

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
          歡迎來到 BeyBuilder X
        </h2>
        <p className="page-desc">
          登錄你擁有的零件，這裡會依官方 3on3 規則自動算出最強出戰組合。兩種方式開始：
        </p>
        <div className="onboard-grid">
          <article className="onboard-card onboard-primary">
            <span className="onboard-step" aria-hidden="true">
              A
            </span>
            <h3>已經在 phstudy 記錄過零件？</h3>
            <p>兩步驟把你的「零件倉庫」整批搬過來，馬上看到你的最強戰隊。</p>
            <ImportPhBody onMerge={onMerge} />
          </article>
          <article className="onboard-card">
            <span className="onboard-step" aria-hidden="true">
              B
            </span>
            <h3>從零開始勾選</h3>
            <p>到零件庫點選你擁有的陀螺產品，原裝戰刃／固鎖／軸心會自動帶入；散裝零件也能補登。</p>
            <button type="button" className="btn btn-primary" onClick={onGoInventory}>
              前往登錄庫存
            </button>
          </article>
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
            從你的庫存算出最強的三顆出戰組合，同一 deck 內零件不重複。
          </p>
        </div>
        <div className="deck-actions">
          {deck.beys.length > 0 && (
            <button
              type="button"
              className="btn-share"
              onClick={handleShare}
              disabled={shareState === 'busy'}
            >
              {shareState === 'busy' ? '產生中…' : '分享戰隊圖'}
            </button>
          )}
          {shareState === 'error' && <span className="share-error">圖片產生失敗，再試一次</span>}
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
                    <img src={imgUrl(info.img)} alt="" width="40" height="40" loading="lazy" decoding="async" />
                  ) : (
                    <span className="alt-img-empty" aria-hidden="true">
                      X
                    </span>
                  )}
                  <span className="alt-blade">{blade}</span>
                  <TierBadge tier={info?.tier ?? ''} inherited={info?.tierInherited} />
                  <span className="alt-count">{combos.length} 組</span>
                </summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">配置</th>
                      <th scope="col">來源</th>
                      <th scope="col">勝場</th>
                      <th scope="col">奪冠率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combos.map((c) => (
                      <tr key={`${c.ratchet}|${c.bit}|${c.assist ?? ''}`}>
                        <td className="alt-config">
                          <HoverThumb label={c.ratchet} img={ratchetById.get(c.ratchet)?.img} />
                          <span className="sep"> / </span>
                          <HoverThumb label={c.bit} img={bitById.get(c.bit)?.img} />
                          {c.assist && (
                            <>
                              <span className="sep"> / </span>
                              <HoverThumb label={`輔助${c.assist}`} img={assistById.get(c.assist)?.img} />
                            </>
                          )}
                        </td>
                        <td>{COMBO_SOURCE_LABEL[c.source] ?? c.source}</td>
                        <td>{c.meta?.wins ?? '—'}</td>
                        <td>{c.meta ? `${(c.meta.champRate * 100).toFixed(0)}%` : '—'}</td>
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
        組合僅取自實戰組合（天梯站賽事統計）與站方推薦（建議配置），不自由重組零件；排序依實戰與階級的自訂權重，不顯示分數。實際勝負仍看技術，資料轉錄自第三方站點，僅供參考。
      </p>
    </section>
  )
}
