import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Anchor, Apple, ArrowRight, Bell, Bird, BookOpen, ChevronLeft, Cloud, Crown, Flame, Fish, FlaskConical, House, Key, Leaf, Moon, Mountain, Ship, Sun, TreePine, Umbrella } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { EXPERIMENT_WORDS, METHODS, MODE_MAP, assignMethods, experimentCorrect, experimentScores, meaningOf, modeFromExperiment } from '../lib/approaches'
import { shuffle } from '../lib/random'
import { feedbackComplete, feedbackCorrect, feedbackWrong } from '../lib/juice'
import { sfx } from '../lib/sfx'
import ModeIcon from '../components/ModeIcon'

const ICONS = { Fish, TreePine, Mountain, Sun, Moon, Key, BookOpen, Ship, House, Flame, Cloud, Apple, Bird, Bell, Anchor, Leaf, Umbrella, Crown }
const WORD = Object.fromEntries(EXPERIMENT_WORDS.map((w) => [w.word, w]))
const SHOW_MS = 3500
const PICTURE_MS = 7000
const DISTRACT_SECONDS = 40

function buildSteps(groups, order) {
  const steps = []
  for (const method of order) {
    const words = groups[method]
    steps.push({ type: 'block', method })
    if (method === 'reread') {
      for (const pass of [1, 2]) for (const word of words) steps.push({ type: 'show', method, word, ms: SHOW_MS, pass })
    } else if (method === 'test') {
      for (const word of words) steps.push({ type: 'show', method, word, ms: SHOW_MS, pass: 1 })
      for (const word of shuffle(words)) steps.push({ type: 'quiz', method, word })
    } else {
      for (const word of words) steps.push({ type: 'show', method, word, ms: PICTURE_MS, picture: true })
    }
  }
  steps.push({ type: 'distract' })
  steps.push({ type: 'final' })
  steps.push({ type: 'results' })
  return steps
}

function WordCard({ step, onDone }) {
  const word = WORD[step.word]
  const Icon = ICONS[word.icon]
  useEffect(() => {
    const id = setTimeout(onDone, step.ms)
    return () => clearTimeout(id)
  }, [step, onDone])
  return (
    <div className="xp-word rise" key={`${step.word}-${step.pass}`}>
      {step.picture && <span className="xp-icon" aria-hidden="true"><Icon size={64} /></span>}
      <div className="xp-alien">{step.word}</div>
      <div className="xp-meaning">means <strong>{word.meaning}</strong></div>
      {step.picture && <p className="small muted">Picture a {word.meaning} in a vivid scene with the sound of “{step.word}”.</p>}
      <span className="xp-timer" style={{ animationDuration: `${step.ms}ms` }} aria-hidden="true" />
    </div>
  )
}

function QuizCard({ step, onDone }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const ref = useRef(null)
  const boxRef = useRef(null)
  useEffect(() => ref.current?.focus(), [])
  const submit = (e) => {
    e.preventDefault()
    if (result) return
    const ok = experimentCorrect(step.word, text)
    setResult(ok)
    if (ok) feedbackCorrect(boxRef.current)
    else feedbackWrong(boxRef.current)
    setTimeout(onDone, ok ? 900 : 1800)
  }
  return (
    <form className="xp-word rise" ref={boxRef} onSubmit={submit}>
      <div className="eyebrow">Self-test</div>
      <div className="xp-alien">{step.word}</div>
      <input ref={ref} className={`input lg${result === true ? ' is-correct' : result === false ? ' is-wrong' : ''}`} value={text} onChange={(e) => setText(e.target.value)} readOnly={result !== null} placeholder="What does it mean?" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Meaning" />
      {result === false && <p className="small bad-text">It means <strong>{meaningOf(step.word)}</strong>.</p>}
      {result === null && <button type="submit" className="btn btn-primary">Check</button>}
    </form>
  )
}

