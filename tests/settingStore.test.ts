import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingStore } from '@/stores/settingStore'

/**
 * 设置存储测试：默认值、持久化、恢复默认。
 * 对应源码：src/stores/settingStore.ts
 */

describe('settingStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('默认值：WebDAV 关闭、远程目录 MaikNote、自动间隔 0', () => {
    const store = useSettingStore()
    expect(store.settings.webdavEnabled).toBe(false)
    expect(store.settings.webdavUrl).toBe('')
    expect(store.settings.webdavRemoteDir).toBe('MaikNote')
    expect(store.settings.webdavAllowInsecure).toBe(false)
    expect(store.settings.webdavSyncOnStart).toBe(false)
    expect(store.settings.webdavAutoIntervalMin).toBe(0)
  })

  it('基础默认值：中文界面、500ms 自动保存', () => {
    const store = useSettingStore()
    expect(store.settings.language).toBe('zh-CN')
    expect(store.settings.autoSaveInterval).toBe(500)
    expect(store.settings.edgeEnabled).toBe(true)
    expect(store.settings.edgePosition).toBe('right')
  })

  it('loadSettings 把已保存的局部设置合并进默认值', () => {
    localStorage.setItem(
      'maiknote-settings',
      JSON.stringify({ fontSize: 18, webdavUrl: 'https://dav.jianguoyun.com/dav/', webdavEnabled: true }),
    )
    const store = useSettingStore()
    store.loadSettings()
    expect(store.settings.fontSize).toBe(18)
    expect(store.settings.webdavUrl).toBe('https://dav.jianguoyun.com/dav/')
    expect(store.settings.webdavEnabled).toBe(true)
    // 未保存的键保持默认
    expect(store.settings.webdavRemoteDir).toBe('MaikNote')
  })

  it('updateSettings 修改并持久化到 localStorage', () => {
    const store = useSettingStore()
    store.updateSettings('webdavRemoteDir', 'MyNotes')
    const saved = JSON.parse(localStorage.getItem('maiknote-settings') || '{}')
    expect(saved.webdavRemoteDir).toBe('MyNotes')
    expect(store.settings.webdavRemoteDir).toBe('MyNotes')
  })

  it('updateSettings 对布尔开关同样生效', () => {
    const store = useSettingStore()
    store.updateSettings('webdavSyncOnStart', true)
    expect(store.settings.webdavSyncOnStart).toBe(true)
  })

  it('loadSettings 钳制越界数值（脏数据容错）', () => {
    localStorage.setItem(
      'maiknote-settings',
      JSON.stringify({
        edgeWidth: 99999,
        edgeTriggerSpan: 1,
        autoSaveInterval: 1,
        webdavAutoIntervalMin: -5,
      }),
    )
    const store = useSettingStore()
    store.loadSettings()
    expect(store.settings.edgeWidth).toBe(1200)
    expect(store.settings.edgeTriggerSpan).toBe(10)
    expect(store.settings.autoSaveInterval).toBe(200)
    expect(store.settings.webdavAutoIntervalMin).toBe(0)
  })

  it('resetSettings 恢复全部默认值', () => {
    const store = useSettingStore()
    store.updateSettings('webdavEnabled', true)
    store.updateSettings('webdavAutoIntervalMin', 15)
    store.resetSettings()
    expect(store.settings.webdavEnabled).toBe(false)
    expect(store.settings.webdavAutoIntervalMin).toBe(0)
  })
})
