/**
 * 評分權重常數。
 *
 * ⚠️ 未抗辯假設（unchallenged assumptions）：
 * 以下數值（階級分數、零件權重、實戰統計權重）是本專案自訂的合理預設，
 * 未經對抗性審查或實戰驗證；tier 階級本身轉錄自 stan-yao 天梯站，
 * 實戰分數轉錄自該站 recommendation_score。調整權重只需改這個檔案。
 */
import type { Blade, SimplePart } from '../types'

/** stan-yao 天梯階級 → 分數（X 為最高階） */
export const TIER_VALUE: Record<string, number> = {
  X: 100,
  'S+': 92,
  S: 85,
  'A+': 78,
  A: 70,
  'B+': 62,
  B: 55,
  'C+': 48,
  C: 40,
  'D+': 32,
  D: 25,
  'E+': 18,
  E: 10,
}

/** 無階級資料時的保守預設分 */
export const UNRATED_VALUE = 20

/** 單顆陀螺內三零件的權重（合計 1） */
export const PART_WEIGHTS = { blade: 0.5, ratchet: 0.2, bit: 0.3 } as const

/**
 * 已知實戰組合的分數構成：META_WEIGHT × 實戰正規化分 + (1-META_WEIGHT) × 零件階級分。
 * 站方推薦（天梯站「建議配置」欄，無勝場統計）依零件階級分乘 SITE_TRUST——
 * 信任度略低於有實戰統計背書的組合。
 */
export const META_WEIGHT = 0.6
export const SITE_TRUST = 0.9

export const tierValue = (tier: string): number => TIER_VALUE[tier] ?? UNRATED_VALUE

/** 實戰 recommendation_score 動態範圍大（0～1500+），取對數正規化到 0–100 */
export function metaScoreNormalizer(maxRawScore: number): (raw: number) => number {
  const denom = Math.log1p(Math.max(maxRawScore, 1))
  return (raw: number) => (100 * Math.log1p(Math.max(raw, 0))) / denom
}

export function partScore(blade: Blade | undefined, ratchet: SimplePart | undefined, bit: SimplePart | undefined): number {
  const b = blade ? tierValue(blade.tier) : UNRATED_VALUE
  const r = ratchet ? tierValue(ratchet.tier) : UNRATED_VALUE
  const t = bit ? tierValue(bit.tier) : UNRATED_VALUE
  return PART_WEIGHTS.blade * b + PART_WEIGHTS.ratchet * r + PART_WEIGHTS.bit * t
}
