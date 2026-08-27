import { describe, expect, test } from 'vitest'
import { extractLeads } from './draw-fb-scan.mjs'

describe('extractLeads', () => {
  test('抓得到抽選字樣、日期與 lin.ee 連結', () => {
    const post = `Funbox 竹北遠東店\n8/28-8/29 戰鬥陀螺抽選開始！\nUX-19 子彈獅鷲H\nhttps://lin.ee/AbC123x\n更多商品請看店內公告`
    const r = extractLeads(post)
    expect(r.found).toBe(true)
    expect(r.hit).toContain('抽選')
    expect(r.links).toEqual(['https://lin.ee/AbC123x'])
    expect(r.dates).toEqual(['8/28', '8/29'])
  })

  test('沒有抽選相關字樣就不算命中', () => {
    const r = extractLeads('本店今日營業時間 11:00-21:00，歡迎光臨')
    expect(r.found).toBe(false)
    expect(r.hit).toEqual([])
  })

  test('只有連結沒有關鍵字也算線索（貼文可能只貼連結）', () => {
    const r = extractLeads('https://lin.ee/ZZZ999')
    expect(r.found).toBe(true)
    expect(r.links).toEqual(['https://lin.ee/ZZZ999'])
  })

  test('重複連結去重', () => {
    const r = extractLeads('https://lin.ee/A1 x https://lin.ee/A1 抽籤')
    expect(r.links).toEqual(['https://lin.ee/A1'])
  })
})
