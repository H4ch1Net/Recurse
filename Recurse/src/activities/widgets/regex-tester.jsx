import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Check, Circle, Lightbulb, TriangleAlert, X } from 'lucide-react'
import { feedbackCorrect } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { compile, runRegexJob, WORKER_SOURCE, TIME_BUDGET_MS, MAX_TEXT, riskyPattern, segments, gradePuzzle, puzzleCases, normalizePuzzles, CHEAT_SHEET } from '../lib/regex-tester.js'
import './regex-tester.css'

const SAMPLE_TEXT = `Contact ada@example.com or grace.hopper@navy.mil before 2026-10-14.
Server 192.168.10.1 answered in 12 ms; backup 10.0.0.254 timed out.
Theme colors: #2843c4, #fff and #7ee2a8.
The the report was filed twice twice by mistake.`

/**
 * Runs regex jobs in a Web Worker so a runaway pattern can be stopped: if the worker does
 * not answer within the time budget it is terminated and a fresh one starts next time.
 * Falls back to running inline (with length caps) where workers are unavailable.
 */
function useRegexRunner() {
  const worker = useRef(null)
  const url = useRef(null)
  const pending = useRef(new Map())
  const seq = useRef(0)

  useEffect(() => {
    const jobs = pending.current
    return () => {
      worker.current?.terminate?.()
      if (url.current) URL.revokeObjectURL(url.current)
      for (const p of jobs.values()) clearTimeout(p.timer)
      jobs.clear()
    }
  }, [])

  return useCallback((job) => {
    const ensure = () => {
      if (worker.current !== null) return worker.current
      try {
        if (typeof Worker === 'undefined') throw new Error('no workers')
        if (!url.current) url.current = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
        const w = new Worker(url.current)
        w.onmessage = (e) => {
          const p = pending.current.get(e.data.id)
          if (!p) return
          clearTimeout(p.timer)
          pending.current.delete(e.data.id)
          p.resolve(e.data.result)
        }
        worker.current = w
      } catch {
        worker.current = false
      }
      return worker.current
    }
    return new Promise((resolve) => {
      const w = ensure()
      if (!w) {
        // No worker: refuse obviously dangerous patterns rather than freeze the page.
        if (riskyPattern(job.pattern)) resolve({ ok: true, timedOut: true, killed: true, matches: [], results: (job.cases || []).map(() => null), ranges: [] })
        else resolve(runRegexJob(job))
        return
      }
      const id = ++seq.current
      const timer = setTimeout(() => {
        w.terminate()
        worker.current = null
        for (const p of pending.current.values()) {
          clearTimeout(p.timer)
          p.resolve({ ok: true, timedOut: true, killed: true, matches: [], results: [], ranges: [] })
        }
        pending.current.clear()
      }, TIME_BUDGET_MS + 500)
      pending.current.set(id, {
        timer,
        resolve: (result) => resolve(result.killed ? { ...result, results: (job.cases || []).map(() => null) } : result)
      })
      w.postMessage({ id, job: { ...job, budgetMs: TIME_BUDGET_MS, maxText: MAX_TEXT } })
    })
  }, [])
}

