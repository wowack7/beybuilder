# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BeyBuilder X — Beyblade X 配裝模擬器（Vite + React 19 + TypeScript）。使用者登錄擁有的陀螺產品/零件（localStorage），app 在官方 3on3 deck 規則（同一 deck 內 Blade / Ratchet / Bit 不得重複）下算出總分最高的三顆出戰組合，另提供天梯階級與實戰組合排行瀏覽。

## Commands

- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — `tsc -b` type-check + production build
- `npm test` — Vitest run once（單一測試檔：`vitest run src/lib/recommend.test.ts`；watch 用 `npm run test:watch`）
- `npm run lint` — oxlint
- `npm run data:update` — 重新抓取兩個資料來源並重新生成 `src/data/*.json`（需網路、Node ≥ 23.6：轉換邏輯在 `src/lib/transform.ts`，靠 Node 原生 TS import 與前端共用）。每週一 09:05 有 Claude 排程任務 `beybuilder-weekly-data-update` 自動跑；app header 另有「更新資料」鈕從瀏覽器直抓 Google Sheets（快取於 localStorage，與內建資料比時間戳新者勝）。坑點見 lessons.md

## Data pipeline（先懂這個再動資料相關程式）

`scripts/fetch-data.mjs` 從兩個外部來源抓取並正規化，產出三個被前端直接 import 的 JSON：

1. **stan-yao 天梯站**（Google Sheets CSV）→ 產品清單＋blade/ratchet/bit 階級（`products.json`、`parts.json`）、實戰組合統計 recommendation_score（`combos.json`，~2800 筆）
2. **beyblade.phstudy.org**（`data/main.json`）→ 零件數值 attack/defense/stamina/burst/dash，以 zh-TW 名稱/ID 比對回填到 `parts.json`（比對不到就沒有 `stats`，屬正常）

要點：

- 階級尺度為 `X > S+ > S > A+ > … > E`（X 最高）；順序定義在 `scripts/fetch-data.mjs` 與 `src/lib/score.ts` 兩處的 `TIER_ORDER`/`TIER_VALUE`，改動需同步
- 產品（`Product`）＝一件商品：blade 名稱＋原裝 ratchet＋原裝 bit；blade 以「名稱」為身分聚合，變體（顏色/特別版）無階級時從同家族基底名繼承（`tierInherited: true`）
- **blade 家族鍵**（重塗/特別版視為同零件；(左)/(右)、(…型) 保留為不同零件）定義在 `src/lib/family.ts`，`scripts/fetch-data.mjs` 的 `baseName()` 是同規則的複本——改其中一邊必須同步另一邊。實戰組合匹配、deck 衝突判定、天梯「可組」判定都走家族鍵
- **CX 是五層結構**（鎖片＋主刃＋輔助刃＋固鎖＋軸心）：stan-yao 以「整刃」評級與記錄實戰組合，故 blade 仍是評分單位；輔助刃是正式零件（`parts.json.assists`，單字母 id），站方組合可指定輔助刃（沒擁有就不可組），實戰組合帶入產品原裝輔助刃。鎖片/主刃名稱由 phstudy 反查（`products.json.lockChip/mainBlade`，僅顯示與重複判定用）。deck 衝突判定含輔助刃/鎖片/主刃同名（未抗辯假設：官方「同零件不重複」的延伸解讀）
- CSV 欄名是中文帶英文括號（如 `型號 (ID)`），來源表頭有一欄拼寫缺右括號（`原裝輔助戰刃 (Assist Blade`），程式兩種都接

## Architecture

- `src/lib/recommend.ts` — 純函式推薦引擎：`resolveOwnedParts`（庫存→零件集合）→ `buildCandidates`（已知實戰組合 meta ＋自組 synth，裁剪 per-blade/全域上限）→ `pickBestDeck`（排序後 O(K²) 上界剪枝搜尋**全域最佳**互不衝突三顆——不是貪婪法，這是測試明確保護的行為）。引擎不 import JSON，資料一律由參數注入，測試用合成 fixture
- **候選組合只有兩個來源，絕不自由重組零件**（用戶明確要求）：①實戰組合（combos.json，賽事統計）②站方推薦（site_combos.json，解析天梯站「建議配置」欄，解析器在 fetch-data.mjs 的 `parseSiteCombos`）。同組合兩來源並存時取實戰版。測試保護於 recommend.test.ts「only complete known combos」「site-recommended combos」
- `src/lib/score.ts` — 所有評分權重常數集中於此，檔頭標明「未抗辯假設」：權重是自訂近似值，調整只改這檔
- `src/lib/data.ts` — 唯一 import `src/data/*.json` 的模組，提供型別化資料與 Map 索引
- `src/hooks/useInventory.ts` — 庫存狀態＋localStorage 持久化（key: `beybuilder.inventory.v1`）
- `src/components/{deck,inventory,tier}/` — 三個分頁，各自帶同目錄 css；共用小元件在 `components/ui/`
- 設計 tokens 在 `src/styles/tokens.css`（深色競技場風、螢光綠 accent），元件一律用 CSS 變數不硬編色碼

## Constraints

- Deck 規則「三顆內零件名稱不重複」是產品核心邏輯，動 `pickBestDeck` 前先跑 `npm test`（12 個測試涵蓋貪婪陷阱、去重、缺件降級）
- `src/data/*.json` 是生成物，不要手改；資料過期就跑 `npm run data:update`
- 零件/組合資料轉錄自上述兩站，footer 有出處聲明，新增資料來源時保持 attribution
