import { describe, it, expect } from 'vitest'
import { looksLikeMarkdown } from '@/utils/looksLikeMarkdown'

/**
 * 粘贴策略的 Markdown 形态判定测试。
 * 对应源码：src/utils/looksLikeMarkdown.ts
 */

describe('looksLikeMarkdown', () => {
  it('普通句子 / 网址不是 Markdown', () => {
    expect(looksLikeMarkdown('今天天气不错，出去走走。')).toBe(false)
    expect(looksLikeMarkdown('hello world\nsecond line')).toBe(false)
    expect(looksLikeMarkdown('')).toBe(false)
  })

  it('ATX 标题命中', () => {
    expect(looksLikeMarkdown('### <span style="color: #667eea">网络信息</span>')).toBe(true)
    expect(looksLikeMarkdown('# 标题')).toBe(true)
  })

  it('任务列表命中', () => {
    expect(looksLikeMarkdown('- [ ] 阿松大')).toBe(true)
    expect(looksLikeMarkdown('* [x] 已完成')).toBe(true)
  })

  it('围栏代码块 / 粗体 / Markdown 链接命中', () => {
    expect(looksLikeMarkdown('```\ncode\n```')).toBe(true)
    expect(looksLikeMarkdown('这是 **重点** 内容')).toBe(true)
    expect(looksLikeMarkdown('[MaikNote](https://example.com)')).toBe(true)
  })

  it('内联 HTML 标签命中（/ip 插入的彩色 span）', () => {
    expect(looksLikeMarkdown('前缀 <span style="color: #2ecc71">IP: </span>')).toBe(true)
    expect(looksLikeMarkdown('换行<br>续行')).toBe(true)
  })

  it('连续两行以上列表命中，单行短横线不算', () => {
    expect(looksLikeMarkdown('- 第一项\n- 第二项')).toBe(true)
    expect(looksLikeMarkdown('1. 第一项\n2. 第二项')).toBe(true)
    expect(looksLikeMarkdown('这是一个 - 普通破折号句子')).toBe(false)
  })

  it('侧边栏复制的整篇笔记源码命中', () => {
    const src = [
      '12312',
      '',
      '1231231233',
      '',
      '- [ ] 阿松大',
      '',
      'adsdasdaadasd',
      '- [ ] 123123',
      '### <span style="color: rgb(102, 126, 234);"> 网络信息 </span>',
      '<span style="color: rgb(46, 204, 113);">国家: </span>中国',
    ].join('\n')
    expect(looksLikeMarkdown(src)).toBe(true)
  })
})
