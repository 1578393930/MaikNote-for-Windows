import { ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import i18n from '@/i18n'
import { useSettingStore } from '@/stores/settingStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useNoteStore } from '@/stores/noteStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useAssistantsStore } from '@/stores/assistantsStore'

/**
 * WebDAV 同步调度：设置页手动触发 + 启动/定时的自动同步。
 * 重活（比较、传输、合并）在 Rust 侧 webdav.rs 完成，这里只负责
 * 取当前工作空间路径、调命令、按结果刷新前端 store。
 */

export interface WebDavSyncReport {
  uploaded: number
  downloaded: number
  conflicts: number
  mergedMeta: number
  errors: string[]
}

export interface WebDavConfigPayload {
  url: string
  username: string
  password: string
  remoteDir: string
  allowInsecure: boolean
}

// 模块级单例：设置页与 App 共享同一份状态
const syncing = ref(false)
const lastSummary = ref('')
const lastError = ref('')
let autoStarted = false
let autoTimer: number | null = null

function readConfig(): WebDavConfigPayload | null {
  const s = useSettingStore()
  const url = s.settings.webdavUrl.trim()
  if (!url) return null
  return {
    url,
    username: s.settings.webdavUsername.trim(),
    password: s.settings.webdavPassword,
    remoteDir: s.settings.webdavRemoteDir.trim(),
    allowInsecure: s.settings.webdavAllowInsecure,
  }
}

function workspaceKeyOf(contentPath: string): string {
  const parts = contentPath.split(/[\\/]/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}

export function useWebDavSync() {
  /** 手动同步（设置页按钮）。失败/结果写进 lastSummary / lastError */
  async function syncNow(): Promise<boolean> {
    if (syncing.value) return false
    const config = readConfig()
    const t = i18n.global.t
    if (!config) {
      lastError.value = t('settings.webdavMissingConfig')
      return false
    }
    syncing.value = true
    lastError.value = ''
    try {
      const ws = useWorkspaceStore()
      await ws.initialize()
      const contentPath = await ws.basePathOf('content')
      const metaPath = await ws.basePathOf('meta')
      await ws.ensureMetaDir()
      const workspaceKey = ws.current?.kind === 'icloud' ? '' : workspaceKeyOf(contentPath)
      const report = await invoke<WebDavSyncReport>('webdav_sync_now', {
        args: { config, contentPath, metaPath, workspaceKey },
      })
      // 远端带来了变化：刷新目录树、笔记列表与助手配置
      if (report.downloaded > 0 || report.conflicts > 0 || report.mergedMeta > 0) {
        try {
          await useDirectoryStore().reload()
        } catch (e) {
          console.error('WebDAV 同步后刷新目录失败:', e)
        }
        try {
          await useNoteStore().loadNotes()
        } catch (e) {
          console.error('WebDAV 同步后刷新笔记失败:', e)
        }
        try {
          await useAssistantsStore().loadAssistants()
        } catch (e) {
          console.error('WebDAV 同步后刷新助手失败:', e)
        }
      }
      lastSummary.value = t('settings.webdavSyncSummary', {
        up: report.uploaded,
        down: report.downloaded,
        conflict: report.conflicts,
        merged: report.mergedMeta,
      })
      if (report.errors.length > 0) {
        lastError.value = report.errors.join('\n')
      }
      return report.errors.length === 0
    } catch (e) {
      console.error('WebDAV 同步失败:', e)
      lastError.value = String(e)
      return false
    } finally {
      syncing.value = false
    }
  }

  /** 测试连接：返回服务器返回的可读消息 */
  async function testConnection(): Promise<{ ok: boolean; message: string }> {
    const config = readConfig()
    if (!config) {
      return { ok: false, message: i18n.global.t('settings.webdavMissingConfig') }
    }
    try {
      const message = await invoke<string>('webdav_test_connection', { config })
      return { ok: true, message }
    } catch (e) {
      return { ok: false, message: String(e) }
    }
  }

  /** App 挂载后调用：按设置决定启动同步与定时器（幂等） */
  function startAutoSync(): void {
    if (autoStarted) return
    autoStarted = true
    const settingStore = useSettingStore()

    function clearTimer() {
      if (autoTimer !== null) {
        window.clearInterval(autoTimer)
        autoTimer = null
      }
    }
    function setupTimer() {
      clearTimer()
      if (!settingStore.settings.webdavEnabled) return
      const minutes = settingStore.settings.webdavAutoIntervalMin
      if (minutes > 0) {
        autoTimer = window.setInterval(() => {
          void syncNow()
        }, minutes * 60 * 1000)
      }
    }
    watch(
      () => [
        settingStore.settings.webdavEnabled,
        settingStore.settings.webdavAutoIntervalMin,
        settingStore.settings.webdavUrl,
      ],
      setupTimer,
      { immediate: true },
    )

    // 启动同步：等笔记加载完再进行，避免跟首屏读取抢文件
    if (
      settingStore.settings.webdavEnabled
      && settingStore.settings.webdavSyncOnStart
      && settingStore.settings.webdavUrl.trim()
    ) {
      window.setTimeout(() => {
        void syncNow()
      }, 3000)
    }
  }

  return {
    syncing,
    lastSummary,
    lastError,
    syncNow,
    testConnection,
    startAutoSync,
  }
}
