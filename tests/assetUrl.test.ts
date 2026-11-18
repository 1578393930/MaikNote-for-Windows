import { describe, it, expect, vi } from 'vitest'

/**
 * 旧内容 asset URL 归一化测试。
 * 对应源码：src/utils/assetUrl.ts
 *
 * isWindows 在模块加载时读取 navigator.userAgent，所以每个用例
 * 先设 UA 再动态 import（配合 vi.resetModules 重置模块缓存）。
 */

async function loadWithUserAgent(ua: string) {
  vi.resetModules()
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
  return await import('@/utils/assetUrl')
}

describe('normalizeLegacyAssetUrls', () => {
  it('Windows 上把 asset://localhost/ 换成 http://asset.localhost/', async () => {
    const { normalizeLegacyAssetUrls } = await loadWithUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    )
    const src = '![图](asset://localhost/images/a.png)'
    expect(normalizeLegacyAssetUrls(src)).toBe('![图](http://asset.localhost/images/a.png)')
  })

  it('Windows 上替换全部出现次数', async () => {
    const { normalizeLegacyAssetUrls } = await loadWithUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    )
    const src = '![a](asset://localhost/images/a.png) ![b](asset://localhost/images/b.png)'
    const out = normalizeLegacyAssetUrls(src)
    expect(out).not.toContain('asset://localhost/')
    expect((out.match(/http:\/\/asset\.localhost\//g) || []).length).toBe(2)
  })

  it('macOS 上保持原样（WKWebView 仍用 asset://）', async () => {
    const { normalizeLegacyAssetUrls } = await loadWithUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    )
    const src = '![图](asset://localhost/images/a.png)'
    expect(normalizeLegacyAssetUrls(src)).toBe(src)
  })

  it('空字符串原样返回', async () => {
    const { normalizeLegacyAssetUrls } = await loadWithUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    )
    expect(normalizeLegacyAssetUrls('')).toBe('')
  })

  it('没有 asset:// 的内容不受影响', async () => {
    const { normalizeLegacyAssetUrls } = await loadWithUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    )
    const src = '# 标题\n普通正文 http://example.com/x.png'
    expect(normalizeLegacyAssetUrls(src)).toBe(src)
  })
})
