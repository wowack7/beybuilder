export interface PartStats {
  attack: number
  defense: number
  stamina: number
  burst: number
  dash: number
  height: number
}

/** 一個產品（陀螺商品）＝ blade ＋ 原裝 ratchet ＋ 原裝 bit（部分含輔助戰刃） */
export interface Product {
  id: string
  name: string
  type: string
  tier: string
  buy: string
  ratchet: string
  ratchetTier: string
  bit: string
  bitTier: string
  assist: string
  source: string
  img: string
  /** CX 五層拆解（鎖片/主刃，顯示與重複判定用；來自 phstudy 反查，非 CX 產品為空） */
  lockChip?: string
  mainBlade?: string
}

export interface Blade {
  name: string
  type: string
  tier: string
  tierInherited: boolean
  img: string
  productIds: string[]
  stats?: PartStats
  rotation?: string
}

export interface SimplePart {
  id: string
  tier: string
  img: string
  stats?: PartStats
}

export interface PartsDb {
  blades: Blade[]
  ratchets: SimplePart[]
  bits: SimplePart[]
  /** 輔助刃（CX 專用第三層；id 為單字母代號，顯示為「輔助X」） */
  assists: SimplePart[]
}

/** stan-yao 站的實戰組合統計（recommendation_score 為該站推薦分數） */
export interface MetaCombo {
  rank: number
  blade: string
  bladeId: string
  ratchet: string
  bit: string
  score: number
  wins: number
  champRate: number
  recent90: number
}

export type ComboSource = 'meta' | 'site'

/** stan-yao 站「建議配置」欄解析出的站方推薦組合 */
export interface SiteCombo {
  blade: string
  ratchet: string
  bit: string
  /** 指定輔助刃（CX 組合才有，如 "S"） */
  assist?: string
}

/** 一顆組好的陀螺（含評分） */
export interface BeyCombo {
  blade: string
  ratchet: string
  bit: string
  /** 輔助刃字母（CX 組合：站方指定或原裝帶入；非 CX 為空） */
  assist?: string
  /** CX 拆名（顯示與 deck 重複判定用） */
  lockChip?: string
  mainBlade?: string
  score: number
  source: ComboSource
  meta?: MetaCombo
}

export interface DeckResult {
  beys: BeyCombo[]
  totalScore: number
  /** 庫存湊不滿 3 顆互不重複零件的陀螺時為 true */
  incomplete: boolean
  /** 未進入 deck 的次佳候選（供替換參考） */
  alternates: BeyCombo[]
}

/** 玩家庫存：以產品為主，另可補登單獨入手的零件 */
export interface Inventory {
  productIds: string[]
  extraBlades: string[]
  extraRatchets: string[]
  extraBits: string[]
  /** 選填：v1 舊存檔沒有此欄位（載入時視為空） */
  extraAssists?: string[]
}
