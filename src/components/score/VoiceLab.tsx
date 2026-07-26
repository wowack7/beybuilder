import { useEffect, useState } from 'react'
import { VOICE_TUNING, getEnglishVoices, speakCount } from '../../lib/sound'

/**
 * 語音調校面板（僅 dev 顯示，正式 build 不載入）。
 * 直接讀寫 sound.ts 的 VOICE_TUNING 單例即時試聽；
 * 聽到滿意的組合後把面板顯示的數值回報，改 VOICE_TUNING 初始值即為正式值。
 */
export function VoiceLab() {
  const [, bump] = useState(0)
  const [voiceNames, setVoiceNames] = useState<string[]>([])

  // getVoices 非同步載入：進場抓一次，之後每秒補抓直到有貨（最多 5 次）
  useEffect(() => {
    let tries = 0
    const grab = () => {
      const names = getEnglishVoices().map((v) => v.name)
      if (names.length) setVoiceNames(names)
      else if (++tries < 5) window.setTimeout(grab, 1000)
    }
    grab()
  }, [])

  const set = <K extends keyof typeof VOICE_TUNING>(key: K, value: (typeof VOICE_TUNING)[K]) => {
    VOICE_TUNING[key] = value
    bump((n) => n + 1)
  }

  const playAll = () => {
    speakCount(3)
    window.setTimeout(() => speakCount(2), 1000)
    window.setTimeout(() => speakCount(1), 2000)
    window.setTimeout(() => speakCount('GO'), 3000)
  }

  const isHowhow = VOICE_TUNING.source === 'howhow'

  return (
    <aside className="voice-lab" aria-label="語音調校（dev）">
      <div className="lab-title">🎙 VoiceLab（dev）</div>

      <label>
        語音來源
        <select value={VOICE_TUNING.source} onChange={(e) => set('source', e.target.value as 'howhow' | 'tts')}>
          <option value="howhow">HowHow（How哥素材）</option>
          <option value="tts">合成語音 TTS</option>
        </select>
      </label>

      {isHowhow && (
        <>
          <label>
            Go 音檔
            <select value={VOICE_TUNING.goClip} onChange={(e) => set('goClip', e.target.value)}>
              <option value="gou4">gou4（狗，短促）</option>
              <option value="gou1">gou1（勾，平）</option>
            </select>
          </label>
          <label>
            Shoot 音檔
            <select value={VOICE_TUNING.shootClip} onChange={(e) => set('shootClip', e.target.value)}>
              <option value="xiu1">xiu1（咻，長）</option>
              <option value="xiu4">xiu4（秀，短）</option>
            </select>
          </label>
          <label>
            Go 播放速度 <code>{VOICE_TUNING.goClipRate.toFixed(2)}</code>
            <input
              type="range"
              min="0.5"
              max="1.2"
              step="0.05"
              value={VOICE_TUNING.goClipRate}
              onChange={(e) => set('goClipRate', Number(e.target.value))}
            />
          </label>
        </>
      )}

      {!isHowhow && (
      <label>
        聲音
        <select
          value={VOICE_TUNING.voiceName ?? ''}
          onChange={(e) => set('voiceName', e.target.value || null)}
        >
          <option value="">自動（優先 Google US）</option>
          {voiceNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      )}

      {!isHowhow && (
        <>
          <label>
            Go 長音 rate <code>{VOICE_TUNING.goRate.toFixed(2)}</code>
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              value={VOICE_TUNING.goRate}
              onChange={(e) => set('goRate', Number(e.target.value))}
            />
          </label>

          <label>
            數字 rate <code>{VOICE_TUNING.numberRate.toFixed(2)}</code>
            <input
              type="range"
              min="0.8"
              max="1.6"
              step="0.05"
              value={VOICE_TUNING.numberRate}
              onChange={(e) => set('numberRate', Number(e.target.value))}
            />
          </label>

          <label>
            音高 pitch <code>{VOICE_TUNING.pitch.toFixed(2)}</code>
            <input
              type="range"
              min="0.5"
              max="1.6"
              step="0.05"
              value={VOICE_TUNING.pitch}
              onChange={(e) => set('pitch', Number(e.target.value))}
            />
          </label>
        </>
      )}

      <div className="lab-actions">
        <button type="button" onClick={() => speakCount('GO')}>
          試聽 Go~Shoot
        </button>
        <button type="button" onClick={playAll}>
          試聽全套
        </button>
      </div>

      <div className="lab-credit">
        語音素材：HowFun《How哥素材》（非商業二創）／HowHow-parser 切分
      </div>
    </aside>
  )
}
