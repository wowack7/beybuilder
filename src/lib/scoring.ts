/**
 * Beyblade X 比賽計分（裁判用）純邏輯。
 *
 * 規則來源：官方 Beyblade X Regulation（先到 4 分者勝）。分值：
 *   Spin Finish（對手停轉）= 1；Burst（爆裂）= 2；Over（擊出/進 over zone）= 2；Xtreme（進 Xtreme zone）= 3。
 * 未抗辯假設：達 4 分即鎖定該方獲勝、不再加分（撤銷可解鎖），為常規賽制的合理呈現。
 *
 * 純函式、immutable：所有操作回傳新 state，UI 狀態與持久化由 useMatch 負責。
 */

export type Finish = 'spin' | 'over' | 'burst' | 'xtreme'
export type Side = 'a' | 'b'

/** finish → 得分（官方 Regulation） */
export const FINISH_POINTS: Record<Finish, number> = {
  spin: 1,
  over: 2,
  burst: 2,
  xtreme: 3,
}

/** 先到此分數者勝 */
export const WIN_POINTS = 4

// 同色模式（不做紅藍隊色）→ 預設名也中性化，依橫向左右分屏取名
export const DEFAULT_NAMES: Record<Side, string> = { a: '左方', b: '右方' }

export interface LogEntry {
  side: Side
  finish: Finish
  points: number
}

export interface MatchState {
  names: Record<Side, string>
  log: LogEntry[]
}

export function freshMatch(names: Record<Side, string> = DEFAULT_NAMES): MatchState {
  return { names: { ...names }, log: [] }
}

export function scoreOf(state: MatchState, side: Side): number {
  return state.log.reduce((sum, e) => (e.side === side ? sum + e.points : sum), 0)
}

/** 已達勝利分數的一方；未定為 null。log 在達標即停止加分，故至多一方達標 */
export function winner(state: MatchState): Side | null {
  if (scoreOf(state, 'a') >= WIN_POINTS) return 'a'
  if (scoreOf(state, 'b') >= WIN_POINTS) return 'b'
  return null
}

export function isMatchOver(state: MatchState): boolean {
  return winner(state) !== null
}

/** 給某方記一次 finish。已分出勝負則忽略（避免誤點；要改用 undo 解鎖） */
export function awardFinish(state: MatchState, side: Side, finish: Finish): MatchState {
  if (isMatchOver(state)) return state
  const entry: LogEntry = { side, finish, points: FINISH_POINTS[finish] }
  return { ...state, log: [...state.log, entry] }
}

/** 撤銷最後一筆紀錄（空 log 時原樣返回） */
export function undoLast(state: MatchState): MatchState {
  if (state.log.length === 0) return state
  return { ...state, log: state.log.slice(0, -1) }
}

/** 清空紀錄，保留雙方名字 */
export function resetMatch(state: MatchState): MatchState {
  return { ...state, log: [] }
}

/** 改名；空白名回退為預設名，避免顯示空白 */
export function renameSide(state: MatchState, side: Side, name: string): MatchState {
  const clean = name.trim() || DEFAULT_NAMES[side]
  return { ...state, names: { ...state.names, [side]: clean } }
}
