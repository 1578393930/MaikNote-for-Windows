import { ref, watch, onUnmounted } from 'vue'

/** Capture the note identity when an edit occurs; serialize pending writes. */
export function useAutoSave(
  noteId: () => string | null,
  content: () => string,
  saveFn: (id: string, content: string) => Promise<void>,
  delay = 500
) {
  const isSaving = ref(false)
  const saveError = ref<Error | null>(null)
  const pending = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | null = null

  watch(() => [noteId(), content()] as const, ([id, text], [oldId, oldText]) => {
    if (!id || id !== oldId || text === oldText) return
    pending.set(id, text)
    clearTimeout(timer)
    timer = setTimeout(() => { void forceSave() }, delay)
  })

  async function forceSave(): Promise<void> {
    clearTimeout(timer)
    if (running) { await running; return forceSave() }
    isSaving.value = true
    running = (async () => {
      for (const [id, text] of Array.from(pending)) {
        try {
          await saveFn(id, text)
          if (pending.get(id) === text) pending.delete(id)
        } catch (e) {
          saveError.value = e instanceof Error ? e : new Error(String(e))
          return
        }
      }
      saveError.value = null
    })()
    try { await running } finally { running = null; isSaving.value = false }
  }

  onUnmounted(() => { void forceSave() })
  return { isSaving, saveError, forceSave }
}
