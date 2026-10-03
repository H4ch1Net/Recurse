import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, Award, BookOpen, CircleCheck, CircleX, MessageSquareText, RotateCcw, Trophy } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { dueSummary } from '../lib/session'
import { retrievability } from '../lib/memory'
import { topicMastery, topicOf } from '../lib/progress'
import { dueStamp, formatDuration, formatRelative } from '../lib/dates'
import { isChoiceType } from '../lib/packSchema'
import { todayLog, currentStreak } from '../lib/gamification'
import { Inline } from '../components/RichText'

function headline(accuracy, cards) {
  if (!cards) return 'Session ended'
  if (accuracy === 100) return 'Flawless.'
  if (accuracy >= 85) return 'Strong session.'
  if (accuracy >= 60) return 'Solid work.'
  return 'Good practice.'
}

function subline(accuracy) {
  if (accuracy >= 85) return 'Most of this is sticking. The schedule will space these cards further apart.'
  if (accuracy >= 60) return 'The cards you missed will come back sooner, while they are still fresh.'
  return 'Missing cards is part of learning. Each miss resets that card to a short interval so you see it again soon.'
}

export default function Complete() {
  useDocumentTitle('Session summary')
  const { lastSession: s, packMap, packs, progress, settings, stats, now } = useApp()

  const details = useMemo(() => {
    if (!s) return null
    const memory = (s.topics || []).map((id) => {
      const pack = packMap.get(id)
      if (!pack) return null
      const cards = Object.values(topicOf(progress, id).cards).filter((c) => c.reps > 0)
      const after = cards.length ? cards.reduce((sum, c) => sum + retrievability(c, now), 0) / cards.length : null
      const masteryAfter = topicMastery(progress[id]?.cards, pack.questions.length)
      return { pack, before: s.memoryBefore?.[id], after, masteryBefore: s.masteryBefore?.[id] ?? 0, masteryAfter }
    }).filter(Boolean)
    const missed = []
    const seen = new Set()
    for (const r of s.results || []) {
      if (r.correct || seen.has(r.questionId)) continue
      seen.add(r.questionId)
      const pack = packMap.get(r.packId)
      const question = pack?.questions.find((q) => q.id === r.questionId)
      if (question) missed.push({ pack, question, given: r.given })
    }
    const concepts = new Map()
    for (const { pack, question } of missed) {
      if (question.section == null || !pack.lesson?.sections?.[question.section]) continue
      const key = `${pack.id}:${question.section}`
      if (!concepts.has(key)) concepts.set(key, { pack, index: question.section, title: pack.lesson.sections[question.section].title, count: 0 })
      concepts.get(key).count++
    }
    return { memory, missed, concepts: [...concepts.values()].sort((a, b) => b.count - a.count) }
  }, [s, packMap, progress, now])

  if (!s || !details) return <Navigate to="/" replace />

  const due = dueSummary(packs, progress, settings, stats, now)
  const today = todayLog(stats, now)
  const goalHit = today.reviews >= settings.dailyGoal
  const streak = currentStreak(stats, now)
  const mastered = details.memory.filter((m) => m.masteryBefore < 90 && m.masteryAfter >= 90)
  const singleTopic = s.topicId ? packMap.get(s.topicId) : null

  return (
    <div className="page narrow">
      <section className="slip complete-hero">
        <div className="catalog-head">
          <span className="callno">{s.title} · {new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {new Date(s.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="stamp press">{s.cards} returned</span>
        </div>
        <h1 className="page-title">{headline(s.accuracy, s.cards)}</h1>
        {s.cards > 0 && <p className="page-sub">{subline(s.accuracy)}</p>}
        <div className="grid-stats complete-stats">
          <div className="stat">
            <div className="stat-label">First try</div>
            <div className="stat-value">{s.accuracy}%</div>
            <div className="stat-note">{s.correct} of {s.cards} cards</div>
          </div>
          <div className="stat">
            <div className="stat-label">New learned</div>
            <div className="stat-value">{s.newCards}</div>
            <div className="stat-note">{s.retries ? `${s.retries} retried` : 'no retries'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Time</div>
            <div className="stat-value">{formatDuration(s.seconds)}</div>
            <div className="stat-note">{s.cards ? `${Math.round(s.seconds / Math.max(1, s.cards))}s per card` : '—'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">XP</div>
            <div className="stat-value">+{s.xp}</div>
            <div className="stat-note">{streak > 1 ? `${streak}-day streak` : 'streak started'}</div>
          </div>
        </div>
        <div className="goal-strip">
          <div className="row between xsmall">
            <span className="subtle">{goalHit ? 'Daily goal reached' : 'Daily goal'}</span>
            <span className="tabular">{today.reviews} / {settings.dailyGoal}</span>
          </div>
          <div className="bar"><span style={{ width: `${Math.min(100, (today.reviews / settings.dailyGoal) * 100)}%` }} /></div>
        </div>
        <div className="row wrap">
          {due.due > 0 ? (
            <Link to="/study/review" className="btn btn-primary btn-lg">Keep going · {due.due} due <ArrowRight size={18} /></Link>
          ) : singleTopic && summaryHasNew(singleTopic, progress) ? (
            <Link to={`/study/topic/${singleTopic.id}`} className="btn btn-primary btn-lg"><RotateCcw size={18} /> Learn more {singleTopic.name}</Link>
          ) : (
            <Link to="/" className="btn btn-primary btn-lg">Back to Today</Link>
          )}
          {details.missed.length > 0 && <Link to="/study/mistakes" className="btn btn-lg">Review mistakes</Link>}
          {singleTopic?.lesson && <Link to={`/topic/${singleTopic.id}/explain`} className="btn btn-lg btn-ghost"><MessageSquareText size={18} /> Explain it</Link>}
        </div>
      </section>

      {mastered.map((m) => (
        <div key={m.pack.id} className="callout good" style={{ marginTop: 'var(--s-4)' }}>
          <Trophy size={18} />
          <span>You reached {m.masteryAfter}% mastery in <Link to={`/topic/${m.pack.id}`}>{m.pack.name}</Link>. A certificate is waiting on its page.</span>
        </div>
      ))}

      {details.memory.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }}>
          <div className="section-head"><h2 className="section-title">Topics covered</h2><span className="callno">Mastery before → after</span></div>
          <div className="list">
            {details.memory.map(({ pack, before, after, masteryBefore, masteryAfter }) => (
              <div key={pack.id} className="list-row">
                <div className="grow">
                  <Link to={`/topic/${pack.id}`} className="list-title" style={{ color: 'inherit' }}>{pack.name}</Link>
                  <div className="xsmall subtle">
                    {before == null ? 'First session' : `Memory was ${Math.round(before * 100)}% before this session`}
                    {after != null && before != null && after > before ? `, now refreshed` : ''}
                  </div>
                </div>
                <div className="xsmall tabular mono" style={{ textAlign: 'right' }}>
                  <div>{masteryBefore}% → <strong>{masteryAfter}%</strong></div>
                  {masteryAfter > masteryBefore && <div className="good-text">+{masteryAfter - masteryBefore}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {details.concepts.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }}>
          <div className="section-head"><h2 className="section-title">Worth rereading</h2><span className="callno">Behind your misses</span></div>
          <div className="list">
            {details.concepts.map((c) => (
              <Link key={`${c.pack.id}-${c.index}`} to={`/topic/${c.pack.id}/lesson#section-${c.index + 1}`} className="list-row">
                <BookOpen size={16} className="subtle" />
                <div className="grow">
                  <div className="list-title">{c.title}</div>
                  <div className="xsmall subtle">{c.pack.name} · {c.count} missed</div>
                </div>
                <ArrowRight size={16} className="subtle" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {s.results?.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }}>
          <div className="section-head"><h2 className="section-title">Cards in this session</h2><span className="callno">Next review</span></div>
          <div className="list">
            {(s.results || []).filter((r) => r.retry === 0).map((r) => {
              const pack = packMap.get(r.packId)
              const question = pack?.questions.find((q) => q.id === r.questionId)
              if (!question) return null
              const answer = isChoiceType(question.type) ? question.choices[question.answer] : question.answer
              return (
                <div key={r.key} className="list-row result-row">
                  {r.correct ? <CircleCheck size={18} className="good-text" aria-label="Correct" /> : <CircleX size={18} className="bad-text" aria-label="Missed" />}
                  <div className="grow">
                    <div className="small"><Inline text={question.question} /></div>
                    {!r.correct && <div className="xsmall good-text clamp-2">Answer: {answer}</div>}
                  </div>
                  <span className="stamp ink" title={`Next review ${formatRelative(r.due, now)}`}>{dueStamp(r.due, now)}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {stats.achievements?.length > 0 && (
        <p className="xsmall subtle" style={{ marginTop: 'var(--s-5)', textAlign: 'center' }}>
          <Award size={12} style={{ verticalAlign: '-2px' }} /> {stats.achievements.length} {stats.achievements.length === 1 ? 'achievement' : 'achievements'} unlocked · <Link to="/stats?tab=achievements">See all</Link>
        </p>
      )}
    </div>
  )
}

function summaryHasNew(pack, progress) {
  return pack.questions.some((q) => !(progress[pack.id]?.cards?.[q.id]?.reps > 0))
}
