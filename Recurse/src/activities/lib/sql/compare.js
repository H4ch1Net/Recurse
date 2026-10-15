// Comparing a learner's SQL result with the expected one.
// Results are { columns: [names], rows: [[values]], truncated? }. Values are null, numbers or
// strings (blobs arrive as x'..' text). The rule: the same columns, the same multiset of rows,
// and the same row order only when the exercise says order matters.

/** Relative tolerance for numbers, so 0.1 + 0.2 equals 0.3 and 64.98 equals 64.97999999999999. */
export const NUMBER_TOLERANCE = 1e-6

export function valuesEqual(a, b) {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b)
    return Math.abs(a - b) <= NUMBER_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b))
  }
  return false
}

export const rowsEqual = (a, b) => a.length === b.length && a.every((value, i) => valuesEqual(value, b[i]))

/** Column names compare without case and without surrounding quotes. */
export const normalizeColumnName = (name) =>
  String(name ?? '')
    .trim()
    .replace(/^["`[](.*)["`\]]$/, '$1')
    .toLowerCase()

/**
 * Line the learner's columns up with the expected ones. The same names in a different order
 * are fine (the rows are reordered to match). Returns { ok, order } where order[i] is the index
 * of expected column i in the learner's result, or { ok: false, problem, missing, unexpected }.
 */
export function alignColumns(actualColumns, expectedColumns) {
  const actual = actualColumns.map(normalizeColumnName)
  const expected = expectedColumns.map(normalizeColumnName)
  if (actual.length !== expected.length) return { ok: false, problem: 'count' }
  if (actual.every((name, i) => name === expected[i])) return { ok: true, order: expected.map((_, i) => i), reordered: false }
  const missing = expected.filter((name) => !actual.includes(name))
  const unexpected = actual.filter((name) => !expected.includes(name))
  const unique = new Set(actual).size === actual.length && new Set(expected).size === expected.length
  if (!missing.length && unique) return { ok: true, order: expected.map((name) => actual.indexOf(name)), reordered: true }
  return { ok: false, problem: 'names', missing, unexpected }
}

/** Rows of `expected` with no partner in `actual` (missing) and leftovers in `actual` (extra). */
export function matchRows(actualRows, expectedRows) {
  const used = new Array(actualRows.length).fill(false)
  const missing = []
  for (const row of expectedRows) {
    let found = -1
    for (let i = 0; i < actualRows.length; i++) {
      if (!used[i] && rowsEqual(actualRows[i], row)) {
        found = i
        break
      }
    }
    if (found === -1) missing.push(row)
    else used[found] = true
  }
  return { missing, extra: actualRows.filter((_, i) => !used[i]) }
}

/** Index of the first position where the two row lists differ (projected onto `keys`), or -1. */
function firstOrderDifference(actualRows, expectedRows, keys) {
  for (let i = 0; i < expectedRows.length; i++) {
    const a = keys ? keys.map((k) => actualRows[i][k]) : actualRows[i]
    const e = keys ? keys.map((k) => expectedRows[i][k]) : expectedRows[i]
    if (!rowsEqual(a, e)) return i
  }
  return -1
}

/**
 * Compare two results. `ordered` is false (any row order), true (rows in the same order), or an
 * array of expected column names whose order matters, so rows that tie on them may come in any
 * order. Returns { ok: true, reordered } or { ok: false, reason, ... } with reason one of
 * 'no-result', 'truncated', 'column-count', 'column-names', 'row-count', 'rows', 'order'.
 */
export function compareResults(actual, expected, { ordered = false } = {}) {
  if (!actual || !Array.isArray(actual.columns)) return { ok: false, reason: 'no-result' }
  if (actual.truncated) return { ok: false, reason: 'truncated', count: actual.rows.length }
  const align = alignColumns(actual.columns, expected.columns)
  if (!align.ok) {
    if (align.problem === 'count') return { ok: false, reason: 'column-count', actual: actual.columns, expected: expected.columns }
    return { ok: false, reason: 'column-names', actual: actual.columns, expected: expected.columns, missing: align.missing, unexpected: align.unexpected }
  }
  const rows = align.reordered ? actual.rows.map((row) => align.order.map((i) => row[i])) : actual.rows
  if (rows.length !== expected.rows.length) return { ok: false, reason: 'row-count', actualCount: rows.length, expectedCount: expected.rows.length, ...matchRows(rows, expected.rows) }
  const { missing, extra } = matchRows(rows, expected.rows)
  if (missing.length) return { ok: false, reason: 'rows', missing, extra }
  if (ordered) {
    const names = expected.columns.map(normalizeColumnName)
    const keys = Array.isArray(ordered) ? ordered.map((name) => names.indexOf(normalizeColumnName(name))).filter((i) => i >= 0) : null
    const at = firstOrderDifference(rows, expected.rows, keys && keys.length ? keys : null)
    if (at !== -1) return { ok: false, reason: 'order', position: at, actualRow: rows[at], expectedRow: expected.rows[at] }
  }
  return { ok: true, reordered: align.reordered }
}
