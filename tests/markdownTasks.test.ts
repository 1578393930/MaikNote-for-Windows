import { describe, it, expect } from 'vitest'
import { createPreviewMarkdown, toggleTaskLine } from '@/utils/markdownTasks'

/**
 * 预览渲染（贴边面板 / 桌面卡片共用）的任务列表与代码复制测试。
 * 对应源码：src/utils/markdownTasks.ts
 */

function render(md: ReturnType<typeof createPreviewMarkdown>, src: string): string {
  return md.render(src)
}

describe('createPreviewMarkdown 任务列表渲染', () => {
  it('未勾选任务 `- [ ]` 渲染成未选中复选框', () => {
    const md = createPreviewMarkdown()
    const html = render(md, '- [ ] 待办一')
    expect(html).toContain('<input class="md-task" type="checkbox"')
    // 没有 " checked"（选中态），但 data-checked="false" 存在
    expect(html).not.toContain(' checked')
    expect(html).toContain('data-checked="false"')
    // 方括号标记被抠掉，只留正文
    expect(html).not.toContain('[ ]')
    expect(html).toContain('待办一')
  })

  it('已勾选任务 `- [x]` 渲染成选中复选框', () => {
    const md = createPreviewMarkdown()
    const html = render(md, '- [x] 已完成')
    expect(html).toContain(' checked')
    expect(html).toContain('data-checked="true"')
  })

  it('大写 `- [X]` 也算勾选', () => {
    const md = createPreviewMarkdown()
    const html = render(md, '- [X] 大写勾选')
    expect(html).toContain(' checked')
  })

  it('有序列表 `1. [ ]` 同样支持', () => {
    const md = createPreviewMarkdown()
    const html = render(md, '1. [ ] 有序任务')
    expect(html).toContain('input class="md-task"')
    expect(html).toContain('md-task-item')
  })

  it('普通列表项不会被误改成复选框', () => {
    const md = createPreviewMarkdown()
    const html = render(md, '- [ ] 真任务\n- 普通项 [ ] 带方括号的文字')
    // 普通项保留字面量方括号，没有复选框
    expect((html.match(/class="md-task"/g) || []).length).toBe(1)
    expect(html).toContain('普通项 [ ] 带方括号的文字')
  })

  it('data-task-line 记录源文件行号，跳过段落和空行也不串号', () => {
    const src = ['第一段', '', '- [ ] 行2的任务', '', '中间文字', '- [ ] 行5的任务'].join('\n')
    const md = createPreviewMarkdown()
    const html = render(md, src)
    expect(html).toContain('data-task-line="2"')
    expect(html).toContain('data-task-line="5"')
  })

  it('容器列表挂 md-task-list 类名', () => {
    const md = createPreviewMarkdown()
    const html = render(md, '- [ ] a\n- [ ] b')
    expect(html).toContain('md-task-list')
  })

  it('代码块复制按钮：传 codeCopyLabel 时生成按钮', () => {
    const md = createPreviewMarkdown({ codeCopyLabel: '复制' })
    const html = render(md, '```js\nconst a = 1\n```')
    expect(html).toContain('md-code-copy')
    expect(html).toContain('title="复制"')
    // 代码内容转义后保留
    expect(html).toContain('const a = 1')
  })

  it('不传 codeCopyLabel 时不生成复制按钮', () => {
    const md = createPreviewMarkdown()
    const html = render(md, '```js\nconst a = 1\n```')
    expect(html).not.toContain('md-code-copy')
    expect(html).toContain('<pre>')
  })
})

describe('toggleTaskLine 勾选回写', () => {
  const src = ['- [ ] 任务A', '正文', '- [x] 任务B'].join('\n')

  it('按行号勾选：[ ] 变 [x]', () => {
    const next = toggleTaskLine(src, 0, true)
    expect(next.split('\n')[0]).toBe('- [x] 任务A')
    expect(next.split('\n')[2]).toBe('- [x] 任务B')
  })

  it('按行号取消勾选：[x] 变 [ ]', () => {
    const next = toggleTaskLine(src, 2, false)
    expect(next.split('\n')[2]).toBe('- [ ] 任务B')
    expect(next.split('\n')[0]).toBe('- [ ] 任务A')
  })

  it('行号越界时原样返回', () => {
    expect(toggleTaskLine(src, 99, true)).toBe(src)
  })

  it('负数与 NaN 行号原样返回', () => {
    expect(toggleTaskLine(src, -1, true)).toBe(src)
    expect(toggleTaskLine(src, Number.NaN, true)).toBe(src)
  })

  it('目标行不是任务行时原样返回（防串号）', () => {
    const next = toggleTaskLine(src, 1, true)
    expect(next).toBe(src)
  })

  it('* 号与 1. 编号的任务行都能回写', () => {
    expect(toggleTaskLine('* [ ] 星号任务', 0, true)).toBe('* [x] 星号任务')
    expect(toggleTaskLine('1. [ ] 序号任务', 0, true)).toBe('1. [x] 序号任务')
  })

  it('引用里的任务行 `- > [ ]` 也能回写', () => {
    expect(toggleTaskLine('> - [ ] 引用任务', 0, true)).toBe('> - [x] 引用任务')
  })
})
