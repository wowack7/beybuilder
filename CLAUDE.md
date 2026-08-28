# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BeyBuilder X — Beyblade X 配裝模擬器（Vite + React 19 + TypeScript）。使用者登錄擁有的陀螺產品/零件（localStorage），app 在官方 3on3 deck 規則（同一 deck 內 Blade / Ratchet / Bit 不得重複）下算出總分最高的三顆出戰組合，另提供天梯階級與實戰組合排行瀏覽。

## Commands

- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — `tsc -b` type-check + production build + `scripts/gen-seo.mjs`（產靜態天梯頁與 sitemap，見 SEO 段）
- `npm test` — Vitest run once（單一測試檔：`vitest run src/lib/recommend.test.ts`；watch 用 `npm run test:watch`）
- `npm run lint` — oxlint
- `npm run data:update` — 重新抓取兩個資料來源並重新生成 `src/data/*.json`（需網路、Node ≥ 23.6：轉換邏輯在 `src/lib/transform.ts`，靠 Node 原生 TS import 與前端共用）。資料更新只走此路徑（本機 + 每週 GitHub Actions），**前端一律用內建資料、不在瀏覽器端抓取**（用戶決策 2026-07-06：公開站避免每個訪客各自觸發外部請求；原「更新資料」鈕與 localStorage 快取機制已移除）。坑點見 lessons.md

## Deploy（GitHub Pages）

- 正式站：https://beybuilder.5-seven.dog/ （自訂子網域，DNS 為 GoDaddy 的 CNAME `beybuilder` → `wowack7.github.io`；`public/CNAME` 告訴 GitHub 掛此域，舊 `wowack7.github.io/beybuilder/` 由 GitHub 自動 301 過來）。repo `wowack7/beybuilder`，public
- **人工** push main → `.github/workflows/deploy.yml` 自動 test+build+部署；`data-update.yml` 每週一 01:00 UTC 雲端更新資料並 commit（資料自動更新的正式源頭——本機 Claude 排程只負責 git pull 同步）
- `data-update.yml` 的 commit **不會自動觸發部署**，必須由它自己 `gh workflow run deploy.yml` 明確派工（GITHUB_TOKEN 發出的 push 不觸發其他 workflow；此機制曾讓線上資料靜默停更三週）。驗活看**線上產物**而非 workflow 綠燈：`curl -s https://beybuilder.5-seven.dog/tier/ | grep -o '資料更新於 [0-9-]*'`。判決見 `docs/Decisions.md` [2026-08-11]，坑點見 lessons.md L10
- `vite.config.ts` base 一律 `/`（站台在子網域根）。網址／base 單一來源在 `src/lib/site.ts`（`SITE_URL`/`BASE_PATH`），`site.test.ts` 讀 `index.html`、`vite.config.ts` 比對，換域漏改就紅燈
- **phstudy 匯入**：`src/lib/importPh.ts`＋映射表 `src/data/ph_map.json`（data:update 生成，含 hardcoded.json 聯名套組）。三種方式（`ImportPhBody`，全程瀏覽器端解析不上傳）：①**檔案匯入**（主要、手機也適用）——phstudy「下載」匯出 `{parts:[...]}` JSON 檔，本站選檔即解析；②書籤小工具跳轉 `#phimport=<base64>`（電腦一鍵）；③手動貼 JSON。三者最後都進 `parsePhInventory`（吃 partId，忽略其他欄位）
- **GA4 分析**：`src/lib/analytics.ts`（gtag.js，只做頁面瀏覽），`main.tsx` 開頭呼叫 `initAnalytics()`。僅 `import.meta.env.PROD` 才載入——本機 dev 不追蹤。Measurement ID `G-NNJPTBMXKW` 硬編於該檔（公開值）並 `export`，供 `draw-build.mjs` 併進 `/draw/` 的 data.js（那頁 import 不到這裡，見 /draw/ 段）

## 抽選目錄 `/draw/`（刻意不進 Vite bundle 的純靜態單頁）

戰鬥陀螺各店 LINE 官方帳號抽選（購買券）的連結目錄，2026-08-26 從獨立 repo 併入本站。

