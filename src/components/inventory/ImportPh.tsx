import { useState } from 'react'
import { buildBookmarklet } from '../../lib/importPh'
import type { Inventory } from '../../types'
import { performPhImport } from './importFlow'
import './import.css'

interface ImportPhBodyProps {
  onMerge: (add: Inventory) => void
}

/** phstudy 匯入引導本體（首頁 onboarding 與零件庫頁共用） */
export function ImportPhBody({ onMerge }: ImportPhBodyProps) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')

  const siteUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href
  const bookmarklet = buildBookmarklet(siteUrl)

  const handleImport = () => {
    try {
      setMessage(performPhImport(text.trim(), onMerge))
      setText('')
    } catch (error: unknown) {
      setMessage(`匯入失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  return (
    <div className="import-body">
      <ol className="import-steps">
        <li>
          把這顆按鈕拖到瀏覽器書籤列：
          <a className="bookmarklet" href={bookmarklet} onClick={(e) => e.preventDefault()}>
            ⚡ 帶去 BeyBuilder
          </a>
          <button
            type="button"
            className="filter-chip"
            onClick={() =>
              navigator.clipboard
                .writeText(bookmarklet)
                .then(() => setMessage('已複製書籤小工具連結，可貼到書籤的網址欄'))
            }
          >
            複製連結
          </button>
        </li>
        <li>
          開啟{' '}
          <a href="https://beyblade.phstudy.org/inventory.html" target="_blank" rel="noreferrer">
            phstudy 零件倉庫頁
          </a>
          ，點一下剛才的書籤——會自動跳回本站完成匯入（資料只在你的瀏覽器內轉換，不會上傳）。
        </li>
      </ol>
      <details className="import-manual">
        <summary>沒辦法用書籤？手動貼上</summary>
        <p className="import-alt">
          在 phstudy 頁按 F12 開 Console，執行
          <code>copy(localStorage.getItem('beybladePartInventory:default'))</code>
          後貼到下方。
        </p>
        <textarea
          className="import-textarea"
          rows={3}
          placeholder='{"parts":[{"partId":"BL-PRD-…"}]}'
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="phstudy 倉庫 JSON"
        />
        <button type="button" className="btn-refresh" disabled={!text.trim()} onClick={handleImport}>
          解析並匯入
        </button>
      </details>
      {message && (
        <p className="import-result" role="status">
          {message}
        </p>
      )}
    </div>
  )
}

interface ImportPhProps {
  onMerge: (add: Inventory) => void
}

/** 零件庫頁的折疊版 */
export function ImportPh({ onMerge }: ImportPhProps) {
  return (
    <details className="extra-parts import-ph">
      <summary>從 phstudy 零件倉庫一鍵匯入</summary>
      <div className="extra-body">
        <ImportPhBody onMerge={onMerge} />
      </div>
    </details>
  )
}
