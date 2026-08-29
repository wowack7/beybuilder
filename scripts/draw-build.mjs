// 抽選目錄（/draw/）的資料建置：
// 從 data/draw/source-links.txt（### 縣市 / [店名] / — 分組）＋ data/draw/mapping.tsv（lin.ee→liff）
// 生成 public/draw/data.js，並把內容雜湊寫回 public/draw/index.html 的 script src。
// 這頁是刻意的純靜態單檔（不進 Vite bundle）：LINE 內建瀏覽器要秒開，不能等 React 起來。
// 店家排序：data/stores.tsv 的座標 vs data/draw/anchors.tsv 的活動區域，取「到最近錨點」的直線距離由近到遠
// 沒有座標的店家排在最後，依縣市原順序
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLinkLine } from './draw-links.mjs';
import { normalizeItemName, orderStoreItems, parseItemNames, tagOf } from './draw-items.mjs';
import { TIER_ORDER } from '../src/lib/transform.ts';
import { GA_ID } from '../src/lib/analytics.ts';
import { DRAW_PATH, SITE_URL } from '../src/lib/site.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'data/draw';
const OUT = 'public/draw';

function readTsv(rel) {
  return readFileSync(join(root, rel), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t'));
}

// 同一個本站店名可以有多列（用來接住上游的不同寫法，例：Funbox-竹北遠百店／Funbox 竹北遠東店），
// 但那些列的縣市與座標必須一致——不一致的話 coords 會靜默取第一列、排序與縣市籤就看列序決定。
{
  const byName = new Map();
  for (const [n, c, lat, lng, , bias] of readTsv(`${DATA}/stores.tsv`)) {
    const sig = [c, lat ?? '', lng ?? '', bias ?? ''].join('|');
    if (!byName.has(n)) byName.set(n, new Set());
    byName.get(n).add(sig);
  }
  const conflict = [...byName].filter(([, sigs]) => sigs.size > 1);
  if (conflict.length)
    throw new Error(
      `data/draw/stores.tsv 同名店家的縣市／座標不一致：\n` +
        conflict.map(([n, sigs]) => `  ${n}: ${[...sigs].join('  vs  ')}`).join('\n') +
        `\n→ 同名多列只該差在「上游店名」那一欄`,
    );
}

const anchors = readTsv(`${DATA}/anchors.tsv`).map(([n, lat, lng]) => ({ n, lat: +lat, lng: +lng }));
// lat/lng 留空＝沒座標，排序時排在有座標的之後
const coords = new Map(
  readTsv(`${DATA}/stores.tsv`)
    .filter(([, , lat, lng]) => lat && lng)
    .map(([n, c, lat, lng, , bias]) => [n, { c, lat: +lat, lng: +lng, bias: +(bias ?? 0) || 0 }])
);

// haversine，回傳公里
function km(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const mapping = new Map(
  readFileSync(join(root, `${DATA}/mapping.tsv`), 'utf8')
    .trim().split('\n')
    .map((line) => line.split('\t'))
);

const lines = readFileSync(join(root, `${DATA}/source-links.txt`), 'utf8').split('\n');

const rawItems = [];
let city = '';
let store = '';
const rounds = new Map(); // 店名 → { s, e } 抽選日期，或 { pending: true } 尚未公布，或 { closed: true } 整修中
const declared = []; // 正本裡宣告過的店家（含尚未公布、沒有品項者）
let group = 1;
let pendingName = '';

for (const raw of lines) {
  const line = raw.trim();
  if (!line || line === '-----------------------') continue;

  const cityMatch = line.match(/^###\s*(.+)$/);
  if (cityMatch) { city = cityMatch[1].trim(); continue; } // 必須先於註解判斷：### 也是 # 開頭

  if (line.startsWith('#')) continue; // 註解行

  const storeMatch = line.match(/^\[(.+)\]$/);
  if (storeMatch) {
    store = storeMatch[1];
    group = 1;
    pendingName = '';
    if (!declared.some((d) => d.n === store)) declared.push({ n: store, c: city });
    continue;
  }

  if (line === '@待公布') { rounds.set(store, { pending: true }); continue; }
  // 整修／歇業：這家店這批不會有抽選，跟「還沒公布」不是同一件事——
  // 不進待公布名單、不進「已公布 N/M」的分母。店重開時上游會再列它，sync 會自動換回 @日期。
  if (line === '@整修中') { rounds.set(store, { closed: true }); continue; }

  const roundMatch = line.match(/^@(\d{4}-\d{2}-\d{2})(?:~(\d{4}-\d{2}-\d{2}))?$/);
  if (roundMatch) { rounds.set(store, { s: roundMatch[1], e: roundMatch[2] ?? null }); continue; }

  if (line === '—') { group += 1; continue; }

  if (isLinkLine(line)) {
    // liff 直連已經是終點；lin.ee 短址查 mapping，查不到就退回短址（頁面照樣點得開）
    const code = line.match(/^https:\/\/lin\.ee\/([A-Za-z0-9]+)$/)?.[1];
    const resolved = code ? mapping.get(code) : null;
    const url = code ? (resolved && resolved !== 'FAIL' ? resolved : line) : line;
    if (!pendingName) throw new Error(`URL 前面沒有品名: ${line}`);
    rawItems.push({ c: city, s: store, g: group, n: pendingName, u: url, r: line });
    pendingName = '';
    continue;
  }

  pendingName = line;
}

// --- 品名一致化 ---
// 各店貼文各自打字，同一件商品有大量寫法差異（價格尾綴／全半形括號／大小寫／錯字）。
// 正本保留原文當證據，對外顯示一律換成 data/draw/item_names.tsv 的標準品名——
// 否則清單上同一商品長出好幾個名字，而且搜尋吃品名，「子彈獅鳶」那家永遠搜不到。
// 表裡沒收的型號不擋 build（新品項要能照常上線），沿用原文並在下方印出來提醒補表。
const stdNames = parseItemNames(readTsv(`${DATA}/item_names.tsv`));
const items = rawItems.map((i) => ({ ...i, n: normalizeItemName(i.n, stdNames) ?? i.n }));
const renamed = rawItems.filter((i, idx) => i.n !== items[idx].n).length;
const unlisted = [...new Set(rawItems.filter((i) => !normalizeItemName(i.n, stdNames)).map((i) => tagOf(i.n) ?? i.n))];
console.log(`品名一致化: ${renamed}/${items.length} 筆換成標準品名`);
console.log(`未收錄型號: ${unlisted.length}${unlisted.length ? ' → ' + unlisted.join(', ') + '（沿用原文，請補進 data/draw/item_names.tsv）' : ''}`);

// --- 新品項排上面 ---
// data/draw/item_seen.tsv 是「每條券連結第一次進正本的時間」帳本，build 自動維護：
// 沒見過的網址以當下時間補進帳本（會跟著 commit），每家店的品項依此新→舊排序。
// 不排的話新資料永遠 append 在每家店最底下，當天熱門新品（UX-21 那種）反而最難找。
const SEEN_PATH = join(root, `${DATA}/item_seen.tsv`);
const seenAt = new Map(readTsv(`${DATA}/item_seen.tsv`).map(([u, t]) => [u, t]));
{
  const nowTs = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16);
  const unseen = [...new Set(items.map((i) => i.r))].filter((u) => !seenAt.has(u));
  for (const u of unseen) seenAt.set(u, nowTs);
  if (unseen.length) {
    const rows = [...seenAt.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1));
    const head = readFileSync(SEEN_PATH, 'utf8').split('\n').filter((l) => l.startsWith('#'));
    writeFileSync(SEEN_PATH, head.join('\n') + '\n' + rows.map(([u, t]) => `${u}\t${t}`).join('\n') + '\n');
  }
  console.log(`新品項帳本: 本次新進 ${unseen.length} 筆`);
}
{
  // 依店重排（店的先後不動，動的是每家店內的順序）
  const byStore = new Map();
  for (const i of items) {
    if (!byStore.has(i.s)) byStore.set(i.s, []);
    byStore.get(i.s).push(i);
  }
  items.length = 0;
  for (const group of byStore.values()) items.push(...orderStoreItems(group, seenAt));
}

// 驗證：筆數、同店重複、liff 覆蓋率
// 跨店重複是合法的：同一場抽選可被兩家店同時列出（例：忠孝SOGO／北車地下街 共用 oDYlc3w）
const perStore = items.map((i) => `${i.s}\u0000${i.u}`);
const dupes = perStore.filter((k, idx) => perStore.indexOf(k) !== idx);
const urls = items.map((i) => i.u);
const crossStore = [...new Set(urls.filter((u, idx) => urls.indexOf(u) !== idx))];
const nonLiff = items.filter((i) => !i.u.startsWith('https://liff.line.me/'));
console.log(`items: ${items.length}／有品項的店: ${new Set(items.map((i) => i.s)).size}`);
console.log(`同店重複 URL: ${dupes.length}${dupes.length ? ' → ' + dupes.join(', ') : ''}`);
console.log(`跨店共用 URL（允許）: ${crossStore.length}${crossStore.length ? ' → ' + crossStore.join(', ') : ''}`);
console.log(`非 liff 直連: ${nonLiff.length}${nonLiff.length ? ' → ' + nonLiff.map((i) => i.n).join(', ') : ''}`);
// 自我一致性：正本裡有幾行 lin.ee 網址，就該產出幾筆（抓解析漏吃，換批不用改常數）
const urlLines = lines.filter((l) => isLinkLine(l.trim())).length;
if (items.length !== urlLines) throw new Error(`正本有 ${urlLines} 行網址，只產出 ${items.length} 筆`);
if (dupes.length > 0) throw new Error('同一店家有重複 URL');

// 店家清單＋距離排序（含尚未公布、目前沒有品項的店）
const stores = declared.map(({ n, c }) => {
  const co = coords.get(n);
  // 體感調整（data/draw/stores.tsv 第 6 欄）：捷運直達的拉近、要轉線的推遠；夾在 0 以上避免變負數
  const d = co ? Math.max(0, Math.min(...anchors.map((a) => km(a, co))) + co.bias) : null;
  const r = rounds.get(n) ?? null;
  // _d 只在 build 內用來排序，不寫進 data.js（距離與錨點＝使用者活動範圍，不公開）
  const base = { n, c, _d: d === null ? null : Math.round(d * 10) / 10 };
  if (r?.closed) return { ...base, x: 1 };
  return r?.pending ? { ...base, p: 1 } : { ...base, rs: r?.s ?? null, re: r?.e ?? null };
});
stores.sort((a, b) => {
  if (a._d === null && b._d === null) return 0;
  if (a._d === null) return 1;
  if (b._d === null) return -1;
  return a._d - b._d;
});
const noCoords = stores.filter((s) => s._d === null);
console.log(`無座標店家: ${noCoords.length}${noCoords.length ? ' → ' + noCoords.map((s) => s.n).join(', ') : ''}`);
const noRound = stores.filter((s) => !s.rs && !s.p && !s.x);
console.log(`無抽選日期店家: ${noRound.length}${noRound.length ? ' → ' + noRound.map((s) => s.n).join(', ') : ''}`);
// 有品項卻沒有 @日期／@待公布 的店，在頁面上不屬於任何批次：它不進頂端彙總、也不進
// 「進行中／已結束／尚未公布」任何一區，等於靜默消失。這是資料錯誤，不是可接受狀態。
const withItems = new Set(items.map((i) => i.s));
const orphan = noRound.filter((s) => withItems.has(s.n)).map((s) => s.n);
if (orphan.length)
  throw new Error(
    `有品項卻沒標抽選日期的店家 ${orphan.length} 家: ${orphan.join(', ')}\n` +
    `→ 請在 data/draw/source-links.txt 的 [店名] 下補一行 @YYYY-MM-DD[~YYYY-MM-DD]、@待公布 或 @整修中`,
  );
const byRound = {};
const roundKey = (s) => (s.x ? '整修中' : s.p ? '待公布' : s.rs ?? '(無)');
for (const s of stores) byRound[roundKey(s)] = (byRound[roundKey(s)] || 0) + 1;
console.log('批次分佈: ' + Object.entries(byRound).map(([k, v]) => `${k} ${v}家`).join(' / '));
console.log('最近三家: ' + stores.slice(0, 3).map((s) => `${s.n} ${s._d}km`).join(' / '));

// --- 型號 → 天梯階級（頁面上的商品籤依此排序：強的在前、配件殿後） ---
// 鍵的算法必須與 index.html 的 tagOf() 一致（那邊吃品名、這邊吃 products.json 的型號）。
// tagOf 的唯一來源在 scripts/draw-items.mjs。
const tierRank = (t) => {
  const i = TIER_ORDER.indexOf(t);
  return i === -1 ? TIER_ORDER.length : i;
};
const products = JSON.parse(readFileSync(join(root, 'src/data/products.json'), 'utf8'));
// 一個型號可能對到多顆戰刃（隨機強化組、聯名款），取其中最高階＝「抽得到的最強」。
// 值為空字串＝products.json 有這件商品但來源站沒評級（仍是陀螺，排在有階級的之後、配件之前）；
// 整個型號不在 map 裡＝發射器／收納盒／戰鬥盤這類非陀螺商品，殿後。
const tierByTag = {};
for (const p of products) {
  const tag = tagOf(String(p.id).split('::')[0]);
  if (!tag) continue;
  const tier = p.tier ?? '';
  if (!(tag in tierByTag) || tierRank(tier) < tierRank(tierByTag[tag])) tierByTag[tag] = tier;
}
// 只夾帶這批清單用得到的型號：data.js 是 LINE 內建瀏覽器要秒開的檔案
const usedTags = [...new Set(items.map((i) => tagOf(i.n)).filter(Boolean))];
const tiers = Object.fromEntries(usedTags.filter((t) => t in tierByTag).map((t) => [t, tierByTag[t]]));
const rated = usedTags.filter((t) => tiers[t]);
console.log(
  `型號 ${usedTags.length} 種：有階級 ${rated.length}` +
    ` / 未評級陀螺 ${usedTags.filter((t) => t in tiers && !tiers[t]).length}` +
    ` / 非陀螺配件 ${usedTags.filter((t) => !(t in tiers)).length}`
);
console.log('  ' + [...rated].sort((a, b) => tierRank(tiers[a]) - tierRank(tiers[b])).map((t) => `${t} ${tiers[t]}`).join(' / '));

const updated = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }); // 2026-08-26 22:57:31
const body = items.map(({ r: _r, ...pub }) => JSON.stringify(pub)).join(',\n');
const dataJs =
  `// generated by tools/build-data.mjs — 勿手改；來源 data/source-links.txt + data/mapping.tsv\n` +
  `window.FUNBOX_DATA = {\n  updated: ${JSON.stringify(updated)},\n` +
  `  stores: [\n${stores
    .map(({ _d, ...s }) => '    ' + JSON.stringify(s))
    .join(',\n')}\n  ],\n` +
  `  ga: ${JSON.stringify(GA_ID)},\n` +
  `  tierOrder: ${JSON.stringify(TIER_ORDER)},\n` +
  `  tiers: ${JSON.stringify(tiers)},\n` +
  `  items: [\n${body}\n  ]\n};\n`;
