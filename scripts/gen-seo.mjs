/**
 * Build 後產生「爬蟲不必執行 JS 就讀得到」的靜態內容：
 *   dist/tier/index.html — 天梯階級總表（全部戰刃／固鎖／軸心／輔助刃）＋熱門實戰組合
 *   dist/sitemap.xml     — 首頁、天梯總表與抽選目錄
 *
 * 為什麼需要：本站是 client-rendered SPA，爬蟲抓到的首頁只有歡迎頁文案，
 * 沒有任何零件名稱，長尾關鍵字（如「隕星龍騎士 天梯」）永遠搜不到。
 * 這頁把同一份 src/data/*.json 直接渲染成靜態 HTML，內容與 app 內顯示一致，
 * 且由 index.html 骨架與 footer 內鏈可達——是真頁面，不是只給爬蟲看的影子頁。
 *
 * 依專案規範：分數（score）僅供引擎內部排序，此頁一律不顯示，只放勝場／奪冠率／階級等真實資料。
 *
 * 串在 `npm run build` 之後執行，因此 deploy.yml 與 data-update.yml 兩條流程都會重新產出。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PALETTE } from '../src/lib/palette.ts'
import { DRAW_PATH, SITE_URL, TIER_OG_IMAGE_URL, TIER_PATH } from '../src/lib/site.ts'
import { TIER_ORDER } from '../src/lib/transform.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

/** 來源站未評級者的顯示標籤（TIER_ORDER 之外的一律歸此類，殿後） */
const UNRATED = '未評級'

/** 熱門實戰組合列出的筆數（全部 ~2800 筆，全列會變成無法閱讀的清單頁） */
const TOP_COMBOS = 60

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** 依階級分組並照 TIER_ORDER 排序，未評級殿後 */
export function groupByTier(items, labelOf) {
  const groups = new Map()
  for (const it of items) {
    const key = TIER_ORDER.includes(it.tier) ? it.tier : UNRATED
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(labelOf(it))
  }
  return [...TIER_ORDER, UNRATED]
    .filter((t) => groups.has(t))
    .map((tier) => ({
      tier,
      names: [...groups.get(tier)].sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    }))
}

function tierSection(id, heading, blurb, items, labelOf) {
  const rows = groupByTier(items, labelOf)
    .map(
      ({ tier, names }) => `
        <div class="tier-row">
          <span class="tier-badge tier-${tier === UNRATED ? 'none' : tier.replace('+', 'p')}">${esc(tier)}</span>
          <ul class="tier-names">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        </div>`,
    )
    .join('')
  return `
      <section id="${id}" aria-labelledby="${id}-h">
        <h2 id="${id}-h">${esc(heading)}<span class="count">${items.length}</span></h2>
        <p class="blurb">${esc(blurb)}</p>
        <div class="tier-list">${rows}</div>
      </section>`
}

function comboTable(combos) {
  const rows = combos
    .map(
      (c, i) => `
          <tr>
            <td class="num">${i + 1}</td>
            <td>${esc(c.blade)}</td>
            <td class="mono">${esc(c.ratchet)}</td>
            <td class="mono">${esc(c.bit)}</td>
            <td class="num">${esc(c.wins ?? 0)}</td>
            <td class="num">${esc(Math.round((c.champRate ?? 0) * 100))}%</td>
          </tr>`,
    )
    .join('')
  return `
      <section id="combos" aria-labelledby="combos-h">
        <h2 id="combos-h">熱門實戰組合<span class="count">Top ${combos.length}</span></h2>
        <p class="blurb">依賽事累積勝場排序。奪冠率為該組合奪冠場次佔其出賽場次的比例。</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>戰刃</th><th>固鎖</th><th>軸心</th><th>勝場</th><th>奪冠率</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`
}

