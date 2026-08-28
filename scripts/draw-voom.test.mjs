import { describe, expect, test } from 'vitest';
import { pairItemLinks, parseVoomPosts, voomLeads } from './draw-voom.mjs';

/** 造一個最小可信的 VOOM SSR 頁：巢狀層級照真實頁面，但只留必要欄位 */
function voomHtml(posts) {
  const data = {
    props: {
      pageProps: {
        dehydratedReactQueryState: {
          queries: [{ state: { data: { pages: [{ posts }] } } }],
        },
      },
    },
  };
  return `<div id="x"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
}

describe('parseVoomPosts', () => {
  test('挖得出貼文的時間與文字', () => {
    const html = voomHtml([
      { postInfo: { createdTime: 1000 }, contents: { text: '抽選開始' } },
      { postInfo: { createdTime: 2000 }, contents: { text: '第二篇' } },
    ]);
    expect(parseVoomPosts(html)).toEqual([
      { createdTime: 1000, text: '抽選開始' },
      { createdTime: 2000, text: '第二篇' },
    ]);
  });

  test('@LINE-ID 版頁面 SSR 空手而回 → 空陣列（呼叫端要當警訊，不是沒貼文）', () => {
    // 真實情況：pages 裡是 null（SSR 沒帶資料）
    const data = { props: { pageProps: { dehydratedReactQueryState: { queries: [{ state: { data: { pages: [null] } } }] } } } };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
    expect(parseVoomPosts(html)).toEqual([]);
  });

  test('沒有 NEXT_DATA 或爛 JSON → 空陣列', () => {
    expect(parseVoomPosts('<html>沒東西</html>')).toEqual([]);
    expect(parseVoomPosts('<script id="__NEXT_DATA__" type="application/json">{爛</script>')).toEqual([]);
  });
});

describe('pairItemLinks', () => {
  test('品名與連結同一行（信義A8 排版，tab 分隔）', () => {
    expect(pairItemLinks('UX-21 惡魔冥界改造組\thttps://lin.ee/q97O5u7\t')).toEqual([
      { name: 'UX-21 惡魔冥界改造組', code: 'q97O5u7' },
    ]);
  });

  test('品名一行、連結下一行，剝掉 ⭐️ 裝飾與清單編號（天母SOGO 排版）', () => {
    const text = '⭐️UX-21 惡魔冥界改造組⭐️\nhttps://lin.ee/Xqa4sFy\n\n1.BX-10 極限衝擊戰鬥盤\nhttps://lin.ee/QKy5qn7';
    expect(pairItemLinks(text)).toEqual([
      { name: 'UX-21 惡魔冥界改造組', code: 'Xqa4sFy' },
      { name: 'BX-10 極限衝擊戰鬥盤', code: 'QKy5qn7' },
    ]);
  });

  test('加好友連結也照列（配到「加入 LINE 官方帳號」那行），由人過濾', () => {
    const text = '👉 加入 LINE 官方帳號：\nhttps://lin.ee/tasN8LA';
    expect(pairItemLinks(text)).toEqual([{ name: '加入 LINE 官方帳號', code: 'tasN8LA' }]);
  });
});

describe('voomLeads', () => {
  const posts = [
    { createdTime: 5000, text: '抽選來了\nUX-21 惡魔冥界改造組\nhttps://lin.ee/NEW1234' },
    { createdTime: 5000, text: '今日公休' },
    { createdTime: 100, text: '舊批抽籤\nhttps://lin.ee/OLD1234' },
  ];

  test('時間窗外與無線索的貼文都被濾掉；正本已收的 code 標 isNew=false', () => {
    const leads = voomLeads(posts, { sinceMs: 4000, knownCodes: new Set(['OLD1234']) });
    expect(leads).toHaveLength(1);
    expect(leads[0].hit).toContain('抽選');
    expect(leads[0].pairs).toEqual([{ name: 'UX-21 惡魔冥界改造組', code: 'NEW1234', isFriend: false, isNew: true }]);
  });

  test('已收 code 不標新', () => {
    const leads = voomLeads([posts[2]], { sinceMs: 0, knownCodes: new Set(['OLD1234']) });
    expect(leads[0].pairs[0].isNew).toBe(false);
  });

  test('加好友連結標 isFriend，顯示端降級、不當 🆕 假警報', () => {
    const leads = voomLeads(
      [{ createdTime: 9000, text: '抽籤公告\n👉 加入 LINE 官方帳號：\nhttps://lin.ee/FRIEND01' }],
      { sinceMs: 0, knownCodes: new Set() },
    );
    expect(leads[0].pairs[0]).toMatchObject({ code: 'FRIEND01', isFriend: true, isNew: true });
  });
});
