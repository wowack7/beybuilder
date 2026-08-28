// 從上游彙整頁同步抽選資料（來源網址放在不進版控的 data/source.local.json）
//   npm run draw:sync              # 只比對、不改檔（含過期偵測）
//   npm run draw:sync -- --write   # 覆寫 data/draw/source-links.txt 並補 data/draw/mapping.tsv
//   npm run draw:sync -- --write --all   # 收錄全部縣市（預設只收 stores.tsv 有座標的）
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINK_SRC, linkRe, isLinkLine, normLink, isShortLink } from './draw-links.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'data/draw';
let SRC;
try {
  SRC = JSON.parse(readFileSync(join(root, `${DATA}/source.local.json`), 'utf8')).url;
} catch {
  console.error('缺少 data/draw/source.local.json（本機設定，不進版控）。格式：{ "url": "<上游彙整頁網址>" }');
  process.exit(1);
}
if (!SRC) { console.error('data/draw/source.local.json 少了 url 欄位'); process.exit(1); }
const write = process.argv.includes('--write');
const all = process.argv.includes('--all');

const html = await fetch(SRC).then((r) => {
  if (!r.ok) throw new Error(`上游回應 ${r.status}`);
  return r.text();
});

// --- 過期偵測：上游頁首通常會標示 ---
const title = html.match(/class="[^"]*draw-main-title[^"]*">([^<]*)</)?.[1]?.trim() ?? '';
const reminder = html.match(/class="[^"]*draw-reminder[^"]*">([^<]*)</)?.[1]?.trim() ?? '';
console.log(`上游標題: ${title || '(無)'}`);
console.log(`上游提示: ${reminder || '(無)'}`);

// 兩路判定：① 上游措辭 ② 抽選時段的最後結束日（不依賴措辭，措辭會變）
const byWording = /過期|已結束|已截止/.test(reminder + title);
const endDates = [...html.matchAll(/(20\d\d)\/(\d{1,2})\/(\d{1,2})(?:\s+\d{1,2}:\d{2})?(?![\d\/])/g)]
  .map((m) => new Date(+m[1], +m[2] - 1, +m[3]))
  .sort((a, b) => b - a);
const lastEnd = endDates[0] ?? null;
const today = new Date(); today.setHours(0, 0, 0, 0);
const byDate = lastEnd ? lastEnd < today : false;
const expired = byWording || byDate;
console.log(`上游最後抽選日: ${lastEnd ? lastEnd.toLocaleDateString('sv-SE') : '(解析不到)'}`);
console.log(`→ 判定: ${expired ? '⚠️  這批連結已過期' : '✅ 這批看起來仍有效'}` +
  `（措辭:${byWording ? '過期' : '未提'} / 日期:${byDate ? '已過' : '未過'}）`);
if (expired && write) console.log('⚠️  仍會寫入，但請記得頁面上的過期提示要一起更新');

// --- lin.ee → liff 轉址表（去重要比對終點，所以得在解析品項前就載入） ---
const mapping = new Map(readFileSync(join(root, `${DATA}/mapping.tsv`), 'utf8').split('\n')
  .map((l) => l.trim()).filter(Boolean).map((l) => l.split('\t')));

/** 連結的最終去處：短址查轉址表（查不到退回短址本身），liff 直連本身就是終點 */
const finalUrl = (u) => {
  if (!isShortLink(u)) return u;
  const r = mapping.get(u.split('/').pop());
  return r && r !== 'FAIL' ? r : u;
};

/**
 * 同一場抽選，上游有時同時列了 lin.ee 短址與 liff 直連
 * （2026-08-27 嘉義三越 BX-10：lin.ee/pjDJ7QO 與 liff .../01M0YM12W4… 終點相同）。
 * 不去重會踩到 draw-build 的「同店重複 URL」防護，整批同步中斷。
 * 保留短址：正本既有資料全是短址形式，改用直連會讓整份檔案無謂變動。
 */
