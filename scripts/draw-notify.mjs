// 抽選目錄的 TG 通知：站上多了新的「店×品項×券連結」就發一則到戰鬥陀螺補貨群。
//
//   node scripts/draw-notify.mjs          # diff 上次通知過的集合，有新品項才發
//   node scripts/draw-notify.mjs --dry    # 只印不發、不動狀態檔
//   node scripts/draw-notify.mjs --seed   # 把「現在的全部品項」記為已通知（第一次接上時用）
//   node scripts/draw-notify.mjs --test   # 發一行接線測試訊息
//
// 與 funbox-bot（同機的補貨追蹤專案）合作：bot token 與群組 chat_id 的唯一來源是
// funbox-bot 的 config.json，這裡只放一個指過去的本機指標檔 data/draw/notify.local.json
// （{"funboxConfig": "<絕對路徑>"}，gitignored）——bot 換掉時只改那邊。
//
// 反轟炸設計：狀態檔 data/draw/.notify-state.json（gitignored）記「已通知過的 店×券URL」，
// 每次只發差集；狀態檔不存在＝第一次跑，**靜默播種不發**（不然接上的瞬間會把
// 八百多筆全轟進群）。指標檔不存在＝這台機器沒接通知，印一行就退出（exit 0，
// 排程在別台機器跑也不會炸）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'data/draw';
const STATE = join(root, DATA, '.notify-state.json');
const LOCAL = join(root, DATA, 'notify.local.json');
const SITE = 'https://beybuilder.5-seven.dog/draw/';
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const seed = args.includes('--seed');
const test = args.includes('--test');

/** data.js 是 `window.FUNBOX_DATA = {...}`：給它一個假 window 執行，拿整包資料 */
export function parseDataJs(src) {
  const w = {};
  new Function('window', src)(w);
  return w.FUNBOX_DATA;
}

export const keyOf = (i) => `${i.s} ${i.u}`;

/** 這次站上有、但還沒通知過的品項 */
export function diffNewItems(seenKeys, items) {
  const seen = new Set(seenKeys);
  return items.filter((i) => !seen.has(keyOf(i)));
}

/**
 * 組 TG 訊息（HTML，與 funbox-bot 同格式）。依店分組；店太多就截斷成摘要，
 * 訊息永遠帶站連結——細節讓人到站上看，群裡只要「有新的、在哪幾家」。
 */
export function formatNotify(newItems, { maxStores = 12 } = {}) {
  const byStore = new Map();
  for (const i of newItems) {
    if (!byStore.has(i.s)) byStore.set(i.s, []);
    byStore.get(i.s).push(i.n);
  }
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [`🎯 抽選目錄更新 +${newItems.length} 筆`];
  const stores = [...byStore.entries()];
  for (const [store, names] of stores.slice(0, maxStores))
    lines.push(`【${esc(store)}】${esc(names.join('、'))}`);
  if (stores.length > maxStores) lines.push(`…另有 ${stores.length - maxStores} 家，詳見網站`);
  lines.push(SITE);
  return lines.join('\n');
}

async function tgSend(cfgPath, text) {
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const { bot_token: token, chat_id: chatId } = cfg.telegram ?? {};
  if (!token || !chatId) throw new Error(`${cfgPath} 裡沒有 telegram.bot_token / chat_id`);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`Telegram 拒絕: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
}

async function main() {
  if (!existsSync(LOCAL)) {
    console.log(`未設定 ${DATA}/notify.local.json（{"funboxConfig": "<funbox-bot config.json 路徑>"}），跳過通知`);
    return;
  }
  const cfgPath = JSON.parse(readFileSync(LOCAL, 'utf8')).funboxConfig;
  if (test) {
    await tgSend(cfgPath, '🔔 beybuilder 抽選通知已接上（測試訊息）\n' + SITE);
    console.log('測試訊息已發送');
    return;
  }
  const data = parseDataJs(readFileSync(join(root, 'public/draw/data.js'), 'utf8'));
  const items = data.items ?? [];
  const firstRun = !existsSync(STATE);
  const seenKeys = firstRun ? [] : (JSON.parse(readFileSync(STATE, 'utf8')).seen ?? []);
  const fresh = diffNewItems(seenKeys, items);
  if (seed || firstRun) {
    // 第一次接上（或明確要求播種）：把現況全記為已通知，不發——避免整站轟進群
    if (!dry) writeFileSync(STATE, JSON.stringify({ seen: items.map(keyOf) }));
    console.log(`${firstRun && !seed ? '狀態檔不存在，' : ''}已播種 ${items.length} 筆為「已通知」，未發送`);
    return;
  }
  if (!fresh.length) {
    console.log('沒有新品項，不發通知');
    return;
  }
  const msg = formatNotify(fresh);
  if (dry) {
    console.log('--dry，僅預覽：\n' + msg);
    return;
  }
  await tgSend(cfgPath, msg);
  writeFileSync(STATE, JSON.stringify({ seen: items.map(keyOf) }));
  console.log(`已通知 ${fresh.length} 筆新品項（${new Set(fresh.map((i) => i.s)).size} 家）`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
