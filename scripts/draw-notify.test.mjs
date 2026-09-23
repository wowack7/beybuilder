import { describe, expect, test } from 'vitest';
import { diffNewItems, formatNotify, isStoresOnly, keyOf, parseDataJs } from './draw-notify.mjs';

describe('parseDataJs', () => {
  test('吃得下 data.js 的 window 賦值形式', () => {
    const d = parseDataJs('window.FUNBOX_DATA = {"updated":"x","items":[{"s":"店","n":"品","u":"https://a"}]};');
    expect(d.items).toHaveLength(1);
  });
});

describe('diffNewItems', () => {
  const items = [
    { s: '信義A13', n: 'UX-21 惡魔冥界改造組', u: 'https://liff.line.me/x/1' },
    { s: '美麗華', n: 'BX-10 極限衝擊戰鬥盤', u: 'https://liff.line.me/x/2' },
  ];
  test('只留沒通知過的；同券換店算新的', () => {
    expect(diffNewItems([keyOf(items[0])], items)).toEqual([items[1]]);
    expect(diffNewItems(['別店 https://liff.line.me/x/1'], items)).toEqual(items);
  });
});

describe('formatNotify', () => {
  test('依店分組、帶總數與站連結、HTML 跳脫', () => {
    const msg = formatNotify([
      { s: '信義A13', n: 'UX-21 惡魔冥界改造組', u: 'u1' },
      { s: '信義A13', n: 'BX-10 <戰鬥盤>', u: 'u2' },
      { s: '美麗華', n: 'UX-19 子彈獅鷲H', u: 'u3' },
    ]);
    expect(msg).toContain('+3 筆');
    expect(msg).toContain('【信義A13】UX-21 惡魔冥界改造組、BX-10 &lt;戰鬥盤&gt;');
    expect(msg).toContain('【美麗華】UX-19 子彈獅鷲H');
    expect(msg).toContain('https://beybuilder.5-seven.dog/draw/');
  });

  test('店數超過上限就截斷成摘要，訊息不會無限長', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ s: `店${i}`, n: '品', u: `u${i}` }));
    const msg = formatNotify(many, { maxStores: 12 });
    expect(msg).toContain('…另有 8 家');
    expect(msg.split('\n')).toHaveLength(1 + 12 + 1 + 1); // 標題+12店+摘要+連結
  });

  test('storesOnly：只列店名（去重、照出現順序），不列品項', () => {
    const msg = formatNotify(
      [
        { s: '信義A13', n: 'UX-21 惡魔冥界改造組', u: 'u1' },
        { s: '美麗華', n: 'UX-19 子彈獅鷲H', u: 'u2' },
        { s: '信義A13', n: 'BX-10 極限衝擊戰鬥盤', u: 'u3' },
        { s: 'A&B', n: '品', u: 'u4' },
      ],
      { storesOnly: true },
    );
    expect(msg).toContain('+4 筆（3 家）');
    expect(msg).toContain('新公布：信義A13、美麗華、A&amp;B');
    expect(msg).not.toContain('UX-21');
    expect(msg).not.toContain('【');
    expect(msg).toContain('https://beybuilder.5-seven.dog/draw/');
  });
});

describe('isStoresOnly', () => {
  const stores = [
    { n: '信義A13', rs: '2026-09-24', re: '2026-09-25' },
    { n: '北車地下街', rs: '2026-09-24', re: '2026-09-25', t: '12:00' },
    { n: '美麗華', rs: '2026-09-17', re: '2026-09-18' },
  ];
  const at = (s) => new Date(s);
  const a13 = [{ s: '信義A13', n: 'UX-14', u: 'u1' }];

  test('批次開始日 11:00（台北）之前只報店名，11:00 起列品項——每批都適用，不綁死日期', () => {
    expect(isStoresOnly(a13, stores, at('2026-09-23T21:00:00+08:00'))).toBe(true);
    expect(isStoresOnly(a13, stores, at('2026-09-24T10:59:59+08:00'))).toBe(true);
    expect(isStoresOnly(a13, stores, at('2026-09-24T11:00:00+08:00'))).toBe(false);
  });

  test('晚開始的店（t）以它自己的時間為切點', () => {
    const late = [{ s: '北車地下街', n: 'X', u: 'u2' }];
    expect(isStoresOnly(late, stores, at('2026-09-24T11:30:00+08:00'))).toBe(true);
    expect(isStoresOnly(late, stores, at('2026-09-24T12:00:00+08:00'))).toBe(false);
  });

  test('新品項裡有任一家已開抽（零星補公布）→ 列品項', () => {
    const mixed = [...a13, { s: '美麗華', n: 'Y', u: 'u3' }];
    expect(isStoresOnly(mixed, stores, at('2026-09-23T21:00:00+08:00'))).toBe(false);
  });

  test('查不到店或沒有開始日 → 保守列品項', () => {
    expect(isStoresOnly([{ s: '不存在', n: 'Z', u: 'u4' }], stores, at('2026-09-23T21:00:00+08:00'))).toBe(false);
    expect(isStoresOnly([], stores, at('2026-09-23T21:00:00+08:00'))).toBe(false);
  });
});
