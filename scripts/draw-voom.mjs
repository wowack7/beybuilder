// 抽選目錄：掃各店 LINE VOOM 帳號頁的新貼文（draw:fb 的輕量姊妹作）。
//
//   npm run draw:voom                # 掃 data/draw/voom.tsv 裡的全部店家（近 3 天貼文）
//   npm run draw:voom -- --days=1    # 只看最近 1 天
//   npm run draw:voom -- --dump      # 另外把貼文全文寫到 data/draw/.voom-dump/（一店一檔）
//
// 為什麼可行：VOOM 網頁版未登入就吃得到——最新 5 篇貼文埋在 __NEXT_DATA__ 的 SSR JSON，
// 純 HTTP GET 就能拿，不需要 Playwright、不需要登入狀態，雲端容器也能跑。
// 各店的券連結常比上游彙整頁早半天發在 VOOM（2026-08-28 實測：天母SOGO/天母三越/信義A8
// 的隔日 UX-21 券都是前一晚 20-23 點發 VOOM，上游隔天才收）。
//
// 涵蓋限制：只有 voom.tsv 收了 VOOM 網址（_d… homeId）的店掃得到。homeId 反查不到——
// @LINE-ID 版頁面（linevoom.line.me/user/@xxx）SSR 不帶貼文、內部 getPosts API 未登入
// 拿不到、line.me 個人頁與券 LIFF 頁都不吐 id——要擴充涵蓋只能人工從 LINE app
// 的 VOOM 頁「分享→複製連結」抄進 voom.tsv。
//
// 只讀不寫：印出線索（貼文時間、關鍵字、品項×lin.ee 配對、哪些 code 正本還沒有），
// 補不補進正本由人決定（照 draw:fb 的 SOP：解析短址→mapping.tsv→source-links.txt）。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLeads } from './draw-fb-scan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'data/draw';
const args = process.argv.slice(2);
const dump = args.includes('--dump');
const days = Number(args.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 0) || 3;
const DUMP_DIR = join(root, DATA, '.voom-dump');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

/**
 * 從 VOOM 帳號頁 HTML 挖出貼文。SSR 把貼文放在 __NEXT_DATA__ →
 * pageProps.dehydratedReactQueryState 深處；確切巢狀層級是 LINE 的實作細節，
 * 與其寫死路徑，不如遞迴找第一個非空的 posts 陣列——結構微調時比較不會整支壞掉。
 * 拿不到（頁面改版／SSR 空手而回）就回空陣列，由呼叫端回報。
 * @param {string} html
 * @returns {{createdTime: number, text: string}[]}
 */
export function parseVoomPosts(html) {
  const m = html.match(/__NEXT_DATA__[^>]*>(\{[\s\S]*?\})<\/script>/);
  if (!m) return [];
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const found = (function walk(o) {
    if (Array.isArray(o)) {
      for (const v of o) {
        const r = walk(v);
        if (r) return r;
      }
      return null;
    }
    if (o && typeof o === 'object') {
      if (Array.isArray(o.posts) && o.posts.length) return o.posts;
      for (const v of Object.values(o)) {
        const r = walk(v);
        if (r) return r;
      }
    }
    return null;
  })(data.props?.pageProps ?? {});
  return (found ?? [])
    .map((p) => ({
      createdTime: p?.postInfo?.createdTime ?? 0,
      text: p?.contents?.text ?? '',
    }))
    .filter((p) => p.createdTime > 0);
}

/**
 * 把貼文文字裡的「品名 × lin.ee 連結」配成對。兩種常見排版都接：
 * 連結跟品名同一行（信義A8：`UX-21 惡魔冥界改造組\thttps://lin.ee/x`），
 * 或品名一行、連結下一行（天母SOGO：`⭐️UX-21 …⭐️` ＋隔行網址）。
 * 品名剝掉清單編號（`1.`）與頭尾裝飾符號；配不到品名的連結以空字串回報（照樣列出）。
 * @param {string} text
 * @returns {{name: string, code: string}[]}
 */