writeFileSync(join(root, `${OUT}/data.js`), dataJs);
console.log(`${OUT}/data.js written`);

// --- 給爬蟲的靜態內容 -------------------------------------------------------
// 這頁的清單全靠 JS 從 data.js 渲染，原始 HTML 一個店名都沒有。把當批清單直接
// 寫進 <main>，爬蟲不必執行 JS 就讀得到；JS 起來時 renderList() 的
// main.textContent = '' 會把它清掉再自己畫，所以不會有兩份清單並存。
const esc = (t) =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mmdd = (d) => (d ? d.slice(5).replace('-', '/') : '');
const openStores = stores.filter((s) => s.rs);
const itemsOf = (name) => items.filter((i) => i.s === name);

const seoHtml =
  `\n<section class="store">\n<h2>本批抽選店家（${openStores.length} 家 / 共 ${stores.length} 家）</h2>\n` +
  `<p>戰鬥陀螺 Beyblade X 各店 LINE 官方帳號抽選（購買券）連結目錄。` +
  `以下為目前已公布的店家與品項，點開頁面後可依縣市、店家、品項篩選。</p>\n</section>\n` +
  openStores
    .map((s) => {
      const list = itemsOf(s.n);
      if (!list.length) return '';
      const period = s.re && s.re !== s.rs ? `${mmdd(s.rs)}–${mmdd(s.re)}` : mmdd(s.rs);
      return (
        `<section class="store">\n<h2>${esc(s.n)}（${esc(s.c)}）</h2>\n` +
        `<p>抽選期間 ${esc(period)}，共 ${list.length} 項</p>\n<ul>\n` +
        list.map((i) => `<li>${esc(i.n)}</li>`).join('\n') +
        `\n</ul>\n</section>`
      );
    })
    .filter(Boolean)
    .join('\n') +
  `\n<p><a href="${SITE_URL}">BeyBuilder X 配裝模擬器</a>｜` +
  `<a href="${SITE_URL}tier/">Beyblade X 天梯階級總表</a></p>\n`;

