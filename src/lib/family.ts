/**
 * Blade 家族鍵：把「同一顆 blade 的重塗/獎賞/特別版變體」正規化成同一個 key，
 * 用於實戰組合匹配與 deck 內零件重複判定（官方規則以零件為準，顏色不是零件差異）。
 *
 * ⚠️ 未抗辯假設：可剝除後綴清單來自對 parts/combos 資料的普查（顏色與版本詞）。
 * 功能性標記一律保留為不同零件：
 *  - (左)/(右)：左右旋是物理上不同的 blade
 *  - (上升攻擊型)/(連擊型) 等「…型」：無法確認是否同模具，保守視為不同
 */

/** 純顏色/外觀詞（括號內完全等於其一才剝除） */
const COLOR_WORDS = new Set([
  '黑',
  '紅',
  '綠',
  '藍',
  '黃',
  '紫',
  '粉',
  '金',
  '銀',
  '青',
  '白',
  '闇黑',
])

/**
 * 版本/獎賞/賽事詞：純外觀變體，同模具，功能等價於基底。
 * 可出現在空白分隔尾段（英仙幽冥 特別版）或括號內（武士星劍(世足)）。
 * ⚠️ 未抗辯假設：世足＝世界盃紀念版，視為同模外觀變體（與顏色同級）。
 */
const EDITION_WORDS = new Set(['特別版', '透明版', '異色版', '水籃版', '火紅版', '籤王', '世足'])

export function bladeFamilyKey(name: string): string {
  let key = name.trim()
  let changed = true
  while (changed) {
    changed = false
    // 剝除結尾的顏色/版本括號：魔導神杖(綠) → 魔導神杖、武士星劍(世足) → 武士星劍
    //（功能標記如 (左)/(…型) 不在兩表中，保留）
    const paren = key.match(/^(.*?)[（(]([^()（）]+)[)）]$/)
    if (paren && (COLOR_WORDS.has(paren[2]) || EDITION_WORDS.has(paren[2]))) {
      key = paren[1].trim()
      changed = true
      continue
    }
    // 剝除空白分隔的版本尾詞：英仙幽冥 特別版 → 英仙幽冥
    const tail = key.match(/^(.*\S)\s+(\S+)$/)
    if (tail) {
      const word = tail[2].replace(/^[（(]|[)）]$/g, '')
      if (EDITION_WORDS.has(tail[2]) || COLOR_WORDS.has(word)) {
        key = tail[1].trim()
        changed = true
      }
    }
  }
  return key
}
