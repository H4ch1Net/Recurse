import { useEffect, useId, useRef, useState } from 'react'
import { Check, Lightbulb } from 'lucide-react'
import { feedbackSuccess } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { createShell, runShell, complete, prompt } from '../lib/terminal/shell.js'
import { SCENARIOS, SCENARIO_IDS, BASE_FILES, scenarioFor, explainOutput } from '../lib/terminal/scenarios.js'
import { gradeTasks, historyStep } from '../lib/terminal/parse.js'
import { TouchKeys } from '../lib/touch-keys'
import './terminal.css'

const TONE_CLASS = {
  out: 'terminal-out',
  err: 'terminal-err',
  ok: 'terminal-ok',
  dim: 'terminal-dim',
  dir: 'termsim-dir',
  exe: 'termsim-exe',
  match: 'termsim-match',
  path: 'termsim-path'
}

let lineId = 0
const withIds = (lines) => lines.map((l) => ({ ...l, id: ++lineId }))

/** One line of console output: plain, colored parts, or an echoed command. */
function ConsoleLine({ line, toneClass = TONE_CLASS }) {
  if (line.kind === 'cmd') {
    return (
      <div className="terminal-line">
        <span className="terminal-prompt">{line.prompt}</span>
        <span>{line.text}</span>
      </div>
    )
  }
  if (line.parts) {
    return (
      <div className="terminal-line">
        {line.parts.map((p, i) => (
          <span key={i} className={toneClass[p.tone] || 'terminal-out'}>
            {p.text}
          </span>
        ))}
        {!line.parts.some((p) => p.text) && ' '}
      </div>
    )
  }
  return <div className={`terminal-line ${toneClass[line.tone] || 'terminal-out'}`}>{line.text || ' '}</div>
}

/** A simulated Linux shell with scenario checklists graded from the file system and command log. */
export default function TerminalWidget({ props, onComplete, standalone }) {
  const [scenario, setScenario] = useState(() => scenarioFor(props.scenario))
  return (
    <div className="termsim">
      {standalone && (
        <div className="w-toolbar">
          <span className="small subtle">Scenario</span>
          <div className="w-pill-group" role="group" aria-label="Scenario">
            {SCENARIO_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={scenario === id} onClick={() => setScenario(id)}>
                {SCENARIOS[id].title}
              </button>
            ))}
          </div>
        </div>
      )}
      <ShellScenario key={scenario} scenario={scenario} onComplete={onComplete} />
    </div>
  )
}

