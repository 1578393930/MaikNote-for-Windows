import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { useAutoSave } from '@/composables/useAutoSave'

/**
 * 自动保存测试。对应源码：src/composables/useAutoSave.ts
 * 回归：曾因 `!currentContent` 跳过空内容保存，导致清空正文后旧内容在重开时复活。
 */

function mountAutoSave(
  noteId: () => string | null,
  content: () => string,
  saveFn: (id: string, content: string) => Promise<void>,
  delay = 100,
) {
  let api!: ReturnType<typeof useAutoSave>
  mount(defineComponent({
    setup() {
      api = useAutoSave(noteId, content, saveFn, delay)
      return () => null
    },
  }))
  return api
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('清空正文后也会保存空内容（BUG-A 回归）', async () => {
    const id = ref<string | null>('n1')
    const text = ref('有内容')
    const saveFn = vi.fn().mockResolvedValue(undefined)
    mountAutoSave(() => id.value, () => text.value, saveFn)

    text.value = ''
    await vi.advanceTimersByTimeAsync(150)
    expect(saveFn).toHaveBeenCalledWith('n1', '')
  })

  it('正常编辑防抖保存最后一次', async () => {
    const text = ref('第一版')
    const saveFn = vi.fn().mockResolvedValue(undefined)
    mountAutoSave(() => 'n1', () => text.value, saveFn)

    text.value = '第二版'
    await vi.advanceTimersByTimeAsync(50)
    text.value = '最终版'
    await vi.advanceTimersByTimeAsync(200)
    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn).toHaveBeenCalledWith('n1', '最终版')
  })

  it('相同内容不重复保存', async () => {
    const text = ref('同样内容')
    const saveFn = vi.fn().mockResolvedValue(undefined)
    mountAutoSave(() => 'n1', () => text.value, saveFn)

    await vi.advanceTimersByTimeAsync(200)
    expect(saveFn).not.toHaveBeenCalled()
  })

  it('没有目标笔记时不保存', async () => {
    const text = ref('x')
    const saveFn = vi.fn().mockResolvedValue(undefined)
    mountAutoSave(() => null, () => text.value, saveFn)

    text.value = 'y'
    await vi.advanceTimersByTimeAsync(200)
    expect(saveFn).not.toHaveBeenCalled()
  })

  it('forceSave 立即触发保存', async () => {
    const text = ref('待保存')
    const saveFn = vi.fn().mockResolvedValue(undefined)
    const api = mountAutoSave(() => 'n1', () => text.value, saveFn, 5000)

    text.value = '新内容'
    await nextTick() // 等 watcher 刷新（真实关窗场景同样在若干事件循环之后）
    await api.forceSave()
    expect(saveFn).toHaveBeenCalledWith('n1', '新内容')
  })

  it('pending edits retain their note identity across navigation', async () => {
    const id = ref<string | null>('a')
    const text = ref('original A')
    const save = vi.fn().mockResolvedValue(undefined)
    mountAutoSave(() => id.value, () => text.value, save)
    text.value = 'edited A'
    await nextTick()
    id.value = 'b'
    text.value = 'original B'
    await vi.advanceTimersByTimeAsync(150)
    expect(save.mock.calls).toEqual([['a', 'edited A']])
  })

  it('retains failed content for an explicit retry', async () => {
    const text = ref('original')
    const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const api = mountAutoSave(() => 'a', () => text.value, save)
    text.value = ''
    await vi.advanceTimersByTimeAsync(150)
    expect(api.saveError.value?.message).toBe('disk full')
    await api.forceSave()
    expect(save.mock.calls).toEqual([['a', ''], ['a', '']])
    expect(api.saveError.value).toBeNull()
  })
})
