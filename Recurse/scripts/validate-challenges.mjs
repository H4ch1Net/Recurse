// Validates every coding challenge set in src/data/challenges (format: docs/challenges.md)
// and runs each reference solution against every test: JavaScript in Node's vm with the
// same runtime the browser worker uses, Python with python3 and the same harness Pyodide
// uses (skipped with a note when python3 is not installed).
// Usage: node scripts/validate-challenges.mjs [path/to/set.json ...]
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareValues, COMPARE_MODES } from '../src/activities/lib/runner/compare.js'
import { formatValue } from '../src/activities/lib/runner/format.js'
import { normalizeArgTypes } from '../src/activities/lib/runner/jsSource.js'
import { hasPython, runJsInNode, runPythonJobs } from '../src/activities/lib/runner/nodeRun.js'

const challengesDir = fileURLToPath(new URL('../src/data/challenges', import.meta.url))
const packsDir = fileURLToPath(new URL('../src/data/packs', import.meta.url))
const args = process.argv.slice(2)
const files = args.length
  ? args
  : readdirSync(challengesDir).filter((f) => f.endsWith('.json')).sort().map((f) => join(challengesDir, f))

const LANGS = ['javascript', 'python']
const DIFFICULTIES = ['easy', 'medium', 'hard']
const ARG_TYPES = ['list', 'tree', 'list[]', 'tree[]']
const RETURN_TYPES = ['list', 'tree', 'list[]', 'tree[]']
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const JS_IDENT = /^[A-Za-z_$][\w$]*$/
const PY_IDENT = /^[A-Za-z_]\w*$/
const EM_DASH = '—'

const packIds = new Set()
try {
  for (const f of readdirSync(packsDir).filter((name) => name.endsWith('.json'))) {
    try {
      packIds.add(JSON.parse(readFileSync(join(packsDir, f), 'utf8')).id)
    } catch {
      // The pack validator reports broken packs.
    }
  }
} catch {
  // No packs directory: skip the topic check.
}

const isString = (v) => typeof v === 'string' && v.trim().length > 0
const short = (v) => formatValue(v, { maxLength: 120 })

