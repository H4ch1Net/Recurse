import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BookOpen, CircleCheck, CircleX, Clock, Eye, Lightbulb, Timer, X, RotateCcw, Brain } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { buildSession, requeue, dueSummary } from '../lib/session'
import { GRADES, Rating, previewDue, retrievability } from '../lib/memory'
import { checkTyped } from '../lib/answers'
import { codeLanguage } from '../lib/packs'
import { isChoiceType } from '../lib/packSchema'
import { QUESTION_TYPE_LABELS } from '../lib/subjects'
import { formatInterval, formatRelative, nowMs, secondsSince } from '../lib/dates'
import { topicMastery, topicOf } from '../lib/progress'
import CodeBlock from '../components/CodeBlock'
import RichText, { Inline } from '../components/RichText'
import { ConfirmDialog } from '../components/Modal'
import EmptyState from '../components/EmptyState'

const PROMPTS = {
  mcq: 'Choose the best answer.',
  'code-fill': 'Which option fills the blank?',
  debug: 'Find the bug.',
  typed: 'Type your answer.',
  recall: 'Answer in your head, or write it down, then reveal.'
}

function clock(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function topicMemory(topic, now) {
  const cards = Object.values(topic.cards || {}).filter((c) => c.reps > 0)
  if (!cards.length) return null
  return cards.reduce((sum, c) => sum + retrievability(c, now), 0) / cards.length
}

/** Build the queue and snapshot the "before" numbers the summary compares against. */
function startSession({ kind, topicId, packs, packMap, progress, settings, stats }) {
  const now = new Date()
  const built = buildSession({ kind, topicId, packs, progress, settings, stats, now })
  const memoryBefore = {}
  const masteryBefore = {}
  for (const id of new Set(built.items.map((i) => i.packId))) {
    memoryBefore[id] = topicMemory(topicOf(progress, id), now)
    masteryBefore[id] = topicMastery(progress[id]?.cards, packMap.get(id).questions.length)
  }
  return { ...built, memoryBefore, masteryBefore, started: now.getTime() }
}

/** Next due interval for each grade, as labels like "10m" or "4d". */
function intervalLabels(card, retention) {
  const now = new Date()
  const due = previewDue(card, { retention, now })
  return Object.fromEntries(Object.entries(due).map(([rating, date]) => [rating, formatInterval(new Date(date) - now)]))
}

/** Prompt to read the lesson before the first study session of a topic. */
function LessonPrompt({ pack, onStart }) {
  return (
    <div className="page narrow">
      <div className="card roomy stack">
        <div className="eyebrow">New topic</div>
        <h1 className="page-title">{pack.name}</h1>
        <p className="muted">
          The {pack.lesson.estimatedMinutes}-minute lesson explains everything these cards test. Reading it first makes the questions easier to place.
          Trying the questions cold also works: a wrong guess followed by the explanation is a strong way to learn.
        </p>
        <div className="row wrap">
          <Link to={`/topic/${pack.id}/lesson`} className="btn btn-primary btn-lg"><BookOpen size={18} /> Read the lesson</Link>
          <button type="button" className="btn btn-lg" onClick={onStart}>Start with questions</button>
        </div>
      </div>
    </div>
  )
}

export default function Study() {
  const { kind = 'review', topicId } = useParams()
  const navigate = useNavigate()
  const { packs, packMap, progress, settings, stats, now, recordReview, finishSession, toast } = useApp()
  const [session] = useState(() => startSession({ kind, topicId, packs, packMap, progress, settings, stats }))
  const pack0 = topicId ? packMap.get(topicId) : null
  const needsLessonPrompt = kind === 'topic' && pack0?.lesson && !progress[topicId]?.lessonRead && !Object.keys(progress[topicId]?.cards || {}).length
  const [skipLesson, setSkipLesson] = useState(false)

  const [items, setItems] = useState(session.items)
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState('answer')
  const [picked, setPicked] = useState(null)
  const [typed, setTyped] = useState('')
  const [outcome, setOutcome] = useState(null)
  const [showLesson, setShowLesson] = useState(false)
  const [results, setResults] = useState([])
  const [xp, setXp] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [focusDone, setFocusDone] = useState(false)
  const [intervals, setIntervals] = useState(null)
  const cardStart = useRef(session.started)
  const inputRef = useRef(null)
  const continueRef = useRef(null)
  const feedbackRef = useRef(null)
  const finished = useRef(false)
  useDocumentTitle(session.title)

  const item = items[index]
  const pack = item ? packMap.get(item.packId) : null
  const question = pack?.questions.find((q) => q.id === item.questionId)
  const card = item ? progress[item.packId]?.cards?.[item.questionId] : null
  const tick = useEffectEvent(() => {
    const seconds = Math.round((Date.now() - session.started) / 1000)
    setElapsed(seconds)
    if (settings.focusTimer && !focusDone && seconds >= settings.focusMinutes * 60) {
      setFocusDone(true)
      toast(`Focus block done. Take a ${settings.breakMinutes}-minute break when you finish this card.`, { duration: 8000 })
    }
  })
  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Focus management: input for typed answers, continue/rate buttons after answering.
  useEffect(() => {
    if (phase === 'answer' && (question?.type === 'typed' || question?.type === 'recall')) inputRef.current?.focus({ preventScroll: true })
    if (phase === 'feedback') {
      continueRef.current?.focus({ preventScroll: true })
      feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [phase, index, question])

  const correctCount = results.filter((r) => r.retry === 0 && r.correct).length
  const firstAttempts = results.filter((r) => r.retry === 0).length

  function finish(list = results, totalXp = xp) {
    if (finished.current) return
    finished.current = true
    const first = list.filter((r) => r.retry === 0)
    const touched = Object.keys(session.memoryBefore)
    const record = finishSession({
      kind: session.kind,
      topicId: session.topicId,
      title: session.title,
      cards: first.length,
      correct: first.filter((r) => r.correct).length,
      accuracy: first.length ? Math.round((first.filter((r) => r.correct).length / first.length) * 100) : 0,
      newCards: first.filter((r) => r.isNew).length,
      retries: list.length - first.length,
      xp: totalXp,
      seconds: Math.round(secondsSince(session.started)),
      results: list,
      topics: touched,
      memoryBefore: session.memoryBefore,
      masteryBefore: session.masteryBefore
    })
    navigate('/complete', { replace: true, state: { sessionId: record.id } })
  }

  function submitChoice(original) {
    if (phase !== 'answer') return
    setPicked(original)
    setOutcome({ correct: original === question.answer, given: question.choices[original] })
    setIntervals(intervalLabels(card, settings.desiredRetention))
    setPhase('feedback')
  }

  function submitTyped(giveUp = false) {
    if (phase !== 'answer') return
    if (!giveUp && !typed.trim()) return
    const check = giveUp ? { correct: false, nearMiss: false } : checkTyped(typed, question)
    setOutcome({ ...check, given: giveUp ? '' : typed.trim(), gaveUp: giveUp })
    setIntervals(intervalLabels(card, settings.desiredRetention))
    setPhase('feedback')
  }

  function reveal() {
    if (phase !== 'answer') return
    setOutcome({ correct: null, given: typed.trim() })
    setIntervals(intervalLabels(card, settings.desiredRetention))
    setPhase('feedback')
  }

  function rate(rating) {
    if (phase !== 'feedback' || !question) return
    const selfGraded = outcome.correct === null
    const correct = selfGraded ? rating !== Rating.Again : outcome.correct && rating !== Rating.Again
    const seconds = secondsSince(cardStart.current)
    const { card: next, xp: earned } = recordReview({
      packId: pack.id,
      question,
      rating,
      correct,
      isNew: item.isNew,
      seconds,
      given: outcome.given
    })
    const result = { key: item.key, packId: pack.id, questionId: question.id, correct, rating, isNew: item.isNew, retry: item.retry, due: next.due, given: outcome.given }
    const nextResults = [...results, result]
    const nextXp = xp + earned
    const nextItems = rating === Rating.Again ? requeue(items, index) : items
    setResults(nextResults)
    setXp(nextXp)
    setItems(nextItems)
    if (index + 1 >= nextItems.length) {
      finish(nextResults, nextXp)
      return
    }
    setIndex(index + 1)
    setPhase('answer')
    setPicked(null)
    setTyped('')
    setOutcome(null)
    setShowLesson(false)
    cardStart.current = nowMs()
  }

  const wrong = outcome && outcome.correct === false
  const canRate = phase === 'feedback' && !wrong
  const order = item?.order || []

  const keyActions = {
    Escape: () => (results.length ? setLeaving(true) : navigate(-1)),
    a: () => phase === 'answer' && isChoiceType(question?.type) && order[0] !== undefined && submitChoice(order[0]),
    b: () => phase === 'answer' && isChoiceType(question?.type) && order[1] !== undefined && submitChoice(order[1]),
    c: () => phase === 'answer' && isChoiceType(question?.type) && order[2] !== undefined && submitChoice(order[2]),
    d: () => phase === 'answer' && isChoiceType(question?.type) && order[3] !== undefined && submitChoice(order[3]),
    1: () => (canRate ? rate(Rating.Again) : false),
    2: () => (canRate ? rate(Rating.Hard) : false),
    3: () => (canRate ? rate(Rating.Good) : false),
    4: () => (canRate ? rate(Rating.Easy) : false),
    e: () => (phase === 'feedback' ? setShowLesson((v) => !v) : false),
    ' ': () => (phase === 'answer' && question?.type === 'recall' ? reveal() : false),
    Enter: () => {
      if (phase === 'feedback') rate(wrong ? Rating.Again : Rating.Good)
      else if (question?.type === 'recall') reveal()
      else return false
    }
  }
  const onKey = useEffectEvent((event) => {
    if (leaving || !item || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
    if (document.querySelector('[role="dialog"]')) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const action = keyActions[key]
    if (!action) return
    const target = event.target
    const typing = target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    // While typing, only Escape is a shortcut. Enter on a focused button activates that button.
    if (typing && key !== 'Escape') return
    if (key === 'Enter' && target instanceof HTMLButtonElement) return
    if (action(event) !== false) event.preventDefault()
  })
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (needsLessonPrompt && !skipLesson) return <LessonPrompt pack={pack0} onStart={() => setSkipLesson(true)} />

  if (!item) {
    const summary = dueSummary(packs, progress, settings, stats, now)
    return (
      <div className="page narrow">
        <div className="card">
          <EmptyState
            icon={kind === 'mistakes' ? CircleCheck : Brain}
            title={kind === 'mistakes' ? 'No mistakes to review' : 'Nothing to study right now'}
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <Link to="/library" className="btn btn-primary">Find a topic</Link>
                <Link to="/" className="btn">Back to Today</Link>
              </div>
            }
          >
            {kind === 'mistakes'
              ? 'Every card you missed has since been answered correctly.'
              : summary.nextDue
                ? `Your next review is due ${formatRelative(summary.nextDue, now)}. Start a new topic in the meantime.`
                : 'Read a lesson or start a topic, and its cards will show up here.'}
          </EmptyState>
        </div>
      </div>
    )
  }

  const section = question.section != null ? pack.lesson?.sections?.[question.section] : null
  const progressRatio = index / items.length
  const remaining = items.length - index

  return (
    <div className="study">
      <header className="study-bar">
        <button type="button" className="icon-btn" onClick={() => (results.length ? setLeaving(true) : navigate(-1))} aria-label="Leave session (Esc)" title="Leave session (Esc)">
          <X size={20} />
        </button>
        <div className="study-bar-mid">
          <div className="row between xsmall">
            <span className="study-title">{session.ahead ? 'Reviewing ahead' : session.title}{session.topicId && pack0 ? ` · ${pack0.name}` : ''}</span>
            <span className="tabular subtle" aria-label={`${remaining} cards left`}>{index + 1} / {items.length}</span>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={index}>
            <span style={{ width: `${progressRatio * 100}%` }} />
          </div>
        </div>
        <div className="study-bar-meta">
          {settings.focusTimer && (
            <span className={`chip ${focusDone ? 'warn' : 'outline'}`} title="Focus timer">
              <Timer size={13} />
              <span className="tabular">{focusDone ? 'Break' : clock(Math.max(0, settings.focusMinutes * 60 - elapsed))}</span>
            </span>
          )}
          {settings.showTimer && !settings.focusTimer && (
            <span className="chip outline hide-mobile" title="Session time"><Clock size={13} /><span className="tabular">{clock(elapsed)}</span></span>
          )}
          <span className="chip outline" title="Correct on first try">
            <CircleCheck size={13} /><span className="tabular">{correctCount}/{firstAttempts}</span>
          </span>
        </div>
      </header>

      <main className="study-main" id="main">
        <article className="study-card rise" key={`${item.key}:${item.retry}`} aria-labelledby="q-text">
          <div className="study-meta">
            <span className="chip">{pack.name}</span>
            <span className="chip outline">{QUESTION_TYPE_LABELS[question.type]}</span>
            {item.isNew && <span className="chip accent">New</span>}
            {item.retry > 0 && <span className="chip warn"><RotateCcw size={11} /> Again</span>}
          </div>
          <h1 id="q-text" className="study-question"><Inline text={question.question} /></h1>
          <p className="xsmall subtle">{PROMPTS[question.type]}</p>
          {question.code && <CodeBlock code={question.code} language={codeLanguage(pack, question)} />}

          {isChoiceType(question.type) && (
            <div className="choices" role="group" aria-label="Answer choices">
              {order.map((original, i) => {
                const answered = phase === 'feedback'
                const isAnswer = original === question.answer
                const state = !answered ? '' : isAnswer ? ' is-correct' : original === picked ? ' is-wrong' : ' is-dim'
                return (
                  <button key={original} type="button" className={`choice${state}`} onClick={() => submitChoice(original)} disabled={answered} aria-keyshortcuts={String.fromCharCode(97 + i)}>
                    <span className="choice-key">{String.fromCharCode(65 + i)}</span>
                    <span className="choice-text"><Inline text={question.choices[original]} /></span>
                    {answered && isAnswer && <CircleCheck size={20} className="choice-icon good-text" aria-label="Correct answer" />}
                    {answered && original === picked && !isAnswer && <CircleX size={20} className="choice-icon bad-text" aria-label="Your answer" />}
                  </button>
                )
              })}
            </div>
          )}

          {question.type === 'typed' && (
            <form className="typed-form" onSubmit={(e) => { e.preventDefault(); submitTyped() }}>
              <input
                ref={inputRef}
                className={`input lg${outcome ? (outcome.correct ? ' is-correct' : ' is-wrong') : ''}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                readOnly={phase === 'feedback'}
                placeholder="Your answer"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label="Your answer"
              />
              {phase === 'answer' && (
                <div className="row wrap">
                  <button type="submit" className="btn btn-primary" disabled={!typed.trim()}>Check <span className="kbd">Enter</span></button>
                  <button type="button" className="btn btn-ghost" onClick={() => submitTyped(true)}>I don’t know</button>
                </div>
              )}
            </form>
          )}

          {question.type === 'recall' && phase === 'answer' && (
            <div className="stack-sm">
              <textarea ref={inputRef} className="textarea" rows={3} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Optional: write your answer first. Writing it out shows you what you actually know." aria-label="Your answer (optional)" />
              <div>
                <button type="button" className="btn btn-primary" onClick={reveal}><Eye size={16} /> Show answer <span className="kbd hide-mobile">Space</span></button>
              </div>
            </div>
          )}

          {phase === 'feedback' && (
            <section ref={feedbackRef} className="feedback rise" aria-live="polite">
              {outcome.correct === true && (
                <div className="feedback-head good-text"><CircleCheck size={22} /> {outcome.nearMiss ? 'Correct, but check the accents' : 'Correct'}</div>
              )}
              {outcome.correct === false && (
                <div className="feedback-head bad-text"><CircleX size={22} /> {outcome.gaveUp ? 'Here is the answer' : 'Not quite'}</div>
              )}
              {outcome.correct === null && <div className="feedback-head"><Lightbulb size={22} /> Compare with the answer</div>}

              {(question.type === 'typed' || question.type === 'recall') && (
                <div className="answer-compare">
                  <div>
                    <div className="eyebrow">Answer</div>
                    <div className="answer-text"><Inline text={question.answer} /></div>
                    {question.type === 'typed' && question.accept?.length > 0 && (
                      <div className="xsmall subtle">Also accepted: {question.accept.slice(0, 4).join(', ')}</div>
                    )}
                  </div>
                  {outcome.given && question.type === 'recall' && (
                    <div>
                      <div className="eyebrow">You wrote</div>
                      <div className="answer-text muted" style={{ whiteSpace: 'pre-wrap' }}>{outcome.given}</div>
                    </div>
                  )}
                </div>
              )}

              {question.explanation && <RichText text={question.explanation} className="prose feedback-explain" />}
              {question.concept && <div className="xsmall subtle">Concept: {question.concept}</div>}

              {section && (
                <div className="lesson-peek">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLesson((v) => !v)} aria-expanded={showLesson}>
                    <BookOpen size={14} /> {showLesson ? 'Hide' : 'Show'} the lesson: {section.title} <span className="kbd hide-mobile">E</span>
                  </button>
                  {showLesson && (
                    <div className="lesson-peek-body rise">
                      <RichText text={section.body} className="prose small-prose" />
                      {section.code && <CodeBlock code={section.code} language={codeLanguage(pack, section)} />}
                    </div>
                  )}
                </div>
              )}

              <div className="grade-area">
                {wrong ? (
                  <div className="stack-sm">
                    <p className="small muted">This card will come back in a few minutes{item.retry < 2 ? ', and once more before this session ends' : ''}.</p>
                    <div className="row wrap">
                      <button ref={continueRef} type="button" className="btn btn-primary btn-lg" onClick={() => rate(Rating.Again)}>Continue <span className="kbd">Enter</span></button>
                      {question.type === 'typed' && !outcome.gaveUp && (
                        <button type="button" className="btn btn-ghost" onClick={() => setOutcome({ ...outcome, correct: true, overridden: true })}>I was right</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="xsmall subtle" style={{ marginBottom: 8 }}>
                      {outcome.correct === null ? 'How well did you recall it?' : 'How hard was that to recall?'} The next review is scheduled from your answer.
                    </div>
                    <div className="grades" role="group" aria-label="Rate your recall">
                      {GRADES.map((grade) => (
                        <button
                          key={grade.rating}
                          ref={grade.rating === Rating.Good ? continueRef : undefined}
                          type="button"
                          className={`grade grade-${grade.label.toLowerCase()}`}
                          onClick={() => rate(grade.rating)}
                          title={grade.hint}
                          aria-keyshortcuts={grade.key}
                        >
                          <span className="grade-label">{grade.label}</span>
                          <span className="grade-when">{intervals?.[grade.rating] ?? ''}</span>
                          <span className="kbd hide-mobile">{grade.key}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </article>
      </main>

      {leaving && (
        <ConfirmDialog
          title="End this session?"
          description={`Your ${results.length} ${results.length === 1 ? 'answer is' : 'answers are'} already saved. You will see a summary of what you covered.`}
          confirmLabel="End session"
          onClose={() => setLeaving(false)}
          onConfirm={() => finish()}
        />
      )}
    </div>
  )
}
