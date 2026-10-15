import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpenCheck, Check, ClipboardList, FlaskConical, Info } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { MODES, MODE_MAP, STRATEGIES, METHODS, modeOf, rankModes } from '../lib/approaches'
import { retrievability } from '../lib/memory'
import { formatRelative } from '../lib/dates'
import { sfx } from '../lib/sfx'
import { burstFrom } from '../lib/juice'
import ModeIcon from '../components/ModeIcon'

const EVIDENCE = { high: ['Strong evidence', 'good'], moderate: ['Good evidence', 'accent'], myth: ['Not supported', 'warn'] }

/** Recall measured on cards first learned in each approach, from the learner's own history. */
function useModeData(progress, now) {
  return useMemo(() => {
    const byMode = {}
    for (const topic of Object.values(progress || {})) {
      for (const card of Object.values(topic.cards || {})) {
        if (!card.learnedIn || !(card.reps >= 2)) continue
        const entry = (byMode[card.learnedIn] ||= { cards: 0, memory: 0, lapses: 0, reviews: 0 })
        entry.cards++
        entry.memory += retrievability(card, now)
        entry.lapses += card.lapses || 0
        entry.reviews += card.reps - 1
      }
    }
    return Object.entries(byMode)
      .map(([mode, e]) => ({ mode: MODE_MAP[mode], cards: e.cards, memory: e.memory / e.cards, recall: e.reviews ? 1 - e.lapses / e.reviews : null }))
      .filter((row) => row.mode)
      .sort((a, b) => b.cards - a.cards)
  }, [progress, now])
}

