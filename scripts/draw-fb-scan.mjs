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
 *   npm run draw:fb -- --dump               # 另外把每家的貼文全文寫到 data/draw/.fb-dump/
 *
 * --dump 的用途：預設那份摘要只截前 8000 字、也不展開「顯示更多」，
 * 各店的「品名＋逐項抽選連結」清單通常正好落在被截掉的那段。要把品項補進正本，
 * 就得看全文——--dump 會展開貼文並把全文與所有 lin.ee 連結寫成一店一檔。
 *
 * 第一次跑會開一個瀏覽器視窗要你登入 FB（用的是專屬設定檔
 * data/draw/.fb-profile，不會碰你日常的 Chrome 設定檔，也不進版控）；
 * 登入一次之後 cookie 就留在那個設定檔裡，之後都能無頭跑。
 *
 * 這支腳本只讀不寫：查到的線索印出來，要不要補進 source-links.txt 由人決定。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'data/draw';
const PROFILE = join(root, DATA, '.fb-profile');

const args = process.argv.slice(2);
const all = args.includes('--all');
const headed = args.includes('--headed');
const dump = args.includes('--dump');
const DUMP_DIR = join(root, DATA, '.fb-dump');
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
/**
 * 展開頁面上所有「顯示更多」，回傳貼文全文與頁面上所有 lin.ee 連結。
 * 為什麼要展開：FB 預設把長貼文折起來，而各店的品項清單正好都在折起來的那一段；
 * 不展開的話 innerText 只到「…顯示更多」為止，品名一個都拿不到。
 */
async function readFullPosts(page) {
  for (let round = 0; round < 3; round++) {
    const buttons = await page.$$('div[role="button"]');
    let clicked = 0;
    for (const b of buttons) {
      const label = (await b.innerText().catch(() => '')).trim();
      if (label === '顯示更多' || label === '查看更多' || label === 'See more') {
        await b.click({ timeout: 2000 }).catch(() => {}); // 展不開就算了，別讓整支掛掉
        clicked++;
      }
    }
    if (!clicked) break;
    await page.waitForTimeout(1200);
  }
  const text = await page.evaluate(() => document.body.innerText);
  // FB 會把外連包成 l.facebook.com/l.php?u=<encoded>，所以連 href 一起收、解碼後再撈短址
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((a) => a.href),
  );
  const decoded = hrefs.map((h) => {
    try { return decodeURIComponent(h); } catch { return h; }
  });
  const links = [...new Set([text, ...decoded].join('\n').match(/https:\/\/lin\.ee\/[A-Za-z0-9]+/g) ?? [])];
  return { text, links };
}

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
  if (dump) {
    // 每次重建：留著上一輪的檔會讓「舊批的品項清單」被當成這次新公布的
    rmSync(DUMP_DIR, { recursive: true, force: true });
    mkdirSync(DUMP_DIR, { recursive: true });
  }

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
      if (dump) {
        // --dump 要看到品項清單，所以多捲幾頁、展開「顯示更多」，全文落檔
        for (let s = 0; s < 3; s++) { await page.mouse.wheel(0, 1800); await page.waitForTimeout(1000); }
        const full = await readFullPosts(page);
        const loginWall = /登入|Log in to Facebook/.test(full.text) && full.text.length < 1200;
        writeFileSync(
          join(DUMP_DIR, `${t.store}.txt`),
          `URL: ${t.fb}\n\n=== LINKS ===\n${full.links.join('\n')}\n\n=== TEXT ===\n${full.text}`,
        );
        results.push({ ...t, ...extractLeads(full.text), links: full.links, loginWall });
      } else {
        const text = await page.evaluate(() => document.body.innerText.slice(0, 8000));
        const loginWall = /登入|Log in to Facebook/.test(text) && text.length < 1200;
        results.push({ ...t, ...extractLeads(text), loginWall });
      }
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
  if (dump) console.log(`\n貼文全文已寫到 ${DATA}/.fb-dump/（一店一檔，含展開後的品項清單）`);
  console.log('\n查到的品項與連結請人工補進 data/draw/source-links.txt（sync 是增量合併，不會被覆寫）');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main();
