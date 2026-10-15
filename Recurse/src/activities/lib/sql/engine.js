// Main-thread side of the SQL lab. One worker holding sql.js is shared by every SQL lab on the
// page and kept for the session. It loads only when a lab first asks for it. Batches run one at
// a time; a batch that runs past the time limit (an endless recursive query) terminates the
// worker, and a fresh one reloads sql.js from the browser cache in the background.
import { sqlWorkerSource } from './worker.js'

export { SQLJS_VERSION, SQLJS_BASE_URL } from './worker.js'

const LOAD_TIMEOUT = 60000
const LOADED_FLAG = 'recurse_sqljs_loaded'
export const RUN_TIME_LIMIT = 5000
export const MAX_ROWS = 1000

export const SQL_OFFLINE_MESSAGE =
  'SQLite could not be downloaded. The SQL lab needs an internet connection the first time it loads, about 700 KB. Check your connection and try again.'
export const SQL_TIMEOUT_MESSAGE =
  'Your SQL ran for more than 5 seconds and was stopped. Look for a recursive query with no stopping condition, or a join with no ON that multiplies every row by every other row.'

let worker = null
let ready = null
let pending = null
let jobSeq = 0
let queue = Promise.resolve()
let status = { state: 'idle' }
const listeners = new Set()

function setStatus(next) {
  status = next
  listeners.forEach((fn) => fn(status))
}

/** { state: 'idle' | 'loading' | 'restarting' | 'ready' | 'error', firstTime?, message?, offline?, version? } */
export function getSqlStatus() {
  return status
}

export function subscribeSql(listener) {
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

function onMessage(event) {
  const message = event.data || {}
  if (message.t !== 'done' || !pending || pending.job !== message.job) return
  const job = pending
  pending = null
  job.finish(message.error ? { status: 'error', message: message.error } : { status: 'ok', results: message.results })
}

/** Start sql.js if it is not running yet. Resolves with the worker when SQLite is ready. */
export function loadSqlEngine({ restarting = false } = {}) {
  if (ready) return ready
  if (typeof Worker === 'undefined') {
    setStatus({ state: 'error', message: 'This browser cannot run the SQL lab.' })
    return Promise.reject(new Error('This browser cannot run the SQL lab.'))
  }
  const url = URL.createObjectURL(new Blob([sqlWorkerSource()], { type: 'text/javascript' }))
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
    const timer = setTimeout(() => fail('SQLite is taking too long to load. Check your connection and try again.', true), LOAD_TIMEOUT)
    w.onmessage = (event) => {
      const message = event.data || {}
      if (message.t === 'ready') {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
        rememberLoaded()
        w.onmessage = onMessage
        setStatus({ state: 'ready', version: message.version })
        resolve(w)
      } else if (message.t === 'load-error') {
        const offline = message.network || (typeof navigator !== 'undefined' && navigator.onLine === false)
        fail(offline ? SQL_OFFLINE_MESSAGE : `SQLite could not start: ${message.message}`, offline)
      }
    }
    w.onerror = (event) => {
      event.preventDefault?.()
      fail(SQL_OFFLINE_MESSAGE, true)
    }
  })
  ready.catch(() => {})
  w.postMessage({ t: 'init' })
  return ready
}

/** Try again after a failed download. */
export function retrySqlEngine() {
  return loadSqlEngine().catch(() => {})
}

function restartSqlEngine() {
  if (worker) worker.terminate()
  worker = null
  ready = null
  pending = null
  loadSqlEngine({ restarting: true }).catch(() => {})
}

function execute(runs, { timeLimit, maxRows }) {
  return loadSqlEngine().then(
    (w) =>
      new Promise((resolve) => {
        const job = ++jobSeq
        const timer = setTimeout(() => {
          if (pending?.job !== job) return
          restartSqlEngine()
          resolve({ status: 'timeout', message: SQL_TIMEOUT_MESSAGE })
        }, timeLimit)
        pending = {
          job,
          finish: (outcome) => {
            clearTimeout(timer)
            resolve(outcome)
          }
        }
        w.postMessage({ t: 'run', job, runs, maxRows })
      }),
    (error) => ({ status: 'unavailable', message: error.message })
  )
}

/**
 * Run a batch of { seed, setup, sql, probes, checks } (see executeRuns in worker.js), each on a
 * fresh database. Resolves with { status: 'ok', results } or { status: 'timeout' | 'unavailable'
 * | 'error', message }. Batches queue up and run one at a time.
 */
export function runSqlBatch(runs, { timeLimit = RUN_TIME_LIMIT, maxRows = MAX_ROWS } = {}) {
  const job = queue.then(() => execute(runs, { timeLimit, maxRows }))
  queue = job.catch(() => {})
  return job
}
