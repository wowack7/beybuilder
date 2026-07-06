import type { CSSProperties } from 'react'
import { TYPE_LABEL } from '../../lib/data'

export function TypeTag({ type }: { type: string }) {
  const label = TYPE_LABEL[type]
  if (!label) return null
  const style = { '--type-color': `var(--type-${type})` } as CSSProperties
  return (
    <span className="type-tag" style={style}>
      {label}
    </span>
  )
}
