import { describe, expect, test } from 'vitest'
import type { Blade, Inventory, MetaCombo, PartsDb, Product, SimplePart } from '../types'
import { buildCandidates, pickBestDeck, recommendDeck, resolveOwnedParts } from './recommend'

const mkBlade = (name: string, tier = 'A'): Blade => ({
  name,
  type: 'attack',
  tier,
  tierInherited: false,
  img: '',
  productIds: [],
})
const mkPart = (id: string, tier = 'A'): SimplePart => ({ id, tier, img: '' })
const mkProduct = (id: string, name: string, ratchet: string, bit: string): Product => ({
  id,
  name,
  type: 'attack',
  tier: 'A',
  buy: '',
  ratchet,
  ratchetTier: 'A',
  bit,
  bitTier: 'A',
  assist: '',
  source: '',
  img: '',
})
const mkMeta = (blade: string, ratchet: string, bit: string, score: number): MetaCombo => ({
  rank: 0,
  blade,
  bladeId: blade,
  ratchet,
  bit,
  score,
  wins: 10,
  champRate: 0.2,
  recent90: 1,
})

const db: PartsDb = {
  blades: ['劍', '盾', '杖', '鳳'].map((n) => mkBlade(n)),
  ratchets: ['3-60', '4-60', '9-60', '1-60'].map((r) => mkPart(r)),
  bits: ['F', 'B', 'P', 'R'].map((b) => mkPart(b)),
  assists: ['S', 'B', 'J'].map((a) => mkPart(a)),
}
const products: Product[] = [
  mkProduct('BX-01', '劍', '3-60', 'F'),
  mkProduct('BX-02', '盾', '4-60', 'B'),
  mkProduct('BX-03', '杖', '9-60', 'P'),
  mkProduct('BX-04', '鳳', '1-60', 'R'),
]

describe('resolveOwnedParts', () => {
  test('derives parts from owned products', () => {
    const inv: Inventory = { productIds: ['BX-01'], extraBlades: [], extraRatchets: [], extraBits: [] }
    const owned = resolveOwnedParts(inv, products, db)
    expect(owned.blades.map((b) => b.name)).toEqual(['劍'])
    expect(owned.ratchets.map((r) => r.id)).toEqual(['3-60'])
    expect(owned.bits.map((b) => b.id)).toEqual(['F'])
  })

  test('unions extra standalone parts without duplicates', () => {
    const inv: Inventory = {
      productIds: ['BX-01'],
      extraBlades: ['劍', '盾'],
      extraRatchets: ['3-60', '9-60'],
      extraBits: ['P'],
    }
    const owned = resolveOwnedParts(inv, products, db)
    expect(owned.blades.map((b) => b.name).sort()).toEqual(['劍', '盾'])
    expect(owned.ratchets.map((r) => r.id).sort()).toEqual(['3-60', '9-60'])
    expect(owned.bits.map((b) => b.id).sort()).toEqual(['F', 'P'])
  })
})

describe('buildCandidates', () => {
  const owned = resolveOwnedParts(
    { productIds: ['BX-01', 'BX-02'], extraBlades: [], extraRatchets: [], extraBits: [] },
    products,
    db,
  )

  test('includes fully-owned meta combos and marks source', () => {
    const metas = [mkMeta('劍', '4-60', 'B', 500), mkMeta('杖', '9-60', 'B', 900)]
    const cands = buildCandidates(owned, metas)
    const metaCands = cands.filter((c) => c.source === 'meta')
    expect(metaCands).toHaveLength(1) // 杖未擁有 → 排除
    expect(metaCands[0]).toMatchObject({ blade: '劍', ratchet: '4-60', bit: 'B' })
  })

  test('returns NO candidates without meta or site data — parts are never freely recombined', () => {
    expect(buildCandidates(owned, [])).toHaveLength(0)
  })

  test('meta combo scores higher than the identical site recommendation', () => {
    const metaVersion = buildCandidates(owned, [mkMeta('劍', '4-60', 'B', 500)])[0]
    const siteVersion = buildCandidates(owned, [], [{ blade: '劍', ratchet: '4-60', bit: 'B' }])[0]
    expect(metaVersion.score).toBeGreaterThan(siteVersion.score)
  })
})