function ShellScenario({ scenario, onComplete }) {
  const spec = SCENARIOS[scenario]
  const [shell, setShell] = useState(() => createShell({ files: BASE_FILES }))
  const [lines, setLines] = useState(() =>
    withIds([
      { tone: 'dim', text: 'Recurse practice shell. Nothing here touches your real computer.' },
      { tone: 'dim', text: 'Type help for the command list, man <command> for details. Tab completes names.' }
    ])
  )
  const [input, setInput] = useState('')
  const [histIndex, setHistIndex] = useState(-1)
  const [done, setDone] = useState(() => new Set())
  const [caption, setCaption] = useState({ text: spec.intro, tone: '' })
  const screenRef = useRef(null)
  const inputRef = useRef(null)
  const taskRefs = useRef({})
  const finished = useRef(false)
  const inputId = useId()

  useEffect(() => {
    const el = screenRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const total = spec.tasks.length
  const current = spec.tasks.find((t) => !done.has(t.id))

  const submit = () => {
    const text = input
    setInput('')
    setHistIndex(-1)
    const echo = { kind: 'cmd', prompt: prompt(shell), text }
    if (!text.trim()) {
      setLines((ls) => [...ls, ...withIds([echo])])
      return
    }
    const r = runShell(shell, text)
    setShell(r.state)
    setLines((ls) => (r.clear ? [] : [...ls, ...withIds([echo, ...r.out])].slice(-400)))
    const hasError = r.out.some((l) => l.tone === 'err')
    if (hasError) sfx.error()
    else sfx.key()

    const nextDone = new Set(done)
    const fresh = gradeTasks(spec.tasks, r.state, nextDone)
    if (fresh.length) {
      setDone(nextDone)
      const last = spec.tasks.find((t) => t.id === fresh[fresh.length - 1])
      fresh.forEach((id, i) => setTimeout(() => feedbackSuccess(taskRefs.current[id], i === fresh.length - 1 ? 'Step done' : null), i * 180))
      if (nextDone.size === total && !finished.current) {
        finished.current = true
        setCaption({ text: 'Every step done. You used the same commands people type on real servers every day.', tone: 'good' })
        onComplete({ score: 1 })
      } else setCaption({ text: `Done: ${last.text}.`, tone: 'good' })
      return
    }
    const why = hasError ? explainOutput(r.out) : null
    setCaption(why ? { text: why, tone: 'bad' } : { text: '', tone: '' })
  }

  const recall = (dir) => {
    const step = historyStep(shell.history, histIndex, dir)
    setHistIndex(step.index)
    setInput(step.value)
  }

  const tabComplete = () => {
    const c = complete(shell, input)
    if (c.line !== input) {
      setInput(c.line)
      sfx.tick()
    } else if (c.options.length) setLines((ls) => [...ls, ...withIds([{ kind: 'cmd', prompt: prompt(shell), text: input }, { tone: 'out', text: c.options.join('  ') }])])
  }

  const cancelLine = () => {
    setLines((ls) => [...ls, ...withIds([{ kind: 'cmd', prompt: prompt(shell), text: `${input}^C` }])])
    setInput('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      recall(e.key === 'ArrowUp' ? -1 : 1)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      tabComplete()
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([])
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault()
      cancelLine()
    }
  }

  const focusInput = () => {
    if (!window.getSelection()?.toString()) inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className="termsim-body">
      <div className="termsim-head">
        <span className="chip accent">{spec.title}</span>
        <span className="grow" />
        <span className="chip outline tabular" aria-label={`${done.size} of ${total} steps done`}>
          {done.size} / {total}
        </span>
      </div>
      <div className="terminal termsim-console">
        <div className="terminal-bar" aria-hidden="true">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
          {prompt(shell).trim().replace(/\$$/, '')}
        </div>
        <div className="terminal-screen" ref={screenRef} onClick={focusInput} role="log" aria-live="polite" aria-label="Terminal output">
          {lines.map((l) => (
            <ConsoleLine key={l.id} line={l} />
          ))}
          <div className="terminal-input-row">
            <label htmlFor={inputId} className="terminal-prompt">
              {prompt(shell)}
            </label>
            <input
              id={inputId}
              ref={inputRef}
              className="terminal-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              aria-label="Shell command"
            />
          </div>
        </div>
      </div>
      <TouchKeys
        label="Shell keys"
        keys={[
          { label: 'Tab', title: 'Complete the name (Tab)', onPress: tabComplete },
          { label: '↑', title: 'Previous command (Up)', onPress: () => recall(-1) },
          { label: '↓', title: 'Next command (Down)', onPress: () => recall(1) },
          { label: '^C', title: 'Cancel the line (Ctrl+C)', onPress: cancelLine },
          { label: 'clear', title: 'Clear the screen (Ctrl+L)', onPress: () => setLines([]) }
        ]}
      />
      <p className={`w-feedback ${caption.tone}`} aria-live="polite">
        {caption.text}
      </p>
      <ol className="w-tasks" aria-label="Steps">
        {spec.tasks.map((t) => {
          const isDone = done.has(t.id)
          const isCurrent = current?.id === t.id
          return (
            <li key={t.id} ref={(el) => (taskRefs.current[t.id] = el)} className={`w-task${isDone ? ' done' : ''}${isCurrent ? ' termsim-current' : ''}`}>
              <span className="w-task-mark" aria-hidden="true">
                {isDone && <Check size={13} strokeWidth={3} />}
              </span>
              <span>
                {t.text}
                <span className="sr-only">{isDone ? ' (done)' : isCurrent ? ' (current step)' : ''}</span>
                {isCurrent && (
                  <span className="w-task-hint">
                    <Lightbulb size={12} aria-hidden="true" /> {t.hint}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
