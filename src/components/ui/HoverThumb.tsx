import { imgUrl } from '../../lib/data'
import './hover-thumb.css'

interface HoverThumbProps {
  label: string
  img?: string
}

/** 顯示零件代號，滑鼠移過時彈出該零件圖片（無圖時退回純文字） */
export function HoverThumb({ label, img }: HoverThumbProps) {
  if (!img) return <>{label}</>
  return (
    <span className="hover-thumb" tabIndex={0}>
      {label}
      <span className="hover-thumb-pop" aria-hidden="true">
        <img src={imgUrl(img)} alt="" width="120" height="120" loading="lazy" decoding="async" />
      </span>
    </span>
  )
}
