import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Award, BookOpen, ChevronLeft, CircleCheck, Download, Eye, EyeOff, MessageSquareText, Pencil, Play, RotateCcw, Search, Shuffle, Trash2, TriangleAlert } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { LEVEL_LABELS, QUESTION_TYPE_LABELS, subjectLabel } from '../lib/subjects'
import { MEMORY_TONE_LABELS, memoryTone, LEECH_LAPSES, topicOf } from '../lib/progress'
import { retrievability, stateLabel } from '../lib/memory'
import { formatRelative, formatDate } from '../lib/dates'
import { isChoiceType } from '../lib/packSchema'
import { missingPrereqs } from '../lib/recommend'
import { downloadCertificate, downloadJSON } from '../lib/share'
import Tile from '../components/Tile'
import MemoryRing from '../components/MemoryRing'
import { ConfirmDialog } from '../components/Modal'
import EmptyState from '../components/EmptyState'

function answerText(question) {
  if (isChoiceType(question.type)) return question.choices[question.answer]
  return question.answer
}

function CardBrowser({ pack, topic, now }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [showAnswers, setShowAnswers] = useState(false)
  const rows = useMemo(() => {
    const terms = query.toLowerCase()
    return pack.questions
      .map((q) => ({ q, card: topic.cards?.[q.id] }))
      .filter(({ q, card }) => {
        if (terms && !`${q.question} ${q.concept || ''} ${answerText(q)}`.toLowerCase().includes(terms)) return false
        if (filter === 'new') return !(card?.reps > 0)
        if (filter === 'learned') return card?.reps > 0
        if (filter === 'due') return card?.reps > 0 && new Date(card.due) <= now
        if (filter === 'trouble') return (card?.lapses || 0) >= 2 || topic.mistakes?.[q.id]
        return true
      })
  }, [pack, topic, query, filter, now])

  return (
    <div className="stack">
      <div className="row wrap">
        <div className="search grow" style={{ minWidth: 200 }}>
          <Search size={16} />
          <input className="input" type="search" placeholder="Search cards" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search cards" />
        </div>
        <select className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter cards">
          <option value="all">All cards</option>
          <option value="new">New</option>
          <option value="learned">Learned</option>
          <option value="due">Due now</option>
          <option value="trouble">Trouble spots</option>
        </select>
        <button type="button" className="btn" onClick={() => setShowAnswers((v) => !v)} aria-pressed={showAnswers}>
          {showAnswers ? <EyeOff size={16} /> : <Eye size={16} />} {showAnswers ? 'Hide answers' : 'Show answers'}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="small subtle">No cards match.</p>
      ) : (
        <div className="list card-browser">
          {rows.map(({ q, card }) => {
            const r = retrievability(card, now)
            const leech = (card?.lapses || 0) >= LEECH_LAPSES
            return (
              <div key={q.id} className="list-row card-row">
                <div className="grow">
                  <div className="small card-q">{q.question}</div>
                  {showAnswers && <div className="small good-text card-a">{answerText(q)}</div>}
                  <div className="xsmall subtle row wrap" style={{ gap: 8, marginTop: 4 }}>
                    <span>{QUESTION_TYPE_LABELS[q.type]}</span>
                    {q.concept && <span>· {q.concept}</span>}
                    {leech && <span className="warn-text">· Troublesome ({card.lapses} lapses)</span>}
                  </div>
                </div>
                <div className="card-state">
                  <span className={`chip ${card?.reps > 0 ? '' : 'outline'}`}>{stateLabel(card)}</span>
                  {card?.reps > 0 && (
                    <span className={`xsmall tabular mem-${memoryTone(r)}`}>
                      <span className="mem-text">{Math.round(r * 100)}%</span>
                      <span className="subtle"> · {formatRelative(card.due, now)}</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Topic() {
  const { topicId } = useParams()
  const { packMap, progress, summaries, user, now, resetTopic, removePack, toast } = useApp()
  const navigate = useNavigate()
  const pack = packMap.get(topicId)
  const [tab, setTab] = useState('overview')
  const [confirm, setConfirm] = useState(null)
  useDocumentTitle(pack?.name)
  if (!pack) return <Navigate to="/library" replace />

  const summary = summaries.get(pack.id)
  const topic = topicOf(progress, pack.id)
  const tone = memoryTone(summary.memory)
  const missing = missingPrereqs(pack, packMap, summaries)
  const lesson = pack.lesson
  const studyLabel = summary.dueCount
    ? `Study · ${summary.dueCount} due`
    : summary.newCount
      ? summary.studied ? `Learn ${Math.min(summary.newCount, 12)} new` : 'Start studying'
      : 'Review ahead'

  return (
    <div className="page">
      <Link to="/library" className="back-link small"><ChevronLeft size={16} /> Library</Link>

      <header className="topic-head">
        <Tile pack={pack} size="lg" />
        <div className="grow">
          <div className="eyebrow">{subjectLabel(pack.subject)} · {LEVEL_LABELS[pack.level] || pack.level}{pack.community ? ' · Your pack' : ''}</div>
          <h1 className="page-title">{pack.name}</h1>
          {pack.description && <p className="page-sub">{pack.description}</p>}
          {missing.length > 0 && (
            <p className="small subtle" style={{ marginTop: 8 }}>
              Builds on {missing.map((p, i) => <span key={p.id}>{i > 0 && ', '}<Link to={`/topic/${p.id}`}>{p.name}</Link></span>)}. Starting here is fine too.
            </p>
          )}
        </div>
      </header>

      <div className="topic-actions">
        <Link to={`/study/topic/${pack.id}`} className="btn btn-primary btn-lg"><Play size={18} /> {studyLabel}</Link>
        {lesson && (
          <Link to={`/topic/${pack.id}/lesson`} className="btn btn-lg"><BookOpen size={18} /> {summary.lessonRead ? 'Reread lesson' : 'Read lesson'}</Link>
        )}
        {lesson && (
          <Link to={`/topic/${pack.id}/explain`} className="btn btn-lg"><MessageSquareText size={18} /> Explain it</Link>
        )}
        <Link to={`/study/practice/${pack.id}`} className="btn btn-lg btn-ghost" title="Shuffled practice across every card"><Shuffle size={18} /> Practice all</Link>
      </div>

      <div className="topic-stats">
        <div className="stat topic-ring">
          <MemoryRing value={summary.memory} size={92} stroke={8} label="memory" />
          <div>
            <div className="stat-label">Memory</div>
            <div className={`small mem-${tone}`}><span className="mem-text">{MEMORY_TONE_LABELS[tone]}</span></div>
            <div className="xsmall subtle">
              {summary.dueCount > 0 ? `${summary.dueCount} ready to review now` : summary.nextDue ? `Next review ${formatRelative(summary.nextDue, now)}` : 'No reviews scheduled'}
            </div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Mastery</div>
          <div className="stat-value">{summary.mastery}%</div>
          <div className="bar" style={{ marginTop: 8 }}><span style={{ width: `${summary.mastery}%` }} /></div>
        </div>
        <div className="stat">
          <div className="stat-label">Cards</div>
          <div className="stat-value">{summary.studied}<span className="subtle" style={{ fontSize: '0.6em' }}> / {summary.total}</span></div>
          <div className="stat-note">{summary.newCount} new · {summary.matureCount} mature</div>
        </div>
        <div className="stat">
          <div className="stat-label">Due now</div>
          <div className="stat-value">{summary.dueCount}</div>
          <div className="stat-note">{summary.mistakes ? `${summary.mistakes} unresolved mistakes` : 'No open mistakes'}</div>
        </div>
      </div>

      {summary.status === 'mastered' && (
        <div className="callout good" style={{ marginBottom: 'var(--s-6)' }}>
          <Award size={18} />
          <span className="grow">You have mastered this topic. Keep reviewing when cards come due to hold on to it.</span>
          <button type="button" className="btn btn-sm" onClick={() => downloadCertificate({ name: user.name, topic: pack.name, mastery: summary.mastery })}>
            <Download size={14} /> Certificate
          </button>
        </div>
      )}
      {summary.leechCount > 0 && (
        <div className="callout warn" style={{ marginBottom: 'var(--s-6)' }}>
          <TriangleAlert size={18} />
          <span>{summary.leechCount} {summary.leechCount === 1 ? 'card keeps' : 'cards keep'} slipping. Rereading the lesson section behind them usually works better than drilling.</span>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Topic sections">
        {[
          ['overview', 'Overview'],
          ['cards', `Cards (${pack.questions.length})`],
          ...(topic.feynman?.length ? [['explanations', `Explanations (${topic.feynman.length})`]] : []),
          ['manage', 'Manage']
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2 topic-overview">
          <section className="card">
            <div className="section-head">
              <h2 className="section-title">Lesson</h2>
              {lesson && <span className="xsmall subtle">{lesson.estimatedMinutes} min · {summary.checksDone}/{summary.sections} checks passed</span>}
            </div>
            {lesson ? (
              <>
                {lesson.intro && <p className="small muted" style={{ marginBottom: 'var(--s-3)' }}>{lesson.intro}</p>}
                <ol className="lesson-outline">
                  {lesson.sections.map((section, i) => (
                    <li key={i}>
                      <Link to={`/topic/${pack.id}/lesson#section-${i + 1}`}>
                        <span className={`outline-dot${topic.checks?.[i] ? ' done' : ''}`} aria-hidden="true">{topic.checks?.[i] ? <CircleCheck size={16} /> : i + 1}</span>
                        <span>{section.title}</span>
                        {topic.checks?.[i] && <span className="sr-only">(check passed)</span>}
                      </Link>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="small muted">This pack has no lesson, only cards. Study them directly.</p>
            )}
          </section>
          <section className="card">
            <h2 className="section-title" style={{ marginBottom: 'var(--s-3)' }}>Key terms</h2>
            {lesson?.keyTerms?.length ? (
              <dl className="terms">
                {lesson.keyTerms.map((t) => (
                  <div key={t.term}>
                    <dt>{t.term}</dt>
                    <dd>{t.definition}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="small muted">No key terms listed.</p>
            )}
          </section>
        </div>
      )}

      {tab === 'cards' && <CardBrowser pack={pack} topic={topic} now={now} />}

      {tab === 'explanations' && (
        <div className="stack">
          {topic.feynman.map((entry, i) => (
            <article key={i} className="card">
              <div className="row between xsmall subtle">
                <span>{formatDate(entry.date)} · {entry.words} words</span>
                {entry.score != null && <span className="chip">{entry.ai ? `AI score ${entry.score}` : `Self-rated ${entry.score}`}</span>}
              </div>
              <p className="small" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{entry.text}</p>
            </article>
          ))}
          <Link to={`/topic/${pack.id}/explain`} className="btn" style={{ alignSelf: 'flex-start' }}>Write another explanation</Link>
        </div>
      )}

      {tab === 'manage' && (
        <div className="card stack">
          {pack.community && (
            <div className="setting-row">
              <div className="copy">
                <div className="label">Edit pack</div>
                <div className="hint">Change cards, answers and details. Progress on unchanged cards is kept.</div>
              </div>
              <div className="control"><Link to={`/create/${pack.id}`} className="btn"><Pencil size={16} /> Edit</Link></div>
            </div>
          )}
          <div className="setting-row">
            <div className="copy">
              <div className="label">Export pack</div>
              <div className="hint">Download this pack as JSON to share it or keep a copy.</div>
            </div>
            <div className="control">
              <button type="button" className="btn" onClick={() => downloadJSON(`${pack.id}.json`, Object.fromEntries(Object.entries(pack).filter(([k]) => k !== 'community')))}>
                <Download size={16} /> Export
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="copy">
              <div className="label">Reset progress</div>
              <div className="hint">Forget every review for this topic and start fresh. Other topics are not affected.</div>
            </div>
            <div className="control">
              <button type="button" className="btn btn-danger" onClick={() => setConfirm('reset')} disabled={!summary.started}><RotateCcw size={16} /> Reset</button>
            </div>
          </div>
          {pack.community && (
            <div className="setting-row">
              <div className="copy">
                <div className="label">Delete pack</div>
                <div className="hint">Remove this pack and its progress from your library.</div>
              </div>
              <div className="control"><button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}><Trash2 size={16} /> Delete</button></div>
            </div>
          )}
        </div>
      )}

      {!pack.questions.length && <EmptyState title="No cards yet" />}

      {confirm === 'reset' && (
        <ConfirmDialog
          title={`Reset ${pack.name}?`}
          description={`This forgets ${summary.studied} learned cards, lesson checks and mistakes for this topic. It cannot be undone.`}
          confirmLabel="Reset progress"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            resetTopic(pack.id)
            setConfirm(null)
            toast(`${pack.name} progress reset`)
          }}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title={`Delete ${pack.name}?`}
          description="The pack and its progress will be removed. Export it first if you want a copy."
          confirmLabel="Delete pack"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            removePack(pack.id)
            toast(`Deleted ${pack.name}`)
            navigate('/library')
          }}
        />
      )}
    </div>
  )
}