/** Format checks for one challenge. Returns { errors, warnings }. */
function checkChallenge(c, ids, where) {
  const errors = []
  const warnings = []
  const err = (m) => errors.push(m)
  const warn = (m) => warnings.push(m)

  if (!isString(c.id)) err('missing id')
  else {
    if (!KEBAB.test(c.id)) err(`id "${c.id}" must be kebab-case`)
    if (ids.has(c.id)) err(`id "${c.id}" is also used in ${ids.get(c.id)}`)
    ids.set(c.id, where)
  }
  for (const field of ['title', 'prompt', 'topic', 'explanation']) if (!isString(c[field])) err(`missing ${field}`)
  if (!DIFFICULTIES.includes(c.difficulty)) err(`difficulty must be one of ${DIFFICULTIES.join(', ')}`)
  if (isString(c.topic) && packIds.size && !packIds.has(c.topic)) warn(`topic "${c.topic}" is not a built-in pack id`)
  if (c.tags !== undefined && !Array.isArray(c.tags)) err('tags must be an array')
  if (!Array.isArray(c.examples) || !c.examples.length) err('needs at least one example')
  else c.examples.forEach((e, i) => { if (!isString(e?.input) || !isString(e?.output)) err(`example ${i + 1} needs input and output text`) })
  if (c.constraints !== undefined && !Array.isArray(c.constraints)) err('constraints must be an array')

  if (!Array.isArray(c.params) || !c.params.every(isString)) err('params must be an array of names')
  for (const lang of LANGS) {
    const name = c.function?.[lang]
    if (!isString(name)) err(`function.${lang} is missing`)
    else if (!(lang === 'python' ? PY_IDENT : JS_IDENT).test(name)) err(`function.${lang} "${name}" is not a valid name`)
    if (!isString(c.starter?.[lang])) err(`starter.${lang} is missing`)
    else if (isString(name) && !c.starter[lang].includes(name)) warn(`starter.${lang} does not mention ${name}`)
    if (!isString(c.solution?.[lang])) err(`solution.${lang} is missing`)
  }

  const params = Array.isArray(c.params) ? c.params : []
  if (!Array.isArray(c.tests)) err('tests must be an array')
  else {
    const visible = c.tests.filter((t) => !t?.hidden).length
    const hidden = c.tests.length - visible
    if (visible < 2) err(`needs at least 2 visible tests (has ${visible})`)
    if (hidden < 1) err('needs at least 1 hidden test')
    if (c.tests.length < 4 || c.tests.length > 12) warn(`has ${c.tests.length} tests (aim for 4 to 12)`)
    c.tests.forEach((t, i) => {
      if (!Array.isArray(t?.args)) err(`test ${i + 1}: args must be an array`)
      else if (params.length && t.args.length !== params.length) err(`test ${i + 1}: ${t.args.length} args for ${params.length} params`)
      if (!t || !('expected' in t)) err(`test ${i + 1}: missing expected`)
    })
  }
  if (c.compare !== undefined && !COMPARE_MODES.includes(c.compare)) err(`compare must be one of ${COMPARE_MODES.join(', ')}`)
  if (c.argTypes !== undefined) {
    const list = normalizeArgTypes(c.argTypes, params)
    if (Array.isArray(c.argTypes) && c.argTypes.length > params.length) err('argTypes has more entries than params')
    if (!Array.isArray(c.argTypes) && (typeof c.argTypes !== 'object' || c.argTypes === null)) err('argTypes must be an array or an object')
    if (c.argTypes && !Array.isArray(c.argTypes) && typeof c.argTypes === 'object') {
      for (const key of Object.keys(c.argTypes)) if (!params.includes(key)) err(`argTypes names unknown param "${key}"`)
    }
    for (const t of list) if (t !== null && !ARG_TYPES.includes(t)) err(`argTypes value "${t}" must be one of ${ARG_TYPES.join(', ')} or null`)
  }
  if (c.returnType !== undefined && c.returnType !== null && !RETURN_TYPES.includes(c.returnType)) err(`returnType must be one of ${RETURN_TYPES.join(', ')}`)
  if (c.timeLimit !== undefined && !(Number.isFinite(c.timeLimit) && c.timeLimit >= 500 && c.timeLimit <= 20000)) err('timeLimit must be a number of milliseconds from 500 to 20000')
  if (!Array.isArray(c.hints) || !c.hints.length) err('needs hints')
  else if (c.hints.length < 2 || c.hints.length > 3) warn(`has ${c.hints.length} hints (aim for 2 or 3)`)
  if (!isString(c.complexity?.time) || !isString(c.complexity?.space)) err('complexity needs time and space')
  if (JSON.stringify(c).includes(EM_DASH)) err('contains an em dash; use a comma, colon or period')
  return { errors, warnings }
}

/** Compare one language's raw results with the expected values. */
function checkResults(c, lang, results, fatal, status) {
  const errors = []
  if (fatal) return [`${lang} solution did not load: ${fatal.line ? `line ${fatal.line}: ` : ''}${fatal.message}`]
  if (status === 'timeout') errors.push(`${lang} solution hit the time limit`)
  c.tests.forEach((test, i) => {
    const r = results[i]
    if (!r) {
      if (status !== 'timeout') errors.push(`${lang} test ${i + 1}: no result`)
      return
    }
    if (r.error) errors.push(`${lang} test ${i + 1} threw: ${r.error.line ? `line ${r.error.line}: ` : ''}${r.error.message}`)
    else if (!compareValues(r.actual, test.expected, c.compare || 'exact')) {
      errors.push(`${lang} test ${i + 1}: expected ${short(test.expected)}, got ${short(r.actual)}`)
    }
  })
  return errors
}

const ids = new Map()
const sets = []
let failed = 0
let total = 0
let runnerFailed = false

for (const file of files) {
  let set
  try {
    set = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.log(`✗ ${basename(file)}: invalid JSON (${error.message})`)
    failed++
    continue
  }
  const errors = []
  const warnings = []
  if (!isString(set.set)) errors.push('missing "set" id')
  else if (basename(file, '.json') !== set.set) errors.push(`file name must match the set id (${set.set}.json)`)
  if (!isString(set.title)) errors.push('missing title')
  if (set.order !== undefined && !Number.isFinite(set.order)) errors.push('order must be a number')
  if (!Array.isArray(set.challenges) || !set.challenges.length) errors.push('challenges must be a non-empty array')
  const perChallenge = new Map()
  for (const c of Array.isArray(set.challenges) ? set.challenges : []) {
    const report = checkChallenge(c, ids, set.set || basename(file))
    report.formatOk = !report.errors.length
    perChallenge.set(c, report)
  }
  sets.push({ file, set, errors, warnings, perChallenge })
}

