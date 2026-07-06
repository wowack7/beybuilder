import { COMBO_SOURCE_LABEL, bitById, bladeByName, imgUrl, ratchetById } from '../../lib/data'
import type { BeyCombo } from '../../types'
import { TierBadge } from '../ui/TierBadge'

interface BeyCardProps {
  bey: BeyCombo
  slot: number
}

export function BeyCard({ bey, slot }: BeyCardProps) {
  const blade = bladeByName.get(bey.blade)
  const ratchet = ratchetById.get(bey.ratchet)
  const bit = bitById.get(bey.bit)

  return (
    <article className="bey-card">
      <span className="slot" aria-hidden="true">
        {String(slot).padStart(2, '0')}
      </span>
      <div className="bey-head">
        {blade?.img ? (
          <img className="bey-img" src={imgUrl(blade.img)} alt="" width="84" height="84" loading="lazy" decoding="async" />
        ) : (
          <span className="bey-img-placeholder" aria-hidden="true">
            X
          </span>
        )}
        <div>
          <h3>
            {bey.blade} {bey.ratchet}
            {bey.bit}
            {bey.assist ? `（輔助${bey.assist}）` : ''}
          </h3>
        </div>
      </div>

      <ul className="bey-parts">
        {bey.lockChip && bey.mainBlade ? (
          // CX 五層：鎖片＋主刃＋輔助刃（整刃階級掛在主刃列）
          <>
            <li className="part-row">
              <span className="part-kind">鎖片</span>
              <span className="part-name">{bey.lockChip}</span>
            </li>
            <li className="part-row">
              <span className="part-kind">主刃</span>
              <span className="part-name">{bey.mainBlade}</span>
              <TierBadge tier={blade?.tier ?? ''} inherited={blade?.tierInherited} />
            </li>
          </>
        ) : (
          <li className="part-row">
            <span className="part-kind">戰刃</span>
            <span className="part-name">{bey.blade}</span>
            <TierBadge tier={blade?.tier ?? ''} inherited={blade?.tierInherited} />
          </li>
        )}
        {bey.assist && (
          <li className="part-row">
            <span className="part-kind">輔助刃</span>
            <span className="part-name">輔助{bey.assist}</span>
          </li>
        )}
        <li className="part-row">
          <span className="part-kind">固鎖</span>
          <span className="part-name">{bey.ratchet}</span>
          <TierBadge tier={ratchet?.tier ?? ''} />
        </li>
        <li className="part-row">
          <span className="part-kind">軸心</span>
          <span className="part-name">{bey.bit}</span>
          <TierBadge tier={bit?.tier ?? ''} />
        </li>
      </ul>

      <footer className="bey-meta">
        <span className="source-tag" data-source={bey.source}>
          {COMBO_SOURCE_LABEL[bey.source] ?? bey.source}
        </span>
        {bey.meta && (
          <>
            <span>
              勝場 <strong>{bey.meta.wins}</strong>
            </span>
            <span>
              奪冠率 <strong>{(bey.meta.champRate * 100).toFixed(0)}%</strong>
            </span>
          </>
        )}
      </footer>
    </article>
  )
}
