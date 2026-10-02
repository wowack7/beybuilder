// /draw/ 👾 Agent 模式的瀏覽器驗收（需求書驗收標準 1–10）。
//
//   npm run draw:agent-check
//
// 只能在本機跑：用 playwright-core 開你機器上的 Chrome（channel:'chrome'，同 draw:fb），
// 所以不串進 npm test／CI。改到 public/draw/index.html 的 Agent 區塊就跑一次。
//
// 測不到的東西（要 LINE 實機）：LIFF 疊層關閉時實際會發哪些事件。這裡用兩種方式模擬「離開→返回」：
//   ① 真的同分頁導航到 liff 網址再 goBack（一般瀏覽器、LINE 若是整頁跳轉）
//   ② 頁面不離開，只發 hidden→visible／blur→focus（LINE 若是疊一層 LIFF 視窗）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.zip': 'application/zip', '.svg': 'image/svg+xml' };

// 手機上 index.html＋data.js 載完常超過 1 秒；重整類的檢查要在「載入比 MIN_AWAY_MS 慢」時跑才有意義
let pageDelayMs = 0;

function serve() {
  const server = createServer(async (req, res) => {
    if (pageDelayMs && req.url.startsWith('/draw/') && !/\.(js|zip)/.test(req.url)) await new Promise((r) => setTimeout(r, pageDelayMs));
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const server = await serve();
const BASE = `http://127.0.0.1:${server.address().port}/draw/`;
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
let liffHits = 0;
await ctx.route('https://liff.line.me/**', (route) => {
  liffHits += 1;
  route.fulfill({ contentType: 'text/html', body: '<title>LIFF</title><p>官方抽獎頁（模擬）</p>' });
});
await ctx.addInitScript(() => {
  // 跳過兩個首次教學；Agent 狀態每個情境自己決定
  localStorage.setItem('funbox:seen-howto:v1', '1');
  localStorage.setItem('funbox:seen-agent-howto:v1', '1');
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const DRAW = '[data-testid="agent-draw"]';
const snap = () => page.evaluate(() => {
  const a = JSON.parse(localStorage.getItem('funbox:agent:v1') || 'null');
  const el = document.getElementById('agent');
  const btn = document.querySelector('[data-testid="agent-draw"]');
  const r = btn.getBoundingClientRect();
  return {
    pos: a && a.pos, len: a && a.queue.length, pending: a && a.pending, visited: a ? Object.keys(a.visited).length : 0,
    state: el.dataset.state, id: document.getElementById('agentCard').dataset.activityId,
    href: btn.getAttribute('href'), cx: r.x + r.width / 2, cy: r.y + r.height / 2, visible: r.width > 0 && r.height > 0,
    progress: document.getElementById('agentProgress').textContent,
  };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitState(st) {
  try {
    await page.waitForFunction((s) => !document.getElementById('agent').hidden && document.getElementById('agent').dataset.state === s, st, { timeout: 15000 });
  } catch (err) {
    console.log('  卡在', page.url(), JSON.stringify(await snap().catch(() => null)));
    console.log('  log', await page.evaluate(() => JSON.stringify((JSON.parse(localStorage.getItem('funbox:agent:v1')) || {}).log?.slice(0, 12))).catch(() => ''));
    throw err;
  }
}

/** 模擬 LIFF 疊層：頁面不離開，只發 hidden／visible（或 blur／focus） */
async function overlayRound(kind) {
  await page.evaluate(() => {
    window.__stay = (e) => { if (e.target.closest('[data-testid="agent-draw"]')) e.preventDefault(); };
    document.addEventListener('click', window.__stay, true);
  });
  await page.click(DRAW);
  await page.evaluate((k) => {
    if (k === 'visibility') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    } else {
      window.dispatchEvent(new Event('blur'));
    }
  }, kind);
  await sleep(1400);
  await page.evaluate((k) => {
    if (k === 'visibility') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    } else {
      window.dispatchEvent(new Event('focus'));
    }
    document.removeEventListener('click', window.__stay, true);
    // 還原成瀏覽器原生的 getter：留著假的 'visible'，之後真導航時的 visibilitychange 會被誤讀成返回
    delete document.visibilityState;
  }, kind);
}

try {
  // --- 1. 開關：只剩一個品項＋一顆抽獎鈕；關掉恢復清單 ---
  await page.goto(BASE + '?c=' + encodeURIComponent('台北市'));
  await page.evaluate(() => localStorage.removeItem('funbox:agent:v1'));
  await page.reload();
  await page.click('#agentBtn');
  await waitState('ready');
  const one = await page.evaluate(() => ({
    draws: [...document.querySelectorAll('[data-testid="agent-draw"]')].filter((n) => n.offsetParent).length,
    listVisible: !!document.getElementById('list').offsetParent,
    pressed: document.getElementById('agentBtn').getAttribute('aria-pressed'),
  }));
  check('1 開啟後只有一顆抽獎、清單隱藏、aria-pressed=true', one.draws === 1 && !one.listVisible && one.pressed === 'true', JSON.stringify(one));
  await page.click('#agentBtn');
  const off = await page.evaluate(() => ({ list: !!document.getElementById('list').offsetParent, items: document.querySelectorAll('#list .item').length }));
  check('1 關閉後恢復一般清單', off.list && off.items > 0, JSON.stringify(off));
  await page.click('#agentBtn');
  await waitState('ready');

  // --- 2＋3. 連續 20 項：真導航→返回，自動換下一項，按鈕中心不動 ---
  const start = await snap();
  const centers = new Set();
  let stepOk = true;
  for (let i = 0; i < 20; i += 1) {
    const before = await snap();
    centers.add(`${before.cx.toFixed(1)},${before.cy.toFixed(1)}`);
    await page.click(DRAW);
    await page.waitForURL(/liff\.line\.me/);
    await sleep(1300);   // > MIN_AWAY_MS
    await page.goBack();
    await waitState('ready');
    const after = await snap();
    if (after.pos !== before.pos + 1 || after.id === before.id) { stepOk = false; console.log('  step', i, before.pos, '→', after.pos); }
  }
  const s20 = await snap();
  check('3 每次返回自動下一項，20 次不多跳不重複', stepOk && s20.pos === start.pos + 20, `${start.pos} → ${s20.pos}`);
  check('2 連續 20 項按鈕中心位置不變', centers.size === 1, [...centers].join(' | '));

  // --- 4. 重複返回事件只推進一次；雙擊只開一次 ---
  const p0 = (await snap()).pos;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check('4 沒點抽獎時的返回事件不推進', (await snap()).pos === p0);
  const hits0 = liffHits;
  const before4 = await snap();
  await page.dblclick(DRAW);
  await page.waitForURL(/liff\.line\.me/);
  await sleep(1300);
  await page.goBack();
  await waitState('ready');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new Event('focus'));
  });
  const after4 = await snap();
  check('4 雙擊只開一次', liffHits - hits0 === 1, `liff 請求 ${liffHits - hits0} 次`);
  check('4 返回後重複事件只推進一次', after4.pos === before4.pos + 1, `${before4.pos} → ${after4.pos}`);

  // --- 頁面不離開的疊層模擬（LINE 可能的行為）---
  for (const kind of ['visibility', 'blur']) {
    const b = await snap();
    await overlayRound(kind);
    await waitState('ready');
    const a = await snap();
    check(`疊層模擬（${kind}）離開→返回推進一次`, a.pos === b.pos + 1, `${b.pos} → ${a.pos}`);
  }

  // --- 離開不到 MIN_AWAY 就回來：不推進；若接著整頁重載（＝導航途中閃了一下）就推進 ---
  const bq = await snap();
  await page.evaluate(() => {
    document.addEventListener('click', (e) => { if (e.target.closest('[data-testid="agent-draw"]')) e.preventDefault(); }, { capture: true, once: true });
  });
  await page.click(DRAW);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  const aq = await snap();
  check('閃一下就回來不推進、仍算開啟中', aq.pos === bq.pos && aq.state === 'opening', `${aq.state} ${bq.pos} → ${aq.pos}`);
  // 導航接著完成、在官方頁待了一陣子才回來
  await page.goto(aq.href);
  await sleep(1300);
  await page.goBack();
  await waitState('ready');
  check('閃回後導航照常完成，返回推進一次', (await snap()).pos === bq.pos + 1);
  // 閃回後馬上重整目錄（使用者自己重整，不是從官方頁回來）；載入刻意放慢到 1.5 秒
  pageDelayMs = 1500;
  const br = await snap();
  await page.evaluate(() => {
    document.addEventListener('click', (e) => { if (e.target.closest('[data-testid="agent-draw"]')) e.preventDefault(); }, { capture: true, once: true });
  });
  await page.click(DRAW);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('agent').hidden);
  const ar = await snap();
  check('閃回後立刻重整目錄（慢速載入）不推進', ar.pos === br.pos && ar.id === br.id && ar.state === 'error', `${ar.state} ${br.pos} → ${ar.pos}`);
  // 開啟中（沒閃回）直接重整也不推進
  pageDelayMs = 0;
  await page.click('#agentMoreBtn');
  await page.click('#agentRetry');
  await waitState('ready');
  const bo = await snap();
  await page.evaluate(() => {
    document.addEventListener('click', (e) => { if (e.target.closest('[data-testid="agent-draw"]')) e.preventDefault(); }, { capture: true, once: true });
  });
  await page.click(DRAW);
  pageDelayMs = 1500;
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('agent').hidden);
  pageDelayMs = 0;
  const ao = await snap();
  check('開啟中重整目錄（慢速載入）不推進', ao.pos === bo.pos && ao.state === 'error', `${ao.state} ${bo.pos} → ${ao.pos}`);
  await page.click('#agentMoreBtn');
  await page.click('#agentRetry');
  await waitState('ready');

  // --- 5. 開啟失敗：沒有離開訊號 → 原品項、可辨識錯誤、按鈕可再按 ---
  const b5 = await snap();
  await page.evaluate(() => {
    document.addEventListener('click', (e) => { if (e.target.closest('[data-testid="agent-draw"]')) e.preventDefault(); }, { capture: true, once: true });
  });
  await page.click(DRAW);
  const opening = await snap();
  check('開啟中按鈕停用', opening.state === 'opening' && (await page.getAttribute(DRAW, 'aria-disabled')) === 'true');
  await waitState('error');
  const a5 = await snap();
  const err = await page.textContent('#agentStatus');
  check('5 開啟失敗停在原品項並顯示錯誤', a5.id === b5.id && a5.pos === b5.pos && /沒偵測到/.test(err), err);
  check('5 錯誤後抽獎鈕可再按', (await page.getAttribute(DRAW, 'aria-disabled')) === 'false');
  // 錯誤狀態下切 App 再回來：沒有新的點擊，不推進
  await page.evaluate(async () => {
    const set = (v) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set('hidden');
    await new Promise((r) => setTimeout(r, 1500));
    set('visible');
    delete document.visibilityState;
  });
  const a5b = await snap();
  check('5 錯誤後切 App 再回來不推進', a5b.pos === b5.pos && a5b.state === 'error', `${a5b.state} ${b5.pos} → ${a5b.pos}`);

  // --- 6. 等待返回期間（官方頁重整、找參加鈕）不推進 ---
  await page.click('#agentMoreBtn');
  await page.click('#agentRetry');
  await page.click(DRAW);
  await page.waitForURL(/liff\.line\.me/);
  await page.reload();               // 官方頁重整
  await sleep(1500);
  await page.reload();
  await page.goBack();
  await waitState('ready');
  const a6 = await snap();
  check('6 官方頁重整多次後返回只推進一次', a6.pos === a5.pos + 1, `${a5.pos} → ${a6.pos}`);

  // --- 7. 沒點抽獎時切 App（hidden→visible）不推進 ---
  const b7 = await snap();
  await page.evaluate(async () => {
    const set = (v) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set('hidden');
    await new Promise((r) => setTimeout(r, 1500));
    set('visible');
    delete document.visibilityState;
  });
  check('7 沒點抽獎的 App 切換不推進', (await snap()).pos === b7.pos);

  // --- 8. 目錄重整、重開後保留位置與範圍 ---
  await page.reload();
  await waitState('ready');
  const a8 = await snap();
  const scope = await page.textContent('#agentScope');
  check('8 重整後位置不變、不因初始化推進', a8.pos === b7.pos && a8.id === b7.id, `${b7.pos} → ${a8.pos}`);
  await page.goto(BASE);   // 重新開啟（網址沒帶篩選）
  await waitState('ready');
  const a8b = await snap();
  check('8 重新開啟後沿用原隊列與範圍', a8b.pos === b7.pos && (await page.textContent('#agentScope')) === scope, scope);
  // 退出再進入（同一範圍）不清進度
  await page.goto(BASE + '?c=' + encodeURIComponent('台北市'));
  await page.click('#agentBtn');
  await page.click('#agentBtn');
  await waitState('ready');
  check('8 退出再進入 Agent 模式不清進度', (await snap()).pos === b7.pos);

  // --- 9. 上一項：同一個活動 ID 與連結，不重複計數 ---
  const cur = await snap();
  await page.click('#agentMoreBtn');
  await page.click('#agentPrev');
  const prev = await snap();
  const prevVisited = prev.visited;
  check('9 上一項回到前一個活動', prev.pos === cur.pos - 1 && prev.id !== cur.id);
  await page.click(DRAW);
  await page.waitForURL(/liff\.line\.me/);
  await sleep(1300);
  await page.goBack();
  await waitState('ready');
  const back = await snap();
  check('9 重試前一項後回到原位置、已走訪不重複計數', back.pos === cur.pos && back.id === cur.id && back.visited === prevVisited, `visited ${prevVisited} → ${back.visited}`);

  // --- 10. 最後一項返回後顯示完成畫面，不留可點的抽獎鈕 ---
  // 先關模式再清：模式開著時離開頁面會把記憶體裡的狀態寫回 storage
  await page.click('#agentBtn');
  await page.evaluate(() => localStorage.removeItem('funbox:agent:v1'));
  await page.goto(BASE + '?q=' + encodeURIComponent('戰鬥通行證'));
  await page.click('#agentBtn');
  await waitState('ready');
  const total = (await snap()).len;
  let rounds = 0;
  for (let i = 0; i < total; i += 1) {
    const st = await snap();
    if (st.state === 'complete') { console.log('  提早完成於第', i, '輪', JSON.stringify(st)); break; }
    rounds += 1;
    await page.click(DRAW);
    await page.waitForURL(/liff\.line\.me/);
    await sleep(1300);
    await page.goBack();
    await page.waitForFunction(() => ['ready', 'complete'].includes(document.getElementById('agent').dataset.state));
  }
  const fin = await snap();
  const doneText = await page.textContent('#agentDoneTitle');
  check('10 完成畫面', fin.state === 'complete' && /走訪完畢/.test(doneText), `${total} 項、跑了 ${rounds} 輪 · ${doneText}`);
  check('10 完成後抽獎鈕不可見也沒有連結', !fin.visible && fin.href === null);
  const listCount = await page.evaluate(() => {
    document.getElementById('agentBtn').click();
    return document.querySelectorAll('#list .item:not(.done)').length;
  });
  check('完成後一般清單「未抽」為 0', listCount === 0, `未抽 ${listCount}`);

  // 完成畫面的上一項、跳過→重試未完成項目（範圍標籤沿用）
  await page.click('#agentBtn');
  await waitState('complete');
  const scopeDone = await page.textContent('#agentScope');
  await page.click('#agentDonePrev');
  await waitState('ready');
  const lastItem = await snap();
  check('完成畫面按上一項回到最後一項', lastItem.pos === lastItem.len - 1);
  await page.click('#agentMoreBtn');
  await page.click('#agentSkip');
  await waitState('complete');
  await page.click('#agentRetryAll');
  await waitState('ready');
  const rp = await snap();
  check('重試未完成項目：同一個活動、範圍不變', rp.len === 1 && rp.id === lastItem.id && (await page.textContent('#agentScope')).startsWith(scopeDone), await page.textContent('#agentScope'));

  check('沒有 JS 錯誤', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通過`);
process.exit(failed ? 1 : 0);
