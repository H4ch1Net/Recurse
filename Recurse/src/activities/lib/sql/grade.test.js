import { describe, expect, it } from 'vitest'
import { describeMismatch, errorText, gradeAttempt, gradeRun, hasSql, sqlErrorHint, stripSqlComments } from './grade.js'

const table = (columns, rows) => ({ columns, rows, truncated: false })
const queryRun = (result, error = null) => ({ mine: { statements: [], error, result, ms: 1 }, probes: [], checks: [], setupError: null })
const modifyRun = (checks, probes = []) => ({ mine: { statements: [{ kind: 'UPDATE', changes: 1 }], error: null, result: null, ms: 1 }, probes, checks: checks.map((result) => ({ result, error: null })), setupError: null })

const query = { id: 'q', dataset: 'store', tables: ['products'], solution: 'SELECT name FROM products', hints: [], prompt: '', explain: '' }
const ordered = { ...query, ordered: true }
const modify = { ...query, verify: ['SELECT id, price FROM products ORDER BY id'] }
const probed = { ...query, verify: ['SELECT id FROM reviews'], probes: [{ label: 'Rating 6', sql: '...' }] }
const transaction = { ...modify, mustInclude: [{ pattern: '\\bBEGIN\\b', message: 'Use BEGIN.' }] }

describe('sqlErrorHint', () => {
  it('explains common SQLite errors', () => {
    expect(sqlErrorHint('no such column: nme')).toMatch(/no column called nme/)
    expect(sqlErrorHint('no such table: product')).toMatch(/no table called product/)
    expect(sqlErrorHint('near "FORM": syntax error')).toMatch(/near FORM/)
    expect(sqlErrorHint('incomplete input')).toMatch(/ends too early/)
    expect(sqlErrorHint('ambiguous column name: id')).toMatch(/c\.id/)
    expect(sqlErrorHint('misuse of aggregate: COUNT()')).toMatch(/HAVING/)
    expect(sqlErrorHint('FOREIGN KEY constraint failed')).toMatch(/children before parents/)
    expect(sqlErrorHint('NOT NULL constraint failed: reviews.rating')).toMatch(/reviews\.rating cannot be empty/)
    expect(sqlErrorHint('cannot commit - no transaction is active')).toMatch(/BEGIN/)
    expect(sqlErrorHint('something unusual')).toBe('')
  })

  it('numbers the failing statement only when there were several', () => {
    expect(errorText({ message: 'boom', index: 1 })).toBe('boom')
    expect(errorText({ message: 'boom', index: 3 })).toBe('Statement 3: boom')
  })
})

describe('comments and empty SQL', () => {
  it('ignores comments', () => {
    expect(hasSql('-- Write your query below\n')).toBe(false)
    expect(hasSql('/* nothing */ ;')).toBe(false)
    expect(hasSql('SELECT 1')).toBe(true)
    expect(stripSqlComments('SELECT 1 -- BEGIN\n/* COMMIT */')).not.toMatch(/BEGIN|COMMIT/)
  })
})

describe('describeMismatch', () => {
  it('suggests DISTINCT or a join problem for repeated rows', () => {
    const text = describeMismatch({ reason: 'row-count', actualCount: 6, expectedCount: 5, missing: [], extra: [['Ana']] }, table(['name'], []))
    expect(text).toMatch(/returned 6 rows; the expected result has 5/)
    expect(text).toMatch(/DISTINCT/)
  })

  it('shows a missing row and suggests AS for names', () => {
    expect(describeMismatch({ reason: 'row-count', actualCount: 1, expectedCount: 2, missing: [['Toys', 0]], extra: [] }, table(['c', 'n'], []))).toMatch(/\('Toys', 0\)/)
    expect(describeMismatch({ reason: 'column-names', actual: ['COUNT(*)'], expected: ['orders'], missing: ['orders'] }, table(['orders'], []))).toMatch(/AS orders/)
  })

  it('points at the first row out of order', () => {
    expect(describeMismatch({ reason: 'order', position: 1, actualRow: ['b'], expectedRow: ['a'] }, table(['x'], []))).toMatch(/row 2 should be \('a'\), not \('b'\)/)
  })
})