- 網址 <https://beybuilder.5-seven.dog/draw/>；`public/draw/index.html` ＋ `public/draw/data.js`
  由 Vite 原樣複製到 `dist/draw/`，**不是 React 分頁、也沒有 router**
- **為什麼獨立於 SPA**：這頁的使用情境是搶券時在 LINE 內建瀏覽器單手快點，
  必須秒開；走 SPA 要先載 React bundle。核心賣點是「連結一律同分頁開、不跳出 LINE」，
  全頁禁用 `target="_blank"`／`window.open`，所有 `lin.ee` 都預先解析成 `liff.line.me` 直連
- **2026-08-27 起改為可被檢索**（原本掛 `noindex,nofollow`，理由是「個人工具不進站台 SEO」，
  用戶決策推翻）：`index,follow` ＋ 完整 head（description／canonical／og／twitter／
  專屬縮圖 `og-draw.png`）＋ 首頁靜態骨架的內鏈 ＋ 進 sitemap（`changefreq: daily`，
  各店逐日公布、換批連結會失效）
- **爬蟲讀得到的靜態內容由 `draw-build` 寫進 `<main>`**（`<!--seo-->…<!--/seo-->` 標記之間）：
  清單本來全靠 JS 從 data.js 渲染，原始 HTML 一個店名都沒有。JS 起來時 `renderList()` 的
  `main.textContent = ''` 會清掉它再自己畫，所以不會有兩份清單並存（實測 JS 關閉時讀得到
  19 家 195 筆，JS 開啟時靜態殘留為 0）。同段一併重寫 `id="draw-ld"` 的 JSON-LD
  （BreadcrumbList ＋ CollectionPage ＋ 已公布店家的 ItemList）；兩個標記找不到就 throw
- 站頭導覽有一顆綠色「官方抽買」（`.tab-draw`，`--line-green` 系；`App.tsx` 裡是真 `<a>` 整頁跳轉，
  不是 React 分頁）
- 路徑常數 `DRAW_PATH` 放在 `src/lib/site.ts`（與 `TIER_PATH` 同一處）
- **資料**：`data/draw/`（`source-links.txt` 正本／`mapping.tsv` lin.ee→liff／`stores.tsv` 座標與
  上游店名對照／`anchors.tsv` 排序錨點／`voom.tsv` 各店 VOOM 帳號／`official.tsv` 官方給的
  各店粉專＋LINE 官方帳號 ID）。`data/draw/source.local.json`（上游彙整頁網址）**不進版控**
- **`official.tsv` 的用途是「去哪查」，不是自動抓**：上游彙整頁常慢半拍，各店會先發在自己的
  FB 粉專或 LINE VOOM。`draw:sync` 乾跑會列出「上游還沒收、但查得到官方管道」的店與連結，
  查到有抽選就人工補進正本（sync 是增量合併，人工補的不會被覆寫）。
  **FB 未登入抓不到貼文**，所以自動掃描只能借用真實登入狀態——見 `draw:fb`
- **`npm run draw:fb`**（`scripts/draw-fb-scan.mjs`，**只能在本機跑**，雲端容器連不到 facebook.com）：
  用 Playwright 開你機器上的 Chrome（`channel: 'chrome'`）＋專屬設定檔 `data/draw/.fb-profile`
  （含 FB 登入 cookie，已 gitignore），逐一看待查店家的粉專，抓「抽選／抽籤／購買券」等字樣、
  日期與 `lin.ee` 連結。第一次跑會開視窗要你手動登入，之後可無頭。
  **只讀不寫**：印出線索，補不補進正本由人決定。純函式 `extractLeads` 有測試覆蓋
- **`npm run draw:voom`**（`scripts/draw-voom.mjs`）：掃 `voom.tsv` 裡各店的 LINE VOOM 帳號頁——
  未登入純 HTTP 就吃得到（貼文埋在 SSR 的 `__NEXT_DATA__`），不需要 Playwright、雲端也能跑，
  是 draw:fb 的輕量姊妹作。各店券連結常比上游早半天發在 VOOM（2026-08-28 實測收到 3 家隔日券）。
  只讀不寫：印出「品項×lin.ee」配對並標 🆕（正本沒有的 code），補檔照 draw:fb 的 SOP。
  涵蓋限制：homeId 反查不到（@LINE-ID 版 SSR 不帶貼文、getPosts API 未登入拿不到），
  `voom.tsv` 只能人工擴充；「頁面有回但解析不到貼文」是 VOOM 改版警訊，不是沒新貼文
