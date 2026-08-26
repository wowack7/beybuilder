// 從上游彙整頁同步抽選資料（來源網址放在不進版控的 data/source.local.json）
//   npm run draw:sync              # 只比對、不改檔（含過期偵測）
//   npm run draw:sync -- --write   # 覆寫 data/draw/source-links.txt 並補 data/draw/mapping.tsv
//   npm run draw:sync -- --write --all   # 收錄全部縣市（預設只收 stores.tsv 有座標的）
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// --- 解析店家與品項 ---
const blocks = [...html.matchAll(
  /<div class="draw-store" data-draw-city="([^"]+)">([\s\S]*?)(?=<div class="draw-store" data-draw-city="|<div class="draw-city-group"|<\/body>)/g
)];
const stores = blocks.map(([, city, blk]) => ({
  city,
  store: blk.match(/draw-store-name">([^<]+)</)?.[1] ?? '',
  periods: [...blk.matchAll(/draw-start">([^<]*)</g)].map((m) => m[1]),
  items: [...blk.matchAll(/draw-product">([^<]+)<\/div><a class="draw-link" href="(https:\/\/lin\.ee\/[A-Za-z0-9]+)"/g)]
    .map((m) => [m[1], m[2]]),
}));
console.log(`\n上游: ${stores.length} 家店 / ${stores.reduce((n, s) => n + s.items.length, 0)} 筆`);

// --- 對照本站店名（data/stores.tsv 的第一欄＝本站店名，第五欄＝上游店名） ---
const tsv = readFileSync(join(root, `${DATA}/stores.tsv`), 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
const bySrcName = new Map(tsv.filter((r) => r[4]).map((r) => [r[4], r[0]]));
const known = new Set(tsv.map((r) => r[0]));

const picked = stores.filter((s) => all || bySrcName.has(s.store));
const unmapped = stores.filter((s) => !bySrcName.has(s.store));
console.log(`已對照店名: ${stores.length - unmapped.length} 家；未對照: ${unmapped.length} 家`);
if (unmapped.length && !all) {
  console.log('  未對照（要收錄請在 data/draw/stores.tsv 補一列：本站店名<TAB>縣市<TAB>lat<TAB>lng<TAB>上游店名）:');
  for (const s of unmapped) console.log(`   [${s.city}] ${s.store} (${s.items.length}筆)`);
}

// --- 與現有正本比對 ---
const current = readFileSync(join(root, `${DATA}/source-links.txt`), 'utf8');
const currentUrls = new Set([...current.matchAll(/https:\/\/lin\.ee\/[A-Za-z0-9]+/g)].map((m) => m[0]));
const nextUrls = new Set(picked.flatMap((s) => s.items.map(([, u]) => u)));
const added = [...nextUrls].filter((u) => !currentUrls.has(u));
const removed = [...currentUrls].filter((u) => !nextUrls.has(u));
console.log(`\n與本站正本比對: 新增 ${added.length} 筆 / 消失 ${removed.length} 筆`);

if (!write) {
  console.log('\n（僅比對，未改檔。加 --write 才會覆寫 data/source-links.txt）');
  process.exit(0);
}

// --- 補 mapping：解析新的 lin.ee 轉址 ---
const mapping = new Map(readFileSync(join(root, `${DATA}/mapping.tsv`), 'utf8').split('\n')
  .map((l) => l.trim()).filter(Boolean).map((l) => l.split('\t')));
const needCodes = [...nextUrls].map((u) => u.split('/').pop()).filter((c) => !mapping.has(c));
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

// --- 寫回正本（依縣市分區；店內分組線不保留，上游沒有這個資訊） ---
const out = [
  '# 資料正本：以縣市分區，`### 縣市` → `[店名]` → 品名 ＋ lin.ee 網址；`—` 為店內分組線',
  `# 由 scripts/draw-sync.mjs 於 ${new Date().toISOString().slice(0, 10)} 同步`,
  `# 同步時上游提示：${reminder || '(無)'}`,
  '',
];
const cities = [...new Set(picked.map((s) => s.city))];
for (const c of cities) {
  out.push(`### ${c}`, '');
  for (const s of picked.filter((x) => x.city === c)) {
    out.push(`[${bySrcName.get(s.store) ?? s.store}]`);
    for (const [n, u] of s.items) out.push(n, u);
    out.push('');
  }
  out.push('');
}
writeFileSync(join(root, `${DATA}/source-links.txt`), out.join('\n'));
console.log(`\ndata/source-links.txt 已更新（${picked.length} 家 / ${[...nextUrls].length} 筆）`);
console.log('接著跑: npm run draw:build');
