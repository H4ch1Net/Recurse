import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Flag, Flame, Send, Timer, X } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getCollection } from '../lib/collections'
import { buildQuiz, quizScope, scoreQuiz } from '../lib/quiz'
import { codeLanguage } from '../lib/packs'
import { QUESTION_PROMPTS, QUESTION_TYPE_LABELS } from '../lib/subjects'
import { feedbackCorrect, feedbackWrong } from '../lib/juice'
import { sfx } from '../lib/sfx'
import AnswerArea from '../components/QuestionView'
import AnswerFeedback from '../components/AnswerFeedback'
import CodeBlock from '../components/CodeBlock'
import { Inline } from '../components/RichText'
import { ConfirmDialog } from '../components/Modal'
import EmptyState from '../components/EmptyState'

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export default function QuizRunner() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { packs, packMap, progress, recordExam, callNos } = useApp()
  const mode = params.get('mode') === 'exam' ? 'exam' : 'quiz'
  const path = getCollection(params.get('path'))
  const stageId = params.get('stage')
  const topicId = params.get('topic')
  const minutes = Number(params.get('minutes')) || null
  const [setup] = useState(() => {
    const scope = quizScope({ path, stageId, topicId, packs, packMap, progress })
    if (!scope) return null
    const items = buildQuiz(scope, { n: Number(params.get('n')) || 20, progress, preferStudied: mode === 'quiz' && !topicId })
    return { scope, items, started: Date.now() }
  })
  useDocumentTitle(mode === 'exam' ? 'Practice exam' : 'Quiz')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [flags, setFlags] = useState({})
  const [combo, setCombo] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [confirm, setConfirm] = useState(null)
  const cardRef = useRef(null)
  const finished = useRef(false)

  const timeLeft = minutes ? minutes * 60 - elapsed : null
  function finish() {
    if (finished.current || !setup) return
    finished.current = true
    const result = scoreQuiz(setup.items, answers, setup.scope.groups)
    const record = recordExam({
      mode,
      pathId: path?.id || null,
      stageId: stageId || null,
      topicId: topicId || null,
      title: setup.scope.title,
      ...result,
      pass: path?.exam?.pass || null,
      seconds: Math.round((Date.now() - setup.started) / 1000),
      answers: setup.items.filter((i) => answers[i.key]).map((i) => ({ packId: i.packId, questionId: i.questionId, correct: answers[i.key].correct === true, given: answers[i.key].given }))
        .concat(mode === 'exam' ? setup.items.filter((i) => !answers[i.key]).map((i) => ({ packId: i.packId, questionId: i.questionId, correct: false, given: '' })) : [])
    })
    navigate(`/quiz/result/${record.id}`, { replace: true })
  }

  const tick = useEffectEvent(() => {
    const seconds = Math.round((Date.now() - (setup?.started || Date.now())) / 1000)
    setElapsed(seconds)
    if (minutes && seconds >= minutes * 60) finish()
    if (minutes && minutes * 60 - seconds === 300) sfx.tick()
  })
  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (!setup || !setup.items.length) {
    return (
      <div className="page narrow">
        <div className="card">
          <EmptyState art="search" title="Nothing to quiz yet" action={<button type="button" className="btn btn-primary" onClick={() => navigate('/quiz')}>Choose a quiz</button>}>
            There are no questions for this choice. Pick a different path or topic.
          </EmptyState>
        </div>
      </div>
    )
  }

  const items = setup.items
  const item = items[index]
  const pack = packMap.get(item.packId)
  const question = pack?.questions.find((q) => q.id === item.questionId)
  const answer = answers[item.key]
  const answeredCount = Object.keys(answers).length
  const last = index + 1 >= items.length

  const submit = (outcome) => {
    setAnswers((a) => ({ ...a, [item.key]: outcome }))
    setEditing(false)
    if (mode === 'quiz') {
      setRevealed(true)
      if (outcome.correct) {
        feedbackCorrect(cardRef.current, { combo })
        setCombo((c) => c + 1)
      } else {
        feedbackWrong(cardRef.current)
        setCombo(0)
      }
    } else sfx.tap()
  }

  const go = (to) => {
    setIndex(Math.max(0, Math.min(items.length - 1, to)))
    setRevealed(false)
    setEditing(false)
  }

  const tryFinish = () => {
    const unanswered = items.length - answeredCount
    if (mode === 'exam' && unanswered > 0) setConfirm(`You have ${unanswered} unanswered ${unanswered === 1 ? 'question' : 'questions'}. They will count as wrong.`)
    else finish()
  }

  const showFeedback = mode === 'quiz' && revealed && answer
  return (
    <div className="study quiz-run">
      <header className="study-bar">
        <button type="button" className="icon-btn" onClick={() => setConfirm(answeredCount ? 'Leave now and this attempt is scored on what you answered so far.' : 'leave')} aria-label="Leave">
          <X size={20} />
        </button>
        <div className="study-bar-mid">
          <div className="row between xsmall">
            <span className="study-title">{mode === 'exam' ? 'Practice exam' : 'Quiz'} · {setup.scope.title}</span>
            <span className="tabular subtle">{index + 1} / {items.length}</span>
          </div>
          <div className="bar study-progress"><span style={{ width: `${(answeredCount / items.length) * 100}%` }} /></div>
        </div>
        <div className="study-bar-meta">
          {mode === 'quiz' && <span key={combo} className={`combo-chip${combo >= 2 ? ' lit' : ''}${combo >= 5 ? ' hot' : ''}`}><Flame size={14} /><span className="tabular">{combo}</span></span>}
          {timeLeft !== null && <span className={`chip ${timeLeft < 300 ? 'warn' : 'outline'}`}><Timer size={13} /><span className="tabular">{clock(timeLeft)}</span></span>}
        </div>
      </header>

      <main className="study-main" id="main">
        {mode === 'exam' && (
          <nav className="exam-palette" aria-label="Questions">
            {items.map((it, i) => (
              <button key={it.key} type="button" className={`exam-dot${i === index ? ' current' : ''}${answers[it.key] ? ' answered' : ''}${flags[it.key] ? ' flagged' : ''}`} onClick={() => go(i)} aria-label={`Question ${i + 1}${answers[it.key] ? ', answered' : ''}${flags[it.key] ? ', flagged' : ''}`}>{i + 1}</button>
            ))}
          </nav>
        )}
        <article ref={cardRef} className="study-card" key={item.key} aria-labelledby="q-text">
          <div className="study-meta catalog-head">
            <span className="callno">{callNos.get(pack.id)} · {pack.name}</span>
            <span className="chip outline">{QUESTION_TYPE_LABELS[question.type]}</span>
            {mode === 'exam' && (
              <button type="button" className={`btn btn-ghost btn-sm${flags[item.key] ? ' warn-text' : ''}`} onClick={() => setFlags((f) => ({ ...f, [item.key]: !f[item.key] }))} aria-pressed={Boolean(flags[item.key])}>
                <Flag size={14} /> {flags[item.key] ? 'Flagged' : 'Flag'}
              </button>
            )}
          </div>
          <h1 id="q-text" className="study-question"><Inline text={question.question} /></h1>
          <p className="xsmall subtle">{QUESTION_PROMPTS[question.type]}</p>
          {question.code && <CodeBlock code={question.code} language={codeLanguage(pack, question)} />}

          {mode === 'exam' && answer && !editing ? (
            <div className="exam-saved">
              <div className="eyebrow">Your answer</div>
              <div className="answer-text"><Inline text={answer.given || '(blank)'} /></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Change answer</button>
            </div>
          ) : (
            <AnswerArea key={`${item.key}:${editing}`} question={question} item={item} answered={Boolean(showFeedback)} outcome={answer} onSubmit={submit} allowGiveUp={mode === 'quiz'} />
          )}

          {showFeedback && (
            <section className="feedback rise" aria-live="polite">
              <div className={`feedback-head ${answer.correct ? 'good-text' : 'bad-text'}`}>
                <span className={`stamp press${answer.correct ? ' good' : ''}`}>{answer.correct ? 'Correct' : 'Not quite'}</span>
              </div>
              <AnswerFeedback pack={pack} question={question} outcome={answer} lessonKey={false} />
            </section>
          )}

          <div className="row between wrap quiz-nav">
            <button type="button" className="btn btn-ghost" onClick={() => go(index - 1)} disabled={index === 0 || mode === 'quiz'}><ArrowLeft size={16} /> Back</button>
            {last ? (
              <button type="button" className="btn btn-primary btn-lg" onClick={tryFinish} disabled={mode === 'quiz' && !answer}><Send size={16} /> {mode === 'exam' ? 'Submit exam' : 'See results'}</button>
            ) : (
              <button type="button" className={`btn btn-lg ${answer || mode === 'exam' ? 'btn-primary' : ''}`} onClick={() => go(index + 1)} disabled={mode === 'quiz' && !answer}>
                {mode === 'exam' && !answer ? 'Skip' : 'Next'} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </article>
      </main>

      {confirm && (
        <ConfirmDialog
          title={confirm === 'leave' ? 'Leave this quiz?' : mode === 'exam' ? 'Submit the exam?' : 'Finish now?'}
          description={confirm === 'leave' ? 'Nothing has been answered yet, so nothing is saved.' : confirm}
          confirmLabel={confirm === 'leave' ? 'Leave' : 'Submit'}
          onClose={() => setConfirm(null)}
          onConfirm={() => (confirm === 'leave' ? navigate(-1) : finish())}
        />
      )}
    </div>
  )
}
