import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const rows = (rel) =>
  read(rel)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t'));

describe('link_drops.tsv 作廢短址表', () => {
  const drops = rows('data/draw/link_drops.tsv');

  it('每列至少有 code 與原因，code 不重複', () => {
    const codes = drops.map((r) => r[0]);
    expect(codes.every((c) => /^[A-Za-z0-9]+$/.test(c))).toBe(true);
    expect(drops.every((r) => (r[2] ?? '').length > 0)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('被作廢的 code 不可以還留在正本裡', () => {
    const src = read('data/draw/source-links.txt');
    for (const [code] of drops) expect(src).not.toContain(`lin.ee/${code}`);
  });

  it('「換成」欄若有填，那條必須已經在 mapping 與正本裡', () => {
    const src = read('data/draw/source-links.txt');
    const mapping = read('data/draw/mapping.tsv');
    for (const [, to] of drops) {
      if (!to) continue;
      expect(mapping).toContain(`${to}\t`);
      expect(src).toContain(`lin.ee/${to}`);
    }
  });
});

describe('店家對照一致性', () => {
  it('official.tsv 的本站店名都要真的存在於正本', () => {
    const declared = new Set(
      read('data/draw/source-links.txt')
        .split('\n')
        .map((l) => l.trim().match(/^\[(.+)\]$/)?.[1])
        .filter(Boolean),
    );
    const unknown = rows('data/draw/official.tsv')
      .map((r) => r[0])
      .filter((n) => !declared.has(n));
    expect(unknown).toEqual([]);
  });
});
