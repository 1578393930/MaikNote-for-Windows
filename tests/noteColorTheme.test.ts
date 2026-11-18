import { describe, it, expect } from 'vitest'
import {
  normalizeHexColor,
  relativeLuminance,
  isLightColor,
  adaptNoteColor,
} from '@/utils/noteColorTheme'

/**
 * 笔记底色主题适配测试（桌面卡片 / 笔记背景）。
 * 对应源码：src/utils/noteColorTheme.ts
 */

describe('normalizeHexColor', () => {
  it('3 位与 6 位 hex 都规范化成小写 6 位', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc')
    expect(normalizeHexColor('#AABBCC')).toBe('#aabbcc')
    expect(normalizeHexColor(' #ffdd55 ')).toBe('#ffdd55')
  })

  it('非 hex 值返回 null', () => {
    expect(normalizeHexColor('rgba(1,2,3,0.5)')).toBeNull()
    expect(normalizeHexColor('red')).toBeNull()
    expect(normalizeHexColor('#12345')).toBeNull()
    expect(normalizeHexColor('')).toBeNull()
  })
})

describe('relativeLuminance / isLightColor', () => {
  it('黑为 0，白为 1', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('白色偏亮，黑色偏暗', () => {
    expect(isLightColor('#ffffff')).toBe(true)
    expect(isLightColor('#000000')).toBe(false)
  })
})

describe('adaptNoteColor', () => {
  it('暗色主题下的亮色被压暗', () => {
    const out = adaptNoteColor('#ffdd55', 'dark')
    expect(relativeLuminance(out)).toBeLessThan(relativeLuminance('#ffdd55'))
    expect(relativeLuminance(out)).toBeLessThanOrEqual(0.2)
  })

  it('暗色主题下已经暗的颜色原样返回（幂等基准）', () => {
    const dark = adaptNoteColor('#ffdd55', 'dark')
    expect(adaptNoteColor(dark, 'dark')).toBe(dark)
  })

  it('亮色主题下的暗色被提亮', () => {
    const out = adaptNoteColor('#2233aa', 'light')
    expect(relativeLuminance(out)).toBeGreaterThan(relativeLuminance('#2233aa'))
    expect(relativeLuminance(out)).toBeGreaterThanOrEqual(0.55)
  })

  it('亮色主题下已经亮的颜色原样返回', () => {
    expect(adaptNoteColor('#fff8e1', 'light')).toBe('#fff8e1')
  })

  it('非 hex 值（rgba/var）不处理，原样返回', () => {
    const rgba = 'rgba(255, 221, 85, 0.9)'
    expect(adaptNoteColor(rgba, 'dark')).toBe(rgba)
    expect(adaptNoteColor('var(--x)', 'light')).toBe('var(--x)')
  })

  it('幂等：同一颜色重复适配结果稳定', () => {
    const once = adaptNoteColor('#88ccff', 'light')
    expect(adaptNoteColor(once, 'light')).toBe(once)
    const onceDark = adaptNoteColor('#88ccff', 'dark')
    expect(adaptNoteColor(onceDark, 'dark')).toBe(onceDark)
  })
})
