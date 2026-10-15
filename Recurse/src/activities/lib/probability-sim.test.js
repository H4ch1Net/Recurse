import { describe, expect, it } from 'vitest'
import {
  bandProb,
  binomialPmf,
  binomialRangeProb,
  birthdayExact,
  birthdaySim,
  birthdayThreshold,
  dayLabel,
  diceDistribution,
  diceModes,
  emptyCoinRun,
  extendCoinRun,
  logFactorial,
  mulberry32,
  pairCount,
  rollDice
} from './probability-sim'

describe('binomial', () => {
  it('log factorial is exact for small n and close for large n', () => {
    expect(Math.exp(logFactorial(5))).toBeCloseTo(120, 9)
    let exact = 0
    for (let k = 2; k <= 100; k++) exact += Math.log(k)
    expect(logFactorial(100)).toBeCloseTo(exact, 9)
  })

  it('pmf and ranges add up', () => {
    expect(binomialPmf(10, 5)).toBeCloseTo(252 / 1024, 12)
    expect(binomialRangeProb(10, 0, 10)).toBeCloseTo(1, 12)
    expect(binomialPmf(4, 1, 0.25)).toBeCloseTo(4 * 0.25 * 0.75 ** 3, 12)
  })

  it('a long run is far more likely to land near 50% than a short one', () => {
    expect(bandProb(10)).toBeCloseTo(252 / 1024, 9)
    expect(bandProb(1000)).toBeCloseTo(0.9986, 3)
    expect(bandProb(1000)).toBeGreaterThan(bandProb(100))
  })
})

describe('dice', () => {
  it('two dice form the triangle with 7 on top', () => {
    const d = diceDistribution(2)
    expect(d).toHaveLength(13)
    expect(d[7]).toBeCloseTo(6 / 36, 12)
    expect(d[2]).toBeCloseTo(1 / 36, 12)
    expect(d[12]).toBeCloseTo(1 / 36, 12)
    expect(d[1]).toBe(0)
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(diceModes(2)).toEqual([7])
  })

  it('three dice tie at 10 and 11', () => {
    const d = diceDistribution(3)
    expect(d[10]).toBeCloseTo(27 / 216, 12)
    expect(diceModes(3)).toEqual([10, 11])
  })

  it('simulated rolls approach the exact chances', () => {
    const { counts, last } = rollDice(20000, 2, mulberry32(42))
    expect(counts.reduce((a, b) => a + b, 0)).toBe(20000)
    expect(counts[7] / 20000).toBeCloseTo(6 / 36, 1)
    expect(last).toHaveLength(2)
    expect(last.every((f) => f >= 1 && f <= 6)).toBe(true)
  })
})

describe('birthday problem', () => {
  it('matches the known exact values', () => {
    expect(birthdayExact(1)).toBe(0)
    expect(birthdayExact(2)).toBeCloseTo(1 / 365, 12)
    expect(birthdayExact(23)).toBeCloseTo(0.5073, 4)
    expect(birthdayExact(22)).toBeLessThan(0.5)
    expect(birthdayExact(50)).toBeCloseTo(0.9704, 4)
    expect(birthdayExact(366)).toBe(1)
  })

  it('passes 50% at 23 people', () => {
    expect(birthdayThreshold(0.5)).toBe(23)
    expect(birthdayThreshold(0.99)).toBe(57)
  })

  it('simulation agrees with the formula', () => {
    const { shared, trials } = birthdaySim(23, 6000, mulberry32(7))
    expect(Math.abs(shared / trials - birthdayExact(23))).toBeLessThan(0.03)
  })

  it('reports the last room and its shared day', () => {
    const { lastRoom } = birthdaySim(60, 3, mulberry32(9))
    expect(lastRoom.days).toHaveLength(60)
    if (lastRoom.shared !== null) expect(lastRoom.days.filter((d) => d === lastRoom.shared).length).toBeGreaterThan(1)
  })

  it('labels days and counts pairs', () => {
    expect(dayLabel(0)).toBe('Jan 1')
    expect(dayLabel(31)).toBe('Feb 1')
    expect(dayLabel(364)).toBe('Dec 31')
    expect(pairCount(23)).toBe(253)
  })
})

describe('coin runs', () => {
  it('records points in order and converges toward p', () => {
    let run = emptyCoinRun()
    const rng = mulberry32(3)
    run = extendCoinRun(run, 10, rng)
    expect(run.flips).toBe(10)
    expect(run.points.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(run.recent).toHaveLength(10)
    run = extendCoinRun(run, 20000, rng)
    expect(run.flips).toBe(20010)
    expect(run.recent).toHaveLength(20)
    const ns = run.points.map((p) => p.n)
    expect(ns.every((n, k) => k === 0 || n > ns[k - 1])).toBe(true)
    expect(ns[ns.length - 1]).toBe(20010)
    expect(run.points.length).toBeLessThan(800)
    expect(Math.abs(run.heads / run.flips - 0.5)).toBeLessThan(0.02)
  })

  it('respects a biased coin', () => {
    const run = extendCoinRun(emptyCoinRun(), 10000, mulberry32(5), 0.8)
    expect(run.heads / run.flips).toBeCloseTo(0.8, 1)
  })
})
