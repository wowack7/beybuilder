import { describe, expect, test } from 'vitest'
import { bladeFamilyKey } from './family'

describe('bladeFamilyKey', () => {
  test('strips pure color parenthetical suffixes', () => {
    expect(bladeFamilyKey('魔導神杖(綠)')).toBe('魔導神杖')
    expect(bladeFamilyKey('鳳凰飛翼(藍)')).toBe('鳳凰飛翼')
    expect(bladeFamilyKey('鮫鯊鋒鰭(紫)')).toBe('鮫鯊鋒鰭')
    expect(bladeFamilyKey('極狐九尾(黑)')).toBe('極狐九尾')
    expect(bladeFamilyKey('騎士重盾(青)')).toBe('騎士重盾')
  })

  test('strips edition/prize tail words', () => {
    expect(bladeFamilyKey('英仙幽冥 特別版')).toBe('英仙幽冥')
    expect(bladeFamilyKey('蒼龍勇氣 特別版')).toBe('蒼龍勇氣')
    expect(bladeFamilyKey('蒼穹龍神 透明版')).toBe('蒼穹龍神')
  })

  test('strips stacked variants iteratively', () => {
    expect(bladeFamilyKey('蒼龍勇氣(紅) 特別版')).toBe('蒼龍勇氣')
  })

  test('keeps spin-direction markers — left and right are different blades', () => {
    expect(bladeFamilyKey('蒼穹龍騎士(左)')).toBe('蒼穹龍騎士(左)')
    expect(bladeFamilyKey('隕星龍騎士(左)')).toBe('隕星龍騎士(左)')
    expect(bladeFamilyKey('蒼穹龍騎士(左)')).not.toBe(bladeFamilyKey('蒼穹龍騎士'))
  })

  test('keeps functional type markers conservatively', () => {
    expect(bladeFamilyKey('飛龍刀刃(上升攻擊型)')).toBe('飛龍刀刃(上升攻擊型)')
    expect(bladeFamilyKey('飛龍刀刃(連擊型)')).toBe('飛龍刀刃(連擊型)')
  })

  test('leaves plain names untouched', () => {
    expect(bladeFamilyKey('魔導神杖')).toBe('魔導神杖')
    expect(bladeFamilyKey('A賞飛龍')).toBe('A賞飛龍')
  })
})
