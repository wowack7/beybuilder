/**
 * 發射倒數 3→2→1→GO（每拍配裁判語音或提示音）。
 * 由使用者點擊觸發，符合 AudioContext / speechSynthesis 的手勢限制。
 * voiceEnabled 且裝置支援時唸「3、2、1、Go Shoot!」；否則（或唸失敗）退回嗶聲。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { beepGo, beepTick, speak } from '../lib/sound'

export type CountStep = 3 | 2 | 1 | 'GO' | null

const STEP_MS = 1000
/** GO 畫面停留時間：配合拖長的「Go~~ Shoot!」語音（rate 0.35 的 Go 約 1.3 秒） */
const GO_HOLD_MS = 1500

export interface UseCountdown {
  step: CountStep
  running: boolean
  start: () => void
}

export function useCountdown(voiceEnabled = false): UseCountdown {
  const [step, setStep] = useState<CountStep>(null)
  const timers = useRef<number[]>([])
  // start() 排的 timer 讀這裡的最新值，開關中途切換也即時生效
  const voiceRef = useRef(voiceEnabled)
  voiceRef.current = voiceEnabled

  const clear = useCallback(() => {
    for (const id of timers.current) clearTimeout(id)
    timers.current = []
  }, [])

  // 官方唸法「Three, Two, One, Go~~ Shoot!」。
  // Go 拆兩段：慢速（0.45）把單音節「Go」拉成長音，再佇列正常速「Shoot!」收尾——
  // 用 rate 而非「Goooo」文字 hack，避免部分 TTS 把連寫母音唸成別的字。
  const announce = useCallback((v: CountStep) => {
    if (v === null) return
    if (v === 'GO') {
      if (voiceRef.current && speak('Go', 'en-US', 0.35)) {
        speak('Shoot!', 'en-US', 1.1, true)
      } else {
        beepGo()
      }
    } else {
      const word = { 3: 'Three', 2: 'Two', 1: 'One' }[v]
      if (!(voiceRef.current && speak(word))) beepTick()
    }
  }, [])

  const start = useCallback(() => {
    clear()
    setStep(3)
    announce(3)
    const seq: { at: number; v: CountStep }[] = [
      { at: STEP_MS, v: 2 },
      { at: STEP_MS * 2, v: 1 },
      { at: STEP_MS * 3, v: 'GO' },
      { at: STEP_MS * 3 + GO_HOLD_MS, v: null },
    ]
    timers.current = seq.map(({ at, v }) =>
      window.setTimeout(() => {
        setStep(v)
        announce(v)
      }, at),
    )
  }, [clear, announce])

  useEffect(() => clear, [clear])

  return { step, running: step !== null, start }
}