- **TG 通知**：`scripts/draw-notify.mjs`——站上多了新的「店×品項×券」就發一則到戰鬥陀螺補貨群
  （與 funbox-bot 專案共用 bot 與群組；token/chat_id 的唯一來源是 funbox-bot 的 config.json，
  本репо只放 gitignored 指標檔 `data/draw/notify.local.json`）。狀態檔 `.notify-state.json` 記
  已通知集合、每次只發差集；狀態檔不存在＝第一次跑會**靜默播種不發**（防整站轟群）。
  指標檔不存在＝這台機器沒接，印一行就過。由 sync 排程在部署驗活成功後呼叫——
  **通知的一定是已上線的內容**，不然群裡的人點進來看不到
- **指令**：`npm run draw:build`（重建 data.js＋把內容雜湊寫回 index.html 的 `?v=`）、
  `npm run draw:sync`（比對上游，`-- --write` 才改檔）。兩者都**不串在 `npm run build`**：
  `data.js` 是已 commit 的產物，資料要換批才重跑
- **sync 是增量合併，不是覆寫**：各店逐日陸續公布，覆寫會把還沒公布的店整批抹掉。
  規則：①上游店名用正規化鍵模糊比對（上游每批都會微調 `Funbox`／`FunBox Toys-`／空格／尾綴「店」）；
  ②同一批次（**比開始日**，因為上游常先只給開始日、之後才補結束日）取聯集，
  保留人工從 VOOM 補進、上游還沒收的品項；③換批才整店換掉；④上游沒列的店原封不動
- **cache-busting 必要**：LINE 內建瀏覽器快取極黏，不換 `data.js?v=` 使用者會停在舊清單（實測踩過）。
  注意 `?v=` **只保護 `data.js`**；改 `index.html` 裡的 CSS／JS 沒有任何換 URL 機制，
  部署後看起來「沒生效」多半是它的快取
- **GA4**：與主站同一個串流，ID 由 `draw-build` 從 `src/lib/analytics.ts` 併進 `data.js` 的 `ga`
  （不在 index.html 抄第二份）。gtag.js 排在 `requestIdleCallback` 才載——這頁的賣點是搶券時秒開，
  一百多 KB 不能跟清單搶頻寬；`location.protocol !== 'https:'` 或 localhost 一律不送（本機開檔不污染資料）。
  除 page_view 外兩個自訂事件：`draw_open`（點抽選：store/city/item/model/tier/repeat，
  同分頁導航靠 gtag 的 sendBeacon 送達）與 `filter_use`（filter_kind＝city/store/item/search
  ＋ filter_value；連點與打字有去抖動）。`track()` 在 gtag 不存在時靜默跳過，追蹤壞掉不影響抽券
- **品名一致化**：各店貼文各自打字，同一商品有大量寫法差異（價格尾綴 `850元`／全半形括號／
  `vol.4` vs `Vol.04`／錯字「子彈獅鳶」「炫風發射器」）。`data/draw/item_names.tsv`
  是「型號 → 標準品名」的單一來源，`draw-build` 產 data.js 時套用；**正本 `source-links.txt`
  一律保留各店原文**（那是抄自貼文的證據，不要為了統一去改它）。型號抽取 `tagOf` 的唯一來源在
  `scripts/draw-items.mjs`（index.html 另有一份同演算法的複本，因為那頁 import 不到，改要一起改）。
  表裡沒收的型號**不擋 build**——新品項要能照常上線，只沿用原文並在 build 印出「未收錄型號」提醒補表。
  篩選與天梯排序吃型號前綴、不受寫法影響，但**搜尋吃品名**，這是做這件事的主因
