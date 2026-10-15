import { describe, expect, it } from 'vitest'
import {
  challengeScore,
  errorHint,
  gradeResult,
  languagesFor,
  missingReturnHint,
  selectTests,
  starterFor,
  summarize,
  timeLimitFor,
  timeoutResult
} from './tests.js'

const challenge = {
  id: 'demo',
  function: { javascript: 'twoSum', python: 'two_sum' },
  params: ['nums', 'target'],
  tests: [
    { args: [[2, 7], 9], expected: [0, 1] },
    { args: [[3, 3], 6], expected: [0, 1] },
    { args: [[1, 2, 3], 5], expected: [1, 2], hidden: true }
  ]
}

describe('selectTests', () => {
  it('runs only visible tests for Run and everything for Submit', () => {
    expect(selectTests(challenge, 'visible').map((t) => t.label)).toEqual(['Test 1', 'Test 2'])
    const all = selectTests(challenge, 'all')
    expect(all.map((t) => t.label)).toEqual(['Test 1', 'Test 2', 'Hidden 1'])
    expect(all[2]).toMatchObject({ index: 2, hidden: true })
  })
})

describe('gradeResult', () => {
  const [test] = selectTests(challenge, 'all')
  it('passes matching output and fails other output', () => {
    expect(gradeResult(test, { hasActual: true, actual: [0, 1], ms: 1 }).status).toBe('passed')
    expect(gradeResult(test, { hasActual: true, actual: [1, 0] }).status).toBe('failed')
  })
  it('uses the compare mode', () => {
    expect(gradeResult(test, { hasActual: true, actual: [1, 0] }, 'unordered').status).toBe('passed')
  })
  it('marks errors', () => {
    const r = gradeResult(test, { error: { message: 'TypeError: x', line: 2 } })
    expect(r.status).toBe('error')
    expect(r.passed).toBe(false)
  })
  it('summarizes', () => {
    const results = [gradeResult(test, { hasActual: true, actual: [0, 1] }), timeoutResult(test)]
    expect(summarize(results)).toEqual({ passed: 1, total: 2, allPassed: false })
    expect(results[1].error.message).toBe('Time limit exceeded, is there an infinite loop?')
  })
})

describe('challenge helpers', () => {
  it('lists languages with a function name', () => {
    expect(languagesFor(challenge)).toEqual(['javascript', 'python'])
    expect(languagesFor({ function: { python: 'f' } })).toEqual(['python'])
  })
  it('builds starter code when a set has none', () => {
    expect(starterFor(challenge, 'python')).toBe('def two_sum(nums, target):\n    pass\n')
    expect(starterFor(challenge, 'javascript')).toMatch(/^function twoSum\(nums, target\)/)
  })
  it('scores lower with hints and lowest after seeing the solution', () => {
    expect(challengeScore({})).toBe(1)
    expect(challengeScore({ hintsUsed: 2 })).toBe(0.7)
    expect(challengeScore({ hintsUsed: 9 })).toBe(0.4)
    expect(challengeScore({ solutionViewed: true })).toBe(0.25)
  })
  it('reads timeLimit within bounds', () => {
    expect(timeLimitFor({})).toBe(3000)
    expect(timeLimitFor({ timeLimit: 6000 })).toBe(6000)
    expect(timeLimitFor({ timeLimit: 10 })).toBe(3000)
  })
  it('gives friendly hints for common errors', () => {
    expect(errorHint("NameError: name 'foo' is not defined", 'python')).toMatch(/`foo`/)
    expect(errorHint('ReferenceError: x is not defined', 'javascript')).toMatch(/`x`/)
    expect(errorHint('Something odd', 'javascript')).toBe('')
    expect(missingReturnHint(undefined, [1], 'javascript')).toMatch(/return/)
    expect(missingReturnHint(null, [1], 'python')).toMatch(/None/)
    expect(missingReturnHint(null, null, 'python')).toBe('')
  })
})
