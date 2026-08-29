import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeItemName, orderStoreItems, parseItemNames, tagOf } from './draw-items.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('tagOf', () => {
  it('抓得到有空格與沒空格的型號', () => {
    expect(tagOf('BX-51 旋風發射器 黑綠')).toBe('BX-51');
    expect(tagOf('BX-10極限衝擊戰鬥盤')).toBe('BX-10');
    expect(tagOf('BX25 戰鬥陀螺X專業收納包')).toBe('BX-25');
    expect(tagOf('BXG 04 銀牙烈虎S')).toBe('BXG-04');
  });

  it('不把後綴數字吃進型號', () => {
    expect(tagOf('BX-35-04')).toBe('BX-35');
    expect(tagOf('BX-00 暴風天馬3-70RA')).toBe('BX-00');
  });

  it('抓不到編號就退成純字母，完全抓不到就 null', () => {
    expect(tagOf('BXG 銀牙烈虎')).toBe('BXG');
    expect(tagOf('隨機強化組')).toBeNull();
  });
});

describe('parseItemNames', () => {
  it('略過空白列並統一大寫鍵', () => {
    const map = parseItemNames([['bx-51', 'BX-51 旋風發射器 黑綠'], ['', ''], ['BX-45', '']]);
    expect(map.get('BX-51')).toBe('BX-51 旋風發射器 黑綠');
    expect(map.has('BX-45')).toBe(false);
  });

  it('同型號兩個標準名就 throw', () => {
    expect(() => parseItemNames([['BX-51', '甲'], ['BX-51', '乙']])).toThrow(/重複型號/);
  });
});

describe('normalizeItemName', () => {
  const map = parseItemNames([
    ['BX-51', 'BX-51 旋風發射器 黑綠'],
    ['UX-19', 'UX-19 子彈獅鷲H'],
  ]);

  it('把價格尾綴、括號、錯字都收斂成同一個名字', () => {
    for (const raw of [
      'BX-51 旋風發射器 黑綠 250元',
      'BX-51旋風發射器（黑綠）',
      'BX-51 炫風發射器黑綠 售價250元',
      'BX-51 旋風發射器(黑綠)(原價$250)',
    ])
      expect(normalizeItemName(raw, map)).toBe('BX-51 旋風發射器 黑綠');
    expect(normalizeItemName('UX-19 子彈獅鳶', map)).toBe('UX-19 子彈獅鷲H');
  });

  it('型號不在表裡回 null（呼叫端沿用原文）', () => {
    expect(normalizeItemName('BX-99 還沒收錄的新品', map)).toBeNull();
    expect(normalizeItemName('沒有型號的東西', map)).toBeNull();
  });
});

describe('開賣時間註記', () => {
  const map = parseItemNames([['UX-21', 'UX-21 惡魔冥界改造組']]);

  it('丟掉價格但留住「幾點才開始」', () => {
    expect(normalizeItemName('UX-21 惡魔冥界改造組 895元（8/29 10:30才開始）', map))
      .toBe('UX-21 惡魔冥界改造組（8/29 10:30才開始）');
    expect(normalizeItemName('UX-21 惡魔幽冥改造組 - 原價$895（8/29 10:00才開始）', map))
      .toBe('UX-21 惡魔冥界改造組（8/29 10:00才開始）');
  });

  it('不把價格括號或商品描述括號當成註記留下來', () => {
    const m2 = parseItemNames([['BX-10', 'BX-10 極限衝擊戰鬥盤']]);
    expect(normalizeItemName('BX-10極限衝擊戰鬥盤 (原價$850)', m2)).toBe('BX-10 極限衝擊戰鬥盤');
    expect(normalizeItemName('BX-10 極限衝擊戰鬥盤（不含陀螺）-價格850元', m2)).toBe('BX-10 極限衝擊戰鬥盤');
  });
});

describe('真實正本：一致化不得吃掉開賣時間', () => {
  // 2026-08-28 踩過：UX-21 明天才開賣、各店 10:00／10:30／11:00 不同，
  // 一致化把整個品名換成標準名，27 筆的開賣時間全被洗掉。
  const map = parseItemNames(
    readFileSync(join(root, 'data/draw/item_names.tsv'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('\t')),
  );
  const L = readFileSync(join(root, 'data/draw/source-links.txt'), 'utf8').split('\n');
  const names = L.filter((l, i) => {
    const t = l.trim();
    if (!t || t.startsWith('#') || t.startsWith('[') || t.startsWith('@') || t === '—') return false;
    if (/^https?:\/\//.test(t)) return false;
    return /^https?:\/\//.test((L[i + 1] ?? '').trim());
  }).map((l) => l.trim());

  it('每個帶時間註記的品名，一致化後註記還在', () => {
    const noteRe = /[（(][^）)]*(?:才開始|開賣)[^）)]*[）)]/;
    const withNote = names.filter((n) => noteRe.test(n));
    expect(withNote.length).toBeGreaterThan(0);
    const lost = withNote.filter((n) => {
      const out = normalizeItemName(n, map) ?? n;
      return !out.includes(n.match(noteRe)[0]);
    });
    expect(lost).toEqual([]);
  });
});

describe('item_names.tsv 正本', () => {
  const rows = readFileSync(join(root, 'data/draw/item_names.tsv'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t'));

  it('本身能通過重複檢查', () => {
    expect(() => parseItemNames(rows)).not.toThrow();
  });

  it('標準品名的型號前綴要跟鍵一致', () => {
    for (const [tag, std] of rows) expect(tagOf(std)).toBe(tag.trim().toUpperCase());
  });

  it('標準品名本身不能夾帶價格', () => {
    for (const [, std] of rows) expect(std).not.toMatch(/\d+\s*元|原價|\$\d|價格/);
  });
});

describe('orderStoreItems', () => {
  const seen = new Map([
    ['u/old1', '2026-08-27 20:00'],
    ['u/old2', '2026-08-27 20:00'],
    ['u/new1', '2026-08-28 23:55'],
  ]);

  it('新進的排上面，同時間保持原順序', () => {
    const items = [
      { g: 1, u: 'u/old1' },
      { g: 1, u: 'u/old2' },
      { g: 1, u: 'u/new1' },
    ];
    expect(orderStoreItems(items, seen).map((i) => i.u)).toEqual(['u/new1', 'u/old1', 'u/old2']);
  });

  it('分組線（g）不被打散：組間維持、組內各自新的在前', () => {
    const items = [
      { g: 1, u: 'u/old1' },
      { g: 2, u: 'u/old2' },
      { g: 2, u: 'u/new1' },
    ];
    expect(orderStoreItems(items, seen).map((i) => i.u)).toEqual(['u/old1', 'u/new1', 'u/old2']);
  });

  it('帳本沒有的網址（不該發生，防禦）排在最後', () => {
    const items = [
      { g: 1, u: 'u/ghost' },
      { g: 1, u: 'u/old1' },
    ];
    expect(orderStoreItems(items, seen).map((i) => i.u)).toEqual(['u/old1', 'u/ghost']);
  });
});
