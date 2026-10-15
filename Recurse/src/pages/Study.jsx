import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BookOpen, CircleCheck, Clock, Flame, Shuffle, Sparkles, Timer, X, RotateCcw, Undo2, Zap } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { buildSession, requeue, dueSummary } from '../lib/session'
import { GRADES, Rating, previewDue, retrievability } from '../lib/memory'
import { codeLanguage } from '../lib/packs'
import { QUESTION_PROMPTS, QUESTION_TYPE_LABELS } from '../lib/subjects'
import { formatInterval, formatRelative, nowMs, secondsSince } from '../lib/dates'
import { topicMastery, topicOf } from '../lib/progress'
import { levelFromXp } from '../lib/gamification'
import { getCollection } from '../lib/collections'
import { feedbackCorrect, feedbackWrong, floatText, burstFrom, celebrate } from '../lib/juice'
import { sfx } from '../lib/sfx'
import CodeBlock from '../components/CodeBlock'
import { Inline } from '../components/RichText'
import AnswerArea from '../components/QuestionView'
import AnswerFeedback from '../components/AnswerFeedback'
import { ConfirmDialog } from '../components/Modal'
import EmptyState from '../components/EmptyState'
import Illustration from '../components/Illustration'

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
function startSession({ kind, topicId, pathId, packs, packMap, progress, settings, stats }) {
  const now = new Date()
  const collection = pathId ? getCollection(pathId) : null
  const built = buildSession({ kind, topicId, topicIds: collection?.packIds, packs, progress, settings, stats, now })
  if (collection) built.title = `${collection.name} review`
  const memoryBefore = {}
  const masteryBefore = {}
  for (const id of new Set(built.items.map((i) => i.packId))) {
    memoryBefore[id] = topicMemory(topicOf(progress, id), now)
    masteryBefore[id] = topicMastery(progress[id]?.cards, packMap.get(id).questions.length)
  }
  return { ...built, memoryBefore, masteryBefore, started: now.getTime(), xpBefore: stats.xp || 0 }
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
        <div className="catalog-head"><span className="callno">New topic</span></div>
        <Illustration name="drawer" className="illus lesson-prompt-art" />
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

const MILESTONES = { 5: 'Five in a row', 10: 'Ten in a row', 15: 'Fifteen in a row', 25: 'Unstoppable', 40: 'Legendary' }

export default function Study() {
  const { kind = 'review', topicId } = useParams()
  const [params] = useSearchParams()
  const pathId = params.get('path')
  const navigate = useNavigate()
  const { packs, packMap, callNos, progress, settings, stats, now, recordReview, undoReview, finishSession, toast } = useApp()
  const [session] = useState(() => startSession({ kind, topicId, pathId, packs, packMap, progress, settings, stats }))
  const pack0 = topicId ? packMap.get(topicId) : null
  const needsLessonPrompt = kind === 'topic' && pack0?.lesson && !progress[topicId]?.lessonRead && !Object.keys(progress[topicId]?.cards || {}).length
  const [skipLesson, setSkipLesson] = useState(false)

  const [items, setItems] = useState(session.items)
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState('answer')
  const [outcome, setOutcome] = useState(null)
  const [results, setResults] = useState([])
  const [xp, setXp] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [focusDone, setFocusDone] = useState(false)
  const [intervals, setIntervals] = useState(null)
  const [undo, setUndo] = useState(null)
  const [lessonOpen, setLessonOpen] = useState(0)
  const cardStart = useRef(session.started)
  const cardRef = useRef(null)
  const comboRef = useRef(null)
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

  useEffect(() => {
    if (phase === 'feedback') {
      continueRef.current?.focus({ preventScroll: true })
      feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [phase, index])

  const correctCount = results.filter((r) => r.retry === 0 && r.correct).length
  const firstAttempts = results.filter((r) => r.retry === 0).length

  function finish(list = results, totalXp = xp, best = bestCombo) {
    if (finished.current) return
    finished.current = true
    const first = list.filter((r) => r.retry === 0)
    const touched = Object.keys(session.memoryBefore)
    const record = finishSession({
      kind: session.kind,
      topicId: session.topicId,
      pathId,
      title: session.title,
      cards: first.length,
      correct: first.filter((r) => r.correct).length,
      accuracy: first.length ? Math.round((first.filter((r) => r.correct).length / first.length) * 100) : 0,
      newCards: first.filter((r) => r.isNew).length,
      pops: first.filter((r) => r.pop).length,
      retries: list.length - first.length,
      xp: totalXp,
      bestCombo: best,
      seconds: Math.round(secondsSince(session.started)),
      results: list,
      topics: touched,
      memoryBefore: session.memoryBefore,
      masteryBefore: session.masteryBefore,
      xpBefore: session.xpBefore
    })
    navigate('/complete', { replace: true, state: { sessionId: record.id } })
  }

  /** The learner answered: grade it, give feedback, and move to the rating step. */
  function submit(result) {
    if (phase !== 'answer') return
    setOutcome(result)
    setIntervals(intervalLabels(card, settings.desiredRetention))
    setPhase('feedback')
    if (result.correct === true) {
      const next = combo + 1
      feedbackCorrect(cardRef.current, { combo })
      setCombo(next)
      setBestCombo((b) => Math.max(b, next))
      if (MILESTONES[next]) {
        setTimeout(() => {
          sfx.success()
          floatText(comboRef.current, MILESTONES[next], { tone: 'warn' })
          burstFrom(comboRef.current, { kind: 'stars', count: 26 })
        }, 260)
      }
    } else if (result.correct === false) {
      feedbackWrong(cardRef.current)
      setCombo(0)
    } else {
      sfx.flip()
    }
  }

  function rate(rating, from) {
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
    if (selfGraded) {
      const nextCombo = correct ? combo + 1 : 0
      setCombo(nextCombo)
      setBestCombo((b) => Math.max(b, nextCombo))
    }
    if (earned && from) floatText(from, `+${earned} XP`, { tone: correct ? 'good' : 'accent' })
    const level = levelFromXp(session.xpBefore + xp)
    if (levelFromXp(session.xpBefore + xp + earned) > level) {
      setTimeout(() => {
        sfx.levelUp()
        celebrate({ big: true })
        toast(`Level ${level + 1} reached`, { tone: 'good', duration: 5000 })
      }, 200)
    }
    const result = { key: item.key, packId: pack.id, questionId: question.id, correct, rating, isNew: item.isNew, retry: item.retry, pop: Boolean(item.pop), due: next.due, given: outcome.given }
    const nextResults = [...results, result]
    const nextXp = xp + earned
    const nextItems = rating === Rating.Again ? requeue(items, index) : items
    setUndo({ items, index, results, xp, combo })
    setResults(nextResults)
    setXp(nextXp)
    setItems(nextItems)
    if (index + 1 >= nextItems.length) {
      finish(nextResults, nextXp, Math.max(bestCombo, combo))
      return
    }
    setIndex(index + 1)
    setPhase('answer')
    setOutcome(null)
    setLessonOpen(0)
    cardStart.current = nowMs()
  }

  /** Leave the session: back to where the learner came from, or Today when opened directly. */
  function leave() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }

  function undoLast() {
    if (!undo || phase !== 'answer' || !undoReview()) return
    setItems(undo.items)
    setIndex(undo.index)
    setResults(undo.results)
    setXp(undo.xp)
    setCombo(undo.combo)
    setUndo(null)
    setOutcome(null)
    cardStart.current = nowMs()
    toast('Last answer undone')
  }

  const wrong = outcome && outcome.correct === false
  const canRate = phase === 'feedback' && !wrong

  const keyActions = {
    Escape: () => (results.length ? setLeaving(true) : leave()),
    1: () => (canRate ? rate(Rating.Again) : false),
    2: () => (canRate ? rate(Rating.Hard) : false),
    3: () => (canRate ? rate(Rating.Good) : false),
    4: () => (canRate ? rate(Rating.Easy) : false),
    e: () => (phase === 'feedback' ? setLessonOpen((n) => n + 1) : false),
    z: () => (undo && phase === 'answer' ? undoLast() : false),
    Enter: () => (phase === 'feedback' ? rate(wrong ? Rating.Again : Rating.Good, continueRef.current) : false)
  }
  const onKey = useEffectEvent((event) => {
    if (leaving || !item || (needsLessonPrompt && !skipLesson) || event.altKey || event.defaultPrevented) return
    if (document.querySelector('[role="dialog"]')) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const target = event.target
    const typing = target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    if (event.metaKey || event.ctrlKey) {
      if (key === 'z' && undo && phase === 'answer' && (!typing || !target.value)) {
        event.preventDefault()
        undoLast()
      }
      return
    }
    const action = keyActions[key]
    if (!action) return
    if (typing && key !== 'Escape') return
    if (key === 'Enter' && target instanceof HTMLButtonElement) return
    if (phase === 'answer' && key !== 'Escape' && key !== 'z') return
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
            art={kind === 'mistakes' ? 'cleared' : 'done'}
            title={kind === 'mistakes' ? 'No mistakes to review' : kind === 'roulette' ? 'Nothing to spin yet' : 'Nothing to study right now'}
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <Link to="/paths" className="btn btn-primary">Pick a path</Link>
                <Link to="/" className="btn">Back to Today</Link>
              </div>
            }
          >
            {kind === 'mistakes'
              ? 'Every card you missed has since been answered correctly.'
              : kind === 'roulette'
                ? 'Recall roulette draws from cards you have already seen. Study a topic first.'
                : summary.nextDue
                  ? `Your next review is due ${formatRelative(summary.nextDue, now)}. Start a new topic in the meantime.`
                  : 'Read a lesson or start a topic, and its cards will show up here.'}
          </EmptyState>
        </div>
      </div>
    )
  }

  const progressRatio = index / items.length
  const remaining = items.length - index

  return (
    <div className="study">
      <header className="study-bar">
        <button type="button" className="icon-btn" onClick={() => (results.length ? setLeaving(true) : leave())} aria-label="Leave session (Esc)" title="Leave session (Esc)">
          <X size={20} />
        </button>
        <div className="study-bar-mid">
          <div className="row between xsmall">
            <span className="study-title">{session.ahead ? 'Reviewing ahead' : session.title}{session.topicId && pack0 ? ` · ${pack0.name}` : ''}</span>
            <span className="tabular subtle" aria-label={`${remaining} cards left`}>{index + 1} / {items.length}</span>
          </div>
          <div className="bar study-progress" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={index}>
            <span style={{ width: `${progressRatio * 100}%` }} />
          </div>
        </div>
        <div className="study-bar-meta">
          {undo && phase === 'answer' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={undoLast} title="Undo last answer (Z)">
              <Undo2 size={14} /> <span className="hide-mobile">Undo</span>
            </button>
          )}
          <span ref={comboRef} key={combo} className={`combo-chip${combo >= 2 ? ' lit' : ''}${combo >= 5 ? ' hot' : ''}`} title="Correct answers in a row" aria-label={`${combo} in a row`}>
            <Flame size={14} /><span className="tabular">{combo}</span>
          </span>
          {settings.focusTimer && (
            <span className={`chip ${focusDone ? 'warn' : 'outline'}`} title="Focus timer">
              <Timer size={13} />
              <span className="tabular">{focusDone ? 'Break' : clock(Math.max(0, settings.focusMinutes * 60 - elapsed))}</span>
            </span>
          )}
          {settings.showTimer && !settings.focusTimer && (
            <span className="chip outline hide-mobile" title="Session time"><Clock size={13} /><span className="tabular">{clock(elapsed)}</span></span>
          )}
          <span className="chip outline hide-mobile" title="Correct on first try">
            <CircleCheck size={13} /><span className="tabular">{correctCount}/{firstAttempts}</span>
          </span>
        </div>
      </header>

      <main className="study-main" id="main">
        <article ref={cardRef} className={`study-card deal-in${item.pop ? ' is-pop' : ''}`} key={`${item.key}:${item.retry}`} aria-labelledby="q-text">
          {item.pop && (
            <div className="pop-banner" role="note">
              <Zap size={15} /> <strong>Pop quiz</strong> <span className="small">From {pack.name}. Recalling older topics is what keeps them.</span>
            </div>
          )}
          <div className="study-meta catalog-head">
            <span className="callno">{callNos.get(pack.id)} · {pack.name}</span>
            <span className="chip outline">{QUESTION_TYPE_LABELS[question.type]}</span>
            {item.isNew && <span className="chip accent"><Sparkles size={11} /> New</span>}
            {kind === 'roulette' && <span className="chip outline"><Shuffle size={11} /> Roulette</span>}
            {item.retry > 0 && <span className="chip warn"><RotateCcw size={11} /> Again</span>}
            {!item.isNew && item.retry === 0 && card?.last_review && phase === 'answer' && (
              <span className="chip outline hide-mobile" title="When you last saw this card, and the estimated chance you still remember it">
                Seen {formatRelative(card.last_review, now)} · {Math.round(retrievability(card, now) * 100)}% recall
              </span>
            )}
          </div>
          <h1 id="q-text" className="study-question"><Inline text={question.question} /></h1>
          <p className="xsmall subtle">{QUESTION_PROMPTS[question.type]}</p>
          {question.code && <CodeBlock code={question.code} language={codeLanguage(pack, question)} />}

          <AnswerArea key={`${item.key}:${item.retry}`} question={question} item={item} answered={phase === 'feedback'} outcome={outcome} onSubmit={submit} />

          {phase === 'feedback' && (
            <section ref={feedbackRef} className="feedback rise" aria-live="polite">
              {outcome.correct === true && (
                <div className="feedback-head good-text">
                  <span className="stamp good press">Correct</span>
                  <span className="small">{outcome.nearMiss ? 'Check the accents.' : outcome.overridden ? 'Counted as right.' : combo >= 3 ? `${combo} in a row.` : ''}</span>
                </div>
              )}
              {outcome.correct === false && (
                <div className="feedback-head bad-text"><span className="stamp press">{outcome.gaveUp ? 'Answer' : 'Not quite'}</span> <span className="small muted">{outcome.gaveUp ? 'Read it, then try to recall it next time.' : 'Read why, then it comes back shortly.'}</span></div>
              )}
              {outcome.correct === null && <div className="feedback-head"><span className="stamp ink press">Compare</span> <span className="small muted">How close was your answer?</span></div>}

              <AnswerFeedback key={lessonOpen} pack={pack} question={question} outcome={outcome} showLessonDefault={lessonOpen > 0 && lessonOpen % 2 === 1} />

              <div className="grade-area">
                {wrong ? (
                  <div className="stack-sm">
                    <p className="small muted">This card will come back in a few minutes{item.retry < 2 ? ', and once more before this session ends' : ''}.</p>
                    <div className="row wrap">
                      <button ref={continueRef} type="button" className="btn btn-primary btn-lg" onClick={(e) => rate(Rating.Again, e.currentTarget)}>Continue <span className="kbd">Enter</span></button>
                      {(question.type === 'typed' || question.type === 'cli') && !outcome.gaveUp && (
                        <button type="button" className="btn btn-ghost" onClick={() => { setOutcome({ ...outcome, correct: true, overridden: true }); setCombo((c) => c + 1) }}>I was right</button>
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
                          onClick={(e) => rate(grade.rating, e.currentTarget)}
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
