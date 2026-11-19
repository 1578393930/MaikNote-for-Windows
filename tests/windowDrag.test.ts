import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TitleBar from '@/components/TitleBar/TitleBar.vue'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@/utils/platform', () => ({ isWindows: true, isMac: false }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))

const nativeWindow = vi.hoisted(() => ({
  startDragging: vi.fn().mockResolvedValue(undefined),
  outerPosition: vi.fn().mockResolvedValue({ x: 100, y: 100 }),
  setPosition: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => nativeWindow }))
vi.mock('@/stores/noteStore', () => ({
  useNoteStore: () => ({ currentNote: { content: '标题', fileName: '标题.md' } }),
  extractTitle: () => '标题',
}))
vi.mock('@/stores/settingStore', () => ({ useSettingStore: () => ({ settings: { titleBarBehavior: 'always-show' } }) }))
vi.mock('@/composables/usePinWindow', () => ({ usePinWindow: () => ({ togglePin: vi.fn() }) }))
vi.mock('@/composables/useDesktopNotes', () => ({ useDesktopNotes: () => ({ isOnDesktop: () => false }) }))

function mountTitleBar() {
  return mount(TitleBar, { global: { mocks: { $t: (key: string) => key } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
})

describe('主窗口拖动', () => {
  it('快速按下并松开后，不会因位置查询延迟而重新启动逐帧移动', async () => {
    let resolvePosition!: (pos: { x: number; y: number }) => void
    nativeWindow.outerPosition.mockReturnValueOnce(new Promise(resolve => { resolvePosition = resolve }))
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const wrapper = mountTitleBar()
    try {
      await wrapper.get('.title-bar-spacer').trigger('mousedown', { button: 0, buttons: 1 })
      document.dispatchEvent(new MouseEvent('mouseup'))
      resolvePosition({ x: 100, y: 100 })
      await flushPromises()
      expect(raf).not.toHaveBeenCalled()
    } finally {
      document.dispatchEvent(new MouseEvent('mouseup'))
      wrapper.unmount()
      raf.mockRestore()
    }
  })

  it('按下空白标题栏立即交给原生拖动，不依赖后续 DOM mousemove 或坐标换算', async () => {
    const wrapper = mountTitleBar()
    try {
      await wrapper.get('.title-bar-spacer').trigger('mousedown', { button: 0, buttons: 1 })
      await flushPromises()
      expect(invoke).toHaveBeenCalledExactlyOnceWith('start_window_drag')
      expect(nativeWindow.startDragging).not.toHaveBeenCalled()
      expect(nativeWindow.outerPosition).not.toHaveBeenCalled()
      expect(nativeWindow.setPosition).not.toHaveBeenCalled()
    } finally {
      document.dispatchEvent(new MouseEvent('mouseup'))
      wrapper.unmount()
    }
  })

  it('右键、标题文字、按钮不启动窗口拖动', async () => {
    const wrapper = mountTitleBar()
    try {
      await wrapper.get('.title-bar-spacer').trigger('mousedown', { button: 2, buttons: 2 })
      await wrapper.get('.note-title').trigger('mousedown', { button: 0, buttons: 1 })
      await wrapper.get('button').trigger('mousedown', { button: 0, buttons: 1 })
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })

  it('顶部唤出标题栏的空白区域也可以拖动', async () => {
    const wrapper = mountTitleBar()
    try {
      await wrapper.get('.title-bar-trigger').trigger('mousedown', { button: 0, buttons: 1 })
      expect(invoke).toHaveBeenCalledExactlyOnceWith('start_window_drag')
    } finally {
      wrapper.unmount()
    }
  })
})
