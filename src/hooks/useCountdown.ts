/**
 * 發射倒數 3→2→1→GO（每拍配提示音）。由使用者點擊觸發，符合 AudioContext 手勢限制。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { beepGo, beepTick } from '../lib/sound'

export type CountStep = 3 | 2 | 1 | 'GO' | null

const STEP_MS = 1000
const GO_HOLD_MS = 800

export interface UseCountdown {
  step: CountStep
  running: boolean
  start: () => void
}

export function useCountdown(): UseCountdown {
  const [step, setStep] = useState<CountStep>(null)
  const timers = useRef<number[]>([])

  const clear = useCallback(() => {
    for (const id of timers.current) clearTimeout(id)
    timers.current = []
  }, [])

  const start = useCallback(() => {
    clear()
    setStep(3)
    beepTick()
    const seq: { at: number; v: CountStep }[] = [
      { at: STEP_MS, v: 2 },
      { at: STEP_MS * 2, v: 1 },
      { at: STEP_MS * 3, v: 'GO' },
      { at: STEP_MS * 3 + GO_HOLD_MS, v: null },
    ]
    timers.current = seq.map(({ at, v }) =>
      window.setTimeout(() => {
        setStep(v)
        if (v === 'GO') beepGo()
        else if (v !== null) beepTick()
      }, at),
    )
  }, [clear])

  useEffect(() => clear, [clear])

  return { step, running: step !== null, start }
}