describe('gradeRun', () => {
  const want = table(['name'], [['Ana'], ['Ben']])

  it('passes matching rows and fails different ones', () => {
    expect(gradeRun(query, queryRun(table(['name'], [['Ben'], ['Ana']])), queryRun(want))).toEqual({ pass: true })
    expect(gradeRun(query, queryRun(table(['name'], [['Ana']])), queryRun(want))).toMatchObject({ pass: false, kind: 'mismatch' })
  })

  it('reports order problems separately', () => {
    expect(gradeRun(ordered, queryRun(table(['name'], [['Ben'], ['Ana']])), queryRun(want))).toMatchObject({ pass: false, kind: 'order' })
  })

  it('reports SQL errors with a hint', () => {
    const out = gradeRun(query, queryRun(null, { message: 'no such column: nme', index: 1 }), queryRun(want))
    expect(out).toMatchObject({ pass: false, kind: 'error', message: 'no such column: nme' })
    expect(out.hint).toMatch(/nme/)
  })

  it('refuses to grade when the reference itself failed', () => {
    expect(gradeRun(query, queryRun(want), queryRun(null, { message: 'x', index: 1 })).kind).toBe('internal')
  })

  it('grades modify exercises by the data they leave', () => {
    const after = table(['id', 'price'], [[1, 9], [2, 20]])
    expect(gradeRun(modify, modifyRun([after]), modifyRun([after])).pass).toBe(true)
    const out = gradeRun(modify, modifyRun([table(['id', 'price'], [[1, 10], [2, 20]])]), modifyRun([after]))
    expect(out).toMatchObject({ pass: false, kind: 'mismatch' })
    expect(out.message).toMatch(/data after your statements/)
  })

  it('reports a verification query the learner broke', () => {
    const broken = { ...modifyRun([]), checks: [{ result: null, error: 'no such table: reviews' }] }
    expect(gradeRun(modify, broken, modifyRun([table(['id', 'price'], [])]))).toMatchObject({ pass: false, kind: 'check' })
  })

  it('compares constraint tests in both directions', () => {
    const ref = modifyRun([table(['id'], [])], [{ label: 'Rating 6', ok: false, message: 'CHECK constraint failed' }])
    const accepted = modifyRun([table(['id'], [])], [{ label: 'Rating 6', ok: true }])
    expect(gradeRun(probed, accepted, ref).message).toMatch(/should be rejected, but your table accepted it/)
    const okRef = modifyRun([table(['id'], [])], [{ label: 'Rating 6', ok: true }])
    const rejected = modifyRun([table(['id'], [])], [{ label: 'Rating 6', ok: false, message: 'no such table: reviews' }])
    expect(gradeRun(probed, rejected, okRef).message).toMatch(/should be accepted, but it was rejected: no such table: reviews/)
  })
})

describe('gradeAttempt', () => {
  const want = table(['name'], [['Ana'], ['Ben']])
  const wantExtra = table(['name'], [['Ana'], ['Ben'], ['Kofi']])

  it('asks for SQL first', () => {
    expect(gradeAttempt(query, '-- nothing yet\n', {}).kind).toBe('empty')
  })

  it('passes when both checks match', () => {
    const out = gradeAttempt(query, 'SELECT name FROM customers', { base: queryRun(want), baseRef: queryRun(want), extra: queryRun(wantExtra), extraRef: queryRun(wantExtra) })
    expect(out).toMatchObject({ pass: true, kind: 'pass' })
  })

  it('catches answers that only fit the first dataset', () => {
    const out = gradeAttempt(query, "SELECT name FROM customers WHERE id IN (1, 2)", { base: queryRun(want), baseRef: queryRun(want), extra: queryRun(want), extraRef: queryRun(wantExtra) })
    expect(out).toMatchObject({ pass: false, kind: 'second-check' })
    expect(out.message).toMatch(/\('Kofi'\)/)
  })

  it('reports an error that only happens on the second check', () => {
    const failing = queryRun(null, { message: 'UNIQUE constraint failed: products.id', index: 1 })
    const out = gradeAttempt(query, 'INSERT ...', { base: queryRun(want), baseRef: queryRun(want), extra: failing, extraRef: queryRun(wantExtra) })
    expect(out).toMatchObject({ pass: false, kind: 'second-check' })
    expect(out.message).toMatch(/fails/)
  })

  it('requires keywords from mustInclude, ignoring comments', () => {
    const after = table(['id', 'price'], [[1, 9]])
    const runs = { base: modifyRun([after]), baseRef: modifyRun([after]), extra: modifyRun([after]), extraRef: modifyRun([after]) }
    expect(gradeAttempt(transaction, '-- BEGIN\nUPDATE products SET price = 9;', runs)).toMatchObject({ pass: false, kind: 'missing' })
    expect(gradeAttempt(transaction, 'begin;\nUPDATE products SET price = 9;\ncommit;', runs).pass).toBe(true)
  })
})
