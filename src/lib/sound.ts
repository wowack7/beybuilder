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

/** 裝置是否支援語音合成（不支援就別顯示語音開關） */
export const speechSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

/**
 * 裁判語音（Web Speech API，無外部音檔）。回傳是否成功送出——
 * 失敗時呼叫端退回嗶聲。每次先 cancel 前一句，倒數節奏優先於唸完整句。
 * 官方無開放音源（查證 2026-07-19：TAKARA TOMY 無効果音素材配布），
 * 官方 App/動畫音檔屬版權物不可自架，故以 TTS 唸官方英文唸法代替。
 */
export function speak(text: string, lang = 'en-US', rate = 1.15, queue = false): boolean {
  try {
    if (!speechSupported()) return false
    const synth = window.speechSynthesis
    // queue=true 接在前一句後面播（例：拖長的「Go~」接「Shoot!」），不打斷
    if (!queue) synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    u.rate = rate
    synth.speak(u)
    return true
  } catch {
    return false
  }
}
