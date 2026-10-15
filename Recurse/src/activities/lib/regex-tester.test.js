import { describe, expect, it } from 'vitest'
import { compile, runRegexJob, WORKER_SOURCE, riskyPattern, segments, gradePuzzle, puzzleCases, BUILT_IN_PUZZLES, normalizePuzzles } from './regex-tester.js'

const cases = (pattern, flags, list) => runRegexJob({ kind: 'cases', pattern, flags, cases: list }).results

describe('compile', () => {
  it('compiles valid patterns', () => {
    expect(compile('\\d+', 'g').regex.flags).toBe('g')
    expect(compile('a', 'gix').regex.flags).toBe('gi')
  })
  it('explains invalid patterns gently', () => {
    const r = compile('(abc', '')
    expect(r.regex).toBeNull()
    expect(r.error.message).toMatch(/Unterminated group/)
    expect(r.error.hint).toBe('A ( has no matching ).')
    expect(compile('*a', '').error.hint).toMatch(/quantifier/)
    expect(compile('[a-', '').error.hint).toMatch(/\[ has no matching \]/)
  })
})

describe('runRegexJob', () => {
  it('finds every match with g and only the first without', () => {
    const all = runRegexJob({ kind: 'matches', pattern: '\\d+', flags: 'g', text: 'a1 b22 c333' })
    expect(all.matches.map((m) => m.text)).toEqual(['1', '22', '333'])
    expect(all.matches[1]).toMatchObject({ index: 4, end: 6 })
    const first = runRegexJob({ kind: 'matches', pattern: '\\d+', flags: '', text: 'a1 b22' })
    expect(first.matches).toHaveLength(1)
  })
  it('lists numbered and named capture groups', () => {
    const r = runRegexJob({ kind: 'matches', pattern: '(?<year>\\d{4})-(\\d{2})(x)?', flags: 'g', text: 'on 2026-10 ok' })
    expect(r.matches[0].groups).toEqual([
      { n: 1, name: 'year', text: '2026', index: 3 },
      { n: 2, name: null, text: '10', index: 8 },
      { n: 3, name: null, text: null, index: null }
    ])
  })
  it('ignores parentheses inside classes and escapes when naming groups', () => {
    const r = runRegexJob({ kind: 'matches', pattern: '[(]\\((?<a>b)', flags: '', text: '((b' })
    expect(r.matches[0].groups[0].name).toBe('a')
  })
  it('survives zero-length matches', () => {
    const r = runRegexJob({ kind: 'matches', pattern: '\\b', flags: 'g', text: 'hi there' })
    expect(r.matches).toHaveLength(4)
  })
  it('caps the number of matches and the text length', () => {
    const r = runRegexJob({ kind: 'matches', pattern: '.', flags: 'g', text: 'x'.repeat(50), maxMatches: 10 })
    expect(r.matches).toHaveLength(10)
    expect(r.truncated).toBe(true)
    const clipped = runRegexJob({ kind: 'matches', pattern: 'x', flags: 'g', text: 'x'.repeat(30), maxText: 20 })
    expect(clipped.clipped).toBe(true)
    expect(clipped.matches).toHaveLength(20)
  })
  it('tests cases without g state leaking between them', () => {
    expect(cases('a', 'g', ['a', 'a', 'a'])).toEqual([true, true, true])
    expect(runRegexJob({ kind: 'cases', pattern: '\\d+', flags: '', cases: ['ab12c', 'x'] }).ranges).toEqual([[2, 4], null])
  })
  it('reports errors for invalid patterns', () => {
    expect(runRegexJob({ kind: 'cases', pattern: '(', flags: '', cases: ['x'] }).ok).toBe(false)
  })
  it('stops when the time budget runs out', () => {
    const r = runRegexJob({ kind: 'cases', pattern: 'a', flags: '', cases: ['a', 'b'], budgetMs: -1 })
    expect(r.timedOut).toBe(true)
    expect(r.results).toEqual([null, null])
  })
  it('builds a worker source that behaves the same', () => {
    const fn = new Function(`${WORKER_SOURCE.split('\nself.onmessage')[0]}; return runRegexJob`)()
    expect(fn({ kind: 'matches', pattern: 'b+', flags: 'g', text: 'abbcb' }).matches.map((m) => m.text)).toEqual(['bb', 'b'])
  })
})

describe('helpers', () => {
  it('flags catastrophic patterns', () => {
    expect(riskyPattern('(a+)+$')).toBeTruthy()
    expect(riskyPattern('(.*)*')).toBeTruthy()
    expect(riskyPattern('(\\w+\\s?){2,}x')).toBeTruthy()
    expect(riskyPattern('^(\\d{1,3}\\.){3}\\d{1,3}$')).toBeNull()
    expect(riskyPattern('[(a+)]+')).toBeNull()
  })
  it('splits text into highlight segments', () => {
    const matches = [{ index: 1, end: 3 }, { index: 5, end: 5 }]
    expect(segments('abcdefg', matches)).toEqual([
      { text: 'a', match: null },
      { text: 'bc', match: 0, empty: false },
      { text: 'de', match: null },
      { text: '', match: 1, empty: true },
      { text: 'fg', match: null }
    ])
  })
  it('normalizes content puzzles', () => {
    expect(normalizePuzzles(undefined)).toBe(BUILT_IN_PUZZLES)
    const list = normalizePuzzles([{ prompt: 'p', match: ['a'], noMatch: [1] }, { nope: true }])
    expect(list).toHaveLength(1)
    expect(list[0].noMatch).toEqual(['1'])
  })
})

describe('built-in puzzles', () => {
  it('every reference solution solves its puzzle', () => {
    for (const p of BUILT_IN_PUZZLES) {
      const results = cases(p.solution, p.flags || '', puzzleCases(p))
      const graded = gradePuzzle(p, results)
      expect(graded.solved, p.id).toBe(true)
    }
  })
  it('naive answers do not solve the anchored puzzles', () => {
    const p = BUILT_IN_PUZZLES.find((x) => x.id === 'only-digits')
    expect(gradePuzzle(p, cases('\\d+', '', puzzleCases(p))).solved).toBe(false)
    const ip = BUILT_IN_PUZZLES.find((x) => x.id === 'ipv4')
    expect(gradePuzzle(ip, cases('^(\\d{1,3}.){3}\\d{1,3}$', '', puzzleCases(ip))).solved).toBe(false)
    const err = BUILT_IN_PUZZLES.find((x) => x.id === 'error-word')
    expect(gradePuzzle(err, cases('\\berror\\b', '', puzzleCases(err))).solved).toBe(false)
  })
  it('grades row by row', () => {
    const p = { match: ['a'], noMatch: ['b'] }
    expect(gradePuzzle(p, [true, true])).toMatchObject({ solved: false, passing: 1 })
    expect(gradePuzzle(p, [true, false]).solved).toBe(true)
  })
})
