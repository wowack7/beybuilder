import { useCallback, useEffect, useState } from 'react'

/**
 * 自組隊伍的一個槽位；空字串代表尚未選。
 * CX 五層可拆混：lockChip（紋章）與 mainBlade（主刃）獨立選；blade 為兩者對得到的
 * 具名整刃（對不到就留空，屬自訂混搭）。非 CX 只用 blade。
 */
export interface CustomSlot {
  blade: string
  lockChip: string
  mainBlade: string
  ratchet: string
  bit: string
  assist: string
}

export type SlotField = keyof CustomSlot

const STORAGE_KEY = 'beybuilder.customdeck.v1'
const emptySlot = (): CustomSlot => ({
  blade: '',
  lockChip: '',
  mainBlade: '',
  ratchet: '',
  bit: '',
  assist: '',
})
const emptyDeck = (): CustomSlot[] => [emptySlot(), emptySlot(), emptySlot()]

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function load(): CustomSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDeck()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 3) return emptyDeck()
    return parsed.map((s) => {
      const o = s as Partial<CustomSlot>
      return {
        blade: str(o?.blade),
        lockChip: str(o?.lockChip),
        mainBlade: str(o?.mainBlade),
        ratchet: str(o?.ratchet),
        bit: str(o?.bit),
        assist: str(o?.assist),
      }
    })
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

  /** 合併更新某槽位的多個欄位（CX 衍生邏輯在 BuildPage 算好後一次套用） */
  const patchSlot = useCallback((index: number, partial: Partial<CustomSlot>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...partial } : s)))
  }, [])

  const clearSlot = useCallback((index: number) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? emptySlot() : s)))
  }, [])

  return { slots, patchSlot, clearSlot }
}