/** Forty seconds of quick arithmetic so the words leave working memory before the test. */
function Distraction({ onDone }) {
  const [left, setLeft] = useState(DISTRACT_SECONDS)
  const [score, setScore] = useState(0)
  const [problem, setProblem] = useState(() => makeProblem())
  const boxRef = useRef(null)
  useEffect(() => {
    if (left <= 0) {
      onDone()
      return
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [left, onDone])
  const answer = (even) => {
    if ((problem.a + problem.b) % 2 === 0 === even) {
      setScore((s) => s + 1)
      sfx.tap()
    } else feedbackWrong(boxRef.current)
    setProblem(makeProblem())
  }
  return (
    <div className="xp-word" ref={boxRef}>
      <div className="eyebrow">Quick break · {left}s</div>
      <p className="muted small">Is the sum even or odd? Go fast. This clears your short-term memory so the test measures real learning.</p>
      <div className="xp-alien tabular">{problem.a} + {problem.b}</div>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn-lg" onClick={() => answer(true)}>Even</button>
        <button type="button" className="btn btn-lg" onClick={() => answer(false)}>Odd</button>
      </div>
      <div className="xsmall subtle">{score} right</div>
    </div>
  )
}

function makeProblem() {
  return { a: 10 + Math.floor(Math.random() * 80), b: 10 + Math.floor(Math.random() * 80) }
}

/** The test: every word once, no feedback until the end. */
function FinalTest({ onDone }) {
  const [words] = useState(() => shuffle(EXPERIMENT_WORDS.map((w) => w.word)))
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [text, setText] = useState('')
  const ref = useRef(null)
  useEffect(() => ref.current?.focus(), [index])
  const next = (e) => {
    e?.preventDefault()
    sfx.tap()
    const all = { ...answers, [words[index]]: text }
    setAnswers(all)
    setText('')
    if (index + 1 >= words.length) onDone(all)
    else setIndex(index + 1)
  }
  return (
    <form className="xp-word" onSubmit={next}>
      <div className="eyebrow">Test · {index + 1} of {words.length}</div>
      <div className="bar"><span style={{ width: `${(index / words.length) * 100}%` }} /></div>
      <div className="xp-alien" key={words[index]}>{words[index]}</div>
      <input ref={ref} className="input lg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Meaning, or leave blank" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Meaning" />
      <button type="submit" className="btn btn-primary">{index + 1 >= words.length ? 'Finish' : 'Next'} <ArrowRight size={16} /></button>
      <p className="xsmall subtle">No feedback during the test. Guess if you are not sure.</p>
    </form>
  )
}

export default function Experiment() {
  useDocumentTitle('Recall experiment')
  const { user, updateUser, settings, updateSettings } = useApp()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const previous = user.approach?.experiment
  const delayed = params.get('check') === 'delayed' && previous?.groups
  const [plan] = useState(() => {
    if (delayed) return { groups: previous.groups, order: previous.order, steps: [{ type: 'final' }, { type: 'results' }] }
    const groups = assignMethods()
    const order = shuffle(METHODS.map((m) => m.id))
    return { groups, order, steps: buildSteps(groups, order) }
  })
  const [started, setStarted] = useState(delayed)
  const [prediction, setPrediction] = useState(previous?.prediction || null)
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState(null)
  const step = plan.steps[index]
  const advance = useMemo(() => () => setIndex((i) => i + 1), [])

  const finishTest = (answers) => {
    const scores = experimentScores(plan.groups, answers)
    const now = new Date().toISOString()
    const experiment = delayed
      ? { ...previous, delayed: scores, delayedDate: now, delayedAnswers: answers }
      : { date: now, groups: plan.groups, order: plan.order, prediction, immediate: scores, answers }
    experiment.suggested = modeFromExperiment(experiment.delayed || experiment.immediate)
    updateUser({ approach: { ...(user.approach || {}), experiment } })
    setResult(experiment)
    setIndex((i) => i + 1)
    setTimeout(() => feedbackComplete({ big: true }), 200)
  }

  if (!started) {
    return (
      <div className="page narrow">
        <Link to="/approach" className="back-link small"><ChevronLeft size={16} /> How you learn</Link>
        <div className="card roomy stack">
          <div className="catalog-head"><span className="callno"><FlaskConical size={13} /> Recall experiment</span><span className="callno">About 5 minutes</span></div>
          <h1 className="page-title">Which method makes things stick for you?</h1>
          <p className="muted">
            You will learn 18 words from a made-up language, six with each of three methods. Then a short break, then a test on all of them.
            Use a quiet moment and do not write anything down. Come back tomorrow for a two-minute check: what survives a day is what you really learned.
          </p>
          <div className="grid-3 xp-methods">
            {METHODS.map((m) => <div key={m.id} className="stat"><div className="stat-label">{m.label}</div><p className="small">{m.blurb}</p></div>)}
          </div>
          <div className="stack-sm">
            <div className="label">First, a prediction: which method will work best for you?</div>
            <div className="segmented" role="group" aria-label="Your prediction">
              {METHODS.map((m) => <button key={m.id} type="button" aria-pressed={prediction === m.id} onClick={() => { sfx.tap(); setPrediction(m.id) }}>{m.label}</button>)}
            </div>
          </div>
          <div><button type="button" className="btn btn-primary btn-lg" onClick={() => setStarted(true)} disabled={!prediction}>Start <ArrowRight size={18} /></button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <div className="card roomy xp-stage">
        {step.type === 'block' && (
          <div className="xp-word rise">
            <div className="eyebrow">Method {plan.order.indexOf(step.method) + 1} of 3</div>
            <h2 className="page-title">{METHODS.find((m) => m.id === step.method).label}</h2>
            <p className="muted">{METHODS.find((m) => m.id === step.method).blurb}</p>
            <p className="small subtle">{step.method === 'picture' ? 'Each word stays up for 7 seconds.' : 'Each word stays up for 3.5 seconds.'}</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={advance} autoFocus>Begin</button>
          </div>
        )}
        {step.type === 'show' && <WordCard key={index} step={step} onDone={advance} />}
        {step.type === 'quiz' && <QuizCard key={index} step={step} onDone={advance} />}
        {step.type === 'distract' && <Distraction onDone={advance} />}
        {step.type === 'final' && <FinalTest onDone={finishTest} />}
        {step.type === 'results' && result && <Results experiment={result} delayed={Boolean(delayed)} onUse={(mode) => { updateSettings({ learningMode: mode.id, ...mode.preset }); navigate('/approach') }} current={settings.learningMode} />}
      </div>
    </div>
  )
}

function Results({ experiment, delayed, onUse, current }) {
  const scores = delayed ? experiment.delayed : experiment.immediate
  const ranked = METHODS.map((m) => ({ ...m, score: scores[m.id] })).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const tie = ranked[1] && ranked[1].score === best.score
  const mode = experiment.suggested ? MODE_MAP[experiment.suggested] : null
  const predicted = METHODS.find((m) => m.id === experiment.prediction)
  return (
    <div className="stack rise">
      <div className="catalog-head"><span className="callno">{delayed ? 'One day later' : 'Right after studying'}</span><span className="stamp good press">Results</span></div>
      <h1 className="page-title">{tie ? 'A tie at the top' : `${best.label} worked best`}</h1>
      <div className="stack-sm">
        {ranked.map((m) => (
          <div key={m.id} className="experiment-mini-row wide big">
            <span>{m.label}</span>
            <span className="bar"><span style={{ width: `${Math.round(m.score * 100)}%` }} /></span>
            <span className="tabular">{Math.round(m.score * 6)} / 6</span>
            {delayed && <span className="xsmall subtle tabular">was {Math.round(experiment.immediate[m.id] * 6)}</span>}
          </div>
        ))}
      </div>
      {predicted && !tie && (
        <p className="callout info small">
          You predicted {predicted.label}. {predicted.id === best.id ? 'You read yourself well.' : `Your results favored ${best.label}. That gap is common: methods that feel easy, like rereading, feel effective without being effective. Psychologists call it the fluency illusion.`}
        </p>
      )}
      <p className="small muted">
        {best.id === 'test'
          ? 'Most people remember more after testing themselves, even though it feels harder. That is retrieval practice, and it is the backbone of Recurse.'
          : best.id === 'picture'
            ? 'Pairing words with images and a vivid scene worked for you. That is dual coding and elaboration: visual and verbal memories support each other.'
            : 'Rereading came out on top this time. With only six words per method the result is noisy, so the one-day check is the one to trust.'}
        {!delayed && ' Come back in a day for the check that really counts.'}
      </p>
      {mode && (
        <div className="row wrap">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => onUse(mode)} disabled={current === mode.id}>
            <ModeIcon mode={mode} size={18} /> {current === mode.id ? `Using ${mode.label}` : `Use ${mode.label}`}
          </button>
          <Link to="/approach" className="btn btn-lg">Back to approaches</Link>
        </div>
      )}
      {!mode && <div><Link to="/approach" className="btn btn-primary btn-lg">Back to approaches</Link></div>}
    </div>
  )
}
