# Lessons

> 開工前先 grep 本檔；踩到新坑就補一張卡（ops-discipline: Lessons Log）。

## L1 排程更新資料——雙軌機制與驗活（2026-07-06 部署後改版）

- tags: schedule, data-update, mechanism, ci
- 機制（部署 GitHub Pages 後）：
  - **正式源頭：GitHub Actions** `data-update.yml` 每週一 01:00 UTC（台北 09:00）在雲端跑 `data:update`＋test＋build，資料有變才 commit → **再明確 `gh workflow run deploy.yml` 派工部署**（不會自動觸發，原因見 L10）。不依賴本機。
  - **本機 Claude 排程** `beybuilder-weekly-data-update` 已改職責為「git pull 同步 CI 的資料 commit」，避免本機與 CI 雙頭改 `src/data/` 造成分歧。
- 已驗：deploy.yml 由真實 push 驗活 ✅；data-update.yml 由 workflow_dispatch 等效觸發驗活 ✅（run 28776064225，success，2026-07-06）——workflow 本體在真實 CI 環境可跑。
- 已驗：cron 觸發本身 ✅（2026-08-10 查核：7/13、7/20、7/27、8/03、8/10 五次皆 `event=schedule` 且 success）。驗活指令：
  ```
  gh run list --workflow=data-update.yml --limit 3   # 應出現 event=schedule 的 run
  ```
- 注意：本卡原寫「commit → 自動觸發重新部署」是**錯的**，害線上資料停更三週未被發現（2026-08-11 修正，見 L10）。

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

## L10 GITHUB_TOKEN 發出的 push 不會觸發其他 workflow（2026-08-11）

- tags: ci, github-actions, deploy, mechanism
- 坑：`data-update.yml` 用 checkout 預設的 `GITHUB_TOKEN` 做 `git push`，GitHub 為防迴圈**不讓這種 push 產生新的 workflow run**，所以 `deploy.yml`（`on: push`）從沒被資料 commit 觸發過。7/27、8/03、8/10 三次資料更新全綠、commit 也確實進了 repo，但線上站台一直停在最後一次**人工** push（7/26）當下的資料日期 **7/20**，停更三週無人察覺。
- 症狀樣貌：workflow 全部 success、repo 有新 commit、線上就是舊的。只看 `gh run list --workflow=data-update.yml` 永遠是綠的，看不出問題。
- 解：在 push 之後明確派工——`gh workflow run deploy.yml --ref main`（需 `permissions: actions: write` 與 `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`）。**`workflow_dispatch` 與 `repository_dispatch` 是防迴圈機制的明文例外**，可用 GITHUB_TOKEN 觸發，故不必引入 PAT。判決見 docs/Decisions.md [2026-08-11]。
- 驗活指令（真正該看的是「線上產物」，不是 workflow 綠燈）：
  ```
  curl -s https://beybuilder.5-seven.dog/tier/ | grep -o '資料更新於 [0-9-]*'   # 應接近今天
  gh run list --workflow=deploy.yml --limit 3   # 資料更新後應出現 event=workflow_dispatch 的 run
  ```
- 已驗 ✅：run 31517263477（data-update, workflow_dispatch）→ commit 8484661 → `Trigger deploy` 步驟 success（非 skipped）→ deploy run（`event=workflow_dispatch`, sha 8484661）success → 線上顯示 2026-08-11。
- 通則（ops-discipline「Living Proof」的實例）：**機制的驗活證據必須是真實產物**（線上頁面的日期、檔案 mtime、送達的通知），不能是「workflow 綠燈」。這次綠燈連續騙了三週。

## L11 來源資料的「型號」不是唯一鍵——聯名/變體共用型號（2026-08-12）

- tags: data, identity, dedupe, inventory
- 坑：products.json 有四組型號各對應兩件不同商品（BX-00-02 丘巴卡/風暴兵、BX-00-03 紅浩克/美國隊長、BX-00-04 終極蜘蛛人/綠惡魔、BXG-39 飛龍懸浮兩變體）。庫存以 `p.id` 判斷擁有 → 擁有其一整對都被視為已擁有，「只看已擁有」多出四顆沒擁有的；且 `new Map(products.map(p => [p.id, p]))` 索引被最後一筆靜默覆寫，引擎實際採計的零件可能不是使用者選的那件（React key 重複同理）。
- 解：id 唯一化為「型號::名稱」，邏輯單一來源在 transform.ts 的 `dedupeProductIds`——`transformAll` 產資料時套用，`data.ts` 載入時再套一次（護住尚未重生的舊資料檔，管線重生後為 no-op）。顯示用 `productModel()` 剝後綴；舊 localStorage 與舊 ph_map 的裸型號鍵由 `legacyProductIdMap` 遷移到「最後一筆」（＝沿用舊 Map 覆寫行為，既有使用者牌組不悄悄改變）；`buildPhMap` 改以 phstudy 標題含名稱消歧、消歧不到不猜。`data.test.ts` 鎖住出貨資料 id 必唯一。
- 通則：**拿來當儲存鍵／Map 鍵／React key 的欄位，先驗唯一性**（加 dataset sanity test），別信任來源資料「編號」的唯一性語意。重複鍵的症狀很隱晦：不報錯，只會「多出/少掉幾筆」或「查到別筆資料」。

## L12 「上游沒給就寫空白」會讓資料靜默掉出畫面（2026-08-27）