// JSON-LD：一個目錄頁＋已公布店家的清單（只放頁面上真的有的東西）
const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BeyBuilder X 配裝模擬器', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: '戰鬥陀螺抽選目錄', item: SITE_URL + DRAW_PATH },
      ],
    },
    {
      '@type': 'CollectionPage',
      name: '戰鬥陀螺抽選目錄',
      description: '戰鬥陀螺 Beyblade X 各店 LINE 官方帳號抽選（購買券）連結目錄，依縣市、店家、品項篩選。',
      url: SITE_URL + DRAW_PATH,
      inLanguage: 'zh-Hant-TW',
      isAccessibleForFree: true,
      dateModified: updated.replace(' ', 'T') + '+08:00',
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: openStores.length,
        itemListElement: openStores.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${s.n}（${s.c}）`,
        })),
      },
    },
  ],
};

// cache-busting：把內容雜湊寫進 index.html 的 script src
// （LINE 內建瀏覽器與 GitHub Pages 都會快取 data.js；不換 URL 使用者會停在舊清單）
const hash = createHash('sha256').update(dataJs).digest('hex').slice(0, 8);
const indexPath = join(root, `${OUT}/index.html`);
const html = readFileSync(indexPath, 'utf8');
let nextHtml = html.replace(/src="data\.js(\?v=[a-f0-9]+)?"/, `src="data.js?v=${hash}"`);
if (nextHtml === html && !html.includes(`data.js?v=${hash}`)) throw new Error('index.html 找不到 data.js 的 script 標籤');

// 檢查「標記在不在」，不是「替換前後有沒有變」——資料沒變時重跑本來就會產出一模一樣的
// 字串，用相等判斷會把正常的冪等重建誤判成標記不見了（本次實際踩到）。
const SEO_RE = /<!--seo-->[\s\S]*?<!--\/seo-->/;
const LD_RE = /(<script type="application\/ld\+json" id="draw-ld">)[\s\S]*?(<\/script>)/;
if (!SEO_RE.test(nextHtml)) throw new Error('index.html 找不到 <!--seo--> 標記，靜態內容無處可放');
if (!LD_RE.test(nextHtml)) throw new Error('index.html 找不到 id="draw-ld" 的 JSON-LD 標籤');
nextHtml = nextHtml.replace(SEO_RE, `<!--seo-->${seoHtml}<!--/seo-->`);
nextHtml = nextHtml.replace(LD_RE, `$1${JSON.stringify(ld)}$2`);

writeFileSync(indexPath, nextHtml);
console.log(
  `${OUT}/index.html → data.js?v=${hash}；靜態內容 ${openStores.length} 家 / ${items.length} 筆` +
    `（${(seoHtml.length / 1024).toFixed(1)}kB）`,
);