describe('site-recommended combos（站方建議配置）', () => {
  const owned = resolveOwnedParts(
    { productIds: ['BX-01', 'BX-02'], extraBlades: [], extraRatchets: [], extraBits: [] },
    products,
    db,
  )

  test('fully-owned site recommendation becomes a candidate with source site', () => {
    const cands = buildCandidates(owned, [], [{ blade: '劍', ratchet: '4-60', bit: 'B' }])
    expect(cands).toHaveLength(1)
    expect(cands[0]).toMatchObject({ blade: '劍', ratchet: '4-60', bit: 'B', source: 'site' })
  })

  test('site recommendation with unowned part is excluded', () => {
    const cands = buildCandidates(owned, [], [{ blade: '劍', ratchet: '9-60', bit: 'B' }])
    expect(cands).toHaveLength(0) // 未擁有 9-60
  })

  test('duplicate combo across sources keeps the meta version', () => {
    const cands = buildCandidates(
      owned,
      [mkMeta('劍', '4-60', 'B', 500)],
      [{ blade: '劍', ratchet: '4-60', bit: 'B' }],
    )
    expect(cands).toHaveLength(1)
    expect(cands[0].source).toBe('meta')
  })

  test('site recommendation matches owned recolor variant via family key', () => {
    const variantOwned = resolveOwnedParts(
      { productIds: [], extraBlades: ['劍'], extraRatchets: ['4-60'], extraBits: ['B'] },
      products,
      db,
    )
    const cands = buildCandidates(variantOwned, [], [{ blade: '劍(綠)', ratchet: '4-60', bit: 'B' }])
    expect(cands).toHaveLength(1)
    expect(cands[0].blade).toBe('劍')
  })
})

describe('pickBestDeck', () => {
  const bey = (blade: string, ratchet: string, bit: string, score: number) => ({
    blade,
    ratchet,
    bit,
    score,
    source: 'meta' as const,
  })

  test('returns empty incomplete deck with no candidates', () => {
    const deck = pickBestDeck([])
    expect(deck.beys).toHaveLength(0)
    expect(deck.incomplete).toBe(true)
    expect(deck.totalScore).toBe(0)
  })

  test('finds globally optimal disjoint triple, not greedy-by-top-score', () => {
    // 貪婪法會先拿 100 分的 T，導致其餘全衝突只剩 1 顆；最佳解是跳過 T 拿 90+89+88。
    const T = bey('bl1', 'r1', 'b1', 100)
    const U = bey('bl1', 'r2', 'b2', 90)
    const V = bey('bl2', 'r1', 'b3', 89)
    const W = bey('bl3', 'r4', 'b1', 88)
    const deck = pickBestDeck([T, U, V, W])
    expect(deck.beys).toHaveLength(3)
    expect(deck.totalScore).toBeCloseTo(267)
    expect(deck.beys.map((b) => b.score).sort()).toEqual([88, 89, 90])
  })

  test('never repeats a blade, ratchet, or bit within the deck', () => {
    const cands = [
      bey('bl1', 'r1', 'b1', 100),
      bey('bl1', 'r2', 'b2', 99),
      bey('bl2', 'r1', 'b2', 98),
      bey('bl2', 'r2', 'b1', 97),
      bey('bl3', 'r3', 'b3', 1),
    ]
    const deck = pickBestDeck(cands)
    const blades = deck.beys.map((b) => b.blade)
    const ratchets = deck.beys.map((b) => b.ratchet)
    const bits = deck.beys.map((b) => b.bit)
    expect(new Set(blades).size).toBe(blades.length)
    expect(new Set(ratchets).size).toBe(ratchets.length)
    expect(new Set(bits).size).toBe(bits.length)
  })

  test('returns best pair marked incomplete when only two disjoint combos exist', () => {
    const cands = [bey('bl1', 'r1', 'b1', 80), bey('bl2', 'r2', 'b2', 70), bey('bl1', 'r2', 'b1', 60)]
    const deck = pickBestDeck(cands)
    expect(deck.beys).toHaveLength(2)
    expect(deck.incomplete).toBe(true)
    expect(deck.totalScore).toBeCloseTo(150)
  })

  test('lists alternates excluding deck members', () => {
    const cands = [
      bey('bl1', 'r1', 'b1', 100),
      bey('bl2', 'r2', 'b2', 90),
      bey('bl3', 'r3', 'b3', 80),
      bey('bl1', 'r2', 'b3', 70),
    ]
    const deck = pickBestDeck(cands)
    expect(deck.beys).toHaveLength(3)
    expect(deck.alternates.map((a) => a.score)).toEqual([70])
  })
})

