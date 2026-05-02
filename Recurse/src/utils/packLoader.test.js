import { describe, it, expect, beforeEach } from 'vitest'
import { validateGeneratedPack } from './packLoader'

function makeValidPack() {
  return {
    id: 'test-pack',
    name: 'Test Pack',
    version: '1.0',
    category: 'test',
    lesson: {},
    description: 'A pack',
    questions: Array.from({ length: 6 }).map((_, i) => ({
      id: `q${i}`,
      type: ['mcq', 'code-fill', 'debug'][i % 3],
      question: `What is ${i}?`,
      choices: ['a', 'b', 'c', 'd'],
      answer: 0,
      difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard'
    }))
  }
}

describe('validateGeneratedPack', () => {
  beforeEach(() => {
    // clear community packs so overwrite checks don't interfere
    localStorage.clear()
  })

  it('valid pack passes validation', () => {
    const pack = makeValidPack()
    const out = validateGeneratedPack(pack)
    expect(out.id).toBe('test-pack')
  })

  it('missing required field throws', () => {
    const pack = makeValidPack()
    delete pack.name
    expect(() => validateGeneratedPack(pack)).toThrow(/missing required field/i)
  })

  it('fewer than 5 questions throws', () => {
    const pack = makeValidPack()
    pack.questions = pack.questions.slice(0, 3)
    expect(() => validateGeneratedPack(pack)).toThrow(/at least 5 questions/i)
  })

  it('question with answer index out of bounds throws', () => {
    const pack = makeValidPack()
    pack.questions[0].answer = 10
    expect(() => validateGeneratedPack(pack)).toThrow(/invalid answer index/i)
  })

  it('question missing choices array throws', () => {
    const pack = makeValidPack()
    delete pack.questions[0].choices
    expect(() => validateGeneratedPack(pack)).toThrow(/missing choices array|missing required fields/i)
  })

  it('duplicate question IDs throws', () => {
    const pack = makeValidPack()
    pack.questions[1].id = pack.questions[0].id
    expect(() => validateGeneratedPack(pack)).toThrow(/Duplicate question id/i)
  })

  it('pack ID with invalid characters throws', () => {
    const pack = makeValidPack()
    pack.id = 'Invalid Pack!'
    expect(() => validateGeneratedPack(pack)).toThrow(/contains invalid characters/i)
  })

  it('HTML in question text gets stripped', () => {
    const pack = makeValidPack()
    pack.questions[0].question = '<b>alert(1)</b> Hi'
    const out = validateGeneratedPack(pack)
    expect(out.questions[0].question).toBe('alert(1) Hi')
  })

  it('fields over max length get truncated', () => {
    const pack = makeValidPack()
    pack.name = 'x'.repeat(200)
    pack.questions[0].question = 'y'.repeat(1000)
    const out = validateGeneratedPack(pack)
    expect(out.name.length).toBeLessThanOrEqual(100)
    expect(out.questions[0].question.length).toBeLessThanOrEqual(500)
  })
})
