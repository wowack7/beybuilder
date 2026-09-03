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
  if (m) {
    const tag = (m[1] + '-' + m[2]).toUpperCase();
    // 00 是「特別版／限定」共用的型號：BX-00 同時有暴風天馬與蒼龍神劍，光看型號分不開，
    // 篩選籤與階級都會混成一顆。鍵加掛品名（型號後第一段中文），抓不到品名就退回純型號。
    if (m[2] === '00') {
      const blade = String(name).slice(m[0].length).match(/^\s*([\u4e00-\u9fff]+)/);
      if (blade) return `${tag} ${blade[1]}`;
    }
    return tag;
  }
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
 * 找出這個原文該用 item_names.tsv 的哪個鍵：先型號，再退原文全名。
 * 為什麼要有全名鍵：有些品項整個沒有型號（新店誠品的「孩之寶系列（依照賣場實際款式為主）」
 * 是整系列款、開頭就是中文），tagOf 一定回 null，只靠型號鍵永遠進不了表——
 * 而 build 的提示又叫人「補一列進 item_names.tsv」，補了卻無效。
 * 全名鍵先試原文、再試去掉開賣時間註記後的版本，讓同一列同時吃得到
 * 「孩之寶系列（…）」與「孩之寶系列（…）（9/5 10:00才開始）」。
 * @param {string} name
 * @param {Map<string, string>} map
 * @returns {string|null}
 */
function keyOf(name, map) {
  const tag = tagOf(name);
  if (tag && map.has(tag)) return tag;
  const raw = String(name).trim().toUpperCase();
  if (map.has(raw)) return raw;
  const stripped = String(name).replace(TIME_NOTE_RE, '').trim().toUpperCase();
  return map.has(stripped) ? stripped : null;
}

/**
 * 各店原文 → 標準品名（保留開賣時間註記）。型號與原文全名都不在表裡就回傳 null，
 * 由呼叫端決定沿用原文並回報。
 * @param {string} name
 * @param {Map<string, string>} map
 * @returns {string|null}
 */
export function normalizeItemName(name, map) {
  const key = keyOf(name, map);
  if (!key) return null;
  const notes = String(name).match(TIME_NOTE_RE) ?? [];
  return map.get(key) + notes.join('');
}

/**
 * 店內品項排序：新進的排上面。同一家店的品項依（分組線 g 不打散 → 第一次出現時間新→舊 →
 * 原始順序）排序——正本與上游都是「新資料 append 在後」，不排的話當天的熱門新品
 * （像 UX-21）永遠沉在每家店的最底下。時間一樣（同一輪 sync 進來）就保持原順序。
 * @param {{g: number, u: string, r?: string}[]} storeItems 同一家店的品項（原始順序；帳本鍵用正本原始網址 r，沒有才退 u）
 * @param {Map<string, string>} seenAt 網址 → 'YYYY-MM-DD HH:MM'
 */
/**
 * @param rankOf 同一時間進來的品項再依這個排（小的在前）——build 端傳天梯階級，
 *   讓整批同時上線時強的在前、配件殿後，而不是照上游原順序。沒傳＝只看時間與原序。
 */
export function orderStoreItems(storeItems, seenAt, rankOf = () => 0) {
  return storeItems
    .map((it, idx) => ({ it, idx, ts: seenAt.get(it.r ?? it.u) ?? '', rk: rankOf(it) }))
    .sort((a, b) => a.it.g - b.it.g || (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0) || a.rk - b.rk || a.idx - b.idx)
    .map((x) => x.it);
}
