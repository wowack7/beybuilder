# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BeyBuilder X — Beyblade X 配裝模擬器（Vite + React 19 + TypeScript）。使用者登錄擁有的陀螺產品/零件（localStorage），app 在官方 3on3 deck 規則（同一 deck 內 Blade / Ratchet / Bit 不得重複）下算出總分最高的三顆出戰組合，另提供天梯階級與實戰組合排行瀏覽。

## Commands

- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — `tsc -b` type-check + production build
- `npm test` — Vitest run once（單一測試檔：`vitest run src/lib/recommend.test.ts`；watch 用 `npm run test:watch`）
- `npm run lint` — oxlint
- `npm run data:update` — 重新抓取兩個資料來源並重新生成 `src/data/*.json`（需網路、Node ≥ 23.6：轉換邏輯在 `src/lib/transform.ts`，靠 Node 原生 TS import 與前端共用）。資料更新只走此路徑（本機 + 每週 GitHub Actions），**前端一律用內建資料、不在瀏覽器端抓取**（用戶決策 2026-07-06：公開站避免每個訪客各自觸發外部請求；原「更新資料」鈕與 localStorage 快取機制已移除）。坑點見 lessons.md

## Deploy（GitHub Pages）

- 正式站：https://wowack7.github.io/beybuilder/ （repo `wowack7/beybuilder`，public）
- push main → `.github/workflows/deploy.yml` 自動 test+build+部署；`data-update.yml` 每週一 01:00 UTC 雲端更新資料並 commit（資料自動更新的正式源頭——本機 Claude 排程只負責 git pull 同步）
- `vite.config.ts` base：build 時為 `/beybuilder/`、dev 維持 `/`
- **phstudy 匯入**：`src/lib/importPh.ts`＋映射表 `src/data/ph_map.json`（data:update 生成，含 hardcoded.json 聯名套組）。三種方式（`ImportPhBody`，全程瀏覽器端解析不上傳）：①**檔案匯入**（主要、手機也適用）——phstudy「下載」匯出 `{parts:[...]}` JSON 檔，本站選檔即解析；②書籤小工具跳轉 `#phimport=<base64>`（電腦一鍵）；③手動貼 JSON。三者最後都進 `parsePhInventory`（吃 partId，忽略其他欄位）
- **GA4 分析**：`src/lib/analytics.ts`（gtag.js，只做頁面瀏覽），`main.tsx` 開頭呼叫 `initAnalytics()`。僅 `import.meta.env.PROD` 才載入——本機 dev 不追蹤。Measurement ID `G-NNJPTBMXKW` 硬編於該檔（公開值）

## Data pipeline（先懂這個再動資料相關程式）

`scripts/fetch-data.mjs` 從兩個外部來源抓取並正規化，產出三個被前端直接 import 的 JSON：

1. **stan-yao 天梯站**（Google Sheets CSV）→ 產品清單＋blade/ratchet/bit 階級（`products.json`、`parts.json`）、實戰組合統計 recommendation_score（`combos.json`，~2800 筆）
2. **beyblade.phstudy.org**（`data/main.json`）→ 零件數值 attack/defense/stamina/burst/dash，以 zh-TW 名稱/ID 比對回填到 `parts.json`（比對不到就沒有 `stats`，屬正常）

要點：

