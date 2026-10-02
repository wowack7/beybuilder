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

## [2026-10-02] /draw/ 👾 Agent 模式：單品項畫面＋返回即自動下一項

- 狀態：Confirmed（介面與流程）／Under Validation（LINE 返回訊號）
- 判決：依用戶《👾 Agent 模式修改需求書 v2.0》與《朋友使用提示詞與網站教學》，在 `/draw/` 加 👾 開關：一次只顯示一個品項、抽籤鈕位置固定，從官方抽獎頁返回就自動換下一項，正常流程不需「確認／下一項」。取代先前「多個固定操作按鈕」為主要介面的方案。上一項／重試本項收在 ⋯ 次要選單。
- 原因與證據：AI 透過 iPhone 鏡像以座標點擊，一般清單會位移（已抽收合、捲動、分組），技能包記錄過多次誤點目錄叉叉。單品項＋固定位置讓每輪面對同一版面。實作驗收見 `npm run draw:agent-check`（需求書驗收 1–10＋疊層模擬＋慢速重整，30 項）。
- 適用範圍：`public/draw/index.html` 的 Agent 模式；一般清單行為不變。
- 重啟條件：LINE 實機確認返回訊號不可用（例如關 LIFF 時沒有任何 hidden/blur/visible/focus/pageshow），或誤推進率高到上一項復原不敷使用——屆時改回「回目錄後手動下一項」或另找訊號。
- 未決（Under Validation）：LINE 關閉官方頁時實際發出的事件尚未實機測；⋯ →「返回訊號紀錄」可收集。已知無法區分「關官方頁回來」與「點完抽籤後切別的 App 再回來」。
- 實機進展（2026-10-03）：iPhone LINE＋鏡像輸出上，關閉官方頁回到目錄會自動換下一項、只換一次（`draw_agent_loop.py` 連續 4 次觀察到進度 15→16→17→18→19）。是哪個事件觸發的還沒看「返回訊號紀錄」確認；「切別的 App 再回來」的誤推進仍未測。
- 「解除封鎖並參加抽獎」（使用者封鎖過該店官方帳號）：使用者 2026-10-03 決定**一律解除並參加**，與「加入好友並參加抽獎」同樣直接按。
- 相關：`CLAUDE.md`「👾 Agent 模式」段、[lessons.md](../lessons.md) L15、`scripts/draw-agent-check.mjs`
