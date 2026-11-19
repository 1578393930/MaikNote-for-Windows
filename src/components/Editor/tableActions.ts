import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface TableTarget {
  pos: number
  node: ProseMirrorNode
}

// 根据右键实际命中的表格定位，不能依赖可能仍停在其他段落的光标。
export function findTableTarget(editor: Editor, target: EventTarget | null): TableTarget | null {
  if (!(target instanceof HTMLElement)) return null
  const table = target.closest('table')
  if (!table || !editor.view.dom.contains(table)) return null
  const pos = editor.view.posAtDOM(table, 0)
  const $pos = editor.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'table') {
      return { pos: $pos.before(depth), node: $pos.node(depth) }
    }
  }
  const node = editor.state.doc.nodeAt(pos)
  return node?.type.name === 'table' ? { pos, node } : null
}

export function deleteTargetTable(editor: Editor, target: TableTarget): boolean {
  if (!editor.isEditable || editor.state.doc.nodeAt(target.pos) !== target.node) return false
  editor.view.dispatch(editor.state.tr.delete(target.pos, target.pos + target.node.nodeSize).scrollIntoView())
  return true
}
