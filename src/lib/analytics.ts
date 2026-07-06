/**
 * Google Analytics 4（gtag.js）。
 * 僅正式 build 產物載入——本機 dev 不追蹤，避免污染資料。
 * 只做 GA 預設的頁面瀏覽（page_view），不加自訂事件。
 * Measurement ID 為公開值（本就會出現在前端 bundle），硬編即可。
 */

// GA4 Measurement ID（GA 管理 → 資料串流 → 網站串流；形如 G-XXXXXXXXXX）。
// 留空 = 不啟用 GA。
const GA_ID = 'G-NNJPTBMXKW'

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

export function initAnalytics(): void {
  // 只在正式站執行；ID 未設定時不載入
  if (!import.meta.env.PROD || !GA_ID) return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer ?? []
  const gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args)
  }
  gtag('js', new Date())
  gtag('config', GA_ID)
}
