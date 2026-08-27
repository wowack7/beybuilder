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
 * 各店原文 → 標準品名。型號不在表裡就回傳 null，由呼叫端決定沿用原文並回報。
 * @param {string} name
 * @param {Map<string, string>} map
 * @returns {string|null}
 */
export function normalizeItemName(name, map) {
  const tag = tagOf(name);
  return tag && map.has(tag) ? map.get(tag) : null;
}
