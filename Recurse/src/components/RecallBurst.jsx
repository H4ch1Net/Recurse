import { useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Repeat, SkipForward, X, Zap } from 'lucide-react'
import { useApp } from '../state/context'
import { Rating } from '../lib/memory'
import { makeItem } from '../lib/session'
import { codeLanguage } from '../lib/packs'
import { answerText } from '../lib/answers'
import { QUESTION_PROMPTS } from '../lib/subjects'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../lib/juice'
import AnswerArea from './QuestionView'
import CodeBlock from './CodeBlock'
import RichText, { Inline } from './RichText'

/**
 * A few quick recall questions inline (a warm-up before a lesson, a pop quiz between
 * sections). Each answer is a real review: right answers count as Good, misses as Again.
 * entries: [{ pack, question }].
 */
export default function RecallBurst({ entries, kind = 'pop', onDone }) {
  const { recordReview } = useApp()
  const [index, setIndex] = useState(0)
  const [outcome, setOutcome] = useState(null)
  const [score, setScore] = useState(0)
  const [closed, setClosed] = useState(false)
  const boxRef = useRef(null)
  const items = useMemo(() => entries.map(({ pack, question }) => makeItem(pack, question)), [entries])
  if (closed || !entries.length) return null
  const done = index >= entries.length
  const entry = entries[Math.min(index, entries.length - 1)]
  const { pack, question } = entry
  const warmup = kind === 'warmup'

  const record = (correct, given) => {
    recordReview({ packId: pack.id, question, rating: correct ? Rating.Good : Rating.Again, correct, isNew: false, seconds: 0, given })
  }

  const submit = (result) => {
    setOutcome(result)
    if (result.correct === true) {
      setScore((s) => s + 1)
      feedbackCorrect(boxRef.current, { combo: score })
      record(true, result.given)
    } else if (result.correct === false) {
      feedbackWrong(boxRef.current)
      record(false, result.given)
    }
  }
  const selfGrade = (correct) => {
    setOutcome((o) => ({ ...o, correct, graded: true }))
    if (correct) {
      setScore((s) => s + 1)
      feedbackCorrect(boxRef.current, { combo: score })
    }
    record(correct, outcome?.given || '')
  }
  const next = () => {
    const nextIndex = index + 1
    setIndex(nextIndex)
    setOutcome(null)
    if (nextIndex >= entries.length) feedbackSuccess(boxRef.current, `${score}/${entries.length}`)
  }
  const finish = () => {
    setClosed(true)
    onDone?.(score)
  }

  const answered = Boolean(outcome) && (outcome.correct !== null || outcome.graded)
  return (
    <aside ref={boxRef} className={`recall-burst ${kind}`} aria-label={warmup ? 'Warm-up' : 'Pop quiz'}>
      <header className="recall-burst-head">
        <span className="recall-burst-badge">{warmup ? <Repeat size={14} /> : <Zap size={14} />} {warmup ? 'Warm-up' : 'Pop quiz'}</span>
        <span className="xsmall subtle">{done ? 'Done' : `${index + 1} of ${entries.length} · from ${pack.name}`}</span>
        <button type="button" className="icon-btn sm" onClick={finish} aria-label={done ? 'Close' : 'Skip'} title={done ? 'Close' : 'Skip'}>{done ? <X size={14} /> : <SkipForward size={14} />}</button>
      </header>
      {done ? (
        <div className="stack-sm">
          <p className="small"><strong>{score} of {entries.length} recalled.</strong> {score === entries.length ? 'Those memories just got stronger.' : 'The ones you missed will come back soon in your reviews.'}</p>
          <div><button type="button" className="btn btn-sm btn-primary" onClick={finish}>{warmup ? 'Start the lesson' : 'Back to the lesson'} <ArrowRight size={14} /></button></div>
        </div>
      ) : (
        <div className="stack-sm" key={`${pack.id}:${question.id}`}>
          {index === 0 && !outcome && (
            <p className="xsmall subtle">{warmup ? 'Recall a few things you learned before. Starting with retrieval primes the new lesson.' : 'A question from a topic you studied earlier. Pulling it from memory now keeps it from fading.'}</p>
          )}
          <p className="recall-burst-q"><Inline text={question.question} /></p>
          <p className="xsmall subtle">{QUESTION_PROMPTS[question.type]}</p>
          {question.code && <CodeBlock code={question.code} language={codeLanguage(pack, question)} />}
          <AnswerArea question={question} item={items[index]} answered={answered} outcome={outcome} onSubmit={submit} keys={false} autoFocus={false} />
          {outcome && outcome.correct === null && !outcome.graded && (
            <div className="stack-sm">
              <div className="answer-text"><Inline text={String(answerText(question))} /></div>
              <div className="row wrap">
                <button type="button" className="btn btn-sm" onClick={() => selfGrade(true)}><Check size={14} /> I knew it</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => selfGrade(false)}><X size={14} /> I didn't</button>
              </div>
            </div>
          )}
          {answered && (
            <div className="stack-sm rise">
              {outcome.correct === false && <div className="xsmall good-text">Answer: <Inline text={String(answerText(question))} /></div>}
              {question.explanation && <RichText text={question.explanation} className="prose small-prose" />}
              <div><button type="button" className="btn btn-sm btn-primary" onClick={next}>{index + 1 >= entries.length ? 'Finish' : 'Next'} <ArrowRight size={14} /></button></div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
