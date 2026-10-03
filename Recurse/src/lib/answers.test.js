import { describe, expect, it } from 'vitest'
import { checkTyped, normalizeAnswer, parseNumber } from './answers'

describe('normalizeAnswer', () => {
  it('ignores case, outer whitespace, quotes and trailing punctuation', () => {
    expect(normalizeAnswer('  "Hello   World." ')).toBe('hello world')
    expect(normalizeAnswer('¿Cómo estás?')).toBe('cómo estás')
  })
})

describe('parseNumber', () => {
  it('parses integers, decimals, fractions, separators and percents', () => {
    expect(parseNumber('42')).toBe(42)
    expect(parseNumber('.5')).toBe(0.5)
    expect(parseNumber('1/4')).toBe(0.25)
    expect(parseNumber('10,000')).toBe(10000)
    expect(parseNumber('25%')).toBe(25)
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('1/0')).toBeNull()
  })
})

describe('checkTyped', () => {
  const q = { answer: 'Canberra', accept: ['canberra, australia'] }

  it('accepts the answer and listed alternatives', () => {
    expect(checkTyped('canberra', q).correct).toBe(true)
    expect(checkTyped('Canberra, Australia', q).correct).toBe(true)
    expect(checkTyped('Sydney', q).correct).toBe(false)
  })

  it('rejects empty input', () => {
    expect(checkTyped('   ', q).correct).toBe(false)
  })

  it('compares numbers numerically', () => {
    expect(checkTyped('0.50', { answer: '0.5' }).correct).toBe(true)
    expect(checkTyped('2', { answer: '2.0' }).correct).toBe(true)
    expect(checkTyped('3', { answer: '0.5' }).correct).toBe(false)
  })

  it('treats accent-only differences as a near miss that still counts', () => {
    const result = checkTyped('como estas', { answer: 'cómo estás' })
    expect(result.correct).toBe(true)
    expect(result.nearMiss).toBe(true)
  })
})