- 階級尺度為 `X > S+ > S > A+ > … > E`（X 最高）；順序定義在 `scripts/fetch-data.mjs` 與 `src/lib/score.ts` 兩處的 `TIER_ORDER`/`TIER_VALUE`，改動需同步
- 產品（`Product`）＝一件商品：blade 名稱＋原裝 ratchet＋原裝 bit；blade 以「名稱」為身分聚合，變體（顏色/特別版）無階級時從同家族基底名繼承（`tierInherited: true`）
- **blade 家族鍵**（重塗/特別版視為同零件；(左)/(右)、(…型) 保留為不同零件）定義在 `src/lib/family.ts`，`scripts/fetch-data.mjs` 的 `baseName()` 是同規則的複本——改其中一邊必須同步另一邊。實戰組合匹配、deck 衝突判定、天梯「可組」判定都走家族鍵
- **CX 是五層結構**（紋章〔顯示名，內部欄位 lockChip〕＋主刃＋輔助刃＋固鎖＋軸心）：stan-yao 以「整刃」評級與記錄實戰組合，故 blade 仍是評分單位；輔助刃是正式零件（`parts.json.assists`，單字母 id），站方組合可指定輔助刃（沒擁有就不可組），實戰組合帶入產品原裝輔助刃。鎖片/主刃名稱由 phstudy 反查（`products.json.lockChip/mainBlade`，僅顯示與重複判定用）。deck 衝突判定含輔助刃/鎖片/主刃同名（未抗辯假設：官方「同零件不重複」的延伸解讀）。**紋章/主刃真零件圖**：phstudy `images/app/{LockChip,MainBlade}/<id>.png`（無 CORS→`fetch-images.mjs` 自架），名稱→URL 由 `transform.ts` 的 `buildCxPartImages` 產出 `cx_part_img.json`，前端 `data.ts` 的 `cxPartImg` 僅收錄已自架者（值為同源本地路徑，分享卡 canvas 不污染）；自訂混搭（湊不出具名整刃）時 build slot 與分享卡並排顯示這兩張真零件圖
- CSV 欄名是中文帶英文括號（如 `型號 (ID)`），來源表頭有一欄拼寫缺右括號（`原裝輔助戰刃 (Assist Blade`），程式兩種都接

## Architecture

- `src/lib/recommend.ts` — 純函式推薦引擎：`resolveOwnedParts`（庫存→零件集合）→ `buildCandidates`（已知實戰組合 meta ＋自組 synth，裁剪 per-blade/全域上限）→ `pickBestDeck`（排序後 O(K²) 上界剪枝搜尋**全域最佳**互不衝突三顆——不是貪婪法，這是測試明確保護的行為）。引擎不 import JSON，資料一律由參數注入，測試用合成 fixture
- **候選組合只有兩個來源，絕不自由重組零件**（用戶明確要求）：①實戰組合（combos.json，賽事統計）②站方推薦（site_combos.json，解析天梯站「建議配置」欄，解析器在 fetch-data.mjs 的 `parseSiteCombos`）。同組合兩來源並存時取實戰版。測試保護於 recommend.test.ts「only complete known combos」「site-recommended combos」
- `src/lib/score.ts` — 所有評分權重常數集中於此，檔頭標明「未抗辯假設」：權重是自訂近似值，調整只改這檔。**分數僅供引擎內部排序，UI 與分享圖一律不顯示數字**（用戶決策 2026-07-06：實戰關乎技術、來源站非官方，只展示勝場/奪冠率/階級等真實資料）
- `src/lib/data.ts` — 唯一 import `src/data/*.json` 的模組，提供型別化資料與 Map 索引
- `src/hooks/useInventory.ts` — 庫存狀態＋localStorage 持久化（key: `beybuilder.inventory.v1`）
- `src/components/{deck,build,inventory,tier}/` — 四個分頁，各自帶同目錄 css；共用小元件在 `components/ui/`。deck＝天梯自動算最強三顆；**build＝自組隊伍**（`BuildPage`：從庫存手動下拉配三顆，命中實戰組合顯示真實數據；自組狀態存 `beybuilder.customdeck.v1`（含 lockChip/mainBlade），`useCustomDeck` hook 提供 `patchSlot`。**CX 五層可拆混**：紋章/主刃/輔助刃各自獨立下拉，(紋章|主刃) 對得到具名整刃就用該名（優先基底、非特別版）、否則為自訂混搭；去重以「實體零件」計——CX 看紋章/主刃/輔助刃/固鎖/軸心、非 CX 看戰刃家族鍵。自組允許自由重組，與引擎的「只用已知組合」互補）
- 設計 tokens 在 `src/styles/tokens.css`（深色競技場風、螢光綠 accent），元件一律用 CSS 變數不硬編色碼

## Constraints

- Deck 規則「三顆內零件名稱不重複」是產品核心邏輯，動 `pickBestDeck` 前先跑 `npm test`（12 個測試涵蓋貪婪陷阱、去重、缺件降級）
- `src/data/*.json` 是生成物，不要手改；資料過期就跑 `npm run data:update`
- 零件/組合資料轉錄自上述兩站，footer 有出處聲明，新增資料來源時保持 attribution
