// Main-thread side of the Python runner. One worker holding Pyodide is shared by every
// editor on the page. A run that hits the time limit (or is stopped) terminates the worker,
// because a busy Python interpreter cannot be interrupted without cross-origin isolation;
// a fresh worker then reloads Pyodide from the browser cache in the background.
import { PYTHON_HARNESS } from './pythonHarness.js'
import { pythonWorkerSource } from './pyWorkerSource.js'

const LOAD_TIMEOUT = 120000
const LOADED_FLAG = 'recurse_python_loaded'

export const PYTHON_OFFLINE_MESSAGE =
  'Python could not be downloaded. It needs an internet connection the first time it loads, about 10 MB. Check your connection and try again.'

let worker = null
let ready = null
let active = null
let jobSeq = 0
let status = { state: 'idle' }
const listeners = new Set()

function setStatus(next) {
  status = next
  listeners.forEach((fn) => fn(status))
}

/** { state: 'idle' | 'loading' | 'restarting' | 'ready' | 'error', firstTime?, message?, offline? } */
export function getPythonStatus() {
  return status
}

export function subscribePython(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function loadedBefore() {
  try {
    return localStorage.getItem(LOADED_FLAG) === '1'
  } catch {
    return false
  }
}

function rememberLoaded() {
  try {
    localStorage.setItem(LOADED_FLAG, '1')
  } catch {
    // Storage unavailable; the loading message just stays generic.
  }
}

function onJobMessage(event) {
  const message = event.data || {}
  if (active && message.job === active.job) active.onMessage(message)
}

/** Start Pyodide if it is not running yet. Resolves with the worker when Python is ready. */
export function loadPython({ restarting = false } = {}) {
  if (ready) return ready
  if (typeof Worker === 'undefined') {
    setStatus({ state: 'error', message: 'This browser cannot run Python here.' })
    return Promise.reject(new Error('This browser cannot run Python here.'))
  }
  const url = URL.createObjectURL(new Blob([pythonWorkerSource()], { type: 'text/javascript' }))
  const w = new Worker(url)
  worker = w
  setStatus({ state: restarting ? 'restarting' : 'loading', firstTime: !loadedBefore() })
  ready = new Promise((resolve, reject) => {
    const fail = (message, offline = false) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      w.terminate()
      if (worker === w) {
        worker = null
        ready = null
      }
      setStatus({ state: 'error', message, offline })
      reject(new Error(message))
    }
    const timer = setTimeout(() => fail('Python is taking too long to load. Check your connection and try again.', true), LOAD_TIMEOUT)
    w.onmessage = (event) => {
      const message = event.data || {}
      if (message.t === 'ready') {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
        rememberLoaded()
        w.onmessage = onJobMessage
        setStatus({ state: 'ready', version: message.version })
        resolve(w)
      } else if (message.t === 'load-error') {
        const offline = message.network || (typeof navigator !== 'undefined' && navigator.onLine === false)
        fail(offline ? PYTHON_OFFLINE_MESSAGE : `Python could not start: ${message.message}`, offline)
      }
    }
    w.onerror = (event) => {
      event.preventDefault?.()
      fail(PYTHON_OFFLINE_MESSAGE, true)
    }
  })
  ready.catch(() => {})
  w.postMessage({ t: 'init', harness: PYTHON_HARNESS })
  return ready
}

/** Throw away the current interpreter (it may be stuck in a loop) and load a fresh one. */
function restartPython() {
  if (worker) worker.terminate()
  worker = null
  ready = null
  active = null
  loadPython({ restarting: true }).catch(() => {})
}

/** Try again after a failed download. */
export function retryPython() {
  if (status.state === 'error') return loadPython().catch(() => {})
  return ready || loadPython().catch(() => {})
}

/**
 * Run a Python job. Same options and result as runJavaScript in jsRunner.js.
 * Returns { promise, cancel }.
 */
export function runPython({ mode = 'script', code = '', fnName = '', tests = [], argTypes = [], returnType = null, timeLimit = 3000, onOutput, onTestStart, onTestResult, onError } = {}) {
  let cancel = () => {}
  const promise = new Promise((resolve) => {
    const job = ++jobSeq
    const state = { current: -1, started: false, fatal: null, error: null }
    let settled = false
    let timer = null
    const finish = (outcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (active?.job === job) active = null
      resolve({ fatal: state.fatal, error: state.error, ...outcome })
    }
    const arm = (ms) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (settled) return
        restartPython()
        finish({ status: 'timeout', timedOutTest: state.current })
      }, ms)
    }
    cancel = () => {
      if (settled) return
      if (state.started) restartPython()
      finish({ status: 'cancelled' })
    }
    const onMessage = (message) => {
      switch (message.t) {
        case 'start':
          state.started = true
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
    const start = () =>
      loadPython().then(
        (w) => {
          if (settled) return
          // One interpreter, one job: a run still going elsewhere on the page is stopped.
          if (active && active.job !== job) {
            active.cancel()
            start()
            return
          }
          active = { job, onMessage, cancel: () => cancel() }
          arm(timeLimit + 5000)
          w.postMessage({
            t: 'run',
            job,
            mode,
            code,
            fnName,
            testsJson: JSON.stringify(tests.map((args) => JSON.stringify(args))),
            argTypesJson: JSON.stringify(argTypes || []),
            returnType: returnType || null
          })
        },
        (error) => finish({ status: 'unavailable', fatal: { message: error.message, line: null, trace: [] } })
      )
    start()
  })
  return { promise, cancel: () => cancel() }
}
