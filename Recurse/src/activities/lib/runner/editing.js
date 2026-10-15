// Pure text edits for the code editor (src/components/CodeEditor.jsx): indenting, comment
// toggling, auto-indent on Enter, bracket and quote pairs, smart Backspace.
// Every helper takes the text and selection and returns an edit, or null for "let the
// browser handle it". An edit replaces value[from, to) with text, then selects
// [selStart, selEnd].

export const INDENT = { javascript: '  ', python: '    ' }
export const COMMENT = { javascript: '//', python: '#' }

const PAIRS = { '(': ')', '[': ']', '{': '}' }
const CLOSERS = new Set([')', ']', '}'])
const QUOTES = { javascript: ['"', "'", '`'], python: ['"', "'"] }

export const indentUnit = (language) => INDENT[language] || INDENT.javascript

function lineStartAt(value, pos) {
  return value.lastIndexOf('\n', pos - 1) + 1
}

function lineEndAt(value, pos) {
  const end = value.indexOf('\n', pos)
  return end === -1 ? value.length : end
}

/** The full lines touched by a selection. A selection ending at a line start skips that line. */
function lineBlock(value, start, end) {
  const from = lineStartAt(value, start)
  let last = end
  if (end > start && value[end - 1] === '\n') last = end - 1
  const to = lineEndAt(value, last)
  return { from, to, lines: value.slice(from, to).split('\n') }
}

const leading = (line) => /^[ \t]*/.exec(line)[0]

/** Tab and Shift+Tab. */
export function indentEdit(value, start, end, language, outdent = false) {
  const unit = indentUnit(language)
  const multiline = value.slice(start, end).includes('\n')
  if (!outdent && !multiline) {
    // Soft tab: pad to the next indent stop.
    const col = start - lineStartAt(value, start)
    const pad = ' '.repeat(unit.length - (col % unit.length))
    return { from: start, to: end, text: pad, selStart: start + pad.length, selEnd: start + pad.length }
  }
  const { from, to, lines } = lineBlock(value, start, end)
  const changes = []
  const out = lines.map((line) => {
    if (outdent) {
      const ws = leading(line)
      let remove = 0
      if (ws.startsWith('\t')) remove = 1
      else remove = Math.min(unit.length, ws.length)
      changes.push(-remove)
      return line.slice(remove)
    }
    if (!line.trim()) {
      changes.push(0)
      return line
    }
    changes.push(unit.length)
    return unit + line
  })
  const text = out.join('\n')
  if (text === value.slice(from, to)) return { from: start, to: start, text: '', selStart: start, selEnd: end }
  // Keep the selection on the same characters.
  const firstShift = changes[0]
  const total = changes.reduce((a, b) => a + b, 0)
  const startCol = start - from
  const selStart = start === end ? Math.max(from, start + firstShift) : Math.max(from, start + (startCol === 0 && !outdent ? 0 : firstShift))
  const selEnd = start === end ? selStart : Math.max(selStart, end + total)
  return { from, to, text, selStart, selEnd }
}

/** Ctrl/Cmd+/ : comment the selected lines, or uncomment them if they all are comments. */
export function toggleCommentEdit(value, start, end, language) {
  const token = COMMENT[language] || COMMENT.javascript
  const { from, to, lines } = lineBlock(value, start, end)
  const filled = lines.filter((l) => l.trim())
  if (!filled.length) return null
  const allCommented = filled.every((l) => l.trimStart().startsWith(token))
  let delta = 0
  let firstDelta = 0
  const out = lines.map((line, i) => {
    if (!line.trim()) return line
    const ws = leading(line)
    let next
    if (allCommented) {
      const rest = line.slice(ws.length + token.length)
      next = ws + (rest.startsWith(' ') ? rest.slice(1) : rest)
    } else {
      const minIndent = Math.min(...filled.map((l) => leading(l).length))
      next = line.slice(0, minIndent) + token + ' ' + line.slice(minIndent)
    }
    if (i === 0) firstDelta = next.length - line.length
    delta += next.length - line.length
    return next
  })
  const text = out.join('\n')
  const selStart = Math.max(from, start + firstDelta)
  const selEnd = start === end ? selStart : Math.max(selStart, end + delta)
  return { from, to, text, selStart, selEnd }
}

