import { useId, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronRight, ClipboardCopy, FileJson, RotateCcw, Wand2, X } from 'lucide-react'
import { feedbackComplete, feedbackCorrect, feedbackWrong, floatText } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { parseJson, errorExcerpt, formatPath, pythonPath, pathKey, preview, getNode, TYPE_INFO, TYPES, SAMPLE_JSON, SAMPLE_QUIZ, generateQuiz, gradeQuestion } from '../lib/json-explorer.js'
import './json-explorer.css'

const MAX_CHARS = 200000
const ROOT_NAME = 'response'
const TYPE_SHORT = { object: 'obj', array: 'arr', string: 'str', number: 'num', boolean: 'bool', null: 'null' }

function initialExpanded(root) {
  const set = new Set([pathKey([])])
  for (const c of root?.children ?? []) if (c.children && c.children.length <= 8) set.add(pathKey(c.path))
  return set
}

/** Flatten the visible part of the tree into rows. */
function visibleRows(root, expanded) {
  const rows = []
  const visit = (node, depth) => {
    rows.push({ node, depth })
    if (node.children && expanded.has(pathKey(node.path))) node.children.forEach((c) => visit(c, depth + 1))
  }
  if (root) visit(root, 0)
  return rows
}

function readDoc(text) {
  return text.length > MAX_CHARS ? { ok: false, error: { message: `That is over ${MAX_CHARS / 1000}k characters. Paste a smaller document.`, line: 1, column: 1 } } : parseJson(text)
}

function containerSummary(node) {
  const n = node.children.length
  return node.type === 'array' ? `[ ${n} ${n === 1 ? 'item' : 'items'} ]` : `{ ${n} ${n === 1 ? 'key' : 'keys'} }`
}

/** Collapsible, keyboard-navigable JSON tree (roving tabindex, arrow keys like a file tree). */
function JsonTree({ root, expanded, setExpanded, selected, onSelect, onHover, revealed }) {
  const rows = useMemo(() => visibleRows(root, expanded), [root, expanded])
  const listRef = useRef(null)
  const [focusKey, setFocusKey] = useState(null)
  const activeKey = rows.some((r) => pathKey(r.node.path) === focusKey) ? focusKey : rows.some((r) => pathKey(r.node.path) === selected) ? selected : pathKey([])

  const focusRow = (i) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))]
    if (!r) return
    const key = pathKey(r.node.path)
    setFocusKey(key)
    onHover(r.node.path)
    const sel = window.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&')
    listRef.current?.querySelector(`[data-key="${sel}"]`)?.focus()
  }
  const toggle = (node) => {
    const key = pathKey(node.path)
    sfx.tick()
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const onKeyDown = (e, i, node) => {
    const open = node.children && expanded.has(pathKey(node.path))
    if (e.key === 'ArrowDown') focusRow(i + 1)
    else if (e.key === 'ArrowUp') focusRow(i - 1)
    else if (e.key === 'Home') focusRow(0)
    else if (e.key === 'End') focusRow(rows.length - 1)
    else if (e.key === 'ArrowRight') {
      if (node.children && !open) toggle(node)
      else if (open && node.children.length) focusRow(i + 1)
    } else if (e.key === 'ArrowLeft') {
      if (open) toggle(node)
      else if (node.path.length) focusRow(rows.findIndex((r) => pathKey(r.node.path) === pathKey(node.path.slice(0, -1))))
    } else if (e.key === 'Enter' || e.key === ' ') onSelect(node)
    else return
    e.preventDefault()
  }

  return (
    <div className="json-tree" role="tree" aria-label="JSON tree" ref={listRef} onMouseLeave={() => onHover(null)}>
      {rows.map(({ node, depth }, i) => {
        const key = pathKey(node.path)
        const isContainer = Boolean(node.children)
        const open = isContainer && expanded.has(key)
        return (
          <div
            key={key}
            data-key={key}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={isContainer ? open : undefined}
            aria-selected={selected === key}
            tabIndex={activeKey === key ? 0 : -1}
            className={`json-row${selected === key ? ' selected' : ''}${revealed === key ? ' revealed' : ''}`}
            style={{ '--depth': depth }}
            onClick={() => {
              setFocusKey(key)
              onSelect(node)
            }}
            onMouseEnter={() => onHover(node.path)}
            onFocus={() => onHover(node.path)}
            onKeyDown={(e) => onKeyDown(e, i, node)}
          >
            {isContainer ? (
              <button
                type="button"
                tabIndex={-1}
                className={`json-toggle${open ? ' open' : ''}`}
                aria-label={open ? 'Collapse' : 'Expand'}
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(node)
                }}
              >
                <ChevronRight size={14} />
              </button>
            ) : (
              <span className="json-toggle-space" aria-hidden="true" />
            )}
            <span className={node.path.length === 0 ? 'json-rootname' : typeof node.key === 'number' ? 'json-index' : 'json-key'}>{node.path.length === 0 ? ROOT_NAME : node.key}</span>
            <span className="json-colon">:</span>
            <span className={`json-value v-${node.type}`}>{isContainer ? (open ? containerSummary(node) : preview(node)) : node.raw}</span>
            <span className={`json-type v-${node.type}`}>{TYPE_SHORT[node.type]}</span>
          </div>
        )
      })}
    </div>
  )
}

