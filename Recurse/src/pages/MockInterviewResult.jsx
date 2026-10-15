import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, BookOpen, Check, ChevronLeft, CircleAlert, Clock, ListChecks, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getChallenge, loadChallenge } from '../lib/challenges'
import {
  BEHAVIORAL_CATEGORIES,
  LEVELS,
  STAR_PARTS,
  VERDICTS,
  clearMockDrafts,
  formatClock,
  getFormat,
  getQuestion,
  interviewFeedback,
  offlineChecklist,
  rubricAverage,
  rubricFor,
  saveActive,
  scoreInterview,
  starCheck,
  stepsFor,
  timeUsed
} from '../lib/interview'
import { isAIConfigured, PROVIDERS } from '../lib/ai'
import { starterFor } from '../activities/lib/runner/tests'
import { formatDuration, formatRelative } from '../lib/dates'
import { feedbackComplete } from '../lib/juice'
import { sfx } from '../lib/sfx'
import CodeBlock from '../components/CodeBlock'
import RichText from '../components/RichText'
import MemoryRing from '../components/MemoryRing'
import Modal from '../components/Modal'

const clip = (text, max) => {
  const t = String(text || '')
  return t.length > max ? `${t.slice(0, max)}...` : t
}

const DIFFICULTY_TONE = { easy: 'good', medium: 'outline', hard: 'warn' }

