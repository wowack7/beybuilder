import { useMemo } from 'react'
import { metaCombos, partsDb, products } from '../../lib/data'
import { bladeFamilyKey } from '../../lib/family'
import { resolveOwnedParts } from '../../lib/recommend'
import type { Inventory } from '../../types'
import './tier.css'

const TIER_ROWS = ['X', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E+', 'E'] as const
const TOP_COMBOS = 50

const rowGroup = (tier: string) => (tier === 'X' ? 'x' : tier[0].toLowerCase())

interface TierPageProps {
  inventory: Inventory
}

export function TierPage({ inventory }: TierPageProps) {
  const owned = useMemo(() => resolveOwnedParts(inventory, products, partsDb), [inventory])
  const ownedBlades = useMemo(() => new Set(owned.blades.map((b) => b.name)), [owned])
  const ownedFamilies = useMemo(() => new Set(owned.blades.map((b) => bladeFamilyKey(b.name))), [owned])
  const ownedRatchets = useMemo(() => new Set(owned.ratchets.map((r) => r.id)), [owned])
  const ownedBits = useMemo(() => new Set(owned.bits.map((b) => b.id)), [owned])

  const bladesByTier = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const b of partsDb.blades) {
      if (!b.tier || b.tierInherited) continue
      const list = map.get(b.tier) ?? []
      list.push(b.name)
      map.set(b.tier, list)
    }
    return map
  }, [])

  const topCombos = useMemo(() => metaCombos.slice(0, TOP_COMBOS), [])

  const missingParts = (blade: string, ratchet: string, bit: string): string[] => {
    const missing: string[] = []
    // 重塗變體視為同零件（家族鍵），左/右旋除外
    if (!ownedFamilies.has(bladeFamilyKey(blade))) missing.push(blade)
    if (!ownedRatchets.has(ratchet)) missing.push(ratchet)
    if (!ownedBits.has(bit)) missing.push(bit)
    return missing
  }

  return (
    <section className="page" aria-labelledby="tier-title">
      <h2 className="page-title" id="tier-title">
        天梯與推薦配置
      </h2>
      <p className="page-desc">
        戰刃天梯階級與實戰組合排行（資料轉錄自 stan-yao 天梯站）。橘點代表你已擁有該零件。
      </p>

      <div className="tier-rows">
        {TIER_ROWS.map((tier) => {
          const blades = bladesByTier.get(tier)
          if (!blades?.length) return null
          const group = rowGroup(tier)
          return (
            <div
              key={tier}
              className="tier-row"
              data-group={group}
              style={{ ['--row-color' as string]: `var(--tier-${group})` }}
            >
              <span className="tier-label">{tier}</span>
              <div className="tier-blades">
                {blades.map((name) => (
                  <span
                    key={name}
                    className="blade-chip"
                    data-owned={ownedBlades.has(name) || ownedFamilies.has(bladeFamilyKey(name))}
                  >
                    <span className="dot" aria-hidden="true" />
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <h3 className="page-title">實戰組合排行 TOP {TOP_COMBOS}</h3>
      <div className="combo-table-wrap">
        <table className="combo-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">組合</th>
              <th scope="col">勝場</th>
              <th scope="col">奪冠率</th>
              <th scope="col">近 90 天</th>
              <th scope="col">可組？</th>
            </tr>
          </thead>
          <tbody>
            {topCombos.map((c, i) => {
              const missing = missingParts(c.blade, c.ratchet, c.bit)
              return (
                <tr key={`${c.blade}|${c.ratchet}|${c.bit}`}>
                  <td className="rank">{i + 1}</td>
                  <td className="combo-name">
                    {c.blade} {c.ratchet}
                    {c.bit}
                  </td>
                  <td>{c.wins}</td>
                  <td>{(c.champRate * 100).toFixed(1)}%</td>
                  <td>{c.recent90}</td>
                  <td>
                    <span className="buildable" data-ok={missing.length === 0}>
                      {missing.length === 0 ? '✓ 可組' : `缺 ${missing.join('、')}`}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="tier-note">排行依 stan-yao 站 recommendation_score 排序；「可組」以你目前的庫存判定。</p>
    </section>
  )
}
