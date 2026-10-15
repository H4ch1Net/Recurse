import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, ChevronLeft, CircleCheck, CircleX, Code, Eye, EyeOff, FlaskConical, Lightbulb, MessageSquareText, RotateCcw, Target, TriangleAlert, Zap } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useLesson } from '../hooks/useLesson'
import { topicOf } from '../lib/progress'
import { codeLanguage } from '../lib/packs'
import { createRandom, shuffle } from '../lib/random'
import { subjectLabel } from '../lib/subjects'
import { modeOf } from '../lib/approaches'
import { POP_RATES, seenPool } from '../lib/session'
import { challengesForTopic, labsForTopic } from '../lib/practice'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../lib/juice'
import RichText, { Inline } from '../components/RichText'
import CodeBlock from '../components/CodeBlock'
import Activity from '../activities/Activity'
import RecallBurst from '../components/RecallBurst'
import ModeIcon from '../components/ModeIcon'

/** Retrieval check at the end of a section (or a pretest at its start): answer before moving on. */
function SectionCheck({ check, passed, onPass, pretest = false }) {
  const order = useMemo(() => shuffle(check.choices.map((_, i) => i)), [check])
  const [picked, setPicked] = useState(null)
  const answered = picked !== null
  const correct = picked === check.answer

  const choose = (index, event) => {
    if (answered) return
    setPicked(index)
    const box = event.currentTarget.closest('.lesson-check')
    if (index === check.answer) {
      feedbackCorrect(event.currentTarget)
      onPass?.()
    } else feedbackWrong(box)
  }

  return (
    <div className={`lesson-check${pretest ? ' pretest' : ''}`} aria-live="polite">
      <div className="catalog-head">
        <span className="callno">{pretest ? <><Zap size={12} /> Guess first</> : 'Check yourself'}</span>
        {passed && !answered && !pretest && <span className="stamp good">Passed</span>}
        {answered && correct && <span className="stamp good press">Correct</span>}
      </div>
      {pretest && !answered && <p className="xsmall subtle">You have not read this section yet. Guess anyway: a wrong guess now makes the explanation stick better.</p>}
      <p className="lesson-check-q"><Inline text={check.question} /></p>
      <div className="choices compact">
        {order.map((original, i) => {
          const state = !answered ? '' : original === check.answer ? ' is-correct' : original === picked ? ' is-wrong' : ' is-dim'
          return (
            <button key={original} type="button" className={`choice${state}`} onClick={(e) => choose(original, e)} disabled={answered}>
              <span className="choice-key">{String.fromCharCode(65 + i)}</span>
              <span className="choice-text"><Inline text={check.choices[original]} /></span>
              {answered && original === check.answer && <CircleCheck size={18} className="choice-icon good-text" />}
              {answered && original === picked && !correct && <CircleX size={18} className="choice-icon bad-text" />}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className={`callout ${correct ? 'good' : pretest ? 'info' : 'bad'} rise`}>
          {correct ? <CircleCheck size={18} /> : <CircleX size={18} />}
          <div className="grow">
            <strong>{correct ? 'Right.' : pretest ? 'Good guess to have made.' : 'Not quite.'}</strong> <Inline text={check.explanation} />
          </div>
          {!correct && !pretest && (
            <button type="button" className="btn btn-sm" onClick={() => setPicked(null)}><RotateCcw size={14} /> Try again</button>
          )}
        </div>
      )}
    </div>
  )
}

/** Teach-it-back: a sentence or two in your own words, checked against the key terms. */
function SayItBack({ section, terms }) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const used = terms.filter((t) => text.toLowerCase().includes(t.term.toLowerCase().split(/[ (,/]/)[0]))
  return (
    <div className="say-it-back">
      <div className="catalog-head"><span className="callno"><MessageSquareText size={12} /> Say it in your words</span>{done && <span className="stamp good press">Noted</span>}</div>
      <p className="small muted">In one or two sentences, explain “{section.title}” as if to a friend. No peeking.</p>
      <textarea className="textarea lined" rows={2} value={text} onChange={(e) => setText(e.target.value)} readOnly={done} placeholder="It works like this, because..." aria-label={`Explain ${section.title}`} />
      <div className="row between wrap">
        <span className="xsmall subtle">{words} words{used.length ? ` · used ${used.map((t) => t.term).join(', ')}` : ''}</span>
        {!done && (
          <button type="button" className="btn btn-sm" disabled={words < 8} onClick={(e) => { setDone(true); feedbackSuccess(e.currentTarget, 'Explained') }}>
            <Check size={14} /> Done
          </button>
        )}
      </div>
    </div>
  )
}

function SectionBody({ pack, section, mode, index, topic, onActivity }) {
  const activity = section.activity && (
    <div className={mode === 'builder' || mode === 'visual' ? 'activity-first' : ''}>
      {(mode === 'builder' || mode === 'visual') && <div className="eyebrow activity-first-label"><FlaskConical size={12} /> {mode === 'builder' ? 'Try it first' : 'Watch it work'}</div>}
      <Activity spec={section.activity} done={Boolean(topic.activities?.[index])} onComplete={(result) => onActivity(index, result)} />
    </div>
  )
  const code = section.code && <CodeBlock code={section.code} language={codeLanguage(pack, section)} />
  const body = <RichText text={section.body} />
  const tip = section.tip && (
    <div className="callout">
      <Lightbulb size={16} />
      <span><Inline text={section.tip} /></span>
    </div>
  )
  const pitfall = section.pitfall && (
    <div className="callout warn pitfall">
      <TriangleAlert size={16} />
      <span><strong>Common mistake.</strong> <Inline text={section.pitfall} /></span>
    </div>
  )
  if (mode === 'builder') return <>{activity}{body}{code}{tip}{pitfall}</>
  if (mode === 'visual') return <>{activity}{code}{body}{tip}{pitfall}</>
  return <>{body}{code}{tip}{pitfall}{activity}</>
}

export default function Lesson() {
  const { topicId } = useParams()
  const { packs, packMap, callNos, progress, settings, passCheck, markLessonRead, recordActivity, toast, now } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const pack = packMap.get(topicId)
  const mode = modeOf(settings)
  const [hideDefinitions, setHideDefinitions] = useState(mode.id === 'explainer')
  const [revealed, setRevealed] = useState({})
  const [active, setActive] = useState(0)
  const [readProgress, setReadProgress] = useState(0)
  const [warmupDone, setWarmupDone] = useState(false)
  useDocumentTitle(pack ? `${pack.name} lesson` : 'Lesson')

  const { lesson, error: lessonError } = useLesson(pack)
  const topic = topicOf(progress, topicId)

  // Pick warm-up and pop-quiz cards once per visit so they do not reshuffle as you answer.
  const [recall] = useState(() => {
    if (!pack) return { warmup: [], pops: {} }
    const random = createRandom(Date.now())
    const pool = seenPool(packs, progress, { excludeIds: [pack.id], now, random })
    const prereqs = new Set(pack.prereqs)
    const preferred = [...pool.filter((p) => prereqs.has(p.pack.id)), ...pool.filter((p) => !prereqs.has(p.pack.id))]
    const warmup = settings.warmups === false ? [] : preferred.slice(0, 3)
    const rest = pool.filter((p) => !warmup.includes(p))
    const rate = POP_RATES[settings.popQuiz ?? 'sometimes'] || 0
    const pops = {}
    const sections = pack.lesson?.sections?.length || 0
    let cursor = 0
    for (let i = 1; i < sections; i++) {
      if (cursor < rest.length && random() < rate * 1.6) pops[i] = [rest[cursor++]]
    }
    return { warmup, pops }
  })

  // Pretest questions for test-first mode: a bank question from each section, not its check.
  const pretests = useMemo(() => {
    if (mode.id !== 'challenger' || !pack) return {}
    const out = {}
    pack.questions.forEach((q) => {
      if (q.type === 'mcq' && Number.isInteger(q.section) && !out[q.section]) out[q.section] = { question: q.question, choices: q.choices, answer: q.answer, explanation: q.explanation }
    })
    return out
  }, [mode.id, pack])

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setReadProgress(max > 0 ? Math.min(1, window.scrollY / max) : 1)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!lesson) return
    const nodes = lesson.sections.map((_, i) => document.getElementById(`section-${i + 1}`)).filter(Boolean)
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(Number(visible[0].target.dataset.index))
      },
      { rootMargin: '-20% 0px -60% 0px' }
    )
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [lesson])

  // Deep links like #section-3 work once the lesson text has arrived. Activities above the
  // target load lazily and grow, so the target is kept in view until they settle or the
  // reader scrolls on their own.
  const lessonReady = Boolean(lesson)
  useEffect(() => {
    if (!location.hash || !lessonReady) return
    const align = () => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
    let settled = false
    const release = () => {
      settled = true
    }
    const observer = new ResizeObserver(() => {
      if (!settled) align()
    })
    const start = setTimeout(() => {
      align()
      observer.observe(document.body)
    }, 60)
    const stop = setTimeout(release, 2500)
    const inputs = ['wheel', 'touchstart', 'keydown', 'mousedown']
    inputs.forEach((type) => window.addEventListener(type, release, { passive: true }))
    return () => {
      clearTimeout(start)
      clearTimeout(stop)
      observer.disconnect()
      inputs.forEach((type) => window.removeEventListener(type, release))
    }
  }, [location.hash, lessonReady])

  if (!pack) return <Navigate to="/library" replace />
  if (!pack.lesson) return <Navigate to={`/topic/${topicId}`} replace />
  if (!lesson) {
    return (
      <div className="page reading" aria-busy={!lessonError}>
        <Link to={`/topic/${pack.id}`} className="back-link small"><ChevronLeft size={16} /> {pack.name}</Link>
        {lessonError ? (
          <div className="callout bad"><TriangleAlert size={18} /><span>This lesson could not be loaded. Check your connection and try again.</span></div>
        ) : (
          <div className="page-loading"><div className="skeleton title" /><div className="skeleton line" /><div className="skeleton block" /></div>
        )}
      </div>
    )
  }

  const passedCount = lesson.sections.filter((_, i) => topic.checks?.[i]).length
  const allPassed = passedCount === lesson.sections.length
  const activityCount = lesson.sections.filter((s) => s.activity).length
  const activitiesDone = lesson.sections.filter((s, i) => s.activity && topic.activities?.[i]).length
  const labs = labsForTopic(pack.id)
  const challenges = challengesForTopic(pack.id)
  const startPractice = () => {
    markLessonRead(pack.id)
    navigate(`/study/topic/${pack.id}`)
  }
  const onActivity = (index, result) => {
    const xp = recordActivity(pack.id, index, result)
    if (xp > 3) toast(`Activity complete · +${xp} XP`, { tone: 'good' })
  }

  const finishActions = []
  const studyBtn = <button key="study" type="button" className="btn btn-primary btn-lg" onClick={startPractice}>Start practicing <ArrowRight size={18} /></button>
  const explainBtn = <Link key="explain" to={`/topic/${pack.id}/explain`} className={`btn btn-lg${mode.id === 'explainer' ? ' btn-primary' : ''}`} onClick={() => markLessonRead(pack.id)}><MessageSquareText size={18} /> Explain it in your words</Link>
  if (mode.id === 'explainer') finishActions.push(explainBtn, <button key="study" type="button" className="btn btn-lg" onClick={startPractice}>Start practicing <ArrowRight size={18} /></button>)
  else finishActions.push(studyBtn, explainBtn)

  return (
    <>
      <div className="read-progress" style={{ transform: `scaleX(${readProgress})` }} aria-hidden="true" />
      <div className="page reading">
        <Link to={`/topic/${pack.id}`} className="back-link small"><ChevronLeft size={16} /> {pack.name}</Link>
        <div className="lesson-layout">
          <aside className="lesson-toc" aria-label="Lesson outline">
            <div className="eyebrow">In this lesson</div>
            <ol>
              {lesson.sections.map((section, i) => (
                <li key={i}>
                  <a href={`#section-${i + 1}`} className={active === i ? 'active' : ''} aria-current={active === i ? 'location' : undefined}>
                    <span className={`outline-dot${topic.checks?.[i] ? ' done' : ''}`} aria-hidden="true">{topic.checks?.[i] ? <Check size={11} /> : String(i + 1).padStart(2, '0')}</span>
                    {section.title}
                    {section.activity && <FlaskConical size={11} className={`toc-activity${topic.activities?.[i] ? ' done' : ''}`} aria-label="Has an activity" />}
                  </a>
                </li>
              ))}
              <li><a href="#key-terms"><span className="outline-dot aux" aria-hidden="true">Aa</span>Key terms</a></li>
              <li><a href="#summary"><span className="outline-dot aux" aria-hidden="true">Σ</span>Summary</a></li>
            </ol>
            <div className="xsmall subtle" style={{ marginTop: 'var(--s-4)' }}>{passedCount} of {lesson.sections.length} checks passed</div>
            <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${(passedCount / lesson.sections.length) * 100}%` }} /></div>
            {activityCount > 0 && <div className="xsmall subtle" style={{ marginTop: 'var(--s-3)' }}>{activitiesDone} of {activityCount} activities done</div>}
          </aside>

          <article className="lesson-article">
            <header className="lesson-header">
              <div className="eyebrow"><span style={{ color: 'var(--ink)' }}>{callNos.get(pack.id)}</span> · {subjectLabel(pack.subject)} · {lesson.estimatedMinutes} min{activityCount ? ` · ${activityCount} interactive` : ''}</div>
              <h1 className="page-title">{pack.name}</h1>
              {lesson.intro && <p className="lesson-intro"><Inline text={lesson.intro} /></p>}
              {lesson.objectives?.length > 0 && (
                <div className="objectives">
                  <div className="eyebrow"><Target size={12} /> You will be able to</div>
                  <ul>{lesson.objectives.map((o) => <li key={o}><Inline text={o} /></li>)}</ul>
                </div>
              )}
              <Link to="/approach" className="mode-banner small">
                <span className="mode-icon sm"><ModeIcon mode={mode} size={14} /></span>
                <span className="grow"><strong>{mode.label}:</strong> {mode.id === 'balanced' ? 'each section ends with a question. Answer from memory before scrolling back.' : mode.changes[0]}.</span>
                <span className="xsmall subtle hide-mobile">Change</span>
              </Link>
            </header>

            {!warmupDone && recall.warmup.length > 0 && <RecallBurst kind="warmup" entries={recall.warmup} onDone={() => setWarmupDone(true)} />}

            {lesson.sections.map((section, i) => (
              <div key={i}>
                {recall.pops[i] && <RecallBurst kind="pop" entries={recall.pops[i]} />}
                <section id={`section-${i + 1}`} data-index={i} className="lesson-section" aria-labelledby={`section-title-${i}`}>
                  <div className="lesson-section-num">§ {String(i + 1).padStart(2, '0')}</div>
                  <h2 id={`section-title-${i}`} className="lesson-section-title">{section.title}</h2>
                  {pretests[i] && <SectionCheck check={pretests[i]} pretest />}
                  <SectionBody pack={pack} section={section} mode={mode.id} index={i} topic={topic} onActivity={onActivity} />
                  {mode.id === 'explainer' && <SayItBack section={section} terms={lesson.keyTerms || []} />}
                  {section.check && <SectionCheck check={section.check} passed={Boolean(topic.checks?.[i])} onPass={() => passCheck(pack.id, i)} />}
                </section>
              </div>
            ))}

            {lesson.keyTerms?.length > 0 && (
              <section id="key-terms" className="lesson-section">
                <div className="row between wrap">
                  <h2 className="lesson-section-title">Key terms</h2>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-sm" onClick={() => { setHideDefinitions((v) => !v); setRevealed({}) }} aria-pressed={hideDefinitions}>
                      {hideDefinitions ? <Eye size={14} /> : <EyeOff size={14} />} {hideDefinitions ? 'Show definitions' : 'Quiz me: hide definitions'}
                    </button>
                    <Link to="/glossary" className="btn btn-sm btn-ghost">All terms</Link>
                  </div>
                </div>
                <dl className="terms">
                  {lesson.keyTerms.map((t) => (
                    <div key={t.term}>
                      <dt>{t.term}</dt>
                      {hideDefinitions && !revealed[t.term] ? (
                        <dd><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevealed((r) => ({ ...r, [t.term]: true }))}>Say it out loud, then reveal</button></dd>
                      ) : (
                        <dd className={hideDefinitions ? 'rise' : ''}>{t.definition}</dd>
                      )}
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {lesson.summary?.length > 0 && (
              <section id="summary" className="lesson-section">
                <h2 className="lesson-section-title">Summary</h2>
                <ul className="summary-list">
                  {lesson.summary.map((line, i) => <li key={i}><Inline text={line} /></li>)}
                </ul>
              </section>
            )}

            {(labs.length > 0 || challenges.length > 0) && (
              <section className="lesson-section">
                <h2 className="lesson-section-title">Hands-on practice</h2>
                <p className="muted small">Prove it with your hands. These come back for a redo on a spaced schedule, like your cards.</p>
                <div className="row wrap" style={{ gap: 8 }}>
                  {labs.map((lab) => <Link key={lab.id} to={`/practice/lab/${lab.id}`} className="lab-chip"><FlaskConical size={12} /> {lab.title}</Link>)}
                  {challenges.map((c) => <Link key={c.id} to={`/practice/challenge/${c.id}`} className="lab-chip"><Code size={12} /> {c.title}</Link>)}
                </div>
              </section>
            )}

            <section className="card roomy lesson-finish">
              <h2 className="section-title">{allPassed ? 'All checks passed.' : 'Ready to practice?'}</h2>
              <p className="muted">
                {pack.questions.length} cards cover this lesson. Recurse will bring each one back just before you are likely to forget it.
              </p>
              <div className="row wrap">{finishActions}</div>
            </section>
          </article>
        </div>
      </div>
    </>
  )
}
