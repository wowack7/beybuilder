import { describe, expect, it } from 'vitest';
import { applyCityOrder, attachStartTimes, parseCityOrder } from './draw-stores.mjs';

const st = (n, c, extra = {}) => ({ n, c, ...extra });

describe('applyCityOrder', () => {
  // 距離排序的結果：台北市與新北市穿插
  const stores = [st('A1', '台北市'), st('B1', '新北市'), st('A2', '台北市'), st('A3', '台北市'), st('B2', '新北市')];

  it('只換該縣市的店彼此的先後，跨縣市穿插的位置不動', () => {
    const out = applyCityOrder(stores, parseCityOrder([['台北市', 'A3'], ['台北市', 'A1'], ['台北市', 'A2']]));
    expect(out.map((s) => s.n)).toEqual(['A3', 'B1', 'A1', 'A2', 'B2']);
  });

  it('沒列到的店排在列到的之後，彼此維持原本（距離）順序', () => {
    const out = applyCityOrder(stores, parseCityOrder([['台北市', 'A3']]));
    expect(out.map((s) => s.n)).toEqual(['A3', 'B1', 'A1', 'A2', 'B2']);
  });

  it('沒列的縣市原封不動、不改動輸入陣列', () => {
    const copy = stores.slice();
    const out = applyCityOrder(stores, parseCityOrder([]));
    expect(out.map((s) => s.n)).toEqual(copy.map((s) => s.n));
    applyCityOrder(stores, parseCityOrder([['台北市', 'A3']]));
    expect(stores).toEqual(copy);
  });

  it('打錯店名、店不在該縣市、同店列兩次都要 throw（人工表不能靜默失效）', () => {
    expect(() => applyCityOrder(stores, parseCityOrder([['台北市', 'A9']]))).toThrow(/A9/);
    expect(() => applyCityOrder(stores, parseCityOrder([['台北市', 'B1']]))).toThrow(/B1/);
    expect(() => applyCityOrder(stores, parseCityOrder([['台北市', 'A1'], ['台北市', 'A1']]))).toThrow(/重複/);
  });
});

describe('attachStartTimes', () => {
  const stores = [st('A1', '台北市', { rs: '2026-09-11', re: '2026-09-12' }), st('A2', '台北市', { p: 1 })];

  it('開始日與這批相符才掛時間', () => {
    const out = attachStartTimes(stores, [['A1', '2026-09-11', '12:00']]);
    expect(out[0].t).toBe('12:00');
    expect(out[1].t).toBeUndefined();
    expect(stores[0].t).toBeUndefined(); // 不改動輸入
  });

  it('換批（開始日不同）自動失效，不必回頭刪表', () => {
    expect(attachStartTimes(stores, [['A1', '2026-09-04', '12:00']])[0].t).toBeUndefined();
  });

  it('日期／時間格式錯或店名對不到要 throw', () => {
    expect(() => attachStartTimes(stores, [['A1', '2026/09/11', '12:00']])).toThrow();
    expect(() => attachStartTimes(stores, [['A1', '2026-09-11', '12點']])).toThrow();
    expect(() => attachStartTimes(stores, [['A9', '2026-09-11', '12:00']])).toThrow(/A9/);
    expect(() => attachStartTimes(stores, [['A1', '2026-09-11', '12:00'], ['A1', '2026-09-11', '13:00']])).toThrow(/重複/);
  });
});
