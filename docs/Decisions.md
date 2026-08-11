# Decisions

> 已拍板／已否決的產品與架構判決。提出新方案前先 grep 本檔；命中 Rejected 條目時檢查「重啟條件」是否已滿足。
> 純技術坑點記 [lessons.md](../lessons.md)，不記這裡。

## [2026-08-11] 每週資料更新後由 data-update.yml 明確派工 deploy

- 狀態：Confirmed
- 判決：`data-update.yml` 在資料真的 push 後執行 `gh workflow run deploy.yml --ref main`（選項 A）。否決：合併成單一 workflow（B）、改用 PAT/deploy key 讓 push 事件生效（C）、deploy.yml 自帶 schedule（D）。
- 原因與證據：GITHUB_TOKEN 發出的 push 不觸發其他 workflow，導致 7/27、8/03、8/10 三個資料 commit 皆未部署，線上資料自 2026-07-20 停更三週（curl /tier/ 實測）。A 改動最小且不引入新密鑰（workflow_dispatch 是防迴圈例外）。實跑驗證：run 31517263477 → commit 8484661 → workflow_dispatch deploy run success → 線上更新至 2026-08-11。
- 適用範圍：本 repo CI 中「由 GITHUB_TOKEN 產生 commit 再需觸發後續 workflow」的情境；不適用人工 push（本來就會正常觸發）。
- 重啟條件：GitHub 改變防迴圈規則使 GITHUB_TOKEN push 可觸發 workflow；或改用 PAT/App token 推送；或部署改由 data-update 同一 job 內完成。
- 相關：`.github/workflows/data-update.yml`、`.github/workflows/deploy.yml`、[lessons.md](../lessons.md) L1／L10