function PathBar({ root, path, hidden }) {
  const btnRef = useRef(null)
  const node = path ? getNode(root, path) : null
  if (hidden) return <div className="json-pathbar small muted">Find the node in the tree, then click it. The path stays hidden for this one.</div>
  if (!node) return <div className="json-pathbar small subtle">Hover or select a node to see its path.</div>
  const dot = formatPath(path, ROOT_NAME)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dot)
      sfx.pop()
      floatText(btnRef.current, 'Copied')
    } catch {
      sfx.error()
    }
  }
  return (
    <div className="json-pathbar" aria-live="polite">
      <div className="json-path-main">
        <code className="json-path">{dot}</code>
        <span className={`json-type-tag v-${node.type}`}>{TYPE_INFO[node.type].label}</span>
        <button type="button" ref={btnRef} className="json-copy" onClick={copy} aria-label="Copy path" title="Copy path">
          <ClipboardCopy size={14} />
        </button>
      </div>
      <div className="json-path-sub xsmall subtle">
        In Python: <code>{pythonPath(path)}</code> ({TYPE_INFO[node.type].python}). {TYPE_INFO[node.type].note}.
      </div>
    </div>
  )
}

function QuizCard({ quiz, cardRef, onSubmit, onNext, onRestart }) {
  const [input, setInput] = useState('')
  const total = quiz.questions.length
  const score = quiz.answers.filter(Boolean).length

  if (!total) {
    return (
      <div className="w-stage json-quiz-card" ref={cardRef}>
        <p className="small">This document is too small for a quiz. Load the sample or paste something with nested objects and arrays.</p>
      </div>
    )
  }
  if (quiz.index >= total) {
    return (
      <div className="w-stage json-quiz-card json-quiz-done" ref={cardRef}>
        <p className="json-score tabular">
          {score} / {total}
        </p>
        <p className="small">{score === total ? 'Perfect. You can read an API response like a pro.' : 'Nice work. Every response you read makes the next one easier.'}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onRestart}>
          <RotateCcw size={14} /> Quiz again
        </button>
      </div>
    )
  }

  const q = quiz.questions[quiz.index]
  const fb = quiz.feedback
  const submitText = (e) => {
    e.preventDefault()
    if (input.trim()) onSubmit(input)
  }

  return (
    <div className="w-stage json-quiz-card" ref={cardRef}>
      <div className="json-quiz-top">
        <span className="chip outline tabular">
          Question {quiz.index + 1} of {total}
        </span>
        {quiz.combo >= 2 && <span className="chip accent">{quiz.combo} in a row</span>}
        <span className="grow" />
        <span className="xsmall subtle tabular">{score} correct</span>
      </div>
      <p className="json-question">{q.prompt}</p>

      {(q.kind === 'value' || q.kind === 'count') && (
        <form className="json-answer" onSubmit={submitText}>
          <input
            className="input mono"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={Boolean(fb)}
            placeholder={q.kind === 'count' ? 'a number' : 'type the value'}
            aria-label="Your answer"
            inputMode={q.kind === 'count' ? 'numeric' : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={Boolean(fb) || !input.trim()}>
            <Check size={15} /> Check
          </button>
        </form>
      )}
      {q.kind === 'click' && !fb && <p className="small muted json-click-note">Click (or press Enter on) the node in the tree below.</p>}
      {q.kind === 'type' && (
        <div className="json-choices" role="group" aria-label="Types">
          {TYPES.map((t) => (
            <button key={t} type="button" className={`json-choice v-${t}${fb && fb.expected === t ? ' right' : ''}`} disabled={Boolean(fb)} onClick={() => onSubmit(t)}>
              <i className={`json-swatch v-${t}`} aria-hidden="true" /> {t}
            </button>
          ))}
        </div>
      )}
      {q.kind === 'choice' && (
        <div className="json-choices stacked" role="group" aria-label="Paths">
          {q.choices.map((c) => (
            <button key={c} type="button" className={`json-choice mono${fb && fb.expected === c ? ' right' : ''}`} disabled={Boolean(fb)} onClick={() => onSubmit(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite">
        {fb && (
          <div className={`callout ${fb.correct ? 'good' : 'bad'} json-feedback`}>
            {fb.correct ? <Check size={16} /> : <X size={16} />}
            <span>
              <strong>{fb.correct ? 'Correct.' : `Not quite. The answer is ${fb.expected}.`}</strong> {q.explain ?? `It lives at ${formatPath(q.path, ROOT_NAME)}, highlighted in the tree.`}
            </span>
          </div>
        )}
      </div>
      {fb && (
        <div className="row end">
          <button type="button" className="btn btn-primary btn-sm" onClick={onNext} autoFocus>
            {quiz.index + 1 < total ? 'Next question' : 'See my score'} <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Explore JSON as a tree, read paths and types, then take a short quiz. */
export default function JsonExplorer({ props, onComplete }) {
  const [doc, setDoc] = useState(() => {
    const text = typeof props.json === 'string' && props.json.trim() ? props.json : props.json && typeof props.json === 'object' ? JSON.stringify(props.json, null, 2) : SAMPLE_JSON
    const parsed = readDoc(text)
    return { text, parsed, good: parsed.ok ? parsed.root : parseJson(SAMPLE_JSON).root }
  })
  const [expanded, setExpanded] = useState(() => initialExpanded(doc.good))
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [mode, setMode] = useState('explore')
  const [quiz, setQuiz] = useState(null)
  const cardRef = useRef(null)
  const textId = useId()
  const reported = useRef(false)

  const { text, parsed } = doc
  const root = doc.good
  const treeRoot = mode === 'quiz' && quiz ? quiz.root : root
  const question = mode === 'quiz' && quiz ? quiz.questions[quiz.index] : null
  const answered = Boolean(quiz?.feedback)
  const shownPath = hovered ?? (selected ? JSON.parse(selected) : null)

  const edit = (value, { reset = false } = {}) => {
    const p = readDoc(value)
    setDoc((d) => ({ text: value, parsed: p, good: p.ok ? p.root : d.good }))
    if (reset && p.ok) {
      setExpanded(initialExpanded(p.root))
      setSelected(null)
    }
  }

  const reveal = (path) => {
    setExpanded((s) => {
      const next = new Set(s)
      for (let i = 0; i < path.length; i++) next.add(pathKey(path.slice(0, i)))
      return next
    })
    setSelected(pathKey(path))
  }

  const startQuiz = () => {
    sfx.flip()
    const isSample = text.trim() === SAMPLE_JSON.trim() && parsed.ok
    const seed = (quiz?.seed ?? 0) + 1
    const questions = isSample ? SAMPLE_QUIZ : generateQuiz(root, { seed: seed * 7919, rootName: ROOT_NAME })
    reported.current = false
    setQuiz({ root, questions, index: 0, answers: [], seed, combo: 0, feedback: null })
    setMode('quiz')
    setSelected(null)
    setHovered(null)
    setExpanded(initialExpanded(root))
  }

  const submit = (answer) => {
    if (!quiz || quiz.feedback) return
    const q = quiz.questions[quiz.index]
    const result = gradeQuestion(quiz.root, q, answer)
    if (result.correct) feedbackCorrect(cardRef.current, { combo: quiz.combo })
    else feedbackWrong(cardRef.current)
    reveal(q.path)
    setQuiz({ ...quiz, answers: [...quiz.answers, result.correct], combo: result.correct ? quiz.combo + 1 : 0, feedback: result })
  }

  const next = () => {
    sfx.flip()
    const index = quiz.index + 1
    setQuiz({ ...quiz, index, feedback: null })
    setSelected(null)
    setExpanded(initialExpanded(quiz.root))
    if (index >= quiz.questions.length && !reported.current) {
      reported.current = true
      const score = quiz.answers.filter(Boolean).length
      feedbackComplete()
      onComplete({ score: score / quiz.questions.length, detail: `${score} of ${quiz.questions.length} correct` })
    }
  }

  const onTreeSelect = (node) => {
    if (question?.kind === 'click' && !answered) {
      submit(node.path)
      return
    }
    sfx.tap()
    setSelected(pathKey(node.path))
  }

  const excerpt = !parsed.ok && !parsed.error.empty ? errorExcerpt(text, parsed.error) : null

  return (
    <div className="json">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'explore'} onClick={() => setMode('explore')}>
            Explore
          </button>
          <button type="button" aria-pressed={mode === 'quiz'} onClick={() => (quiz ? setMode('quiz') : startQuiz())}>
            Quiz
          </button>
        </div>
        <span className="grow" />
        {mode === 'explore' && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(SAMPLE_JSON, { reset: true })}>
              <FileJson size={14} /> Sample
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!parsed.ok} onClick={() => parsed.ok && edit(JSON.stringify(parsed.value, null, 2))}>
              <Wand2 size={14} /> Format
            </button>
          </>
        )}
        {mode === 'quiz' && quiz && quiz.index < quiz.questions.length && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={startQuiz}>
            <RotateCcw size={14} /> Restart quiz
          </button>
        )}
      </div>

      {mode === 'explore' && (
        <div className="json-editor">
          <label className="json-label" htmlFor={textId}>
            JSON text <span className="xsmall subtle">edit it, or paste your own</span>
          </label>
          <textarea id={textId} className="textarea mono json-text" value={text} onChange={(e) => edit(e.target.value)} rows={6} spellCheck={false} />
          {excerpt ? (
            <div className="callout bad json-error" role="status">
              <X size={16} />
              <div className="json-error-body">
                <strong>
                  Line {parsed.error.line}, column {parsed.error.column}:
                </strong>{' '}
                {parsed.error.message}
                <pre className="json-excerpt">
                  {excerpt.line}
                  {'\n'}
                  <span className="json-caret">{excerpt.caret}</span>
                </pre>
                <span className="xsmall subtle">The tree below shows the last valid version.</span>
              </div>
            </div>
          ) : (
            <p className="xsmall subtle json-valid">{parsed.ok ? 'Valid JSON. Click a node to pin its path; arrow keys move through the tree.' : parsed.error.message}</p>
          )}
        </div>
      )}

      {mode === 'quiz' && quiz && <QuizCard key={`${quiz.seed}-${quiz.index}`} quiz={quiz} cardRef={cardRef} onSubmit={submit} onNext={next} onRestart={startQuiz} />}

      <PathBar root={treeRoot} path={shownPath} hidden={question?.kind === 'click' && !answered} />
      <JsonTree root={treeRoot} expanded={expanded} setExpanded={setExpanded} selected={selected} onSelect={onTreeSelect} onHover={setHovered} revealed={answered ? pathKey(question.path) : null} />
      <div className="w-legend json-legend">
        {TYPES.map((t) => (
          <span key={t}>
            <i className={`json-swatch v-${t}`} aria-hidden="true" /> {TYPE_INFO[t].label}
          </span>
        ))}
      </div>
    </div>
  )
}
