import { useCallback, useEffect, useState } from 'react'
import type { Inventory } from '../types'

const STORAGE_KEY = 'beybuilder.inventory.v1'

const EMPTY: Inventory = {
  productIds: [],
  extraBlades: [],
  extraRatchets: [],
  extraBits: [],
  extraAssists: [],
}

function load(): Inventory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<Inventory>
    return {
      productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
      extraBlades: Array.isArray(parsed.extraBlades) ? parsed.extraBlades : [],
      extraRatchets: Array.isArray(parsed.extraRatchets) ? parsed.extraRatchets : [],
      extraBits: Array.isArray(parsed.extraBits) ? parsed.extraBits : [],
      // 舊版存檔沒有此欄位，預設空陣列
      extraAssists: Array.isArray(parsed.extraAssists) ? parsed.extraAssists : [],
    }
  } catch {
    return EMPTY
  }
}

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

export type ExtraKind = 'extraBlades' | 'extraRatchets' | 'extraBits' | 'extraAssists'

export function useInventory() {
  const [inventory, setInventory] = useState<Inventory>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory))
    } catch {
      // 隱私模式等寫入失敗時僅保留記憶體狀態
    }
  }, [inventory])

  const toggleProduct = useCallback((id: string) => {
    setInventory((inv) => ({ ...inv, productIds: toggle(inv.productIds, id) }))
  }, [])

  const toggleExtra = useCallback((kind: ExtraKind, id: string) => {
    setInventory((inv) => ({ ...inv, [kind]: toggle(inv[kind] ?? [], id) }))
  }, [])

  const clearAll = useCallback(() => setInventory(EMPTY), [])

  /** 匯入合併（聯集，不清除既有庫存） */
  const mergeInventory = useCallback((add: Inventory) => {
    const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])].sort()
    setInventory((inv) => ({
      productIds: union(inv.productIds, add.productIds),
      extraBlades: union(inv.extraBlades, add.extraBlades),
      extraRatchets: union(inv.extraRatchets, add.extraRatchets),
      extraBits: union(inv.extraBits, add.extraBits),
      extraAssists: union(inv.extraAssists, add.extraAssists),
    }))
  }, [])

  return { inventory, toggleProduct, toggleExtra, clearAll, mergeInventory }
}
