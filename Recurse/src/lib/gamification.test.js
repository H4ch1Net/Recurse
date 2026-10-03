import { describe, expect, it } from 'vitest'
import { applyStudyDay, currentStreak, levelFromXp, levelProgress, xpForReview } from './gamification'

describe('streaks', () => {
  it('starts, continues and resets on local calendar days', () => {
    let stats = {}
    stats = { ...stats, ...applyStudyDay(stats, new Date(2026, 0, 1, 22)) }
    expect(stats.streak).toBe(1)
    stats = { ...stats, ...applyStudyDay(stats, new Date(2026, 0, 1, 23)) }
    expect(stats.streak).toBe(1)
    stats = { ...stats, ...applyStudyDay(stats, new Date(2026, 0, 2, 7)) }
    expect(stats.streak).toBe(2)
    stats = { ...stats, ...applyStudyDay(stats, new Date(2026, 0, 5, 7)) }
    expect(stats.streak).toBe(1)
    expect(stats.longestStreak).toBe(2)
  })

  it('reports a broken streak as zero until the next study day', () => {
    const stats = { streak: 5, lastStudyDay: '2026-01-01' }
    expect(currentStreak(stats, new Date(2026, 0, 2, 12))).toBe(5)
    expect(currentStreak(stats, new Date(2026, 0, 4, 12))).toBe(0)
  })
})

describe('xp and levels', () => {
  it('rewards correct answers, new cards and streaks', () => {
    expect(xpForReview({ type: 'mcq', correct: true, isNew: false })).toBe(10)
    expect(xpForReview({ type: 'mcq', correct: false, isNew: false })).toBe(2)
    expect(xpForReview({ type: 'debug', correct: true, isNew: true, streak: 14 })).toBe(Math.round(15 * 1.5) + 5)
  })

  it('levels up every 500 XP', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(499)).toBe(1)
    expect(levelFromXp(500)).toBe(2)
    expect(levelProgress(750)).toMatchObject({ level: 2, into: 250, needed: 500 })
  })
})