function dedupeByDest(items) {
  const pick = new Map(); // 終點 → 要保留的原始連結
  for (const [, url] of items) {
    const dest = finalUrl(url);
    const cur = pick.get(dest);
    if (!cur || (!isShortLink(cur) && isShortLink(url))) pick.set(dest, url);
  }
  const used = new Set();
  return items.filter(([, url]) => {
    const dest = finalUrl(url);
    if (used.has(dest) || pick.get(dest) !== url) return false;
    used.add(dest);
    return true;
  });
}

// --- 解析店家與品項 ---
const blocks = [...html.matchAll(
  /<div class="draw-store" data-draw-city="([^"]+)">([\s\S]*?)(?=<div class="draw-store" data-draw-city="|<div class="draw-city-group"|<\/body>)/g
)];
const stores = blocks.map(([, city, blk]) => ({
  city,
  store: blk.match(/draw-store-name">([^<]+)</)?.[1] ?? '',
  periods: [...blk.matchAll(/draw-start">([^<]*)</g)].map((m) => m[1]),
  items: dedupeByDest([...blk.matchAll(
    new RegExp(String.raw`draw-product">([^<]+)<\/div><a class="draw-link" href="(${LINK_SRC})[^"]*"`, 'g'),
  )].map((m) => [m[1], normLink(m[2])])),
  // 診斷用：抓到 0 筆時要分得出「上游還沒放連結」還是「連結長得跟正則不一樣」
  productCount: [...blk.matchAll(/draw-product">/g)].length,
  hrefs: [...blk.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]),
}));
console.log(`\n上游: ${stores.length} 家店 / ${stores.reduce((n, s) => n + s.items.length, 0)} 筆`);

// --- 對照本站店名（data/stores.tsv 的第一欄＝本站店名，第五欄＝上游店名） ---
const tsv = readFileSync(join(root, `${DATA}/stores.tsv`), 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
// 上游每批都會微調店名（Funbox／FunBox Toys-／多餘空格／尾綴「店」），用正規化鍵比對
const key = (n) =>
  n
    .toLowerCase()
    .replace(/[\s\-－–—_]/g, '')
    .replace(/^funbox(toys?)?/, '')
    .replace(/[（(][^）)]*[）)]$/, '')
    .replace(/店$/, '');
const bySrcName = new Map();
for (const r of tsv) {
  if (r[4]) bySrcName.set(key(r[4]), r[0]);
  bySrcName.set(key(r[0]), r[0]);
}
const matchStore = (srcName) => bySrcName.get(key(srcName)) ?? null;

const picked = stores.filter((s) => (all || matchStore(s.store)) && s.items.length);
const unmapped = stores.filter((s) => !matchStore(s.store) && s.items.length);
console.log(`已對照店名: ${stores.length - unmapped.length} 家；未對照: ${unmapped.length} 家`);
if (unmapped.length && !all) {
  console.log('  未對照（要收錄請在 data/draw/stores.tsv 補一列：本站店名<TAB>縣市<TAB>lat<TAB>lng<TAB>上游店名）:');
  for (const s of unmapped) console.log(`   [${s.city}] ${s.store} (${s.items.length}筆)`);
}

// --- 與現有正本比對 ---
const current = readFileSync(join(root, `${DATA}/source-links.txt`), 'utf8');
const currentUrls = new Set([...current.matchAll(linkRe('g'))].map((m) => m[0]));
const nextUrls = new Set(picked.flatMap((s) => s.items.map(([, u]) => u)));
const added = [...nextUrls].filter((u) => !currentUrls.has(u));
const removed = [...currentUrls].filter((u) => !nextUrls.has(u));
console.log(`\n與本站正本比對: 新增 ${added.length} 筆 / 消失 ${removed.length} 筆`);

// --- 家數對帳：「上游說 N 家、我們的頁面只有 M 家」要能一眼看出差在哪一家 ---
// （只印筆數的話，得自己把兩邊的店名抄下來比對）
const currentStores = new Map();
{
  let store = null;
  for (const raw of current.split('\n')) {
    const line = raw.trim();
    const h = line.match(/^\[(.+)\]$/);
    if (h) { store = h[1]; currentStores.set(store, { mark: '', items: 0 }); continue; }
    if (!store) continue;
    if (line.startsWith('@') && !currentStores.get(store).mark) currentStores.get(store).mark = line;
    if (isLinkLine(line)) currentStores.get(store).items += 1;
  }
}
const currentWithItems = [...currentStores].filter(([, v]) => v.items).map(([n]) => n);
const upstreamNames = picked.map((s) => matchStore(s.store) ?? s.store);
const missing = upstreamNames.filter((n) => !currentWithItems.includes(n));
const goneFromUpstream = currentWithItems.filter((n) => !upstreamNames.includes(n));
console.log(
  `\n家數對帳: 上游有品項 ${upstreamNames.length} 家` +
    `${unmapped.length ? `（另有 ${unmapped.length} 家店名未對照，不算在內）` : ''}` +
    ` / 正本已收錄 ${currentWithItems.length} 家`,
);
if (missing.length) console.log(`  上游有、正本還沒收（跑 --write 就會進來）: ${missing.join('、')}`);
if (goneFromUpstream.length) console.log(`  正本有、上游這批沒列（可能是人工從 VOOM 補的）: ${goneFromUpstream.join('、')}`);
if (!missing.length && !goneFromUpstream.length) console.log('  兩邊的店家名單一致');

// --- 待查清單：上游還沒收的店，去官方粉專／LINE 官方帳號看它是不是自己發了 -----
// 上游彙整頁常慢半拍，各店會先發在自己的 FB 粉專或 LINE VOOM。
// 這裡只產出「去哪看」的清單交給人工——FB 未登入抓不到貼文，機器掃不了。
{
  const official = new Map(
    readFileSync(join(root, `${DATA}/official.tsv`), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('\t'))
      .filter((r) => r[0])
      .map(([mine, , fb, oa]) => [mine, { fb, oa }]),
  );
  const voom = new Map(
    readFileSync(join(root, `${DATA}/voom.tsv`), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('\t')),
  );
  // @整修中 的店不列進待查清單：它不是「上游慢半拍」，是這家店這批本來就不會有抽選。
  const pending = [...currentStores]
    .filter(([n, v]) => !v.items && v.mark !== '@整修中' && (official.has(n) || voom.has(n)))
    .map(([n]) => n);
  if (pending.length) {
    console.log(`\n上游還沒收的店（${pending.length} 家）——各店可能已自己公布，去這裡看:`);
    for (const n of pending) {
      const o = official.get(n) ?? {};
      console.log(
        `   ${n}` +
          (o.oa ? ` ｜ LINE ${o.oa}` : '') +
          (voom.has(n) ? ` ｜ VOOM ${voom.get(n)}` : '') +
          (o.fb ? `\n      FB ${o.fb}` : ''),
      );
    }
    console.log('   → 查到有抽選就把品項與連結補進 data/draw/source-links.txt（sync 是增量合併，人工補的不會被覆寫）');
  }
}

// 上游列了店、卻一筆都抓不到——這是「上游 20 家但我們只有 19 家」的常見來源，
// 因為 picked 只收「有對照到店名且有品項」的店，0 筆的店會整家靜默消失。
const emptyUpstream = stores.filter((s) => !s.items.length);
if (emptyUpstream.length) {
  console.log(`\n上游列了店但抓到 0 筆（未計入上面的家數）: ${emptyUpstream.length} 家`);
  for (const s of emptyUpstream) {
    const hosts = [...new Set(s.hrefs.map((u) => u.split('/')[2]))];
    const mapped = matchStore(s.store);
    console.log(
      `   [${s.city}] ${s.store}${mapped ? `（＝本站「${mapped}」）` : '（店名未對照）'}` +
        ` — 品名 ${s.productCount} 個 / 連結 ${s.hrefs.length} 條` +
        `${hosts.length ? `，網域: ${hosts.join(', ')}` : ''}`,
    );
  }
  console.log(
    '   → 品名 0／連結 0 ＝ 上游還沒放連結，等它公布即可；' +
      '有品名或連結卻是 0 筆 ＝ 那家的連結格式與解析器不符（本程式認 lin.ee 短址與 liff.line.me 直連），要改 scripts/draw-links.mjs',
  );
}

if (!write) {
  console.log('\n（僅比對，未改檔。加 --write 才會覆寫 data/source-links.txt）');
  process.exit(0);
}

// --- 補 mapping：解析新的 lin.ee 轉址 ---
// liff 直連本身就是終點，不需要（也不能）解轉址；只有 lin.ee 短址要查 location
const needCodes = [...nextUrls].filter(isShortLink)
  .map((u) => u.split('/').pop()).filter((c) => !mapping.has(c));
console.log(`待解析轉址: ${needCodes.length} 筆`);
for (let i = 0; i < needCodes.length; i += 8) {
  const batch = needCodes.slice(i, i + 8);
  const rows = await Promise.all(batch.map(async (code) => {
    const r = await fetch(`https://lin.ee/${code}`, { redirect: 'manual' }).catch(() => null);
    return [code, r?.headers.get('location') ?? 'FAIL'];
  }));
  for (const [code, loc] of rows) { mapping.set(code, loc); appendFileSync(join(root, `${DATA}/mapping.tsv`), `${code}\t${loc}\n`); }
  process.stdout.write(`\r  ${Math.min(i + 8, needCodes.length)}/${needCodes.length}`);
}
console.log('');
const fails = needCodes.filter((c) => mapping.get(c) === 'FAIL');
if (fails.length) console.log(`⚠️  轉址失敗 ${fails.length} 筆: ${fails.join(', ')}`);

// 轉址解完後再去重一次：第一輪去重時新短址還沒解析，看不出它和 liff 直連是同一場抽選
for (const s of picked) {
  const before = s.items.length;
  s.items = dedupeByDest(s.items);
  if (s.items.length !== before) console.log(`  去重（同終點）: ${s.store} ${before} → ${s.items.length} 筆`);
}

// --- 合併回正本（只換上游這批有列的店，其餘原封不動） ---
// 為什麼是合併不是覆寫：各店是逐日陸續公布的，覆寫會把還沒公布的店整批抹掉，
// 也會蓋掉手動從 VOOM 補進來的資料。
const lines = readFileSync(join(root, `${DATA}/source-links.txt`), 'utf8').split('\n');

/** 從上游的「抽選日期：2026/08/28 ～ 2026/08/29」取出 @起訖 標記 */
function roundMark(periods) {
  const dates = [
    ...new Set(
      periods
        .join(' ')
        .match(/20\d\d\/\d{1,2}\/\d{1,2}/g)
        ?.map((d) => d.replace(/\//g, '-').replace(/-(\d)(?!\d)/g, '-0$1')) ?? [],
    ),
  ].sort();
  if (!dates.length) return null;
  return dates.length > 1 ? `@${dates[0]}~${dates[dates.length - 1]}` : `@${dates[0]}`;
}

/** 這批上游的日期（同一頁＝同一批），個別店家解析不到 draw-start 時的後備值 */
const markTally = new Map();
for (const s of picked) {
  const mk = roundMark(s.periods);
  if (mk) markTally.set(mk, (markTally.get(mk) ?? 0) + 1);
}
const batchMark = [...markTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
const isDateMark = (mk) => /^@\d{4}-\d{2}-\d{2}/.test(mk);

// 作廢短址（data/draw/link_drops.tsv）：上游列出、但店家後來換掉的購買券。
// 同批取聯集的關係，光在正本改連結會被上游那條併回來、變成同品項兩條——這裡是唯一的拒收點。
const dropped = new Set(
  readFileSync(join(root, `${DATA}/link_drops.tsv`), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t')[0].trim())
    .filter(Boolean),
);
const codeOf = (u) => String(u).match(/^https:\/\/lin\.ee\/([A-Za-z0-9]+)$/)?.[1] ?? '';
const byStore = new Map(
  picked.map((s) => [
    matchStore(s.store) ?? s.store,
    { ...s, items: s.items.filter(([, u]) => !dropped.has(codeOf(u))) },
  ]),
);
{
  const hit = picked.flatMap((s) => s.items).filter(([, u]) => dropped.has(codeOf(u)));
  if (hit.length) console.log(`拒收作廢短址 ${hit.length} 筆: ${hit.map(([, u]) => codeOf(u)).join(', ')}`);
}
const out = [];
const changed = [];
const inherited = [];
let i = 0;
while (i < lines.length) {
  const m = lines[i].trim().match(/^\[(.+)\]$/);
  if (!m) { out.push(lines[i]); i += 1; continue; }

  const store = m[1];
  const body = [];
  i += 1;
  while (i < lines.length && !/^\[.+\]$|^###/.test(lines[i].trim())) { body.push(lines[i]); i += 1; }

  const up = byStore.get(store);
  if (!up) { out.push(`[${store}]`, ...body); continue; }

  // 既有品項（品名＋網址成對）
  const prev = [];
  for (let k = 0; k < body.length; k += 1) {
    const url = body[k].trim();
    if (isLinkLine(url) && k > 0) prev.push([body[k - 1].trim(), url]);
  }
  const prevMark = body.map((l) => l.trim()).find((l) => l.startsWith('@')) ?? '';
  // 上游有時只在部分店家標抽選日期（同一頁的其他店照樣有）。這時**絕不能**寫回空白：
  // 沒有 @日期 的店在頁面上不屬於任何批次，會從彙總與「進行中」名單裡靜默消失
  // （2026-08-27 實際發生：16 家有品項的店只剩 1 家有日期，頁面顯示「1 家」）。
  // 後備順序：上游本次的日期 → 正本既有的 @日期 → 這批其他店的日期（新公布的店）→ 正本原樣。
  const upMark = roundMark(up.periods) ?? '';
  const mark = upMark || (isDateMark(prevMark) ? prevMark : batchMark || prevMark);
  if (!upMark && mark) inherited.push(`${store} → ${mark}${isDateMark(prevMark) ? '（沿用正本）' : '（沿用這批）'}`);

  // 同一批次以「開始日」判定：上游常先只給開始日、之後才補上結束日（@2026-08-28 → @2026-08-28~2026-08-29），
  // 比整串會誤判成換批、把人工補的資料洗掉。
  const startOf = (mk) => (mk.startsWith('@') ? mk.slice(1).split('~')[0] : '');
  const sameRound = !!mark && startOf(prevMark) === startOf(mark);
  const upUrls = new Set(up.items.map(([, u]) => u));
  // 換批（開始日不同，或原本是 @待公布）：整個換掉，舊批次的連結一律作廢
  const keep = sameRound ? prev.filter(([, u]) => !upUrls.has(u)) : [];
  const dropped = sameRound ? [] : prev.filter(([, u]) => !upUrls.has(u));
  const prevUrls = new Set(prev.map(([, u]) => u));
  const added = up.items.filter(([, u]) => !prevUrls.has(u));
  if (added.length || dropped.length)
    changed.push({ store, added: added.length, gone: dropped.length, kept: keep.length });

  out.push(`[${store}]`);
  if (mark) out.push(mark);
  for (const [n, u] of up.items) out.push(n, u);
  for (const [n, u] of keep) out.push(n, u);
  out.push('');
  byStore.delete(store);
}

// 上游有、正本沒有的店（新開的店）append 到最後，等人工補座標與縣市分區
for (const [name, up] of byStore) {
  out.push('', `### ${up.city}`, '', `[${name}]`);
  const mark = roundMark(up.periods) ?? batchMark;
  if (mark) out.push(mark);
  if (!roundMark(up.periods) && mark) inherited.push(`${name} → ${mark}（沿用這批）`);
  for (const [n, u] of up.items) out.push(n, u);
  out.push('');
  changed.push({ store: name, added: up.items.length, gone: 0, isNew: true });
}

writeFileSync(join(root, `${DATA}/source-links.txt`), out.join('\n'));
console.log('');
if (!changed.length) {
  console.log('正本沒有變動');
} else {
  for (const c of changed) {
    const kept = c.kept ? ` （保留人工補的 ${c.kept} 筆）` : '';
    console.log(`  ${c.isNew ? '新店家 ' : ''}${c.store}: +${c.added} -${c.gone}${kept}`);
  }
}
if (inherited.length) {
  console.log(`\n上游沒給抽選日期、沿用既有／本批日期的店（${inherited.length} 家）:`);
  for (const l of inherited) console.log(`  ${l}`);
}
console.log(`\ndata/draw/source-links.txt 已更新（上游 ${picked.length} 家 / ${[...nextUrls].length} 筆）`);
console.log('接著跑: npm run draw:build');
