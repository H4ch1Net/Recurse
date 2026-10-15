// Grading a learner's SQL against the reference solution, with messages that say what to fix.
// Each "run" is one entry of the worker's results (see executeRuns in worker.js).
import { compareResults } from './compare.js'
import { changesData } from './exercises.js'
import { formatRow } from './lab.js'

/** SQL without comments, for "does it contain BEGIN" style checks and the empty check. */
export const stripSqlComments = (sql) =>
  String(sql ?? '')
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ')
    .replace(/--[^\n]*/g, ' ')

export const hasSql = (sql) => /[^\s;]/.test(stripSqlComments(sql))

const HINTS = [
  [/^no such column: (.+)$/i, (m) => `There is no column called ${m[1]} here. Check the spelling and which table it lives in; the tables above list every column. Text values need single quotes, like 'Paris'.`],
  [/^no such table: (.+)$/i, (m) => `There is no table called ${m[1]}. The tables above are the ones you can use.`],
  [/^near "(.+)": syntax error$/i, (m) => `SQLite could not read the statement near ${m[1]}. Look for a missing comma or quote, or a clause in the wrong place: the order is SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.`],
  [/incomplete input/i, () => 'The statement ends too early. Is a closing parenthesis or quote missing?'],
  [/^ambiguous column name: (.+)$/i, (m) => `More than one table has a column called ${m[1]}. Say which one with its table alias, like c.${m[1]}.`],
  [/misuse of aggregate/i, () => 'Aggregates such as COUNT and SUM cannot go in WHERE, because WHERE runs before rows are grouped. Filter groups with HAVING instead.'],
  [/misuse of window function/i, () => 'Window functions cannot go in WHERE, GROUP BY or HAVING. Compute them in a CTE or a subquery, then filter in the outer query.'],
  [/FOREIGN KEY constraint failed/i, () => 'A foreign key blocked this: a row would point at a row that does not exist. Change the rows in the right order, children before parents when deleting.'],
  [/UNIQUE constraint failed: (.+)$/i, (m) => `A row with the same ${m[1]} already exists, and that column must be unique.`],
  [/NOT NULL constraint failed: (.+)$/i, (m) => `${m[1]} cannot be empty. Give it a value.`],
  [/CHECK constraint failed/i, () => 'A CHECK constraint rejected the value. Read the CREATE TABLE statement above to see the rule.'],
  [/cannot (commit|rollback) - no transaction is active/i, () => 'There is no open transaction. Start one with BEGIN first.'],
  [/cannot start a transaction within a transaction/i, () => 'A transaction is already open. Finish it with COMMIT or ROLLBACK before starting another.'],
  [/^table (.+) already exists$/i, (m) => `A table called ${m[1]} already exists.`],
  [/has no column named (.+)$/i, (m) => `That table has no column called ${m[1]}.`],
  [/(\d+) values for (\d+) columns/i, () => 'The number of values must match the number of columns you listed.'],
  [/^no such function: (.+)$/i, (m) => `SQLite has no function called ${m[1]}. Some functions differ between databases.`],
  [/does not match any column/i, () => 'An ORDER BY or GROUP BY number points past the last column.']
]

/** A short explanation of a SQLite error message, or ''. */
export function sqlErrorHint(message) {
  const text = String(message ?? '').trim()
  for (const [pattern, explain] of HINTS) {
    const match = pattern.exec(text)
    if (match) return explain(match)
  }
  return ''
}

/** "Statement 2: no such column: nme" when the SQL had several statements. */
export const errorText = (error) => (error.index > 1 ? `Statement ${error.index}: ${error.message}` : error.message)

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** What is wrong with a result, in a sentence or two, for a failed compareResults. */
export function describeMismatch(cmp, expected) {
  switch (cmp.reason) {
    case 'no-result':
      return 'Your SQL did not return any rows to compare. End with a SELECT that returns the answer.'
    case 'truncated':
      return `Your query returned more than ${cmp.count} rows; the expected result has ${count(expected.rows.length, 'row')}. Check that every JOIN has an ON condition.`
    case 'column-count':
      return `Your result has ${count(cmp.actual.length, 'column')} (${cmp.actual.join(', ')}), but the exercise asks for ${cmp.expected.length} (${cmp.expected.join(', ')}).`
    case 'column-names': {
      const example = cmp.missing?.[0] ? ` For example: COUNT(*) AS ${cmp.missing[0]}.` : ''
      return `Your columns are named ${cmp.actual.join(', ')}, but the exercise asks for ${cmp.expected.join(', ')}. Rename a column with AS.${example}`
    }
    case 'row-count': {
      let text = `Your query returned ${count(cmp.actualCount, 'row')}; the expected result has ${cmp.expectedCount}.`
      if (cmp.actualCount > cmp.expectedCount && !cmp.missing.length) text += ' Some rows appear more than once: do you need DISTINCT, or is a join multiplying rows?'
      else if (cmp.missing.length) text += ` Missing, for example: ${formatRow(cmp.missing[0])}.`
      else if (cmp.extra.length) text += ` This one should not be there: ${formatRow(cmp.extra[0])}.`
      return text
    }
    case 'rows':
      return `The right number of rows, but some values differ. Expected ${formatRow(cmp.missing[0])}${cmp.extra[0] ? `, and yours has ${formatRow(cmp.extra[0])} instead` : ''}. Check your conditions, and rounding if there are decimals.`
    case 'order':
      return `The right rows in the wrong order: row ${cmp.position + 1} should be ${formatRow(cmp.expectedRow)}, not ${formatRow(cmp.actualRow)}. Check your ORDER BY.`
    default:
      return 'Your result does not match the expected one yet.'
  }
}

