import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  Check,
  CircleAlert,
  Clock,
  Eye,
  Lightbulb,
  Loader2,
  Lock,
  Minus,
  Play,
  RotateCcw,
  Send,
  Square,
  Trophy,
  X
} from 'lucide-react'
import CodeEditor from './CodeEditor'
import CodeBlock from './CodeBlock'
import RichText, { Inline } from './RichText'
import { getChallenge, loadChallenge } from '../lib/challenges'
import { effectsLevel, feedbackComplete, feedbackCorrect, feedbackWrong } from '../lib/juice'
import { sfx } from '../lib/sfx'
import { loadPython, retryPython, runChallengeTests, LANGUAGE_LABELS } from '../activities/lib/runner'
import { challengeScore, errorHint, languagesFor, missingReturnHint, selectTests, starterFor, summarize } from '../activities/lib/runner/tests'
import { diffStrings, formatArgs, formatValue } from '../activities/lib/runner/format'
import { modKey } from '../activities/lib/runner/editing'
import { pythonStatusText, usePythonStatus } from '../activities/lib/runner/usePython'
import '../activities/widgets/challenge.css'

const LANGUAGE_KEY = 'recurse_code_language'
const SOLUTION_UNLOCK_SUBMITS = 3
const REVEAL_MS = 70

const secondsSince = (start) => Math.max(1, Math.round((Date.now() - start) / 1000))
const now = () => Date.now()

// `scope` keeps separate drafts for one challenge, e.g. 'mock_' for mock interviews.
const draftKey = (id, language, scope = '') => `recurse_code_${scope}${id}_${language}`

function readStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage full or blocked: the draft just lives for this visit.
  }
}

/** Save a draft; a draft equal to the starter code is removed instead. */
function saveDraft(challenge, language, code, scope = '') {
  writeStorage(draftKey(challenge.id, language, scope), code === starterFor(challenge, language) ? null : code)
}

const STATUS = {
  passed: { text: 'Passed', Icon: Check },
  failed: { text: 'Wrong answer', Icon: X },
  error: { text: 'Error', Icon: CircleAlert },
  timeout: { text: 'Time limit exceeded', Icon: Clock },
  skipped: { text: 'Not run', Icon: Minus },
  pending: { text: 'Waiting', Icon: Minus },
  running: { text: 'Running', Icon: Loader2 }
}

