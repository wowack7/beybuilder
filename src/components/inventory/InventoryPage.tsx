import { useMemo, useState } from 'react'
import type { ExtraKind } from '../../hooks/useInventory'
import { SERIES_OPTIONS, partsDb, productById, products, productSeries } from '../../lib/data'
import { resolveOwnedParts } from '../../lib/recommend'
import { tierValue } from '../../lib/score'
import type { Inventory } from '../../types'
import { Modal } from '../ui/Modal'
import { ProductCard } from './ProductCard'
import './inventory.css'

interface InventoryPageProps {
  inventory: Inventory
  onToggleProduct: (id: string) => void
  onToggleExtra: (kind: ExtraKind, id: string) => void
  onClearAll: () => void
}

interface ExtraChipProps {
  label: string
  isExtra: boolean
  isCovered: boolean
  onToggle: () => void
}

/** 額外零件 chip：手動加入或被套組覆蓋都標亮；被套組覆蓋者不可在此移除 */
function ExtraChip({ label, isExtra, isCovered, onToggle }: ExtraChipProps) {
  return (
    <button
      type="button"
      className="filter-chip"
      aria-pressed={isCovered || isExtra}
      disabled={isCovered}
      title={isCovered ? '已由擁有的產品提供（如需移除請取消該產品）' : undefined}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

export function InventoryPage({
  inventory,
  onToggleProduct,
  onToggleExtra,
  onClearAll,
}: InventoryPageProps) {
  const [query, setQuery] = useState('')
  const [series, setSeries] = useState<(typeof SERIES_OPTIONS)[number]>('全部')
  const [ownedOnly, setOwnedOnly] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)

  const ownedSet = useMemo(() => new Set(inventory.productIds), [inventory.productIds])
  const owned = useMemo(() => resolveOwnedParts(inventory, products, partsDb), [inventory])

  // 由「擁有的產品」提供的零件——額外零件 chip 也要跟著標亮（且不可在此移除，須從產品卡）
  const covered = useMemo(() => {
    const c = resolveOwnedParts(
      { productIds: inventory.productIds, extraBlades: [], extraRatchets: [], extraBits: [], extraAssists: [] },
      products,
      partsDb,
    )
    return {
      blades: new Set(c.blades.map((b) => b.name)),
      ratchets: new Set(c.ratchets.map((r) => r.id)),
      bits: new Set(c.bits.map((b) => b.id)),
      assists: new Set(c.assists.map((a) => a.id)),
    }
  }, [inventory.productIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // 依天梯階級排序（X 最前、無階級排最後）；同階級維持原始順序
    const rank = (tier: string) => (tier ? tierValue(tier) : -1)
    return products
      .filter((p) => {
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
      .sort((a, b) => rank(b.tier) - rank(a.tier))
  }, [query, series, ownedOnly, ownedSet])

  const handleClearConfirmed = () => {
    onClearAll()
    setConfirmClear(false)
  }

  // 新增直接生效；移除（再點一次已擁有的產品）先確認，避免誤觸刪除
  const handleProductClick = (id: string) => {
    if (ownedSet.has(id)) setRemoveId(id)
    else onToggleProduct(id)
  }

  const handleRemoveConfirmed = () => {
    if (removeId) onToggleProduct(removeId)
    setRemoveId(null)
  }

  return (
    <section className="page" aria-labelledby="inv-title">
      <h2 className="page-title" id="inv-title">
        我的零件庫
      </h2>
      <p className="page-desc">
        點選你擁有的產品（自動帶入原裝戰刃／固鎖／軸心）；單獨入手的零件可在下方「額外零件」補登。資料會存在瀏覽器內。
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
          戰刃 <strong>{owned.blades.length}</strong>
        </span>
        <span>
          固鎖 <strong>{owned.ratchets.length}</strong>
        </span>
        <span>
          軸心 <strong>{owned.bits.length}</strong>
        </span>
        <span>
          輔助刃 <strong>{owned.assists.length}</strong>
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-ghost-danger"
          onClick={() => setConfirmClear(true)}
          disabled={
            inventory.productIds.length === 0 &&
            inventory.extraBlades.length === 0 &&
            inventory.extraRatchets.length === 0 &&
            inventory.extraBits.length === 0 &&
            (inventory.extraAssists?.length ?? 0) === 0
          }
        >
          清空庫存
        </button>
      </div>

      {filtered.length > 0 ? (
        <div className="product-grid">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} owned={ownedSet.has(p.id)} onToggle={handleProductClick} />
          ))}
        </div>
      ) : (
        <p className="no-results">沒有符合條件的產品</p>
      )}

      <details className="extra-parts">
        <summary>額外零件（單獨入手的 戰刃／固鎖／軸心／輔助刃）</summary>
        <div className="extra-body">
          <div className="extra-group">
            <h4>戰刃</h4>
            <div className="chip-row">
              {partsDb.blades.map((b) => (
                <ExtraChip
                  key={b.name}
                  label={b.name}
                  isExtra={inventory.extraBlades.includes(b.name)}
                  isCovered={covered.blades.has(b.name)}
                  onToggle={() => onToggleExtra('extraBlades', b.name)}
                />
              ))}
            </div>
          </div>
          <div className="extra-group">
            <h4>固鎖</h4>
            <div className="chip-row">
              {partsDb.ratchets.map((r) => (
                <ExtraChip
                  key={r.id}
                  label={r.id}
                  isExtra={inventory.extraRatchets.includes(r.id)}
                  isCovered={covered.ratchets.has(r.id)}
                  onToggle={() => onToggleExtra('extraRatchets', r.id)}
                />
              ))}
            </div>
          </div>
          <div className="extra-group">
            <h4>軸心</h4>
            <div className="chip-row">
              {partsDb.bits.map((b) => (
                <ExtraChip
                  key={b.id}
                  label={b.id}
                  isExtra={inventory.extraBits.includes(b.id)}
                  isCovered={covered.bits.has(b.id)}
                  onToggle={() => onToggleExtra('extraBits', b.id)}
                />
              ))}
            </div>
          </div>
          <div className="extra-group">
            <h4>輔助刃（CX）</h4>
            <div className="chip-row">
              {partsDb.assists.map((a) => (
                <ExtraChip
                  key={a.id}
                  label={`輔助${a.id}`}
                  isExtra={(inventory.extraAssists ?? []).includes(a.id)}
                  isCovered={covered.assists.has(a.id)}
                  onToggle={() => onToggleExtra('extraAssists', a.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </details>

      {confirmClear && (
        <Modal title="清空庫存" onClose={() => setConfirmClear(false)}>
          <p className="confirm-message">
            確定要清空整個庫存嗎？你登錄的所有產品與零件都會移除，此動作<strong>無法復原</strong>。
          </p>
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
              取消
            </button>
            <button type="button" className="btn btn-danger" onClick={handleClearConfirmed}>
              確定清空
            </button>
          </div>
        </Modal>
      )}

      {removeId && (
        <Modal title="移除產品" onClose={() => setRemoveId(null)}>
          <p className="confirm-message">
            要把「{productById.get(removeId)?.name ?? removeId}」從庫存移除嗎？
          </p>
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={() => setRemoveId(null)}>
              取消
            </button>
            <button type="button" className="btn btn-danger" onClick={handleRemoveConfirmed}>
              移除
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
