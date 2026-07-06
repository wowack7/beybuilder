import { useMemo, useState } from 'react'
import type { ExtraKind } from '../../hooks/useInventory'
import { SERIES_OPTIONS, partsDb, products, productSeries } from '../../lib/data'
import { resolveOwnedParts } from '../../lib/recommend'
import type { Inventory } from '../../types'
import { ImportPh } from './ImportPh'
import { ProductCard } from './ProductCard'
import './inventory.css'

interface InventoryPageProps {
  inventory: Inventory
  onToggleProduct: (id: string) => void
  onToggleExtra: (kind: ExtraKind, id: string) => void
  onClearAll: () => void
  onMerge: (add: Inventory) => void
}

export function InventoryPage({
  inventory,
  onToggleProduct,
  onToggleExtra,
  onClearAll,
  onMerge,
}: InventoryPageProps) {
  const [query, setQuery] = useState('')
  const [series, setSeries] = useState<(typeof SERIES_OPTIONS)[number]>('全部')
  const [ownedOnly, setOwnedOnly] = useState(false)

  const ownedSet = useMemo(() => new Set(inventory.productIds), [inventory.productIds])
  const owned = useMemo(() => resolveOwnedParts(inventory, products, partsDb), [inventory])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (series !== '全部' && productSeries(p.id) !== series) return false
      if (ownedOnly && !ownedSet.has(p.id)) return false
      if (!q) return true
      return (
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.ratchet.toLowerCase().includes(q) ||
        p.bit.toLowerCase().includes(q)
      )
    })
  }, [query, series, ownedOnly, ownedSet])

  const handleClear = () => {
    if (window.confirm('確定要清空整個庫存？此動作無法復原。')) onClearAll()
  }

  return (
    <section className="page" aria-labelledby="inv-title">
      <h2 className="page-title" id="inv-title">
        我的零件庫
      </h2>
      <p className="page-desc">
        點選你擁有的產品（自動帶入原裝 Blade / Ratchet / Bit）；單獨入手的零件可在下方「額外零件」補登。資料會存在瀏覽器內。
      </p>

      <div className="inv-toolbar" role="search">
        <input
          type="search"
          className="inv-search"
          placeholder="搜尋型號、名稱、零件…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜尋產品"
        />
        <div className="chip-row" role="group" aria-label="系列篩選">
          {SERIES_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="filter-chip"
              aria-pressed={series === s}
              onClick={() => setSeries(s)}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            className="filter-chip"
            aria-pressed={ownedOnly}
            onClick={() => setOwnedOnly((v) => !v)}
          >
            只看已擁有
          </button>
        </div>
      </div>

      <div className="inv-summary">
        <span>
          已擁有 <strong>{inventory.productIds.length}</strong> 件產品
        </span>
        <span>
          Blade <strong>{owned.blades.length}</strong>
        </span>
        <span>
          Ratchet <strong>{owned.ratchets.length}</strong>
        </span>
        <span>
          Bit <strong>{owned.bits.length}</strong>
        </span>
        <span>
          輔助刃 <strong>{owned.assists.length}</strong>
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost-danger" onClick={handleClear}>
          清空庫存
        </button>
      </div>

      {filtered.length > 0 ? (
        <div className="product-grid">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} owned={ownedSet.has(p.id)} onToggle={onToggleProduct} />
          ))}
        </div>
      ) : (
        <p className="no-results">沒有符合條件的產品</p>
      )}

      <ImportPh onMerge={onMerge} />

      <details className="extra-parts">
        <summary>額外零件（單獨入手的 Blade / Ratchet / Bit / 輔助刃）</summary>
        <div className="extra-body">
          <div className="extra-group">
            <h4>Blade</h4>
            <div className="chip-row">
              {partsDb.blades.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  className="filter-chip"
                  aria-pressed={inventory.extraBlades.includes(b.name)}
                  onClick={() => onToggleExtra('extraBlades', b.name)}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
          <div className="extra-group">
            <h4>Ratchet</h4>
            <div className="chip-row">
              {partsDb.ratchets.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="filter-chip"
                  aria-pressed={inventory.extraRatchets.includes(r.id)}
                  onClick={() => onToggleExtra('extraRatchets', r.id)}
                >
                  {r.id}
                </button>
              ))}
            </div>
          </div>
          <div className="extra-group">
            <h4>Bit</h4>
            <div className="chip-row">
              {partsDb.bits.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="filter-chip"
                  aria-pressed={inventory.extraBits.includes(b.id)}
                  onClick={() => onToggleExtra('extraBits', b.id)}
                >
                  {b.id}
                </button>
              ))}
            </div>
          </div>
          <div className="extra-group">
            <h4>輔助刃（CX）</h4>
            <div className="chip-row">
              {partsDb.assists.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="filter-chip"
                  aria-pressed={(inventory.extraAssists ?? []).includes(a.id)}
                  onClick={() => onToggleExtra('extraAssists', a.id)}
                >
                  輔助{a.id}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>
    </section>
  )
}