describe('only complete known combos are candidates（不做零件自由重組）', () => {
  const owned = resolveOwnedParts(
    { productIds: ['BX-01', 'BX-02', 'BX-03'], extraBlades: [], extraRatchets: [], extraBits: [] },
    products,
    db,
  )

  test('candidates are exactly the owned known combos, nothing invented', () => {
    const metas = [mkMeta('劍', '3-60', 'F', 100)]
    const sites = [{ blade: '盾', ratchet: '9-60', bit: 'P' }]
    const cands = buildCandidates(owned, metas, sites)
    const keys = cands.map((c) => `${c.blade}|${c.ratchet}|${c.bit}`).sort()
    expect(keys).toEqual(['劍|3-60|F', '盾|9-60|P'])
  })
})

describe('variant family equivalence', () => {
  const ownedVariant = resolveOwnedParts(
    {
      productIds: [],
      extraBlades: ['魔導神杖(綠)', '蒼穹龍騎士(左)'],
      extraRatchets: ['1-60', '3-60'],
      extraBits: ['H', 'R'],
    },
    [],
    {
      blades: [mkBlade('魔導神杖(綠)', 'X'), mkBlade('蒼穹龍騎士(左)', 'S+')],
      ratchets: [mkPart('1-60', 'X'), mkPart('3-60', 'S')],
      bits: [mkPart('H', 'X'), mkPart('R', 'X')],
      assists: [],
    },
  )

  test('recolor variant unlocks the original blade meta combo, displayed with owned name', () => {
    const metas = [mkMeta('魔導神杖', '1-60', 'H', 1433)]
    const cands = buildCandidates(ownedVariant, metas)
    const metaCand = cands.find((c) => c.source === 'meta')
    expect(metaCand).toBeDefined()
    expect(metaCand?.blade).toBe('魔導神杖(綠)')
    expect(metaCand?.meta?.wins).toBe(10)
  })

  test('spin-direction variant does NOT unlock the right-spin combo', () => {
    const metas = [mkMeta('蒼穹龍騎士', '3-60', 'R', 900)]
    const cands = buildCandidates(ownedVariant, metas)
    expect(cands.filter((c) => c.source === 'meta')).toHaveLength(0)
  })

  test('deck never fields two variants of the same family', () => {
    const bey = (blade: string, ratchet: string, bit: string, score: number) => ({
      blade,
      ratchet,
      bit,
      score,
      source: 'site' as const,
    })
    const deck = pickBestDeck([
      bey('魔導神杖', 'r1', 'b1', 100),
      bey('魔導神杖(綠)', 'r2', 'b2', 99),
      bey('別的', 'r3', 'b3', 10),
    ])
    const fams = deck.beys.map((b) => b.blade.replace(/[（(]綠[)）]/, ''))
    expect(new Set(fams).size).toBe(fams.length)
    expect(deck.beys).toHaveLength(2)
  })
})

