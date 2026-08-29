// 抽選目錄的品名處理：型號抽取（tagOf）與品名一致化（normalizeItemName）。
// 這裡是 tagOf 的唯一來源，draw-build.mjs 直接 import。
// （public/draw/index.html 另有一份同演算法的 tagOf：那頁是純靜態單檔、
//   import 不到這裡，改動兩邊要一起改。）

/**
 * `BX-51 旋風發射器` / `BX-35-04` → `BX-51` / `BX-35`；抓不到編號就退成純字母（BXG）
 * @param {string} name
 * @returns {string|null}
 */
export function tagOf(name) {
  const m = String(name).match(/^([A-Za-z]+)[-\s]?(\d{1,3})(?![0-9])/);
  if (m) return (m[1] + '-' + m[2]).toUpperCase();
  const f = String(name).match(/^([A-Za-z]+)/);
  return f ? f[1].toUpperCase() : null;
}

/**
 * 把 item_names.tsv 的列（已過濾註解與空行）轉成 型號 → 標準品名。
 * 同一型號出現兩次就 throw：兩個標準名並存等於沒有標準。
 * @param {string[][]} rows
 * @returns {Map<string, string>}
 */
export function parseItemNames(rows) {
  const map = new Map();
  const dupes = [];
  for (const [tag, std] of rows) {
    const key = String(tag ?? '').trim().toUpperCase();
    const name = String(std ?? '').trim();
    if (!key || !name) continue;
    if (map.has(key)) dupes.push(key);
    map.set(key, name);
  }
  if (dupes.length)
    throw new Error(
      `data/draw/item_names.tsv 有重複型號: ${[...new Set(dupes)].join(', ')}\n` +
        `→ 一個型號只能有一個標準品名`,
    );
  return map;
}

/**
 * 括號註記裡「這品項幾號幾點才開賣」的部分——同一批裡少數品項會晚一天開，
 * 各店開始時間還不一樣（10:00／10:30／11:00）。這是使用者真的要看的資訊，
 * 不是價格那種雜訊，一致化時必須原樣留著。
 * 只認含日期／時刻／「開始」「開賣」字樣的括號段；`（原價$850）`、`（不含陀螺）`、
 * `（黑）` 都不會命中——那些要嘛是雜訊、要嘛已經寫進標準品名了。
 */
const TIME_NOTE_RE = /[（(][^）)]*(?:才開始|開始|開賣|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2})[^）)]*[）)]/g;

/**
 * 各店原文 → 標準品名（保留開賣時間註記）。型號不在表裡就回傳 null，
 * 由呼叫端決定沿用原文並回報。
 * @param {string} name
 * @param {Map<string, string>} map
 * @returns {string|null}
 */
export function normalizeItemName(name, map) {
  const tag = tagOf(name);
  if (!tag || !map.has(tag)) return null;
  const notes = String(name).match(TIME_NOTE_RE) ?? [];
  return map.get(tag) + notes.join('');
}

/**
 * 店內品項排序：新進的排上面。同一家店的品項依（分組線 g 不打散 → 第一次出現時間新→舊 →
 * 原始順序）排序——正本與上游都是「新資料 append 在後」，不排的話當天的熱門新品
 * （像 UX-21）永遠沉在每家店的最底下。時間一樣（同一輪 sync 進來）就保持原順序。
 * @param {{g: number, u: string, r?: string}[]} storeItems 同一家店的品項（原始順序；帳本鍵用正本原始網址 r，沒有才退 u）
 * @param {Map<string, string>} seenAt 網址 → 'YYYY-MM-DD HH:MM'
 */
export function orderStoreItems(storeItems, seenAt) {
  return storeItems
    .map((it, idx) => ({ it, idx, ts: seenAt.get(it.r ?? it.u) ?? '' }))
    .sort((a, b) => a.it.g - b.it.g || (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0) || a.idx - b.idx)
    .map((x) => x.it);
}
