const fs = require('fs')
const path = require('path')

const pairs = [
  ['Option+Cmd+A', 'Ctrl+Alt+A'],
  ['⌥⌘A', 'Ctrl+Alt+A'],
  ['⌘⌥A', 'Ctrl+Alt+A'],
  ['⌥+⌘+A', 'Ctrl+Alt+A'],
  ['⌘Z', 'Ctrl+Z'],
  ['⌘F', 'Ctrl+F'],
  ['⌘N', 'Ctrl+N'],
  ['⌘W', 'Ctrl+W'],
  ['⌘/', 'Ctrl+/'],
  ['⌘[', 'Ctrl+['],
  ['⌘]', 'Ctrl+]'],
  ['⌘\\', 'Ctrl+\\'],
  ['⌘,', 'Ctrl+,'],
  ['菜单栏图标', '系统托盘图标'],
  ['菜单栏', '系统托盘'],
  ['访达 → 废纸篓', '资源管理器 → 回收站'],
  ['访达', '资源管理器'],
  ['废纸篓', '回收站'],
  ['iCloud 目录', '文档目录'],
  ['iCloud', '本地文件夹'],
  ['Dock 栏', '任务栏'],
  ['Dock', '系统托盘'],
  ['Finder', '资源管理器'],
  ['Cmd+Opt+A', 'Ctrl+Alt+A'],
  ['Cmd', 'Ctrl'],
  ['Option', 'Alt'],
]

const files = [
  'src/components/Guide/guideContent.generated.ts',
  'TUTORIAL.md',
]

for (const f of files) {
  const p = path.join(__dirname, '..', f)
  let s = fs.readFileSync(p, 'utf8')
  for (const [a, b] of pairs) s = s.split(a).join(b)
  fs.writeFileSync(p, s, 'utf8')
  console.log('done:', f)
}