/** Pattern input with / delimiters and flag toggles. */
function PatternBar({ pattern, setPattern, flags, setFlags, available, inputRef, label }) {
  const id = useId()
  const toggle = (f) => {
    sfx.tap()
    setFlags(flags.includes(f) ? flags.replace(f, '') : [...`${flags}${f}`].sort().join(''))
  }
  const titles = { g: 'global: find every match', i: 'ignore case', m: 'multiline: ^ and $ match at each line' }
  return (
    <div className="regex-bar">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="regex-pattern">
        <span className="regex-slash" aria-hidden="true">
          /
        </span>
        <input
          id={id}
          ref={inputRef}
          className="regex-input"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="type a pattern"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <span className="regex-slash" aria-hidden="true">
          /{flags}
        </span>
      </div>
      <div className="regex-flags" role="group" aria-label="Flags">
        {available.map((f) => (
          <button key={f} type="button" className="regex-flag" aria-pressed={flags.includes(f)} title={titles[f]} onClick={() => toggle(f)}>
            {f}
            <span className="regex-flag-name">{titles[f].split(':')[0]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PatternNotes({ pattern, flags, timedOut }) {
  const { error } = compile(pattern, flags)
  const risk = pattern ? riskyPattern(pattern) : null
  if (error) {
    return (
      <div className="callout warn regex-note" role="status">
        <TriangleAlert size={16} />
        <span>
          <strong>Not a valid pattern yet:</strong> {error.message}. {error.hint}
        </span>
      </div>
    )
  }
  if (timedOut) {
    return (
      <div className="callout bad regex-note" role="status">
        <TriangleAlert size={16} />
        <span>
          <strong>Stopped: this pattern took too long.</strong> That is catastrophic backtracking, the engine trying a huge number of ways to match. {risk || 'Simplify nested repeats.'}
        </span>
      </div>
    )
  }
  if (risk) {
    return (
      <div className="callout warn regex-note" role="status">
        <TriangleAlert size={16} />
        <span>{risk}</span>
      </div>
    )
  }
  return null
}

function Highlighted({ text, range }) {
  if (!range) return <span>{text || ' '}</span>
  const [s, e] = range
  return (
    <span>
      {text.slice(0, s)}
      {e > s ? <mark className="regex-hit">{text.slice(s, e)}</mark> : <span className="regex-empty" aria-hidden="true" />}
      {text.slice(e)}
    </span>
  )
}

function CheatSheet({ onInsert }) {
  return (
    <details className="regex-cheat">
      <summary>
        <BookOpen size={15} aria-hidden="true" /> Cheat sheet <span className="xsmall subtle">tap a token to insert it</span>
      </summary>
      <div className="regex-cheat-grid">
        {CHEAT_SHEET.map((section) => (
          <div key={section.title} className="regex-cheat-section">
            <h4>{section.title}</h4>
            <dl>
              {section.rows.map(([token, meaning]) => (
                <div key={token} className="regex-cheat-row">
                  <dt>
                    {section.title === 'Flags' ? (
                      <code>{token}</code>
                    ) : (
                      <button type="button" className="regex-token" onClick={() => onInsert(token.split(' ')[0])} title={`Insert ${token.split(' ')[0]}`}>
                        {token}
                      </button>
                    )}
                  </dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </details>
  )
}

/** Insert text at the input's cursor and return the new value. */
function insertAt(input, value, token) {
  const start = input?.selectionStart ?? value.length
  const end = input?.selectionEnd ?? value.length
  const next = value.slice(0, start) + token + value.slice(end)
  requestAnimationFrame(() => {
    input?.focus()
    input?.setSelectionRange(start + token.length, start + token.length)
  })
  return next
}

/** Live regex tester plus match / do-not-match puzzles. */
export default function RegexTester({ props, onComplete }) {
  const [mode, setMode] = useState('puzzles')
  const run = useRegexRunner()
  return (
    <div className="regex">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'puzzles'} onClick={() => setMode('puzzles')}>
            Puzzles
          </button>
          <button type="button" aria-pressed={mode === 'playground'} onClick={() => setMode('playground')}>
            Playground
          </button>
        </div>
      </div>
      <div hidden={mode !== 'puzzles'}>
        <Puzzles puzzles={props.puzzles} run={run} onComplete={onComplete} />
      </div>
      <div hidden={mode !== 'playground'}>
        <Playground run={run} />
      </div>
    </div>
  )
}

function Puzzles({ puzzles: raw, run, onComplete }) {
  const [puzzles] = useState(() => normalizePuzzles(raw))
  const [index, setIndex] = useState(0)
  const [patterns, setPatterns] = useState(() => puzzles.map(() => ''))
  const [flagsList, setFlagsList] = useState(() => puzzles.map(() => ''))
  const [solved, setSolved] = useState(() => new Set())
  const [helped, setHelped] = useState(() => new Set())
  const [hintLevel, setHintLevel] = useState(0)
  const [combo, setCombo] = useState(0)
  const [check, setCheck] = useState(null)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const stageRef = useRef(null)
  const inputRef = useRef(null)
  const finished = useRef(false)

  const puzzle = puzzles[index]
  const pattern = patterns[index]
  const flags = flagsList[index]
  const key = `${index}|${flags}|${pattern}`
  const valid = Boolean(pattern) && !compile(pattern, flags).error
  const fresh = check?.key === key
  const graded = valid && check?.results ? gradePuzzle(puzzle, check.results) : null

  const onChecked = useEffectEvent((k, res) => {
    setCheck({ key: k, ...res })
    if (!res.ok || res.timedOut) return
    const g = gradePuzzle(puzzle, res.results)
    if (!g.solved || solved.has(puzzle.id)) return
    const next = new Set(solved).add(puzzle.id)
    const usedHelp = helped.has(puzzle.id)
    setSolved(next)
    feedbackCorrect(stageRef.current, { combo: usedHelp ? 0 : combo })
    setCombo(usedHelp ? 0 : combo + 1)
    const done = next.size === puzzles.length
    setMessage({ text: done ? 'Every puzzle solved. Patterns like these validate forms, search logs and clean data in real code.' : `Solved! ${puzzle.match.length + puzzle.noMatch.length} out of ${puzzle.match.length + puzzle.noMatch.length} strings sorted correctly.`, tone: 'good' })
    if (done && !finished.current) {
      finished.current = true
      onComplete({ score: 1 - (helped.size / puzzles.length) * 0.5, detail: `${puzzles.length - helped.size} of ${puzzles.length} solved without help` })
    }
  })

  useEffect(() => {
    if (!valid) return undefined
    let live = true
    const timer = setTimeout(() => {
      run({ kind: 'cases', pattern, flags, cases: puzzleCases(puzzle) }).then((res) => live && onChecked(key, res))
    }, 90)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [key, valid, pattern, flags, puzzle, run])

  const go = (i) => {
    sfx.flip()
    setIndex(i)
    setHintLevel(0)
    setMessage({ text: '', tone: '' })
  }
  const setPattern = (v) => setPatterns((list) => list.map((p, i) => (i === index ? v : p)))
  const setFlags = (v) => setFlagsList((list) => list.map((f, i) => (i === index ? v : f)))
  const showHelp = () => {
    sfx.tap()
    setHintLevel((h) => Math.min(h + 1, puzzle.solution ? 2 : 1))
    setHelped((s) => new Set(s).add(puzzle.id))
  }
  const nextUnsolved = puzzles.findIndex((p, i) => i > index && !solved.has(p.id))
  const isSolved = solved.has(puzzle.id)
  const rows = graded?.rows ?? puzzleCases(puzzle).map((text, i) => ({ text, expect: i < puzzle.match.length, got: null, ok: false }))

  const renderRow = (row, i) => {
    const state = !valid || row.got === null ? 'pending' : row.ok ? 'ok' : 'bad'
    const verdict = row.got === null ? 'not checked' : row.got ? 'matches' : 'no match'
    return (
      <li key={i} className={`regex-case ${state}${fresh ? '' : ' stale'}`}>
        <span className="regex-case-mark" aria-hidden="true">
          {state === 'ok' ? <Check size={14} strokeWidth={3} /> : state === 'bad' ? <X size={14} strokeWidth={3} /> : <Circle size={8} />}
        </span>
        <code className="regex-case-text">
          <Highlighted text={row.text} range={valid && fresh ? check?.ranges?.[i] : null} />
        </code>
        <span className="regex-case-verdict">{verdict}</span>
        <span className="sr-only">{state === 'ok' ? ', correct' : state === 'bad' ? ', wrong' : ''}</span>
      </li>
    )
  }

  return (
    <div className="regex-puzzles">
      <div className="regex-progress" role="group" aria-label="Puzzles">
        {puzzles.map((p, i) => (
          <button key={p.id} type="button" className={`regex-dot${i === index ? ' current' : ''}${solved.has(p.id) ? ' solved' : ''}`} onClick={() => go(i)} aria-label={`Puzzle ${i + 1}${solved.has(p.id) ? ', solved' : ''}`} aria-current={i === index ? 'step' : undefined}>
            {solved.has(p.id) ? <Check size={12} strokeWidth={3} /> : i + 1}
          </button>
        ))}
        <span className="grow" />
        {combo >= 2 && <span className="chip accent">{combo} in a row</span>}
        <span className="chip outline tabular">
          {solved.size} / {puzzles.length}
        </span>
      </div>
      <div className={`w-stage regex-stage${isSolved ? ' is-solved' : ''}`} ref={stageRef}>
        <p className="regex-prompt">
          <span className="regex-num">Puzzle {index + 1}.</span> {puzzle.prompt}
        </p>
        <PatternBar pattern={pattern} setPattern={setPattern} flags={flags} setFlags={setFlags} available={['i', 'm']} inputRef={inputRef} label={`Pattern for puzzle ${index + 1}`} />
        <PatternNotes pattern={pattern} flags={flags} timedOut={fresh && check?.timedOut} />
        <div className="regex-cases">
          <div>
            <h4 className="regex-col-title">Should match</h4>
            <ul>{rows.slice(0, puzzle.match.length).map((r, i) => renderRow(r, i))}</ul>
          </div>
          <div>
            <h4 className="regex-col-title">Should not match</h4>
            <ul>{rows.slice(puzzle.match.length).map((r, i) => renderRow(r, i + puzzle.match.length))}</ul>
          </div>
        </div>
        <p className="xsmall subtle regex-rule">A string counts as a match when your pattern is found anywhere in it. Use ^ and $ to pin a pattern to the start and end.</p>
      </div>
      {hintLevel > 0 && (
        <div className="callout info regex-note">
          <Lightbulb size={16} />
          <span>
            {puzzle.hint || 'Look at what the strings that should match have in common, then what the others lack.'}
            {hintLevel > 1 && puzzle.solution && (
              <>
                {' '}
                One answer: <code className="regex-solution">/{puzzle.solution}/{puzzle.flags}</code>
              </>
            )}
          </span>
        </div>
      )}
      <div className="row wrap regex-actions">
        {!isSolved && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={showHelp} disabled={hintLevel >= (puzzle.solution ? 2 : 1)}>
            <Lightbulb size={14} /> {hintLevel === 0 ? 'Hint' : 'Show an answer'}
          </button>
        )}
        {graded && !isSolved && (
          <span className="small subtle tabular">
            {graded.passing} of {graded.rows.length} sorted right
          </span>
        )}
        <span className="grow" />
        {isSolved && nextUnsolved !== -1 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => go(nextUnsolved)}>
            Next puzzle <ArrowRight size={14} />
          </button>
        )}
      </div>
      <p className={`w-feedback ${message.tone}`} aria-live="polite">
        {message.text}
      </p>
      <CheatSheet onInsert={(t) => setPattern(insertAt(inputRef.current, pattern, t))} />
    </div>
  )
}

function Playground({ run }) {
  const [pattern, setPattern] = useState('(\\d{1,3}\\.){3}\\d{1,3}')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState(SAMPLE_TEXT)
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)
  const textId = useId()
  const key = `${flags}|${pattern}|${text}`
  const valid = Boolean(pattern) && !compile(pattern, flags).error

  const onMatched = useEffectEvent((k, res) => setResult({ key: k, ...res }))
  useEffect(() => {
    if (!valid) return undefined
    let live = true
    const timer = setTimeout(() => {
      run({ kind: 'matches', pattern, flags, text }).then((res) => live && onMatched(key, res))
    }, 120)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [key, valid, pattern, flags, text, run])

  const matches = valid && result?.ok ? result.matches ?? [] : []
  const shownText = text.slice(0, MAX_TEXT)
  const segs = segments(shownText, matches)

  return (
    <div className="regex-play">
      <PatternBar pattern={pattern} setPattern={setPattern} flags={flags} setFlags={setFlags} available={['g', 'i', 'm']} inputRef={inputRef} label="Pattern" />
      <PatternNotes pattern={pattern} flags={flags} timedOut={result?.key === key && result?.timedOut} />
      <label htmlFor={textId} className="regex-col-title">
        Test text
      </label>
      <textarea id={textId} className="textarea mono regex-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} spellCheck={false} />
      <div className="regex-col-title row between">
        <span>Matches highlighted</span>
        <span className="tabular" aria-live="polite">
          {!pattern ? 'type a pattern' : !valid ? 'invalid pattern' : `${matches.length}${result?.truncated ? '+' : ''} ${matches.length === 1 ? 'match' : 'matches'}`}
        </span>
      </div>
      <div className="regex-preview mono" aria-label="Test text with matches highlighted">
        {segs.map((s, i) =>
          s.match === null ? (
            <span key={i}>{s.text}</span>
          ) : s.empty ? (
            <span key={i} className="regex-empty" title={`Empty match ${s.match + 1}`} />
          ) : (
            <mark key={i} className={`regex-hit${s.match % 2 ? ' alt' : ''}`} title={`Match ${s.match + 1}`}>
              {s.text}
            </mark>
          )
        )}
        {!shownText && <span className="subtle">Type some text to test against.</span>}
      </div>
      {result?.clipped && <p className="xsmall subtle">Only the first {MAX_TEXT} characters are checked.</p>}
      {!flags.includes('g') && matches.length === 1 && <p className="xsmall subtle">Without the g flag, only the first match is found. Turn on g to find them all.</p>}
      {matches.length > 0 && (
        <ol className="regex-matches">
          {matches.slice(0, 40).map((m, i) => (
            <li key={`${m.index}-${i}`}>
              <span className="regex-match-head">
                <span className="regex-match-num">{i + 1}</span>
                <code className="regex-hit">{m.text || '(empty)'}</code>
                <span className="xsmall subtle tabular">
                  at {m.index} to {m.end}
                </span>
              </span>
              {m.groups.length > 0 && (
                <span className="regex-groups">
                  {m.groups.map((g) => (
                    <span key={g.n} className="regex-group">
                      <span className="xsmall subtle">group {g.n}{g.name ? ` (${g.name})` : ''}</span>
                      <code>{g.text === null ? 'no match' : g.text || '(empty)'}</code>
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
          {matches.length > 40 && <li className="xsmall subtle">and {matches.length - 40} more</li>}
        </ol>
      )}
      <CheatSheet onInsert={(t) => setPattern(insertAt(inputRef.current, pattern, t))} />
    </div>
  )
}
