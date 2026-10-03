import { Link } from 'react-router-dom'
import Tile from './Tile'
import { LEVEL_LABELS, subjectLabel } from '../lib/subjects'
import { MEMORY_TONE_LABELS, memoryTone } from '../lib/progress'
import { useApp } from '../state/context'

/** A topic as a catalog card on top of its deck: call number, subject tab, progress. */
export default function TopicCard({ pack, summary, missing = [] }) {
  const { callNos } = useApp()
  const tone = memoryTone(summary.memory)
  return (
    <Link to={`/topic/${pack.id}`} className="card punch card-link topic-card">
      <div className="catalog-head">
        <span className="callno">{callNos.get(pack.id)}</span>
        {summary.dueCount > 0 ? (
          <span className="stamp">Due · {summary.dueCount}</span>
        ) : summary.status === 'mastered' ? (
          <span className="stamp good">Mastered</span>
        ) : null}
      </div>
      <div className="topic-card-title">
        <Tile pack={pack} />
        <div className="grow">
          <h3 className="topic-name">{pack.name}</h3>
          <div className="xsmall subtle">
            {subjectLabel(pack.subject)} · {LEVEL_LABELS[pack.level] || pack.level}
            {pack.community && ' · Yours'}
          </div>
        </div>
      </div>
      {pack.description && <p className="small muted clamp-2 topic-desc">{pack.description}</p>}
      <div className="topic-foot">
        {summary.studied > 0 ? (
          <>
            <div className="row between xsmall">
              <span className="subtle">Mastery</span>
              <span className="tabular mono">{summary.mastery}%</span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${summary.mastery}%` }} />
            </div>
            <div className={`row xsmall mem-${tone}`} style={{ gap: 6 }}>
              <span className="mem-dot" />
              <span className="muted">
                Memory {Math.round((summary.memory ?? 0) * 100)}% · {MEMORY_TONE_LABELS[tone]} · {summary.studied}/{summary.total} cards
              </span>
            </div>
          </>
        ) : (
          <div className="xsmall subtle">
            {summary.lessonRead ? 'Lesson read · ready to study' : 'Not started'}
            {' · '}
            {pack.questions.length} cards
            {pack.lesson?.estimatedMinutes ? ` · ${pack.lesson.estimatedMinutes} min lesson` : ''}
          </div>
        )}
        {missing.length > 0 && <div className="xsmall subtle">Builds on {missing.map((p) => p.name).join(', ')}</div>}
      </div>
    </Link>
  )
}
