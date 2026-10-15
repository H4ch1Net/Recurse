import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Clock, Target } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { COLLECTIONS, availableTopics, nextTopic } from '../lib/collections'
import { readiness } from '../lib/practice'
import PathIcon from '../components/PathIcon'
import MemoryRing from '../components/MemoryRing'

const KIND_LABELS = { certification: 'Certification', career: 'Career path', foundation: 'Foundations' }

export default function Paths() {
  useDocumentTitle('Paths')
  const { packMap, summaries, practice, user } = useApp()
  const rows = useMemo(() => COLLECTIONS.map((collection) => {
    const ready = readiness(collection, { packMap, summaries, practice })
    const topics = collection.stages.reduce((sum, s) => sum + availableTopics(s, packMap).length, 0)
    const started = collection.packIds.some((id) => summaries.get(id)?.started)
    return { collection, ready, topics, started, next: nextTopic(collection, packMap, summaries) }
  }), [packMap, summaries, practice])
  const goals = new Set(user.goals || [])
  const ordered = [...rows].sort((a, b) => Number(goals.has(b.collection.id)) - Number(goals.has(a.collection.id)) || Number(b.started) - Number(a.started))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Paths</h1>
          <p className="page-sub">Guided routes to a goal. Each path orders its topics so every one builds on the last, with labs, coding challenges, projects and exams along the way.</p>
        </div>
        <Link to="/library" className="btn"><BookOpen size={16} /> All topics</Link>
      </div>

      <div className="path-grid">
        {ordered.map(({ collection, ready, topics, started, next }) => (
          <Link key={collection.id} to={`/path/${collection.id}`} className={`card card-link path-card${goals.has(collection.id) ? ' goal' : ''}`} style={{ '--hue': collection.hue }}>
            <div className="path-card-top">
              <PathIcon collection={collection} size="lg" />
              <div className="grow">
                <div className="eyebrow">{KIND_LABELS[collection.kind] || 'Path'}{goals.has(collection.id) ? ' · Your goal' : ''}</div>
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
        ))}
      </div>
    </div>
  )
}
