import { describe, expect, it } from 'vitest'
import { buildRun, buildSchemaRun, formatRow, formatValue, parseSchema, scoreSet, statementSummary, toggleSqlComment } from './lab.js'
import { seedSql } from './datasets.js'

const applyEdit = (value, edit) => value.slice(0, edit.from) + edit.text + value.slice(edit.to)

describe('formatting', () => {
  it('shows NULL, integers and floats without noise', () => {
    expect(formatValue(null)).toBe('NULL')
    expect(formatValue(42)).toBe('42')
    expect(formatValue(0.1 + 0.2)).toBe('0.3')
    expect(formatValue(138.98000000000002)).toBe('138.98')
    expect(formatValue('Ana')).toBe('Ana')
    expect(formatRow(['Ana', 3, null, 1.5])).toBe("('Ana', 3, NULL, 1.5)")
  })
})

describe('buildRun', () => {
  const exercise = { dataset: 'bank', setup: 'BEGIN;', verify: ['SELECT * FROM accounts'], probes: [{ label: 'x', sql: 'INSERT ...' }] }

  it('uses the plain or extended dataset', () => {
    expect(buildRun(exercise, 'ROLLBACK;').seed).toBe(seedSql('bank'))
    expect(buildRun(exercise, 'ROLLBACK;', { extra: true }).seed).toBe(seedSql('bank', { extra: true }))
    expect(seedSql('bank', { extra: true })).toContain('Dina')
  })

  it('adds setup and checks, and probes only when grading', () => {
    const run = buildRun(exercise, 'ROLLBACK;')
    expect(run).toMatchObject({ sql: 'ROLLBACK;', setup: 'BEGIN;', checks: ['SELECT * FROM accounts'] })
    expect(run.probes).toBeUndefined()
    expect(buildRun(exercise, 'ROLLBACK;', { grade: true }).probes).toHaveLength(1)
  })
})

describe('schema', () => {
  it('asks four questions per table and reads the answers back', () => {
    const exercise = { dataset: 'store', tables: ['orders'] }
    const run = buildSchemaRun(exercise)
    expect(run.checks).toHaveLength(4)
    expect(run.checks[0]).toContain("pragma_table_info('orders')")
    const r = (columns, rows) => ({ result: { columns, rows, truncated: false }, error: null })
    const tables = parseSchema(exercise, {
      checks: [
        r(['name', 'type', 'notnull', 'pk'], [['id', 'INTEGER', 0, 1], ['customer_id', 'INTEGER', 1, 0], ['note', 'TEXT', 0, 0]]),
        r(['from', 'table', 'to'], [['customer_id', 'customers', 'id']]),
        r(['id', 'customer_id', 'note'], [[1, 2, null]]),
        r(['sql'], [['CREATE TABLE orders (...)']])
      ]
    })
    expect(tables).toEqual([
      {
        name: 'orders',
        columns: [
          { name: 'id', type: 'INTEGER', notNull: false, pk: true, ref: null },
          { name: 'customer_id', type: 'INTEGER', notNull: true, pk: false, ref: 'customers.id' },
          { name: 'note', type: 'TEXT', notNull: false, pk: false, ref: null }
        ],
        data: { columns: ['id', 'customer_id', 'note'], rows: [[1, 2, null]], truncated: false },
        createSql: 'CREATE TABLE orders (...)'
      }
    ])
  })
})

describe('statementSummary', () => {
  it('describes each statement', () => {
    expect(statementSummary({ kind: 'UPDATE', changes: 3 })).toBe('UPDATE changed 3 rows')
    expect(statementSummary({ kind: 'INSERT', changes: 1 })).toBe('INSERT added 1 row')
    expect(statementSummary({ kind: 'DELETE', changes: 0 })).toBe('DELETE removed 0 rows')
    expect(statementSummary({ kind: 'ROLLBACK', changes: 0 })).toBe('ROLLBACK undid the transaction')
    expect(statementSummary({ kind: 'CREATE', changes: 0 })).toBe('CREATE ran')
    expect(statementSummary({ kind: 'SELECT', columns: ['x'], rows: [[1], [2]], truncated: false })).toBe('SELECT returned 2 rows')
    expect(statementSummary({ kind: 'WITH', columns: ['x'], rows: new Array(1000).fill([1]), truncated: true })).toBe('WITH returned more than 1000 rows')
  })
})

describe('toggleSqlComment', () => {
  it('comments and uncomments the current line with --', () => {
    const value = 'SELECT name\nFROM products;'
    const edit = toggleSqlComment(value, 3, 3)
    const commented = applyEdit(value, edit)
    expect(commented).toBe('-- SELECT name\nFROM products;')
    expect(edit.selStart).toBe(6)
    expect(applyEdit(commented, toggleSqlComment(commented, 5, 5))).toBe(value)
  })

  it('comments a block at its smallest indent', () => {
    const value = 'SELECT\n  name,\n  price\nFROM products;'
    const edit = toggleSqlComment(value, 7, 22)
    expect(applyEdit(value, edit)).toBe('SELECT\n  -- name,\n  -- price\nFROM products;')
  })

  it('does nothing on blank lines', () => {
    expect(toggleSqlComment('\n\n', 1, 1)).toBeNull()
  })
})

describe('scoreSet', () => {
  const exercises = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

  it('counts solved exercises and halves the ones solved after seeing the solution', () => {
    expect(scoreSet(exercises, {})).toMatchObject({ solved: 0, total: 4, complete: false, score: 0 })
    const partial = scoreSet(exercises, { a: { solved: true }, b: { revealed: true } })
    expect(partial).toMatchObject({ solved: 1, complete: false, detail: '1 of 4 queries solved' })
    const done = scoreSet(exercises, { a: { solved: true }, b: { solved: true, helped: true }, c: { solved: true, revealed: true }, d: { solved: true } })
    expect(done).toMatchObject({ solved: 4, helped: 1, complete: true, score: 0.88, detail: '4 of 4 queries solved, 1 after showing the solution' })
  })
})
