import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, CircleCheck, Play, Sparkles, TriangleAlert } from 'lucide-react'
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

function MiniForecast({ counts, now }) {
  if (!counts.some(Boolean)) return <p className="xsmall subtle">Nothing scheduled yet. Reviews appear here once you study.</p>
  const max = Math.max(1, ...counts)
  const labels = ['Today', 'Tomorrow']
  return (
    <div className="mini-forecast" role="img" aria-label={`Reviews due over the next week: ${counts.join(', ')}`}>
      {counts.map((n, i) => (
        <div key={i} className="mini-forecast-col" title={`${labels[i] || `In ${i} days`}: ${n} reviews`}>
          <div className="mini-forecast-bar" style={{ height: `${Math.max(n ? 8 : 2, (n / max) * 100)}%` }} />
          <span>{i === 0 ? 'T' : addDays(now, i).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
        </div>
      ))}
    </div>
  )
}

export default function Today() {
  useDocumentTitle('Today')
  const { user, packs, packMap, progress, settings, stats, summaries, now } = useApp()
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="page-title">{greeting(now)}{user.name ? `, ${user.name}` : ''}.</h1>
        </div>
      </div>

      <div className="today-hero">
        <section className="card roomy review-card" aria-labelledby="review-title">
          <div className="eyebrow" id="review-title">Daily review</div>
          {canReview ? (
            <>
              <div className="review-count">
                <span className="display-num">{due.due}</span>
                <span className="review-count-label">
                  {due.due === 1 ? 'card is due' : 'cards are due'}
                  {due.newToday > 0 && <><br /><span className="muted">plus {due.newToday} new to learn</span></>}
                </span>
              </div>
              <p className="muted">
                Next session: {sessionCards} cards, about {Math.max(2, Math.round(sessionCards * 0.5))} minutes. Cards you miss come back before the session ends.
              </p>
              <div className="row wrap">
                <Link to="/study/review" className="btn btn-primary btn-lg">
                  <Play size={18} /> Start review <span className="kbd hide-mobile">R</span>
                </Link>
              </div>
            </>
          ) : due.startedCount ? (
            <>
              <div className="row" style={{ gap: 10 }}>
                <CircleCheck size={28} className="good-text" />
                <h2 className="review-title">All caught up</h2>
              </div>
              <p className="muted">
                {due.nextDue ? `Your next review is due ${formatRelative(due.nextDue, now)}.` : 'Nothing is scheduled yet.'} Spacing reviews out is what makes them stick, so this is a good time to learn something new.
              </p>
              <div className="row wrap">
                <Link to="/library" className="btn btn-primary"><BookOpen size={16} /> Start a new topic</Link>
                {inProgress[0] && (
                  <Link to={`/study/topic/${inProgress[0].pack.id}`} className="btn">Continue {inProgress[0].pack.name}</Link>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="review-title">Pick your first topic</h2>
              <p className="muted">
                Read a short lesson, then answer questions. Recurse schedules each card again right before you would forget it, so a few minutes a day is enough.
              </p>
              <div className="row wrap">
                <a href="#start-here" className="btn btn-primary">See suggestions <ArrowRight size={16} /></a>
                <Link to="/library" className="btn">Browse the library</Link>
              </div>
            </>
          )}
          <div className="goal-strip">
            <div className="row between xsmall">
              <span className="subtle">Today’s goal</span>
              <span className="tabular">{today.reviews} / {settings.dailyGoal} reviews</span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${goalRatio * 100}%` }} />
            </div>
          </div>
        </section>

        <section className="card memory-card" aria-labelledby="memory-title">
          <div className="eyebrow" id="memory-title">Memory health</div>
          <div className="memory-card-body">
            <MemoryRing value={memory} size={128} label="recall" />
            <div className="stack-sm">
              <div>
                <div className="stat-value">{studiedCards}</div>
                <div className="xsmall subtle">cards learned</div>
              </div>
              <div>
                <div className="stat-value">{matureCards}</div>
                <div className="xsmall subtle">mature (3+ weeks)</div>
              </div>
            </div>
          </div>
          <p className="xsmall subtle">
            {memory === null
              ? 'Estimated chance you would recall a studied card right now. Appears once you start.'
              : `Estimated chance you would recall a studied card right now: ${MEMORY_TONE_LABELS[memoryTone(memory)].toLowerCase()}.`}
          </p>
          <div>
            <div className="row between xsmall" style={{ marginBottom: 6 }}>
              <span className="subtle">Reviews this week</span>
              <Link to="/stats" className="xsmall">Details</Link>
            </div>
            <MiniForecast counts={forecast} now={now} />
          </div>
        </section>
      </div>

      {(fading.length > 0 || mistakes > 0) && (
        <section className="stack" style={{ marginTop: 'var(--s-7)' }} aria-labelledby="attention-title">
          <h2 className="section-title" id="attention-title">Needs attention</h2>
          <div className="card">
            <div className="list">
              {mistakes > 0 && (
                <div className="list-row">
                  <span className="tile sm" style={{ '--hue': 356 }} aria-hidden="true"><TriangleAlert size={16} /></span>
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
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section style={{ marginTop: 'var(--s-7)' }} aria-labelledby="continue-title">
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
        <section style={{ marginTop: 'var(--s-7)' }} id="start-here" aria-labelledby="suggest-title">
          <div className="section-head">
            <h2 className="section-title" id="suggest-title">
              <Sparkles size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />
              {inProgress.length ? 'Learn something new' : 'Start here'}
            </h2>
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
