import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowRight, Brain, CalendarClock, MessageSquareText } from 'lucide-react'
import { useApp } from '../state/context'
import { SUBJECTS } from '../lib/subjects'
import { recommendTopics } from '../lib/recommend'
import BrandMark from '../components/BrandMark'
import Tile from '../components/Tile'

const PRINCIPLES = [
  { icon: Brain, title: 'Recall, not reread', body: 'Every lesson and card asks you to pull the answer from memory. That effort is what builds lasting memory.' },
  { icon: CalendarClock, title: 'Reviews right before you forget', body: 'Each card is rescheduled from how well you knew it, so easy cards fade into the background and hard ones come back sooner.' },
  { icon: MessageSquareText, title: 'Explain it to own it', body: 'Write a plain-language explanation of a topic and compare it with the lesson. Gaps show up immediately.' }
]

export default function Onboarding() {
  const { updateUser, user, packs, summaries } = useApp()
  const [step, setStep] = useState(0)
  const [target, setTarget] = useState(null)
  const [name, setName] = useState(user.name || '')
  const [interests, setInterests] = useState(user.interests || [])

  const finish = (to = '/') => {
    setTarget(to)
    updateUser({ name: name.trim(), interests, onboardingComplete: true, createdAt: user.createdAt || new Date().toISOString() })
  }
  const toggle = (id) => setInterests((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  const picks = recommendTopics(packs, summaries, interests, 3)
  if (user.onboardingComplete) return <Navigate to={target || '/'} replace />

  return (
    <div className="onboarding">
      <div className="onboarding-card card roomy">
        <div className="row between">
          <div className="brand"><BrandMark /> <span>recurse</span></div>
          <div className="onboarding-steps" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}
          </div>
        </div>

        {step === 0 && (
          <div className="stack rise">
            <h1 className="page-title">Learn it. Keep it.</h1>
            <p className="page-sub">Recurse teaches short lessons, then quizzes you on a schedule built around how memory actually fades. A few minutes a day is enough.</p>
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
            <h1 className="page-title">What do you want to learn?</h1>
            <p className="page-sub">Pick any subjects that interest you. You can study anything in the library either way.</p>
            <div className="interest-grid">
              {SUBJECTS.map((s) => {
                const count = packs.filter((p) => p.subject === s.id).length
                return (
                  <button key={s.id} type="button" className="interest" aria-pressed={interests.includes(s.id)} onClick={() => toggle(s.id)} style={{ '--hue': s.hue }}>
                    <span className="interest-label">{s.label}</span>
                    <span className="xsmall subtle">{count} topics</span>
                  </button>
                )
              })}
            </div>
            <div className="field">
              <label className="label" htmlFor="ob-name">Your name <span className="subtle">(optional)</span></label>
              <input id="ob-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" maxLength={40} />
            </div>
            <div className="row between">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
              <button type="submit" className="btn btn-primary btn-lg">Continue <ArrowRight size={18} /></button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="stack rise">
            <h1 className="page-title">Start with one topic</h1>
            <p className="page-sub">Read its lesson (about ten minutes), answer the check questions, then study the cards. Tomorrow, Recurse will tell you what to review.</p>
            <div className="stack-sm">
              {picks.map((pack) => (
                <button key={pack.id} type="button" className="card card-link pick" onClick={() => finish(`/topic/${pack.id}/lesson`)}>
                  <Tile pack={pack} />
                  <div className="grow" style={{ textAlign: 'left' }}>
                    <div className="list-title">{pack.name}</div>
                    <div className="xsmall subtle clamp-2">{pack.description}</div>
                  </div>
                  <ArrowRight size={18} className="subtle" />
                </button>
              ))}
            </div>
            <div className="row between wrap">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="btn" onClick={() => finish('/library')}>Browse all topics</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
