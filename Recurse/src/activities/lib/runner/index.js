// The in-browser code runner: one entry point for programs and one for challenge tests,
// in JavaScript (a fresh Blob worker per run) or Python (Pyodide in a shared worker).
import { runJavaScript } from './jsRunner.js'
import { runPython } from './pyRunner.js'
import { argTypesFor, gradeResult, selectTests, skippedResult, timeLimitFor, timeoutResult, DEFAULT_TIME_LIMIT } from './tests.js'

export { getPythonStatus, subscribePython, loadPython, retryPython, PYTHON_OFFLINE_MESSAGE } from './pyRunner.js'
export { DEFAULT_TIME_LIMIT, TIMEOUT_MESSAGE, LANGUAGES, LANGUAGE_LABELS } from './tests.js'

const runnerFor = (language) => (language === 'python' ? runPython : runJavaScript)

/**
 * Run a program and stream its output.
 * onOutput(chunks) gets [[stream, text], ...] with stream 'out' | 'err' | 'warn' | 'info'.
 * Resolves with { status, fatal, error, ms }. Returns { promise, cancel }.
 */
export function runProgram({ language = 'javascript', code = '', timeLimit = DEFAULT_TIME_LIMIT, onOutput, onError } = {}) {
  const started = performance.now()
  const job = runnerFor(language)({ mode: 'script', code, timeLimit, onOutput, onError })
  return {
    cancel: job.cancel,
    promise: job.promise.then((result) => ({ ...result, ms: Math.round(performance.now() - started) }))
  }
}

/**
 * Run a challenge's tests. scope: 'visible' (Run) or 'all' (Submit).
 * onTestStart(test) fires as each test begins; onResult(result) fires with each graded
 * result as it arrives. Resolves with { status, fatal, results, stdout } where results is
 * one graded result per selected test, in order (timeouts and tests that never ran included).
 */
export function runChallengeTests({ challenge, language = 'javascript', code = '', scope = 'visible', onTestStart, onResult } = {}) {
  const tests = selectTests(challenge, scope)
  const timeLimit = timeLimitFor(challenge)
  const results = new Array(tests.length).fill(null)
  const job = runnerFor(language)({
    mode: 'tests',
    code,
    fnName: challenge?.function?.[language] || '',
    tests: tests.map((t) => t.args),
    argTypes: argTypesFor(challenge),
    params: challenge?.params || [],
    returnType: challenge?.returnType || null,
    timeLimit,
    onTestStart: (i) => tests[i] && onTestStart?.(tests[i]),
    onTestResult: (i, raw) => {
      if (!tests[i]) return
      results[i] = gradeResult(tests[i], raw, challenge?.compare)
      onResult?.(results[i])
    }
  })
  const promise = job.promise.then((outcome) => {
    let timedOut = null
    for (let i = 0; i < tests.length; i++) {
      if (results[i]) continue
      if (outcome.status === 'timeout' && i === outcome.timedOutTest) {
        results[i] = timeoutResult(tests[i], timeLimit)
        timedOut = results[i]
        onResult?.(results[i])
      } else {
        results[i] = skippedResult(tests[i])
      }
    }
    // A timeout before any test started means the code itself never finished loading.
    const fatal = outcome.fatal || (outcome.status === 'timeout' && !timedOut ? { message: 'Time limit exceeded, is there an infinite loop? Your code never finished loading, so no test ran.', line: null, trace: [] } : null)
    return { status: outcome.status, fatal, results, stdout: outcome.stdout || '', tests }
  })
  return { promise, cancel: job.cancel, tests }
}