- tags: data, sync, merge, invariant, draw
- 坑：`draw:sync` 合併時 `const mark = roundMark(up.periods) ?? ''`——上游那次只在**部分**店家標了抽選日期，於是 16 家有品項的店被寫回沒有 `@日期`。頁面的批次判定 `statusOf()` 沒有 `rs` 就回 `null`，這些店**不屬於任何批次**：不進頂端彙總、也不進「進行中／已結束／尚未公布」任何一區。畫面因此只寫「1 家已公布新一批」（唯一那家是同批新加的），品項其實都還在清單裡，資料也沒真的少——只是彙總把它們全數漏掉。
- 症狀樣貌：sync 與 build 都全綠（build 只印一行「無抽選日期店家: 15」當資訊，沒人看），`data.js` 的 items 筆數不變，只有頁面上的「N 家」對不上。
- 解1（來源端）：後備順序 `上游本次的日期 → 正本既有的 @日期 → 這批其他店的日期（同一頁＝同一批）→ 正本原樣`，**絕不寫回空白**；沿用日期的店會列在 sync log 尾端。
- 解2（產出端）：`draw-build.mjs` 把「有品項卻沒 `@日期`／`@待公布`」升級成 **throw**，不再只是印個數字。這才是會擋下錯誤產物的那道關。
- 通則：**合併上游資料時，「上游這次沒給」≠「這個欄位該清空」**——尤其當該欄位是下游分組／篩選的鍵時，清空不會報錯，只會讓那筆資料從畫面上消失。凡是「缺這個欄位就不會被顯示」的欄位，都該在產出階段設成硬性不變式（fail build），而非 log 一行了事。

## L13 上游把評級搬到另一張表，舊欄留著變空殼（2026-07-27 起，8-27 才發現）

- tags: data, pipeline, invariant, silent-loss
- 坑：`parts.json` 的固鎖階級 36/36、軸心階級 52/54，在 **7/27 那次每週自動更新後變成 0/36、0/54**，之後五週每次更新都是 0。那週**程式沒動過**（`git log --since=7-18 --until=7-29 -- src/lib/transform.ts scripts/fetch-data.mjs` 是空的），所以是來源表（stan-yao 的 Google Sheet）把 `固鎖階級 (Ratchet Tier)`／`軸心階級 (Bit Tier)` 欄改名或清空了。
- 症狀樣貌：`data:update` 全綠、每週 commit 照進、部署照跑、`/tier/` 照樣產得出來——只是固鎖/軸心那兩區每一列都沒有階級。CSV 欄名查不到時 `r['欄名']` 回 `undefined`，`|| ''` 一接就成了合法的空字串，沒有任何一層會抱怨。
- 查因三步（每一步都靠不變式的錯誤訊息推進，沒有猜）：①訊息印出「含階級的欄名」→ 欄名根本沒改，排除改名；②訊息再加印「每欄出現在第幾欄、非空幾列」→ `固鎖階級` 在第 7 欄、非空 **0/345**，且沒有同名欄位打架，排除解析錯位；③把兩張表的所有欄位都 dump 出來 → **「零件圖鑑」表的 `階級 (Tier)` 非空 107/108**，首列 `["0-60","ratchet",<img>,"A"]`。評級是**搬家**，不是消失，而且連輔助刃都有了（那是新的）。
- 真正的解：`transform.ts` 改成兩邊都讀、以有值者為準——零件圖鑑表的 `階級 (Tier)` 打底，主表那兩欄若哪天填回來仍會以 `bestTier` 併入。輔助刃沿用同一把鑰匙（`輔助A`，與圖片同鍵）。`transform.test.ts` 兩個測試鎖住這件事。
- 擋下來的機制：`fetch-data.mjs` 在寫檔前檢查 blades／ratchets／bits 三類的階級涵蓋率，整類全空就 throw（`--allow-missing-tiers` 供「來源站真的移除評級」時放行）。統計行也加印四類涵蓋率。
- 通則（與 L12 同源，值得單獨記）：**外部來源的「欄位存在」和「欄位有值」都不是保證，而 `?? ''` / `|| ''` 這種友善預設會把「欄位不見了」變成「這欄本來就空」**。凡是缺了就會讓整段畫面消失的欄位，都要在管線出口設涵蓋率不變式——不是印一行 log，是 fail。
- 通則二（診斷訊息的設計）：不變式擋下來時，錯誤訊息要**印出能自己斷案的證據**，而不是只說「壞了」。這次三輪就收斂，靠的是訊息一次比一次具體：欄名 → 索引＋非空計數 → 兩張表全欄 dump。每一輪都省掉一次「猜錯方向再改一次」。

## L14 排程任務的 shell 拿到的是舊版 Node（2026-08-28）

- tags: env, scheduled-task, node, nvm
- 坑：`sync-draw-upstream` 排程跑 `node scripts/draw-sync.mjs` 直接死在 `ReferenceError: fetch is not defined`。原因是非互動 shell 沒載 nvm，`which node` 落在 `/usr/local/bin/node`＝**v16.13.2**（無全域 `fetch`），而互動終端是 nvm 的 v24。
- 症狀樣貌：手動在終端跑一切正常，排程／hook／CI 這類非互動情境才炸，且錯誤看起來像「腳本壞了」而不是「Node 版本不對」。
- 解（當次）：`export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"` 後再跑。長久解是在 `scripts/*.mjs` 或 package.json 加 `engines` 檢查，或排程指令前置固定 PATH。
- 通則：**排程／hook 的 shell 不等於你的終端**。任何靠 nvm/pyenv/rbenv 之類版本管理器的工具，在非互動情境都要顯式指定路徑，別假設 `node` 是哪一版。