- **一致化必須留住「幾點才開始」**：同一批裡少數品項會晚一天開賣，各店開始時間還不一樣
  （10:00／10:30／11:00），寫在品名後面的 `（8/29 11:00才開始）`。那是使用者要看的資訊，
  不是價格那種雜訊。`normalizeItemName` 只把含日期／時刻／「開始」「開賣」的括號段接回標準名，
  `（原價$850）`、`（不含陀螺）`、`（黑）` 一律不留。2026-08-28 踩過：一致化上線當天
  27 筆 UX-21 的開賣時間被整批洗掉，`draw-items.test.mjs` 拿真實正本比對，再犯就紅燈
- **作廢短址**：`data/draw/link_drops.tsv` 是**唯一能讓 sync 拒收某條上游連結的地方**。
  因為同批取聯集，光在正本把連結改掉，下一輪 `draw:sync --write` 會把上游那條併回來、
  同一品項變兩條。判定門檻寫在該檔頭部（要店家自己貼文給了不同短址，且新券的 ULID
  建立時間晚於上游抓取時間，兩項都成立才列）。已驗過：2026-08-28 台南新天地 UX-11
  上游 20:07 抓到 8/21 建的舊券、店家 20:15 才換新券，列進去後真跑 `--write` 沒被併回來
- 店家排序＝到 `anchors.tsv` 最近錨點的直線距離＋`stores.tsv` 第 6 欄體感調整；
  **距離與錨點只在 build 階段使用，不寫進 `data.js`、畫面也不顯示**（那是使用者的活動範圍）
- **站頭只有兩顆圓鈕**（右上角）：**ⓘ**＝使用說明、**🔍**＝搜尋＋篩選。
  這頁的主角是清單，任何常駐的操作列都在跟它搶畫面；篩選與說明都不常駐
- **🔍 往下彈出一個面板**（`position:absolute` 掛在 sticky 的 `.top` 上，浮在清單上、
  不把清單推下去；`max-height:72vh` 內捲；點面板外、按 ✕ 或 Esc 收起）。
  面板內是**搜尋框 ＋ 縣市／店家／品項三組勾選，一次全部攤開**——
  三組各自再套一層摺疊會變成「展開篩選還要再點一次才看得到選項」，實測很煩
- **有在篩選時，站頭才出現一行**`篩選中 3 項 台北市 · UX-19 ｜ ✕ 清除`。
  那是**兩個獨立的按鈕**：主體＝把篩選面板打開去改（非破壞性），只有 ✕ 才真的清空——
  原本整行都是「清除」，而它就在站頭最上緣，手指一掃就把條件全清掉了。
  沒篩選時那行不存在，總項數改寫在 meta（`195 項 · 已公布 19/74 家 · 更新…`）——
  「幾項」永遠只出現在一個地方
- **說明是彈窗，首次造訪自動跳出**（`funbox:seen-howto:v1` 記過就不再跳，ⓘ 可隨時重看）：
  LINE Labs 那個設定沒關，「不跳出 LINE」這個核心賣點就不成立，不能只放在收合列裡
- **配色是語意，改色前先問這東西屬於哪一類**：篩選相關（🔍 鈕、「篩選中」那行、
  三組標題／勾選框／選中列／清除鈕、搜尋框 focus 圈）**一律紫**；**綠**只給動作
  （列上的「抽籤」鈕）與批次狀態籤；**橘**只給說明與警示（先設定 badge、已抽清除鈕）。
  一度縣市／店家用綠、品項用紫，等於同一個綠既表示「正在篩選」又表示「這裡可以點去抽」
- 列上的按鈕字是**「抽籤」**（說明彈窗那句「點『抽籤』…」引用的是它，改名要一起改）；
  篩選比對：搜尋吃品名，品項只認型號編號（名字要靠搜尋），型號由品名前綴自動抓
  （`BX-51`／`BXG`）。三個維度都可複選（OR），空＝全部，網址 `?c=台北市,新北市&s=&i=&q=`
  可分享，舊的單值連結 split 後是一元陣列照樣相容
