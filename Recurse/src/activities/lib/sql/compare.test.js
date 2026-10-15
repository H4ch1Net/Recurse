import { describe, expect, it } from 'vitest'
import { alignColumns, compareResults, matchRows, normalizeColumnName, valuesEqual } from './compare.js'

const result = (columns, rows, truncated = false) => ({ columns, rows, truncated })

describe('valuesEqual', () => {
  it('compares numbers with a small relative tolerance', () => {
    expect(valuesEqual(0.1 + 0.2, 0.3)).toBe(true)
    expect(valuesEqual(64.97999999999999, 64.98)).toBe(true)
    expect(valuesEqual(143333.33, 143333.33000001)).toBe(true)
    expect(valuesEqual(47.988, 47.99)).toBe(false)
    expect(valuesEqual(3, 3.0)).toBe(true)
    expect(valuesEqual(1e12, 1e12 + 1)).toBe(true)
    expect(valuesEqual(NaN, NaN)).toBe(true)
  })

  it('keeps NULL, numbers and text apart', () => {
    expect(valuesEqual(null, null)).toBe(true)
    expect(valuesEqual(null, 0)).toBe(false)
    expect(valuesEqual('3', 3)).toBe(false)
    expect(valuesEqual('Paris', 'paris')).toBe(false)
  })
})

describe('alignColumns', () => {
  it('accepts the same names in the same order, ignoring case and quotes', () => {
    expect(normalizeColumnName(' "Order_ID" ')).toBe('order_id')
    expect(alignColumns(['NAME', '[price]'], ['name', 'price'])).toEqual({ ok: true, order: [0, 1], reordered: false })
  })

  it('maps the same names in another order', () => {
    expect(alignColumns(['price', 'name'], ['name', 'price'])).toEqual({ ok: true, order: [1, 0], reordered: true })
  })

  it('reports a different number of columns or different names', () => {
    expect(alignColumns(['name'], ['name', 'price']).problem).toBe('count')
    const names = alignColumns(['name', 'COUNT(*)'], ['name', 'orders'])
    expect(names).toMatchObject({ ok: false, problem: 'names', missing: ['orders'], unexpected: ['count(*)'] })
  })

  it('does not guess when names repeat', () => {
    expect(alignColumns(['name', 'name'], ['employee', 'manager']).ok).toBe(false)
  })
})

describe('matchRows', () => {
  it('treats rows as a multiset', () => {
    expect(matchRows([[1], [1], [2]], [[1], [2], [1]])).toEqual({ missing: [], extra: [] })
    expect(matchRows([[1], [2], [2]], [[1], [1], [2]])).toEqual({ missing: [[1]], extra: [[2]] })
  })
})

describe('compareResults', () => {
  const expected = result(['name', 'price'], [['Desk', 299], ['Mouse', 24.99], ['Hub', 45]])

  it('passes the same rows in any order when order does not matter', () => {
    expect(compareResults(result(['name', 'price'], [['Hub', 45], ['Desk', 299], ['Mouse', 24.990000000001]]), expected).ok).toBe(true)
  })

  it('passes reordered columns', () => {
    const out = compareResults(result(['price', 'name'], [[45, 'Hub'], [299, 'Desk'], [24.99, 'Mouse']]), expected)
    expect(out).toEqual({ ok: true, reordered: true })
  })

  it('needs a result', () => {
    expect(compareResults(null, expected).reason).toBe('no-result')
  })

  it('rejects a truncated result', () => {
    expect(compareResults(result(['name', 'price'], [['Desk', 299]], true), expected)).toMatchObject({ ok: false, reason: 'truncated', count: 1 })
  })

  it('names the column problem', () => {
    expect(compareResults(result(['name'], [['Desk']]), expected).reason).toBe('column-count')
    expect(compareResults(result(['name', 'cost'], [['Desk', 299]]), expected).reason).toBe('column-names')
  })

  it('reports a different row count with a missing row', () => {
    const out = compareResults(result(['name', 'price'], [['Desk', 299], ['Hub', 45]]), expected)
    expect(out).toMatchObject({ ok: false, reason: 'row-count', actualCount: 2, expectedCount: 3, missing: [['Mouse', 24.99]] })
  })

  it('reports rows that differ', () => {
    const out = compareResults(result(['name', 'price'], [['Desk', 299], ['Hub', 45], ['Mouse', 25]]), expected)
    expect(out).toMatchObject({ ok: false, reason: 'rows', missing: [['Mouse', 24.99]], extra: [['Mouse', 25]] })
  })

  it('checks the order only when asked', () => {
    const shuffled = result(['name', 'price'], [['Mouse', 24.99], ['Desk', 299], ['Hub', 45]])
    expect(compareResults(shuffled, expected).ok).toBe(true)
    expect(compareResults(shuffled, expected, { ordered: true })).toMatchObject({ ok: false, reason: 'order', position: 0, expectedRow: ['Desk', 299] })
    expect(compareResults(expected, expected, { ordered: true }).ok).toBe(true)
  })

  it('checks order after lining up reordered columns', () => {
    const swapped = result(['price', 'name'], [[299, 'Desk'], [24.99, 'Mouse'], [45, 'Hub']])
    expect(compareResults(swapped, expected, { ordered: true }).ok).toBe(true)
  })

  it('lets rows that tie on the ordered columns come in any order', () => {
    const want = result(['salary', 'name'], [[100, 'Ann'], [90, 'Bo'], [90, 'Cy'], [80, 'Di']])
    const tiesSwapped = result(['salary', 'name'], [[100, 'Ann'], [90, 'Cy'], [90, 'Bo'], [80, 'Di']])
    expect(compareResults(tiesSwapped, want, { ordered: ['salary'] }).ok).toBe(true)
    expect(compareResults(tiesSwapped, want, { ordered: true }).reason).toBe('order')
    const wrong = result(['salary', 'name'], [[90, 'Bo'], [100, 'Ann'], [90, 'Cy'], [80, 'Di']])
    expect(compareResults(wrong, want, { ordered: ['salary'] }).reason).toBe('order')
  })
})