const DIFFICULTY_TONE = { easy: 'good', medium: 'warn', hard: 'bad' }

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m} min ${s} s` : `${m} min`
}

/**
 * The full challenge experience: statement, examples, editor, Run and Submit, results,
 * hints and the reference solution.
 *
 * props:
 *   id or challenge       which challenge (a challenge object wins over an id)
 *   standalone            two columns on wide screens (problem left, editor right)
 *   onComplete({ score, detail })                       activity contract, on a full solve
 *   onSolved({ id, language, hintsUsed, solutionViewed, seconds })   for progress tracking
 *   solvedBefore          the learner solved it on an earlier visit: the solution is one click away
 *   language              preferred starting language
 *
 * Mock interviews (all optional; the defaults keep the normal behavior):
 *   hideHints, hideSolution   leave out the hints and the reference solution
 *   locked                    read-only editor, Run and Submit disabled (time is up)
 *   draftScope                a separate set of saved drafts, e.g. 'mock_'
 *   onResult({ kind, passed, total, hiddenPassed, hiddenTotal, allPassed, language })   after each Run or Submit
 *   onCode(code, language)    shortly after the code changes
 */
export default function ChallengeView({ id, challenge: given, ...rest }) {
  const [state, setState] = useState({ id: null, challenge: null, failed: false })
  const wanted = given ? null : id
  useEffect(() => {
    if (!wanted) return
    let alive = true
    loadChallenge(wanted)
      .then((full) => alive && setState({ id: wanted, challenge: full, failed: !full }))
      .catch(() => alive && setState({ id: wanted, challenge: null, failed: true }))
    return () => {
      alive = false
    }
  }, [wanted])
  const challenge = given || (state.id === id ? state.challenge : null)
  if (!challenge && !given && state.id !== id && getChallenge(id)) {
    return <div className="activity-loading"><Loader2 size={18} className="spin" /> Loading the challenge</div>
  }
  if (!challenge) {
    return (
      <div className="callout warn">
        <CircleAlert size={18} />
        <span>This challenge is not available in this version{id ? ` (${id})` : ''}.</span>
      </div>
    )
  }
  return <ChallengeWorkspace key={challenge.id} challenge={challenge} {...rest} />
}

function ChallengeWorkspace({
  challenge,
  standalone = false,
  onComplete,
  onSolved,
  solvedBefore = false,
  language: preferred,
  hideHints = false,
  hideSolution = false,
  locked = false,
  draftScope = '',
  onResult,
  onCode
}) {
  const languages = languagesFor(challenge)
  const [language, setLanguage] = useState(() => {
    const stored = readStorage(LANGUAGE_KEY)
    if (languages.includes(preferred)) return preferred
    if (languages.includes(stored)) return stored
    return languages[0] || 'javascript'
  })
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(languages.map((lang) => [lang, readStorage(draftKey(challenge.id, lang, draftScope)) ?? starterFor(challenge, lang)]))
  )
  const code = drafts[language] ?? starterFor(challenge, language)
  const [run, setRun] = useState(null)
  const [selected, setSelected] = useState(null)
  const [errorLine, setErrorLine] = useState(null)
  const [hintsShown, setHintsShown] = useState(0)
  const [failedSubmits, setFailedSubmits] = useState(0)
  const [solved, setSolved] = useState(Boolean(solvedBefore))
  const [solvedInfo, setSolvedInfo] = useState(null)
  // Closed even after an earlier solve: a redo is only useful from memory.
  const [solutionOpen, setSolutionOpen] = useState(false)
  const [confirmSolution, setConfirmSolution] = useState(false)
  const [solutionLanguage, setSolutionLanguage] = useState(language)
  const [unlocked, setUnlocked] = useState(() => new Set())
  const [confirmReset, setConfirmReset] = useState(false)
  const [announce, setAnnounce] = useState('')
  const python = usePythonStatus()

  const jobRef = useRef(null)
  const queueRef = useRef([])
  const pumpTimer = useRef(null)
  const comboRef = useRef(0)
  const chipRefs = useRef(new Map())
  const resultsRef = useRef(null)
  const editorRef = useRef(null)
  const startedAt = useRef(0)
  const hintsRef = useRef(0)
  const viewedRef = useRef(false)
  const solvedLanguages = useRef(new Set())
  const latest = useRef({ challenge, language, code, draftScope })

  const hints = Array.isArray(challenge.hints) ? challenge.hints : []
  const H = standalone ? 'h2' : 'h4'
  const Sub = standalone ? 'h3' : 'h5'
  const visibleCount = selectTests(challenge, 'visible').length
  const hiddenCount = selectTests(challenge, 'all').length - visibleCount
  const running = run?.status === 'running'
  const canSeeSolution = solved || failedSubmits >= SOLUTION_UNLOCK_SUBMITS
  const mod = modKey()

  // Timer for onSolved, cleanup on leave. (The parent remounts this per challenge id.)
  useEffect(() => {
    startedAt.current = now()
    return () => {
      jobRef.current?.cancel()
      jobRef.current = null
      clearTimeout(pumpTimer.current)
      const last = latest.current
      saveDraft(last.challenge, last.language, last.code, last.draftScope)
    }
  }, [])

  const reportCode = useEffectEvent((value, lang) => onCode?.(value, lang))

  // Drafts are saved shortly after typing stops.
  useEffect(() => {
    latest.current = { challenge, language, code, draftScope }
    const timer = setTimeout(() => {
      saveDraft(challenge, language, code, draftScope)
      reportCode(code, language)
    }, 300)
    return () => clearTimeout(timer)
  }, [challenge, language, code, draftScope])

  const setCode = (next) => {
    setDrafts((d) => ({ ...d, [language]: next }))
    setErrorLine(null)
  }

  const switchLanguage = (next) => {
    if (next === language) return
    jobRef.current?.cancel()
    saveDraft(challenge, language, code, draftScope)
    writeStorage(LANGUAGE_KEY, next)
    setLanguage(next)
    setSolutionLanguage(next)
    setRun(null)
    setSelected(null)
    setErrorLine(null)
    setConfirmReset(false)
    sfx.tap()
    if (next === 'python') loadPython().catch(() => {})
  }

  const resetCode = () => {
    const starter = starterFor(challenge, language)
    setDrafts((d) => ({ ...d, [language]: starter }))
    writeStorage(draftKey(challenge.id, language, draftScope), null)
    setConfirmReset(false)
    setErrorLine(null)
    sfx.flip()
    editorRef.current?.focus()
  }

  // ---- Results arrive from the worker and are revealed one by one, for a satisfying cascade.

  const positionOf = (r, index) => (r ? r.tests.findIndex((t) => t.index === index) : -1)

  const reveal = (result) => {
    setRun((r) => {
      if (!r) return r
      const pos = positionOf(r, result.index)
      if (pos < 0) return r
      const results = r.results.slice()
      results[pos] = result
      return { ...r, results, current: null }
    })
    if (result.passed) {
      feedbackCorrect(chipRefs.current.get(result.index), { combo: comboRef.current })
      comboRef.current += 1
      if (result.hidden) setUnlocked((set) => (set.has(result.index) ? set : new Set(set).add(result.index)))
    } else {
      comboRef.current = 0
    }
  }

  const solve = (kind, results) => {
    const seconds = secondsSince(startedAt.current)
    const info = { id: challenge.id, language, hintsUsed: hintsRef.current, solutionViewed: viewedRef.current, seconds }
    const score = challengeScore(info)
    setSolved(true)
    setSolutionOpen(true)
    setSolutionLanguage(language)
    setConfirmSolution(false)
    feedbackComplete({ big: true })
    const parts = [`Solved in ${LANGUAGE_LABELS[language]}`]
    if (info.hintsUsed) parts.push(`with ${info.hintsUsed} hint${info.hintsUsed === 1 ? '' : 's'}`)
    if (info.solutionViewed) parts.push('after viewing the solution')
    onComplete?.({ score, detail: parts.join(' ') })
    if (!solvedLanguages.current.has(language)) {
      solvedLanguages.current.add(language)
      onSolved?.(info)
    }
    setSolvedInfo({ ...info, score, total: results.length, otherLanguage: solvedLanguages.current.size < languages.length })
  }

  const finalize = (outcome, kind) => {
    const { results, fatal } = outcome
    setRun((r) => (r ? { ...r, results, status: 'done', fatal, stdout: outcome.stdout, outcome: outcome.status, current: null } : r))
    const firstBad = results.findIndex((r) => r.status !== 'passed' && r.status !== 'skipped')
    setSelected(fatal ? null : firstBad >= 0 ? firstBad : 0)
    setErrorLine(fatal?.line || (firstBad >= 0 ? results[firstBad].error?.line : null) || null)
    const summary = summarize(results)
    if (outcome.status === 'cancelled') {
      setAnnounce('Stopped.')
      return
    }
    if (outcome.status === 'unavailable') {
      setAnnounce(fatal?.message || 'The runner is not available.')
      return
    }
    const hiddenResults = results.filter((r) => r.hidden)
    onResult?.({ kind, passed: summary.passed, total: results.length, hiddenPassed: hiddenResults.filter((r) => r.passed).length, hiddenTotal: hiddenResults.length, allPassed: !fatal && summary.allPassed, language })
    if (fatal) {
      setAnnounce(`Your code could not run. ${fatal.line ? `Line ${fatal.line}: ` : ''}${fatal.message}`)
      if (kind === 'submit') {
        setFailedSubmits((n) => n + 1)
        feedbackWrong(resultsRef.current)
      } else sfx.error()
      return
    }
    if (kind === 'submit') {
      if (summary.allPassed) {
        setAnnounce(`All ${summary.total} tests passed. Challenge solved.`)
        solve(kind, results)
      } else {
        setAnnounce(`${summary.passed} of ${summary.total} tests passed.`)
        setFailedSubmits((n) => n + 1)
        feedbackWrong(resultsRef.current)
      }
    } else {
      setAnnounce(
        summary.allPassed
          ? `All ${summary.total} example tests passed. Submit to run the hidden tests too.`
          : `${summary.passed} of ${summary.total} example tests passed.`
      )
      if (summary.allPassed) sfx.success()
    }
  }

  const pump = () => {
    if (pumpTimer.current) return
    const item = queueRef.current.shift()
    if (!item) return
    let delay = 0
    if (item.type === 'start') setRun((r) => (r && r.status === 'running' ? { ...r, current: positionOf(r, item.index) } : r))
    else if (item.type === 'result') {
      reveal(item.result)
      delay = effectsLevel() === 'off' ? 0 : REVEAL_MS
    } else if (item.type === 'done') finalize(item.outcome, item.kind)
    pumpTimer.current = setTimeout(() => {
      pumpTimer.current = null
      pump()
    }, delay)
  }

  const enqueue = (item) => {
    queueRef.current.push(item)
    pump()
  }

  const start = (kind) => {
    if (jobRef.current || locked) return
    const scope = kind === 'submit' ? 'all' : 'visible'
    clearTimeout(pumpTimer.current)
    pumpTimer.current = null
    queueRef.current = []
    comboRef.current = 0
    sfx.tap()
    const job = runChallengeTests({
      challenge,
      language,
      code,
      scope,
      onTestStart: (test) => enqueue({ type: 'start', index: test.index }),
      onResult: (result) => enqueue({ type: 'result', result })
    })
    jobRef.current = job
    setRun({ kind, tests: job.tests, results: job.tests.map(() => null), current: null, status: 'running', fatal: null, stdout: '', language })
    setSelected(null)
    setErrorLine(null)
    setAnnounce(kind === 'submit' ? `Submitting. Running all ${job.tests.length} tests.` : `Running ${job.tests.length} example tests.`)
    job.promise.then((outcome) => {
      if (jobRef.current !== job) return
      jobRef.current = null
      enqueue({ type: 'done', outcome, kind })
    })
  }

  const stop = () => {
    const job = jobRef.current
    if (!job) return
    job.cancel()
  }

  const revealHint = () => {
    const next = Math.min(hints.length, hintsShown + 1)
    hintsRef.current = Math.max(hintsRef.current, next)
    setHintsShown(next)
    sfx.flip()
  }

  const openSolution = () => {
    if (!solved) viewedRef.current = true
    setSolutionOpen(true)
    setConfirmSolution(false)
    sfx.flip()
  }

  const selectTest = (pos) => {
    setSelected(pos)
    const r = run?.results?.[pos]
    if (r?.error?.line) setErrorLine(r.error.line)
  }

  const goToLine = (line) => editorRef.current?.goToLine(line)

  const loadingText = language === 'python' ? pythonStatusText(python) : ''
  const pyError = language === 'python' && python.state === 'error' ? python.message : ''

  return (
    <div className={`challenge${standalone ? ' challenge-standalone' : ''}${solved ? ' is-solved' : ''}`}>
      <section className="challenge-problem" aria-label="Problem">
        <header className="challenge-head">
          <H className="challenge-title">{challenge.title}</H>
          <div className="row wrap challenge-meta">
            {challenge.difficulty && <span className={`chip ${DIFFICULTY_TONE[challenge.difficulty] || 'outline'}`}>{challenge.difficulty}</span>}
            {challenge.pattern && <span className="chip outline">{challenge.pattern}</span>}
            {solved && (
              <span className="stamp good press">
                <Check size={12} /> Solved
              </span>
            )}
          </div>
        </header>

        <RichText text={challenge.prompt} className="prose challenge-prompt" />

        {Array.isArray(challenge.examples) && challenge.examples.length > 0 && (
          <div className="challenge-block">
            <Sub className="challenge-subhead">Examples</Sub>
            {challenge.examples.map((example, i) => (
              <div key={i} className="challenge-example">
                <div className="challenge-example-row">
                  <span className="challenge-label">Input</span>
                  <code>{example.input}</code>
                </div>
                <div className="challenge-example-row">
                  <span className="challenge-label">Output</span>
                  <code>{example.output}</code>
                </div>
                {example.explain && (
                  <p className="challenge-example-why">
                    <Inline text={example.explain} />
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {Array.isArray(challenge.constraints) && challenge.constraints.length > 0 && (
          <div className="challenge-block">
            <Sub className="challenge-subhead">Constraints</Sub>
            <ul className="challenge-constraints">
              {challenge.constraints.map((c, i) => (
                <li key={i}>
                  <Inline text={c} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hideHints && hints.length > 0 && (
          <div className="challenge-block challenge-hints">
            <Sub className="challenge-subhead">Hints</Sub>
            {hintsShown > 0 && (
              <ol className="challenge-hint-list">
                {hints.slice(0, hintsShown).map((hint, i) => (
                  <li key={i} className="rise">
                    <Lightbulb size={15} aria-hidden="true" />
                    <span>
                      <Inline text={hint} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {hintsShown < hints.length ? (
              <button type="button" className="btn btn-sm" onClick={revealHint}>
                <Lightbulb size={14} /> {hintsShown === 0 ? 'Show a hint' : 'Show the next hint'} ({hintsShown + 1} of {hints.length})
              </button>
            ) : (
              <p className="xsmall subtle">That is every hint. You have got this.</p>
            )}
          </div>
        )}

        {!hideSolution && <div className="challenge-block challenge-solution">
          <Sub className="challenge-subhead">Solution</Sub>
          {solutionOpen ? (
            <Solution challenge={challenge} language={solutionLanguage} languages={languages} onLanguage={setSolutionLanguage} />
          ) : canSeeSolution ? (
            confirmSolution ? (
              <div className="callout warn" role="group" aria-label="Confirm showing the solution">
                <CircleAlert size={18} />
                <div className="stack-sm">
                  <span>Seeing the solution now lowers your score for this challenge. Show it anyway?</span>
                  <div className="row wrap">
                    <button type="button" className="btn btn-sm" onClick={openSolution}>
                      <Eye size={14} /> Show the solution
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmSolution(false)}>Keep trying</button>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmSolution(true)}>
                <Eye size={14} /> Show the solution
              </button>
            )
          ) : (
            <p className="challenge-locked small subtle">
              <Lock size={14} aria-hidden="true" /> The reference solution unlocks when you solve the challenge, or after {SOLUTION_UNLOCK_SUBMITS} submits that do not pass ({failedSubmits} of {SOLUTION_UNLOCK_SUBMITS} so far).
            </p>
          )}
        </div>}
      </section>

      <section className="challenge-work" aria-label="Your solution">
        <div className="w-toolbar challenge-toolbar">
          {languages.length > 1 ? (
            <div className="w-pill-group" role="group" aria-label="Language">
              {languages.map((lang) => (
                <button key={lang} type="button" aria-pressed={lang === language} onClick={() => switchLanguage(lang)}>
                  {LANGUAGE_LABELS[lang]}
                </button>
              ))}
            </div>
          ) : (
            <span className="chip outline">{LANGUAGE_LABELS[language]}</span>
          )}
          <span className="grow" />
          {confirmReset ? (
            <span className="row wrap challenge-confirm" role="group" aria-label="Confirm reset">
              <span className="xsmall muted">Replace your {LANGUAGE_LABELS[language]} code with the starter?</span>
              <button type="button" className="btn btn-sm btn-danger" onClick={resetCode}>Reset</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(true)} disabled={locked || code === starterFor(challenge, language)}>
              <RotateCcw size={14} /> Reset code
            </button>
          )}
        </div>

        <CodeEditor
          ref={editorRef}
          value={code}
          onChange={setCode}
          language={language}
          onRun={() => start('run')}
          onSubmit={() => start('submit')}
          errorLine={errorLine}
          readOnly={locked}
          minLines={standalone ? 14 : 10}
          label={`${LANGUAGE_LABELS[language]} solution for ${challenge.title}`}
          onFocus={language === 'python' ? () => loadPython().catch(() => {}) : undefined}
        />

        <div className="challenge-actions">
          {running ? (
            <button type="button" className="btn" onClick={stop}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => start('run')} disabled={locked} title="Run the example tests">
                <Play size={15} /> Run <span className="kbd challenge-kbd" aria-hidden="true">{mod} Enter</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => start('submit')} disabled={locked} title="Run every test, hidden ones included">
                <Send size={14} /> Submit <span className="kbd challenge-kbd" aria-hidden="true">{mod} Shift Enter</span>
              </button>
            </>
          )}
          {loadingText && (
            <span className="challenge-loading xsmall muted" role="status">
              <Loader2 size={14} className="spin" aria-hidden="true" /> {loadingText}
            </span>
          )}
        </div>

        {pyError && (
          <div className="callout bad" role="alert">
            <CircleAlert size={18} />
            <div className="stack-sm">
              <span>{pyError}</span>
              <div>
                <button type="button" className="btn btn-sm" onClick={() => retryPython()}>Try again</button>
              </div>
            </div>
          </div>
        )}

        {solvedInfo && (
          <div className="callout good challenge-solved" role="status">
            <Trophy size={18} />
            <div>
              <strong>Solved.</strong> All {solvedInfo.total} tests pass in {LANGUAGE_LABELS[solvedInfo.language]}, in {formatDuration(solvedInfo.seconds)}.
              {solvedInfo.solutionViewed
                ? ' You looked at the solution first, so come back in a few days and solve it from memory.'
                : solvedInfo.hintsUsed
                  ? ` You used ${solvedInfo.hintsUsed} hint${solvedInfo.hintsUsed === 1 ? '' : 's'}. Next time, try it with fewer.`
                  : ' No hints needed. Nicely done.'}
              {solvedInfo.otherLanguage && ' For extra practice, solve it in the other language too.'}
            </div>
          </div>
        )}

        <div className="challenge-results" ref={resultsRef}>
          <div className="challenge-results-head">
            <Sub className="challenge-subhead">Test results</Sub>
            {run && run.status === 'done' && !run.fatal && run.outcome !== 'cancelled' && (
              <Summary results={run.results} kind={run.kind} />
            )}
          </div>
          <p className="sr-only" aria-live="polite">{announce}</p>

          {!run && (
            <p className="small subtle challenge-idle">
              <strong>Run</strong> checks your code against the {visibleCount} example test{visibleCount === 1 ? '' : 's'}. <strong>Submit</strong> runs those
              {hiddenCount ? ` plus ${hiddenCount} hidden test${hiddenCount === 1 ? '' : 's'}` : ''} and counts as a solve when everything passes.
            </p>
          )}

          {run?.fatal && (
            <div className="callout bad challenge-fatal">
              <CircleAlert size={18} />
              <div className="stack-sm">
                <span className="mono challenge-error-text">
                  {run.fatal.line ? `Line ${run.fatal.line}: ` : ''}
                  {run.fatal.message}
                </span>
                {errorHint(run.fatal.message, run.language) && (
                  <span>
                    <Inline text={errorHint(run.fatal.message, run.language)} />
                  </span>
                )}
                {run.fatal.line && (
                  <div>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => goToLine(run.fatal.line)}>
                      Go to line {run.fatal.line}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {run && run.outcome === 'cancelled' && <p className="small subtle">Stopped. Run again when you are ready.</p>}

          {run && !run.fatal && (
            <>
              <ol className="challenge-chips" aria-label="Tests">
                {run.tests.map((test, pos) => {
                  const result = run.results[pos]
                  const status = result ? result.status : run.status === 'running' ? (run.current === pos ? 'running' : 'pending') : 'skipped'
                  const { Icon, text } = STATUS[status]
                  const locked = test.hidden && !solved && !unlocked.has(test.index)
                  return (
                    <li key={test.index}>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) chipRefs.current.set(test.index, el)
                          else chipRefs.current.delete(test.index)
                        }}
                        className={`challenge-chip is-${status}`}
                        aria-pressed={selected === pos}
                        aria-label={`${test.label}: ${text}`}
                        disabled={!result}
                        onClick={() => selectTest(pos)}
                      >
                        <Icon size={13} className={status === 'running' ? 'spin' : undefined} aria-hidden="true" />
                        {test.label}
                        {locked && <Lock size={11} aria-hidden="true" />}
                      </button>
                    </li>
                  )
                })}
              </ol>
              {selected !== null && run.results[selected] && (
                <TestDetail
                  key={`${run.tests[selected].index}-${run.kind}`}
                  test={run.tests[selected]}
                  result={run.results[selected]}
                  challenge={challenge}
                  language={run.language}
                  revealed={!run.tests[selected].hidden || solved || unlocked.has(run.tests[selected].index)}
                  onGoToLine={goToLine}
                />
              )}
              {run.status === 'done' && run.stdout && (
                <div className="challenge-detail-block">
                  <span className="challenge-label">Printed while your code loaded</span>
                  <pre className="challenge-value challenge-stdout">{run.stdout}</pre>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function Summary({ results, kind }) {
  const { passed, total, allPassed } = summarize(results)
  return (
    <span className={`challenge-summary ${allPassed ? 'is-good' : 'is-bad'}`}>
      {allPassed ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
      {passed} / {total} {kind === 'submit' ? 'tests' : 'examples'} passed
      <span className="challenge-meter" aria-hidden="true">
        <span style={{ width: `${total ? (passed / total) * 100 : 0}%` }} />
      </span>
    </span>
  )
}

/** Value text with the part that differs from `other` highlighted. */
function DiffValue({ text, other, side }) {
  if (other === null || other === undefined || other === text) return <pre className="challenge-value">{text}</pre>
  const d = diffStrings(text, other)
  const middle = side === 'actual' ? d.a : d.b
  return (
    <pre className="challenge-value">
      {d.prefix}
      {middle && <mark className={`challenge-diff challenge-diff-${side}`}>{middle}</mark>}
      {d.suffix}
    </pre>
  )
}

function TestDetail({ test, result, challenge, language, revealed, onGoToLine }) {
  const { Icon, text } = STATUS[result.status]
  const fmt = (value) => formatValue(value, { language, maxItems: 200 })
  const expectedText = fmt(test.expected)
  const actualText = result.hasActual ? fmt(result.actual) : null
  const failed = result.status === 'failed'
  const returnHint = failed ? missingReturnHint(result.actual, test.expected, language) : ''
  const hint = result.error ? errorHint(result.error.message, language) : ''
  const timing = typeof result.ms === 'number' && result.status !== 'timeout' ? ` in ${result.ms < 1 ? '<1' : Math.round(result.ms)} ms` : ''

  return (
    <div className={`challenge-detail is-${result.status}`}>
      <p className="challenge-detail-status">
        <Icon size={15} aria-hidden="true" />
        <strong>{test.label}</strong>
        <span>
          {text}
          {result.status === 'passed' ? timing : ''}
        </span>
      </p>

      {!revealed ? (
        <p className="small muted challenge-hidden-note">
          <Lock size={13} aria-hidden="true" /> This is a hidden test. Its input and expected answer stay hidden until you pass it.
          {failed && ' Your answer was different. Think about edge cases: empty input, one element, duplicates, negatives, very large values.'}
        </p>
      ) : (
        <>
          <div className="challenge-detail-block">
            <span className="challenge-label">Input</span>
            <pre className="challenge-value">{formatArgs(challenge.params, test.args, language) || '(no arguments)'}</pre>
          </div>
          <div className="challenge-detail-block">
            <span className="challenge-label">Expected</span>
            <DiffValue text={expectedText} other={failed ? actualText : null} side="expected" />
          </div>
          {actualText !== null && (
            <div className="challenge-detail-block">
              <span className="challenge-label">Your output</span>
              <DiffValue text={actualText} other={failed ? expectedText : null} side="actual" />
            </div>
          )}
        </>
      )}

      {returnHint && revealed && (
        <p className="small challenge-tip">
          <Inline text={returnHint} />
        </p>
      )}

      {result.error && (
        <div className="challenge-detail-block">
          <span className="challenge-label">{result.status === 'timeout' ? 'Time limit' : 'Error'}</span>
          <div className="challenge-error">
            <span className="mono challenge-error-text">
              {result.error.line ? `Line ${result.error.line}: ` : ''}
              {result.error.message}
            </span>
            {result.status === 'timeout' && (
              <span className="small muted">This test ran longer than the time limit. Look for a loop that never ends, or an approach that does far more work than it needs.</span>
            )}
            {hint && (
              <span className="small muted">
                <Inline text={hint} />
              </span>
            )}
            {result.error.trace?.length > 1 && (
              <pre className="challenge-trace">{result.error.trace.map((t) => `at ${t}`).join('\n')}</pre>
            )}
            {result.error.line && (
              <div>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onGoToLine(result.error.line)}>
                  Go to line {result.error.line}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {result.stdout && (
        <div className="challenge-detail-block">
          <span className="challenge-label">Printed output</span>
          <pre className="challenge-value challenge-stdout">{result.stdout}</pre>
        </div>
      )}
    </div>
  )
}

function Solution({ challenge, language, languages, onLanguage }) {
  const available = languages.filter((lang) => typeof challenge.solution?.[lang] === 'string')
  const shown = available.includes(language) ? language : available[0]
  return (
    <div className="challenge-solution-body rise">
      {available.length > 1 && (
        <div className="w-pill-group" role="group" aria-label="Solution language">
          {available.map((lang) => (
            <button key={lang} type="button" aria-pressed={lang === shown} onClick={() => onLanguage(lang)}>
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      )}
      {shown && <CodeBlock code={challenge.solution[shown]} language={shown} label={`${LANGUAGE_LABELS[shown]} solution`} />}
      {challenge.explanation && <RichText text={challenge.explanation} className="prose challenge-explanation" />}
      {challenge.complexity && (
        <dl className="challenge-complexity">
          {challenge.complexity.time && (
            <div>
              <dt>Time</dt>
              <dd>{challenge.complexity.time}</dd>
            </div>
          )}
          {challenge.complexity.space && (
            <div>
              <dt>Space</dt>
              <dd>{challenge.complexity.space}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
