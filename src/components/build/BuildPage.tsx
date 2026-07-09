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

interface UsedSets {
  bladeFamilies: Set<string>
  lockChips: Set<string>
  mainBlades: Set<string>
  ratchets: Set<string>
  bits: Set<string>
  assists: Set<string>
}

const byTierDesc = <T extends { tier: string }>(a: T, b: T) => tierValue(b.tier) - tierValue(a.tier)

/** 有選紋章或主刃即視為 CX 槽（五層可拆混） */
const isCxSlot = (s: CustomSlot) => !!(s.lockChip || s.mainBlade)

/** 具名整刃優先，否則以紋章＋主刃當顯示名 */
const displayName = (s: CustomSlot) => s.blade || `${s.lockChip}${s.mainBlade}`

const isComplete = (s: CustomSlot) =>
  isCxSlot(s)
    ? !!(s.lockChip && s.mainBlade && s.assist && s.ratchet && s.bit)
    : !!(s.blade && s.ratchet && s.bit)

export function BuildPage({ inventory, onGoInventory }: BuildPageProps) {
  const { slots, patchSlot, clearSlot } = useCustomDeck()
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'error'>('idle')
  const owned = useMemo(() => resolveOwnedParts(inventory, products, partsDb), [inventory])

  // blade → { 紋章, 主刃 }；(紋章|主刃) → 具名整刃
  const cxNamesByBlade = useMemo(
    () =>
      new Map(
        products
          .filter((p) => p.lockChip && p.mainBlade)
          .map((p) => [p.name, { lockChip: p.lockChip as string, mainBlade: p.mainBlade as string }]),
      ),
    [],
  )
  const bladeByCxParts = useMemo(() => {
    // (紋章|主刃) → 具名整刃；同組合有多個變體時優先取基底名（無顏色/特別版後綴）
    const map = new Map<string, string>()
    for (const p of products) {
      if (!p.lockChip || !p.mainBlade) continue
      const key = `${p.lockChip}|${p.mainBlade}`
      const existing = map.get(key)
      const isBase = bladeFamilyKey(p.name) === p.name
      if (!existing || (isBase && bladeFamilyKey(existing) !== existing)) map.set(key, p.name)
    }
    return map
  }, [])

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
  // 擁有的 CX 戰刃可拆出的紋章 / 主刃（去重）
  const lockChipOpts: Option[] = useMemo(() => {
    const set = new Set<string>()
    owned.blades.forEach((b) => {
      const cx = cxNamesByBlade.get(b.name)
      if (cx) set.add(cx.lockChip)
    })
    return [...set].sort().map((v) => ({ value: v, label: v, tier: '' }))
  }, [owned, cxNamesByBlade])
  const mainBladeOpts: Option[] = useMemo(() => {
    const set = new Set<string>()
    owned.blades.forEach((b) => {
      const cx = cxNamesByBlade.get(b.name)
      if (cx) set.add(cx.mainBlade)
    })
    return [...set].sort().map((v) => ({ value: v, label: v, tier: '' }))
  }, [owned, cxNamesByBlade])

  const hasParts = bladeOpts.length > 0 && ratchetOpts.length > 0 && bitOpts.length > 0

  // 選戰刃：CX 帶入紋章/主刃並清輔助刃；改紋章/主刃：重算對得到的具名整刃
  const handleSet = (index: number, field: SlotField, value: string) => {
    if (field === 'blade') {
      const cx = cxNamesByBlade.get(value)
      patchSlot(
        index,
        cx
          ? { blade: value, lockChip: cx.lockChip, mainBlade: cx.mainBlade, assist: '' }
          : { blade: value, lockChip: '', mainBlade: '', assist: '' },
      )
    } else if (field === 'lockChip' || field === 'mainBlade') {
      const s = slots[index]
      const lockChip = field === 'lockChip' ? value : s.lockChip
      const mainBlade = field === 'mainBlade' ? value : s.mainBlade
      patchSlot(index, { [field]: value, blade: bladeByCxParts.get(`${lockChip}|${mainBlade}`) ?? '' })
    } else {
      patchSlot(index, { [field]: value })
    }
  }

  // 其他槽位已用的實體零件（CX 以紋章/主刃/輔助刃計，非 CX 以戰刃家族計）
  const usedByOthers = (index: number): UsedSets => {
    const u: UsedSets = {
      bladeFamilies: new Set(),
      lockChips: new Set(),
      mainBlades: new Set(),
      ratchets: new Set(),
      bits: new Set(),
      assists: new Set(),
    }
    slots.forEach((s, i) => {
      if (i === index) return
      if (isCxSlot(s)) {
        if (s.lockChip) u.lockChips.add(s.lockChip)
        if (s.mainBlade) u.mainBlades.add(s.mainBlade)
        if (s.assist) u.assists.add(s.assist)
      } else if (s.blade) {
        u.bladeFamilies.add(bladeFamilyKey(s.blade))
      }
      if (s.ratchet) u.ratchets.add(s.ratchet)
      if (s.bit) u.bits.add(s.bit)
    })
    return u
  }

  const shareBeys: BeyCombo[] = useMemo(() => {
    return slots.filter(isComplete).map((s) => {
      const cx = isCxSlot(s)
      const name = displayName(s)
      const matched = !cx
        ? metaCombos.find(
            (c) =>
              bladeFamilyKey(c.blade) === bladeFamilyKey(name) && c.ratchet === s.ratchet && c.bit === s.bit,
          )
        : undefined
      return {
        blade: name,
        ratchet: s.ratchet,
        bit: s.bit,
        ...(s.assist ? { assist: s.assist } : {}),
        ...(cx ? { lockChip: s.lockChip, mainBlade: s.mainBlade } : {}),
        score: 0,
        source: matched ? 'meta' : 'custom',
        ...(matched ? { meta: matched } : {}),
      } satisfies BeyCombo
    })
  }, [slots])

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
            從你的庫存自由配三顆，同一隊伍內零件不得重複（重塗變體算同一顆；CX 的紋章、主刃、輔助刃可拆開混搭）。
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
            {shareState === 'busy' ? '產生中…' : '分享戰隊圖'}
          </button>
          {shareState === 'error' && <span className="share-error">圖片產生失敗</span>}
        </div>
      </header>

      <div className="build-grid">
        {slots.map((slot, i) => (
          <SlotCard
            key={i}
            slot={slot}
            index={i}
            cxNamesByBlade={cxNamesByBlade}
            bladeOpts={bladeOpts}
            lockChipOpts={lockChipOpts}
            mainBladeOpts={mainBladeOpts}
            ratchetOpts={ratchetOpts}
            bitOpts={bitOpts}
            assistOpts={assistOpts}
            used={usedByOthers(i)}
            onSet={handleSet}
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
  cxNamesByBlade: Map<string, { lockChip: string; mainBlade: string }>
  bladeOpts: Option[]
  lockChipOpts: Option[]
  mainBladeOpts: Option[]
  ratchetOpts: Option[]
  bitOpts: Option[]
  assistOpts: Option[]
  used: UsedSets
  onSet: (index: number, field: SlotField, value: string) => void
  onClear: (index: number) => void
}

function SlotCard({
  slot,
  index,
  cxNamesByBlade,
  bladeOpts,
  lockChipOpts,
  mainBladeOpts,
  ratchetOpts,
  bitOpts,
  assistOpts,
  used,
  onSet,
  onClear,
}: SlotCardProps) {
  const cx = isCxSlot(slot)
  const blade = bladeByName.get(slot.blade)
  const ratchet = ratchetById.get(slot.ratchet)
  const bit = bitById.get(slot.bit)
  const name = displayName(slot)
  const complete = isComplete(slot)

  const matched =
    complete && !cx
      ? metaCombos.find(
          (c) =>
            bladeFamilyKey(c.blade) === bladeFamilyKey(slot.blade) &&
            c.ratchet === slot.ratchet &&
            c.bit === slot.bit,
        )
      : undefined

  const filled = !!(slot.blade || slot.lockChip || slot.mainBlade || slot.ratchet || slot.bit || slot.assist)

  return (
    <article className="slot-card" data-complete={complete}>
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
            {name || '（尚未選戰刃）'}
            {slot.ratchet || slot.bit ? (
              <span className="slot-combo">
                {' '}
                {slot.ratchet}
                {slot.bit}
                {cx && slot.assist ? `（輔助${slot.assist}）` : ''}
              </span>
            ) : null}
          </span>
        </div>
        {filled && (
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
          disabledKey={(o) => {
            if (o.value === slot.blade) return false
            const info = cxNamesByBlade.get(o.value)
            return info
              ? used.lockChips.has(info.lockChip) || used.mainBlades.has(info.mainBlade)
              : used.bladeFamilies.has(bladeFamilyKey(o.value))
          }}
          onChange={(v) => onSet(index, 'blade', v)}
        />
        {cx && (
          <>
            <PartSelect
              label="紋章"
              value={slot.lockChip}
              options={lockChipOpts}
              disabledKey={(o) => o.value !== slot.lockChip && used.lockChips.has(o.value)}
              onChange={(v) => onSet(index, 'lockChip', v)}
            />
            <PartSelect
              label="主刃"
              value={slot.mainBlade}
              options={mainBladeOpts}
              disabledKey={(o) => o.value !== slot.mainBlade && used.mainBlades.has(o.value)}
              onChange={(v) => onSet(index, 'mainBlade', v)}
            />
            <PartSelect
              label="輔助刃"
              value={slot.assist}
              options={assistOpts}
              disabledKey={(o) => o.value !== slot.assist && used.assists.has(o.value)}
              onChange={(v) => onSet(index, 'assist', v)}
            />
          </>
        )}
        <PartSelect
          label="固鎖"
          value={slot.ratchet}
          badge={ratchet?.tier}
          options={ratchetOpts}
          disabledKey={(o) => o.value !== slot.ratchet && used.ratchets.has(o.value)}
          onChange={(v) => onSet(index, 'ratchet', v)}
        />
        <PartSelect
          label="軸心"
          value={slot.bit}
          badge={bit?.tier}
          options={bitOpts}
          disabledKey={(o) => o.value !== slot.bit && used.bits.has(o.value)}
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
