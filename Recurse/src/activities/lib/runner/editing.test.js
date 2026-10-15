import { describe, expect, it } from 'vitest'
import { applyEditToText, backspaceEdit, indentEdit, lineRange, newlineEdit, toggleCommentEdit, typeCharEdit } from './editing.js'

/** Run an edit on text with a caret marked by | (or a selection marked by two |). */
function run(fn, marked, ...args) {
  const first = marked.indexOf('|')
  const second = marked.indexOf('|', first + 1)
  const value = marked.replace(/\|/g, '')
  const start = first
  const end = second === -1 ? first : second - 1
  const edit = fn(value, start, end, ...args)
  if (!edit) return null
  const text = applyEditToText(value, edit)
  if (edit.selStart === edit.selEnd) return text.slice(0, edit.selStart) + '|' + text.slice(edit.selStart)
  return text.slice(0, edit.selStart) + '|' + text.slice(edit.selStart, edit.selEnd) + '|' + text.slice(edit.selEnd)
}

describe('indent and outdent', () => {
  it('inserts a soft tab to the next stop', () => {
    expect(run(indentEdit, 'a|b', 'javascript')).toBe('a |b')
    expect(run(indentEdit, '|x', 'python')).toBe('    |x')
  })
  it('indents and outdents selected lines', () => {
    expect(run(indentEdit, '|a\nb|', 'javascript')).toBe('|  a\n  b|')
    expect(run(indentEdit, '  |a\n  b|', 'javascript', true)).toBe('|a\nb|')
    expect(run(indentEdit, '    x|', 'python', true)).toBe('x|')
  })
})

describe('comments', () => {
  it('comments and uncomments lines', () => {
    expect(run(toggleCommentEdit, '|a\n  b|', 'javascript')).toBe('|// a\n//   b|')
    expect(run(toggleCommentEdit, '|// a\n// b|', 'javascript')).toBe('|a\nb|')
    expect(run(toggleCommentEdit, '    x = 1|', 'python')).toBe('    # x = 1|')
  })
})

describe('enter', () => {
  it('keeps indentation', () => {
    expect(run(newlineEdit, '  a|', 'javascript')).toBe('  a\n  |')
  })
  it('adds a level after an opening brace and splits an empty pair', () => {
    expect(run(newlineEdit, 'if (x) {|}', 'javascript')).toBe('if (x) {\n  |\n}')
    expect(run(newlineEdit, 'f(|', 'javascript')).toBe('f(\n  |')
  })
  it('adds a level after a Python colon and dedents after return', () => {
    expect(run(newlineEdit, 'def f():|', 'python')).toBe('def f():\n    |')
    expect(run(newlineEdit, '    return 1|', 'python')).toBe('    return 1\n|')
  })
})

describe('pairs', () => {
  it('auto-closes brackets and quotes', () => {
    expect(run(typeCharEdit, 'f|', '(', 'javascript')).toBe('f(|)')
    expect(run(typeCharEdit, 'x = |', '"', 'python')).toBe('x = "|"')
  })
  it('steps over a closer instead of doubling it', () => {
    expect(run(typeCharEdit, 'f(|)', ')', 'javascript')).toBe('f()|')
    expect(run(typeCharEdit, '"a|"', '"', 'javascript')).toBe('"a"|')
  })
  it('does not pair a quote inside a word', () => {
    expect(run(typeCharEdit, 'don|', "'", 'python')).toBeNull()
  })
  it('wraps a selection', () => {
    expect(run(typeCharEdit, '|abc|', '[', 'javascript')).toBe('[|abc|]')
  })
  it('backspace removes an empty pair and whole indent levels', () => {
    expect(run(backspaceEdit, 'f(|)', 'javascript')).toBe('f|')
    expect(run(backspaceEdit, '    |', 'python')).toBe('|')
    expect(run(backspaceEdit, '      |', 'python')).toBe('    |')
    expect(run(backspaceEdit, 'ab|', 'python')).toBeNull()
  })
})

describe('lineRange', () => {
  it('finds a line by number', () => {
    expect(lineRange('a\nbc\nd', 2)).toEqual({ start: 2, end: 4 })
    expect(lineRange('a', 5)).toEqual({ start: 1, end: 1 })
  })
})
