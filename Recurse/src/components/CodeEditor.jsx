import { useId, useImperativeHandle, useMemo, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import {
  backspaceEdit,
  indentEdit,
  lineRange,
  newlineEdit,
  toggleCommentEdit,
  typeCharEdit
} from '../activities/lib/runner/editing'
import './CodeEditor.css'

if (!hljs.getLanguage('javascript')) hljs.registerLanguage('javascript', javascript)
if (!hljs.getLanguage('python')) hljs.registerLanguage('python', python)

const LABELS = { javascript: 'JavaScript', python: 'Python' }
const MAX_HIGHLIGHT = 40000

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function highlight(code, language) {
  if (code.length > MAX_HIGHLIGHT || !hljs.getLanguage(language)) return escapeHtml(code)
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')

/** "Ctrl" or "⌘" for shortcut hints. */
export function modKey() {
  return isMac() ? '⌘' : 'Ctrl'
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

  const apply = (area, edit) => {
    if (!edit) return
    const current = area.value
    const expected = current.slice(0, edit.from) + edit.text + current.slice(edit.to)
    if (expected !== current) {
      area.setSelectionRange(edit.from, edit.to)
      // execCommand keeps the browser's own undo history working; fall back if it is missing.
      let ok = false
      try {
        ok = edit.text ? document.execCommand('insertText', false, edit.text) : document.execCommand('delete', false)
      } catch {
        ok = false
      }
      if (!ok || area.value !== expected) {
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
        <div className="ce-gutter" aria-hidden="true">
          {numbers.map((n) => (
            <span key={n} className={n === badLine ? 'ce-num ce-num-error' : 'ce-num'}>
              {n}
            </span>
          ))}
        </div>
        <div className="ce-code">
          {badLine && <div className="ce-error-band" style={{ '--ce-line': badLine }} aria-hidden="true" />}
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
      <p id={hintId} className="sr-only">
        Tab indents. Press Escape, then Tab, to move focus out of the editor. {mod} plus Enter runs the code.
        {onSubmit ? ` ${mod} plus Shift plus Enter submits.` : ''} {mod} plus slash comments a line.
      </p>
    </div>
  )
}
