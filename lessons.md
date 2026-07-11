# Lessons

> 開工前先 grep 本檔；踩到新坑就補一張卡（ops-discipline: Lessons Log）。

## L1 排程更新資料——雙軌機制與驗活（2026-07-06 部署後改版）

- tags: schedule, data-update, mechanism, ci
- 機制（部署 GitHub Pages 後）：
  - **正式源頭：GitHub Actions** `data-update.yml` 每週一 01:00 UTC（台北 09:00）在雲端跑 `data:update`＋test＋build，資料有變才 commit → 自動觸發重新部署。不依賴本機。
  - **本機 Claude 排程** `beybuilder-weekly-data-update` 已改職責為「git pull 同步 CI 的資料 commit」，避免本機與 CI 雙頭改 `src/data/` 造成分歧。
- 已驗：deploy.yml 由真實 push 驗活 ✅；data-update.yml 由 workflow_dispatch 等效觸發驗活 ✅（run 28776064225，success，2026-07-06）——workflow 本體在真實 CI 環境可跑。
- **待驗**：cron 觸發本身（2026-07-13 後）。驗活指令：
  ```
  gh run list --workflow=data-update.yml --limit 3   # 應出現 event=schedule 的 run
  ```
  驗過請把本行改成「已驗」。

## L2 排程/新 shell 的 node 是系統 16 版（2026-07-06）

- tags: node, nvm, environment
- 坑：用戶 shell 的 nvm 預設 alias 是 system（/usr/local/bin/node = 16.13.2），Vite 8／fetch-data（global fetch）都跑不動；報錯樣貌是 `CustomEvent is not defined` 或 Vite 版本警告。
- 解：任何自動化跑 npm 前先 `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use`（.nvmrc=24）。排程任務 prompt 已內建此步驟。

## L3 Vite dev server watcher 會漂移（2026-07-06，hit×4）

- tags: vite, dev-server, hmr
- 坑：改檔後 Vite 持續 serve 舊模組（HMR 與強制 reload 都拿到舊 code），單日已發生 4 次（InventoryPage、輔助刃 UI、App.tsx hash 匯入…）；容易誤判成「改動沒生效」而白改半天。
- 解：先驗證 `fetch('/src/<改過的檔>')` 內容是否含新字串；不含 → 重啟 dev server（preview_stop/start），不要改 code 重試。

## L4 資料更新只走 data:update（2026-07-06 更新：移除瀏覽器端更新）

- tags: data, cache
- 原設計曾有瀏覽器「更新資料」鈕＋localStorage 快取（新者勝）；因公開站會變成每個訪客各自觸發外部請求，用戶決策移除該鈕與整套快取機制（refreshData / shouldUseCache / bakedEnrichment / datacache.v1 皆已刪）。
- 現況：前端一律用內建 `src/data/*.json`；更新只靠 `npm run data:update`（本機）與每週 GitHub Actions。phstudy 無 CORS，本來瀏覽器路徑也拿不到零件數值/CX 拆名，移除後無損失。

## L5 git push 大包被遠端掛斷（2026-07-06）

- tags: git, push, https
- 坑：本機 git 2.31 走 https 推含 298 張圖（~4MB）的 commit，報「遠端意外掛斷了」且後續 `git push` 誤顯示 Everything up-to-date——實際 commit 沒推出去（`git status -sb` 顯示領先 1）。
- 解：`git config http.postBuffer 157286400` 後重推即成功。推完務必 `git status -sb` 確認不再領先。

## L6 hover 彈出層被 overflow:hidden 裁掉；DOM 存在 ≠ 視覺正確（2026-07-06）

