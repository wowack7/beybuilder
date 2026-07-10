import { useEffect, useState } from 'react'
import { BuildPage } from './components/build/BuildPage'
import { DeckPage } from './components/deck/DeckPage'
import { ImportPhBody } from './components/inventory/ImportPh'
import { performPhImport } from './components/inventory/importFlow'
import { InventoryPage } from './components/inventory/InventoryPage'
import { TierPage } from './components/tier/TierPage'
import { Modal } from './components/ui/Modal'
import { useInventory } from './hooks/useInventory'
import { dataStatus } from './lib/data'
import { decodeImportHash } from './lib/importPh'

function formatDataDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

type Tab = 'deck' | 'build' | 'inventory' | 'tier'

const TABS: { id: Tab; label: string }[] = [
  { id: 'deck', label: '最強戰隊' },
  { id: 'build', label: '自組隊伍' },
  { id: 'inventory', label: '零件庫' },
  { id: 'tier', label: '天梯' },
]

function App() {
  const [tab, setTab] = useState<Tab>('deck')
  const [importOpen, setImportOpen] = useState(false)
  const { inventory, toggleProduct, toggleExtra, clearAll, mergeInventory } = useInventory()

  // phstudy 書籤小工具跳轉匯入：#phimport=<base64>
  useEffect(() => {
    const raw = decodeImportHash(window.location.hash)
    if (!raw) return
    history.replaceState(null, '', window.location.pathname + window.location.search)
    try {
      const message = performPhImport(raw, mergeInventory)
      setTab('deck') // 匯入完直接看成果
      window.alert(message)
    } catch (error: unknown) {
      window.alert(`匯入失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }, [mergeInventory])

  return (
    <>
      <header className="site-header">
        <div className="brand">
          <h1 className="brand-name">
            Bey<span className="x">Builder X</span>
          </h1>
          <span className="brand-sub">Beyblade X 配裝模擬器</span>
        </div>
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
          <button type="button" className="nav-import" onClick={() => setImportOpen(true)}>
            匯入零件
          </button>
        </nav>
      </header>

      {importOpen && (
        <Modal title="從 phstudy 匯入零件" onClose={() => setImportOpen(false)}>
          <ImportPhBody onMerge={mergeInventory} onDone={() => setImportOpen(false)} />
        </Modal>
      )}

      <main>
        {tab === 'deck' && (
          <DeckPage inventory={inventory} onGoInventory={() => setTab('inventory')} onMerge={mergeInventory} />
        )}
        {tab === 'build' && (
          <BuildPage inventory={inventory} onGoInventory={() => setTab('inventory')} />
        )}
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
        {/* 靜態天梯總表（build 時由 scripts/gen-seo.mjs 產出）。這條內鏈是爬蟲抵達該頁的唯一路徑，
            移除等同讓它變成孤兒頁、長尾關鍵字失效。 */}
        <p>
          不用登錄零件也能查：
          <a href={`${import.meta.env.BASE_URL}tier/`}>Beyblade X 天梯階級總表</a>
          （全部戰刃／固鎖／軸心階級與熱門實戰組合）
        </p>
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
        <p className="footer-privacy">
          資料更新：{formatDataDate(dataStatus.at)}（每週自動同步）｜本站使用 Google Analytics
          匿名統計流量，以了解使用狀況。
        </p>
      </footer>
    </>
  )
}

export default App
