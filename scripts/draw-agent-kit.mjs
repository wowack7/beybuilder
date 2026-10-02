// 把 data/draw/agent-kit/ 打包成 /draw/ 教學裡「下載技能包」的 zip。
//
//   npm run draw:agent-kit
//
// 版本的唯一來源是 public/draw/index.html 的 AGENT_KIT_VERSION（教學、檔名、提示詞都吃它）。
// 版本格式 YYYY-MM-DD，同一天再改加字母尾碼（2026-10-03b），讓已下載的人看得出要重抓。
// 需求書要求三者一致，所以這支會檢查技能包裡的兩份文件都寫著同一個「版本：…」，
// 對不上就 throw——改了網站版本卻忘了改文件（或反過來）會在這裡被擋下。
//
// 不用 macOS 的 zip 指令：它不設 UTF-8 檔名旗標，中文檔名在 Windows 解開是亂碼。
// 時間戳固定為版本日期，內容沒變就產出一模一樣的位元組，不會白白進 diff。
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const KIT_DIR = join(root, 'data/draw/agent-kit');
const OUT_DIR = join(root, 'public/draw');

export function kitVersion(html) {
  const m = html.match(/var AGENT_KIT_VERSION = '(\d{4}-\d{2}-\d{2}[a-z]?)'/);
  if (!m) throw new Error('index.html 找不到 AGENT_KIT_VERSION');
  return m[1];
}

/** zip 內的檔案時間＝版本的日期部分（尾碼字母不算） */
export function kitDate(version) {
  return new Date(`${version.slice(0, 10)}T00:00:00`);
}

/** 文件寫的是不是「剛好」這個版本：2026-10-03 不能被 2026-10-03b 冒充，反之亦然 */
export function docHasVersion(text, version) {
  return new RegExp(`版本：${version}(?![0-9a-z])`).test(text);
}

function listFiles(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    if (name.startsWith('.')) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** 最小的 zip 寫入器：deflate、UTF-8 檔名旗標（bit 11）、固定時間戳 */
export function buildZip(entries, date) {
  const dosTime = 0;
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);          // made by: Unix, 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);   // 一般檔案 rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = kitVersion(readFileSync(join(OUT_DIR, 'index.html'), 'utf8'));
  const files = listFiles(KIT_DIR).filter((f) => f.endsWith('.md'));
  if (!files.length) throw new Error(`${KIT_DIR} 沒有任何 .md`);
  for (const f of files) {
    if (!docHasVersion(readFileSync(f, 'utf8'), version)) {
      throw new Error(`${relative(root, f)} 沒寫「版本：${version}」——網站與技能包版本必須一致`);
    }
  }
  const entries = files.map((f) => ({ name: relative(KIT_DIR, f).split(sep).join('/'), data: readFileSync(f) }));
  const zip = buildZip(entries, kitDate(version));
  const outName = `iphone-beyblade-draw-${version}.zip`;
  writeFileSync(join(OUT_DIR, outName), zip);
  // 舊版本的 zip 拿掉：教學只會連到目前版本，留著只是讓人下載到過期的技能
  for (const name of readdirSync(OUT_DIR)) {
    if (/^iphone-beyblade-draw-.*\.zip$/.test(name) && name !== outName) {
      unlinkSync(join(OUT_DIR, name));
      console.log(`移除舊版 public/draw/${name}`);
    }
  }
  console.log(`public/draw/${outName}（${entries.length} 個檔、${zip.length} bytes）：${entries.map((e) => e.name).join('、')}`);
}
