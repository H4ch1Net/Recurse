// Main-thread side of the JavaScript runner. Every run gets a fresh dedicated worker built
// from a Blob: the learner's code cannot reach the page, globals never leak between runs,
// and a run that hits the time limit is simply terminated.
import { buildJsSource } from './jsSource.js'

const clampLine = (line, max) => Math.min(Math.max(1, line), Math.max(1, max))

/**
 * options:
 *   mode         'script' | 'tests'
 *   code, fnName, tests, argTypes, params, returnType   see jsSource.js
 *   timeLimit    ms for the program, or per test in tests mode
 *   onOutput(chunks)              streamed program output: [[stream, text], ...]
 *   onTestStart(i), onTestResult(i, raw)
 *   onError(error)                uncaught error while a program runs
 * Resolves with { status: 'ok' | 'error' | 'timeout' | 'cancelled' | 'unavailable',
 *   fatal?, error?, timedOutTest?, stdout? }. Never rejects. Returns { promise, cancel }.
 */
export function runJavaScript({ mode = 'script', code = '', fnName = '', tests = [], argTypes, params, returnType, timeLimit = 3000, onOutput, onTestStart, onTestResult, onError } = {}) {
  let cancel = () => {}
  const promise = new Promise((resolve) => {
    const built = buildJsSource({ code, mode, fnName, tests, argTypes, params, returnType, lockdown: true })
    let url
    let worker
    try {
      url = URL.createObjectURL(new Blob([built.source], { type: 'text/javascript' }))
      worker = new Worker(url)
    } catch {
      if (url) URL.revokeObjectURL(url)
      resolve({ status: 'unavailable', fatal: { message: 'This browser could not start the code runner.', line: null, trace: [] } })
      return
    }
    const state = { current: -1, fatal: null, error: null }
    let settled = false
    let timer = null
    const finish = (outcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve({ fatal: state.fatal, error: state.error, ...outcome })
    }
    const arm = (ms) => {
      clearTimeout(timer)
      timer = setTimeout(() => finish({ status: 'timeout', timedOutTest: state.current }), ms)
    }
    cancel = () => finish({ status: 'cancelled' })
    // Generous until the runtime says it started; then the real limit applies.
    arm(timeLimit + 4000)

    worker.onmessage = (event) => {
      const message = event.data || {}
      switch (message.t) {
        case 'start':
          arm(timeLimit)
          break
        case 'out':
          onOutput?.(message.chunks)
          break
        case 'test-start':
          state.current = message.i
          arm(timeLimit)
          onTestStart?.(message.i)
          break
        case 'test-result':
          onTestResult?.(message.i, message)
          break
        case 'fatal':
          state.fatal = message.error
          break
        case 'error':
          state.error = message.error
          onError?.(message.error)
          break
        case 'done':
          finish({ status: state.fatal || state.error ? 'error' : 'ok', stdout: message.stdout || '' })
          break
        default:
          break
      }
    }

    // Reaches here only for errors the runtime could not catch: a syntax error means the
    // script never started, and the browser reports the line in the combined source.
    worker.onerror = (event) => {
      event.preventDefault?.()
      const message = String(event.message || 'Your code could not run.').replace(/^Uncaught\s+/, '')
      const line = event.lineno ? clampLine(event.lineno - built.lineOffset, built.codeLines) : null
      state.fatal = { message, line, trace: [] }
      finish({ status: 'error', syntax: /SyntaxError/i.test(message) })
    }
  })
  return { promise, cancel: () => cancel() }
}