/** 色碼由 src/lib/palette.ts 依 tokens.css 的 oklch 算出，此頁無 bundler 吃不到 CSS 變數 */
const STYLE = `
  :root {
    --bg: ${PALETTE.bg}; --bg-raised: ${PALETTE.bgRaised}; --bg-overlay: ${PALETTE.bgOverlay};
    --text: ${PALETTE.text}; --text-dim: ${PALETTE.textDim}; --text-faint: ${PALETTE.textFaint};
    --accent: ${PALETTE.accent}; --accent-ink: ${PALETTE.accentInk}; --line: #262d3b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: "Noto Sans TC", "PingFang TC", "Helvetica Neue", Arial, sans-serif;
    line-height: 1.7; -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); }
  .wrap { max-width: 68rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  header.page { border-bottom: 1px solid var(--line); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .back { display: inline-block; font-size: .9rem; margin-bottom: 1rem; text-decoration: none; }
  .back:hover { text-decoration: underline; }
  h1 { font-size: clamp(1.6rem, 1.2rem + 1.8vw, 2.4rem); line-height: 1.25; margin: 0 0 .75rem; }
  h1 .x { color: var(--accent); }
  .lede { color: var(--text-dim); margin: 0 0 1.25rem; max-width: 46rem; }
  .cta {
    display: inline-block; background: var(--accent); color: var(--accent-ink);
    font-weight: 700; text-decoration: none; padding: .6rem 1.15rem; border-radius: .5rem;
  }
  .cta:hover { filter: brightness(1.08); }
  nav.toc { margin: 1.5rem 0 0; font-size: .92rem; }
  nav.toc a { margin-right: 1.1rem; }
  section { margin: 3rem 0 0; }
  h2 { font-size: 1.35rem; display: flex; align-items: baseline; gap: .6rem; margin: 0 0 .35rem; }
  h2 .count { font-size: .8rem; color: var(--text-faint); font-weight: 400; }
  .blurb { color: var(--text-dim); font-size: .92rem; margin: 0 0 1.1rem; }
  .tier-row { display: flex; gap: 1rem; padding: .8rem 0; border-top: 1px solid var(--line); }
  .tier-badge {
    flex: 0 0 3.2rem; height: 2rem; display: grid; place-items: center;
    border-radius: .4rem; font-weight: 700; font-size: .95rem;
    background: var(--bg-overlay); color: var(--text-dim); border: 1px solid var(--line);
  }
  .tier-badge.tier-X, .tier-badge.tier-Sp { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .tier-names { list-style: none; display: flex; flex-wrap: wrap; gap: .4rem .55rem; margin: .15rem 0 0; padding: 0; }
  .tier-names li {
    background: var(--bg-raised); border: 1px solid var(--line); border-radius: .35rem;
    padding: .2rem .55rem; font-size: .9rem;
  }
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: .6rem; }
  table { border-collapse: collapse; width: 100%; min-width: 34rem; font-size: .92rem; }
  th, td { padding: .55rem .8rem; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
  thead th { background: var(--bg-raised); color: var(--text-dim); font-weight: 600; position: sticky; top: 0; }
  tbody tr:last-child td { border-bottom: 0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .faq details {
    border-top: 1px solid var(--line); padding: .8rem 0;
  }
  .faq summary { cursor: pointer; font-weight: 700; }
  .faq p { margin: .5rem 0 0; color: var(--text-dim); font-size: .92rem; line-height: 1.7; }
  footer.page { margin-top: 3.5rem; padding-top: 1.5rem; border-top: 1px solid var(--line); color: var(--text-faint); font-size: .85rem; }
  footer.page a { color: var(--text-dim); }
`

/**
 * FAQ：同一份資料同時渲染成頁面內容與 FAQPage 結構化資料。
 * Google 要求結構化資料的答案必須在頁面上看得到，所以不能只放 JSON-LD。
 * 問題挑真的有人會搜的（階級怎麼看、多久更新、資料哪來、能不能算自己的牌組）。
 */