export function pairItemLinks(text) {
  const clean = (s) =>
    s
      .replace(/[\uFE0F\u20E3]/g, '') // 變體選擇符先剝掉，裝飾字元類才不用含組合字
      .replace(/^\s*\d+[.、]\s*/, '')
      .replace(/^[\s⭐🎉👉🔺★☆•·~*]+|[\s⭐🎉👉🔺★☆•·~*:：]+$/gu, '')
      .trim();
  const pairs = [];
  let pending = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)https:\/\/lin\.ee\/([A-Za-z0-9]+)/);
    if (m) {
      const inline = clean(m[1]);
      pairs.push({ name: inline || pending, code: m[2] });
      pending = '';
      continue;
    }
    if (!/https?:\/\//.test(line)) pending = clean(line);
  }
  return pairs;
}

/**
 * 一家店的貼文 → 線索清單：只留時間窗內、且有抽選字樣或連結的貼文。
 * @param {{createdTime: number, text: string}[]} posts
 * @param {{sinceMs: number, knownCodes: Set<string>}} opts
 */
export function voomLeads(posts, { sinceMs, knownCodes }) {
  return posts
    .filter((p) => p.createdTime >= sinceMs)
    .map((p) => {
      const { hit, dates, found } = extractLeads(p.text);
      const pairs = pairItemLinks(p.text).map((x) => ({
        ...x,
        // 加好友連結每家都有、每輪都在，標成 🆕 會是永遠的假警報——標記出來由顯示端降級
        isFriend: /官方帳號|加入|好友/.test(x.name),
        isNew: !knownCodes.has(x.code),
      }));
      return { ...p, hit, dates, pairs, found: found || pairs.length > 0 };
    })
    .filter((p) => p.found);
}

async function main() {
  const stores = readFileSync(join(root, `${DATA}/voom.tsv`), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t'))
    .filter(([n, u]) => n && u);
  const knownCodes = new Set(
    (readFileSync(join(root, `${DATA}/source-links.txt`), 'utf8').match(/lin\.ee\/([A-Za-z0-9]+)/g) ?? []).map(
      (s) => s.split('/')[1],
    ),
  );
  const sinceMs = Date.now() - days * 86400_000;
  console.log(`掃 ${stores.length} 家 VOOM（近 ${days} 天貼文；正本已收 ${knownCodes.size} 個 code）`);
  if (dump) {
    rmSync(DUMP_DIR, { recursive: true, force: true });
    mkdirSync(DUMP_DIR, { recursive: true });
  }
  const fresh = [];
  const broken = [];
  for (const [name, url] of stores) {
    let posts;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      posts = parseVoomPosts(await res.text());
    } catch (e) {
      broken.push(name);
      console.log(`  ${name}: 抓不到（${e.message}）`);
      continue;
    }
    if (!posts.length) {
      // 頁面活著但挖不出貼文＝LINE 改版的警訊，不能悄悄當成「沒新貼文」
      broken.push(name);
      console.log(`  ${name}: 頁面有回但解析不到貼文（VOOM 改版？）`);
      continue;
    }
    if (dump)
      writeFileSync(
        join(DUMP_DIR, `${name}.txt`),
        posts.map((p) => `@${new Date(p.createdTime).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' })}\n${p.text}`).join('\n\n========\n\n'),
      );
    const leads = voomLeads(posts, { sinceMs, knownCodes });
    if (!leads.length) continue;
    fresh.push(name);
    for (const l of leads) {
      const ts = new Date(l.createdTime).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(5, 16);
      console.log(`  ${name} ｜ @${ts} ｜ ${l.hit.join('、') || '（無關鍵字）'} ｜ 日期 ${l.dates.join(' ') || '—'}`);
      for (const p of l.pairs)
        console.log(
          `      ${p.isFriend ? '(加友)' : p.isNew ? '🆕' : '(已收)'} ${p.name || '（沒配到品名）'} → lin.ee/${p.code}`,
        );
    }
  }
  console.log('');
  const newCount = fresh.length;
  console.log(newCount ? `有新線索的店: ${fresh.join('、')}` : '時間窗內沒有帶抽選線索的新貼文');
  if (dump) console.log(`貼文全文已寫到 ${DATA}/.voom-dump/（一店一檔）`);
  if (broken.length) console.log(`⚠ 抓不到/解析失敗: ${broken.join('、')}`);
  console.log('🆕 的 code 尚未在正本：查證屬本批後照 draw:fb 的 SOP 補進 source-links.txt 與 mapping.tsv');
}

const isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) await main();
