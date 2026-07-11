/**
 * 站台位址的單一來源。
 *
 * 換 repo 名稱或改用自訂網域時，改這裡之後**還必須**同步兩個無法 import 此檔的地方：
 *   1. index.html —— canonical / og:* / twitter:* / JSON-LD 的絕對 URL
 *   2. vite.config.ts —— base
 * src/lib/site.test.ts 會實際讀這兩個檔比對，漏改一處就會測試失敗（不靠人記得）。
 *
 * 為什麼 index.html 不能用相對路徑：Vite 只改寫 <link href>/<script src> 這類屬性，
 * 不會替 <meta content="/og.png"> 補上 base，爬蟲與社群平台會解析錯。
 */

/** 正式站根位址，結尾必須有斜線 */
export const SITE_URL = 'https://beybuilder.5-seven.dog/'

/** 部署路徑（= vite.config.ts 的 base）。站台在子網域根，故為 '/' */
export const BASE_PATH = '/'

/** 靜態天梯總表（由 scripts/gen-seo.mjs 於 build 後產出） */
export const TIER_PATH = 'tier/'

/** 社群分享縮圖（public/og.png，由 scripts/gen-og.mjs 產出） */
export const OG_IMAGE_URL = `${SITE_URL}og.png`
