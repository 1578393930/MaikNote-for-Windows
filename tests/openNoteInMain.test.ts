import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { useEdgePanel } from '@/composables/useEdgePanel'
import { useDesktopNotes } from '@/composables/useDesktopNotes'
import { useNoteStore } from '@/stores/noteStore'
import EdgePanel from '@/components/Edge/EdgePanel.vue'

const tauri = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: { payload: unknown }) => void>>()
  function listen(name: string, handler: (event: { payload: unknown }) => void) {
    const handlers = listeners.get(name) ?? new Set()
    listeners.set(name, handlers)
    handlers.add(handler)
    return Promise.resolve(() => handlers.delete(handler))
  }
  function dispatch(name: string, payload: unknown) {
    for (const handler of listeners.get(name) ?? []) handler({ payload })
  }
  return {
    listen, dispatch,
    invoke: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauri.listen,
  emit: vi.fn().mockResolvedValue(undefined),
  emitTo: async (target: string, name: string, payload: unknown) => {
    if (target === 'main') tauri.dispatch(name, payload)
  },
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => tauri }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }))
vi.mock('vue-i18n', async importOriginal => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key, locale: ref('en-US') }),
}))
vi.mock('@/components/Editor/TiptapEditor.vue', () => ({ default: {} }))

it('keeps the selected note after opening a favorite from the edge panel', async () => {
  setActivePinia(createPinia())
  const notes = useNoteStore()
  const pinned = {
    id: 'favorite', title: 'Favorite', content: 'Favorite content', directoryId: 'folder',
    createdAt: 1, updatedAt: 1, isPinned: true, isLocked: false,
  }
  notes.setNotes([pinned, { ...pinned, id: 'previous', directoryId: undefined }])
  notes.selectNote('previous')

  const showEditor = vi.fn()
  const wrapper = mount(defineComponent({
    setup() {
      useEdgePanel(showEditor)
      return () => h('div')
    },
  }))
  const panel = mount(EdgePanel)
  const desktop = useDesktopNotes()
  try {
    await flushPromises()
    await desktop.start()
    tauri.dispatch('maiknote:pinned-notes', [{
      ...pinned, preview: pinned.content, color: null, dirPath: 'folder',
    }])
    await panel.vm.$nextTick()
    await panel.get('.edge-strip').trigger('click')
    expect(panel.find('.edge-root.is-expanded').exists()).toBe(true)
    await panel.get('button.head-hide').trigger('click')
    await flushPromises()
    expect(panel.find('.edge-root.is-expanded').exists()).toBe(false)
    expect(tauri.invoke).toHaveBeenCalledWith('collapse_edge_panel')

    await panel.get('button.card-open').trigger('click')
    await flushPromises()

    expect(tauri.show).toHaveBeenCalledOnce()
    expect(tauri.setFocus).toHaveBeenCalledOnce()
    expect(notes.currentNote?.id).toBe(pinned.id)
    expect(notes.filterDirectoryId).toBe(pinned.directoryId)
    expect(showEditor).toHaveBeenCalledOnce()

    // The Rust desktop-card command sends a plain ID to the same main window.
    tauri.dispatch('maiknote:open-note', 'previous')
    await flushPromises()
    expect(notes.currentNote?.id).toBe('previous')
    expect(notes.filterDirectoryId).toBeNull()
    expect(showEditor).toHaveBeenCalledTimes(2)
  } finally {
    desktop.stop()
    panel.unmount()
    wrapper.unmount()
  }
})