const INTERNAL = { pass: false, kind: 'internal', message: 'This exercise could not build its expected result. Please report it.' }

/**
 * Grade one run of the learner's SQL against one run of the reference solution on the same data.
 * Returns { pass: true } or { pass: false, kind, message, hint? } with kind one of 'error',
 * 'probe', 'check', 'mismatch', 'order', 'internal'.
 */
export function gradeRun(exercise, mine, ref) {
  if (!ref || ref.setupError || !ref.mine || ref.mine.error) return INTERNAL
  if (!mine || mine.setupError || !mine.mine) return INTERNAL
  const error = mine.mine.error
  if (error) return { pass: false, kind: 'error', message: errorText(error), hint: sqlErrorHint(error.message) }

  if (changesData(exercise)) {
    for (let i = 0; i < ref.probes.length; i++) {
      const want = ref.probes[i]
      const got = mine.probes[i]
      if (got && got.ok === want.ok) continue
      const message = want.ok
        ? `Test insert "${want.label}" should be accepted, but it was rejected${got?.message ? `: ${got.message}` : ''}.`
        : `Test insert "${want.label}" should be rejected, but your table accepted it. Which constraint would stop it?`
      return { pass: false, kind: 'probe', message, hint: want.ok && got?.message ? sqlErrorHint(got.message) : '' }
    }
    for (let i = 0; i < ref.checks.length; i++) {
      const want = ref.checks[i]
      const got = mine.checks[i]
      if (want.error || !want.result) return INTERNAL
      if (!got || got.error) {
        return { pass: false, kind: 'check', message: `The checker could not read your table: ${got?.error || 'no result'}. Use the table and column names from the exercise.`, hint: sqlErrorHint(got?.error) }
      }
      const cmp = compareResults(got.result, want.result)
      if (!cmp.ok) return { pass: false, kind: 'mismatch', message: `The data after your statements is not right yet. ${describeMismatch(cmp, want.result)}` }
    }
    return { pass: true }
  }

  const cmp = compareResults(mine.mine.result, ref.mine.result, { ordered: exercise.ordered || false })
  if (!cmp.ok) return { pass: false, kind: cmp.reason === 'order' ? 'order' : 'mismatch', message: describeMismatch(cmp, ref.mine.result) }
  return { pass: true }
}

/**
 * Grade an attempt: the learner's SQL must match the reference on the dataset, then again on
 * the dataset with extra rows (the second check catches hard-coded ids and values), and contain
 * any required keywords. runs: { base, baseRef, extra, extraRef }.
 */
export function gradeAttempt(exercise, sql, { base, baseRef, extra, extraRef } = {}) {
  if (!hasSql(sql)) return { pass: false, kind: 'empty', message: 'Write some SQL first.' }
  const first = gradeRun(exercise, base, baseRef)
  if (!first.pass) return first
  if (extra && extraRef) {
    const second = gradeRun(exercise, extra, extraRef)
    if (!second.pass) {
      if (second.kind === 'internal') return second
      const what = second.kind === 'error' ? 'your SQL fails' : 'your SQL gives a different answer'
      return {
        pass: false,
        kind: 'second-check',
        message: `Right on this data, but a second check adds a few rows to the tables, and there ${what}. Make sure it does not depend on particular ids, names or values. (On the second check: ${second.message})`,
        hint: second.hint || ''
      }
    }
  }
  const text = stripSqlComments(sql)
  for (const rule of exercise.mustInclude || []) {
    if (!new RegExp(rule.pattern, 'i').test(text)) return { pass: false, kind: 'missing', message: `The data is right, but one thing is missing. ${rule.message}` }
  }
  return { pass: true, kind: 'pass', message: 'Correct. Your result matches, and it passed the second check with extra rows too.' }
}
