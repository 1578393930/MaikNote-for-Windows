import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { startWindowDrag, isWindowDragAutoHideSuppressed } from '@/utils/windowDrag'

const platform = vi.hoisted(() => ({ isWindows: true }))
vi.mock('@/utils/platform', () => platform)
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ startDragging: nativeDrag }) }))
const nativeDrag = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

beforeEach(() => { vi.clearAllMocks(); platform.isWindows = true })
describe('window drag platform routing', () => {
  it('uses the Windows command even when the runtime API silently succeeds', async () => {
    await startWindowDrag()
    expect(invoke).toHaveBeenCalledExactlyOnceWith('start_window_drag')
    expect(nativeDrag).not.toHaveBeenCalled()
  })

  it('propagates Windows command errors to the caller', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('window unavailable'))
    await expect(startWindowDrag()).rejects.toThrow('window unavailable')
  })

  it('uses the runtime API on other platforms', async () => {
    platform.isWindows = false
    await startWindowDrag()
    expect(getCurrentWindow().startDragging).toHaveBeenCalledTimes(1)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('suppresses auto hide for the entire drag and queued blur events on release', async () => {
    vi.useFakeTimers()
    try {
      let finish!: () => void
      vi.mocked(invoke).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
      const task = startWindowDrag()
      // Long drags must not outlive a fixed suppression timeout.
      await vi.advanceTimersByTimeAsync(30_000)
      expect(isWindowDragAutoHideSuppressed()).toBe(true)
      finish()
      await task
      expect(isWindowDragAutoHideSuppressed()).toBe(true)
      await vi.advanceTimersByTimeAsync(301)
      // Normal blur auto hide resumes after the release events drain.
      expect(isWindowDragAutoHideSuppressed()).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('clears the drag guard after failure so later blur events work normally', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('drag failed'))
      await expect(startWindowDrag()).rejects.toThrow('drag failed')
      await vi.advanceTimersByTimeAsync(301)
      expect(isWindowDragAutoHideSuppressed()).toBe(false)
    } finally { vi.useRealTimers() }
  })
})
