import { useRef, useState } from 'react'
import { imgUrl } from '../../lib/data'
import './hover-thumb.css'

interface HoverThumbProps {
  label: string
  img?: string
}

/**
 * 顯示零件代號，滑鼠移過（或鍵盤 focus）時彈出該零件圖片。
 * 彈出層用 position:fixed＋即時算座標，才不會被祖先的 overflow:hidden（卡片/候補列表）裁掉。
 * 無圖時退回純文字。
 */
export function HoverThumb({ label, img }: HoverThumbProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  if (!img) return <>{label}</>

  const show = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ left: r.left + r.width / 2, top: r.top })
  }
  const hide = () => setPos(null)

  return (
    <span
      ref={ref}
      className="hover-thumb"
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {label}
      {pos && (
        <span className="hover-thumb-pop" style={{ left: pos.left, top: pos.top }} aria-hidden="true">
          <img src={imgUrl(img)} alt="" width="120" height="120" loading="eager" decoding="async" />
        </span>
      )}
    </span>
  )
}
