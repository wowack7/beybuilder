import { useCallback, useEffect, useState } from 'react'

/** 自組隊伍的一個槽位；空字串代表尚未選 */
export interface CustomSlot {
  blade: string
  ratchet: string
  bit: string
  assist: string
}

export type SlotField = keyof CustomSlot

const STORAGE_KEY = 'beybuilder.customdeck.v1'
const emptySlot = (): CustomSlot => ({ blade: '', ratchet: '', bit: '', assist: '' })
const emptyDeck = (): CustomSlot[] => [emptySlot(), emptySlot(), emptySlot()]

function load(): CustomSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDeck()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 3) return emptyDeck()
    return parsed.map((s) => ({
      blade: typeof (s as CustomSlot)?.blade === 'string' ? (s as CustomSlot).blade : '',
      ratchet: typeof (s as CustomSlot)?.ratchet === 'string' ? (s as CustomSlot).ratchet : '',
      bit: typeof (s as CustomSlot)?.bit === 'string' ? (s as CustomSlot).bit : '',
      assist: typeof (s as CustomSlot)?.assist === 'string' ? (s as CustomSlot).assist : '',
    }))
  } catch {
    return emptyDeck()
  }
}

export function useCustomDeck() {
  const [slots, setSlots] = useState<CustomSlot[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
    } catch {
      // 隱私模式等寫入失敗時僅保留記憶體狀態
    }
  }, [slots])

  /** 更新某槽位的某零件；選了新戰刃時清掉舊輔助刃（避免殘留不相容的 CX 輔助刃） */
  const setSlotPart = useCallback((index: number, field: SlotField, value: string) => {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s
        if (field === 'blade' && value !== s.blade) return { ...s, blade: value, assist: '' }
        return { ...s, [field]: value }
      }),
    )
  }, [])

  const clearSlot = useCallback((index: number) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? emptySlot() : s)))
  }, [])

  const reset = useCallback(() => setSlots(emptyDeck()), [])

  return { slots, setSlotPart, clearSlot, reset }
}
