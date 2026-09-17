import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expireRounds, lastDay, todayStr } from './draw-expire.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SAMPLE = [
  '# 註解',
  '',
  '### 台北市',
  '',
  '[舊批]',
  '@2026-09-11~2026-09-12',
  'BX-01 甲',
  'https://lin.ee/aaa',
  '',
  '[今天結束]',
  '@2026-09-16~2026-09-17',
  'BX-02 乙',
  'https://lin.ee/bbb',
  '',
  '[未來]',
  '@2026-09-18',
  'BX-03 丙',
  'https://lin.ee/ccc',
  '',
  '[已待公布]',
  '@待公布',
  '',
  '[整修]',
  '@整修中',
  '',
].join('\n');

describe('lastDay', () => {
  it('單日批次的最後一天就是那天，區間取結束日', () => {
    expect(lastDay('@2026-09-04')).toBe('2026-09-04');
    expect(lastDay('@2026-09-11~2026-09-12')).toBe('2026-09-12');
  });

  it('@待公布、@整修中與沒有標記都不是有日期的批次', () => {
    expect(lastDay('@待公布')).toBe(null);
    expect(lastDay('@整修中')).toBe(null);
    expect(lastDay(undefined)).toBe(null);
  });
});

describe('todayStr', () => {
  it('用本地日期，不是 UTC（台灣清晨會早一天）', () => {
    expect(todayStr(new Date(2026, 8, 17, 1, 30))).toBe('2026-09-17');
  });
});

describe('expireRounds', () => {
  it('只清結束日已過的店，清成 @待公布', () => {
    const { text, cleared } = expireRounds(SAMPLE, '2026-09-17');
    expect(cleared).toEqual(['舊批']);
    expect(text).toContain('[舊批]\n@待公布');
    expect(text).not.toContain('lin.ee/aaa');
  });

  it('抽選當天不算過期，未來批次與 @待公布／@整修中 都不動', () => {
    const { text } = expireRounds(SAMPLE, '2026-09-17');
    expect(text).toContain('@2026-09-16~2026-09-17');
    expect(text).toContain('lin.ee/bbb');
    expect(text).toContain('@2026-09-18');
    expect(text).toContain('lin.ee/ccc');
    expect(text).toContain('[已待公布]\n@待公布');
    expect(text).toContain('[整修]\n@整修中');
  });

  it('縣市分區標題與檔頭註解留在原位', () => {
    const { text } = expireRounds(SAMPLE, '2026-09-17');
    expect(text.startsWith('# 註解')).toBe(true);
    expect(text).toContain('### 台北市');
  });

  it('跑第二次不再有變化（idempotent）', () => {
    const once = expireRounds(SAMPLE, '2026-09-17');
    const twice = expireRounds(once.text, '2026-09-17');
    expect(twice.cleared).toEqual([]);
    expect(twice.text).toBe(once.text);
  });

  it('正本現況：今天沒有過期的店（換批後要記得清）', () => {
    const src = readFileSync(join(root, 'data/draw/source-links.txt'), 'utf8');
    expect(expireRounds(src, todayStr()).cleared).toEqual([]);
  });
});
