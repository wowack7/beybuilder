import { useState } from 'react'
import { buildBookmarklet } from '../../lib/importPh'
import type { Inventory } from '../../types'
import { performPhImport } from './importFlow'

interface ImportPhProps {
  onMerge: (add: Inventory) => void
}

export function ImportPh({ onMerge }: ImportPhProps) {
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
    <details className="extra-parts import-ph">
      <summary>從 phstudy 零件倉庫一鍵匯入</summary>
      <div className="extra-body">
        <ol className="import-steps">
          <li>
            把這顆按鈕拖到瀏覽器書籤列：
            <a className="bookmarklet" href={bookmarklet} onClick={(e) => e.preventDefault()}>
              ⚡ 帶去 BeyBuilder
            </a>
            <button
              type="button"
              className="filter-chip"
              onClick={() => navigator.clipboard.writeText(bookmarklet).then(() => setMessage('已複製書籤小工具連結，可貼到書籤網址欄'))}
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
        <p className="import-alt">
          或手動匯入：在 phstudy 頁按 F12 開 Console，執行
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
        {message && (
          <p className="import-result" role="status">
            {message}
          </p>
        )}
      </div>
    </details>
  )
}
