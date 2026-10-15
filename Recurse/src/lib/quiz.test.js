import { describe, expect, it } from 'vitest'
import { allocate, buildQuiz, quizScope, scoreQuiz } from './quiz'

const pack = (id, n, type = 'mcq') => ({
  id,
  name: id,
  questions: Array.from({ length: n }, (_, i) => ({ id: `${id}-q${i}`, type, question: `${id} ${i}`, choices: ['a', 'b', 'c', 'd'], answer: 0 }))
})

describe('allocate', () => {
  it('splits by weight and respects supply', () => {
    expect(allocate(10, [{ weight: 25, supply: 50 }, { weight: 75, supply: 50 }])).toEqual([3, 7])
    expect(allocate(10, [{ weight: 50, supply: 2 }, { weight: 50, supply: 50 }])).toEqual([2, 8])
    expect(allocate(10, [{ weight: 1, supply: 3 }, { weight: 1, supply: 3 }])).toEqual([3, 3])
  })
})

describe('buildQuiz', () => {
  const a = pack('a', 20)
  const b = pack('b', 20)
  const c = pack('c', 5, 'recall')
  const packMap = new Map([a, b, c].map((p) => [p.id, p]))
  const path = { name: 'Path', stages: [{ id: 's1', title: 'One', weight: 20, topics: ['a', 'c'] }, { id: 's2', title: 'Two', weight: 80, topics: ['b'] }] }

  it('weights stages and skips self-graded cards', () => {
    const scope = quizScope({ path, packs: [a, b, c], packMap, progress: {} })
    const items = buildQuiz(scope, { n: 10, seed: 1 })
    expect(items).toHaveLength(10)
    expect(items.filter((i) => i.groupId === 's1')).toHaveLength(2)
    expect(items.some((i) => i.packId === 'c')).toBe(false)
    expect(new Set(items.map((i) => i.key)).size).toBe(10)
  })

  it('scores overall and per stage', () => {
    const scope = quizScope({ path, packs: [a, b, c], packMap, progress: {} })
    const items = buildQuiz(scope, { n: 10, seed: 2 })
    const answers = Object.fromEntries(items.map((i, n) => [i.key, { correct: n % 2 === 0 }]))
    const result = scoreQuiz(items, answers, scope.groups)
    expect(result.correct).toBe(5)
    expect(result.score).toBe(50)
    expect(result.byGroup.reduce((s, g) => s + g.total, 0)).toBe(10)
  })

  it('quizzes only studied topics when there are none, falls back to all', () => {
    expect(quizScope({ packs: [a, b], packMap, progress: {} })).toBeNull()
    const progress = { a: { cards: { 'a-q1': { reps: 1 } } } }
    expect(quizScope({ packs: [a, b], packMap, progress }).groups[0].packs.map((p) => p.id)).toEqual(['a'])
  })
})
