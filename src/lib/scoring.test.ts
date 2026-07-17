import { describe, expect, test } from 'vitest'
import {
  FINISH_POINTS,
  WIN_POINTS,
  awardFinish,
  freshMatch,
  isMatchOver,
  renameSide,
  resetMatch,
  scoreOf,
  undoLast,
  winner,
} from './scoring'

describe('finish 分值（官方 Beyblade X Regulation）', () => {
  test('Spin=1 / Burst=2 / Over=2 / Xtreme=3、先到 4 分勝', () => {
    expect(FINISH_POINTS.spin).toBe(1)
    expect(FINISH_POINTS.burst).toBe(2)
    expect(FINISH_POINTS.over).toBe(2)
    expect(FINISH_POINTS.xtreme).toBe(3)
    expect(WIN_POINTS).toBe(4)
  })
})

describe('awardFinish / scoreOf', () => {
  test('累加該方分數並寫入 log', () => {
    let m = freshMatch()
    m = awardFinish(m, 'a', 'over') // 2
    m = awardFinish(m, 'a', 'spin') // +1 = 3
    m = awardFinish(m, 'b', 'burst') // b 2
    expect(scoreOf(m, 'a')).toBe(3)
    expect(scoreOf(m, 'b')).toBe(2)
    expect(m.log).toHaveLength(3)
    expect(m.log[2]).toMatchObject({ side: 'b', finish: 'burst', points: 2 })
  })

  test('不變動傳入的 state（immutable）', () => {
    const m = freshMatch()
    const snapshot = JSON.parse(JSON.stringify(m))
    awardFinish(m, 'a', 'spin')
    expect(m).toEqual(snapshot)
  })
})

describe('勝利判定', () => {
  test('達 4 分即為勝方', () => {
    let m = freshMatch()
    m = awardFinish(m, 'a', 'over') // 2
    m = awardFinish(m, 'a', 'over') // 4
    expect(scoreOf(m, 'a')).toBe(4)
    expect(winner(m)).toBe('a')
    expect(isMatchOver(m)).toBe(true)
  })

  test('3 分時吃 Xtreme 直接到 6 也算勝', () => {
    let m = freshMatch()
    m = awardFinish(m, 'b', 'over') // 2
    m = awardFinish(m, 'b', 'spin') // 3
    m = awardFinish(m, 'b', 'xtreme') // 6
    expect(scoreOf(m, 'b')).toBe(6)
    expect(winner(m)).toBe('b')
  })

  test('勝負未定時 winner 為 null', () => {
    let m = freshMatch()
    m = awardFinish(m, 'a', 'spin')
    expect(winner(m)).toBeNull()
    expect(isMatchOver(m)).toBe(false)
  })

  test('一方獲勝後不再加分（鎖定）', () => {
    let m = freshMatch()
    m = awardFinish(m, 'a', 'over') // 2
    m = awardFinish(m, 'a', 'over') // 4 勝
    const afterWin = awardFinish(m, 'b', 'xtreme') // 應被忽略
    expect(scoreOf(afterWin, 'b')).toBe(0)
    expect(afterWin.log).toHaveLength(2)
    expect(winner(afterWin)).toBe('a')
  })
})

describe('undoLast', () => {
  test('移除最後一筆並回退分數', () => {
    let m = freshMatch()
    m = awardFinish(m, 'a', 'over') // 2
    m = awardFinish(m, 'a', 'over') // 4 勝
    m = undoLast(m) // 回到 2
    expect(scoreOf(m, 'a')).toBe(2)
    expect(winner(m)).toBeNull()
    expect(m.log).toHaveLength(1)
  })

  test('空 log 時 undo 不炸', () => {
    const m = freshMatch()
    expect(undoLast(m).log).toHaveLength(0)
  })

  test('撤銷勝利後可再加分（解除鎖定）', () => {
    let m = freshMatch()
    m = awardFinish(m, 'a', 'over')
    m = awardFinish(m, 'a', 'over') // 4 勝
    m = undoLast(m) // 2
    m = awardFinish(m, 'b', 'spin') // 現在可加
    expect(scoreOf(m, 'b')).toBe(1)
  })
})

describe('resetMatch / renameSide', () => {
  test('reset 清空 log 但保留名字', () => {
    let m = renameSide(freshMatch(), 'a', '阿凱')
    m = awardFinish(m, 'a', 'over')
    m = resetMatch(m)
    expect(m.log).toHaveLength(0)
    expect(m.names.a).toBe('阿凱')
    expect(scoreOf(m, 'a')).toBe(0)
  })

  test('renameSide 不動另一方、不動 log', () => {
    let m = awardFinish(freshMatch(), 'a', 'spin')
    m = renameSide(m, 'b', '小美')
    expect(m.names.b).toBe('小美')
    expect(m.log).toHaveLength(1)
  })

  test('renameSide 空字串回退為預設名（不留白）', () => {
    const m = renameSide(freshMatch(), 'a', '   ')
    expect(m.names.a.trim().length).toBeGreaterThan(0)
  })
})
