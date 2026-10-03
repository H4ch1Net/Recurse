import { describe, expect, it } from 'vitest'
import { sanitizePack, validatePack, subjectFor } from './packSchema'
import { BUILT_IN_PACKS } from './packs'

const minimal = () => ({
  id: 'my-pack',
  name: 'My pack',
  questions: [
    { id: 'c1', type: 'recall', question: 'Front', answer: 'Back' },
    { id: 'c2', type: 'mcq', question: 'Pick', choices: ['a', 'b', 'c'], answer: 2 }
  ]
})

describe('validatePack', () => {
  it('accepts a minimal community pack', () => {
    expect(validatePack(minimal()).errors).toEqual([])
  })

  it('reports structural problems', () => {
    const pack = minimal()
    pack.id = 'Bad Id!'
    pack.questions[1].answer = 5
    pack.questions.push({ id: 'c1', type: 'typed', question: 'Dup', answer: '' })
    const { errors } = validatePack(pack)
    expect(errors.join('\n')).toMatch(/id must be/)
    expect(errors.join('\n')).toMatch(/answer must be the index/)
    expect(errors.join('\n')).toMatch(/duplicate id/)
    expect(errors.join('\n')).toMatch(/answer must be text/)
  })

  it('requires a blank in fill-the-blank code', () => {
    const pack = minimal()
    pack.questions.push({ id: 'c3', type: 'code-fill', question: 'Fill', code: 'print(1)', choices: ['a', 'b'], answer: 0 })
    expect(validatePack(pack).errors.join()).toMatch(/blank/)
  })

  it('holds built-in packs to the strict bar', () => {
    expect(validatePack(minimal(), { strict: true }).errors.length).toBeGreaterThan(0)
  })
})

describe('built-in library', () => {
  it('ships many valid packs across subjects with unique question ids', () => {
    expect(BUILT_IN_PACKS.length).toBeGreaterThanOrEqual(30)
    const ids = new Set()
    for (const pack of BUILT_IN_PACKS) {
      const { errors } = validatePack(pack, { strict: true })
      expect(errors, pack.id).toEqual([])
      for (const q of pack.questions) {
        expect(ids.has(q.id), q.id).toBe(false)
        ids.add(q.id)
      }
    }
    expect(new Set(BUILT_IN_PACKS.map((p) => p.subject)).size).toBeGreaterThanOrEqual(8)
  })

  it('only references prerequisites that exist', () => {
    const known = new Set(BUILT_IN_PACKS.map((p) => p.id))
    for (const pack of BUILT_IN_PACKS) for (const prereq of pack.prereqs) expect(known.has(prereq), `${pack.id} -> ${prereq}`).toBe(true)
  })
})

describe('sanitizePack', () => {
  it('cleans untrusted packs and maps legacy categories', () => {
    const pack = sanitizePack({ ...minimal(), id: 'My Pack', name: '<b>My</b> pack', category: 'cs-theory' })
    expect(pack.id).toBe('my-pack')
    expect(pack.name).toBe('My pack')
    expect(pack.subject).toBe('cs')
    expect(pack.community).toBe(true)
  })

  it('infers missing ids and types', () => {
    const pack = sanitizePack({ id: 'x-pack', name: 'X', questions: [{ question: 'Q', answer: 'A' }, { question: 'Pick', choices: ['a', 'b'], answer: 1 }] })
    expect(pack.questions.map((q) => q.type)).toEqual(['recall', 'mcq'])
    expect(pack.questions[0].id).toBe('x-pack-q01')
  })

  it('throws on packs that cannot be repaired', () => {
    expect(() => sanitizePack({ id: 'x', name: 'X', questions: [] })).toThrow(/Invalid pack/)
    expect(() => sanitizePack(null)).toThrow()
  })

  it('maps subjects', () => {
    expect(subjectFor({ subject: 'math' })).toBe('math')
    expect(subjectFor({ category: 'language' })).toBe('programming')
    expect(subjectFor({})).toBe('cs')
  })
})
