/**
 * 用「你自己已登入的 Chrome」去看各店粉專有沒有公布抽選。
 *
 * 為什麼要這樣做：上游彙整頁常慢半拍，各店會先發在自己的 FB 粉專；
 * 而 FB 未登入取不到貼文（會被導去登入牆），所以只能借用真實登入狀態。
 *
 * 用法（在你自己的機器上跑，雲端容器連不到 facebook.com）：
 *   npm run draw:fb            # 只看正本還沒收品項的店
 *   npm run draw:fb -- --all   # 看官方表上全部有粉專的店
 *   npm run draw:fb -- --headed --limit=5   # 看得到瀏覽器在做什麼、只掃 5 家（--limit 要用等號）
 *
 * 第一次跑會開一個瀏覽器視窗要你登入 FB（用的是專屬設定檔
 * data/draw/.fb-profile，不會碰你日常的 Chrome 設定檔，也不進版控）；
 * 登入一次之後 cookie 就留在那個設定檔裡，之後都能無頭跑。
 *
 * 這支腳本只讀不寫：查到的線索印出來，要不要補進 source-links.txt 由人決定。
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'data/draw';
const PROFILE = join(root, DATA, '.fb-profile');

const args = process.argv.slice(2);
const all = args.includes('--all');
const headed = args.includes('--headed');
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0) || Infinity;

/** 貼文裡出現這些字才算「可能公布了」；日期字樣另外抓 */
const KEYWORDS = ['抽選', '抽籤', '購買券', '販售', '登記', '預購'];
const DATE_RE = /\b\d{1,2}\/\d{1,2}\b/g;

/** 從一頁的純文字裡找線索——與瀏覽器無關，可單獨測試 */
export function extractLeads(text) {
  const hit = KEYWORDS.filter((k) => text.includes(k));
  const links = [...new Set(text.match(/https?:\/\/lin\.ee\/[A-Za-z0-9]+/g) ?? [])];
  const dates = [...new Set(text.match(DATE_RE) ?? [])].slice(0, 6);
  return { hit, links, dates, found: hit.length > 0 || links.length > 0 };
}

// 只削掉行尾，不能 trim()：official.tsv 的第一欄可以是空的（官方有這家、本站還沒收錄），
// 前導 tab 一被 trim 掉，欄位就整排左移——店名會被當成粉專網址送進 page.goto()
const readTsv = (f) =>
  readFileSync(join(root, DATA, f), 'utf8')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t'));

function targets() {
  const official = readTsv('official.tsv').filter(([mine, , fb]) => mine && fb);
  if (all) return official.map(([mine, , fb, oa]) => ({ store: mine, fb, oa }));

  // 只挑「正本裡還沒有任何品項」的店：已經收到的不必再看
  const src = readFileSync(join(root, DATA, 'source-links.txt'), 'utf8');
  const withItems = new Set();
  let cur = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    const h = line.match(/^\[(.+)\]$/);
    if (h) { cur = h[1]; continue; }
    if (cur && /^https?:\/\//.test(line)) withItems.add(cur);
  }
  return official
    .filter(([mine]) => !withItems.has(mine))
    .map(([mine, , fb, oa]) => ({ store: mine, fb, oa }));
}

async function main() {
  // playwright-core：這支用 channel:'chrome' 開你機器上的 Chrome，不需要 Playwright 自帶的瀏覽器。
  // 用完整版 playwright 會讓 CI 的 npm ci 每次多下載約 500MB 瀏覽器，而這支根本只能在本機跑。
  const { chromium } = await import('playwright-core');
  const list = targets().slice(0, limit);
  if (!list.length) {
    console.log('沒有要掃的店（正本已經全部收到品項了？可加 --all 掃全部）');
    return;
  }
  const firstRun = !existsSync(PROFILE);
  if (firstRun) mkdirSync(PROFILE, { recursive: true });

  console.log(`要掃 ${list.length} 家；設定檔 ${DATA}/.fb-profile${firstRun ? '（第一次，需要登入）' : ''}`);
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',            // 用你機器上的 Chrome，不是 Playwright 自帶的
    headless: !headed && !firstRun,
    viewport: { width: 500, height: 900 },
    locale: 'zh-TW',
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  if (firstRun) {
    await page.goto('https://www.facebook.com/');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('請在開啟的視窗裡登入 FB，完成後回到這裡按 Enter…');
    rl.close();
  }

  const results = [];
  for (const [i, t] of list.entries()) {
    process.stdout.write(`\r  ${i + 1}/${list.length} ${t.store}          `);
    try {
      await page.goto(t.fb, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      await page.mouse.wheel(0, 2000);       // 讓最新幾則貼文載進來
      await page.waitForTimeout(1500);
      const text = await page.evaluate(() => document.body.innerText.slice(0, 8000));
      const loginWall = /登入|Log in to Facebook/.test(text) && text.length < 1200;
      results.push({ ...t, ...extractLeads(text), loginWall });
    } catch (err) {
      results.push({ ...t, error: String(err).split('\n')[0], found: false });
    }
    await page.waitForTimeout(1500 + Math.floor(2000 * ((i * 7919) % 100) / 100)); // 節流，別狂打
  }
  await ctx.close();
  console.log('\n');

  const walls = results.filter((r) => r.loginWall);
  if (walls.length) console.log(`⚠️  ${walls.length} 家被登入牆擋住——登入可能過期了，刪掉 ${DATA}/.fb-profile 重跑一次\n`);

  const hits = results.filter((r) => r.found && !r.loginWall);
  console.log(`可能已公布（${hits.length} 家）:`);
  for (const r of hits) {
    console.log(`  ${r.store} ｜ ${r.hit.join('、') || '(只看到連結)'}${r.dates.length ? ` ｜ 日期 ${r.dates.join(' ')}` : ''}`);
    for (const u of r.links) console.log(`      ${u}`);
    console.log(`      ${r.fb}`);
  }
  const quiet = results.filter((r) => !r.found && !r.loginWall && !r.error);
  console.log(`\n看起來還沒公布: ${quiet.map((r) => r.store).join('、') || '(無)'}`);
  const errs = results.filter((r) => r.error);
  if (errs.length) console.log(`\n開不起來: ${errs.map((r) => `${r.store}(${r.error})`).join('、')}`);
  console.log('\n查到的品項與連結請人工補進 data/draw/source-links.txt（sync 是增量合併，不會被覆寫）');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
