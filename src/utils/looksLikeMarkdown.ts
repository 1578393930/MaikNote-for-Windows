/**
 * 判断一段纯文本是否"像 Markdown"，用于粘贴策略：
 * 剪贴板只有纯文本（没有 HTML 副本）且内容像 Markdown 时，按 Markdown 解析插入，
 * 否则保持纯文本插入（从记事本 / 网页复制的普通文字不该被误转换）。
 *
 * 判定特征（命中任一即视为 Markdown）：
 * - ATX 标题（# ~ ######）
 * - 任务列表（- [ ] / * [x]）
 * - 围栏代码块 ```
 * - 行内粗体 **x** / Markdown 链接 [x](y)
 * - 连续多行列表（≥2 行以 - * + 1. 开头）
 * - 内联 HTML 标签（笔记正文支持 HTML，如 /ip 插入的彩色 span）
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false
  if (/^#{1,6}\s/im.test(text)) return true
  if (/\n?[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\]/.test(text)) return true
  if (text.includes('```')) return true
  if (/\*\*[^*\n]+\*\*/.test(text)) return true
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(text)) return true
  if (/<(span|div|br|p|strong|em|b|i|code|pre|h[1-6]|ul|ol|li|table|tr|td|th|blockquote)[\s/>]/i.test(text)) return true

  let listLines = 0
  for (const line of text.split('\n')) {
    if (/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\S/.test(line)) {
      listLines += 1
      if (listLines >= 2) return true
    }
  }
  return false
}
