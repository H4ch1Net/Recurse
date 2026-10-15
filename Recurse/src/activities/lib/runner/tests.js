// Pure helpers for challenges: which tests to run, grading raw runner results, friendly
// hints for common errors, starter code and scoring. Shared by the challenge UI and
// scripts/validate-challenges.mjs.
import { compareValues } from './compare.js'
import { normalizeArgTypes } from './jsSource.js'

export const LANGUAGES = ['javascript', 'python']
export const LANGUAGE_LABELS = { javascript: 'JavaScript', python: 'Python' }
export const DEFAULT_TIME_LIMIT = 3000
export const TIMEOUT_MESSAGE = 'Time limit exceeded, is there an infinite loop?'

/** Languages a challenge can be solved in (it names a function for them). */
export function languagesFor(challenge) {
  return LANGUAGES.filter((lang) => typeof challenge?.function?.[lang] === 'string' && challenge.function[lang])
}

export function starterFor(challenge, language) {
  const given = challenge?.starter?.[language]
  if (typeof given === 'string' && given.trim()) return given
  const name = challenge?.function?.[language] || 'solve'
  const params = (challenge?.params || []).join(', ')
  return language === 'python' ? `def ${name}(${params}):\n    pass\n` : `function ${name}(${params}) {\n  \n}\n`
}

export function timeLimitFor(challenge) {
  const n = Number(challenge?.timeLimit)
  return Number.isFinite(n) && n >= 500 ? Math.min(n, 20000) : DEFAULT_TIME_LIMIT
}

export function argTypesFor(challenge) {
  return normalizeArgTypes(challenge?.argTypes, challenge?.params || [])
}

/**
 * The tests for a run. scope 'visible' runs the examples, 'all' adds the hidden tests.
 * Each entry: { index, hidden, label, args, expected }.
 */
export function selectTests(challenge, scope = 'visible') {
  let visibleCount = 0
  let hiddenCount = 0
  const all = (challenge?.tests || []).map((test, index) => {
    const hidden = Boolean(test.hidden)
    const label = hidden ? `Hidden ${++hiddenCount}` : `Test ${++visibleCount}`
    return { index, hidden, label, args: Array.isArray(test.args) ? test.args : [], expected: test.expected }
  })
  return scope === 'all' ? all : all.filter((t) => !t.hidden)
}

/**
 * Turn a raw result from a worker into a graded result:
 * { status: 'passed' | 'failed' | 'error', passed, hasActual, actual, error, stdout, ms }.
 */
export function gradeResult(test, raw, compareMode = 'exact') {
  const base = {
    index: test.index,
    hidden: test.hidden,
    label: test.label,
    stdout: raw?.stdout || '',
    ms: typeof raw?.ms === 'number' ? raw.ms : null,
    hasActual: Boolean(raw?.hasActual),
    actual: raw?.actual,
    error: raw?.error || null
  }
  if (base.error) return { ...base, status: 'error', passed: false }
  if (!base.hasActual) return { ...base, status: 'error', passed: false, error: { message: 'No result came back from this test.', line: null, trace: [] } }
  const passed = compareValues(base.actual, test.expected, compareMode || 'exact')
  return { ...base, status: passed ? 'passed' : 'failed', passed }
}

export function timeoutResult(test, timeLimit = DEFAULT_TIME_LIMIT) {
  return {
    index: test.index,
    hidden: test.hidden,
    label: test.label,
    status: 'timeout',
    passed: false,
    hasActual: false,
    stdout: '',
    ms: timeLimit,
    error: { message: TIMEOUT_MESSAGE, line: null, trace: [] }
  }
}

export function skippedResult(test) {
  return { index: test.index, hidden: test.hidden, label: test.label, status: 'skipped', passed: false, hasActual: false, stdout: '', ms: null, error: null }
}

export function summarize(results) {
  const passed = results.filter((r) => r.passed).length
  return { passed, total: results.length, allPassed: results.length > 0 && passed === results.length }
}

/** Score for a full solve: hints and peeking at the solution lower it. */
export function challengeScore({ hintsUsed = 0, solutionViewed = false } = {}) {
  if (solutionViewed) return 0.25
  return Math.max(0.4, Math.round((1 - 0.15 * hintsUsed) * 100) / 100)
}

/** Short advice for the errors beginners hit most. Returns '' when nothing fits. */
export function errorHint(message, language) {
  const text = String(message || '')
  const rules =
    language === 'python'
      ? [
          [/IndentationError|TabError|unindent/, 'Python uses indentation for blocks. Indent the body of a def, if or loop by 4 spaces, and keep lines in the same block lined up.'],
          [/NameError: name '([^']+)'/, (m) => `Python does not know the name \`${m[1]}\`. Check the spelling, and make sure it is defined (or imported) before this line.`],
          [/expected ':'|SyntaxError: invalid syntax/, 'Check the end of the line above: def, if, for, while and else lines end with a colon.'],
          [/IndexError/, 'An index went past the end of a list. Check the loop bounds and empty inputs.'],
          [/KeyError/, 'You looked up a key that is not in the dict. Use `key in d` or `d.get(key)` to check first.'],
          [/RecursionError/, 'The function keeps calling itself. Check that the base case is reached.'],
          [/'NoneType' object/, 'Something is `None` here. A function without a `return` gives back `None`.'],
          [/TypeError: .*(takes|missing).*argument/, 'The number of arguments does not match. Keep the parameters from the starter code.'],
          [/TypeError: can only concatenate str/, 'Convert numbers to text with `str(n)` before joining them to a string.'],
          [/ZeroDivisionError/, 'A division by zero happened. Check for zero before dividing.'],
          [/ModuleNotFoundError/, 'Only the Python standard library is available here.']
        ]
      : [
          [/ReferenceError: (\S+) is not defined/, (m) => `JavaScript does not know \`${m[1]}\`. Check the spelling, and declare variables with let or const before using them.`],
          [/Cannot read propert(y|ies) of (undefined|null)/, (m) => `Something is \`${m[2]}\` here. Check array bounds, empty inputs, and that each function returns a value.`],
          [/is not a function/, 'You called something that is not a function. Check the name and what it holds at that point.'],
          [/Maximum call stack size exceeded|too much recursion/, 'The function keeps calling itself. Check that the base case is reached.'],
          [/Assignment to constant variable/, 'A const cannot be reassigned. Use let for values that change.'],
          [/has already been declared/, 'The same name is declared twice. Rename one, or reuse the existing variable without let or const.'],
          [/Unexpected end of input|missing \} |expected expression, got end of script/, 'A bracket or brace is not closed. Check that every {, ( and [ has a partner.'],
          [/Unexpected token 'export'|Cannot use import statement|import declarations may only appear/, 'import and export are not needed here. Just define the function.'],
          [/Invalid or unexpected token|unterminated string/i, 'Check for a quote that was opened and never closed.']
        ]
  for (const [pattern, advice] of rules) {
    const match = pattern.exec(text)
    if (match) return typeof advice === 'function' ? advice(match) : advice
  }
  return ''
}

/** Advice when a function seems to have forgotten its return statement. */
export function missingReturnHint(actual, expected, language) {
  if (language === 'python' && actual === null && expected !== null) return 'Your function returned `None`. Did you forget a `return` statement?'
  if (language !== 'python' && actual === undefined) return 'Your function returned `undefined`. Did you forget a `return` statement?'
  return ''
}
