import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, ClipboardList, Code, FlaskConical, Play, Repeat, Route, Shuffle, Terminal, Timer, TriangleAlert } from 'lucide-react'
import { useApp } from '../state/context'
import { useHotkeys } from '../hooks/useHotkeys'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { dueSummary } from '../lib/session'
import { reviewForecast, memoryTone, MEMORY_TONE_LABELS } from '../lib/progress'
import { recommendTopics, missingPrereqs } from '../lib/recommend'
import { addDays, formatRelative, greeting } from '../lib/dates'
import { todayLog } from '../lib/gamification'
import MemoryRing from '../components/MemoryRing'
import TopicCard from '../components/TopicCard'
import Tile from '../components/Tile'
import Illustration from '../components/Illustration'
import PathIcon from '../components/PathIcon'
import ModeIcon from '../components/ModeIcon'
import { COLLECTIONS, nextTopic } from '../lib/collections'
import { duePractice, pathExams, readiness } from '../lib/practice'
import { modeOf } from '../lib/approaches'

/** Today's plan: a short, ordered list of the most useful things to do next. */
function TodayPlan({ items }) {
  if (!items.length) return null
  return (
    <section style={{ marginTop: 'var(--s-8)' }} aria-labelledby="plan-title">
      <div className="section-head">
        <h2 className="section-title" id="plan-title">Today's plan</h2>
        <span className="callno">{items.length} {items.length === 1 ? 'step' : 'steps'}</span>
      </div>
      <ol className="plan-list">
        {items.map((item, i) => (
          <li key={item.key}>
            <Link to={item.to} className={`plan-item${i === 0 ? ' first' : ''}`}>
              <span className="plan-num">{i + 1}</span>
              <span className="plan-icon" aria-hidden="true">{item.icon}</span>
              <span className="grow">
                <span className="list-title">{item.title}</span>
                <span className="xsmall subtle">{item.note}</span>
              </span>
              <ArrowRight size={16} className="subtle" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

function MiniForecast({ counts, now }) {
  if (!counts.some(Boolean)) return <p className="xsmall subtle">Nothing scheduled yet. Reviews appear here once you study.</p>
  const max = Math.max(1, ...counts)
  const labels = ['Today', 'Tomorrow']
  return (
    <div className="mini-forecast" role="img" aria-label={`Reviews due over the next week: ${counts.join(', ')}`}>
      {counts.map((n, i) => (
        <div key={i} className="mini-forecast-col" title={`${labels[i] || `In ${i} days`}: ${n} reviews`}>
          <div className="mini-forecast-track">
            <div className="mini-forecast-bar" style={{ height: `${Math.max(n ? 8 : 2, (n / max) * 100)}%`, animationDelay: `${i * 40}ms` }} />
          </div>
          <span>{i === 0 ? 'Today' : addDays(now, i).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
        </div>
      ))}
    </div>
  )
}

export default function Today() {
  useDocumentTitle('Today')
  const { user, packs, packMap, progress, settings, stats, summaries, now, practice } = useApp()
  const navigate = useNavigate()
  const due = useMemo(() => dueSummary(packs, progress, settings, stats, now), [packs, progress, settings, stats, now])
  const forecast = useMemo(() => reviewForecast(packs, progress, 7, now), [packs, progress, now])
  const today = todayLog(stats, now)
  const canReview = due.due + due.newToday > 0
  useHotkeys({ r: () => canReview && navigate('/study/review') })

  const list = packs.map((pack) => ({ pack, summary: summaries.get(pack.id) }))
  const studiedCards = list.reduce((sum, { summary }) => sum + summary.studied, 0)
  const matureCards = list.reduce((sum, { summary }) => sum + summary.matureCount, 0)
  const memory = studiedCards
    ? list.reduce((sum, { summary }) => sum + (summary.memory ?? 0) * summary.studied, 0) / studiedCards
    : null
  const inProgress = list
    .filter(({ summary }) => summary.started)
    .sort((a, b) => b.summary.dueCount - a.summary.dueCount || new Date(b.summary.lastStudied || 0) - new Date(a.summary.lastStudied || 0))
  const fading = inProgress.filter(({ summary }) => summary.status === 'fading').slice(0, 4)
  const mistakes = list.reduce((sum, { summary }) => sum + summary.mistakes, 0)
  const suggestions = recommendTopics(packs, summaries, user.interests, inProgress.length ? 3 : 6)
  const sessionCards = Math.min(settings.sessionSize, due.due + due.newToday)
  const goalRatio = Math.min(1, today.reviews / Math.max(1, settings.dailyGoal))

  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  // Paths: your goals first, then any you have started.
  const goals = new Set(user.goals || [])
  const activePaths = COLLECTIONS
    .filter((c) => goals.has(c.id) || c.packIds.some((id) => summaries.get(id)?.started))
    .map((c) => ({ collection: c, next: nextTopic(c, packMap, summaries), ready: readiness(c, { packMap, summaries, practice }) }))
    .sort((a, b) => Number(goals.has(b.collection.id)) - Number(goals.has(a.collection.id)))
  const practiceDue = duePractice(practice, now)
  const mode = modeOf(settings)
  const plan = []
  if (canReview) plan.push({ key: 'review', to: '/study/review', icon: <Repeat size={16} />, title: `Daily review · ${sessionCards} cards`, note: 'Due cards first, mixed across topics, plus a few new ones.' })
  for (const item of practiceDue.slice(0, 2)) {
    plan.push({ key: `${item.kind}:${item.id}`, to: item.to, icon: item.kind === 'lab' ? <Terminal size={16} /> : <Code size={16} />, title: `Redo: ${item.title}`, note: `${item.kind === 'lab' ? 'Console lab' : 'Coding challenge'} due for a spaced redo. Try it from memory.` })
  }
  for (const { collection, next } of activePaths.slice(0, 2)) {
    if (!next) continue
    const lessonFirst = next.pack.lesson && !summaries.get(next.pack.id)?.lessonRead
    plan.push({
      key: `path:${collection.id}`,
      to: lessonFirst ? `/topic/${next.pack.id}/lesson` : `/study/topic/${next.pack.id}`,
      icon: <Route size={16} />,
      title: `${lessonFirst ? 'Learn' : 'Practice'} ${next.pack.name}`,
      note: `Next in ${collection.name}, stage: ${next.stage.title}.`
    })
  }
  const experiment = user.approach?.experiment
  if (experiment?.immediate && !experiment.delayed && now - new Date(experiment.date) > 12 * 3600000) {
    plan.push({ key: 'experiment', to: '/approach/experiment?check=delayed', icon: <FlaskConical size={16} />, title: 'One-day check for your recall experiment', note: 'Two minutes. What you remember a day later is what you really learned.' })
  }
  for (const { collection, ready } of activePaths) {
    if (!collection.exam || ready.coverage < 0.5) continue
    const last = pathExams(practice, collection.id)[0]
    if (last && now - new Date(last.date) < 7 * 86400000) continue
    plan.push({ key: `exam:${collection.id}`, to: `/quiz/run?path=${collection.id}&mode=exam&n=${collection.exam.questions}&minutes=${collection.exam.minutes}`, icon: <Timer size={16} />, title: `Take a ${collection.short} practice exam`, note: last ? 'A week since your last one. Check that your readiness holds.' : 'You have covered half the path. Measure where you stand.' })
    break
  }
  if (inProgress.length >= 2 && (mode.id === 'challenger' || !canReview)) {
    plan.push({ key: 'roulette', to: '/study/roulette', icon: <Shuffle size={16} />, title: 'Recall roulette', note: 'Random cards you have seen before, from every topic. Keeps old topics alive.' })
  }
  if (!user.approach?.quiz && !user.approach?.experiment) {
    plan.push({ key: 'approach', to: '/approach', icon: <ClipboardList size={16} />, title: 'Find how you learn best', note: 'A two-minute quiz and a five-minute experiment to tune Recurse to you.' })
  }

  return (
    <div className="page">
      <header className="today-head">
        <div className="eyebrow">{dateLabel}</div>
        <h1 className="page-title">
          {greeting(now)}{user.name ? <>, <em>{user.name}</em></> : ''}.
        </h1>
      </header>

      <div className="today-hero">
        <section className="card review-card" aria-labelledby="review-title">
          <div className="catalog-head">
            <span className="callno" id="review-title">Daily review</span>
            {canReview && <span className="callno">{sessionCards} cards · ~{Math.max(2, Math.round(sessionCards * 0.5))} min</span>}
          </div>
          {canReview ? (
            <>
              <div className="review-count">
                <span className="display-num">{due.due}</span>
                <div className="review-count-label">
                  <span className="review-count-title">{due.due === 1 ? 'card due' : 'cards due'}</span>
                  {due.newToday > 0 && <span className="stamp ink">+ {due.newToday} new</span>}
                </div>
              </div>
              <p className="muted" style={{ maxWidth: '52ch' }}>
                Overdue cards come first, weakest first, mixed across your topics. Cards you miss come back before the session ends.
              </p>
              <div className="row wrap">
                <Link to="/study/review" className="btn btn-primary btn-lg">
                  <Play size={18} /> Start review <span className="kbd hide-mobile">R</span>
                </Link>
              </div>
            </>
          ) : due.startedCount ? (
            <div className="review-empty">
              <div className="stack">
                <h2 className="review-title">All caught up.</h2>
                <p className="muted">
                  {due.nextDue ? `Your next review is due ${formatRelative(due.nextDue, now)}.` : 'Nothing is scheduled yet.'} Spacing reviews out is what makes them stick, so this is a good time to learn something new.
                </p>
                <div className="row wrap">
                  <Link to="/library" className="btn btn-primary"><BookOpen size={16} /> Start a new topic</Link>
                  {inProgress[0] && (
                    <Link to={`/study/topic/${inProgress[0].pack.id}`} className="btn">Continue {inProgress[0].pack.name}</Link>
                  )}
                </div>
              </div>
              <Illustration name="done" />
            </div>
          ) : (
            <div className="review-empty">
              <div className="stack">
                <h2 className="review-title">Pick your first topic.</h2>
                <p className="muted">
                  Read a short lesson, then answer questions. Recurse schedules each card again right before you would forget it, so a few minutes a day is enough.
                </p>
                <div className="row wrap">
                  <a href="#start-here" className="btn btn-primary">See suggestions <ArrowRight size={16} /></a>
                  <Link to="/library" className="btn">Browse the library</Link>
                </div>
              </div>
              <Illustration name="drawer" />
            </div>
          )}
          <div className="goal-strip">
            <div className="row between xsmall">
              <span className="subtle">Today’s goal</span>
              <span className="tabular mono">{today.reviews} / {settings.dailyGoal} reviews</span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${goalRatio * 100}%` }} />
            </div>
          </div>
        </section>

        <section className="card memory-card" aria-labelledby="memory-title">
          <div className="catalog-head">
            <span className="callno" id="memory-title">Memory health</span>
            {memory !== null && <span className={`chip mem-${memoryTone(memory)}`}><span className="mem-dot" /> {MEMORY_TONE_LABELS[memoryTone(memory)]}</span>}
          </div>
          <div className="memory-card-body">
            <MemoryRing value={memory} size={132} label="recall" />
            <div className="memory-figures">
              <div><span className="xsmall subtle">Cards learned</span><strong>{studiedCards}</strong></div>
              <div><span className="xsmall subtle">Mature, 3+ weeks</span><strong>{matureCards}</strong></div>
              <div><span className="xsmall subtle">Topics started</span><strong>{inProgress.length}</strong></div>
            </div>
          </div>
          <p className="xsmall subtle">
            {memory === null
              ? 'The estimated chance you would recall a studied card right now. It appears once you start.'
              : 'The estimated chance you would recall a studied card right now, across everything you have learned.'}
          </p>
          <div>
            <div className="row between xsmall" style={{ marginBottom: 8 }}>
              <span className="callno">Due this week</span>
              <Link to="/stats" className="xsmall">Details</Link>
            </div>
            <MiniForecast counts={forecast} now={now} />
          </div>
        </section>
      </div>

      <TodayPlan items={plan.slice(0, 6)} />

      {activePaths.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }} aria-labelledby="paths-title">
          <div className="section-head">
            <h2 className="section-title" id="paths-title">Your paths</h2>
            <Link to="/paths" className="small">All paths</Link>
          </div>
          <div className="today-paths">
            {activePaths.slice(0, 3).map(({ collection, next, ready }) => (
              <Link key={collection.id} to={`/path/${collection.id}`} className="card card-link today-path" style={{ '--hue': collection.hue }}>
                <PathIcon collection={collection} />
                <div className="grow stack-sm">
                  <div className="row between"><span className="list-title">{collection.name}</span><span className="xsmall tabular subtle">{ready.score}% ready</span></div>
                  <div className="path-stages" aria-hidden="true">
                    {ready.reports.map((r) => <span key={r.stage.id} className="path-stage-bar"><span style={{ width: `${Math.round(r.progress * 100)}%` }} /></span>)}
                  </div>
                  <span className="xsmall subtle clamp-1">{next ? `Next: ${next.pack.name}` : 'Every topic practiced. Keep reviewing.'}</span>
                </div>
              </Link>
            ))}
          </div>
          <Link to="/approach" className="mode-banner small" style={{ marginTop: 'var(--s-4)' }}>
            <span className="mode-icon sm"><ModeIcon mode={mode} size={14} /></span>
            <span className="grow">Learning approach: <strong>{mode.label}</strong>. {mode.tagline}</span>
            <span className="xsmall subtle">Change</span>
          </Link>
        </section>
      )}

      {(fading.length > 0 || mistakes > 0) && (
        <section style={{ marginTop: 'var(--s-8)' }} aria-labelledby="attention-title">
          <div className="section-head">
            <h2 className="section-title" id="attention-title">Needs attention</h2>
            <span className="callno">{fading.length + (mistakes > 0 ? 1 : 0)} {fading.length + (mistakes > 0 ? 1 : 0) === 1 ? 'item' : 'items'}</span>
          </div>
          <div className="list attention-list">
            {mistakes > 0 && (
              <div className="list-row">
                <span className="tile sm" style={{ '--hue': 354 }} aria-hidden="true"><TriangleAlert size={15} /></span>
                <div className="grow">
                  <div className="list-title">{mistakes} unresolved {mistakes === 1 ? 'mistake' : 'mistakes'}</div>
                  <div className="xsmall subtle">Cards you missed recently. Answer them correctly to clear them.</div>
                </div>
                <Link to="/study/mistakes" className="btn btn-sm">Review</Link>
              </div>
            )}
            {fading.map(({ pack, summary }) => (
              <div key={pack.id} className="list-row">
                <Tile pack={pack} size="sm" />
                <div className="grow">
                  <Link to={`/topic/${pack.id}`} className="list-title" style={{ color: 'inherit' }}>{pack.name}</Link>
                  <div className={`xsmall mem-${memoryTone(summary.memory)}`}>
                    <span className="mem-text">Memory {Math.round((summary.memory ?? 0) * 100)}%</span>
                    <span className="subtle"> · {summary.dueCount} due</span>
                  </div>
                </div>
                <Link to={`/study/topic/${pack.id}`} className="btn btn-sm">Refresh</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }} aria-labelledby="continue-title">
          <div className="section-head">
            <h2 className="section-title" id="continue-title">Your topics</h2>
            <Link to="/library?status=started" className="small">View all</Link>
          </div>
          <div className="grid-cards">
            {inProgress.slice(0, 6).map(({ pack, summary }) => (
              <TopicCard key={pack.id} pack={pack} summary={summary} />
            ))}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }} id="start-here" aria-labelledby="suggest-title">
          <div className="section-head">
            <h2 className="section-title" id="suggest-title">{inProgress.length ? 'Learn something new' : 'Start here'}</h2>
            <Link to="/library" className="small">Browse {packs.length} topics</Link>
          </div>
          <div className="grid-cards">
            {suggestions.map((pack) => (
              <TopicCard key={pack.id} pack={pack} summary={summaries.get(pack.id)} missing={missingPrereqs(pack, packMap, summaries)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
