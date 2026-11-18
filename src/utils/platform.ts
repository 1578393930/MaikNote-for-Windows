/**
 * 运行平台检测
 *
 * Tauri WebView 的 UA 足够可靠：macOS 含 "Macintosh"，Windows 含 "Windows NT"。
 * 全应用统一从这里取平台标志，不要散落各处自己正则。
 */
export const isMac =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

export const isWindows =
  typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

/** 修饰键显示名：Windows 用 Alt，macOS 惯用 Option */
export const altKeyName = isMac ? 'Option' : 'Alt'

/** 修饰键显示名：Windows 上不使用 Win 键（系统保留），仅 macOS 提供 Cmd */
export const metaKeyName = isMac ? 'Cmd' : ''
