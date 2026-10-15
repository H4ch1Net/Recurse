// Builds the complete source a JavaScript worker runs: the runtime, then the learner's code
// exactly as typed, then one line that hands control back to the runtime.
//
// Putting the learner's code into the worker script itself (instead of eval) means the
// browser reports syntax errors and stack traces against a real file, so line numbers are
// exact in every browser once the runtime's lines are subtracted.
import { formatValue } from './format.js'
import { jsRuntime } from './jsRuntime.js'

export const HARNESS_GLOBAL = '__recurseHarness'
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

const countLines = (text) => text.split('\n').length

/**
 * argTypes may be an array aligned with params (null for plain values) or an object keyed by
 * parameter name. Returns an array aligned with params.
 */
export function normalizeArgTypes(argTypes, params = []) {
  if (Array.isArray(argTypes)) return argTypes.map((t) => (typeof t === 'string' ? t : null))
  if (argTypes && typeof argTypes === 'object') return params.map((name) => (typeof argTypes[name] === 'string' ? argTypes[name] : null))
  return []
}

/**
 * options:
 *   code         learner source
 *   mode         'script' (run a program) or 'tests' (call a function once per test)
 *   fnName       function to call in tests mode
 *   tests        array of argument lists (plain JSON)
 *   argTypes, params, returnType   see docs/challenges.md
 *   href         the script's own URL as it appears in stack traces (defaults to self.location.href)
 *   lockdown     remove network and storage APIs from the worker scope
 * Returns { source, lineOffset, codeLines }: learner line n is line n + lineOffset of source.
 */
export function buildJsSource({ code = '', mode = 'script', fnName = '', tests = [], argTypes, params, returnType, href, lockdown = false } = {}) {
  const head = `self.${HARNESS_GLOBAL} = (${jsRuntime.toString()})(self, (${formatValue.toString()}), `
  // JSON.stringify never emits a raw newline, so the config adds no lines.
  const lineOffset = countLines(head)
  const codeLines = countLines(code)
  const config = {
    mode,
    fnName,
    tests: tests.map((args) => JSON.stringify(args)),
    argTypes: normalizeArgTypes(argTypes, params),
    returnType: returnType || null,
    offset: lineOffset,
    codeLines,
    lockdown: Boolean(lockdown)
  }
  if (href) config.href = href
  const prefix = `${head}${JSON.stringify(config)});\n`
  let suffix
  if (mode === 'tests') {
    const lookup = IDENTIFIER.test(fnName) ? `typeof ${fnName} === 'undefined' ? undefined : ${fnName}` : 'undefined'
    suffix = `\n;${HARNESS_GLOBAL}.finish(function () { return ${lookup} });\n`
  } else {
    suffix = `\n;${HARNESS_GLOBAL}.finish();\n`
  }
  return { source: prefix + code + suffix, lineOffset, codeLines }
}