function faqItems({ blades, ratchets, bits, assists, date, comboCount }) {
  return [
    {
      q: 'Beyblade X 的天梯階級怎麼看？',
      a: `階級由高到低是 ${TIER_ORDER.join(' → ')}，X 為最高階。同一階內沒有先後之分，本頁依名稱排序。標示「${UNRATED}」代表來源站尚未給出評等，不是評價低。`,
    },
    {
      q: '這份天梯資料多久更新一次？',
      a: `每週自動重新抓取一次來源站資料並重新產生本頁，目前這份更新於 ${date}。戰刃 ${blades.length} 款、固鎖 ${ratchets.length} 款、軸心 ${bits.length} 款、輔助刃 ${assists.length} 款。`,
    },
    {
      q: '熱門實戰組合的勝場與奪冠率是怎麼算的？',
      a: `直接採用來源站彙整的賽事統計，本頁列出勝場最高的 ${TOP_COMBOS} 組（資料庫共 ${comboCount} 組）。本站不會顯示自訂的推薦分數——那只是站內排序用的近似值，不是真實戰績。`,
    },
    {
      q: '重塗版、特別版的戰刃算不算同一顆？',
      a: '算。顏色與版本差異（含賽事特別版）視為同一零件，變體若沒有獨立評級就繼承同家族基底名的階級；左迴旋與右迴旋則視為不同零件。',
    },
    {
      q: '可以用我自己有的零件算出最強戰隊嗎？',
      a: '可以。回到 BeyBuilder X 首頁登錄你擁有的商品，系統會在官方 3on3 規則（同一隊伍內戰刃、固鎖、軸心不得重複）下算出總分最高的三顆組合。',
    },
  ]
}

function faqSection(items) {
  return `
  <section id="faq">
    <h2>常見問題</h2>
    <div class="faq">
      ${items
        .map(
          ({ q, a }) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`,
        )
        .join('\n      ')}
    </div>
  </section>`
}

function tierPageHead({ title, desc, url, faq, date }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'BeyBuilder X 配裝模擬器', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '天梯階級總表', item: url },
        ],
      },
      {
        '@type': 'Dataset',
        name: 'Beyblade X 天梯階級與實戰組合統計',
        description: desc,
        url,
        inLanguage: 'zh-Hant-TW',
        isAccessibleForFree: true,
        dateModified: date,
        creator: { '@type': 'Person', name: 'stan-yao' },
        isBasedOn: 'https://stan-yao.github.io/beyblade_x_tier/',
        license: 'https://beybuilder.5-seven.dog/tier/',
      },
      // FAQPage：答案在頁面上也看得到（見 faqSection），不是只給爬蟲的影子內容
      {
        '@type': 'FAQPage',
        mainEntity: faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="${PALETTE.bg}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/svg+xml" href="${SITE_URL}favicon.svg">
<meta property="og:type" content="article">
<meta property="og:site_name" content="BeyBuilder X">
<meta property="og:locale" content="zh_TW">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${TIER_OG_IMAGE_URL}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="BeyBuilder X 天梯總表：戰刃、固鎖、軸心、輔助刃階級一覽">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${TIER_OG_IMAGE_URL}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${STYLE}</style>`
}

export function buildTierPage({ parts, combos, generatedAt }) {
  // data.ts 也把 assists 當選用欄位（`partsDb.assists ?? []`）；這裡若硬取 .length，
  // 一次不完整的 data:update 就會讓整個 build 掛掉，連帶擋掉部署。
  const blades = parts.blades ?? []
  const ratchets = parts.ratchets ?? []
  const bits = parts.bits ?? []
  const assists = parts.assists ?? []

  const date = generatedAt.slice(0, 10)
  const url = SITE_URL + TIER_PATH
  const title = '戰鬥陀螺 Beyblade X 天梯階級總表｜戰刃・固鎖・軸心 - BeyBuilder X'
  const desc = `Beyblade X 全零件天梯階級一覽：${blades.length} 款戰刃、${ratchets.length} 款固鎖、${bits.length} 款軸心的階級評等，以及依勝場排序的熱門實戰組合。`

  const top = [...combos].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0)).slice(0, TOP_COMBOS)
  const faq = faqItems({ blades, ratchets, bits, assists, date, comboCount: combos.length })

  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
