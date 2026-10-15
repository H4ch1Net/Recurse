// Small helpers for the SQL lab widget: building worker runs, reading the schema back, display
// formatting, the editor's comment toggle and the set score. Pure functions, no React.
import { seedSql } from './datasets.js'

/** How a value shows in a result table: NULL, numbers without float noise, text as is. */
export function formatValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (Number.isInteger(value) || !Number.isFinite(value)) return String(value)
    return String(Number(value.toPrecision(15)))
  }
  return String(value)
}

/** A row in a sentence: ('Ana Silva', 3, NULL). */
export const formatRow = (row) =>
  `(${(row || []).map((value) => (typeof value === 'string' ? `'${value}'` : formatValue(value))).join(', ')})`

/**
 * The worker run for an exercise: the dataset (with the extra rows for the second check), the
 * exercise setup, the SQL, and for "modify" exercises the verification queries. `grade` adds
 * the constraint test inserts (probes), which run before the verification queries.
 */
export function buildRun(exercise, sql, { extra = false, grade = false } = {}) {
  const run = { seed: seedSql(exercise.dataset, { extra }), sql: String(sql ?? '') }
  if (exercise.setup) run.setup = exercise.setup
  if (grade && exercise.probes?.length) run.probes = exercise.probes
  if (exercise.verify?.length) run.checks = exercise.verify
  return run
}

const quoteText = (text) => `'${String(text).replace(/'/g, "''")}'`
const quoteName = (name) => `"${String(name).replace(/"/g, '""')}"`

/** A run that reads each of the exercise's tables: columns, foreign keys, rows and CREATE text. */
export function buildSchemaRun(exercise) {
  const checks = []
  for (const table of exercise.tables || []) {
    checks.push(
      `SELECT name, type, "notnull", pk FROM pragma_table_info(${quoteText(table)})`,
      `SELECT "from", "table", "to" FROM pragma_foreign_key_list(${quoteText(table)})`,
      `SELECT * FROM ${quoteName(table)}`,
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ${quoteText(table)}`
    )
  }
  const run = { seed: seedSql(exercise.dataset), sql: '', checks }
  if (exercise.setup) run.setup = exercise.setup
  return run
}

/** Turn the schema run's results into [{ name, columns: [{ name, type, notNull, pk, ref }], data, createSql }]. */
export function parseSchema(exercise, result) {
  const checks = result?.checks || []
  return (exercise.tables || []).map((name, i) => {
    const [info, fks, rows, create] = checks.slice(i * 4, i * 4 + 4)
    const refs = new Map((fks?.result?.rows || []).map(([from, table, to]) => [from, `${table}.${to || 'id'}`]))
    const columns = (info?.result?.rows || []).map(([column, type, notNull, pk]) => ({
      name: column,
      type: type || '',
      notNull: Boolean(notNull),
      pk: Number(pk) > 0,
      ref: refs.get(column) || null
    }))
    return { name, columns, data: rows?.result || { columns: columns.map((c) => c.name), rows: [] }, createSql: create?.result?.rows?.[0]?.[0] || '' }
  })
}

const rowsWord = (n) => `${n} ${n === 1 ? 'row' : 'rows'}`

/** One line per statement the learner ran: "UPDATE changed 3 rows". */
export function statementSummary(statement) {
  const { kind, changes = 0 } = statement
  if (statement.columns) return `${kind || 'Query'} returned ${statement.truncated ? 'more than ' : ''}${rowsWord(statement.rows.length)}`
  switch (kind) {
    case 'INSERT':
    case 'REPLACE':
      return `${kind} added ${rowsWord(changes)}`
    case 'UPDATE':
      return `UPDATE changed ${rowsWord(changes)}`
    case 'DELETE':
      return `DELETE removed ${rowsWord(changes)}`
    case 'BEGIN':
      return 'BEGIN opened a transaction'
    case 'COMMIT':
    case 'END':
      return `${kind} saved the transaction`
    case 'ROLLBACK':
      return 'ROLLBACK undid the transaction'
    default:
      return changes ? `${kind || 'Statement'} changed ${rowsWord(changes)}` : `${kind || 'Statement'} ran`
  }
}

/**
 * Ctrl or Cmd + slash in the SQL editor: comment the selected lines with --, or uncomment them
 * when they all are comments. Returns an edit { from, to, text, selStart, selEnd } like
 * ../runner/editing.js, or null when there is nothing to do.
 */
export function toggleSqlComment(value, start, end) {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const last = end > start && value[end - 1] === '\n' ? end - 1 : end
  const lineEnd = value.indexOf('\n', last)
  const to = lineEnd === -1 ? value.length : lineEnd
  const lines = value.slice(from, to).split('\n')
  const filled = lines.filter((line) => line.trim())
  if (!filled.length) return null
  const indent = (line) => /^[ \t]*/.exec(line)[0].length
  const allCommented = filled.every((line) => line.trimStart().startsWith('--'))
  const minIndent = Math.min(...filled.map(indent))
  let firstDelta = 0
  let delta = 0
  const out = lines.map((line, i) => {
    if (!line.trim()) return line
    let next
    if (allCommented) {
      const ws = indent(line)
      const rest = line.slice(ws + 2)
      next = line.slice(0, ws) + (rest.startsWith(' ') ? rest.slice(1) : rest)
    } else {
      next = `${line.slice(0, minIndent)}-- ${line.slice(minIndent)}`
    }
    if (i === 0) firstDelta = next.length - line.length
    delta += next.length - line.length
    return next
  })
  const selStart = start === from && start !== end ? from : Math.max(from, start + firstDelta)
  const selEnd = start === end ? selStart : Math.max(selStart, end + delta)
  return { from, to, text: out.join('\n'), selStart, selEnd }
}

/** Solved count and score for a set. progress[id] = { solved, revealed }; a revealed solution earns half. */
export function scoreSet(exercises, progress = {}) {
  let solved = 0
  let helped = 0
  let points = 0
  for (const exercise of exercises) {
    const p = progress[exercise.id]
    if (!p?.solved) continue
    solved++
    if (p.revealed) {
      helped++
      points += 0.5
    } else {
      points += 1
    }
  }
  const total = exercises.length
  const detail = `${solved} of ${total} queries solved${helped ? `, ${helped} after showing the solution` : ''}`
  return { solved, total, helped, complete: total > 0 && solved === total, score: total ? Math.round((points / total) * 100) / 100 : 0, detail }
}
