import { describe, expect, it } from 'vitest'
import { buildSession, dueSummary, interleave, requeue, MAX_RETRIES } from './session'
import { Rating, schedule } from './memory'

const pack = (id, n, extra = {}) => ({
  id,
  name: id,
  subject: 'cs',
  level: 'beginner',
  prereqs: [],
  questions: Array.from({ length: n }, (_, i) => ({
    id: `${id}-q${String(i + 1).padStart(2, '0')}`,
    type: i % 2 ? 'typed' : 'mcq',
    question: `Q${i}`,
    choices: ['a', 'b', 'c', 'd'],
    answer: i % 2 ? 'x' : 0,
    section: Math.floor(i / 3),
    difficulty: ['easy', 'medium', 'hard'][i % 3]
  })),
  ...extra
})

const past = new Date('2026-01-01T10:00:00Z')
const now = new Date('2026-03-01T10:00:00Z')
const learned = (ids) => Object.fromEntries(ids.map((id) => [id, schedule(null, Rating.Good, { now: past, fuzz: false })]))

describe('buildSession', () => {
  it('starts a topic with new cards in teaching order', () => {
    const a = pack('a', 8)
    const s = buildSession({ kind: 'topic', topicId: 'a', packs: [a], progress: {}, settings: { sessionSize: 5 }, now })
    expect(s.items).toHaveLength(5)
    expect(s.items.every((i) => i.isNew)).toBe(true)
    expect(s.items[0].questionId).toBe('a-q01')
  })

  it('puts due reviews before new cards', () => {
    const a = pack('a', 6)
    const progress = { a: { cards: learned(['a-q01', 'a-q02']) } }
    const s = buildSession({ kind: 'topic', topicId: 'a', packs: [a], progress, settings: { sessionSize: 4 }, now })
    const reviews = s.items.filter((i) => !i.isNew).map((i) => i.questionId)
    expect(reviews.sort()).toEqual(['a-q01', 'a-q02'])
    expect(s.items).toHaveLength(4)
  })

  it('daily review only introduces new cards from started topics and respects the daily limit', () => {
    const a = pack('a', 6)
    const b = pack('b', 6)
    const progress = { a: { cards: learned(['a-q01']), lessonRead: true } }
    const stats = { days: { '2026-03-01': { newCards: 13 } } }
    const s = buildSession({ kind: 'review', packs: [a, b], progress, settings: { sessionSize: 10, newPerDay: 15 }, stats, now })
    expect(s.items.filter((i) => i.isNew)).toHaveLength(2)
    expect(s.items.every((i) => i.packId === 'a')).toBe(true)
  })

  it('shuffles choice order for choice questions only', () => {
    const a = pack('a', 4)
    const s = buildSession({ kind: 'practice', topicId: 'a', packs: [a], progress: {}, settings: { sessionSize: 4 }, now, seed: 7 })
    for (const item of s.items) {
      const q = a.questions.find((x) => x.id === item.questionId)
      if (q.type === 'mcq') expect([...item.order].sort()).toEqual([0, 1, 2, 3])
      else expect(item.order).toBeUndefined()
    }
  })

  it('reviews ahead when nothing is due or new', () => {
    const a = pack('a', 2)
    const fresh = Object.fromEntries(a.questions.map((q) => [q.id, schedule(null, Rating.Good, { now, fuzz: false })]))
    const s = buildSession({ kind: 'topic', topicId: 'a', packs: [a], progress: { a: { cards: fresh } }, settings: {}, now })
    expect(s.ahead).toBe(true)
    expect(s.items).toHaveLength(2)
  })

  it('builds mistake sessions from unresolved mistakes', () => {
    const a = pack('a', 4)
    const progress = { a: { mistakes: { 'a-q02': { date: '2026-02-01' }, 'a-q99': { date: '2026-02-02' } } } }
    const s = buildSession({ kind: 'mistakes', packs: [a], progress, settings: {}, now })
    expect(s.items.map((i) => i.questionId)).toEqual(['a-q02'])
  })
})

describe('requeue', () => {
  it('reinserts a missed card later, up to the retry limit', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, retry: 0 }))
    const once = requeue(items, 0, 2)
    expect(once).toHaveLength(6)
    expect(once[3]).toMatchObject({ key: 'a', retry: 1 })
    const capped = requeue([{ key: 'z', retry: MAX_RETRIES }], 0)
    expect(capped).toHaveLength(1)
  })
})

describe('interleave', () => {
  it('alternates packs', () => {
    const items = [{ packId: 'a' }, { packId: 'a' }, { packId: 'b' }, { packId: 'b' }]
    expect(interleave(items).map((i) => i.packId)).toEqual(['a', 'b', 'a', 'b'])
  })
})

describe('dueSummary', () => {
  it('counts due cards and new cards available today', () => {
    const a = pack('a', 5)
    const progress = { a: { cards: learned(['a-q01', 'a-q02']) } }
    const summary = dueSummary([a], progress, { newPerDay: 2 }, {}, now)
    expect(summary.due).toBe(2)
    expect(summary.newToday).toBe(2)
    expect(summary.startedCount).toBe(1)
  })
})