${tierPageHead({ title, desc, url, faq, date })}
</head>
<body>
<div class="wrap">
  <header class="page">
    <a class="back" href="${SITE_URL}">← 回 BeyBuilder X 配裝模擬器</a>
    <h1>戰鬥陀螺 Beyblade <span class="x">X</span> 天梯階級總表</h1>
    <p class="lede">收錄 ${blades.length} 款戰刃、${ratchets.length} 款固鎖、${bits.length} 款軸心與 ${assists.length} 款輔助刃的天梯階級（<strong>X</strong> 為最高階，依序 ${TIER_ORDER.slice(0, 4).join(' → ')} → … → ${TIER_ORDER.at(-1)}），以及依賽事勝場排序的熱門實戰組合。資料更新於 ${esc(date)}。</p>
    <a class="cta" href="${SITE_URL}">用你的零件算出最強 3on3 戰隊 →</a>
    <nav class="toc" aria-label="頁內導覽">
      <a href="#blades">戰刃</a><a href="#ratchets">固鎖</a><a href="#bits">軸心</a><a href="#assists">輔助刃</a><a href="#combos">熱門實戰組合</a><a href="#faq">常見問題</a>
    </nav>
  </header>

  <main>
    ${tierSection('blades', '戰刃 Blade', '重塗與特別版視為同一零件，變體無獨立評級時繼承同家族基底名的階級。', blades, (b) => b.name)}
    ${tierSection('ratchets', '固鎖 Ratchet', '型號格式為「齒數-高度」，例如 3-60。', ratchets, (r) => r.id)}
    ${tierSection('bits', '軸心 Bit', '以代號表示，例如 J（Jaggy）、V（Vortex）。', bits, (b) => b.id)}
    ${tierSection('assists', '輔助刃 Assist Blade', 'CX 系列第三層零件，來源站自 2026 年 8 月起開始提供階級評等。', assists, (a) => `輔助${a.id}`)}
    ${comboTable(top)}
    ${faqSection(faq)}
  </main>

  <footer class="page">
    <p>天梯階級與實戰統計資料來自 <a href="https://stan-yao.github.io/beyblade_x_tier/" rel="noreferrer">stan-yao 的 Beyblade X 天梯站</a>；零件數值參考 <a href="https://beyblade.phstudy.org/" rel="noreferrer">beyblade.phstudy.org</a>。本站僅供玩家交流參考，Beyblade X 為 TAKARA TOMY 之商標。</p>
    <p><a href="${SITE_URL}">BeyBuilder X — 戰鬥陀螺 Beyblade X 配裝模擬器</a>｜<a href="${SITE_URL + DRAW_PATH}">戰鬥陀螺抽選目錄</a>｜資料更新：${esc(date)}</p>
  </footer>
</div>
</body>
</html>
`
}

export function buildSitemap(generatedAt) {
  const date = generatedAt.slice(0, 10)
  const urls = [
    { loc: SITE_URL, priority: '1.0', freq: 'weekly' },
    { loc: SITE_URL + TIER_PATH, priority: '0.8', freq: 'weekly' },
    // 抽選目錄隨各店公布逐日變動，換批時整批連結會失效，故 daily
    { loc: SITE_URL + DRAW_PATH, priority: '0.7', freq: 'daily' },
  ]
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${u.loc}</loc><lastmod>${date}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`
}

function main() {
  const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
  const parts = readJson('src/data/parts.json')
  const combos = readJson('src/data/combos.json')
  const { generatedAt } = readJson('src/data/meta.json')

  mkdirSync(join(DIST, 'tier'), { recursive: true })
  const tierHtml = buildTierPage({ parts, combos, generatedAt })
  writeFileSync(join(DIST, 'tier', 'index.html'), tierHtml)
  writeFileSync(join(DIST, 'sitemap.xml'), buildSitemap(generatedAt))

  console.log(
    `wrote dist/tier/index.html (${(tierHtml.length / 1024).toFixed(1)}kB, ` +
      `blades=${parts.blades.length} ratchets=${parts.ratchets.length} bits=${parts.bits.length} ` +
      `assists=${(parts.assists ?? []).length} combos=${Math.min(TOP_COMBOS, combos.length)})`,
  )
  console.log('wrote dist/sitemap.xml')
}

// 被 vitest import 時不要跑寫檔副作用
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
