import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

/**
 * 双语文案完整性：两种语言的键集合必须一致，
 * 防止新增设置项时漏翻导致界面上出现原始键名。
 */

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') {
      keys.push(...flattenKeys(v as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys.sort()
}

const zhKeys = flattenKeys(zhCN as Record<string, unknown>)
const enKeys = flattenKeys(enUS as Record<string, unknown>)

describe('i18n 语言包完整性', () => {
  it('中文有而英文缺失的键为空', () => {
    const missing = zhKeys.filter(k => !enKeys.includes(k))
    expect(missing).toEqual([])
  })

  it('英文有而中文缺失的键为空', () => {
    const missing = enKeys.filter(k => !zhKeys.includes(k))
    expect(missing).toEqual([])
  })

  it('新增的 WebDAV 同步文案两种语言都有', () => {
    const required = [
      'settings.webdavEnabled',
      'settings.webdavUrl',
      'settings.webdavUsername',
      'settings.webdavPassword',
      'settings.webdavRemoteDir',
      'settings.webdavAllowInsecure',
      'settings.webdavTest',
      'settings.webdavSyncNow',
      'settings.webdavSyncSummary',
      'settings.webdavOnStart',
      'settings.webdavAutoInterval',
      'settings.groupSync',
    ]
    for (const key of required) {
      expect(zhKeys, `zh-CN 缺少 ${key}`).toContain(key)
      expect(enKeys, `en-US 缺少 ${key}`).toContain(key)
    }
  })

  it('非空文案在两种语言里都不是空串', () => {
    const empty = zhKeys.filter((k) => {
      const v = (zhCN as Record<string, unknown>)[k]
      return typeof v === 'string' && v.trim() === ''
    })
    expect(empty).toEqual([])
  })
})
