import { memo, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, CircleAlert, Clock, Code, FileCode2, History, Loader2, MessagesSquare, Play, Timer, X } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import ChallengeView from '../components/ChallengeView'
import RichText, { Inline } from '../components/RichText'
import Modal from '../components/Modal'
import { ALL_CHALLENGES, CHALLENGE_SETS, loadChallenge } from '../lib/challenges'
import {
  BEHAVIORAL_CATEGORIES,
  BEHAVIORAL_WARNINGS,
  CODING_SHAPES,
  DRAFT_SCOPE,
  FORMATS,
  QUESTION_SECONDS,
  VERDICTS,
  WARNINGS,
  clearMockDrafts,
  createSession,
  crossedWarning,
  formatClock,
  getFormat,
  getQuestion,
  loadActive,
  mergeResult,
  parseValue,
  pickProblems,
  pickQuestions,
  readMockDraft,
  saveActive,
  secondsLeft,
  starCheck,
  stepsFor
} from '../lib/interview'
import { runChallengeTests } from '../activities/lib/runner'
import { languagesFor, selectTests, starterFor } from '../activities/lib/runner/tests'
import { formatValue } from '../activities/lib/runner/format'
import { formatRelative } from '../lib/dates'
import { uid } from '../lib/random'
import { sfx } from '../lib/sfx'
import { InterviewReview, StarChecklist } from './MockInterviewResult'

const FORMAT_ICONS = { coding: Code, oa: FileCode2, behavioral: MessagesSquare }
const START_LABELS = { coding: 'Start the interview', oa: 'Start the assessment', behavioral: 'Start the interview' }
const DIFFICULTY_TONE = { easy: 'good', medium: 'outline', hard: 'warn' }
const READ_STEPS = new Set(['clarify', 'plan', 'read'])

// The challenge workspace re-renders only when its own props change, not on every note keystroke.
const Workspace = memo(ChallengeView)

// ---- Shared pieces ----------------------------------------------------------------------

/** A countdown to a fixed deadline. Warnings fire once as each mark is crossed. */
function Countdown({ deadline, warnings = [], warnAt, urgentAt, onWarn, onExpire, label = 'Time left' }) {
  const [left, setLeft] = useState(() => secondsLeft(deadline))
  const [pulse, setPulse] = useState(false)
  const previous = useRef(null)
  const expired = useRef(false)
  const tick = useEffectEvent(() => {
    const next = secondsLeft(deadline)
    const mark = crossedWarning(previous.current, next, warnings)
    previous.current = next
    setLeft(next)
    if (mark !== null) {
      setPulse(true)
      setTimeout(() => setPulse(false), 2400)
      onWarn?.(mark)
    }
    if (next === 0 && !expired.current) {
      expired.current = true
      onExpire?.()
    }
  })
  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  const tone = left <= urgentAt ? ' is-urgent' : left <= warnAt ? ' is-warn' : ''
  return (
    <span className={`iv-clock${tone}${pulse ? ' pulse' : ''}`} role="timer" aria-label={`${label}: ${formatClock(left)}`}>
      <Timer size={15} aria-hidden="true" />
      <span className="tabular">{formatClock(left)}</span>
    </span>
  )
}

