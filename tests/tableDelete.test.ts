import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { deleteTargetTable, findTableTarget } from '@/components/Editor/tableActions'

let editor: Editor
const table = '<table><tbody><tr><td><p>内容</p></td><td><p>另一格</p></td></tr></tbody></table>'
function createEditor(content: string) {
  editor = new Editor({ extensions: [StarterKit, Table.configure({ resizable: true }), TableRow, TableCell, TableHeader], content })
  return editor
}
afterEach(() => editor?.destroy())

describe('删除表格块', () => {
  it('文档只有表格时删除整个表格，保留一个可编辑空段落，并可撤销', () => {
    const ed = createEditor(table)
    expect(deleteTargetTable(ed, findTableTarget(ed, ed.view.dom.querySelector('td'))!)).toBe(true)
    expect(ed.getHTML()).toBe('<p></p>')
    expect(ed.commands.undo()).toBe(true)
    expect(ed.getHTML()).toContain('<table')
    expect(ed.getText()).toContain('另一格')
  })

  it('删除中间表格不影响前后正文', () => {
    const ed = createEditor('<p>前文</p>' + table + '<p>后文</p>')
    deleteTargetTable(ed, findTableTarget(ed, ed.view.dom.querySelector('td'))!)
    expect(ed.getHTML()).toBe('<p>前文</p><p>后文</p>')
  })

  it('锁定的编辑器不能删除', () => {
    const ed = createEditor(table)
    ed.setEditable(false)
    expect(deleteTargetTable(ed, findTableTarget(ed, ed.view.dom.querySelector('td'))!)).toBe(false)
    expect(ed.getHTML()).toContain('<table')
  })

  it('删除右键命中的第二个表格，而非光标所在的第一个表格', () => {
    const ed = createEditor(table + '<p>间隔</p>' + table.replace('另一格', '第二张'))
    const target = findTableTarget(ed, ed.view.dom.querySelectorAll('td')[3])!
    ed.commands.setTextSelection(4)
    expect(deleteTargetTable(ed, target)).toBe(true)
    expect(ed.getHTML().match(/<table/g)).toHaveLength(1)
    expect(ed.getText()).toContain('另一格')
    expect(ed.getText()).not.toContain('第二张')
  })

  it('文档变化导致目标失效时不误删，表格外不显示操作', () => {
    const ed = createEditor('<p>正文</p>' + table)
    expect(findTableTarget(ed, ed.view.dom.querySelector('p'))).toBeNull()
    const target = findTableTarget(ed, ed.view.dom.querySelector('td'))!
    ed.commands.insertContentAt(1, '新增')
    expect(deleteTargetTable(ed, target)).toBe(false)
    expect(ed.getHTML()).toContain('<table')
  })
})
