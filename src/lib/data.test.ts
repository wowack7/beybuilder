import { describe, expect, test } from 'vitest'
import { canonicalProductId, productModel, products } from './data'

/**
 * 出貨資料的健全性：來源表的聯名/變體會共用型號（如 BX-00-03 同時是
 * 紅浩克與美國隊長），id 重複曾讓「只看已擁有」多出沒擁有的產品。
 */
describe('products dataset', () => {
  test('product ids are unique after load', () => {
    const ids = products.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('every legacy bare-model key migrates to an existing product', () => {
    const idSet = new Set(products.map((p) => p.id))
    for (const p of products) {
      expect(idSet.has(canonicalProductId(productModel(p.id)))).toBe(true)
    }
  })
})
