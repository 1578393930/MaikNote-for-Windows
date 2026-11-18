import { isWindows } from './platform'

/**
 * 兼容旧内容的 asset URL 归一化。
 *
 * `asset://localhost/...` 是 macOS WKWebView 的自定义 scheme 形态；
 * Windows WebView2 的自定义协议必须走 http 形态（`http://asset.localhost/...`），
 * 直接请求 `asset://` 会加载失败（图片裂图）。
 *
 * 只在显示层做归一化，不改动笔记文件本身；
 * 新插入的图片由 convertFileSrc 直接生成当前平台的正确形态。
 */
export function normalizeLegacyAssetUrls(text: string): string {
  if (!text) return text
  return isWindows ? text.split('asset://localhost/').join('http://asset.localhost/') : text
}