function Stepper({ steps, current, onPick, label }) {
  return (
    <ol className="iv-stepper" aria-label={label}>
      {steps.map((step, i) => (
        <li key={step.id}>
          <button
            type="button"
            className={`iv-step${i < current ? ' is-done' : ''}${i === current ? ' is-current' : ''}`}
            aria-current={i === current ? 'step' : undefined}
            aria-label={`Step ${i + 1}: ${step.title}`}
            onClick={() => onPick(i)}
          >
            <span className="iv-step-num" aria-hidden="true">{i < current ? <Check size={13} /> : i + 1}</span>
            <span className="iv-step-label" aria-hidden="true">{step.title}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function EndDialog({ onClose, onReview, onDiscard, leaveTo }) {
  return (
    <Modal
      title="End the interview?"
      description="Finish now to rate yourself and save it, or leave and come back: the clock keeps running, like a real interview."
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-danger" onClick={onDiscard}>Discard</button>
          <Link to={leaveTo} className="btn btn-ghost">Leave for now</Link>
          <button type="button" className="btn btn-primary" onClick={onReview} data-autofocus>Finish and review</button>
        </>
      }
    />
  )
}

// ---- Setup --------------------------------------------------------------------------------

function ResumeCard({ session, now, onDiscard }) {
  const format = getFormat(session.format)
  const left = session.format === 'behavioral' ? null : secondsLeft(session.startedAt + session.limit * 1000, now.getTime())
  const status = session.phase === 'review' ? 'Waiting for your review' : left === 0 ? 'Time is up. Review it to save it.' : left !== null ? `About ${Math.max(1, Math.round(left / 60))} min left on the clock` : `Question ${(session.current || 0) + 1} of ${session.questions.length}`
  return (
    <section className="card roomy iv-resume" aria-labelledby="iv-resume-title">
      <div className="catalog-head"><span className="callno" id="iv-resume-title">In progress</span><span className="stamp ink">{format?.title}</span></div>
      <p className="small">{status}{session.problems?.length ? `: ${session.problems.map((p) => p.title).join(' and ')}` : ''}.</p>
      <div className="row wrap">
        <Link to="/practice/interview/run" className="btn btn-primary"><Play size={16} /> {session.phase === 'review' ? 'Open the review' : 'Resume'}</Link>
        <button type="button" className="btn btn-ghost" onClick={onDiscard}>Discard</button>
      </div>
    </section>
  )
}

function InterviewHistory({ interviews, now }) {
  if (!interviews.length) {
    return <p className="small subtle iv-section">Your mock interviews will show up here. Aim for one a week from the time you start the pattern topics.</p>
  }
  return (
    <section className="iv-section" aria-labelledby="iv-history-title">
      <div className="section-head"><h2 className="section-title" id="iv-history-title"><History size={18} style={{ verticalAlign: '-3px' }} /> History</h2><span className="callno">{interviews.filter((i) => i.passed).length} of {interviews.length} passed</span></div>
      <div className="list">
        {interviews.slice(0, 12).map((record) => {
          const verdict = VERDICTS[record.verdict]
          const what = record.format === 'behavioral' ? `${(record.questions || []).length} questions` : (record.problems || []).map((p) => p.title).join(', ')
          return (
            <Link key={record.id} to={`/practice/interview/result/${record.id}`} className="list-row iv-history-row">
              <span className={`exam-pill${record.passed ? ' pass' : ''}`}><strong className="tabular">{typeof record.score === 'number' ? `${record.score}%` : 'n/a'}</strong></span>
              <div className="grow">
                <div className="list-title">{getFormat(record.format)?.title || 'Mock interview'}{verdict ? ` · ${verdict.label}` : ''}</div>
                <div className="xsmall subtle clamp-2">{what} · {formatRelative(record.date, now)}</div>
              </div>
              <ArrowRight size={16} className="subtle" aria-hidden="true" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/** /practice/interview: choose a format and pattern, read the rules, see past mocks. */
export default function MockInterview() {
  useDocumentTitle('Mock interview')
  const { practice, now, toast } = useApp()
  const navigate = useNavigate()
  const [format, setFormat] = useState('coding')
  const [shape, setShape] = useState('medium')
  const [pattern, setPattern] = useState('surprise')
  const [active, setActive] = useState(() => loadActive())
  const [confirmReplace, setConfirmReplace] = useState(false)
  const interviews = practice.interviews || []
  const chosen = getFormat(format)
  const sets = CHALLENGE_SETS.filter((s) => s.challenges.length)

  const discardActive = () => {
    if (active) clearMockDrafts((active.problems || []).map((p) => p.id))
    saveActive(null)
    setActive(null)
  }

  const begin = () => {
    const base = { id: uid(), format, shape, pattern, now: Date.now() }
    let session
    if (format === 'behavioral') {
      session = createSession({ ...base, questions: pickQuestions({ interviews }) })
    } else {
      const problems = pickProblems({ challenges: ALL_CHALLENGES, format, shape, pattern, solved: practice.challenges, interviews, now: Date.now() })
      if (!problems.length) {
        toast('No challenges match that pattern yet. Try "Surprise me".', { tone: 'bad' })
        return
      }
      clearMockDrafts(problems.map((p) => p.id))
      session = createSession({ ...base, problems })
    }
    if (active) clearMockDrafts((active.problems || []).map((p) => p.id))
    saveActive(session)
    sfx.flip()
    navigate('/practice/interview/run')
  }

  return (
    <div className="page narrow iv-setup">
      <Link to="/practice?tab=challenges" className="back-link small"><ChevronLeft size={16} /> Practice</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">Interview practice</div>
          <h1 className="page-title">Mock interview</h1>
          <p className="page-sub">Solving problems is half the job. The other half is doing it on a clock, out loud, without hints. Rehearse it here, then score yourself the way interviewers do.</p>
        </div>
      </div>

      {active && <ResumeCard session={active} now={now} onDiscard={discardActive} />}

      <section className="card roomy stack iv-choose" aria-labelledby="iv-format-title">
        <h2 className="section-title" id="iv-format-title">Choose a format</h2>
        <div className="iv-formats" role="radiogroup" aria-labelledby="iv-format-title">
          {FORMATS.map((f) => {
            const Icon = FORMAT_ICONS[f.id]
            return (
              <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className="iv-format" onClick={() => { setFormat(f.id); sfx.tap() }}>
                <span className="mode-icon sm" aria-hidden="true"><Icon size={16} /></span>
                <span className="iv-format-body">
                  <span className="iv-format-title">{f.title}</span>
                  <span className="xsmall subtle"><Clock size={11} style={{ verticalAlign: '-1px' }} /> {f.minutes} min{f.id === 'behavioral' ? ', 3 per question' : ''}</span>
                  <span className="small muted">{f.blurb}</span>
                </span>
              </button>
            )
          })}
        </div>

        {chosen.kind === 'coding' && (
          <div className="iv-options">
            {format === 'coding' && (
              <div className="field">
                <span className="label" id="iv-shape-label">Problems</span>
                <div className="segmented iv-segmented" role="group" aria-labelledby="iv-shape-label">
                  {CODING_SHAPES.map((s) => (
                    <button key={s.id} type="button" aria-pressed={shape === s.id} onClick={() => setShape(s.id)}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="iv-pattern">Pattern</label>
              <select id="iv-pattern" className="select" value={pattern} onChange={(e) => setPattern(e.target.value)}>
                <option value="surprise">Surprise me</option>
                {sets.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.challenges.length})</option>)}
              </select>
              <span className="hint">
                {pattern === 'surprise'
                  ? 'Any pattern, like a real interview. Problems you have not solved come first, and nothing you solved in the last two weeks.'
                  : 'Only this pattern, unsolved problems first.'}
              </span>
            </div>
          </div>
        )}

        <div className="stack-sm">
          <div className="eyebrow">The rules</div>
          <ul className="iv-rules">
            {chosen.rules.map((rule) => <li key={rule} className="small">{rule}</li>)}
          </ul>
        </div>

        <button type="button" className="btn btn-primary btn-lg iv-start" onClick={() => (active ? setConfirmReplace(true) : begin())}>
          <Play size={18} /> {START_LABELS[format]} · {chosen.minutes} min
        </button>
      </section>

      <InterviewHistory interviews={interviews} now={now} />

      {confirmReplace && (
        <Modal
          title="Start a new one?"
          description="You have an interview in progress. Starting a new one discards it."
          onClose={() => setConfirmReplace(false)}
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmReplace(false)} data-autofocus>Keep it</button>
              <button type="button" className="btn btn-primary" onClick={begin}>Start a new one</button>
            </>
          }
        />
      )}
    </div>
  )
}

// ---- Coding run ------------------------------------------------------------------------------

function ProblemStatement({ challenge }) {
  return (
    <section className="card roomy iv-problem-statement" aria-label="Problem">
      <div className="row wrap" style={{ gap: 8 }}>
        <h1 className="challenge-title">{challenge.title}</h1>
        {challenge.difficulty && <span className={`chip ${DIFFICULTY_TONE[challenge.difficulty] || 'outline'}`}>{challenge.difficulty}</span>}
      </div>
      <RichText text={challenge.prompt} className="prose challenge-prompt" />
      {Array.isArray(challenge.examples) && challenge.examples.length > 0 && (
        <div className="challenge-block">
          <h2 className="challenge-subhead">Examples</h2>
          {challenge.examples.map((example, i) => (
            <div key={i} className="challenge-example">
              <div className="challenge-example-row"><span className="challenge-label">Input</span><code>{example.input}</code></div>
              <div className="challenge-example-row"><span className="challenge-label">Output</span><code>{example.output}</code></div>
              {example.explain && <p className="challenge-example-why"><Inline text={example.explain} /></p>}
            </div>
          ))}
        </div>
      )}
      {Array.isArray(challenge.constraints) && challenge.constraints.length > 0 && (
        <div className="challenge-block">
          <h2 className="challenge-subhead">Constraints</h2>
          <ul className="challenge-constraints">
            {challenge.constraints.map((c, i) => <li key={i}><Inline text={c} /></li>)}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Run the learner's code on an input they choose, the way you would test by hand. */
function CustomCase({ challenge, getCode, onRan, locked }) {
  const params = challenge.params || []
  const example = selectTests(challenge, 'visible')[0]
  const [values, setValues] = useState(() => params.map((_, i) => (example ? JSON.stringify(example.args[i]) : '')))
  const [expected, setExpected] = useState('')
  const [state, setState] = useState(null)
  const job = useRef(null)
  useEffect(() => () => job.current?.cancel(), [])

  const run = () => {
    let args
    let want = null
    try {
      args = values.map((v) => parseValue(v))
      if (expected.trim()) want = { value: parseValue(expected) }
    } catch (e) {
      setState({ status: 'invalid', message: e.message })
      return
    }
    const current = getCode()
    const thisJob = runChallengeTests({ challenge: { ...challenge, tests: [{ args, expected: want ? want.value : null }] }, language: current.language, code: current.code, scope: 'visible' })
    job.current = thisJob
    setState({ status: 'running', language: current.language })
    sfx.tap()
    thisJob.promise.then((outcome) => {
      if (job.current !== thisJob) return
      job.current = null
      setState({ status: 'done', outcome, result: outcome.results[0], hasExpected: Boolean(want), language: current.language })
      onRan()
    })
  }

  const r = state?.status === 'done' ? state.result : null
  const fatal = state?.status === 'done' ? state.outcome.fatal : null
  const error = fatal || (r && (r.status === 'error' || r.status === 'timeout') ? r.error : null)
  return (
    <div className="iv-custom stack-sm">
      <div className="eyebrow">Try your own case</div>
      <div className="iv-custom-grid">
        {params.map((name, i) => (
          <div key={name} className="field">
            <label className="label mono" htmlFor={`iv-arg-${name}`}>{name}</label>
            <input
              id={`iv-arg-${name}`}
              className="input mono"
              value={values[i]}
              onChange={(e) => setValues((v) => v.map((x, k) => (k === i ? e.target.value : x)))}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              disabled={locked}
            />
          </div>
        ))}
        <div className="field">
          <label className="label" htmlFor="iv-expected">Expected <span className="subtle">(optional)</span></label>
          <input id="iv-expected" className="input mono" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Leave empty to see what it returns" spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={locked} />
        </div>
      </div>
      <div className="row wrap">
        <button type="button" className="btn" onClick={run} disabled={locked || state?.status === 'running'}>
          {state?.status === 'running' ? <><Loader2 size={15} className="spin" /> Running</> : <><Play size={15} /> Run my case</>}
        </button>
        <span className="xsmall subtle">Values are JSON: <code>[1, 2]</code>, <code>"text"</code>, <code>null</code>.</span>
      </div>
      <div aria-live="polite">
        {state?.status === 'invalid' && <p className="small bad-text">{state.message}</p>}
        {error && <p className="small bad-text mono iv-custom-out">{error.line ? `Line ${error.line}: ` : ''}{error.message}</p>}
        {r && !error && r.hasActual && (
          <p className="small iv-custom-out">
            Returned <code>{formatValue(r.actual, { language: state.language, maxItems: 60 })}</code>
            {state.hasExpected && (r.passed ? <span className="chip good xsmall"><Check size={11} /> matches</span> : <span className="chip bad xsmall"><X size={11} /> differs</span>)}
          </p>
        )}
        {r?.stdout && <pre className="challenge-value challenge-stdout">{r.stdout}</pre>}
      </div>
    </div>
  )
}

function StepPanel({ ref, step, index, steps, notes, onNote, onBack, onNext, nextLabel, locked, children, onEditor }) {
  const fields = step.fields || []
  return (
    <section ref={ref} className="card roomy iv-panel" aria-labelledby={`iv-step-${step.id}`}>
      <div className="catalog-head"><span className="callno">Step {index + 1} of {steps.length}</span><span className="callno hide-mobile">Typed notes are your thinking out loud</span></div>
      <h2 className="iv-step-title" id={`iv-step-${step.id}`}>{step.title}</h2>
      <p className="small muted">{step.guide}</p>
      {onEditor && (
        <button type="button" className="btn btn-sm iv-editor-jump" onClick={onEditor}><Code size={14} /> Go to the editor</button>
      )}
      {children}
      {fields.length > 0 && (
        <div className="iv-fields">
          {fields.map((f) => (
            <div key={f.id} className={`field${f.line ? ' iv-line' : ''}`}>
              <label className="label" htmlFor={`iv-${f.id}`}>{f.label}</label>
              {f.line ? (
                <input id={`iv-${f.id}`} className="input mono" value={notes?.[f.id] || ''} onChange={(e) => onNote(f.id, e.target.value)} placeholder={f.placeholder} readOnly={locked} spellCheck={false} autoCapitalize="off" />
              ) : (
                <textarea id={`iv-${f.id}`} className="textarea" rows={f.rows || 3} value={notes?.[f.id] || ''} onChange={(e) => onNote(f.id, e.target.value)} placeholder={f.placeholder} readOnly={locked} />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="iv-panel-nav">
        {index > 0 ? <button type="button" className="btn btn-ghost" onClick={onBack}><ArrowLeft size={16} /> {steps[index - 1].title}</button> : <span />}
        <button type="button" className="btn btn-primary" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>
      </div>
    </section>
  )
}

function CodingRun({ session, setSession, onEnd }) {
  const { toast } = useApp()
  const format = getFormat(session.format)
  const steps = stepsFor(session.format)
  const deadline = session.startedAt + session.limit * 1000
  const [timeUp, setTimeUp] = useState(() => secondsLeft(deadline) === 0)
  const [confirm, setConfirm] = useState(false)
  const [loaded, setLoaded] = useState({ map: {}, failed: false })
  const codeRef = useRef({})
  const panelRef = useRef(null)
  const lastView = useRef(null)
  const index = Math.min(session.current || 0, session.problems.length - 1)
  const problem = session.problems[index]
  const pid = problem.id
  const stepIndex = Math.min(session.steps?.[pid] || 0, steps.length - 1)
  const step = steps[stepIndex]
  const challenge = loaded.map[pid]
  const many = session.problems.length > 1

  useEffect(() => {
    let alive = true
    Promise.all(session.problems.map((p) => loadChallenge(p.id).catch(() => null))).then((list) => {
      if (alive) setLoaded({ map: Object.fromEntries(list.filter(Boolean).map((c) => [c.id, c])), failed: list.some((c) => !c) })
    })
    return () => {
      alive = false
    }
  }, [session.problems])

  // A new step or problem: bring its panel (or the problem statement) into view.
  const view = `${pid}:${stepIndex}`
  useEffect(() => {
    if (lastView.current === null) {
      lastView.current = view
      return
    }
    if (lastView.current === view) return
    lastView.current = view
    if (READ_STEPS.has(step.id) || step.id === 'code') window.scrollTo({ top: 0 })
    else panelRef.current?.scrollIntoView({ block: 'start' })
  }, [view, step.id])

  const currentCode = useCallback((id) => {
    const known = codeRef.current[id] || readMockDraft(id)
    if (known) return known
    const c = loaded.map[id]
    const language = languagesFor(c)[0] || 'javascript'
    return { code: starterFor(c, language), language }
  }, [loaded])

  const openReview = useCallback(() => {
    const code = {}
    for (const p of session.problems) {
      const c = codeRef.current[p.id] || readMockDraft(p.id)
      if (c) code[p.id] = c
    }
    const end = Math.min(Date.now(), deadline)
    setSession((s) => (s.phase === 'review' ? s : { ...s, phase: 'review', endedAt: end, code: { ...s.code, ...code } }))
    window.scrollTo({ top: 0 })
  }, [session.problems, deadline, setSession])

  const expire = useCallback(() => {
    setTimeUp(true)
    sfx.error()
  }, [])

  useEffect(() => {
    if (!timeUp) return
    const t = setTimeout(openReview, 3500)
    return () => clearTimeout(t)
  }, [timeUp, openReview])

  const warn = useCallback((mark) => {
    sfx.tick()
    toast(mark >= 600 ? '10 minutes left. If you have not tested yet, start now.' : '2 minutes left. Wrap up: say the final complexity and what you would improve.', { tone: mark >= 600 ? 'neutral' : 'bad', duration: 6000 })
  }, [toast])

  const onResult = useCallback((summary) => {
    setSession((s) => ({ ...s, results: { ...s.results, [pid]: mergeResult(s.results?.[pid], summary) } }))
  }, [pid, setSession])
  const onCode = useCallback((code, language) => {
    codeRef.current[pid] = { code, language }
  }, [pid])
  const onCustomRan = () => setSession((s) => ({ ...s, results: { ...s.results, [pid]: mergeResult(s.results?.[pid], { kind: 'custom' }) } }))

  const setStep = (n) => {
    sfx.tap()
    setSession((s) => ({ ...s, steps: { ...s.steps, [pid]: n } }))
  }
  const switchProblem = (k) => {
    sfx.tap()
    setSession((s) => ({ ...s, current: k }))
  }
  const setNote = (field, value) => setSession((s) => ({ ...s, notes: { ...s.notes, [pid]: { ...s.notes?.[pid], [field]: value } } }))

  const lastStep = stepIndex === steps.length - 1
  const lastProblem = index === session.problems.length - 1
  const next = () => {
    if (!lastStep) setStep(stepIndex + 1)
    else if (!lastProblem) switchProblem(index + 1)
    else openReview()
  }
  const nextLabel = !lastStep ? `Next: ${steps[stepIndex + 1].title}` : !lastProblem ? 'Next problem' : 'Finish and review'
  const toEditor = () => document.querySelector('.iv-run .challenge-work')?.scrollIntoView({ block: 'start' })

  const panel = (
    <StepPanel
      ref={panelRef}
      key={`${pid}-${step.id}`}
      step={step}
      index={stepIndex}
      steps={steps}
      notes={session.notes?.[pid]}
      onNote={setNote}
      onBack={() => setStep(stepIndex - 1)}
      onNext={next}
      nextLabel={nextLabel}
      locked={timeUp}
      onEditor={step.id === 'code' ? toEditor : null}
    >
      {step.id === 'test' && challenge && <CustomCase key={pid} challenge={challenge} getCode={() => currentCode(pid)} onRan={onCustomRan} locked={timeUp} />}
    </StepPanel>
  )

  return (
    <div className="iv iv-run">
      <header className="iv-bar">
        <button type="button" className="icon-btn iv-icon" onClick={() => setConfirm(true)} aria-label="End or leave the interview"><X size={20} /></button>
        <Stepper steps={steps} current={stepIndex} onPick={setStep} label={many ? `Steps for problem ${index + 1}` : 'Interview steps'} />
        <Countdown deadline={deadline} warnings={WARNINGS} warnAt={600} urgentAt={120} onWarn={warn} onExpire={expire} />
      </header>

      <main className="iv-main" id="main">
        {timeUp && (
          <div className="callout bad iv-timeup" role="alert">
            <Clock size={18} />
            <div className="stack-sm">
              <span><strong>Time. Pens down.</strong> The editor is locked and your review opens in a moment.</span>
              <div><button type="button" className="btn btn-sm" onClick={openReview}>Open the review now</button></div>
            </div>
          </div>
        )}

        <div className="iv-head">
          <span className="eyebrow">{format.title} · {many ? `Problem ${index + 1} of ${session.problems.length}` : problem.difficulty}</span>
          {many && (
            <div className="segmented iv-segmented" role="group" aria-label="Problem">
              {session.problems.map((p, k) => (
                <button key={p.id} type="button" aria-pressed={k === index} onClick={() => switchProblem(k)}>
                  {session.results?.[p.id]?.best?.allPassed && <Check size={13} aria-label="solved" />}
                  Problem {k + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {loaded.failed && (
          <div className="callout warn"><CircleAlert size={18} /><span>A problem in this interview is no longer available. Finish and review, then start a new one.</span></div>
        )}

        {!challenge ? (
          !loaded.failed && <div className="activity-loading"><Loader2 size={18} className="spin" /> Loading the problem</div>
        ) : READ_STEPS.has(step.id) ? (
          <div className="iv-read">
            <ProblemStatement challenge={challenge} />
            {panel}
          </div>
        ) : (
          <>
            {step.id === 'code' ? panel : null}
            <Workspace
              key={pid}
              challenge={challenge}
              standalone
              hideHints
              hideSolution
              locked={timeUp}
              draftScope={DRAFT_SCOPE}
              onResult={onResult}
              onCode={onCode}
            />
            {step.id !== 'code' ? panel : null}
          </>
        )}
      </main>

      {confirm && <EndDialog onClose={() => setConfirm(false)} onReview={() => { setConfirm(false); openReview() }} onDiscard={onEnd} leaveTo="/practice/interview" />}
    </div>
  )
}

// ---- Behavioral run -----------------------------------------------------------------------

function BehavioralRun({ session, setSession, onEnd }) {
  const { toast } = useApp()
  const index = Math.min(session.current || 0, session.questions.length - 1)
  const qid = session.questions[index].id
  const question = getQuestion(qid)
  const answer = session.answers?.[qid] || {}
  const deadline = (answer.startedAt || session.startedAt) + QUESTION_SECONDS * 1000
  const [expiredFor, setExpiredFor] = useState(() => (secondsLeft(deadline) === 0 ? qid : null))
  const [confirm, setConfirm] = useState(false)
  const locked = expiredFor === qid
  const text = answer.text || ''
  const check = starCheck(text)
  const last = index === session.questions.length - 1

  const setText = (value) => setSession((s) => ({ ...s, answers: { ...s.answers, [qid]: { ...s.answers?.[qid], text: value } } }))

  const finishQuestion = (toReview) => {
    const at = Date.now()
    setSession((s) => {
      const a = s.answers?.[qid] || {}
      const seconds = Math.min(QUESTION_SECONDS, Math.max(0, Math.round((at - (a.startedAt || at)) / 1000)))
      const answers = { ...s.answers, [qid]: { ...a, seconds, done: true } }
      if (toReview || index + 1 >= s.questions.length) return { ...s, answers, phase: 'review', endedAt: at }
      const nextId = s.questions[index + 1].id
      answers[nextId] = { text: '', ...answers[nextId], startedAt: answers[nextId]?.startedAt || at }
      return { ...s, answers, current: index + 1 }
    })
    sfx.flip()
    window.scrollTo({ top: 0 })
  }

  const warn = useCallback(() => {
    sfx.tick()
    toast('30 seconds. Land the result and what you learned.', { duration: 5000 })
  }, [toast])
  const expire = useCallback(() => {
    setExpiredFor(qid)
    sfx.error()
  }, [qid])

  return (
    <div className="iv iv-run">
      <header className="iv-bar">
        <button type="button" className="icon-btn iv-icon" onClick={() => setConfirm(true)} aria-label="End or leave the interview"><X size={20} /></button>
        <div className="iv-bar-mid">
          <span className="iv-bar-title">Question {index + 1} of {session.questions.length}</span>
          <span className="bar iv-progress" aria-hidden="true"><span style={{ width: `${(index / session.questions.length) * 100}%` }} /></span>
        </div>
        <Countdown key={qid} deadline={deadline} warnings={BEHAVIORAL_WARNINGS} warnAt={60} urgentAt={30} onWarn={warn} onExpire={expire} label="Time left for this answer" />
      </header>

      <main className="iv-main iv-narrow" id="main">
        <section className="card roomy stack iv-question" aria-labelledby="iv-question-text">
          <div className="catalog-head"><span className="callno">{BEHAVIORAL_CATEGORIES[question?.category] || 'Behavioral'}</span><span className="callno">STAR</span></div>
          <h1 className="iv-question-text" id="iv-question-text">{question?.question || 'This question is no longer available.'}</h1>
          {locked && (
            <div className="callout warn" role="alert">
              <Clock size={18} />
              <span>Time. In a real interview you would land the result in one sentence and stop. {last ? 'Finish to review your answers.' : 'Move on to the next question.'}</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="iv-answer" className="label">Your answer</label>
            <textarea
              id="iv-answer"
              className="textarea lined iv-answer"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={locked}
              placeholder={'Situation: where, when, who, in a sentence or two.\nTask: what you needed to get done.\nAction: what you did, step by step, with "I".\nResult: what happened, with a number, and what you learned.'}
            />
            <div className="row between wrap xsmall">
              <span className="tabular subtle">{check.words} words · "I" {check.iCount} · "we" {check.weCount}</span>
              <span className="subtle">Say it out loud first if you can, then type it.</span>
            </div>
          </div>
          <StarChecklist check={check} />
          <div className="iv-panel-nav">
            <span />
            <button type="button" className="btn btn-primary btn-lg" onClick={() => finishQuestion(false)}>
              {last ? 'Finish and review' : 'Next question'} <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>

      {confirm && <EndDialog onClose={() => setConfirm(false)} onReview={() => { setConfirm(false); finishQuestion(true) }} onDiscard={onEnd} leaveTo="/practice/interview" />}
    </div>
  )
}

// ---- The run route ---------------------------------------------------------------------------

/**
 * /practice/interview/run: the interview in progress, full screen with a sticky timer, then
 * the review. The session lives in localStorage so a reload or a trip away resumes it.
 */
export function InterviewRun() {
  useDocumentTitle('Mock interview')
  const navigate = useNavigate()
  const [session, setSession] = useState(() => loadActive())
  const closed = useRef(false)
  const latest = useRef(session)

  useEffect(() => {
    latest.current = session
    if (closed.current || !session) return
    const t = setTimeout(() => !closed.current && saveActive(session), 250)
    return () => clearTimeout(t)
  }, [session])

  // Save immediately when leaving, so the last keystrokes survive.
  useEffect(() => () => {
    if (!closed.current && latest.current) saveActive(latest.current)
  }, [])

  const close = useCallback(() => {
    closed.current = true
  }, [])

  const discard = () => {
    close()
    saveActive(null)
    clearMockDrafts((session?.problems || []).map((p) => p.id))
    navigate('/practice/interview', { replace: true })
  }

  if (!session) return <Navigate to="/practice/interview" replace />
  if (session.phase === 'review') return <InterviewReview session={session} setSession={setSession} onClose={close} />
  if (session.format === 'behavioral') return <BehavioralRun session={session} setSession={setSession} onEnd={discard} />
  return <CodingRun session={session} setSession={setSession} onEnd={discard} />
}

