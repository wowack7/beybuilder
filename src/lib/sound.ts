/**
 * 極簡提示音（Web Audio）＋裁判語音（Web Speech API），皆無外部音檔。
 * AudioContext / speechSynthesis 都要在使用者手勢後才能出聲——倒數由點擊觸發，故沒問題。
 * 全部 try/catch 靜默失敗：不支援或被瀏覽器擋住時，計分照常運作、只是沒聲音。
 *
 * 官方無開放音源（查證 2026-07-19：TAKARA TOMY 無効果音素材配布），
 * 官方 App/動畫音檔屬版權物不可自架，故以 TTS 唸官方英文唸法代替。
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
 * 倒數語音參數。dev 的 VoiceLab 面板會即時改這些值試聽（module 單例，
 * 刻意可變——正式站不載入 VoiceLab，這裡的初始值就是正式值）。
 */
export const VOICE_TUNING = {
  /**
   * 語音來源：howhow＝HowFun《How哥素材》切分音檔（官方釋出供非商業二創，
   * 切分自 EarlySpringCommitee/HowHow-parser，需標註出處）；tts＝合成語音。
   */
  source: 'howhow' as 'howhow' | 'tts',
  /** HowHow 模式：Go/Shoot 用哪個聲調的音檔（public/howhow/*.mp3） */
  goClip: 'gou4',
  shootClip: 'xiu1',
  /** HowHow 模式：Go 音檔播放速度（<1 拉長） */
  goClipRate: 0.85,
  /** TTS 模式：指定語音名稱；null = 自動挑（見 pickVoice） */
  voiceName: null as string | null,
  numberRate: 1.15,
  goRate: 0.35,
  shootRate: 1.1,
  pitch: 1,
}

// ── HowHow 音檔播放 ──────────────────────────────
const clipCache = new Map<string, HTMLAudioElement>()
const clipFailed = new Set<string>()

function getClip(name: string): HTMLAudioElement | null {
  if (clipFailed.has(name)) return null
  let a = clipCache.get(name)
  if (!a) {
    try {
      a = new Audio(`${import.meta.env.BASE_URL}howhow/${name}.mp3`)
      a.preload = 'auto'
      a.addEventListener('error', () => clipFailed.add(name))
      clipCache.set(name, a)
    } catch {
      clipFailed.add(name)
      return null
    }
  }
  return a
}

/** 播一個 HowHow 音檔；onEnded 可串下一段。回傳是否成功起播 */
function playClip(name: string, rate = 1, onEnded?: () => void): boolean {
  const a = getClip(name)
  if (!a) return false
  try {
    a.pause()
    a.currentTime = 0
    a.playbackRate = rate
    if (onEnded) a.addEventListener('ended', onEnded, { once: true })
    void a.play().catch(() => clipFailed.add(name))
    return true
  } catch {
    return false
  }
}

// getVoices() 在部分瀏覽器是非同步載入：先掛 listener 讓清單就緒後能重挑
let voices: SpeechSynthesisVoice[] = []
function refreshVoices(): void {
  try {
    voices = window.speechSynthesis.getVoices()
  } catch {
    voices = []
  }
}
if (speechSupported()) {
  refreshVoices()
  try {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
  } catch {
    // 舊瀏覽器沒有此事件：沿用當下清單
  }
}

/** 可選的英文語音清單（VoiceLab 下拉用） */
export function getEnglishVoices(): SpeechSynthesisVoice[] {
  if (!voices.length) refreshVoices()
  return voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
}

/**
 * 挑語音：瀏覽器預設常是最生硬的那個。優先網路高品質聲
 * （Chrome 的 Google US English）→ 標榜 premium/enhanced/natural → Samantha → 任一英文聲。
 */
function pickVoice(): SpeechSynthesisVoice | null {
  const en = getEnglishVoices()
  if (!en.length) return null
  if (VOICE_TUNING.voiceName) {
    const chosen = en.find((v) => v.name === VOICE_TUNING.voiceName)
    if (chosen) return chosen
  }
  return (
    en.find((v) => /google us english/i.test(v.name)) ??
    en.find((v) => /premium|enhanced|natural/i.test(v.name)) ??
    en.find((v) => /samantha/i.test(v.name)) ??
    en[0]
  )
}

export interface SpeakOptions {
  lang?: string
  rate?: number
  pitch?: number
  /** true：接在前一句後面播（例：拖長的「Go~」接「Shoot!」），不打斷 */
  queue?: boolean
}

/** 裁判語音。回傳是否成功送出——失敗時呼叫端退回嗶聲 */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  try {
    if (!speechSupported()) return false
    const synth = window.speechSynthesis
    if (!opts.queue) synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = opts.lang ?? 'en-US'
    u.rate = opts.rate ?? 1
    u.pitch = opts.pitch ?? VOICE_TUNING.pitch
    const v = pickVoice()
    if (v) u.voice = v
    synth.speak(u)
    return true
  } catch {
    return false
  }
}

/** HowHow 倒數音檔：三＝san1、二＝er4、一＝yi1；Go/Shoot 由 VOICE_TUNING 選聲調 */
const HOWHOW_NUMBER: Record<3 | 2 | 1, string> = { 3: 'san1', 2: 'er4', 1: 'yi1' }

/**
 * 唸整段倒數口令中的一拍；由 useCountdown 與 VoiceLab 共用，參數單一來源是 VOICE_TUNING。
 * 來源鏈：HowHow 音檔 →（載入失敗或選 tts）合成語音 →（再失敗）呼叫端退嗶聲。
 */
export function speakCount(step: 3 | 2 | 1 | 'GO'): boolean {
  if (VOICE_TUNING.source === 'howhow') {
    if (step === 'GO') {
      const shoot = VOICE_TUNING.shootClip
      if (playClip(VOICE_TUNING.goClip, VOICE_TUNING.goClipRate, () => playClip(shoot))) return true
    } else if (playClip(HOWHOW_NUMBER[step])) {
      return true
    }
    // 音檔不可用 → 落到 TTS
  }
  if (step === 'GO') {
    const ok = speak('Go', { rate: VOICE_TUNING.goRate })
    if (ok) speak('Shoot!', { rate: VOICE_TUNING.shootRate, queue: true })
    return ok
  }
  const word = { 3: 'Three', 2: 'Two', 1: 'One' }[step]
  return speak(word, { rate: VOICE_TUNING.numberRate })
}
