# Lessons

> 開工前先 grep 本檔；踩到新坑就補一張卡（ops-discipline: Lessons Log）。

## L1 排程更新資料——雙軌機制與驗活（2026-07-06 部署後改版）

- tags: schedule, data-update, mechanism, ci
- 機制（部署 GitHub Pages 後）：
  - **正式源頭：GitHub Actions** `data-update.yml` 每週一 01:00 UTC（台北 09:00）在雲端跑 `data:update`＋test＋build，資料有變才 commit → 自動觸發重新部署。不依賴本機。
  - **本機 Claude 排程** `beybuilder-weekly-data-update` 已改職責為「git pull 同步 CI 的資料 commit」，避免本機與 CI 雙頭改 `src/data/` 造成分歧。
- **待驗**：CI cron 首次真實執行（2026-07-13 後）。驗活指令：
  ```
  gh run list --workflow=data-update.yml --limit 3   # 應出現 schedule 觸發的 run
  ```
  （deploy.yml 已由真實 push 驗活 ✅ 2026-07-06；data-update 的 workflow_dispatch 手動觸發可提前驗）。驗過請把本行改成「已驗」。

## L2 排程/新 shell 的 node 是系統 16 版（2026-07-06）

- tags: node, nvm, environment
- 坑：用戶 shell 的 nvm 預設 alias 是 system（/usr/local/bin/node = 16.13.2），Vite 8／fetch-data（global fetch）都跑不動；報錯樣貌是 `CustomEvent is not defined` 或 Vite 版本警告。
- 解：任何自動化跑 npm 前先 `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use`（.nvmrc=24）。排程任務 prompt 已內建此步驟。

## L3 Vite dev server watcher 會漂移（2026-07-06，hit×4）

- tags: vite, dev-server, hmr
- 坑：改檔後 Vite 持續 serve 舊模組（HMR 與強制 reload 都拿到舊 code），單日已發生 4 次（InventoryPage、輔助刃 UI、App.tsx hash 匯入…）；容易誤判成「改動沒生效」而白改半天。
- 解：先驗證 `fetch('/src/<改過的檔>')` 內容是否含新字串；不含 → 重啟 dev server（preview_stop/start），不要改 code 重試。

## L4 資料雙軌更新的優先序（2026-07-06）

- tags: data, cache
- 機制：內建資料（`npm run data:update` 生成，含 phstudy 慢資料）vs 瀏覽器「更新資料」快取（僅 Google Sheets 競技資料，localStorage `beybuilder.datacache.v1`）——載入時比時間戳新者勝（`shouldUseCache`，有測試）。
- 注意：phstudy 無 CORS，瀏覽器路徑永遠拿不到零件數值/CX 拆名更新——那些只能靠每週排程。若 Google 改 gviz CORS 政策，按鈕會失效但排程不受影響。
