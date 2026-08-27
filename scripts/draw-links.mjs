// 上游抽選連結有兩種格式，draw-sync 與 draw-build 共用這組樣式，避免只改一邊。
//   lin.ee 短址        → 要查 mapping.tsv 解轉址，解出來的才是終點
//   liff.line.me 直連  → 本身就是終點，不必解轉址（2026-08-27 起部分店家改用這種）
export const LINK_SRC = String.raw`https:\/\/(?:lin\.ee\/[A-Za-z0-9]+|liff\.line\.me\/[A-Za-z0-9-]+\/c\/[A-Za-z0-9]+)`;

export const linkRe = (flags) => new RegExp(LINK_SRC, flags);

/** 整行就是一條連結（正本 source-links.txt 的網址行） */
export const isLinkLine = (s) => new RegExp(`^${LINK_SRC}$`).test(s);

/**
 * 去掉查詢字串與其他尾綴。上游的 liff 直連帶 ?q=timeline_post 追蹤參數，
 * 而 mapping.tsv 從 lin.ee 解出來的是無 query 形式；不正規化的話，
 * 同一場抽選會因為 query 差異被當成兩筆，重複偵測也抓不到。
 */
export const normLink = (u) => u.match(linkRe())?.[0] ?? u;

/** 短址才需要查轉址 */
export const isShortLink = (u) => u.startsWith('https://lin.ee/');
