import { describe, expect, it } from 'vitest'
import { DEFAULT_CLASSES, checkRanking, correctOrder, formatCount, formatDuration, opsAt, perspective, pickClasses, sampleCurve, scientific } from './big-o'

describe('big-o', () => {
  it('counts operations', () => {
    expect(opsAt('1', 64)).toBe(1)
    expect(opsAt('log n', 64)).toBe(6)
    expect(opsAt('n log n', 64)).toBe(384)
    expect(opsAt('n^2', 64)).toBe(4096)
    expect(opsAt('2^n', 10)).toBe(1024)
    expect(opsAt('n!', 5)).toBe(120)
    expect(opsAt('log n', 1)).toBe(1)
  })

  it('formats counts and durations', () => {
    expect(formatCount(4096)).toBe('4,096')
    expect(formatCount(4.32)).toBe('4.3')
    expect(formatCount(2 ** 64)).toBe('1.8 × 10¹⁹')
    expect(scientific(9.96e5)).toBe('1.0 × 10⁶')
    expect(formatDuration(1)).toBe('1 µs')
    expect(formatDuration(4096)).toBe('4.1 ms')
    expect(formatDuration(2 ** 30)).toBe('18 minutes')
    expect(formatDuration(2 ** 64)).toBe('584,542 years')
    expect(formatDuration(opsAt('n!', 64))).toMatch(/× 10.* years$/)
  })

  it('puts big durations in perspective', () => {
    expect(perspective(2 ** 64)).toBe('longer than humans have existed')
    expect(perspective(opsAt('n!', 64))).toMatch(/times the age of the universe/)
    expect(perspective(10)).toBe('')
  })

  it('ranks classes from slowest to fastest growing', () => {
    expect(correctOrder(['2^n', 'n', '1', 'n^2'])).toEqual(['1', 'n', 'n^2', '2^n'])
    expect(checkRanking(['1', 'log n', 'n', 'n log n', 'n^2', '2^n']).correct).toBe(true)
    const wrong = checkRanking(['1', 'n', 'log n', 'n log n', 'n^2', '2^n'])
    expect(wrong.correct).toBe(false)
    expect(wrong.right).toBe(4)
    expect(wrong.marks).toEqual([true, false, false, true, true, true])
  })

  it('validates classes from props', () => {
    expect(pickClasses(undefined)).toEqual(DEFAULT_CLASSES)
    expect(pickClasses(['n', 'bogus'])).toEqual(DEFAULT_CLASSES)
    expect(pickClasses(['n', 'n!', 'n'])).toEqual(['n', 'n!'])
  })

  it('samples curves', () => {
    const pts = sampleCurve('n', 64, 10)
    expect(pts).toHaveLength(11)
    expect(pts[0]).toEqual([1, 1])
    expect(pts[10]).toEqual([64, 64])
    expect(sampleCurve('n!', 6)).toHaveLength(6)
  })
})
