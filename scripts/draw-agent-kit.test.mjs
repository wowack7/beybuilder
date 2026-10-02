import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip, docHasVersion, kitDate, kitVersion } from './draw-agent-kit.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const KIT = join(root, 'data/draw/agent-kit');
const SKILL = 'iphone-beyblade-draw/SKILL.md';
const GUIDE = '朋友使用提示詞與網站教學.md';
const version = kitVersion(readFileSync(join(root, 'public/draw/index.html'), 'utf8'));
const zipPath = join(root, `public/draw/iphone-beyblade-draw-${version}.zip`);

describe('kitVersion', () => {
  it('讀出 index.html 的 AGENT_KIT_VERSION', () => {
    expect(kitVersion("var AGENT_KIT_VERSION = '2026-10-03';")).toBe('2026-10-03');
  });
  it('接受同日改版的字母尾碼', () => {
    expect(kitVersion("var AGENT_KIT_VERSION = '2026-10-03b';")).toBe('2026-10-03b');
    expect(kitDate('2026-10-03b').getDate()).toBe(3);
  });
  it('文件版本要完全相符：尾碼不同不算', () => {
    expect(docHasVersion('版本：2026-10-03b（…）', '2026-10-03b')).toBe(true);
    expect(docHasVersion('版本：2026-10-03b（…）', '2026-10-03')).toBe(false);
    expect(docHasVersion('版本：2026-10-03（…）', '2026-10-03b')).toBe(false);
  });
  it('找不到就 throw，不靜默給空字串', () => {
    expect(() => kitVersion('nothing here')).toThrow();
  });
});

describe('buildZip', () => {
  const zip = buildZip([{ name: '中文.md', data: Buffer.from('hi') }], new Date('2026-10-03T00:00:00'));
  it('檔頭與結尾簽章正確', () => {
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });
  it('設 UTF-8 檔名旗標：中文檔名在 Windows 不亂碼', () => {
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
  });
  it('同內容同日期產出同位元組（不白白進 diff）', () => {
    const again = buildZip([{ name: '中文.md', data: Buffer.from('hi') }], new Date('2026-10-03T00:00:00'));
    expect(again.equals(zip)).toBe(true);
  });
});

// 需求書：技能包、教學、文件版本必須一致。網站改了版本、文件或 zip 沒跟上，就在這裡紅燈
describe('技能包與網站版本一致', () => {
  it('兩份文件都寫著網站的版本', () => {
    for (const f of [SKILL, GUIDE]) {
      expect(docHasVersion(readFileSync(join(KIT, f), 'utf8'), version), f).toBe(true);
    }
  });
  it('教學連到的 zip 存在，且只留目前版本', () => {
    expect(existsSync(zipPath)).toBe(true);
    const zips = readdirSync(join(root, 'public/draw')).filter((n) => /^iphone-beyblade-draw-.*\.zip$/.test(n));
    expect(zips).toEqual([`iphone-beyblade-draw-${version}.zip`]);
  });
  it('網站「複製開始提示詞」與教學文件的開始提示詞一字不差', () => {
    const html = readFileSync(join(root, 'public/draw/index.html'), 'utf8');
    const block = html.match(/var AGENT_START_PROMPT = \[([\s\S]*?)\]\.join/);
    expect(block, 'index.html 找不到 AGENT_START_PROMPT').not.toBeNull();
    const lines = [...block[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)]
      .flatMap((m) => m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").split('\n'));
    const guide = readFileSync(join(KIT, GUIDE), 'utf8');
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(guide, line).toContain(`> ${line}`);
  });
  it('zip 是用目前的文件打包的（改了文件要 npm run draw:agent-kit）', () => {
    const fresh = buildZip(
      [SKILL, GUIDE].sort().map((name) => ({ name, data: readFileSync(join(KIT, name)) })),
      kitDate(version),
    );
    expect(fresh.equals(readFileSync(zipPath))).toBe(true);
  });
});
