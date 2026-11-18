import { ref } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import i18n from '../i18n'
import packageJson from '../../package.json'

const currentVersion = ref(packageJson.version)
let versionLoaded = false

async function loadCurrentVersion(): Promise<void> {
  if (versionLoaded) return
  versionLoaded = true

  try {
    currentVersion.value = await getVersion()
  } catch (error) {
    console.warn('Failed to load app version from Tauri runtime:', error)
  }
}

// 最新版本信息
const latestVersion = ref<string | null>(null)
const updateAvailable = ref(false)
const checkError = ref<string | null>(null)

// 下载安装状态
type DownloadState = 'idle' | 'checking' | 'downloading' | 'installing' | 'done' | 'error'
const downloadState = ref<DownloadState>('idle')
const downloadProgress = ref(0)
let pendingUpdate: Update | null = null
const isBusy = () => ['checking', 'downloading', 'installing'].includes(downloadState.value)

async function clearPendingUpdate() {
  const previous = pendingUpdate
  pendingUpdate = null
  updateAvailable.value = false
  latestVersion.value = null
  if (previous) await previous.close().catch(console.warn)
}

// 检查更新
async function checkForUpdates(): Promise<boolean> {
  if (isBusy()) return false
  downloadState.value = 'checking'
  checkError.value = null
  updateAvailable.value = false

  try {
    await clearPendingUpdate()
    const update = await check({ timeout: 20000 })
    if (update) {
      pendingUpdate = update
      latestVersion.value = update.version
      updateAvailable.value = true
      downloadState.value = 'idle'
      return true
    }
    downloadState.value = 'idle'
    return false
  } catch (error) {
    console.error('Update check failed:', error)
    checkError.value = i18n.global.t('version.networkError')
    downloadState.value = 'error'
    return false
  }
}

// 下载并安装更新
async function downloadAndInstall(beforeInstall?: () => Promise<void>): Promise<void> {
  if (isBusy()) return
  let contentLength = 0
  let downloaded = 0

  downloadState.value = 'downloading'
  downloadProgress.value = 0
  checkError.value = null

  try {
    // Install the exact version offered to the user, even if a new release appears meanwhile.
    const update = pendingUpdate
    if (!update) {
      checkError.value = i18n.global.t('version.noUpdate')
      downloadState.value = 'error'
      return
    }

    await update.download((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength ?? 0
          downloaded = 0
          break
        case 'Progress':
          downloaded += event.data.chunkLength
          if (contentLength > 0) {
            downloadProgress.value = Math.min(100, Math.round(
              (downloaded / contentLength) * 100
            ))
          }
          break
        case 'Finished':
          downloadProgress.value = 100
          break
      }
    }, { timeout: 120000 })

    // Windows exits inside install(); flush pending notes before handing control to NSIS.
    downloadState.value = 'installing'
    await beforeInstall?.()
    await update.install()

    downloadState.value = 'done'
    await relaunch()
  } catch (error) {
    console.error('Update download/install failed:', error)
    checkError.value = i18n.global.t('version.downloadError')
    downloadState.value = 'error'
    await clearPendingUpdate()
  }
}

export function useVersionCheck() {
  void loadCurrentVersion()

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    checkError,
    downloadState,
    downloadProgress,
    checkForUpdates,
    downloadAndInstall,
  }
}
