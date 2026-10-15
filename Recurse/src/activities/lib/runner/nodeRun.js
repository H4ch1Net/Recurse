// NODE ONLY. Runs the exact worker sources in Node: JavaScript in a vm context, Python with
// python3. Used by the Vitest tests and scripts/validate-challenges.mjs. App code must never
// import this file (it pulls in node:vm and node:child_process).
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { buildJsSource } from './jsSource.js'
import { PYTHON_HARNESS } from './pythonHarness.js'

const FILENAME = 'solution.js'

/**
 * Run JavaScript the way the worker would. Resolves with
 * { status: 'ok' | 'error' | 'timeout', messages, fatal, syntax }.
 */
export async function runJsInNode({ code, mode = 'tests', fnName, tests = [], argTypes, params, returnType, timeout = 3000 }) {
  const { source, lineOffset, codeLines } = buildJsSource({ code, mode, fnName, tests, argTypes, params, returnType, href: FILENAME })
  const messages = []
  let done = false
  const sandbox = {
    postMessage: (message) => {
      const copy = structuredClone(message)
      messages.push(copy)
      if (copy.t === 'done') done = true
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
    queueMicrotask,
    location: { href: FILENAME }
  }
  sandbox.self = sandbox
  vm.createContext(sandbox)
  let script
  try {
    script = new vm.Script(source, { filename: FILENAME })
  } catch (error) {
    const match = new RegExp(`${FILENAME}:(\\d+)`).exec(String(error.stack))
    const raw = match ? Number(match[1]) - lineOffset : null
    const line = raw === null ? null : Math.min(Math.max(1, raw), codeLines)
    return { status: 'error', syntax: true, messages, fatal: { message: `${error.name}: ${error.message}`, line, trace: [] } }
  }
  try {
    script.runInContext(sandbox, { timeout })
  } catch (error) {
    if (error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return { status: 'timeout', messages }
    // An error thrown by the learner's top-level code (a worker reports it as an event).
    const harness = sandbox.__recurseHarness
    const fatal = harness ? harness.describe(error) : { message: String(error), line: null, trace: [] }
    return { status: 'error', messages, fatal }
  }
  const deadline = Date.now() + timeout
  while (!done && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 2))
  if (!done) return { status: 'timeout', messages }
  const fatal = messages.find((m) => m.t === 'fatal')?.error || null
  const error = messages.find((m) => m.t === 'error')?.error || null
  return { status: fatal || error ? 'error' : 'ok', messages, fatal, error }
}

/** Test results from runner messages, indexed like the tests. */
export function resultsFromMessages(messages) {
  return messages.filter((m) => m.t === 'test-result')
}

export function hasPython() {
  try {
    return spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
}

const DRIVER = String.raw`
import json as _json
import signal as _signal
import sys as _sys

_jobs = _json.load(_sys.stdin)
_out = _sys.stdout


class _Timeout(BaseException):
    pass


def _alarm(signum, frame):
    raise _Timeout()


_has_alarm = hasattr(_signal, 'SIGALRM')
if _has_alarm:
    _signal.signal(_signal.SIGALRM, _alarm)

for _job in _jobs:
    def _emit(kind, payload, _id=_job['id']):
        _out.write(_json.dumps({'job': _id, 'kind': kind, 'payload': payload}) + '\n')
        _out.flush()
    if _has_alarm:
        _signal.setitimer(_signal.ITIMER_REAL, _job.get('timeout', 5))
    try:
        if _job['mode'] == 'syntax':
            _emit('syntax', check_syntax(_job['code']))
        elif _job['mode'] == 'script':
            run_script(_job['code'], _emit)
        else:
            _result = run_tests(_job['code'], _job['fn'], _json.dumps([_json.dumps(a) for a in _job['tests']]), _json.dumps(_job.get('argTypes') or []), _job.get('returnType'), _emit)
            _emit('setup', _result)
    except _Timeout:
        _emit('timeout', '')
    finally:
        if _has_alarm:
            _signal.setitimer(_signal.ITIMER_REAL, 0)
    _emit('done', '')
`

/**
 * Run many Python jobs in one python3 process.
 * job: { id, mode: 'tests' | 'script' | 'syntax', code, fn, tests, argTypes, returnType, timeout (s) }
 * Returns Map id -> [{ kind, payload }] (payloads already JSON-parsed where they are JSON),
 * or { error } when python3 itself failed.
 */
export function runPythonJobs(jobs, { timeout = 120000 } = {}) {
  const proc = spawnSync('python3', ['-I', '-c', `${PYTHON_HARNESS}\n${DRIVER}`], {
    input: JSON.stringify(jobs),
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024
  })
  if (proc.error) return { error: proc.error.message }
  if (proc.status !== 0) return { error: (proc.stderr || '').trim() || `python3 exited with ${proc.status}` }
  const byJob = new Map(jobs.map((job) => [job.id, []]))
  for (const line of proc.stdout.split('\n')) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    let payload = event.payload
    if (typeof payload === 'string' && payload && event.kind !== 'out' && event.kind !== 'err') {
      try {
        payload = JSON.parse(payload)
      } catch {
        // Plain text payload.
      }
    }
    byJob.get(event.job)?.push({ kind: event.kind, payload })
  }
  return { byJob }
}
