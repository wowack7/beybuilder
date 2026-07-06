import { imgUrl } from '../../lib/data'
import type { Product } from '../../types'
import { TierBadge } from '../ui/TierBadge'
import { TypeTag } from '../ui/TypeTag'

interface ProductCardProps {
  product: Product
  owned: boolean
  onToggle: (id: string) => void
}

export function ProductCard({ product, owned, onToggle }: ProductCardProps) {
  return (
    <button
      type="button"
      className="product-card"
      aria-pressed={owned}
      onClick={() => onToggle(product.id)}
    >
      <span className="owned-mark" aria-hidden="true">
        {owned ? '✓' : '+'}
      </span>
      {product.img ? (
        <img className="product-img" src={imgUrl(product.img)} alt="" width="180" height="180" loading="lazy" decoding="async" />
      ) : (
        <span className="product-img-empty" aria-hidden="true">
          X
        </span>
      )}
      <span className="product-id">{product.id}</span>
      <span className="product-name">
        {product.name}
        <TierBadge tier={product.tier} />
      </span>
      <TypeTag type={product.type} />
      <span className="product-parts">
        {product.ratchet && <span className="part-chip">{product.ratchet}</span>}
        {product.bit && <span className="part-chip">{product.bit}</span>}
        {product.assist && <span className="part-chip">輔助 {product.assist}</span>}
      </span>
    </button>
  )
}
