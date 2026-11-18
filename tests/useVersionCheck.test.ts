import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '0.10.21' }))
vi.mock('../src/i18n', () => ({ default: { global: { t: (key: string) => key } } }))

async function setup() {
  const { useVersionCheck } = await import('../src/composables/useVersionCheck')
  return useVersionCheck()
}

describe('application updater', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  it('installs the offered version after download and pending saves finish', async () => {
    const order: string[] = []
    const update = {
      version: '0.10.22', close: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(async (progress) => {
        progress({ event: 'Started', data: { contentLength: 10 } })
        progress({ event: 'Progress', data: { chunkLength: 10 } })
        progress({ event: 'Finished' })
        order.push('download')
      }),
      install: vi.fn(async () => { order.push('install') }),
    }
    mocks.check.mockResolvedValue(update)
    const api = await setup()
    expect(await api.checkForUpdates()).toBe(true)
    await api.downloadAndInstall(async () => { order.push('save') })
    expect(order).toEqual(['download', 'save', 'install'])
    expect(mocks.check).toHaveBeenCalledTimes(1)
    expect(api.downloadProgress.value).toBe(100)
    expect(mocks.relaunch).toHaveBeenCalledOnce()
  })

  it('clears a failed download so retry checks again, without installing', async () => {
    const update = {
      version: '0.10.22', close: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockRejectedValue(new Error('invalid signature')),
      install: vi.fn(),
    }
    mocks.check.mockResolvedValue(update)
    const api = await setup()
    await api.checkForUpdates()
    await api.downloadAndInstall()
    expect(api.downloadState.value).toBe('error')
    expect(api.updateAvailable.value).toBe(false)
    expect(api.latestVersion.value).toBeNull()
    expect(update.close).toHaveBeenCalledOnce()
    expect(update.install).not.toHaveBeenCalled()
    mocks.check.mockResolvedValue(null)
    await api.checkForUpdates()
    expect(api.checkError.value).toBeNull()
    expect(api.downloadState.value).toBe('idle')
  })

  it('ignores duplicate clicks during a check and releases replaced update handles', async () => {
    let resolveCheck!: (value: unknown) => void
    mocks.check.mockReturnValueOnce(new Promise(resolve => { resolveCheck = resolve }))
    const api = await setup()
    const checking = api.checkForUpdates()
    await api.checkForUpdates()
    await api.downloadAndInstall()
    await Promise.resolve()
    const close = vi.fn().mockResolvedValue(undefined)
    resolveCheck({ version: '0.10.22', close })
    await checking
    expect(mocks.check).toHaveBeenCalledTimes(1)
    mocks.check.mockResolvedValue(null)
    await api.checkForUpdates()
    expect(close).toHaveBeenCalledOnce()
    expect(api.latestVersion.value).toBeNull()
  })

  it('does not install if the pre-install save fails', async () => {
    const update = { version: '0.10.22', download: vi.fn(), install: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
    mocks.check.mockResolvedValue(update)
    const api = await setup()
    await api.checkForUpdates()
    await api.downloadAndInstall(async () => { throw new Error('save failed') })
    expect(update.install).not.toHaveBeenCalled()
    expect(mocks.relaunch).not.toHaveBeenCalled()
    expect(api.downloadState.value).toBe('error')
  })
})
