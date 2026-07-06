import { useRef, useState, type ChangeEvent } from 'react'
import { buildBookmarklet } from '../../lib/importPh'
import type { Inventory } from '../../types'
import { performPhImport } from './importFlow'
import './import.css'

interface ImportPhBodyProps {
  onMerge: (add: Inventory) => void
}

/** phstudy 匯入引導本體（首頁 onboarding 與匯入彈窗共用） */
export function ImportPhBody({ onMerge }: ImportPhBodyProps) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const siteUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href
  const bookmarklet = buildBookmarklet(siteUrl)

  const runImport = (raw: string) => {
    try {
      setMessage(performPhImport(raw, onMerge))
    } catch (error: unknown) {
      setMessage(`匯入失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允許重選同一檔
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => runImport(String(reader.result))
    reader.onerror = () => setMessage('讀取檔案失敗，請再試一次')
    reader.readAsText(file)
  }

  const handlePaste = () => {
    runImport(text.trim())
    setText('')
  }

  return (
    <div className="import-body">
      {/* 主要方式：檔案匯入（手機／電腦通用） */}
      <section className="import-method import-method-primary">
        <h4>
          用 phstudy 匯出的檔案<span className="import-tag">手機也適用</span>
        </h4>
        <ol className="import-steps">
          <li>
            在{' '}
            <a href="https://beyblade.phstudy.org/inventory.html" target="_blank" rel="noreferrer">
              phstudy 零件倉庫頁
            </a>{' '}
            點「下載」（倉庫操作區，⬇︎ 圖示），會存下一個 <code>.json</code> 檔。
          </li>
          <li>回這裡選擇剛下載的檔案，就會自動匯入（資料只在你的瀏覽器內轉換，不會上傳）。</li>
        </ol>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="import-file-input"
          onChange={handleFile}
        />
        <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          選擇 phstudy 檔案
        </button>
      </section>

      {/* 次要方式：書籤小工具（電腦一鍵） */}
      <details className="import-method">
        <summary>用書籤小工具（電腦一鍵跳轉）</summary>
        <ol className="import-steps">
          <li>
            <button
              type="button"
              className="bookmarklet-copy"
              onClick={() =>
                navigator.clipboard
                  .writeText(bookmarklet)
                  .then(() => setMessage('已複製！到書籤列右鍵 →「新增網頁…」，網址欄貼上即可'))
                  .catch(() => setMessage('複製失敗，請改用檔案匯入'))
              }
            >
              複製小工具連結
            </button>
            ，在書籤列右鍵 →「新增網頁…」，網址欄貼上。
            <span className="import-note">
              （Firefox 可直接把
              <a className="bookmarklet" href={bookmarklet} onClick={(e) => e.preventDefault()}>
                帶去 BeyBuilder
              </a>
              拖到書籤列；Chrome 拖拉會被擋，請用複製）
            </span>
          </li>
          <li>開啟 phstudy 倉庫頁，點一下那個書籤——會自動跳回本站完成匯入。</li>
        </ol>
      </details>

      {/* 備用：手動貼上 JSON */}
      <details className="import-method">
        <summary>手動貼上 JSON</summary>
        <p className="import-alt">貼上 phstudy 匯出檔的內容，或倉庫的原始 JSON：</p>
        <textarea
          className="import-textarea"
          rows={3}
          placeholder='{"parts":[{"partId":"BL-PRD-…"}]}'
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="phstudy 倉庫 JSON"
        />
        <button type="button" className="btn-refresh" disabled={!text.trim()} onClick={handlePaste}>
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
