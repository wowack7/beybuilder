import { useState } from 'react'
import { DeckPage } from './components/deck/DeckPage'
import { InventoryPage } from './components/inventory/InventoryPage'
import { TierPage } from './components/tier/TierPage'
import { useInventory } from './hooks/useInventory'
import { dataStatus, refreshData } from './lib/data'

function formatDataTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function DataStatusBar() {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleRefresh = async () => {
    setState('busy')
    setMessage('')
    try {
      await refreshData()
      location.reload()
    } catch (error: unknown) {
      setState('error')
      setMessage(error instanceof Error ? error.message : '未知錯誤')
    }
  }

  return (
    <div className="data-status" role="status">
      <span className="data-time">
        資料：{formatDataTime(dataStatus.at)}（{dataStatus.source === 'online' ? '線上' : '內建'}）
      </span>
      <button type="button" className="btn-refresh" onClick={handleRefresh} disabled={state === 'busy'}>
        {state === 'busy' ? '更新中…' : '更新資料'}
      </button>
      {state === 'error' && <span className="data-error">線上更新失敗（{message}），仍使用現有資料</span>}
    </div>
  )
}

type Tab = 'deck' | 'inventory' | 'tier'

const TABS: { id: Tab; label: string }[] = [
  { id: 'deck', label: '最強戰隊' },
  { id: 'inventory', label: '零件庫' },
  { id: 'tier', label: '天梯' },
]

function App() {
  const [tab, setTab] = useState<Tab>('deck')
  const { inventory, toggleProduct, toggleExtra, clearAll } = useInventory()

  return (
    <>
      <header className="site-header">
        <div className="brand">
          <h1 className="brand-name">
            Bey<span className="x">Builder X</span>
          </h1>
          <span className="brand-sub">Beyblade X 配裝模擬器</span>
        </div>
        <DataStatusBar />
        <nav aria-label="主導覽">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'inventory' && inventory.productIds.length > 0 && (
                  <span className="count">{inventory.productIds.length}</span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main>
        {tab === 'deck' && <DeckPage inventory={inventory} onGoInventory={() => setTab('inventory')} />}
        {tab === 'inventory' && (
          <InventoryPage
            inventory={inventory}
            onToggleProduct={toggleProduct}
            onToggleExtra={toggleExtra}
            onClearAll={clearAll}
          />
        )}
        {tab === 'tier' && <TierPage inventory={inventory} />}
      </main>

      <footer className="site-footer">
        <p>
          天梯階級與實戰統計資料來自{' '}
          <a href="https://stan-yao.github.io/beyblade_x_tier/" target="_blank" rel="noreferrer">
            stan-yao 的 Beyblade X 天梯站
          </a>
          ；零件數值參考{' '}
          <a href="https://beyblade.phstudy.org/" target="_blank" rel="noreferrer">
            beyblade.phstudy.org
          </a>
          。本站僅供玩家交流參考，Beyblade X 為 TAKARA TOMY 之商標。
        </p>
      </footer>
    </>
  )
}

export default App