- **品項依天梯排序**：有階級的照 `X>S+>…>E`，其次是未評級的陀螺，發射器／收納盒等非陀螺配件殿後。
  型號→階級由 `draw-build.mjs` 從 `src/data/products.json` 併進 `data.js` 的 `tiers`
  （一號多刃如隨機強化組取最高階＝「抽得到的最強」；值為空字串＝有商品但來源站沒評級，
  整個型號不在 map 裡＝配件）。階級順序也由 build 寫進 `data.js` 的 `tierOrder`——
  這頁 import 不到 `transform.ts` 的 `TIER_ORDER`，**不要在 index.html 裡抄第二份**
- 每家店在正本標 `@YYYY-MM-DD[~YYYY-MM-DD]` 抽選日期或 `@待公布`，頁面自動判定
  「已結束／MM/DD 開始／進行中／待公布」；公布進度只在站頭的更新時間旁寫成
  `已公布 16/73 家`，橫幅只留「還是上一批、連結點得開但抽不到」這種真警告。
  **有品項卻沒標日期會讓該店不屬於任何批次、從彙總靜默消失**，故 `draw-build` 直接 throw（見 lessons L12）

## SEO

本站是 client-rendered SPA，爬蟲抓首頁只看得到歡迎頁文案（庫存空的），沒有任何零件名稱。因此：

- **`src/lib/site.ts`** — 站台位址單一來源（`SITE_URL`/`BASE_PATH`/`TIER_PATH`/`OG_IMAGE_URL`）。`index.html` 與 `vite.config.ts` 無法 import 它、只能寫死字面量，**`src/lib/site.test.ts` 會實際讀這兩個檔比對**，換網域漏改一處就紅燈（canonical/og:image/sitemap 指錯不會有 runtime 錯誤，只會靜默掉出搜尋結果）
- **`src/lib/palette.ts`** — tokens 的程式端鏡像（oklch 三元組＋`oklchToHex`）。og 縮圖與靜態天梯頁吃不到 CSS 變數，色碼一律由此**算出**而非手打；`palette.test.ts` 比對它與 `tokens.css`
- **`scripts/gen-seo.mjs`** — 串在 `npm run build` 之後，產 `dist/tier/index.html`（全部戰刃/固鎖/軸心/輔助刃階級＋Top 60 實戰組合，長尾關鍵字的唯一來源）與 `dist/sitemap.xml`。純函式有 `scripts/gen-seo.test.mjs` 覆蓋（階級排序、不外洩 score、HTML escape、缺 assists 不炸 build）
- **`scripts/gen-og.mjs`** — 一次性產三張 1200×630 分享縮圖：`public/og.png`（全站預設）、
  `public/og-tier.png`（`/tier/`）、`public/og-draw.png`（`/draw/`），同一套版型換文案。
  網址常數在 `site.ts` 的 `OG_IMAGE_URL`／`TIER_OG_IMAGE_URL`／`DRAW_OG_IMAGE_URL`。
  改視覺才重跑；產物已 commit（注意 sharp/libvips 版本不同會產出位元組不同但視覺相同的檔，
  沒改視覺就別讓它進 diff）
- **`index.html` 的 `#root` 靜態骨架** — 爬蟲唯一能讀到的 `/tier/` 內鏈（footer 那條在 React JSX 裡，原始 HTML 沒有），順帶當 JS 載入前的畫面。React `createRoot()` 掛載時會清空，實測 CLS = 0。連結用**絕對** URL：Vite 不改寫 `<a href>`，相對路徑在子路徑下會解析錯
- 同理 `<meta content="...">` 也不被 Vite 改寫 base，canonical/og:image 一律寫絕對 URL
- **`public/robots.txt`**：全站 Allow ＋ `Sitemap:` 指向 `sitemap.xml`（2026-08-27 補上，原本 404）
- **`/tier/` 的常見問題**：`faqItems()` 一份資料同時渲染成頁面上的 `<details>` 與 FAQPage 結構化資料——
  Google 要求答案在頁面上看得見，只放 JSON-LD 會被判為影子內容。題數必須兩邊一致
- **sitemap 收錄三頁**：首頁（weekly）、`/tier/`（weekly）、`/draw/`（daily）
- **Search Console 已驗證**（驗證檔 `public/google36da2f64a6ba1f25.html`，2026-07-11 加入；用戶於 2026-08-27 確認驗證完成）。
  改網域或換 Google 帳號時那個檔不能刪。sitemap 提交狀態不在 repo 裡看得出來，
  要確認就開 Search Console 的 Sitemap 頁