describe('CX 五層（輔助刃/鎖片/主刃）', () => {
  const mkCxProduct = (
    id: string,
    name: string,
    ratchet: string,
    bit: string,
    assist: string,
    lockChip: string,
    mainBlade: string,
  ): Product => ({ ...mkProduct(id, name, ratchet, bit), assist, lockChip, mainBlade })

  const cxProducts = [
    mkCxProduct('CX-01', '蒼龍勇氣', '3-60', 'F', 'S', '蒼龍', '勇氣'),
    mkCxProduct('CX-99', '龍神勇氣', '4-60', 'B', 'G', '龍神', '勇氣'),
  ]
  const cxDb: PartsDb = {
    blades: [mkBlade('蒼龍勇氣'), mkBlade('龍神勇氣')],
    ratchets: [mkPart('3-60'), mkPart('4-60')],
    bits: [mkPart('F'), mkPart('B')],
    assists: [mkPart('S'), mkPart('G'), mkPart('B')],
  }
  const inv: Inventory = {
    productIds: ['CX-01', 'CX-99'],
    extraBlades: [],
    extraRatchets: [],
    extraBits: [],
  }

  test('owned products derive assists; stock assist and cx names attach to candidates', () => {
    const owned = resolveOwnedParts(inv, cxProducts, cxDb)
    expect(owned.assists.map((a) => a.id).sort()).toEqual(['G', 'S'])
    const cands = buildCandidates(owned, [mkMeta('蒼龍勇氣', '3-60', 'F', 100)])
    expect(cands[0]).toMatchObject({ assist: 'S', lockChip: '蒼龍', mainBlade: '勇氣' })
  })

  test('site combo requiring unowned assist is excluded; owned assist is used', () => {
    const owned = resolveOwnedParts(inv, cxProducts, cxDb)
    const noAssist = buildCandidates(owned, [], [{ blade: '蒼龍勇氣', ratchet: '3-60', bit: 'F', assist: 'W' }])
    expect(noAssist).toHaveLength(0)
    const withAssist = buildCandidates(owned, [], [{ blade: '蒼龍勇氣', ratchet: '3-60', bit: 'F', assist: 'G' }])
    expect(withAssist[0]).toMatchObject({ assist: 'G', source: 'site' })
  })

  test('deck never fields duplicate assist, lock chip, or main blade', () => {
    const bey = (blade: string, over: Partial<import('../types').BeyCombo>, score: number) => ({
      blade,
      ratchet: `r${score}`,
      bit: `b${score}`,
      score,
      source: 'site' as const,
      ...over,
    })
    // 兩顆不同 CX 刃共用主刃「勇氣」→ 不得同場
    const deck = pickBestDeck([
      bey('蒼龍勇氣', { mainBlade: '勇氣', lockChip: '蒼龍', assist: 'S' }, 100),
      bey('龍神勇氣', { mainBlade: '勇氣', lockChip: '龍神', assist: 'G' }, 99),
      bey('別的', {}, 10),
    ])
    expect(deck.beys).toHaveLength(2)
    expect(deck.beys.map((b) => b.blade)).toEqual(['蒼龍勇氣', '別的'])
    // 重複輔助刃 → 不得同場
    const deck2 = pickBestDeck([
      bey('甲', { assist: 'S' }, 100),
      bey('乙', { assist: 'S' }, 99),
      bey('丙', { assist: 'B' }, 10),
    ])
    expect(deck2.beys.map((b) => b.blade)).toEqual(['甲', '丙'])
  })
})

describe('recommendDeck (integration)', () => {
  test('empty inventory yields empty incomplete deck', () => {
    const inv: Inventory = { productIds: [], extraBlades: [], extraRatchets: [], extraBits: [] }
    const deck = recommendDeck(inv, products, db, [])
    expect(deck.beys).toHaveLength(0)
    expect(deck.incomplete).toBe(true)
  })

  test('full inventory yields a complete 3-bey deck with disjoint parts', () => {
    const inv: Inventory = {
      productIds: products.map((p) => p.id),
      extraBlades: [],
      extraRatchets: [],
      extraBits: [],
    }
    const metas = [mkMeta('劍', '4-60', 'B', 500), mkMeta('盾', '3-60', 'P', 400), mkMeta('杖', '9-60', 'F', 300)]
    const deck = recommendDeck(inv, products, db, metas)
    expect(deck.beys).toHaveLength(3)
    expect(deck.incomplete).toBe(false)
    const allParts = deck.beys.flatMap((b) => [b.blade, `r:${b.ratchet}`, `b:${b.bit}`])
    expect(new Set(allParts).size).toBe(allParts.length)
  })
})
