// 換批清場：把「抽選日已過」的店整塊清成 @待公布。
//
// 為什麼需要這支：draw-sync 是增量合併，只換上游這批有列的店；上游還沒公布的店會原封不動
// 留著上一批的連結。那些連結點得開卻抽不到（頁面掛「已結束」＋紅色橫幅），對使用者是錯的資訊。
// 頁面對這些店的正解是 @待公布（「上一批已結束，連結先移除；等各店公布後補上」）。
// 店家重新公布時 draw-sync／draw-voom 會把 @待公布 換回 @日期，不必回頭手動復原。
//
// 用法：node scripts/draw-expire.mjs           只列出要清的店，不改檔
//      node scripts/draw-expire.mjs --write    寫回 data/draw/source-links.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'data/draw/source-links.txt');

/** 本地日期的 YYYY-MM-DD。不能用 toISOString（那是 UTC，台灣清晨會早一天） */
export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 一段店家區塊的 @ 標記 → 這批的最後一天（單日的批次就是那天本身）。
 * @待公布／@整修中／沒有標記都回 null＝不是「有日期的批次」，一律不動。
 */
export const lastDay = (marker) => {
  const m = marker?.match(/^@(\d{4}-\d{2}-\d{2})(?:~(\d{4}-\d{2}-\d{2}))?$/);
  return m ? (m[2] ?? m[1]) : null;
};

/**
 * 正本全文 → { text, cleared }。cleared 是被清成 @待公布 的店名。
 * 判定與 public/draw/index.html 的 statusOf() 對齊：結束日 < 今天才算過期，
 * 所以抽選當天不會被清掉。純函式，不碰檔案。
 */
export function expireRounds(text, today) {
  const out = [];
  const cleared = [];
  let block = null;
  const flush = () => {
    if (!block) return;
    const marker = block.body.map((l) => l.trim()).find((l) => l.startsWith('@'));
    const end = lastDay(marker);
    if (end && end < today) {
      cleared.push(block.name);
      out.push(block.header, '@待公布', '');
    } else {
      out.push(block.header, ...block.body);
    }
    block = null;
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (/^\[.+\]$/.test(t)) { flush(); block = { name: t.slice(1, -1), header: line, body: [] }; continue; }
    if (t.startsWith('###')) { flush(); out.push(line); continue; }
    if (block) block.body.push(line);
    else out.push(line);
  }
  flush();
  // 清掉整塊品項會留下一串空行，壓回單一空行，維持正本原本的分段樣子
  const joined = out.join('\n').replace(/\n{3,}/g, '\n\n');
  return { text: joined.endsWith('\n') ? joined : joined + '\n', cleared };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const write = process.argv.includes('--write');
  const today = todayStr();
  const { text, cleared } = expireRounds(readFileSync(SRC, 'utf8'), today);
  console.log(`今天 ${today}；抽選日已過的店: ${cleared.length} 家`);
  if (cleared.length) console.log('  ' + cleared.join('、'));
  if (!cleared.length) console.log('（沒有要清的店，正本未更動）');
  else if (!write) console.log('（僅列出，未改檔。加 --write 才會寫回正本）');
  else {
    writeFileSync(SRC, text);
    console.log(`data/draw/source-links.txt 已更新（${cleared.length} 家清成 @待公布）\n接著跑: npm run draw:build`);
  }
}
