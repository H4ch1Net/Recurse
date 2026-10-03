import { describe, expect, it } from 'vitest'
import { cardMastery, reviewForecast, summarizeTopic, topicMastery, memoryTone } from './progress'
import { Rating, schedule } from './memory'

describe('mastery', () => {
  it('is zero for new cards and grows with stability', () => {
    expect(cardMastery(null)).toBe(0)
    expect(cardMastery({ reps: 1, stability: 1, lapses: 0 })).toBeCloseTo(0.22, 1)
    expect(cardMastery({ reps: 5, stability: 21, lapses: 0 })).toBe(1)
    expect(cardMastery({ reps: 5, stability: 21, lapses: 2 })).toBeCloseTo(0.8)
  })

  it('counts unstudied questions against the topic', () => {
    const cards = { a: { reps: 5, stability: 30, lapses: 0 } }
    expect(topicMastery(cards, 1)).toBe(100)
    expect(topicMastery(cards, 4)).toBe(25)
    expect(topicMastery({}, 0)).toBe(0)
  })

  it('stays low right after a session full of misses', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    const cards = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i}`, schedule(null, Rating.Again, { now, fuzz: false })]))
    expect(topicMastery(cards, 10)).toBeLessThan(15)
  })
})

describe('summarizeTopic', () => {
  it('ignores cards for questions that no longer exist', () => {
    const now = new Date('2026-01-10T10:00:00Z')
    const card = schedule(null, Rating.Good, { now: new Date('2026-01-01T10:00:00Z'), fuzz: false })
    const pack = { id: 'p', questions: [{ id: 'p-q01' }, { id: 'p-q02' }], lesson: { sections: [{}, {}] } }
    const summary = summarizeTopic(pack, { cards: { 'p-q01': card, gone: card }, checks: { 0: true }, mistakes: {} }, now)
    expect(summary.studied).toBe(1)
    expect(summary.newCount).toBe(1)
    expect(summary.dueCount).toBe(1)
    expect(summary.checksDone).toBe(1)
    expect(summary.status).not.toBe('new')
  })
})

describe('reviewForecast', () => {
  it('buckets overdue cards into today', () => {
    const now = new Date('2026-01-10T10:00:00Z')
    const card = { reps: 1, due: '2026-01-02T10:00:00Z' }
    const pack = { id: 'p', questions: [{ id: 'q' }] }
    expect(reviewForecast([pack], { p: { cards: { q: card } } }, 3, now)).toEqual([1, 0, 0])
  })
})

describe('memoryTone', () => {
  it('maps recall probability to a tone', () => {
    expect(memoryTone(null)).toBe('none')
    expect(memoryTone(0.95)).toBe('strong')
    expect(memoryTone(0.75)).toBe('steady')
    expect(memoryTone(0.6)).toBe('fading')
    expect(memoryTone(0.2)).toBe('weak')
  })
})
