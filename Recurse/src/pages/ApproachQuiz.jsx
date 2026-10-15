import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ChevronLeft } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { QUIZ, rankModes, scoreQuiz } from '../lib/approaches'
import { feedbackComplete, pop } from '../lib/juice'
import { sfx } from '../lib/sfx'
import ModeIcon from '../components/ModeIcon'

/** Eight questions about study habits that suggest a learning approach. */
export default function ApproachQuiz() {
  useDocumentTitle('Find your approach')
  const { user, updateUser, settings, updateSettings } = useApp()
  const navigate = useNavigate()
  const [answers, setAnswers] = useState([])
  const [step, setStep] = useState(0)
  const cardRef = useRef(null)
  const done = step >= QUIZ.length
  const ranked = done ? rankModes(scoreQuiz(answers)) : null
  const max = ranked ? Math.max(1, ranked[0].score) : 1

  const pick = (choice) => {
    sfx.pop()
    const next = [...answers.slice(0, step), choice]
    setAnswers(next)
    if (step + 1 >= QUIZ.length) {
      const totals = scoreQuiz(next)
      updateUser({ approach: { ...(user.approach || {}), quiz: { answers: next, totals, date: new Date().toISOString() } } })
      setTimeout(() => feedbackComplete(), 150)
    }
    setStep(step + 1)
    pop(cardRef.current)
  }

  const use = (mode) => {
    updateSettings({ learningMode: mode.id, ...mode.preset })
    navigate('/approach')
  }

  return (
    <div className="page narrow">
      <Link to="/approach" className="back-link small"><ChevronLeft size={16} /> How you learn</Link>
      <div className="card roomy stack quiz-card" ref={cardRef}>
        {!done ? (
          <>
            <div className="catalog-head">
              <span className="callno">Question {step + 1} of {QUIZ.length}</span>
              <span className="approach-dots" aria-hidden="true">{QUIZ.map((_, i) => <span key={i} className={i < step ? 'done' : i === step ? 'on' : ''} />)}</span>
            </div>
            <h1 className="study-question" key={step}>{QUIZ[step].q}</h1>
            <div className="choices" role="group" aria-label="Answers">
              {QUIZ[step].a.map((a, i) => (
                <button key={i} type="button" className={`choice${answers[step] === i ? ' is-on' : ''}`} onClick={() => pick(i)}>
                  <span className="choice-key">{'ABCD'[i]}</span>
                  <span className="choice-text">{a.text}</span>
                </button>
              ))}
            </div>
            <div className="row between">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><ArrowLeft size={16} /> Back</button>
              <span className="xsmall subtle">There are no wrong answers.</span>
            </div>
          </>
        ) : (
          <div className="stack rise">
            <div className="catalog-head"><span className="callno">Your match</span><span className="stamp good press">Done</span></div>
            <div className="approach-current-body">
              <div className="approach-badge" aria-hidden="true"><ModeIcon mode={ranked[0]} size={34} /></div>
              <div className="stack-sm grow">
                <h1 className="page-title">{ranked[0].label}</h1>
                <p className="lesson-intro">{ranked[0].tagline}</p>
                <p className="muted">{ranked[0].description}</p>
              </div>
            </div>
            <div className="stack-sm">
              {ranked.map((m) => (
                <div key={m.id} className="experiment-mini-row wide">
                  <span className="small"><ModeIcon mode={m} size={13} /> {m.label}</span>
                  <span className="bar"><span style={{ width: `${(m.score / max) * 100}%` }} /></span>
                  <span className="xsmall tabular">{m.score} pts</span>
                </div>
              ))}
            </div>
            <p className="small muted">
              This is about what you enjoy, which matters: the method you stick with beats the perfect method you abandon. To see what actually helps you remember, run the five-minute experiment next.
            </p>
            <div className="row wrap">
              <button type="button" className="btn btn-primary btn-lg" onClick={() => use(ranked[0])} disabled={settings.learningMode === ranked[0].id}>
                {settings.learningMode === ranked[0].id ? <><Check size={18} /> Already using it</> : <>Use {ranked[0].label}</>}
              </button>
              <Link to="/approach/experiment" className="btn btn-lg">Run the experiment <ArrowRight size={18} /></Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
