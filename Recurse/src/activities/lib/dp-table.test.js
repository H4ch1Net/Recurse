import { describe, expect, it } from 'vitest'
import { buildProblem, coinChange, gridPaths, greedyCoins, lcs, parseCellInput, randomParams } from './dp-table'

const answerOf = (t) => t.values[t.answer.r][t.answer.c]

describe('grid paths', () => {
  it('matches the binomial counts', () => {
    expect(answerOf(gridPaths(3, 7))).toBe(28)
    expect(answerOf(gridPaths(3, 3))).toBe(6)
    expect(answerOf(gridPaths(4, 4))).toBe(20)
    expect(answerOf(gridPaths(3, 4))).toBe(10)
  })

  it('has one step per cell, base cells on the top row and left column', () => {
    const t = gridPaths(3, 4)
    expect(t.steps).toHaveLength(12)
    expect(t.steps.filter((s) => s.base)).toHaveLength(6)
    const inner = t.steps.find((s) => s.r === 2 && s.c === 3)
    expect(inner.value).toBe(10)
    expect(inner.deps).toEqual([{ r: 1, c: 3, used: true }, { r: 2, c: 2, used: true }])
    expect(inner.formula).toBe('(2, 3) = above + left = 4 + 6 = 10')
  })

  it('clamps sizes', () => {
    const t = gridPaths(99, 1)
    expect(t.rows).toBe(6)
    expect(t.cols).toBe(2)
  })
})

describe('coin change', () => {
  it('finds the fewest coins', () => {
    expect(answerOf(coinChange([1, 3, 4], 6))).toBe(2)
    expect(answerOf(coinChange([1, 2, 5], 11))).toBe(3)
    expect(answerOf(coinChange([1, 5, 6], 10))).toBe(2)
    expect(coinChange([1, 3, 4], 6).values[0]).toEqual([0, 1, 2, 1, 1, 2, 2])
  })

  it('marks amounts that cannot be made as infinity', () => {
    const t = coinChange([2], 3)
    expect(t.values[0]).toEqual([0, Infinity, 1, Infinity])
    expect(t.answerText).toMatch(/cannot be made/)
  })

  it('reconstructs the coins and notes when greedy does worse', () => {
    const t = coinChange([1, 3, 4], 6)
    expect(t.used.reduce((a, b) => a + b, 0)).toBe(6)
    expect(t.used).toHaveLength(2)
    expect(t.answerText).toMatch(/greedy/i)
    expect(greedyCoins([1, 3, 4], 6)).toEqual([4, 1, 1])
    expect(greedyCoins([3], 5)).toBeNull()
  })

  it('points each cell at the amounts left after each coin, with one marked as the best', () => {
    const step = coinChange([1, 3, 4], 6).steps[6]
    expect(step.deps.map((d) => d.c)).toEqual([5, 3, 2])
    expect(step.deps.filter((d) => d.used)).toEqual([{ r: 0, c: 3, used: true }])
  })
})

describe('lcs', () => {
  it('finds the classic answers', () => {
    expect(answerOf(lcs('ABCBDAB', 'BDCABA'))).toBe(4)
    expect(answerOf(lcs('ABC', 'AC'))).toBe(2)
    const t = lcs('SEND', 'ENDS')
    expect(answerOf(t)).toBe(3)
    expect(t.lcs).toBe('END')
  })

  it('handles no common letters', () => {
    const t = lcs('ABC', 'XYZ')
    expect(answerOf(t)).toBe(0)
    expect(t.lcs).toBe('')
  })

  it('uses the diagonal on a match and above/left otherwise', () => {
    const t = lcs('SEND', 'ENDS')
    const match = t.steps.find((s) => s.r === 2 && s.c === 1)
    expect(match.deps).toEqual([{ r: 1, c: 0, used: true }])
    expect(match.value).toBe(1)
    const miss = t.steps.find((s) => s.r === 1 && s.c === 1)
    expect(miss.deps).toHaveLength(2)
  })

  it('cleans up the input words', () => {
    const t = lcs('ab-c!', '')
    expect(t.a).toBe('ABC')
    expect(t.b).toBe('ENDS')
  })
})

describe('helpers', () => {
  it('parses typed cell values', () => {
    expect(parseCellInput(' 12 ')).toBe(12)
    expect(parseCellInput('∞')).toBe(Infinity)
    expect(parseCellInput('inf')).toBe(Infinity)
    expect(parseCellInput('')).toBeNull()
    expect(parseCellInput('1.5')).toBeNull()
    expect(parseCellInput('abc')).toBeNull()
  })

  it('random params always build a valid table', () => {
    let seed = 0
    const rng = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    for (const problem of ['grid-paths', 'coin-change', 'lcs']) {
      for (let k = 0; k < 10; k++) {
        const t = buildProblem(problem, randomParams(problem, rng))
        expect(t.steps).toHaveLength(t.rows * t.cols)
        expect(t.steps.some((s) => !s.base)).toBe(true)
      }
    }
  })
})
