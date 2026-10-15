import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Clock, Target } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { COLLECTIONS, availableTopics, nextTopic } from '../lib/collections'
import { KIND_LABELS, goalSubjects, groupGoals } from '../lib/goals'
import { readiness } from '../lib/practice'
import { sfx } from '../lib/sfx'
import PathIcon from '../components/PathIcon'
import MemoryRing from '../components/MemoryRing'
import GoalPicker from '../components/GoalPicker'

function PathCard({ collection, ready, topics, started, next, goal }) {
  return (
    <Link to={`/path/${collection.id}`} className={`card card-link path-card${goal ? ' goal' : ''}`} style={{ '--hue': collection.hue }}>
      <div className="path-card-top">
        <PathIcon collection={collection} size="lg" />
        <div className="grow">
          <div className="eyebrow">{KIND_LABELS[collection.kind] || 'Path'}{goal ? ' · Your goal' : ''}</div>
          <h2 className="path-name">{collection.name}</h2>
        </div>
        {started && <MemoryRing value={ready.score / 100} size={58} stroke={6} label="ready" />}
      </div>
      <p className="small muted">{collection.tagline}</p>
      <div className="path-meta xsmall subtle">
        <span><Target size={13} /> {collection.stages.length} stages · {topics} topics</span>
        <span><Clock size={13} /> about {collection.hours} hours</span>
      </div>
      <div className="path-stages" aria-hidden="true">
        {ready.reports.map((r) => (
          <span key={r.stage.id} className="path-stage-bar" title={r.stage.title}><span style={{ width: `${Math.round(r.progress * 100)}%` }} /></span>
        ))}
      </div>
      <div className="row between small path-cta">
        <span className="muted clamp-1">{started ? (next ? `Next: ${next.pack.name}` : 'Every topic practiced') : 'Not started'}</span>
        <span className="path-go">{started ? 'Continue' : 'Start'} <ArrowRight size={15} /></span>
      </div>
    </Link>
  )
}

/** Goals and paths: pick what you want to achieve, then follow its path. */
export default function Paths() {
  useDocumentTitle('Paths')
  const { packMap, summaries, practice, user, updateUser } = useApp()
  const rows = useMemo(() => new Map(COLLECTIONS.map((collection) => {
    const ready = readiness(collection, { packMap, summaries, practice })
    const topics = collection.stages.reduce((sum, s) => sum + availableTopics(s, packMap).length, 0)
    const started = collection.packIds.some((id) => summaries.get(id)?.started)
    return [collection.id, { collection, ready, topics, started, next: nextTopic(collection, packMap, summaries) }]
  })), [packMap, summaries, practice])
  const goals = user.goals || []
  const goalSet = new Set(goals)

  const toggle = (id) => {
    sfx.tap()
    const next = goalSet.has(id) ? goals.filter((g) => g !== id) : [...goals, id]
    updateUser({ goals: next, interests: goalSubjects(next, COLLECTIONS, packMap) })
  }

  return (
    <div className="page paths-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Goals and paths</div>
          <h1 className="page-title">What do you want to achieve?</h1>
          <p className="page-sub">Pick one or more goals. Each path lays out everything that goal needs, in order: lessons, labs, coding challenges, projects and exams. Recurse covers it end to end; outside resources are optional extras.</p>
        </div>
        <Link to="/library" className="btn"><BookOpen size={16} /> All topics</Link>
      </div>

      <details className="card goal-chooser" open={goals.length === 0}>
        <summary className="row between">
          <span className="list-title">{goals.length ? `Your goals: ${goals.map((id) => rows.get(id)?.collection.short).filter(Boolean).join(', ')}` : 'Choose your goals'}</span>
          <span className="small subtle">{goals.length ? 'Change' : `${COLLECTIONS.length} goals`}</span>
        </summary>
        <GoalPicker selected={goals} onToggle={toggle} showTaglines={false} />
      </details>

      {goals.length > 0 && (
        <section className="paths-section" aria-labelledby="your-goals">
          <h2 className="section-title" id="your-goals">Your goals</h2>
          <div className="path-grid">
            {goals.map((id) => rows.get(id)).filter(Boolean).map((row) => <PathCard key={row.collection.id} {...row} goal />)}
          </div>
        </section>
      )}

      {groupGoals(COLLECTIONS).map((group) => {
        const others = group.paths.filter((c) => !goalSet.has(c.id))
        if (!others.length) return null
        return (
          <section key={group.kind} className="paths-section" aria-labelledby={`paths-${group.kind}`}>
            <div className="catalog-head">
              <h2 className="section-title" id={`paths-${group.kind}`}>{group.title}</h2>
              <span className="eyebrow">{others.length} {others.length === 1 ? 'path' : 'paths'}</span>
            </div>
            <p className="small muted paths-blurb">{group.blurb}</p>
            <div className="path-grid">
              {others.map((c) => <PathCard key={c.id} {...rows.get(c.id)} goal={false} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
