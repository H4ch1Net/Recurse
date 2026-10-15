import { describe, expect, it } from 'vitest'
import { COLLECTIONS, getCollection, nextTopic, stageProgress, topicStep } from './collections'
import { readiness } from './practice'

const summary = (over = {}) => ({ started: true, status: 'learning', mastery: 0, studied: 0, total: 10, ...over })

describe('collections', () => {
  it('loads the built-in paths with stages and topic lists', () => {
    expect(COLLECTIONS.length).toBeGreaterThanOrEqual(4)
    const ccna = getCollection('ccna')
    // Six blueprint domains weighted like the exam, plus a final review stage with weight 0.
    expect(ccna.stages.filter((s) => s.weight > 0)).toHaveLength(6)
    expect(ccna.stages.reduce((sum, s) => sum + s.weight, 0)).toBe(100)
    expect(ccna.packIds.length).toBeGreaterThan(30)
    expect(getCollection('swe-internship').projectIds.length).toBeGreaterThan(3)
  })

  it('maps a topic summary onto four steps', () => {
    expect(topicStep(undefined)).toBe('new')
    expect(topicStep(summary({ started: false }))).toBe('new')
    expect(topicStep(summary())).toBe('learning')
    expect(topicStep(summary({ mastery: 50, studied: 7 }))).toBe('practiced')
    expect(topicStep(summary({ status: 'mastered', mastery: 95, studied: 10 }))).toBe('mastered')
  })

  it('weights topics, labs and challenges in stage progress', () => {
    const stage = { topics: ['a', 'b'], labs: ['l1', 'l2'] }
    const packMap = new Map([['a', {}], ['b', {}]])
    const summaries = new Map([['a', summary({ status: 'mastered' })], ['b', summary({ started: false })]])
    const value = stageProgress(stage, { packMap, summaries, labsDone: new Set(['l1']) })
    // topics: (1 + 0) / 2 = 0.5 at weight 3; labs: 0.5 at weight 1
    expect(value).toBeCloseTo(0.5)
  })

  it('suggests the first topic that is not yet practiced', () => {
    const c = { stages: [{ title: 'One', topics: ['a', 'b'] }] }
    const packMap = new Map([['a', { id: 'a' }], ['b', { id: 'b' }]])
    const summaries = new Map([['a', summary({ mastery: 60, studied: 8 })]])
    expect(nextTopic(c, packMap, summaries).pack.id).toBe('b')
  })

  it('caps certification readiness until a practice exam is taken', () => {
    const c = { id: 'cert', exam: { questions: 10, minutes: 10, pass: 80 }, projectIds: [], stages: [{ id: 's', topics: ['a'], labs: [], challenges: [], challengeSets: [], projects: [] }] }
    const packMap = new Map([['a', { id: 'a' }]])
    const summaries = new Map([['a', summary({ status: 'mastered' })]])
    const without = readiness(c, { packMap, summaries, practice: { exams: [] } })
    expect(without.score).toBeLessThanOrEqual(60)
    const exams = [{ pathId: 'cert', mode: 'exam', score: 90, date: new Date().toISOString() }]
    const withExam = readiness(c, { packMap, summaries, practice: { exams } })
    expect(withExam.score).toBeGreaterThan(80)
  })
})
