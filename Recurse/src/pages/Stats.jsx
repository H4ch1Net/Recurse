import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Award, Lock, Share2, Trash2 } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { reviewForecast, memoryTone, MEMORY_TONE_LABELS } from '../lib/progress'
import { ACHIEVEMENTS } from '../lib/achievements'
import { currentStreak, levelProgress } from '../lib/gamification'
import { formatDate, formatDuration } from '../lib/dates'
import { QUESTION_TYPE_LABELS } from '../lib/subjects'
import { SESSION_KINDS } from '../lib/session'
import { isChoiceType } from '../lib/packSchema'
import { downloadProgressCard } from '../lib/share'
import { ForecastChart, ActivityHeatmap, BarList } from '../components/charts'
import EmptyState from '../components/EmptyState'
import Tile from '../components/Tile'

const TABS = [
  ['overview', 'Overview'],
  ['topics', 'Topics'],
  ['mistakes', 'Mistakes'],
  ['achievements', 'Achievements'],
  ['history', 'History']
]

function Metric({ label, value, note }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

export default function Stats() {
  useDocumentTitle('Progress')
  const { packs, packMap, progress, stats, summaries, user, now, clearMistakes } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'overview'
  const setTab = (id) => setParams(id === 'overview' ? {} : { tab: id }, { replace: true })

  const forecast = useMemo(() => reviewForecast(packs, progress, 14, now), [packs, progress, now])
  const list = packs.map((pack) => ({ pack, summary: summaries.get(pack.id) }))
  const studied = list.filter(({ summary }) => summary.studied > 0)
  const learned = studied.reduce((sum, { summary }) => sum + summary.studied, 0)
  const mature = studied.reduce((sum, { summary }) => sum + summary.matureCount, 0)
  const memory = learned ? studied.reduce((sum, { summary }) => sum + (summary.memory ?? 0) * summary.studied, 0) / learned : null
  const accuracy = stats.totalReviews ? Math.round((stats.totalCorrect / stats.totalReviews) * 100) : 0
  const streak = currentStreak(stats, now)
  const level = levelProgress(stats.xp)

  const mistakes = useMemo(() => {
    const out = []
    for (const pack of packs) {
      for (const [qid, entry] of Object.entries(progress[pack.id]?.mistakes || {})) {
        const question = pack.questions.find((q) => q.id === qid)
        if (question) out.push({ pack, question, ...entry })
      }
    }
    return out.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [packs, progress])

  const hasData = stats.totalReviews > 0 || (stats.sessions || []).length > 0

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Progress</h1>
          <p className="page-sub">What you have learned, how well it is holding, and what is coming up.</p>
        </div>
        {hasData && (
          <button
            type="button"
            className="btn"
            onClick={() => downloadProgressCard({
              name: user.name,
              level: level.level,
              streak,
              reviews: stats.totalReviews,
              accuracy,
              memory,
              topics: studied.map(({ pack, summary }) => ({ name: pack.name, mastery: summary.mastery })).sort((a, b) => b.mastery - a.mastery)
            })}
          >
            <Share2 size={16} /> Share image
          </button>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Progress sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
            {id === 'mistakes' && mistakes.length > 0 && <span className="tab-count">{mistakes.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        !hasData ? (
          <div className="card">
            <EmptyState art="chart" title="No reviews yet" action={<Link to="/library" className="btn btn-primary">Pick a topic</Link>}>
              Charts appear after your first study session: upcoming reviews, daily activity and how well each topic is holding.
            </EmptyState>
          </div>
        ) : (
          <div className="stack-lg">
            <div className="grid-stats">
              <Metric label="Reviews" value={stats.totalReviews.toLocaleString()} note={`${accuracy}% correct`} />
              <Metric label="Cards learned" value={learned} note={`${mature} mature`} />
              <Metric label="Memory" value={memory === null ? '—' : `${Math.round(memory * 100)}%`} note={memory === null ? 'no cards yet' : MEMORY_TONE_LABELS[memoryTone(memory)]} />
              <Metric label="Streak" value={`${streak}d`} note={`best ${stats.longestStreak || 0}d`} />
              <Metric label="Study time" value={formatDuration(stats.totalSeconds || 0)} note={`${(stats.sessions || []).length} sessions`} />
              <Metric label="Level" value={level.level} note={`${level.needed - level.into} XP to next`} />
            </div>

            <div className="grid-2">
              <section className="card">
                <div className="catalog-head" style={{ marginBottom: 'var(--s-4)' }}>
                  <h2 className="section-title">Upcoming reviews</h2>
                  <span className="callno">Next 14 days</span>
                </div>
                <ForecastChart counts={forecast} now={now} />
                <p className="xsmall subtle">Today includes anything overdue. Intervals grow as cards get easier, so this flattens out over time.</p>
              </section>
              <section className="card">
                <div className="catalog-head" style={{ marginBottom: 'var(--s-4)' }}>
                  <h2 className="section-title">Accuracy by question type</h2>
                </div>
                <BarList
                  rows={Object.entries(stats.byType || {})
                    .filter(([, v]) => v.total > 0)
                    .map(([type, v]) => ({
                      key: type,
                      label: QUESTION_TYPE_LABELS[type] || type,
                      value: v.correct / v.total,
                      valueLabel: `${Math.round((v.correct / v.total) * 100)}% · ${v.total}`
                    }))}
                />
              </section>
            </div>

            <section className="card">
              <div className="catalog-head" style={{ marginBottom: 'var(--s-4)' }}>
                <h2 className="section-title">Activity</h2>
                <span className="callno">Reviews per day · 12 months</span>
              </div>
              <ActivityHeatmap days={stats.days || {}} now={now} />
            </section>
          </div>
        )
      )}

      {tab === 'topics' && (
        studied.length === 0 ? (
          <div className="card"><EmptyState art="drawer" title="No topics started" action={<Link to="/library" className="btn btn-primary">Browse the library</Link>}>Start a topic to see how well it is holding.</EmptyState></div>
        ) : (
          <section className="card">
            <div className="catalog-head" style={{ marginBottom: 'var(--s-4)' }}>
              <h2 className="section-title">Memory by topic</h2>
              <span className="callno">Weakest first</span>
            </div>
            <div className="topic-memory-list">
              {[...studied].sort((a, b) => (a.summary.memory ?? 0) - (b.summary.memory ?? 0)).map(({ pack, summary }) => {
                const tone = memoryTone(summary.memory)
                return (
                  <Link key={pack.id} to={`/topic/${pack.id}`} className={`topic-memory-row mem-${tone}`}>
                    <Tile pack={pack} size="sm" />
                    <div className="grow">
                      <div className="row between small">
                        <span className="list-title">{pack.name}</span>
                        <span className="tabular muted">{Math.round((summary.memory ?? 0) * 100)}%</span>
                      </div>
                      <div className="bar mem" aria-hidden="true"><span style={{ width: `${Math.round((summary.memory ?? 0) * 100)}%` }} /></div>
                      <div className="xsmall subtle">
                        {MEMORY_TONE_LABELS[tone]} · mastery {summary.mastery}% · {summary.studied}/{summary.total} cards · {summary.dueCount} due
                        {summary.leechCount > 0 && <span className="warn-text"> · {summary.leechCount} troublesome</span>}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      )}

      {tab === 'mistakes' && (
        mistakes.length === 0 ? (
          <div className="card"><EmptyState art="cleared" title="No open mistakes">Cards you miss land here until you answer them correctly again.</EmptyState></div>
        ) : (
          <section className="card">
            <div className="catalog-head" style={{ marginBottom: 'var(--s-4)' }}>
              <div>
                <h2 className="section-title">Mistake journal</h2>
                <p className="small subtle">Answer a card correctly to clear it from this list.</p>
              </div>
              <div className="row wrap">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => clearMistakes()}><Trash2 size={14} /> Clear all</button>
                <Link to="/study/mistakes" className="btn btn-primary btn-sm">Review mistakes</Link>
              </div>
            </div>
            <div className="list">
              {mistakes.map(({ pack, question, date, given, count }) => (
                <div key={question.id} className="list-row mistake-row">
                  <Tile pack={pack} size="sm" />
                  <div className="grow">
                    <div className="small">{question.question}</div>
                    <div className="xsmall">
                      {given && <span className="bad-text">You: {given}</span>}
                      {given && ' · '}
                      <span className="good-text">Answer: {isChoiceType(question.type) ? question.choices[question.answer] : question.answer}</span>
                    </div>
                    <div className="xsmall subtle">{pack.name} · {question.concept || question.type} · {formatDate(date)}{count > 1 ? ` · missed ${count} times` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      )}

      {tab === 'achievements' && (
        <div className="achievement-grid">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = (stats.achievements || []).includes(a.id)
            return (
              <div key={a.id} className={`card achievement${unlocked ? ' unlocked' : ''}`}>
                <div className="achievement-icon">{unlocked ? <Award size={22} /> : <Lock size={18} />}</div>
                <div>
                  <div className="list-title">{a.title}</div>
                  <div className="xsmall muted">{a.description}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'history' && (
        (stats.sessions || []).length === 0 ? (
          <div className="card"><EmptyState art="chart" title="No sessions yet">Finished sessions are listed here.</EmptyState></div>
        ) : (
          <section className="card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Session</th><th>Topic</th><th className="num">Cards</th><th className="num">Accuracy</th><th className="num">XP</th><th className="num">Time</th></tr>
                </thead>
                <tbody>
                  {stats.sessions.slice(0, 50).map((s) => (
                    <tr key={s.id || s.date}>
                      <td>{formatDate(s.date)}</td>
                      <td>{s.kind === 'feynman' ? 'Explanation' : SESSION_KINDS[s.kind] || s.kind}</td>
                      <td>{s.topicId ? packMap.get(s.topicId)?.name || s.topicId : 'Mixed'}</td>
                      <td className="num">{s.cards ?? '—'}</td>
                      <td className="num">{s.accuracy == null ? '—' : `${s.accuracy}%`}</td>
                      <td className="num">{s.xp ?? 0}</td>
                      <td className="num">{formatDuration(s.seconds || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}
    </div>
  )
}
