import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isWindows } from '@/utils/platform'

let dragging = false
let suppressHideUntil = 0

/** Native move loops can emit blur events, including queued events on release. */
export function isWindowDragAutoHideSuppressed(): boolean {
  return dragging || Date.now() < suppressHideUntil
}

export async function startWindowDrag(): Promise<void> {
  if (dragging) return
  dragging = true
  try {
    await (isWindows ? invoke('start_window_drag') : getCurrentWindow().startDragging())
  } finally {
    dragging = false
    suppressHideUntil = Date.now() + 300
  }
}
