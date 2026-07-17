/**
 * 計分頁狀態＋localStorage 持久化（重整不掉分）。
 * 純規則在 src/lib/scoring.ts，這裡只負責 React state 與存取。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_NAMES,
  FINISH_POINTS,
  type Finish,
  type LogEntry,
  type MatchState,
  type Side,
  awardFinish,
  freshMatch,
  renameSide,
  resetMatch,
  undoLast,
} from '../lib/scoring'

const STORAGE_KEY = 'beybuilder.match.v1'

/** 只收合法紀錄，並以 FINISH_POINTS 重算分值——擋掉手改/舊版 localStorage 造成的 NaN 分數 */
function sanitizeLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return []
  const out: LogEntry[] = []
  for (const e of raw) {
    const side = (e as Partial<LogEntry>)?.side
    const finish = (e as Partial<LogEntry>)?.finish
    if ((side === 'a' || side === 'b') && finish && finish in FINISH_POINTS) {
      out.push({ side, finish, points: FINISH_POINTS[finish] })
    }
  }
  return out
}

/** 舊版預設名（紅藍隊色時期）→ 現行預設名；使用者自取的名字不受影響 */
const LEGACY_DEFAULT: Record<string, Side> = { 藍方: 'a', 紅方: 'b' }

function migrateName(name: string | undefined, side: Side): string {
  if (!name) return DEFAULT_NAMES[side]
  return LEGACY_DEFAULT[name] === side ? DEFAULT_NAMES[side] : name
}

function load(): MatchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshMatch()
    const parsed = JSON.parse(raw) as Partial<MatchState>
    if (!parsed || !parsed.names) return freshMatch()
    return {
      names: { a: migrateName(parsed.names.a, 'a'), b: migrateName(parsed.names.b, 'b') },
      log: sanitizeLog(parsed.log),
    }
  } catch {
    return freshMatch()
  }
}

export interface UseMatch {
  match: MatchState
  award: (side: Side, finish: Finish) => void
  undo: () => void
  reset: () => void
  rename: (side: Side, name: string) => void
}

export function useMatch(): UseMatch {
  const [match, setMatch] = useState<MatchState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(match))
    } catch {
      // 私密模式等無法寫入：忽略，僅失去持久化
    }
  }, [match])

  const award = useCallback((side: Side, finish: Finish) => setMatch((m) => awardFinish(m, side, finish)), [])
  const undo = useCallback(() => setMatch((m) => undoLast(m)), [])
  const reset = useCallback(() => setMatch((m) => resetMatch(m)), [])
  const rename = useCallback((side: Side, name: string) => setMatch((m) => renameSide(m, side, name)), [])

  return { match, award, undo, reset, rename }
}
