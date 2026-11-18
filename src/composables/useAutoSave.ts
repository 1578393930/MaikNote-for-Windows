import { ref, watch, onUnmounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'

/**
 * 编辑器自动保存。
 *
 * 正确性要点（都修过 bug，别轻易改回去）：
 * - 空内容也要保存：清空正文后磁盘必须跟着空，否则旧内容会在重开时「复活」；
 * - 基线（磁盘上的内容）用「本次改动前的值」推断，而不是从空串起步：
 *   打开笔记后立刻清空，同样要能落盘；
 * - forceSave 必须绕过防抖直接落盘：卸载时 VueUse 会取消挂起的防抖调用，
 *   关窗前最后几百毫秒的编辑只能靠它保住。
 */
export function useAutoSave(
  noteId: () => string | null,
  content: () => string,
  saveFn: (id: string, content: string) => Promise<void>,
  delay = 500
) {
  const isSaving = ref(false)
  const saveError = ref<Error | null>(null)
  /** 最近一次成功落盘的内容；null = 本次会话还没存过 */
  let lastSavedContent: string | null = null
  /** 最近一次改动前的值（磁盘基线的最佳估计） */
  let pendingPrev: string | null = null

  async function runSave(next: string, prev: string) {
    const id = noteId()
    if (!id) return
    // 基线：优先用已保存内容，其次用改动前的值
    const baseline = lastSavedContent ?? prev
    if (next === baseline) {
      lastSavedContent = next
      pendingPrev = null
      return
    }

    isSaving.value = true
    saveError.value = null

    try {
      await saveFn(id, next)
      lastSavedContent = next
      pendingPrev = null
    } catch (e) {
      saveError.value = e as Error
      console.error('Auto-save failed:', e)
    } finally {
      isSaving.value = false
    }
  }

  const debouncedSave = useDebounceFn((next?: string, prev?: string) => {
    void runSave(next ?? content(), prev ?? content())
  }, delay)

  // Watch content changes
  watch(content, (next, prev) => {
    pendingPrev = prev
    debouncedSave(next, prev)
  })

  // 绕过防抖立即落盘（关窗 / 卸载 / 手动保存）
  async function forceSave() {
    await runSave(content(), pendingPrev ?? content())
  }

  // Cleanup
  onUnmounted(() => {
    // Save on unmount
    void forceSave()
  })

  return {
    isSaving,
    saveError,
    forceSave,
  }
}
