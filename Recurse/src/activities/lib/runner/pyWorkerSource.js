// Source for the Python worker. It downloads Pyodide from the jsDelivr CDN on first use
// (importScripts), runs the shared harness once, then executes jobs. The service worker
// only handles same-origin requests, so these CDN files are never put in the app cache;
// the browser's HTTP cache keeps them after the first download.
//
// pyWorkerMain is serialized with Function.prototype.toString: keep it self-contained and
// in plain syntax, like jsRuntime.

export const PYODIDE_VERSION = '0.26.4'
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

export function pyWorkerMain(scope, indexURL) {
  var api = null
  var job = null
  var pending = []
  var total = 0
  var truncated = false
  var lastFlush = Date.now()
  var LIMIT = 100000

  function post(message) {
    scope.postMessage(message)
  }

  function flush() {
    if (pending.length) {
      post({ t: 'out', job: job, chunks: pending })
      pending = []
    }
    lastFlush = Date.now()
  }

  function push(stream, text) {
    if (truncated) return
    if (total + text.length > LIMIT) {
      pending.push([stream, text.slice(0, Math.max(0, LIMIT - total))])
      pending.push(['info', '\n[output stopped after ' + LIMIT + ' characters]\n'])
      truncated = true
      flush()
      return
    }
    total += text.length
    pending.push([stream, text])
    if (Date.now() - lastFlush > 40) flush()
  }

  function emit(kind, payload) {
    if (kind === 'out' || kind === 'err') {
      push(kind, String(payload))
      return
    }
    var data = payload ? JSON.parse(payload) : null
    if (kind === 'test-start') post({ t: 'test-start', job: job, i: data })
    else if (kind === 'test-result') {
      data.t = 'test-result'
      data.job = job
      post(data)
    } else if (kind === 'fatal') post({ t: 'fatal', job: job, error: data })
    else if (kind === 'error') {
      flush()
      post({ t: 'error', job: job, error: data })
    }
  }

  function init(harness) {
    try {
      scope.importScripts(indexURL + 'pyodide.js')
    } catch (e) {
      post({ t: 'load-error', network: true, message: String((e && e.message) || e) })
      return
    }
    scope
      .loadPyodide({ indexURL: indexURL })
      .then(function (pyodide) {
        var ns = pyodide.globals.get('dict')()
        pyodide.runPython(harness, { globals: ns })
        api = { runScript: ns.get('run_script'), runTests: ns.get('run_tests') }
        post({ t: 'ready', version: pyodide.version })
      })
      .catch(function (e) {
        var message = String((e && e.message) || e)
        post({ t: 'load-error', network: /fetch|network|load|import/i.test(message), message: message })
      })
  }

  function run(message) {
    job = message.job
    pending = []
    total = 0
    truncated = false
    lastFlush = Date.now()
    post({ t: 'start', job: job })
    try {
      if (message.mode === 'tests') {
        var out = api.runTests(message.code, message.fnName, message.testsJson, message.argTypesJson, message.returnType || null, emit)
        flush()
        var extra = out ? JSON.parse(out) : {}
        post({ t: 'done', job: job, stdout: extra.stdout || '' })
      } else {
        api.runScript(message.code, emit)
        flush()
        post({ t: 'done', job: job })
      }
    } catch (e) {
      flush()
      post({ t: 'fatal', job: job, error: { message: String((e && e.message) || e), line: null, trace: [] } })
      post({ t: 'done', job: job })
    }
  }

  scope.onmessage = function (event) {
    var message = event.data || {}
    if (message.t === 'init') init(message.harness)
    else if (message.t === 'run' && api) run(message)
  }
}

export function pythonWorkerSource() {
  return `(${pyWorkerMain.toString()})(self, ${JSON.stringify(PYODIDE_INDEX_URL)});\n`
}
