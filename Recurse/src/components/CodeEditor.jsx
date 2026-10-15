import { useId, useImperativeHandle, useMemo, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import {
  backspaceEdit,
  indentEdit,
  lineRange,
  modKey,
  newlineEdit,
  toggleCommentEdit,
  typeCharEdit
} from '../activities/lib/runner/editing'
import './CodeEditor.css'

if (!hljs.getLanguage('javascript')) hljs.registerLanguage('javascript', javascript)
if (!hljs.getLanguage('python')) hljs.registerLanguage('python', python)

const LABELS = { javascript: 'JavaScript', python: 'Python' }
// Symbols that are slow to reach on a phone keyboard, one row under the editor on touch screens.
const TOUCH_SYMBOLS = {
  javascript: ['(', ')', '{', '}', '[', ']', ';', '=', "'", '"', '`', '<', '>', '!', '&', '|'],
  python: ['(', ')', '[', ']', ':', '=', "'", '"', '{', '}', '<', '>', '_', '.', ',']
}
const MAX_HIGHLIGHT = 40000

function execEdit(text) {
  try {
    return text ? document.execCommand('insertText', false, text) : document.execCommand('delete', false)
  } catch {
    return false
  }
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function highlight(code, language) {
  if (code.length > MAX_HIGHLIGHT || !hljs.getLanguage(language)) return escapeHtml(code)
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

/**
 * A small code editor: a transparent textarea over a highlighted <pre>, both inside one
 * scroll container so they can never drift apart. Line numbers, soft tabs, auto-indent,
 * bracket and quote pairs, comment toggling, Ctrl/Cmd+Enter to run.
 *
 * Keyboard: Tab indents. Press Escape, then Tab, to move focus out of the editor.
 * ref exposes { focus(), goToLine(n) }.
 */
export default function CodeEditor({
  value,
  onChange,
  language = 'javascript',
  onRun,
  onSubmit,
  label,
  errorLine = null,
  minLines = 8,
  readOnly = false,
  onFocus,
  className = '',
  ref
}) {
  const textareaRef = useRef(null)
  const scrollRef = useRef(null)
  const gutterRef = useRef(null)
  const measureRef = useRef(null)
  const revealFrame = useRef(0)
  const escapeArmed = useRef(false)
  const hintId = useId()
  const text = typeof value === 'string' ? value : ''
  const html = useMemo(() => highlight(text, language), [text, language])
  const lineCount = useMemo(() => text.split('\n').length, [text])
  const badLine = errorLine && errorLine >= 1 && errorLine <= lineCount ? errorLine : null

  const scrollToLine = (n) => {
    const box = scrollRef.current
    const area = textareaRef.current
    if (!box || !area) return
    const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 22
    const top = (n - 1) * lineHeight
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - lineHeight * 2) {
      box.scrollTop = Math.max(0, top - box.clientHeight / 3)
    }
  }

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    goToLine: (n) => {
      const area = textareaRef.current
      if (!area) return
      const { start, end } = lineRange(area.value, n)
      area.focus({ preventScroll: true })
      area.setSelectionRange(start, end)
      scrollToLine(n)
    }
  }))

  // Browsers keep the caret in view, but they do not know the sticky line-number gutter
  // covers the left edge. Nudge the shared scroller so the caret is never hidden under it.
  const revealCaret = () => {
    cancelAnimationFrame(revealFrame.current)
    revealFrame.current = requestAnimationFrame(() => {
      const area = textareaRef.current
      const box = scrollRef.current
      const probe = measureRef.current
      if (!area || !box || !probe || document.activeElement !== area) return
      const pos = area.selectionDirection === 'backward' ? area.selectionStart : area.selectionEnd
      const lineStart = area.value.lastIndexOf('\n', pos - 1) + 1
      const before = area.value.slice(lineStart, pos)
      const columns = before.length + (before.split('\t').length - 1) * 3
      const charWidth = probe.getBoundingClientRect().width / 10 || 8
      const padLeft = parseFloat(getComputedStyle(area).paddingLeft) || 0
      const gutter = gutterRef.current?.offsetWidth || 0
      const x = padLeft + columns * charWidth
      const view = box.clientWidth - gutter
      const margin = charWidth * 2
      if (x - margin < box.scrollLeft) box.scrollLeft = Math.max(0, x - margin)
      else if (x + margin > box.scrollLeft + view) box.scrollLeft = x + margin - view
    })
  }

  const apply = (area, edit) => {
    if (!edit) return
    const current = area.value
    const expected = current.slice(0, edit.from) + edit.text + current.slice(edit.to)
    if (expected !== current) {
      area.setSelectionRange(edit.from, edit.to)
      // execCommand keeps the browser's own undo history working; fall back if it is missing.
      if (!execEdit(edit.text) || area.value !== expected) {
        area.value = expected
        onChange?.(expected)
      }
    }
    area.setSelectionRange(edit.selStart, edit.selEnd)
  }

  const onKeyDown = (event) => {
    const area = event.currentTarget
    const { value: current, selectionStart: start, selectionEnd: end } = area
    const mod = event.metaKey || event.ctrlKey
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
    if (mod && event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey && onSubmit) onSubmit()
      else onRun?.()
      return
    }
    if (event.key === 'Escape') {
      escapeArmed.current = true
      return
    }
    const leaving = escapeArmed.current
    escapeArmed.current = false
    if (readOnly || event.isComposing || event.keyCode === 229) return
    if (mod && (event.key === '/' || event.code === 'Slash')) {
      event.preventDefault()
      apply(area, toggleCommentEdit(current, start, end, language))
      return
    }
    if (event.key === 'Tab' && !mod && !event.altKey) {
      if (leaving) return
      event.preventDefault()
      apply(area, indentEdit(current, start, end, language, event.shiftKey))
      return
    }
    if (mod || event.altKey) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      apply(area, newlineEdit(current, start, end, language))
      return
    }
    if (event.key === 'Backspace') {
      const edit = backspaceEdit(current, start, end, language)
      if (edit) {
        event.preventDefault()
        apply(area, edit)
      }
      return
    }
    if (event.key.length === 1) {
      const edit = typeCharEdit(current, start, end, event.key, language)
      if (edit) {
        event.preventDefault()
        apply(area, edit)
      }
    }
  }

  // On-screen keys (touch screens): the same edits as Tab, Shift+Tab, Ctrl+/ and typed brackets.
  const touchKey = (key) => {
    const area = textareaRef.current
    if (!area || readOnly) return
    if (document.activeElement !== area) area.focus({ preventScroll: true })
    const { value: current, selectionStart: start, selectionEnd: end } = area
    let edit
    if (key === 'indent') edit = indentEdit(current, start, end, language)
    else if (key === 'outdent') edit = indentEdit(current, start, end, language, true)
    else if (key === 'comment') edit = toggleCommentEdit(current, start, end, language)
    else edit = typeCharEdit(current, start, end, key, language) || { from: start, to: end, text: key, selStart: start + key.length, selEnd: start + key.length }
    apply(area, edit)
    revealCaret()
  }
  const keepFocus = (event) => event.preventDefault()

  // The textarea is exactly as big as its content, so it should never scroll by itself.
  // If a browser nudges it anyway (keeping the caret in view), hand the scroll to the container.
  const onTextareaScroll = (event) => {
    const area = event.currentTarget
    const box = scrollRef.current
    if (box && (area.scrollTop || area.scrollLeft)) {
      box.scrollTop += area.scrollTop
      box.scrollLeft += area.scrollLeft
    }
    area.scrollTop = 0
    area.scrollLeft = 0
  }

  const numbers = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1), [lineCount])
  const mod = modKey()

  return (
    <div
      className={`ce${readOnly ? ' ce-readonly' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--ce-digits': String(lineCount).length, '--ce-min-lines': minLines }}
    >
      <div className="ce-scroll" ref={scrollRef}>
        <div className="ce-gutter" aria-hidden="true" ref={gutterRef}>
          {numbers.map((n) => (
            <span key={n} className={n === badLine ? 'ce-num ce-num-error' : 'ce-num'}>
              {n}
            </span>
          ))}
        </div>
        <div className="ce-code">
          {badLine && <div className="ce-error-band" style={{ '--ce-line': badLine }} aria-hidden="true" />}
          <span className="ce-measure" ref={measureRef} aria-hidden="true">
            0123456789
          </span>
          <pre className="ce-pre" aria-hidden="true">
            <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
          </pre>
          <textarea
            ref={textareaRef}
            className="ce-input"
            value={text}
            onChange={(event) => onChange?.(event.target.value)}
            onKeyDown={onKeyDown}
            onScroll={onTextareaScroll}
            onKeyUp={revealCaret}
            onSelect={revealCaret}
            onInput={revealCaret}
            onFocus={onFocus}
            readOnly={readOnly}
            aria-label={label || `${LABELS[language] || 'Code'} editor`}
            aria-describedby={hintId}
            aria-invalid={badLine ? true : undefined}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            translate="no"
            data-gramm="false"
            data-enable-grammarly="false"
            wrap="off"
          />
        </div>
      </div>
      {!readOnly && (
        <div className="ce-keys" role="group" aria-label="Code keys">
          <button type="button" className="ce-key wide" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => touchKey('indent')} title="Indent (Tab)">indent</button>
          <button type="button" className="ce-key wide" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => touchKey('outdent')} title="Outdent (Shift+Tab)">outdent</button>
          <button type="button" className="ce-key" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => touchKey('comment')} title="Comment or uncomment the line">
            {language === 'python' ? '#' : '//'}
          </button>
          {(TOUCH_SYMBOLS[language] || TOUCH_SYMBOLS.javascript).map((ch) => (
            <button key={ch} type="button" className="ce-key" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => touchKey(ch)} aria-label={`Type ${ch}`}>
              {ch}
            </button>
          ))}
        </div>
      )}
      <p id={hintId} className="sr-only">
        Tab indents. Press Escape, then Tab, to move focus out of the editor. {mod} plus Enter runs the code.
        {onSubmit ? ` ${mod} plus Shift plus Enter submits.` : ''} {mod} plus slash comments a line.
      </p>
    </div>
  )
}