## Data pipeline（先懂這個再動資料相關程式）

`scripts/fetch-data.mjs` 從兩個外部來源抓取並正規化，產出三個被前端直接 import 的 JSON：

1. **stan-yao 天梯站**（Google Sheets CSV）→ 產品清單＋blade/ratchet/bit 階級（`products.json`、`parts.json`）、實戰組合統計 recommendation_score（`combos.json`，~2800 筆）
2. **beyblade.phstudy.org**（`data/main.json`）→ 零件數值 attack/defense/stamina/burst/dash，以 zh-TW 名稱/ID 比對回填到 `parts.json`（比對不到就沒有 `stats`，屬正常）

要點：

- **階級涵蓋率是不變式**：`fetch-data.mjs` 在寫檔前檢查 blades／ratchets／bits 三類至少各有一個階級，
  整類全空就 throw 並印出來源表目前含「階級」的欄名（`--allow-missing-tiers` 可放行）。
  來源表改欄名不會報錯、只會讓某欄靜默變空——2026-07-27 的每週更新就這樣把固鎖 36/36、
  軸心 52/54 的階級洗成 0，天梯頁的固鎖/軸心區整片沒評級，五週沒人發現（見 lessons L13）
- **固鎖／軸心／輔助刃的階級來自「零件圖鑑」表的 `階級 (Tier)`**（2026-07-27 起主表的
  `固鎖階級 (Ratchet Tier)`／`軸心階級 (Bit Tier)` 兩欄被上游清空、欄位仍在）。
  `transform.ts` 兩邊都讀、以有值者為準；輔助刃在零件圖鑑表的列名是 `輔助A`（與圖片同鍵）。
  輔助刃不在上述不變式內：它是這次才開始有評級的，來源站未必會一直維持
- 階級尺度為 `X > S+ > S > A+ > … > E`（X 最高）。順序的**唯一來源**是 `src/lib/transform.ts` 的 `TIER_ORDER`（`scripts/fetch-data.mjs`、`scripts/gen-seo.mjs` 都 import 它，勿再複製）；`src/lib/score.ts` 的 `TIER_VALUE` 是同一尺度的分數映射，改動需與 `TIER_ORDER` 同步
- 產品（`Product`）＝一件商品：blade 名稱＋原裝 ratchet＋原裝 bit；blade 以「名稱」為身分聚合，變體（顏色/特別版）無階級時從同家族基底名繼承（`tierInherited: true`）
- **blade 家族鍵**（重塗/版本/賽事版如(世足)視為同零件；(左)/(右)、(…型) 保留為不同零件）唯一定義在 `src/lib/family.ts`，前端與資料管線（`transform.ts` 直接 import，非複本）共用。實戰組合匹配、deck 衝突判定、天梯「可組」判定都走家族鍵。顏色詞在 `COLOR_WORDS`、版本/賽事詞在 `EDITION_WORDS`（兩者在空白尾段或括號內都會被剝除；功能標記不在表中故保留），新變體漏配就到不了基底組合，`family.test.ts` 覆蓋
- **CX 是五層結構**（紋章〔顯示名，內部欄位 lockChip〕＋主刃＋輔助刃＋固鎖＋軸心）：stan-yao 以「整刃」評級與記錄實戰組合，故 blade 仍是評分單位；輔助刃是正式零件（`parts.json.assists`，單字母 id），站方組合可指定輔助刃（沒擁有就不可組），實戰組合帶入產品原裝輔助刃。鎖片/主刃名稱由 phstudy 反查（`products.json.lockChip/mainBlade`，僅顯示與重複判定用）。deck 衝突判定含輔助刃/鎖片/主刃同名（未抗辯假設：官方「同零件不重複」的延伸解讀）。**紋章/主刃真零件圖**：phstudy `images/app/{LockChip,MainBlade}/<id>.png`（無 CORS→`fetch-images.mjs` 自架），名稱→URL 由 `transform.ts` 的 `buildCxPartImages` 產出 `cx_part_img.json`，前端 `data.ts` 的 `cxPartImg` 僅收錄已自架者（值為同源本地路徑，分享卡 canvas 不污染）；自訂混搭（湊不出具名整刃）時 build slot 與分享卡並排顯示這兩張真零件圖
- CSV 欄名是中文帶英文括號（如 `型號 (ID)`），來源表頭有一欄拼寫缺右括號（`原裝輔助戰刃 (Assist Blade`），程式兩種都接

