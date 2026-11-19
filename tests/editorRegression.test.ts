import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '@/i18n'
import TiptapEditor from '@/components/Editor/TiptapEditor.vue'
import MilkdownEditor from '@/components/Editor/MilkdownEditor.vue'
import { useNoteStore } from '@/stores/noteStore'
import { useSettingStore } from '@/stores/settingStore'
import { useSourceMode } from '@/composables/useSourceMode'
import { useFileSystem } from '@/composables/useFileSystem'
import { invoke } from '@tauri-apps/api/core'
import { requestAiChat } from '@/utils/aiRequest'
import { callBaiduSearch } from '@/composables/useBaiduSearch'
import { useAssistantsStore } from '@/stores/assistantsStore'
import Settings from '@/components/Settings/Settings.vue'

const calls = vi.hoisted(() => ({ writes: [] as any[], failWrite: false }))
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (s: string) => s,
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === 'get_icloud_path') return 'X:/audit-only'
    if (cmd === 'workspace_meta_root') return 'X:/audit-meta'
    if (cmd === 'read_assistants') return JSON.stringify({ assistants: [] })
    if (cmd === 'read_workspaces') return ''
    if (cmd === 'read_directories') return JSON.stringify({ version: 1, directories: [] })
    if (cmd === 'read_metadata') return JSON.stringify({ version: 2, notes: [] })
    if (cmd === 'write_note') { if (calls.failWrite) throw new Error('AUDIT: disk full'); calls.writes.push(args); return }
    if (cmd === 'list_note_files') return []
    return undefined
  }),
}))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ readText: vi.fn().mockResolvedValue(''), writeText: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }))
vi.mock('@tauri-apps/api/app', () => ({ setTheme: vi.fn().mockResolvedValue(undefined), getVersion: vi.fn().mockResolvedValue('0.10.22') }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}), emit: vi.fn() }))
vi.mock('@/utils/aiRequest', () => ({ requestAiChat: vi.fn() }))
vi.mock('@/composables/useBaiduSearch', () => ({ callBaiduSearch: vi.fn() }))
let wrappers: any[] = []
let pinia: any
function note(id: string, content: string) { return { id, title: content.split('\n')[0], content, fileName: id + '.md', createdAt: 0, updatedAt: 0, isLocked: false, isPinned: false } }
function openEditor(content: string, parent = false) {
  const store = useNoteStore()
  store.setNotes([note('a', content), note('b', 'B正文')])
  store.currentNoteId = 'a'
  const w = mount(parent ? MilkdownEditor : TiptapEditor, {
    props: parent ? {} : { initialContent: content, fontSize: 16, fontFamily: 'sans-serif', isLocked: false },
    attachTo: document.body,
    global: { plugins: [pinia, i18n], stubs: { BubbleMenu: true } },
  })
  wrappers.push(w)
  return w
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.mocked(requestAiChat).mockReset()
  vi.mocked(callBaiduSearch).mockReset()
  calls.writes = []; calls.failWrite = false
  localStorage.clear()
  pinia = createPinia(); setActivePinia(pinia)
  useSourceMode().isSourceMode.value = false
  ;(window as any).__maiknoteImeDebug = false
  ;(window as any).__imeComposing = false
  ;(window as any).__imeEndedAt = -1000
  Range.prototype.getClientRects = () => [] as any
  Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }) as any
  Element.prototype.getClientRects = () => [] as any
  window.scrollTo = () => {}
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as any
})
afterEach(async () => {
  for (const w of wrappers) w.unmount()
  wrappers = []
  await flushPromises()
  vi.clearAllTimers(); vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('system audit', () => {
  it('table Tab navigates to next cell', async () => {
    openEditor('| A | B |\n| --- | --- |\n| 1 | 2 |')
    await flushPromises()
    const ed = (window as any).__editor
    ed.commands.setTextSelection(4)
    const before = ed.state.selection.$from.before(3)
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true }))
    expect(ed.state.selection.$from.before(3)).not.toBe(before)
  })
  it('source note switch must not copy B content into A', async () => {
    useSourceMode().isSourceMode.value = true
    openEditor('A正文', true)
    await flushPromises()
    const store = useNoteStore()
    store.selectNote('b')
    await nextTick(); await flushPromises(); await vi.advanceTimersByTimeAsync(1100)
    expect(store.notes.find(n => n.id === 'a')!.content).toBe('A正文')
  })
  it('disk write failure must reject for save feedback', async () => {
    calls.failWrite = true
    await expect(useFileSystem().writeNote('audit.md', 'only synthetic')).rejects.toThrow('disk full')
  })
  it('failed background saves remain dirty and can be retried from the editor', async () => {
    useSourceMode().isSourceMode.value = true
    const w = openEditor('initial', true)
    await flushPromises()
    calls.failWrite = true
    await w.get('textarea.source-textarea').setValue('updated')
    await vi.advanceTimersByTimeAsync(1100)
    const store = useNoteStore()
    expect(store.saveError?.message).toContain('disk full')
    expect(w.get('.save-error').text()).not.toContain('editor.saveFailedRetry')
    calls.failWrite = false
    await w.get('.save-error').trigger('click')
    await flushPromises()
    expect(store.saveError).toBeNull()
    expect(calls.writes.some(w => w.content === 'updated')).toBe(true)
    expect(w.find('.save-error').exists()).toBe(false)
  })

  it('explicit flush rejects on failure and preserves the note for retry', async () => {
    const store = useNoteStore()
    store.setNotes([note('a', 'initial')])
    store.updateNote('a', { content: 'latest' })
    calls.failWrite = true
    await expect(store.flushPendingSave()).rejects.toThrow('disk full')
    calls.failWrite = false
    await store.flushPendingSave()
    expect(calls.writes.some(w => w.content === 'latest')).toBe(true)
    expect(store.saveError).toBeNull()
  })

  it('Windows filenames must not collide by letter case', async () => {
    const store = useNoteStore()
    const a = await store.createNoteWithContent('Report', 'first synthetic')
    const b = await store.createNoteWithContent('report', 'second synthetic')
    expect(calls.writes.find(w => w.fileName === a.fileName)?.content).toBe('first synthetic')
    expect(a.fileName!.toLowerCase()).not.toBe(b.fileName!.toLowerCase())
  })
  it('long duplicate filenames retain the suffix within the native length limit', async () => {
    const store = useNoteStore()
    const title = 'A'.repeat(60)
    const a = await store.createNoteWithContent(title, 'first')
    const b = await store.createNoteWithContent(title.toLowerCase(), 'second')
    const c = await store.createNoteWithContent(title, 'third')
    const names = [a, b, c].map(n => n.fileName!.toLowerCase())
    expect(new Set(names).size).toBe(3)
    expect(names.every(name => Array.from(name.slice(0, -3)).length <= 60)).toBe(true)
  })

  it('source switch A to B to C with edited A must preserve all contents', async () => {
    useSourceMode().isSourceMode.value = true
    const w = openEditor('A正文', true)
    await flushPromises()
    const store = useNoteStore()
    store.notes.push(note('c', 'C正文'))
    await w.get('textarea.source-textarea').setValue('A正文新增')
    store.selectNote('b')
    await nextTick()
    store.selectNote('c')
    await nextTick(); await flushPromises(); await vi.advanceTimersByTimeAsync(1100)
    expect(store.notes.map(n => [n.id, n.content])).toEqual([['a', 'A正文新增'], ['b', 'B正文'], ['c', 'C正文']])
  })
  it('unmounting editor must clean periodic debug timer', async () => {
    const w = openEditor('测试正文')
    await flushPromises(); await vi.advanceTimersByTimeAsync(100)
    w.unmount(); wrappers = []
    await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('normal table insert, select all cells, delete, undo works', async () => {
    openEditor('测试')
    await flushPromises()
    const ed = (window as any).__editor
    ed.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })
    await vi.advanceTimersByTimeAsync(600)
    const positions: number[] = []
    ed.state.doc.descendants((n: any, p: number) => { if (['tableCell', 'tableHeader'].includes(n.type.name)) positions.push(p) })
    ed.commands.setCellSelection({ anchorCell: positions[0], headCell: positions.at(-1) })
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
    expect(ed.getHTML()).not.toContain('<table')
    ed.commands.undo()
    expect(ed.getHTML()).toContain('<table')
  })

  it('AI accepts JSON chat completion returned by relay', async () => {
    openEditor('AI测试正文'); await flushPromises()
    const settings = useSettingStore().settings
    settings.aiKey = 'audit-only'; settings.aiUrl = 'https://audit.invalid/v1/chat/completions'; settings.aiModel = 'audit-model'
    useAssistantsStore().assistants = [{ id: 'audit', name: '自测助手', prompt: '整理', searchEnabled: false, createdAt: 0 }]
    vi.mocked(requestAiChat).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'AI测试结果' } }] }), { headers: { 'Content-Type': 'application/json' } }))
    document.querySelector('.tiptap .ProseMirror')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await flushPromises()
    Array.from(document.querySelectorAll('.context-menu-item')).find(x => x.textContent?.includes('自测助手'))!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.ai-preview-text')?.textContent).toBe('AI测试结果')
  })

  it('closing AI preview during search must not start model request later', async () => {
    openEditor('AI搜索测试'); await flushPromises()
    const settings = useSettingStore().settings
    settings.aiKey = 'audit-only'; settings.baiduSearchKey = 'audit-only'
    useAssistantsStore().assistants = [{ id: 'audit', name: '自测助手', prompt: '整理', searchEnabled: true, createdAt: 0 }]
    let resolveSearch!: (s: string) => void
    vi.mocked(callBaiduSearch).mockReturnValueOnce(new Promise(resolve => { resolveSearch = resolve }))
    vi.mocked(requestAiChat).mockResolvedValueOnce(new Response('data: [DONE]\n'))
    document.querySelector('.tiptap .ProseMirror')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await flushPromises()
    Array.from(document.querySelectorAll('.context-menu-item')).find(x => x.textContent?.includes('自测助手'))!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    document.querySelector('.ai-preview-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    resolveSearch('synthetic search result')
    await flushPromises()
    expect(requestAiChat).not.toHaveBeenCalled()
  })

  it('a cancelled old search cannot clear a newer request', async () => {
    const w = openEditor('AI request lifecycle')
    await flushPromises()
    const settings = useSettingStore().settings
    settings.aiKey = 'audit-only'; settings.baiduSearchKey = 'audit-only'
    useAssistantsStore().assistants = [{ id: 'audit', name: 'Lifecycle assistant', prompt: 'format', searchEnabled: true, createdAt: 0 }]
    const resolvers: Array<(s: string) => void> = []
    vi.mocked(callBaiduSearch).mockImplementation(() => new Promise(resolve => { resolvers.push(resolve) }))
    const start = async () => {
      w.get('.ProseMirror').element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      await flushPromises()
      Array.from(document.querySelectorAll('.context-menu-item')).find(x => x.textContent?.includes('Lifecycle assistant'))!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    }
    await start()
    await start()
    const secondSignal = vi.mocked(callBaiduSearch).mock.calls[1][2]!.signal!
    expect(vi.mocked(callBaiduSearch).mock.calls[0][2]!.signal!.aborted).toBe(true)
    resolvers[0]('old search')
    await flushPromises()
    expect(secondSignal.aborted).toBe(false)
    document.querySelector('.ai-preview-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(secondSignal.aborted).toBe(true)
    resolvers[1]('new search')
    await flushPromises()
    expect(requestAiChat).not.toHaveBeenCalled()
  })

  it('locked note rename must not alter the note body', async () => {
    const store = useNoteStore()
    store.setNotes([{ ...note('a', '# 原标题\n\n原内容'), isLocked: true }])
    await store.renameNoteFile('a', '新标题')
    expect(store.notes[0].content).toBe('# 原标题\n\n原内容')
  })

  it('rightclick outside editor must not open editor menu', async () => {
    openEditor('测试正文'); await flushPromises()
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(document.querySelector('.context-menu')).toBeNull()
  })

  it('AI standard SSE result can be previewed and applied with undo', async () => {
    openEditor('AI原正文'); await flushPromises()
    useSettingStore().settings.aiKey = 'audit-only'
    useAssistantsStore().assistants = [{ id: 'audit', name: '自测助手', prompt: '整理', searchEnabled: false, createdAt: 0 }]
    vi.mocked(requestAiChat).mockResolvedValueOnce(new Response('data: {"choices":[{"delta":{"content":"AI测试结果"}}]}\n\ndata: [DONE]\n\n'))
    document.querySelector('.tiptap .ProseMirror')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await flushPromises()
    Array.from(document.querySelectorAll('.context-menu-item')).find(x => x.textContent?.includes('自测助手'))!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.ai-preview-text')?.textContent).toBe('AI测试结果')
    document.querySelector('.ai-btn-primary')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const ed = (window as any).__editor
    expect(ed.getText()).toBe('AI测试结果')
    ed.commands.undo()
    expect(ed.getText()).toBe('AI原正文')
  })

  it('settings categories can render, change persisted font size and reopen settings', async () => {
    const w = mount(Settings, { attachTo: document.body, global: { plugins: [pinia, i18n] } })
    wrappers.push(w)
    await flushPromises()
    for (const category of w.findAll('.nav-item')) {
      await category.trigger('click')
      await flushPromises()
      expect(w.find('.settings-section').exists()).toBe(true)
    }
    useSettingStore().updateSettings('fontSize', 20)
    expect(JSON.parse(localStorage.getItem('maiknote-settings')!).fontSize).toBe(20)
    useSettingStore().settings.fontSize = 16
    useSettingStore().loadSettings()
    expect(useSettingStore().settings.fontSize).toBe(20)
  })
})
