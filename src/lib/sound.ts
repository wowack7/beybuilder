/**
 * 極簡提示音（Web Audio，無外部檔）。用於發射倒數 3-2-1-Go。
 * AudioContext 必須在使用者手勢後才能發聲——倒數由點擊觸發，故沒問題。
 * 全部 try/catch 靜默失敗：不支援或被瀏覽器擋住時，計分照常運作、只是沒聲音。
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** 響一個短音；freq 越高越尖，durationMs 音長 */
export function beep(freq: number, durationMs = 140, gain = 0.15): void {
  const ac = getCtx()
  if (!ac) return
  try {
    const osc = ac.createOscillator()
    const vol = ac.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    vol.gain.value = gain
    osc.connect(vol).connect(ac.destination)
    const now = ac.currentTime
    // 尾端淡出避免爆音
    vol.gain.setValueAtTime(gain, now)
    vol.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
    osc.start(now)
    osc.stop(now + durationMs / 1000)
  } catch {
    // 靜默：沒聲音不影響計分
  }
}

/** 倒數的每一拍：3/2/1 用低音短響，Go 用高音長響 */
export const beepTick = (): void => beep(520, 140)
export const beepGo = (): void => beep(880, 380, 0.2)