- tags: css, hover, verification, overflow
- 坑：`.bey-card` 與 `.alt-group` 都有 `overflow: hidden`，`position:absolute` 的 hover 彈出圖會被裁掉、實際看不到。第一版只驗「DOM 有 .hover-thumb 元素＋img 有 src」就宣稱完成——漏了真正 hover 的視覺，被用戶抓包。
- 解：彈出層改 `position: fixed`＋JS 用 `getBoundingClientRect` 給座標（fixed 不受祖先 overflow:hidden 裁切，前提是祖先無 transform/filter/contain）。
- 驗證教訓：hover/tooltip/彈窗這類「視覺行為」不能只查 DOM 存在，要**實際觸發 hover（派 mouseover 事件）並截圖**確認沒被裁、位置對。

## L7 GA4 gtag：dataLayer 要 push arguments 物件、不能 push 陣列（2026-07-07）

- tags: ga, analytics, gtag, verification
- 坑：analytics.ts 當初寫 `const gtag=(...a)=>dataLayer.push(a)`——push 的是**陣列**。gtag.js 只把 **arguments 物件**當指令處理，陣列被忽略 → `config` 從未生效 → GA 完全不送資料、不設 `_ga` cookie。表面上 gtag.js 有載入（200）、`google_tag_data` 也在，很容易誤判成「裝好了」。
- 解：照官方 snippet `window.gtag=function gtag(){window.dataLayer.push(arguments)}`（用具名 function＋`arguments`，非箭頭函式）。

## L8 Vite 不改寫 `<meta content>` 與 `<a href>` 的 base（2026-07-10）

- tags: vite, base, seo, github-pages
- 坑：`base: '/beybuilder/'` 只作用在 `<link href>`／`<script src>`／`<img src>` 這類已知屬性。`<meta property="og:image" content="/og.png">` 與 `<a href="/tier/">` **不會**被補上 base，部署後解析到網域根 → og 縮圖 404、內鏈 404。
- 解：SEO 相關的絕對位址（canonical、og:*、twitter:*、JSON-LD、骨架內鏈）一律寫完整 URL，來源集中在 `src/lib/site.ts`，並用 `site.test.ts` 讀 `index.html` 比對，漏改就紅燈。
- 附帶坑：`vite preview` 的 `command` 也是 `'serve'`，只判 `command === 'build'` 會讓 preview 用 base `/` 起站——`/beybuilder/` 走 SPA fallback 回 200 的 HTML、但 assets 404，看起來「頁面開得起來卻整個壞掉」。要判 `isPreview`。
- 更新（2026-07-11 換子網域 `beybuilder.5-seven.dog`）：base 改回 `/`，isPreview 分支已移除、此附帶坑不再適用；但「絕對 URL」與「Vite 不改寫 `<meta content>`」兩條仍成立。換域一律改 `src/lib/site.ts` 的 `SITE_URL`，`site.test.ts` 守 index.html/vite.config.ts 同步。

## L9 驗收要對「乾淨重建」跑，否則 stale dist 會假裝通過（2026-07-10）

- tags: verification, build, tsc, dist
- 坑：`npm run build` 是 `tsc -b && vite build && ...`；新增的測試檔 import `node:fs` 但 `tsconfig.app.json` 的 `types` 沒有 `node`，`tsc -b` 直接失敗 → 後面兩步沒跑。但 `dist/` 還留著上一次的產物，curl 驗收全部「通過」（讀到的是舊檔），只有 og.png 大小與已刪除的 robots.txt 露出破綻。
- 解：驗收前 `rm -rf dist node_modules/.tmp` 再 build，並檢查 build 的 exit code，不能只看最後幾行 log。
- 解2：`tsconfig.app.json` 加 `"types": ["vite/client", "node"]`（`@types/node` 本來就是 devDep）。
- 驗證教訓：GA「裝好」的證據不是 gtag.js 載入，而是 **`_ga` cookie 被設定**（純前端寫入、擋廣告也擋不掉）或 GA 即時報表有數。本次就是靠 `/(^|;)\s*_ga/.test(document.cookie)` 在正式站確認。標準報表另有 24–48h 延遲，只有「即時」是即時的。
