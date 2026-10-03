import { describe, expect, it } from 'vitest'
import { Rating, State, isDue, newCard, previewDue, retrievability, schedule, stateLabel } from './memory'

const day = 86400000

describe('memory', () => {
  it('new cards have zero retrievability and are not due', () => {
    const card = newCard(new Date('2026-01-01T10:00:00Z'))
    expect(retrievability(card)).toBe(0)
    expect(isDue(card)).toBe(false)
    expect(stateLabel(card)).toBe('New')
  })

  it('schedules good answers further out than again', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    const good = schedule(null, Rating.Good, { now, fuzz: false })
    const again = schedule(null, Rating.Again, { now, fuzz: false })
    expect(new Date(good.due) > new Date(again.due)).toBe(true)
    expect(good.reps).toBe(1)
    expect(typeof good.due).toBe('string')
  })

  it('previews a due date for every grade, ordered by difficulty', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    const preview = previewDue(null, { now })
    const times = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((r) => new Date(preview[r]).getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('retrievability decays with fractional days, not whole days', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    let card = schedule(null, Rating.Good, { now, fuzz: false })
    card = schedule(card, Rating.Good, { now: new Date(now.getTime() + day), fuzz: false })
    const reviewed = new Date(card.last_review).getTime()
    const soon = retrievability(card, new Date(reviewed + 60000))
    const later = retrievability(card, new Date(reviewed + 6 * 3600000))
    const much = retrievability(card, new Date(reviewed + 30 * day))
    expect(soon).toBeGreaterThan(0.99)
    expect(later).toBeLessThan(soon)
    expect(much).toBeLessThan(later)
    expect(card.state).toBe(State.Review)
  })

  it('reaches due after its interval', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    const card = schedule(null, Rating.Good, { now, fuzz: false })
    expect(isDue(card, now)).toBe(false)
    expect(isDue(card, new Date(new Date(card.due).getTime() + 1000))).toBe(true)
  })
})
