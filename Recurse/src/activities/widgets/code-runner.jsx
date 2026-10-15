import { useEffect, useRef, useState } from 'react'
import { CircleAlert, Eraser, Loader2, Play, RotateCcw, Square, Check } from 'lucide-react'
import CodeEditor from '../../components/CodeEditor'
import { Inline } from '../../components/RichText'
import { feedbackCorrect } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { loadPython, retryPython, runProgram, DEFAULT_TIME_LIMIT, TIMEOUT_MESSAGE, LANGUAGE_LABELS } from '../lib/runner'
import { errorHint } from '../lib/runner/tests'
import { modKey } from '../lib/runner/editing'
import { usePythonStatus, pythonStatusText } from '../lib/runner/usePython'
import './code-runner.css'

const DEFAULT_CODE = {
  javascript: "const name = 'Recurse'\nconsole.log(`Hello, ${name}!`)\n\nfor (let i = 1; i <= 3; i++) {\n  console.log('Count', i)\n}\n",
  python: "name = 'Recurse'\nprint(f'Hello, {name}!')\n\nfor i in range(1, 4):\n    print('Count', i)\n"
}

/** Trailing spaces and line endings never decide whether output matches. */
const normalizeOutput = (text) =>
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim()

function firstDifference(actual, expected) {
  const a = actual.split('\n')
  const e = expected.split('\n')
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] !== e[i]) return { line: i + 1, actual: a[i], expected: e[i] }
  }
  return null
}

/** Merge streamed chunks into display lines, joining consecutive text from the same stream. */
function appendChunks(list, chunks) {
  const next = list.slice()
  for (const [stream, text] of chunks) {
    if (!text) continue
    const last = next[next.length - 1]
    if (last && last.stream === stream) next[next.length - 1] = { stream, text: last.text + text }
    else next.push({ stream, text })
  }
  return next
}