const DEDENT_AFTER = /^\s*(return|pass|break|continue|raise)\b/

/** Enter: keep the indentation, add a level after { [ ( or a Python colon. */
export function newlineEdit(value, start, end, language) {
  const unit = indentUnit(language)
  const lineStart = lineStartAt(value, start)
  const before = value.slice(lineStart, start)
  const indent = leading(before)
  const trimmed = before.replace(/\s+$/, '')
  const last = trimmed[trimmed.length - 1]
  const next = value[end]
  let inner = indent
  if (last && PAIRS[last]) inner = indent + unit
  else if (language === 'python' && last === ':' && !trimmed.trimStart().startsWith('#')) inner = indent + unit
  else if (language === 'python' && DEDENT_AFTER.test(before) && indent.length >= unit.length) inner = indent.slice(unit.length)
  if (last && PAIRS[last] === next) {
    // {|} becomes three lines with the cursor on the indented middle one.
    const text = `\n${inner}\n${indent}`
    const caret = start + 1 + inner.length
    return { from: start, to: end, text, selStart: caret, selEnd: caret }
  }
  const text = `\n${inner}`
  const caret = start + text.length
  return { from: start, to: end, text, selStart: caret, selEnd: caret }
}

const isWordChar = (ch) => Boolean(ch) && /[\w$]/.test(ch)

/** Typing a bracket or quote: auto-close it, wrap a selection, or step over a closer. */
export function typeCharEdit(value, start, end, ch, language) {
  const next = value[end]
  const prev = value[start - 1]
  const quotes = QUOTES[language] || QUOTES.javascript
  // Step over a closer that is already there.
  if (start === end && (CLOSERS.has(ch) || quotes.includes(ch)) && next === ch) {
    return { from: start, to: start, text: '', selStart: start + 1, selEnd: start + 1 }
  }
  if (PAIRS[ch]) {
    if (start !== end) {
      const inside = value.slice(start, end)
      return { from: start, to: end, text: ch + inside + PAIRS[ch], selStart: start + 1, selEnd: end + 1 }
    }
    if (next === undefined || /[\s)\]};,:]/.test(next)) {
      return { from: start, to: end, text: ch + PAIRS[ch], selStart: start + 1, selEnd: start + 1 }
    }
    return null
  }
  if (quotes.includes(ch)) {
    if (start !== end) {
      const inside = value.slice(start, end)
      return { from: start, to: end, text: ch + inside + ch, selStart: start + 1, selEnd: end + 1 }
    }
    // Don't pair inside words (don't, it's) or right after another quote or a backslash.
    if (isWordChar(prev) || prev === '\\' || quotes.includes(prev)) return null
    if (next === undefined || /[\s)\]};,:]/.test(next)) {
      return { from: start, to: end, text: ch + ch, selStart: start + 1, selEnd: start + 1 }
    }
  }
  return null
}

/** Backspace: remove an empty pair as one, or a whole indent level from leading spaces. */
export function backspaceEdit(value, start, end, language) {
  if (start !== end || start === 0) return null
  const prev = value[start - 1]
  const next = value[start]
  const quotes = QUOTES[language] || QUOTES.javascript
  if ((PAIRS[prev] && PAIRS[prev] === next) || (quotes.includes(prev) && prev === next)) {
    return { from: start - 1, to: start + 1, text: '', selStart: start - 1, selEnd: start - 1 }
  }
  const lineStart = lineStartAt(value, start)
  const before = value.slice(lineStart, start)
  if (before.length >= 2 && /^ +$/.test(before)) {
    const unit = indentUnit(language).length
    const remove = before.length % unit || unit
    return { from: start - remove, to: start, text: '', selStart: start - remove, selEnd: start - remove }
  }
  return null
}

/** Character offset of the start of 1-based line n, and of its end. */
export function lineRange(value, n) {
  let start = 0
  for (let i = 1; i < n; i++) {
    const next = value.indexOf('\n', start)
    if (next === -1) return { start: value.length, end: value.length }
    start = next + 1
  }
  return { start, end: lineEndAt(value, start) }
}

/** Apply an edit to a string (used by tests and as the editor's fallback path). */
export function applyEditToText(value, edit) {
  return value.slice(0, edit.from) + edit.text + value.slice(edit.to)
}
