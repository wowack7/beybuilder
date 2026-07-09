import { useMemo, useState } from 'react'
import { useCustomDeck, type CustomSlot, type SlotField } from '../../hooks/useCustomDeck'
import { bitById, bladeByName, imgUrl, metaCombos, partsDb, products, ratchetById } from '../../lib/data'
import { bladeFamilyKey } from '../../lib/family'
import { resolveOwnedParts } from '../../lib/recommend'
import { tierValue } from '../../lib/score'
import { dateStamp, renderDeckCard, shareOrDownloadPng } from '../../lib/shareCard'
import type { BeyCombo, DeckResult, Inventory } from '../../types'
import { TierBadge } from '../ui/TierBadge'
import './build.css'

interface BuildPageProps {
  inventory: Inventory
  onGoInventory: () => void
}

interface Option {
  value: string
  label: string
  tier: string
}

const byTierDesc = <T extends { tier: string }>(a: T, b: T) => tierValue(b.tier) - tierValue(a.tier)

export function BuildPage({ inventory, onGoInventory }: BuildPageProps) {
  const { slots, setSlotPart, clearSlot, reset } = useCustomDeck()
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'error'>('idle')
  const owned = useMemo(() => resolveOwnedParts(inventory, products, partsDb), [inventory])

  // CX 戰刃（有紋章＋主刃拆名者）需要輔助刃
  const cxBlades = useMemo(
    () => new Set(products.filter((p) => p.lockChip && p.mainBlade).map((p) => p.name)),
    [],
  )

  const bladeOpts: Option[] = useMemo(
    () => [...owned.blades].sort(byTierDesc).map((b) => ({ value: b.name, label: b.name, tier: b.tier })),
    [owned],
  )
  const ratchetOpts: Option[] = useMemo(
    () => [...owned.ratchets].sort(byTierDesc).map((r) => ({ value: r.id, label: r.id, tier: r.tier })),
    [owned],
  )
  const bitOpts: Option[] = useMemo(
    () => [...owned.bits].sort(byTierDesc).map((b) => ({ value: b.id, label: b.id, tier: b.tier })),
    [owned],
  )
  const assistOpts: Option[] = useMemo(
    () => owned.assists.map((a) => ({ value: a.id, label: `輔助${a.id}`, tier: a.tier })),
    [owned],
  )

  const hasParts = bladeOpts.length > 0 && ratchetOpts.length > 0 && bitOpts.length > 0

  // 其他槽位已用的零件（戰刃以家族鍵判定）
  const usedElsewhere = (index: number, field: SlotField, familyKey = false) => {
    const set = new Set<string>()
    slots.forEach((s, i) => {
      if (i === index) return
      const v = s[field]
      if (v) set.add(familyKey ? bladeFamilyKey(v) : v)
    })
    return set
  }

  // 已配完的顆——組成分享卡的 beys（命中實戰組合標 meta＋真實數據，否則標自組）
  const shareBeys: BeyCombo[] = useMemo(() => {
    return slots
      .filter((s) => {
        const cx = cxBlades.has(s.blade)
        return s.blade && s.ratchet && s.bit && (!cx || s.assist)
      })
      .map((s) => {
        const cx = cxBlades.has(s.blade)
        const matched = !cx
          ? metaCombos.find(
              (c) =>
                bladeFamilyKey(c.blade) === bladeFamilyKey(s.blade) &&
                c.ratchet === s.ratchet &&
                c.bit === s.bit,
            )
          : undefined
        return {
          blade: s.blade,
          ratchet: s.ratchet,
          bit: s.bit,
          ...(s.assist ? { assist: s.assist } : {}),
          score: 0,
          source: matched ? 'meta' : 'custom',
          ...(matched ? { meta: matched } : {}),
        } satisfies BeyCombo
      })
  }, [slots, cxBlades])

  const completeCount = shareBeys.length

  const handleShare = async () => {
    setShareState('busy')
    try {
      const deck: DeckResult = { beys: shareBeys, totalScore: 0, incomplete: shareBeys.length < 3, alternates: [] }
      const blob = await renderDeckCard(deck, { subtitle: '我的自組隊伍｜Beyblade X 3on3' })
      await shareOrDownloadPng(blob, `beybuilder-build-${dateStamp()}.png`, '我的 Beyblade X 自組隊伍')
      setShareState('idle')
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        setShareState('idle')
        return
      }
      setShareState('error')
    }
  }

  if (!hasParts) {
    return (
      <section className="page" aria-labelledby="build-title">
        <h2 className="page-title" id="build-title">
          自組隊伍
        </h2>
        <div className="empty-state">
          <h3>先登錄你的零件庫</h3>
          <p>自組隊伍只能用你擁有的零件。先到零件庫勾選產品，再回來手動配三顆。</p>
          <button type="button" className="btn btn-primary" onClick={onGoInventory}>
            前往登錄庫存
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="page" aria-labelledby="build-title">
      <header className="build-hero">
        <div>
          <h2 className="page-title" id="build-title">
            自組隊伍
          </h2>
          <p className="page-desc">
            從你的庫存自由配三顆，同一隊伍內戰刃／固鎖／軸心／輔助刃不得重複（重塗變體算同一顆）。
          </p>
        </div>
        <div className="build-actions">
          <span className="build-count">已配 {completeCount}/3 顆</span>
          <button
            type="button"
            className="btn-share"
            onClick={handleShare}
            disabled={shareState === 'busy' || completeCount === 0}
          >
            {shareState === 'busy' ? '產生中…' : '分享圖'}
          </button>
          {shareState === 'error' && <span className="share-error">圖片產生失敗</span>}
          <button type="button" className="btn btn-ghost-danger" onClick={reset}>
            全部清空
          </button>
        </div>
      </header>

      <div className="build-grid">
        {slots.map((slot, i) => (
          <SlotCard
            key={i}
            slot={slot}
            index={i}
            isCx={cxBlades.has(slot.blade)}
            bladeOpts={bladeOpts}
            ratchetOpts={ratchetOpts}
            bitOpts={bitOpts}
            assistOpts={assistOpts}
            usedBladeFamilies={usedElsewhere(i, 'blade', true)}
            usedRatchets={usedElsewhere(i, 'ratchet')}
            usedBits={usedElsewhere(i, 'bit')}
            usedAssists={usedElsewhere(i, 'assist')}
            onSet={setSlotPart}
            onClear={clearSlot}
          />
        ))}
      </div>

      <p className="score-note">
        自組不受「只用已知組合」限制——你想怎麼配都行；若配出的組合剛好有實戰紀錄，會顯示真實勝場／奪冠率供參考。
      </p>
    </section>
  )
}