// ---- Run the reference solutions ------------------------------------------------------

// Only challenges whose format checks passed are run (a run error must not hide the other language).
const runnable = (c, report) => report.formatOk && Array.isArray(c.tests)

for (const entry of sets) {
  for (const [c, report] of entry.perChallenge) {
    if (!runnable(c, report)) continue
    const run = await runJsInNode({
      code: c.solution.javascript,
      fnName: c.function.javascript,
      tests: c.tests.map((t) => t.args),
      argTypes: c.argTypes,
      params: c.params,
      returnType: c.returnType,
      timeout: Math.max(5000, c.timeLimit || 0)
    })
    const results = []
    for (const m of run.messages) if (m.t === 'test-result') results[m.i] = m
    report.errors.push(...checkResults(c, 'javascript', results, run.fatal, run.status))
  }
}

const python = hasPython()
if (python) {
  const jobs = []
  const lookup = new Map()
  for (const entry of sets) {
    for (const [c, report] of entry.perChallenge) {
      if (!runnable(c, report)) continue
      const id = `${entry.set.set}/${c.id}`
      lookup.set(id, { c, report })
      jobs.push({
        id,
        mode: 'tests',
        code: c.solution.python,
        fn: c.function.python,
        tests: c.tests.map((t) => t.args),
        argTypes: normalizeArgTypes(c.argTypes, c.params),
        returnType: c.returnType || null,
        timeout: Math.max(5, (c.timeLimit || 0) / 1000)
      })
      jobs.push({ id: `${id}#starter`, mode: 'syntax', code: c.starter.python })
    }
  }
  const out = runPythonJobs(jobs, { timeout: 300000 })
  if (out.error) {
    console.log(`✗ python3 failed: ${out.error}`)
    runnerFailed = true
  } else {
    for (const [id, { c, report }] of lookup) {
      const events = out.byJob.get(id) || []
      const results = []
      let fatal = null
      let status = 'ok'
      for (const e of events) {
        if (e.kind === 'test-result') results[e.payload.i] = e.payload
        else if (e.kind === 'fatal') fatal = e.payload
        else if (e.kind === 'timeout') status = 'timeout'
      }
      if (!events.some((e) => e.kind === 'done')) report.errors.push('python run did not finish')
      report.errors.push(...checkResults(c, 'python', results, fatal, status))
      const syntax = (out.byJob.get(`${id}#starter`) || []).find((e) => e.kind === 'syntax')
      if (syntax && syntax.payload) report.errors.push(`python starter has a syntax error: line ${syntax.payload.line}: ${syntax.payload.message}`)
    }
  }
}

// JavaScript starters must at least parse.
for (const entry of sets) {
  for (const [c, report] of entry.perChallenge) {
    if (!isString(c.starter?.javascript)) continue
    try {
      new Function(c.starter.javascript)
    } catch (error) {
      report.errors.push(`javascript starter has a syntax error: ${error.message}`)
    }
  }
}

// ---- Report ----------------------------------------------------------------------------

for (const { file, errors, warnings, perChallenge } of sets) {
  const bad = [...perChallenge.values()].filter((r) => r.errors.length).length
  const count = perChallenge.size
  total += count
  if (errors.length || bad) {
    failed++
    console.log(`✗ ${basename(file)} (${count - bad}/${count} challenges valid)`)
  } else {
    console.log(`✓ ${basename(file)} (${count} challenges${python ? ', JavaScript and Python solutions pass' : ', JavaScript solutions pass'})`)
  }
  errors.forEach((e) => console.log(`    error: ${e}`))
  warnings.forEach((w) => console.log(`    warning: ${w}`))
  for (const [c, report] of perChallenge) {
    report.errors.forEach((e) => console.log(`    error: ${c.id || '(no id)'}: ${e}`))
    report.warnings.forEach((w) => console.log(`    warning: ${c.id || '(no id)'}: ${w}`))
  }
}

if (!python) console.log('\nNote: python3 was not found, so the Python solutions were not run.')
console.log(`\n${files.length - failed}/${files.length} challenge sets valid, ${total} challenges`)
process.exit(failed || runnerFailed ? 1 : 0)
