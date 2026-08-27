import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeItemName, parseItemNames, tagOf } from './draw-items.mjs';

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
