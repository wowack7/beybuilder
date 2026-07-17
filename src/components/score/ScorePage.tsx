import { useEffect } from 'react'
import { useCountdown } from '../../hooks/useCountdown'
import { useMatch } from '../../hooks/useMatch'
import { FINISH_POINTS, type Finish, type Side, scoreOf, winner } from '../../lib/scoring'
import { CountdownOverlay } from './CountdownOverlay'
import './score.css'

// 分值單一來源為 scoring.ts 的 FINISH_POINTS，這裡只定義顯示名稱，避免按鈕「+N」與實際加分不一致
const FINISHES: { id: Finish; label: string }[] = [
  { id: 'spin', label: '停轉' },
  { id: 'over', label: '擊出' },
  { id: 'burst', label: '爆裂' },
  { id: 'xtreme', label: '極限' },
]
const FINISH_LABEL = Object.fromEntries(FINISHES.map((f) => [f.id, f.label])) as Record<Finish, string>

/** 比賽期間盡量不讓螢幕休眠（best-effort，不支援就算了） */
function useWakeLock(): void {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> }
    const api = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock
    if (!api) return
    let sentinel: Sentinel | null = null
    let released = false
    const acquire = async () => {
      try {
        const got = await api.request('screen')
        // request 是 async：若元件在等待期間已卸載，立刻釋放、別留下不會被回收的鎖
        if (released) void got.release().catch(() => {})
        else sentinel = got
      } catch {
        // 使用者未互動或不支援：忽略
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [])
}

interface SidePanelProps {
  side: Side
  name: string
  score: number
  won: boolean
  locked: boolean
  onAward: (finish: Finish) => void
  onRename: () => void
}

function SidePanel({ side, name, score, won, locked, onAward, onRename }: SidePanelProps) {
  return (
    <section className="side-panel" data-side={side} data-won={won} aria-label={`${name} 計分`}>
      <button type="button" className="side-name" onClick={onRename}>
        {name}
      </button>
      <div className="side-score" aria-live="polite">
        {score}
      </div>
      <div className="finish-grid">
        {FINISHES.map((f) => (
          <button
            key={f.id}
            type="button"
            className="finish-btn"
            data-pts={FINISH_POINTS[f.id]}
            disabled={locked}
            onClick={() => onAward(f.id)}
          >
            <span className="finish-label">{f.label}</span>
            <span className="finish-pts">+{FINISH_POINTS[f.id]}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

interface ScorePageProps {
  onExit: () => void
}

export function ScorePage({ onExit }: ScorePageProps) {
  const { match, award, undo, reset, rename } = useMatch()
  const countdown = useCountdown()
  useWakeLock()

  const win = winner(match)
  const scoreA = scoreOf(match, 'a')
  const scoreB = scoreOf(match, 'b')

  const promptRename = (side: Side) => {
    const next = window.prompt('隊伍名稱', match.names[side])
    if (next !== null) rename(side, next)
  }

  return (
    <div className="score-root">
      <button type="button" className="score-exit" onClick={onExit} aria-label="離開計分">
        ✕
      </button>

      <div className="score-arena">
        <SidePanel
          side="a"
          name={match.names.a}
          score={scoreA}
          won={win === 'a'}
          locked={win !== null}
          onAward={(f) => award('a', f)}
          onRename={() => promptRename('a')}
        />

        <div className="score-center">
          <button type="button" className="launch-btn" onClick={countdown.start} disabled={countdown.running}>
            <span className="launch-title">Go&nbsp;Shoot!</span>
            <span className="launch-sub">發射倒數</span>
          </button>

          <div className="center-actions">
            <button type="button" className="ctl-btn" onClick={undo} disabled={match.log.length === 0}>
              ↩ 撤銷
            </button>
            <button type="button" className="ctl-btn" onClick={reset} disabled={match.log.length === 0}>
              ⟳ 重置
            </button>
          </div>

          <ol className="battle-log" aria-label="每場紀錄">
            {match.log.length === 0 && <li className="log-empty">尚無紀錄</li>}
            {match.log
              .map((e, idx) => ({ e, idx }))
              .reverse()
              .map(({ e, idx }) => (
                <li key={idx} data-side={e.side}>
                <span className="log-name">{match.names[e.side]}</span>
                <span className="log-finish">{FINISH_LABEL[e.finish]}</span>
                <span className="log-pts">+{e.points}</span>
              </li>
            ))}
          </ol>
        </div>

        <SidePanel
          side="b"
          name={match.names.b}
          score={scoreB}
          won={win === 'b'}
          locked={win !== null}
          onAward={(f) => award('b', f)}
          onRename={() => promptRename('b')}
        />
      </div>

      {countdown.step !== null && <CountdownOverlay step={countdown.step} />}

      {win && (
        <div className="winner-overlay" role="alertdialog" aria-label="比賽結束">
          <div className="winner-card" data-side={win}>
            <div className="winner-trophy">🏆</div>
            <div className="winner-name">{match.names[win]} 獲勝</div>
            <div className="winner-score">
              {scoreA} <span>:</span> {scoreB}
            </div>
            <div className="winner-actions">
              <button type="button" className="ctl-btn primary" onClick={reset}>
                再戰一場
              </button>
              <button type="button" className="ctl-btn" onClick={onExit}>
                離開
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rotate-hint" aria-hidden="true">
        <div className="rotate-icon">⟳</div>
        請將手機打橫使用
      </div>
    </div>
  )
}