export default function Approach() {
  useDocumentTitle('How you learn')
  const { settings, updateSettings, user, progress, now } = useApp()
  const current = modeOf(settings)
  const approach = user.approach || {}
  const ranked = approach.quiz ? rankModes(approach.quiz.totals) : null
  const experiment = approach.experiment
  const data = useModeData(progress, now)
  const enoughData = data.some((row) => row.cards >= 15)
  const delayedReady = experiment?.immediate && !experiment.delayed && now - new Date(experiment.date) > 12 * 3600000

  const choose = (mode, event) => {
    if (mode.id === current.id) return
    sfx.success()
    burstFrom(event.currentTarget, { kind: 'stars', count: 16 })
    updateSettings({ learningMode: mode.id, ...mode.preset })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Learning approach</div>
          <h1 className="page-title">How you learn best</h1>
          <p className="page-sub">
            Some study methods work for nearly everyone, and Recurse builds them into everything. On top of that, you can choose what comes first:
            doing, seeing, being tested or explaining. Take the quiz to find what you enjoy, then run the experiment to see what actually sticks.
          </p>
        </div>
      </div>

      <section className="approach-current card roomy" aria-labelledby="current-mode">
        <div className="catalog-head"><span className="callno" id="current-mode">Your approach</span><span className="chip accent"><ModeIcon mode={current} size={13} /> {current.label}</span></div>
        <div className="approach-current-body">
          <div className="approach-badge" aria-hidden="true"><ModeIcon mode={current} size={34} /></div>
          <div className="stack-sm grow">
            <h2 className="section-title">{current.label}: <em className="approach-tag">{current.tagline}</em></h2>
            <p className="muted">{current.description}</p>
            <ul className="approach-changes">
              {current.changes.map((c) => <li key={c}><Check size={14} /> {c}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <div className="grid-2 approach-find">
        <section className="card roomy stack-sm">
          <div className="catalog-head"><span className="callno"><ClipboardList size={13} /> The quiz</span>{approach.quiz && <span className="stamp good">Done</span>}</div>
          <h2 className="section-title">What do you enjoy?</h2>
          <p className="small muted">Eight quick questions about how you like to study and what makes you quit. It suggests an approach you are likely to stick with. Two minutes.</p>
          {ranked && (
            <ol className="approach-rank">
              {ranked.slice(0, 3).map((m, i) => (
                <li key={m.id}><span className="tabular">{i + 1}</span> <ModeIcon mode={m} size={14} /> {m.label}</li>
              ))}
            </ol>
          )}
          <div><Link to="/approach/quiz" className="btn">{approach.quiz ? 'Retake the quiz' : 'Take the quiz'} <ArrowRight size={16} /></Link></div>
        </section>
        <section className="card roomy stack-sm">
          <div className="catalog-head"><span className="callno"><FlaskConical size={13} /> The experiment</span>{experiment?.immediate && <span className="stamp good">Done</span>}</div>
          <h2 className="section-title">What actually sticks?</h2>
          <p className="small muted">
            Learn 18 words of an invented language with three different methods, then see which ones you remember. Five minutes, plus an optional two-minute check a day later, which is the real test.
          </p>
          {experiment?.immediate && (
            <div className="experiment-mini">
              {METHODS.map((m) => {
                const value = experiment.delayed?.[m.id] ?? experiment.immediate[m.id]
                return (
                  <div key={m.id} className="experiment-mini-row">
                    <span className="small">{m.label}</span>
                    <span className="bar"><span style={{ width: `${Math.round(value * 100)}%` }} /></span>
                    <span className="xsmall tabular">{Math.round(value * 6)}/6</span>
                  </div>
                )
              })}
              <p className="xsmall subtle">{experiment.delayed ? 'After one day.' : `Right after studying, ${formatRelative(experiment.date, now)}.`}</p>
            </div>
          )}
          <div className="row wrap">
            {delayedReady ? (
              <Link to="/approach/experiment?check=delayed" className="btn btn-primary">Take the one-day check <ArrowRight size={16} /></Link>
            ) : (
              <Link to="/approach/experiment" className="btn">{experiment ? 'Run it again' : 'Run the experiment'} <ArrowRight size={16} /></Link>
            )}
          </div>
        </section>
      </div>

      <section style={{ marginTop: 'var(--s-8)' }} aria-labelledby="modes-title">
        <div className="section-head"><h2 className="section-title" id="modes-title">Choose an approach</h2><span className="callno">Switch any time</span></div>
        <div className="mode-grid">
          {MODES.map((mode) => {
            const active = mode.id === current.id
            const rank = ranked?.findIndex((m) => m.id === mode.id)
            return (
              <article key={mode.id} className={`mode-card card${active ? ' active' : ''}`}>
                <div className="row between">
                  <span className="mode-icon"><ModeIcon mode={mode} size={20} /></span>
                  {rank === 0 && <span className="chip good">Quiz match</span>}
                  {experiment && rank !== 0 && mode.id === experiment.suggested && <span className="chip accent">Experiment pick</span>}
                </div>
                <h3 className="mode-title">{mode.label}</h3>
                <p className="small muted">{mode.tagline}</p>
                <p className="small">{mode.description}</p>
                <div className="xsmall subtle">Built on: {mode.research.map((id) => STRATEGIES.find((s) => s.id === id)?.title).join(', ')}</div>
                <button type="button" className={`btn ${active ? '' : 'btn-primary'}`} onClick={(e) => choose(mode, e)} disabled={active} aria-pressed={active}>
                  {active ? <><Check size={16} /> Current approach</> : 'Use this approach'}
                </button>
              </article>
            )
          })}
        </div>
      </section>

      {data.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }} aria-labelledby="data-title">
          <div className="section-head"><h2 className="section-title" id="data-title">Your data</h2><span className="callno">Cards by the approach you learned them in</span></div>
          <div className="card roomy stack-sm">
            {!enoughData && (
              <div className="callout info small"><Info size={16} /><span>Keep going: the comparison becomes meaningful after about 15 reviewed cards per approach.</span></div>
            )}
            {data.map((row) => (
              <div key={row.mode.id} className="experiment-mini-row wide">
                <span className="small"><ModeIcon mode={row.mode} size={13} /> {row.mode.label}</span>
                <span className="bar"><span style={{ width: `${Math.round((row.recall ?? 0) * 100)}%` }} /></span>
                <span className="xsmall tabular">{row.recall == null ? 'n/a' : `${Math.round(row.recall * 100)}% recalled`} · {row.cards} cards</span>
              </div>
            ))}
            <p className="xsmall subtle">Recalled means the share of reviews you got right on cards first learned in that approach. Different topics differ in difficulty, so compare within similar material.</p>
          </div>
        </section>
      )}

      <section style={{ marginTop: 'var(--s-8)' }} aria-labelledby="science-title">
        <div className="section-head"><h2 className="section-title" id="science-title">What the research says</h2><span className="callno">And how Recurse uses it</span></div>
        <div className="strategy-grid">
          {STRATEGIES.map((s) => {
            const [label, tone] = EVIDENCE[s.evidence]
            return (
              <article key={s.id} className={`strategy card${s.evidence === 'myth' ? ' myth' : ''}`}>
                <div className="row between"><h3 className="list-title">{s.title}</h3><span className={`chip ${tone}`}>{label}</span></div>
                <p className="small">{s.summary}</p>
                <p className="small"><BookOpenCheck size={13} className="subtle" style={{ verticalAlign: '-2px' }} /> {s.inRecurse}</p>
                <p className="xsmall subtle">{s.source}</p>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
