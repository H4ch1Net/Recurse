import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowRight, Brain, CalendarClock, Check, Compass, MousePointerClick } from 'lucide-react'
import { useApp } from '../state/context'
import { COLLECTIONS, nextTopic } from '../lib/collections'
import { MODES } from '../lib/approaches'
import { sfx } from '../lib/sfx'
import { celebrate } from '../lib/juice'
import BrandMark from '../components/BrandMark'
import Illustration from '../components/Illustration'
import PathIcon from '../components/PathIcon'
import ModeIcon from '../components/ModeIcon'
import Tile from '../components/Tile'

const PRINCIPLES = [
  { icon: MousePointerClick, title: 'Learn by doing', body: 'Simulators, Cisco console labs and coding challenges right inside the lessons, with instant feedback.' },
  { icon: Brain, title: 'Recall, not reread', body: 'Every lesson, card, pop quiz and exam asks you to pull the answer from memory. That effort is what builds lasting memory.' },
  { icon: CalendarClock, title: 'Back right before you forget', body: 'Cards, labs and challenges are rescheduled from how well you knew them, so old topics stay sharp while you learn new ones.' }
]

const PATH_SUBJECTS = {
  ccna: ['networking', 'security'],
  'swe-internship': ['programming', 'cs', 'swe', 'tools'],
  'cs-fundamentals': ['cs', 'math'],
  'web-development': ['web', 'programming'],
  'security-foundations': ['security', 'networking'],
  'math-for-cs': ['math']
}

export default function Onboarding() {
  const { updateUser, updateSettings, user, settings, packMap, summaries } = useApp()
  const [step, setStep] = useState(0)
  const [target, setTarget] = useState(null)
  const [name, setName] = useState(user.name || '')
  const [goals, setGoals] = useState(user.goals || [])
  const [mode, setMode] = useState(settings.learningMode || 'balanced')

  const finish = (to = '/') => {
    setTarget(to)
    const chosen = MODES.find((m) => m.id === mode)
    updateSettings({ learningMode: mode, ...(chosen?.preset || {}) })
    updateUser({
      name: name.trim(),
      goals,
      interests: [...new Set(goals.flatMap((g) => PATH_SUBJECTS[g] || []))],
      onboardingComplete: true,
      createdAt: user.createdAt || new Date().toISOString()
    })
    celebrate()
  }
  const toggle = (id) => {
    sfx.tap()
    setGoals((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  }
  if (user.onboardingComplete) return <Navigate to={target || '/'} replace />
  const starts = goals.map((id) => COLLECTIONS.find((c) => c.id === id)).filter(Boolean).map((c) => ({ collection: c, next: nextTopic(c, packMap, summaries) })).filter((x) => x.next)

  return (
    <div className="onboarding">
      <div className="onboarding-card card roomy">
        <div className="catalog-head">
          <div className="brand"><BrandMark /> <span className="wordmark">Recurse</span></div>
          <div className="onboarding-steps" aria-label={`Step ${step + 1} of 4`}>
            {[0, 1, 2, 3].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}
          </div>
        </div>

        {step === 0 && (
          <div className="stack rise">
            <Illustration name="drawer" className="illus onboarding-art" />
            <h1 className="page-title">Learn it. <em>Keep it.</em></h1>
            <p className="page-sub">Recurse teaches through short, interactive lessons, then brings everything back on a schedule built around how memory fades. Deep enough to pass the CCNA or land a software engineering internship.</p>
            <div className="principles">
              {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="principle">
                  <span className="principle-icon"><Icon size={18} /></span>
                  <div>
                    <div className="list-title">{title}</div>
                    <p className="small muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="row between wrap">
              <button type="button" className="btn btn-ghost" onClick={() => finish('/library')}>Skip setup</button>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep(1)} autoFocus>Get started <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {step === 1 && (
          <form className="stack rise" onSubmit={(e) => { e.preventDefault(); setStep(2) }}>
            <h1 className="page-title">What are you working toward?</h1>
            <p className="page-sub">Pick one or more paths. Each one orders its topics, labs, challenges and exams toward the goal. You can study anything either way.</p>
            <div className="goal-grid">
              {COLLECTIONS.map((c) => (
                <button key={c.id} type="button" className="goal-option" aria-pressed={goals.includes(c.id)} onClick={() => toggle(c.id)} style={{ '--hue': c.hue }}>
                  <PathIcon collection={c} size="sm" />
                  <span className="grow">
                    <span className="list-title">{c.name}</span>
                    <span className="xsmall subtle">{c.tagline}</span>
                  </span>
                  {goals.includes(c.id) && <Check size={16} className="check" aria-hidden="true" />}
                </button>
              ))}
            </div>
            <div className="field">
              <label className="label" htmlFor="ob-name">Your name <span className="subtle">(optional)</span></label>
              <input id="ob-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" maxLength={40} />
            </div>
            <div className="row between">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
              <button type="submit" className="btn btn-primary btn-lg">{goals.length ? 'Continue' : 'Just exploring'} <ArrowRight size={18} /></button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="stack rise">
            <h1 className="page-title">How do you like to learn?</h1>
            <p className="page-sub">Every approach keeps the parts that work for everyone. They differ in what comes first. Not sure? Keep Balanced: you can take a two-minute quiz and a five-minute recall experiment later to find out.</p>
            <div className="mode-pick">
              {MODES.map((m) => (
                <button key={m.id} type="button" className="goal-option" aria-pressed={mode === m.id} onClick={() => { sfx.tap(); setMode(m.id) }}>
                  <span className="mode-icon sm"><ModeIcon mode={m} size={15} /></span>
                  <span className="grow">
                    <span className="list-title">{m.label}</span>
                    <span className="xsmall subtle">{m.tagline}</span>
                  </span>
                  {mode === m.id && <Check size={16} className="check" aria-hidden="true" />}
                </button>
              ))}
            </div>
            <div className="row between">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep(3)}>Continue <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack rise">
            <h1 className="page-title">{starts.length ? 'Your first step' : 'Start with one topic'}</h1>
            <p className="page-sub">Read a short lesson (try every activity in it), answer the checks, then study its cards. Tomorrow, Today will tell you what to review.</p>
            <div className="stack-sm">
              {starts.map(({ collection, next }) => (
                <button key={collection.id} type="button" className="card card-link pick" onClick={() => finish(`/topic/${next.pack.id}/lesson`)}>
                  <Tile pack={next.pack} />
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <div className="xsmall subtle">{collection.name}</div>
                    <div className="list-title">{next.pack.name}</div>
                    <div className="xsmall subtle clamp-2">{next.pack.description}</div>
                  </div>
                  <ArrowRight size={18} className="subtle" />
                </button>
              ))}
            </div>
            <div className="row between wrap">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
              <div className="row wrap">
                <button type="button" className="btn" onClick={() => finish('/paths')}><Compass size={16} /> See all paths</button>
                {!starts.length && <button type="button" className="btn btn-primary" onClick={() => finish('/library')}>Browse topics</button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