/** Edit and run a short JavaScript or Python program; output streams into a console. */
export default function CodeRunner({ props, onComplete }) {
  const language = props.language === 'python' ? 'python' : 'javascript'
  const initialCode = typeof props.code === 'string' ? props.code : DEFAULT_CODE[language]
  const expected = typeof props.expectOutput === 'string' ? props.expectOutput : null
  const [code, setCode] = useState(initialCode)
  const [lines, setLines] = useState([])
  const [running, setRunning] = useState(false)
  const [errorLine, setErrorLine] = useState(null)
  const [announce, setAnnounce] = useState('')
  const [steps, setSteps] = useState({ ran: false, edited: false, again: false })
  const stepsRef = useRef(steps)
  const [match, setMatch] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const python = usePythonStatus()
  const jobRef = useRef(null)
  const outRef = useRef('')
  const screenRef = useRef(null)
  const consoleRef = useRef(null)
  const editorRef = useRef(null)
  const completedRef = useRef(false)

  useEffect(() => () => jobRef.current?.cancel(), [])

  useEffect(() => {
    const el = screenRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const complete = (detail) => {
    if (completedRef.current) return
    completedRef.current = true
    onComplete?.({ score: 1, detail })
  }

  const updateSteps = (next) => {
    stepsRef.current = next
    setSteps(next)
  }

  const changeCode = (next) => {
    setCode(next)
    setErrorLine(null)
    const s = stepsRef.current
    if (s.ran && !s.edited) updateSteps({ ...s, edited: true })
  }

  const run = async () => {
    if (jobRef.current) return
    sfx.tap()
    setLines([])
    setErrorLine(null)
    setMatch(null)
    setAnnounce('Running')
    outRef.current = ''
    setRunning(true)
    const job = runProgram({
      language,
      code,
      onOutput: (chunks) => {
        for (const [stream, text] of chunks) if (stream === 'out') outRef.current += text
        setLines((list) => appendChunks(list, chunks))
      }
    })
    jobRef.current = job
    const result = await job.promise
    if (jobRef.current !== job) return
    jobRef.current = null
    setRunning(false)
    if (result.status === 'cancelled') {
      setLines((list) => appendChunks(list, [['info', '\nStopped.\n']]))
      setAnnounce('Stopped')
      return
    }
    if (result.status === 'unavailable') {
      setLines((list) => appendChunks(list, [['err', `${result.fatal?.message || 'The runner is not available.'}\n`]]))
      setAnnounce(result.fatal?.message || 'The runner is not available.')
      return
    }

    const problem = result.status === 'timeout' ? { message: TIMEOUT_MESSAGE, line: null, trace: [] } : result.fatal || result.error
    if (problem) {
      const where = problem.line ? `Line ${problem.line}: ` : ''
      // The console shows plain text, so drop the inline-code backticks hints use elsewhere.
      const hint = result.status === 'timeout' ? `Stopped after ${DEFAULT_TIME_LIMIT / 1000} seconds. Look for a loop whose condition never becomes false.` : errorHint(problem.message, language).replace(/`/g, '')
      const extra = problem.trace?.length > 1 ? `\n${problem.trace.map((t) => `  at ${t}`).join('\n')}` : ''
      setLines((list) => appendChunks(list, [['err', `${list.length && !list[list.length - 1].text.endsWith('\n') ? '\n' : ''}${where}${problem.message}${extra}\n`], ...(hint ? [['info', `${hint}\n`]] : [])]))
      setErrorLine(problem.line || null)
      setAnnounce(`${where}${problem.message}`)
      sfx.error()
    } else {
      setLines((list) => appendChunks(list, [['info', `${list.length ? '\n' : 'No output. Use ' + (language === 'python' ? 'print()' : 'console.log()') + ' to show values.\n'}Finished in ${result.ms} ms\n`]]))
      setAnnounce(`Finished in ${result.ms} milliseconds`)
    }

    if (expected !== null) {
      const actual = normalizeOutput(outRef.current)
      const want = normalizeOutput(expected)
      if (!problem && actual === want) {
        setMatch({ ok: true })
        feedbackCorrect(consoleRef.current)
        complete('Output matches')
      } else {
        setMatch({ ok: false, diff: problem ? null : firstDifference(actual, want) })
      }
      return
    }
    const s = stepsRef.current
    if (!s.ran) updateSteps({ ...s, ran: true })
    else if (s.edited && !s.again) {
      updateSteps({ ...s, again: true })
      feedbackCorrect(consoleRef.current)
      complete('Ran, edited and ran again')
    }
  }

  const stop = () => {
    jobRef.current?.cancel()
  }

  const reset = () => {
    jobRef.current?.cancel()
    setCode(initialCode)
    setLines([])
    setErrorLine(null)
    setMatch(null)
    setConfirmReset(false)
    sfx.flip()
    editorRef.current?.focus()
  }

  const loadingText = language === 'python' ? pythonStatusText(python) : ''
  const pyError = language === 'python' && python.state === 'error' ? python.message : ''
  const mod = modKey()
  const tasks = [
    { done: steps.ran, text: 'Run the code' },
    { done: steps.edited, text: 'Change something: a value, a word, a line' },
    { done: steps.again, text: 'Run it again and compare the output' }
  ]

  return (
    <div className="code-runner">
      {props.task && (
        <p className="code-runner-task">
          <Inline text={props.task} />
        </p>
      )}
      <div className="w-toolbar code-runner-toolbar">
        <span className="chip outline">{LANGUAGE_LABELS[language]}</span>
        <span className="grow" />
        {confirmReset ? (
          <span className="row code-runner-confirm" role="group" aria-label="Confirm reset">
            <span className="xsmall muted">Replace your code with the original?</span>
            <button type="button" className="btn btn-sm btn-danger" onClick={reset}>Reset</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(true)} disabled={code === initialCode}>
            <RotateCcw size={14} /> Reset code
          </button>
        )}
      </div>

      <CodeEditor
        ref={editorRef}
        value={code}
        onChange={changeCode}
        language={language}
        onRun={run}
        errorLine={errorLine}
        minLines={Math.min(14, Math.max(6, initialCode.split('\n').length + 1))}
        onFocus={language === 'python' ? () => loadPython().catch(() => {}) : undefined}
      />

      <div className="row wrap code-runner-actions">
        {running ? (
          <button type="button" className="btn btn-primary" onClick={stop}>
            <Square size={14} /> Stop
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={run}>
            <Play size={15} /> Run <span className="kbd code-runner-kbd" aria-hidden="true">{mod} Enter</span>
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => setLines([])} disabled={!lines.length || running}>
          <Eraser size={15} /> Clear output
        </button>
      </div>

      {pyError && (
        <div className="callout bad code-runner-pyerror" role="alert">
          <CircleAlert size={18} />
          <div className="grow">
            <p>{pyError}</p>
            <button type="button" className="btn btn-sm" onClick={() => retryPython()}>Try again</button>
          </div>
        </div>
      )}

      <div className="terminal code-runner-console" ref={consoleRef}>
        <div className="terminal-bar">
          <span className="dot" aria-hidden="true" />
          <span className="dot" aria-hidden="true" />
          <span className="dot" aria-hidden="true" />
          <span>Output</span>
          <span className="grow" />
          {running && <Loader2 size={12} className="spin" aria-hidden="true" />}
          {running && <span>{loadingText || 'Running'}</span>}
        </div>
        <div className="terminal-screen code-runner-screen" ref={screenRef} tabIndex={0} aria-label="Program output">
          {loadingText && running && !lines.length && <p className="terminal-line terminal-dim">{loadingText}...</p>}
          {!lines.length && !running && <p className="terminal-line terminal-dim">Press Run to see the output here.</p>}
          {lines.map((line, i) => (
            <span key={i} className={`code-runner-${line.stream}`}>
              {line.text}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>

      {expected !== null ? (
        <div className="code-runner-expect">
          <div className="code-runner-expect-head">
            <span className="xsmall subtle">Expected output</span>
            {match?.ok && (
              <span className="chip good">
                <Check size={12} /> Matches
              </span>
            )}
          </div>
          <pre className="code-runner-expect-text">{expected}</pre>
          {match && !match.ok && (
            <p className="w-feedback bad" aria-live="polite">
              {match.diff
                ? `Not quite yet. Line ${match.diff.line} should be "${match.diff.expected ?? ''}" but your program printed "${match.diff.actual ?? '(nothing)'}".`
                : 'Not quite yet. Fix the error above, then run again.'}
            </p>
          )}
          {match?.ok && <p className="w-feedback good" aria-live="polite">Your output matches. Nice work.</p>}
        </div>
      ) : (
        <ul className="w-tasks">
          {tasks.map((task) => (
            <li key={task.text} className={`w-task${task.done ? ' done' : ''}`}>
              <span className="w-task-mark" aria-hidden="true">{task.done && <Check size={13} />}</span>
              <span>
                {task.text}
                <span className="sr-only">{task.done ? ' (done)' : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
