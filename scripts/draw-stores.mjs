// 抽選目錄的店家層人工表（draw-build 用）：縣市內指定先後、晚開始時間。
// 都是手打的表，打錯字若靜默略過會變成「改了沒效」，所以對不到一律 throw。

/** data/draw/store_order.tsv 的列（[縣市, 店名]）→ Map(縣市 → 依列序的店名) */
export function parseCityOrder(rows) {
  const order = new Map();
  for (const [city, name] of rows) {
    if (!city || !name) continue;
    if (!order.has(city)) order.set(city, []);
    order.get(city).push(name);
  }
  return order;
}

/**
 * 依指定先後重排某縣市的店。只換該縣市的店彼此的先後，
 * 它們在清單裡佔的位置不動——跨縣市的穿插仍照距離排序（新北的店不會被整批擠到台北後面）。
 * 沒列到的店排在列到的之後，彼此維持原順序。回傳新陣列，不改動輸入。
 */
export function applyCityOrder(stores, order) {
  const out = stores.slice();
  for (const [city, names] of order) {
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    if (dup.length) throw new Error(`store_order.tsv 的 ${city} 重複列了: ${[...new Set(dup)].join(', ')}`);
    const slots = [];
    out.forEach((s, i) => { if (s.c === city) slots.push(i); });
    const inCity = slots.map((i) => out[i]);
    const unknown = names.filter((n) => !inCity.some((s) => s.n === n));
    if (unknown.length) throw new Error(`store_order.tsv 的 ${city} 對不到（打錯字或不在該縣市）: ${unknown.join(', ')}`);
    const listed = names.map((n) => inCity.find((s) => s.n === n));
    const rest = inCity.filter((s) => !names.includes(s.n));
    [...listed, ...rest].forEach((s, k) => { out[slots[k]] = s; });
  }
  return out;
}

/**
 * data/draw/start_times.tsv 的列（[店名, 開始日, HH:MM]）掛到店家的 t。
 * 開始日要等於該店這批的開始日（rs）才生效——換批自動失效，不必回頭刪表。
 */
export function attachStartTimes(stores, rows) {
  const byName = new Map();
  for (const [name, date, time] of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{2}:\d{2}$/.test(time ?? ''))
      throw new Error(`start_times.tsv 格式錯（要 店名<TAB>YYYY-MM-DD<TAB>HH:MM）: ${[name, date, time].join(' | ')}`);
    if (!stores.some((s) => s.n === name)) throw new Error(`start_times.tsv 對不到店名: ${name}`);
    if (byName.has(name)) throw new Error(`start_times.tsv 重複列了: ${name}`);
    byName.set(name, { date, time });
  }
  return stores.map((s) => {
    const hit = byName.get(s.n);
    return hit && s.rs === hit.date ? { ...s, t: hit.time } : s;
  });
}
