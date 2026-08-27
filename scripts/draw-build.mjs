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

const items = [];
let city = '';
let store = '';
const rounds = new Map(); // 店名 → { s, e } 抽選日期，或 { pending: true } 尚未公布
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

  const roundMatch = line.match(/^@(\d{4}-\d{2}-\d{2})(?:~(\d{4}-\d{2}-\d{2}))?$/);
  if (roundMatch) { rounds.set(store, { s: roundMatch[1], e: roundMatch[2] ?? null }); continue; }

  if (line === '—') { group += 1; continue; }

  const urlMatch = line.match(/^https:\/\/lin\.ee\/([A-Za-z0-9]+)$/);
  if (urlMatch) {
    const code = urlMatch[1];
    const resolved = mapping.get(code);
    const url = resolved && resolved !== 'FAIL' ? resolved : `https://lin.ee/${code}`;
    if (!pendingName) throw new Error(`URL 前面沒有品名: ${line}`);
    items.push({ c: city, s: store, g: group, n: pendingName, u: url });
    pendingName = '';
    continue;
  }

  pendingName = line;
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
const urlLines = lines.filter((l) => /^https:\/\/lin\.ee\/[A-Za-z0-9]+$/.test(l.trim())).length;
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
const noRound = stores.filter((s) => !s.rs && !s.p);
console.log(`無抽選日期店家: ${noRound.length}${noRound.length ? ' → ' + noRound.map((s) => s.n).join(', ') : ''}`);
// 有品項卻沒有 @日期／@待公布 的店，在頁面上不屬於任何批次：它不進頂端彙總、也不進
// 「進行中／已結束／尚未公布」任何一區，等於靜默消失。這是資料錯誤，不是可接受狀態。
const withItems = new Set(items.map((i) => i.s));
const orphan = noRound.filter((s) => withItems.has(s.n)).map((s) => s.n);
if (orphan.length)
  throw new Error(
    `有品項卻沒標抽選日期的店家 ${orphan.length} 家: ${orphan.join(', ')}\n` +
    `→ 請在 data/draw/source-links.txt 的 [店名] 下補一行 @YYYY-MM-DD[~YYYY-MM-DD] 或 @待公布`,
  );
const byRound = {};
for (const s of stores) byRound[s.p ? '待公布' : s.rs ?? '(無)'] = (byRound[s.p ? '待公布' : s.rs ?? '(無)'] || 0) + 1;
console.log('批次分佈: ' + Object.entries(byRound).map(([k, v]) => `${k} ${v}家`).join(' / '));
console.log('最近三家: ' + stores.slice(0, 3).map((s) => `${s.n} ${s._d}km`).join(' / '));

const updated = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }); // 2026-08-26 22:57:31
const body = items.map((i) => JSON.stringify(i)).join(',\n');
const dataJs =
  `// generated by tools/build-data.mjs — 勿手改；來源 data/source-links.txt + data/mapping.tsv\n` +
  `window.FUNBOX_DATA = {\n  updated: ${JSON.stringify(updated)},\n` +
  `  stores: [\n${stores
    .map(({ _d, ...s }) => '    ' + JSON.stringify(s))
    .join(',\n')}\n  ],\n` +
  `  items: [\n${body}\n  ]\n};\n`;
writeFileSync(join(root, `${OUT}/data.js`), dataJs);
console.log(`${OUT}/data.js written`);

// cache-busting：把內容雜湊寫進 index.html 的 script src
// （LINE 內建瀏覽器與 GitHub Pages 都會快取 data.js；不換 URL 使用者會停在舊清單）
const hash = createHash('sha256').update(dataJs).digest('hex').slice(0, 8);
const indexPath = join(root, `${OUT}/index.html`);
const html = readFileSync(indexPath, 'utf8');
const nextHtml = html.replace(/src="data\.js(\?v=[a-f0-9]+)?"/, `src="data.js?v=${hash}"`);
if (nextHtml === html && !html.includes(`data.js?v=${hash}`)) throw new Error('index.html 找不到 data.js 的 script 標籤');
writeFileSync(indexPath, nextHtml);
console.log(`${OUT}/index.html → data.js?v=${hash}`);