interface SlotCardProps {
  slot: CustomSlot
  index: number
  isCx: boolean
  bladeOpts: Option[]
  ratchetOpts: Option[]
  bitOpts: Option[]
  assistOpts: Option[]
  usedBladeFamilies: Set<string>
  usedRatchets: Set<string>
  usedBits: Set<string>
  usedAssists: Set<string>
  onSet: (index: number, field: SlotField, value: string) => void
  onClear: (index: number) => void
}

function SlotCard({
  slot,
  index,
  isCx,
  bladeOpts,
  ratchetOpts,
  bitOpts,
  assistOpts,
  usedBladeFamilies,
  usedRatchets,
  usedBits,
  usedAssists,
  onSet,
  onClear,
}: SlotCardProps) {
  const blade = bladeByName.get(slot.blade)
  const ratchet = ratchetById.get(slot.ratchet)
  const bit = bitById.get(slot.bit)

  const complete = slot.blade && slot.ratchet && slot.bit && (!isCx || slot.assist)
  const matched =
    complete && !isCx
      ? metaCombos.find(
          (c) =>
            bladeFamilyKey(c.blade) === bladeFamilyKey(slot.blade) &&
            c.ratchet === slot.ratchet &&
            c.bit === slot.bit,
        )
      : undefined

  const filled = [slot.blade, slot.ratchet, slot.bit, isCx ? slot.assist : 'x'].filter(Boolean).length

  return (
    <article className="slot-card" data-complete={!!complete}>
      <header className="slot-head">
        <span className="slot-no">{String(index + 1).padStart(2, '0')}</span>
        <div className="slot-preview">
          {blade?.img ? (
            <img className="slot-img" src={imgUrl(blade.img)} alt="" width="72" height="72" loading="lazy" />
          ) : (
            <span className="slot-img-empty" aria-hidden="true">
              ?
            </span>
          )}
          <span className="slot-title">
            {slot.blade || '（尚未選戰刃）'}
            {slot.ratchet || slot.bit ? (
              <span className="slot-combo">
                {' '}
                {slot.ratchet}
                {slot.bit}
                {isCx && slot.assist ? `（輔助${slot.assist}）` : ''}
              </span>
            ) : null}
          </span>
        </div>
        {filled > 0 && (
          <button type="button" className="slot-clear" onClick={() => onClear(index)} aria-label="清空此顆">
            ✕
          </button>
        )}
      </header>

      <div className="slot-fields">
        <PartSelect
          label="戰刃"
          value={slot.blade}
          badge={blade?.tier}
          badgeInherited={blade?.tierInherited}
          options={bladeOpts}
          disabledKey={(o) => (o.value === slot.blade ? false : usedBladeFamilies.has(bladeFamilyKey(o.value)))}
          onChange={(v) => onSet(index, 'blade', v)}
        />
        {isCx && (
          <PartSelect
            label="輔助刃"
            value={slot.assist}
            options={assistOpts}
            disabledKey={(o) => o.value !== slot.assist && usedAssists.has(o.value)}
            onChange={(v) => onSet(index, 'assist', v)}
          />
        )}
        <PartSelect
          label="固鎖"
          value={slot.ratchet}
          badge={ratchet?.tier}
          options={ratchetOpts}
          disabledKey={(o) => o.value !== slot.ratchet && usedRatchets.has(o.value)}
          onChange={(v) => onSet(index, 'ratchet', v)}
        />
        <PartSelect
          label="軸心"
          value={slot.bit}
          badge={bit?.tier}
          options={bitOpts}
          disabledKey={(o) => o.value !== slot.bit && usedBits.has(o.value)}
          onChange={(v) => onSet(index, 'bit', v)}
        />
      </div>

      <footer className="slot-status">
        {!complete ? (
          <span className="status-pending">尚未配完</span>
        ) : matched ? (
          <span className="status-meta">
            實戰組合｜勝場 <strong>{matched.wins}</strong>｜奪冠率{' '}
            <strong>{(matched.champRate * 100).toFixed(0)}%</strong>
          </span>
        ) : (
          <span className="status-custom">自組組合</span>
        )}
      </footer>
    </article>
  )
}

interface PartSelectProps {
  label: string
  value: string
  badge?: string
  badgeInherited?: boolean
  options: Option[]
  disabledKey: (o: Option) => boolean
  onChange: (value: string) => void
}

function PartSelect({ label, value, badge, badgeInherited, options, disabledKey, onChange }: PartSelectProps) {
  return (
    <label className="part-select">
      <span className="part-select-label">{label}</span>
      <span className="part-select-control">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— 選擇 —</option>
          {options.map((o) => {
            const disabled = disabledKey(o)
            return (
              <option key={o.value} value={o.value} disabled={disabled}>
                {o.label}
                {o.tier ? `（${o.tier}）` : ''}
                {disabled ? ' ·已用於其他顆' : ''}
              </option>
            )
          })}
        </select>
        {value && badge ? <TierBadge tier={badge} inherited={badgeInherited} /> : null}
      </span>
    </label>
  )
}
