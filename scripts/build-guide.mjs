// Generate the in-app guide from TUTORIAL.md.
// Usage: node scripts/build-guide.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const md = new MarkdownIt({ html: true, linkify: true, typographer: false })

let source = readFileSync(join(root, 'TUTORIAL.md'), 'utf8')

// Remove the heading and optional handwritten table of contents.
source = source.replace(/^#\s+.+\r?\n/, '')
source = source.replace(/^##\s*目录\s*\r?\n[\s\S]*?(?=^##\s)/m, '')

let html = md.render(source)

// 给 h2 编号锚点，同时收集目录
const toc = []
let n = 0
html = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner) => {
  n += 1
  const id = 'guide-s' + n
  const text = inner.replace(/<[^>]+>/g, '').trim()
  toc.push({ id, text })
  return '<h2 id="' + id + '">' + inner + '</h2>'
})

html = html.replace(/<table>/g, '<div class="doc-table"><table>').replace(/<\/table>/g, '</table></div>')

const ts = [
  '// 由 scripts/build-guide.mjs 从 TUTORIAL.md 生成，请改 TUTORIAL.md 后重新生成（npm run build:guide）',
  '/* eslint-disable */',
  '',
  'export interface GuideTocItem {',
  '  id: string',
  '  text: string',
  '}',
  '',
  'export const guideToc: GuideTocItem[] = ' + JSON.stringify(toc, null, 2),
  '',
  'export const guideHtml = ' + JSON.stringify(html.trim()),
  '',
].join('\n')
writeFileSync(join(root, 'src/components/Guide/guideContent.generated.ts'), ts)

console.log('src/components/Guide/guideContent.generated.ts 已生成：' + ts.length + ' 字符')
