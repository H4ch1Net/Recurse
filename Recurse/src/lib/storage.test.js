// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { KEYS, loadAll, migrateStorage, migrateV1, parseSnapshot, exportSnapshot, importSnapshot, resetStorage } from './storage'

const v1 = {
  progress: {
    'python-basics': {
      mastery: 40,
      lessonRead: true,
      cards: { 'py-001': { reps: 2, stability: 3, due: '2026-01-05T00:00:00Z' }, 'py-002': { reps: 0, stability: 0 } },
      mistakeLog: [{ questionId: 'py-001', yourAnswer: 'x', date: '2026-01-01T00:00:00Z' }]
    }
  },
  stats: { xp: 900, totalQuestions: 30, totalCorrect: 20, mcqTotal: 10, mcqCorrect: 7, activityLog: { '2026-01-01': 5 }, sessionHistory: [{ date: '2026-01-01T00:00:00Z', mode: 'quick5', topicId: 'quick5', score: 80, xpEarned: 50, durationMinutes: 4 }], streak: 3, lastStudied: '2026-01-01T12:00:00Z', achievements: ['First Blood'] },
  settings: { desiredRetention: 0.92, workMinutes: 30 },
  user: { name: 'Ada', onboardingComplete: true },
  ai: { provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' }
}

describe('migrateV1', () => {
  it('drops unstudied cards and converts logs and counters', () => {
    const out = migrateV1(v1)
    expect(Object.keys(out.progress['python-basics'].cards)).toEqual(['py-001'])
    expect(out.progress['python-basics'].mistakes['py-001'].given).toBe('x')
    expect(out.stats.totalReviews).toBe(30)
    expect(out.stats.byType.mcq).toEqual({ total: 10, correct: 7 })
    expect(out.stats.days['2026-01-01'].reviews).toBe(5)
    expect(out.stats.sessions[0]).toMatchObject({ kind: 'review', accuracy: 80, seconds: 240 })
    expect(out.settings.desiredRetention).toBe(0.92)
    expect(out.settings.focusMinutes).toBe(30)
    expect(out.user.name).toBe('Ada')
    expect(out.ai.apiKey).toBe('k')
  })
})

describe('storage', () => {
  beforeEach(() => localStorage.clear())

  it('migrates stored v1 data once on startup', () => {
    localStorage.setItem(KEYS.progress, JSON.stringify(v1.progress))
    localStorage.setItem(KEYS.stats, JSON.stringify(v1.stats))
    localStorage.setItem(KEYS.user, JSON.stringify(v1.user))
    migrateStorage()
    const data = loadAll()
    expect(data.stats.totalReviews).toBe(30)
    expect(data.user.onboardingComplete).toBe(true)
    expect(localStorage.getItem(KEYS.version)).toBe('2')
    migrateStorage()
    expect(loadAll().stats.totalReviews).toBe(30)
  })

  it('copies data from the legacy app name', () => {
    localStorage.setItem('syntaxiq_user', JSON.stringify({ name: 'Old', onboardingComplete: true }))
    migrateStorage()
    expect(loadAll().user.name).toBe('Old')
  })

  it('never drops stored packs, even ones that no longer validate', () => {
    const packs = [{ id: 'ok-pack', name: 'Ok', questions: [{ id: 'a', type: 'recall', question: 'Q', answer: 'A' }] }, { id: 'x', name: 'Broken', questions: [] }]
    localStorage.setItem(KEYS.communityPacks, JSON.stringify(packs))
    expect(loadAll().communityPacks).toHaveLength(2)
  })

  it('falls back to defaults for corrupt values', () => {
    localStorage.setItem(KEYS.stats, '{not json')
    localStorage.setItem(KEYS.progress, '[]')
    const data = loadAll()
    expect(data.stats.totalReviews).toBe(0)
    expect(data.progress).toEqual({})
  })

  it('round-trips a backup without the API key and keeps the current key on restore', () => {
    localStorage.setItem(KEYS.ai, JSON.stringify({ provider: 'anthropic', apiKey: 'secret', model: '' }))
    localStorage.setItem(KEYS.user, JSON.stringify({ name: 'Ada', onboardingComplete: true }))
    const snapshot = exportSnapshot()
    expect(snapshot.data.ai.apiKey).toBe('')
    resetStorage()
    localStorage.setItem(KEYS.ai, JSON.stringify({ provider: 'anthropic', apiKey: 'new-key', model: '' }))
    importSnapshot(snapshot)
    const data = loadAll()
    expect(data.user.name).toBe('Ada')
    expect(data.ai.apiKey).toBe('new-key')
  })

  it('accepts v1 exports and rejects unrelated files', () => {
    const data = parseSnapshot({ [KEYS.progress]: v1.progress, [KEYS.stats]: v1.stats })
    expect(data.stats.totalReviews).toBe(30)
    expect(() => parseSnapshot({ hello: 1 })).toThrow(/not a Recurse backup/)
  })
})
