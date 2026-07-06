import { describe, expect, test } from 'vitest'
import type { Product } from '../types'
import { decodeImportHash, parsePhInventory } from './importPh'
import type { PhMap } from './transform'

const mkProduct = (id: string, name: string, ratchet: string, bit: string, assist = ''): Product => ({
  id,
  name,
  type: 'attack',
  tier: 'A',
  buy: '',
  ratchet,
  ratchetTier: 'A',
  bit,
  bitTier: 'A',
  assist,
  source: '',
  img: '',
})

const products = [
  mkProduct('BX-01', '劍', '3-60', 'F'),
  mkProduct('CX-01', '蒼龍勇氣', '6-60', 'V', 'S'),
]

const map: PhMap = {
  sets: { 'PRD-111111-00': 'BX-01', 'PRD-222222-00': 'CX-01' },
  blades: { 'PRD-111111-00': '劍', 'PRD-222222-00': '蒼龍勇氣' },
  ratchets: { 'PRD-111111-00': '3-60', 'PRD-333333-00': '9-60' },
  bits: { 'PRD-111111-00': 'F', 'PRD-444444-00': 'W' },
  assists: { 'PRD-222222-00': 'S' },
}

const raw = (ids: string[]) => JSON.stringify({ parts: ids.map((partId) => ({ partId })) })

describe('parsePhInventory', () => {
  test('complete BL+RC+BT set becomes an owned product, parts not double-counted', () => {
    const r = parsePhInventory(raw(['BL-PRD-111111-00', 'RC-PRD-111111-00', 'BT-PRD-111111-00']), map, products)
    expect(r.additions.productIds).toEqual(['BX-01'])
    expect(r.additions.extraRatchets).toEqual([])
    expect(r.additions.extraBits).toEqual([])
    expect(r.unmatched).toEqual([])
  })

  test('partial set stays as loose parts, never upgrades to a product', () => {
    const r = parsePhInventory(raw(['RC-PRD-333333-00', 'BT-PRD-444444-00']), map, products)
    expect(r.additions.productIds).toEqual([])
    expect(r.additions.extraRatchets).toEqual(['9-60'])
    expect(r.additions.extraBits).toEqual(['W'])
  })

  test('CX MB+LC pair resolves to the assembled blade', () => {
    const r = parsePhInventory(raw(['MB-PRD-222222-00', 'LC-PRD-222222-00']), map, products)
    expect(r.additions.extraBlades).toEqual(['蒼龍勇氣'])
  })

  test('lone CX component and unknown ids are reported unmatched', () => {
    const r = parsePhInventory(raw(['MB-PRD-999999-00', 'RC-PRD-999999-00']), map, products)
    expect(r.additions.productIds).toEqual([])
    expect(r.unmatched.map((u) => u.partId).sort()).toEqual(['MB-PRD-999999-00', 'RC-PRD-999999-00'])
  })

  test('invalid payloads throw a readable error', () => {
    expect(() => parsePhInventory('not json', map, products)).toThrow('JSON')
    expect(() => parsePhInventory('{"foo":1}', map, products)).toThrow('格式不符')
  })
})

describe('decodeImportHash', () => {
  test('roundtrips UTF-8 payloads and rejects other hashes', () => {
    const json = '{"parts":[{"partId":"BL-PRD-111111-00"}],"註":"中文"}'
    const hash = '#phimport=' + encodeURIComponent(btoa(unescape(encodeURIComponent(json))))
    expect(decodeImportHash(hash)).toBe(json)
    expect(decodeImportHash('#other')).toBeNull()
  })
})
