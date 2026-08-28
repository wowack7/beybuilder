import { describe, expect, test } from 'vitest';
import { diffNewItems, formatNotify, keyOf, parseDataJs } from './draw-notify.mjs';

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
});