## Architecture

- `src/lib/recommend.ts` — 純函式推薦引擎：`resolveOwnedParts`（庫存→零件集合）→ `buildCandidates`（已知實戰組合 meta ＋自組 synth，裁剪 per-blade/全域上限）→ `pickBestDeck`（排序後 O(K²) 上界剪枝搜尋**全域最佳**互不衝突三顆——不是貪婪法，這是測試明確保護的行為）。引擎不 import JSON，資料一律由參數注入，測試用合成 fixture
- **候選組合只有兩個來源，絕不自由重組零件**（用戶明確要求）：①實戰組合（combos.json，賽事統計）②站方推薦（site_combos.json，解析天梯站「建議配置」欄，解析器在 fetch-data.mjs 的 `parseSiteCombos`）。同組合兩來源並存時取實戰版。測試保護於 recommend.test.ts「only complete known combos」「site-recommended combos」
- `src/lib/score.ts` — 所有評分權重常數集中於此，檔頭標明「未抗辯假設」：權重是自訂近似值，調整只改這檔。**分數僅供引擎內部排序，UI 與分享圖一律不顯示數字**（用戶決策 2026-07-06：實戰關乎技術、來源站非官方，只展示勝場/奪冠率/階級等真實資料）
- `src/lib/data.ts` — 唯一 import `src/data/*.json` 的模組，提供型別化資料與 Map 索引
- `src/hooks/useInventory.ts` — 庫存狀態＋localStorage 持久化（key: `beybuilder.inventory.v1`）
- **計分分頁（`src/components/score/`）** — 比賽裁判工具，橫向全屏（`App.tsx` 於 `tab==='score'` 提前 return、隱藏站頭/footer）。純規則在 `src/lib/scoring.ts`（官方 Beyblade X：Spin=1/Burst=2/Over=2/Xtreme=3、先到 4 分勝、勝後鎖定；`FINISH_POINTS` 為分值單一來源，UI 按鈕與加分都吃它）＋ `scoring.test.ts`；`useMatch`（localStorage `beybuilder.match.v1`，載入時 `sanitizeLog` 擋壞資料）、`useCountdown`（3-2-1-Go 發射倒數）、`sound.ts`（Web Audio 提示音，無外部檔）。直向顯示「請打橫」提示
- `src/components/{deck,build,inventory,tier}/` — 四個分頁，各自帶同目錄 css；共用小元件在 `components/ui/`。deck＝天梯自動算最強三顆；**build＝自組隊伍**（`BuildPage`：從庫存手動下拉配三顆，命中實戰組合顯示真實數據；自組狀態存 `beybuilder.customdeck.v1`（含 lockChip/mainBlade），`useCustomDeck` hook 提供 `patchSlot`。**CX 五層可拆混**：紋章/主刃/輔助刃各自獨立下拉，(紋章|主刃) 對得到具名整刃就用該名（優先基底、非特別版）、否則為自訂混搭；去重以「實體零件」計——CX 看紋章/主刃/輔助刃/固鎖/軸心、非 CX 看戰刃家族鍵。自組允許自由重組，與引擎的「只用已知組合」互補）
- 設計 tokens 在 `src/styles/tokens.css`（深色競技場風、螢光綠 accent），元件一律用 CSS 變數不硬編色碼

## Constraints

- Deck 規則「三顆內零件名稱不重複」是產品核心邏輯，動 `pickBestDeck` 前先跑 `npm test`（12 個測試涵蓋貪婪陷阱、去重、缺件降級）
- `src/data/*.json` 是生成物，不要手改；資料過期就跑 `npm run data:update`
- 零件/組合資料轉錄自上述兩站，footer 有出處聲明，新增資料來源時保持 attribution