/** Which STAR parts an answer covers, plus its red flags. */
export function StarChecklist({ check }) {
  return (
    <div className="iv-star" aria-label="STAR checklist">
      <ul className="iv-star-parts">
        {STAR_PARTS.map((part) => {
          const ok = Boolean(check[part.id])
          return (
            <li key={part.id} className={`iv-star-part${ok ? ' is-ok' : ''}`} title={ok ? 'Covered' : part.tip}>
              {ok ? <Check size={13} aria-hidden="true" /> : <span className="iv-star-dot" aria-hidden="true" />}
              <span>{part.label}</span>
              <span className="sr-only">{ok ? 'covered' : 'not yet'}</span>
            </li>
          )
        })}
      </ul>
      {check.flags.length > 0 && (
        <ul className="iv-flags">
          {check.flags.map((flag) => (
            <li key={flag.id} className="xsmall warn-text"><CircleAlert size={12} aria-hidden="true" /> {flag.text}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function testLine(results, format) {
  const best = results?.best
  if (!best) {
    if (results?.runs) return `Ran the examples ${results.runs === 1 ? 'once' : `${results.runs} times`}, never submitted`
    return 'Not submitted'
  }
  const hidden = `hidden ${best.hiddenPassed} of ${best.hiddenTotal}`
  return format === 'oa' ? `Hidden tests: ${best.hiddenPassed} of ${best.hiddenTotal} passed` : `Best submission: ${best.passed} of ${best.total} tests (${hidden})`
}

function NotesList({ format, notes }) {
  const fields = stepsFor(format).flatMap((s) => s.fields).filter((f) => String(notes?.[f.id] || '').trim())
  if (!fields.length) return <p className="small subtle">No notes written. In a real interview, silence is the hardest thing to score.</p>
  return (
    <dl className="iv-notes">
      {fields.map((f) => (
        <div key={f.id}>
          <dt>{f.label}</dt>
          <dd>{notes[f.id]}</dd>
        </div>
      ))}
    </dl>
  )
}

function Checklist({ items }) {
  if (!items.length) return null
  const done = items.filter((i) => i.ok).length
  return (
    <div className="stack-sm">
      <div className="row between">
        <span className="eyebrow"><ListChecks size={13} style={{ verticalAlign: '-2px' }} /> Checklist</span>
        <span className="xsmall tabular subtle">{done} of {items.length}</span>
      </div>
      <ul className="iv-checklist">
        {items.map((item) => (
          <li key={item.id} className={item.ok ? 'is-ok' : ''}>
            <span className="iv-check-icon" aria-hidden="true">{item.ok ? <Check size={14} /> : <X size={14} />}</span>
            <div>
              <span className="small">{item.label}</span>
              <span className="sr-only">{item.ok ? ' (done)' : ' (not yet)'}</span>
              {!item.ok && <p className="xsmall muted">{item.tip}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AIFeedbackView({ feedback }) {
  return (
    <div className="stack rise">
      {feedback.summary && <p>{feedback.summary}</p>}
      <div className="grid-2 iv-ai-grid">
        {feedback.strengths.length > 0 && (
          <div className="card">
            <h3 className="small good-text feedback-title">What worked</h3>
            <ul className="iv-ai-list small">{feedback.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {feedback.improvements.length > 0 && (
          <div className="card">
            <h3 className="small warn-text feedback-title">What to improve</h3>
            <ul className="iv-ai-list small">{feedback.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
      </div>
      {feedback.nextStep && <p className="small"><strong>Practice next:</strong> {feedback.nextStep}</p>}
      <p className="xsmall subtle">AI feedback can be wrong. It only sees what you typed, not what you would have said out loud.</p>
    </div>
  )
}

function RubricForm({ format, rubric, onRate, suggested = {}, optional = false }) {
  const dims = rubricFor(format)
  return (
    <div className="stack">
      {dims.map((d) => (
        <fieldset key={d.id} className="iv-dim">
          <legend className="iv-dim-head">
            <span className="iv-dim-title">{d.title}</span>
            <span className="small muted">{d.question}</span>
            {suggested[d.id] && <span className="chip accent xsmall">AI suggests {suggested[d.id]}</span>}
          </legend>
          <div className="iv-levels">
            {d.levels.map((text, i) => {
              const n = i + 1
              const on = Number(rubric?.[d.id]) === n
              return (
                <label key={n} className={`iv-level${on ? ' is-on' : ''}`}>
                  <input type="radio" name={`iv-dim-${d.id}`} value={n} checked={on} onChange={() => onRate(d.id, n)} />
                  <span className="iv-level-head"><span className="iv-level-num">{n}</span> {LEVELS[i]}</span>
                  <span className="iv-level-text">{text}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
      {optional && <p className="xsmall subtle">Optional. An online assessment is graded only by its hidden tests, but rating yourself shows what to practice.</p>}
    </div>
  )
}

function RubricBars({ format, rubric }) {
  const dims = rubricFor(format).filter((d) => rubric?.[d.id])
  if (!dims.length) return null
  return (
    <div className="stack-sm">
      {dims.map((d) => {
        const n = Number(rubric[d.id])
        return (
          <div key={d.id} className="iv-bar-row">
            <span className="small">{d.title}</span>
            <span className={`bar${n <= 2 ? ' bar-warn' : ''}`}><span style={{ width: `${(n / 4) * 100}%` }} /></span>
            <span className="xsmall tabular subtle">{n} · {LEVELS[n - 1]}</span>
          </div>
        )
      })}
    </div>
  )
}

function howScored(format) {
  if (format === 'oa') return 'Only the hidden tests count, as in a real online assessment.'
  if (format === 'behavioral') return '70% your rubric, 30% how much of STAR your answers cover. A 1 on any dimension caps it at borderline.'
  return '60% your rubric, 40% tests passed. A 1 on any dimension caps it at borderline, because one weak area often sinks a real decision.'
}

function VerdictHero({ format, result, seconds, limit, extra, children }) {
  const verdict = result.verdict ? VERDICTS[result.verdict] : null
  return (
    <section className="slip iv-verdict">
      <div className="catalog-head">
        <span className="callno">Mock interview · {getFormat(format)?.title}</span>
        {verdict && <span className={`stamp press${verdict.tone === 'good' ? ' good' : ''}`}>{verdict.label}</span>}
      </div>
      <div className="iv-verdict-body">
        <MemoryRing value={result.score === null ? null : result.score / 100} size={112} stroke={9} label="score" />
        <div className="stack-sm">
          <h1 className="page-title iv-verdict-title">{verdict ? verdict.label : 'Rate yourself to see the verdict'}</h1>
          <p className="small muted">{verdict ? verdict.note : howScored(format)}</p>
          <p className="xsmall subtle">
            <Clock size={12} style={{ verticalAlign: '-2px' }} /> {formatDuration(seconds)} of {formatDuration(limit)}{extra ? ` · ${extra}` : ''}
          </p>
        </div>
      </div>
      {children}
    </section>
  )
}

function useChallenges(problems) {
  const [map, setMap] = useState({})
  useEffect(() => {
    let alive = true
    Promise.all((problems || []).map((p) => loadChallenge(p.id).catch(() => null))).then((list) => {
      if (alive) setMap(Object.fromEntries(list.filter(Boolean).map((c) => [c.id, c])))
    })
    return () => {
      alive = false
    }
  }, [problems])
  return map
}

function ProblemReview({ problem, format, notes, challenge, showCode = true }) {
  const mine = notes?.finalTime || notes?.planTime || ''
  return (
    <article className="card iv-problem">
      <div className="row between wrap">
        <h3 className="list-title">{problem.title}</h3>
        <span className={`chip ${DIFFICULTY_TONE[problem.difficulty] || 'outline'}`}>{problem.difficulty}</span>
      </div>
      <p className={`small ${problem.best?.allPassed || problem.results?.best?.allPassed ? 'good-text' : 'muted'}`}>{testLine(problem.results || { best: problem.best, runs: problem.runs }, format)}</p>
      {challenge?.complexity?.time && (
        <p className="small">
          Reference: time {challenge.complexity.time}{challenge.complexity.space ? `, space ${challenge.complexity.space}` : ''}.{' '}
          {format !== 'oa' && <span className="muted">Yours: {mine ? clip(mine, 60) : 'not stated'}.</span>}
        </p>
      )}
      <div className="iv-disclosures">
        <details className="iv-details">
          <summary className="small">Your notes</summary>
          <NotesList format={format} notes={notes} />
        </details>
        {showCode && problem.code && (
          <details className="iv-details">
            <summary className="small">Your code</summary>
            <CodeBlock code={problem.code} language={problem.language || 'javascript'} label="Your code" />
          </details>
        )}
        {challenge?.solution && (
          <details className="iv-details">
            <summary className="small">Reference solution</summary>
            {Object.entries(challenge.solution).filter(([, code]) => typeof code === 'string').slice(0, 1).map(([lang, code]) => (
              <CodeBlock key={lang} code={code} language={lang} label="Reference solution" />
            ))}
            {challenge.explanation && <RichText text={challenge.explanation} className="prose small" />}
          </details>
        )}
      </div>
    </article>
  )
}

function AnswerReview({ answer, index }) {
  const check = answer.star || starCheck(answer.text)
  return (
    <article className="card iv-answer-card">
      <div className="catalog-head"><span className="callno">Question {index + 1} · {BEHAVIORAL_CATEGORIES[answer.category] || 'Behavioral'}</span><span className="callno">{check.words} words</span></div>
      <h3 className="iv-answer-q">{answer.question}</h3>
      {answer.text ? <p className="small iv-answer-text">{answer.text}</p> : <p className="small subtle">No answer written.</p>}
      <StarChecklist check={check} />
      {answer.lookFor && <p className="small"><strong>What interviewers look for:</strong> <span className="muted">{answer.lookFor}</span></p>}
    </article>
  )
}

/** Build the problems and answers a review or saved result works with. */
function reviewData(session, challenges) {
  const problems = (session.problems || []).map((p) => {
    const c = challenges[p.id]
    const code = session.code?.[p.id]
    // Untouched starter code is not "your code".
    const written = code?.code && !(c && code.code.trim() === starterFor(c, code.language || 'javascript').trim()) ? code.code : ''
    return {
      ...p,
      prompt: c?.prompt || '',
      complexity: c?.complexity || null,
      results: session.results?.[p.id] || null,
      code: written,
      language: code?.language || null
    }
  })
  const answers = (session.questions || []).map((q) => {
    const meta = getQuestion(q.id)
    const a = session.answers?.[q.id] || {}
    return { id: q.id, category: meta?.category, question: meta?.question || '', lookFor: meta?.lookFor || '', text: a.text || '', seconds: a.seconds || 0, star: starCheck(a.text) }
  })
  return { problems, answers }
}

/**
 * The review after time is up (or the learner finished): results, a self-assessment rubric,
 * AI feedback or an offline checklist, then Save. The session stays in storage until saved.
 */
export function InterviewReview({ session, setSession, onClose }) {
  useDocumentTitle('Interview review')
  const { ai, recordInterview, recordPractice, toast } = useApp()
  const navigate = useNavigate()
  const challenges = useChallenges(session.problems)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const saving = useRef(false)
  const format = session.format
  const { problems, answers } = reviewData(session, challenges)
  const seconds = timeUsed(session)
  const rubric = session.rubric || {}
  const result = scoreInterview({ format, rubric, problems, answers })
  const checklist = offlineChecklist({ format, problems, notes: session.notes || {}, answers })
  const configured = isAIConfigured(ai)
  const optionalRubric = format === 'oa'
  const rubricDone = optionalRubric || rubricAverage(rubric, format) !== null
  const dims = rubricFor(format)
  const rated = dims.filter((d) => rubric[d.id]).length

  const rate = (dim, n) => {
    sfx.tap()
    setSession((s) => ({ ...s, rubric: { ...s.rubric, [dim]: n } }))
  }

  const getFeedback = async () => {
    setBusy(true)
    setError('')
    try {
      const feedback = await interviewFeedback(ai, { format, problems, notes: session.notes || {}, answers, seconds, limit: session.limit })
      setSession((s) => ({ ...s, feedback }))
      sfx.success()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const finishUp = () => {
    onClose?.()
    saveActive(null)
    clearMockDrafts((session.problems || []).map((p) => p.id))
  }

  const save = () => {
    if (saving.current || !rubricDone) return
    saving.current = true
    let xp = 0
    for (const p of problems) {
      if (p.results?.best?.allPassed) xp += recordPractice('challenge', p.id, { language: p.language, difficulty: p.difficulty, hintsUsed: 0, solutionUsed: false })
    }
    const notes = Object.fromEntries(Object.entries(session.notes || {}).map(([id, fields]) => [id, Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, clip(v, 800)]))]))
    const record = recordInterview({
      format,
      shape: session.shape,
      pattern: session.pattern,
      seconds,
      limit: session.limit,
      problems: problems.map((p) => ({ id: p.id, title: p.title, difficulty: p.difficulty, set: p.set, topic: p.topic, best: p.results?.best || null, runs: p.results?.runs || 0, submits: p.results?.submits || 0, custom: p.results?.custom || 0, language: p.language, code: clip(p.code, 3000) })),
      questions: answers.map((a) => ({ id: a.id, category: a.category, text: clip(a.text, 2000), seconds: a.seconds, coverage: a.star.coverage })),
      notes,
      rubric,
      score: result.score,
      verdict: result.verdict,
      passed: result.passed,
      feedback: session.feedback || null
    })
    xp += record.xp
    finishUp()
    toast(`Mock interview saved · +${xp} XP`, { tone: 'good' })
    navigate(`/practice/interview/result/${record.id}`, { replace: true })
  }

  const discard = () => {
    finishUp()
    navigate('/practice/interview', { replace: true })
  }

  const passedTests = problems.filter((p) => p.results?.best?.allPassed).length
  const extra = format === 'behavioral' ? `${answers.filter((a) => a.text.trim()).length} of ${answers.length} answered` : `${passedTests} of ${problems.length} solved`

  return (
    <div className="iv iv-review">
      <header className="iv-bar">
        <Link to="/practice/interview" className="icon-btn iv-icon" aria-label="Leave the review for now. It stays saved here until you finish."><ChevronLeft size={20} /></Link>
        <div className="iv-bar-mid"><span className="iv-bar-title">Review · {getFormat(format)?.title}</span></div>
        <span className="iv-clock is-done" aria-label={`Time used ${formatClock(seconds)}`}><Clock size={15} aria-hidden="true" /><span className="tabular">{formatClock(seconds)}</span></span>
      </header>

      <main className="iv-main iv-narrow" id="main">
        <VerdictHero format={format} result={result} seconds={seconds} limit={session.limit} extra={extra}>
          {result.verdict && <p className="xsmall subtle">{howScored(format)}</p>}
        </VerdictHero>

        {format !== 'behavioral' ? (
          <section className="stack" aria-labelledby="iv-problems-title">
            <h2 className="section-title" id="iv-problems-title">{problems.length === 1 ? 'The problem' : 'The problems'}</h2>
            {problems.map((p) => <ProblemReview key={p.id} problem={p} format={format} notes={session.notes?.[p.id]} challenge={challenges[p.id]} />)}
          </section>
        ) : (
          <section className="stack" aria-labelledby="iv-answers-title">
            <h2 className="section-title" id="iv-answers-title">Your answers</h2>
            {answers.map((a, i) => <AnswerReview key={a.id} answer={a} index={i} />)}
          </section>
        )}

        <section className="card roomy stack" aria-labelledby="iv-rubric-title">
          <div className="catalog-head"><span className="callno" id="iv-rubric-title">Rate yourself honestly</span><span className="callno tabular">{rated} / {dims.length}</span></div>
          <p className="small muted">Interviewers score each area from 1 to 4. Pick the description that matches what you actually did, not what you meant to do.</p>
          <RubricForm format={format} rubric={rubric} onRate={rate} suggested={session.feedback?.rubric} optional={optionalRubric} />
        </section>

        <section className="card roomy stack" aria-labelledby="iv-feedback-title">
          <h2 className="section-title" id="iv-feedback-title">Feedback</h2>
          {configured ? (
            session.feedback ? (
              <AIFeedbackView feedback={session.feedback} />
            ) : (
              <div className="stack-sm">
                <p className="small muted">An AI interviewer reads your {format === 'behavioral' ? 'answers' : 'notes and code'} and suggests a score for each area.</p>
                <div>
                  <button type="button" className="btn btn-lg" onClick={getFeedback} disabled={busy}>
                    {busy ? <><Loader2 size={18} className="spin" /> Reading your {format === 'behavioral' ? 'answers' : 'notes'}</> : <><Sparkles size={18} /> Get AI feedback</>}
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="xsmall subtle">
              Want written feedback too? <Link to="/settings#ai">Add an API key</Link> from {Object.values(PROVIDERS).map((p) => p.label).join(', ')}. Without one, this checklist reads your notes for the habits interviewers score.
            </p>
          )}
          {error && <div className="callout bad" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
          <Checklist items={checklist} />
        </section>

        <div className="iv-save">
          <div className="iv-save-inner">
            {!rubricDone && <span className="small muted iv-save-note">Rate all {dims.length} areas to save.</span>}
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDiscard(true)}>Discard</button>
            <button type="button" className="btn btn-primary btn-lg" onClick={save} disabled={!rubricDone || busy}>
              <Check size={18} /> Save and finish
            </button>
          </div>
        </div>
      </main>

      {confirmDiscard && (
        <Modal
          title="Discard this interview?"
          description="Nothing is saved and no XP is awarded. Your notes and code from this mock are deleted."
          onClose={() => setConfirmDiscard(false)}
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDiscard(false)} data-autofocus>Keep it</button>
              <button type="button" className="btn btn-danger" onClick={discard}>Discard</button>
            </>
          }
        />
      )}
    </div>
  )
}

/** A saved mock interview. */
export default function MockInterviewResult() {
  const { interviewId } = useParams()
  const { practice, packMap, now } = useApp()
  const record = (practice.interviews || []).find((i) => i.id === interviewId)
  useDocumentTitle('Mock interview result')
  const challenges = useChallenges(record?.problems)
  const celebrated = useRef(false)
  useEffect(() => {
    if (!record || celebrated.current) return
    celebrated.current = true
    if (Date.now() - new Date(record.date) < 15000 && record.passed) setTimeout(() => feedbackComplete({ big: record.verdict === 'strong' }), 250)
  }, [record])
  if (!record) return <Navigate to="/practice/interview" replace />

  const format = record.format
  const answers = (record.questions || []).map((q) => {
    const meta = getQuestion(q.id)
    return { id: q.id, category: q.category || meta?.category, question: meta?.question || '', lookFor: meta?.lookFor || '', text: q.text || '', star: starCheck(q.text) }
  })
  const result = { score: typeof record.score === 'number' ? record.score : null, verdict: record.verdict }
  const solved = (record.problems || []).filter((p) => p.best?.allPassed).length
  const extra = [format === 'behavioral' ? `${answers.length} questions` : `${solved} of ${(record.problems || []).length} solved`, `+${record.xp || 0} XP`, formatRelative(record.date, now)].join(' · ')
  const topics = [...new Set((record.problems || []).map((p) => p.topic || getChallenge(p.id)?.topic).filter((id) => id && packMap.has(id)))]

  return (
    <div className="page narrow iv-result">
      <Link to="/practice/interview" className="back-link small"><ChevronLeft size={16} /> Mock interviews</Link>
      <VerdictHero format={format} result={result} seconds={record.seconds || 0} limit={record.limit || 0} extra={extra}>
        <RubricBars format={format} rubric={record.rubric} />
        <div className="row wrap">
          <Link to="/practice/interview" className="btn btn-primary btn-lg"><RotateCcw size={18} /> Another mock</Link>
          {format !== 'behavioral' && <Link to="/practice?tab=challenges" className="btn btn-lg">Coding challenges <ArrowRight size={16} /></Link>}
          {format === 'behavioral' && packMap.has('swe-behavioral-interviews') && <Link to="/topic/swe-behavioral-interviews/lesson" className="btn btn-lg"><BookOpen size={16} /> Behavioral lesson</Link>}
        </div>
      </VerdictHero>

      {record.feedback && (
        <section className="card roomy stack iv-section">
          <h2 className="section-title"><Sparkles size={16} style={{ verticalAlign: '-2px' }} /> AI feedback</h2>
          <AIFeedbackView feedback={record.feedback} />
        </section>
      )}

      {format !== 'behavioral' ? (
        <section className="stack iv-section">
          <h2 className="section-title">{(record.problems || []).length === 1 ? 'The problem' : 'The problems'}</h2>
          {(record.problems || []).map((p) => (
            <div key={p.id} className="stack-sm">
              <ProblemReview problem={{ ...p, results: { best: p.best, runs: p.runs } }} format={format} notes={record.notes?.[p.id]} challenge={challenges[p.id]} />
              <div className="row wrap">
                {getChallenge(p.id) && <Link to={`/practice/challenge/${p.id}`} className="btn btn-sm">Solve it again <ArrowRight size={14} /></Link>}
              </div>
            </div>
          ))}
          {topics.length > 0 && (
            <p className="small muted">
              Brush up: {topics.map((id, i) => (
                <span key={id}>{i ? ', ' : ''}<Link to={`/topic/${id}/lesson`}>{packMap.get(id).name}</Link></span>
              ))}
            </p>
          )}
        </section>
      ) : (
        <section className="stack iv-section">
          <h2 className="section-title">Your answers</h2>
          <p className="small muted">Good stories are reusable. Keep the strongest ones as your story bank and practice them out loud.</p>
          {answers.map((a, i) => <AnswerReview key={a.id} answer={a} index={i} />)}
        </section>
      )}
    </div>
  )
}
