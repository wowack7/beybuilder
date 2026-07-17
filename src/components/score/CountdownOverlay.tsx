import type { CountStep } from '../../hooks/useCountdown'

interface CountdownOverlayProps {
  step: CountStep
}

/** 發射倒數大數字覆蓋層。每次 step 變化用 key 重觸發縮放動畫。 */
export function CountdownOverlay({ step }: CountdownOverlayProps) {
  if (step === null) return null
  const isGo = step === 'GO'
  return (
    <div className="countdown-overlay" aria-live="assertive">
      <div key={String(step)} className="countdown-num" data-go={isGo}>
        {isGo ? 'GO!' : step}
      </div>
    </div>
  )
}
