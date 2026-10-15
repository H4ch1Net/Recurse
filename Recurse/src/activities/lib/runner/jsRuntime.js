// The runtime that wraps learner JavaScript inside the worker: console capture with output
// limits, ListNode and TreeNode, argument and result conversion, error locations relative
// to the learner's code, timer tracking (so a program counts as finished only when its
// timers are done) and the test loop.
//
// jsRuntime is serialized into the worker source with Function.prototype.toString, so it
// must stay self-contained: it may only use its arguments and standard globals. Keep the
// syntax plain (var, function, no optional chaining, no class fields) so no build step ever
// needs to inject a helper into it. Node's vm runs the very same source in the tests and in
// scripts/validate-challenges.mjs.
//
// Messages posted (all plain data):
//   { t: 'start' }
//   { t: 'out', chunks: [[stream, text], ...] }        stream: out | err | warn | info
//   { t: 'test-start', i }
//   { t: 'test-result', i, ms, stdout, hasActual, actual, error }
//   { t: 'fatal', error }        code failed to load, or the function is missing
//   { t: 'error', error }        uncaught error while a program ran (script mode)
//   { t: 'done', stdout }
// error: { message, line, trace: ['line 3, in twoSum', ...] }

export function jsRuntime(scope, formatValue, config) {
  var post = scope.postMessage.bind(scope)
  var perf = scope.performance
  var now = perf && typeof perf.now === 'function' ? function () { return perf.now() } : function () { return Date.now() }
  var realSetTimeout = scope.setTimeout.bind(scope)
  var realClearTimeout = scope.clearTimeout.bind(scope)
  var realSetInterval = scope.setInterval.bind(scope)
  var realClearInterval = scope.clearInterval.bind(scope)
  var href = String(config.href || (scope.location && scope.location.href) || '')
  var offset = config.offset || 0
  var codeLines = config.codeLines || 0
  var TOTAL_LIMIT = config.outputLimit || 100000
  var TEST_LIMIT = config.testOutputLimit || 10000
  var phase = 'setup'
  var failed = false

  // ---- Output ---------------------------------------------------------------------------

  var pending = []
  var total = 0
  var truncated = false
  var lastFlush = now()
  var sink = null
  var setupSink = config.mode === 'tests' ? newSink() : null

  function newSink() {
    return { parts: [], size: 0, cut: false }
  }

  function flush() {
    if (pending.length) {
      post({ t: 'out', chunks: pending })
      pending = []
    }
    lastFlush = now()
  }

  function emit(stream, text) {
    var target = sink || setupSink
    if (target) {
      if (target.size < TEST_LIMIT) {
        target.parts.push(text)
        target.size += text.length
      } else if (!target.cut) {
        target.cut = true
        target.parts.push('\n[more output was cut off]\n')
      }
      return
    }
    if (truncated) return
    if (total + text.length > TOTAL_LIMIT) {
      text = text.slice(0, Math.max(0, TOTAL_LIMIT - total))
      truncated = true
      pending.push([stream, text])
      pending.push(['info', '\n[output stopped after ' + TOTAL_LIMIT + ' characters]\n'])
      flush()
      return
    }
    total += text.length
    pending.push([stream, text])
    if (now() - lastFlush > 40) flush()
  }

  function takeSink(s) {
    if (!s) return ''
    return s.parts.join('')
  }

  function show(args) {
    var parts = []
    for (var i = 0; i < args.length; i++) {
      parts.push(typeof args[i] === 'string' ? args[i] : formatValue(args[i], { language: 'javascript' }))
    }
    return parts.join(' ')
  }

  var groupIndent = ''
  var counts = {}
  var timers = {}
  function writer(stream) {
    return function () {
      var text = show(arguments)
      if (groupIndent) text = groupIndent + text.split('\n').join('\n' + groupIndent)
      emit(stream, text + '\n')
    }
  }
  var fakeConsole = {
    log: writer('out'),
    info: writer('out'),
    debug: writer('out'),
    trace: writer('out'),
    warn: writer('warn'),
    error: writer('err'),
    dir: writer('out'),
    table: writer('out'),
    assert: function (condition) {
      if (condition) return
      var rest = Array.prototype.slice.call(arguments, 1)
      emit('err', 'Assertion failed' + (rest.length ? ': ' + show(rest) : '') + '\n')
    },
    group: function () {
      if (arguments.length) writer('out').apply(null, arguments)
      groupIndent += '  '
    },
    groupEnd: function () {
      groupIndent = groupIndent.slice(2)
    },
    count: function (label) {
      var key = label === undefined ? 'default' : String(label)
      counts[key] = (counts[key] || 0) + 1
      emit('out', key + ': ' + counts[key] + '\n')
    },
    countReset: function (label) {
      counts[label === undefined ? 'default' : String(label)] = 0
    },
    time: function (label) {
      timers[label === undefined ? 'default' : String(label)] = now()
    },
    timeEnd: function (label) {
      var key = label === undefined ? 'default' : String(label)
      if (timers[key] === undefined) return
      emit('out', key + ': ' + (Math.round((now() - timers[key]) * 1000) / 1000) + ' ms\n')
      delete timers[key]
    },
    clear: function () {}
  }
  fakeConsole.groupCollapsed = fakeConsole.group
  fakeConsole.timeLog = fakeConsole.timeEnd

  function define(name, value) {
    try {
      Object.defineProperty(scope, name, { value: value, configurable: true, writable: true, enumerable: false })
    } catch (e) {
      // Not definable here; leave it.
    }
  }

  define('console', fakeConsole)

  // ---- Linked lists and trees ---------------------------------------------------------

  function ListNode(val, next) {
    this.val = val === undefined ? 0 : val
    this.next = next === undefined ? null : next
  }
  function TreeNode(val, left, right) {
    this.val = val === undefined ? 0 : val
    this.left = left === undefined ? null : left
    this.right = right === undefined ? null : right
  }
  // Plain assignment keeps the globals configurable, so learner code may declare its own
  // ListNode or TreeNode without a "has already been declared" error.
  scope.ListNode = ListNode
  scope.TreeNode = TreeNode

  function toList(values) {
    if (!Array.isArray(values)) return values === undefined ? null : values
    var head = null
    for (var i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head)
    return head
  }

  function toTree(values) {
    if (!Array.isArray(values) || !values.length || values[0] === null || values[0] === undefined) return null
    var root = new TreeNode(values[0])
    var queue = [root]
    var head = 0
    var i = 1
    while (head < queue.length && i < values.length) {
      var node = queue[head++]
      if (i < values.length && values[i] !== null && values[i] !== undefined) {
        node.left = new TreeNode(values[i])
        queue.push(node.left)
      }
      i++
      if (i < values.length && values[i] !== null && values[i] !== undefined) {
        node.right = new TreeNode(values[i])
        queue.push(node.right)
      }
      i++
    }
    return root
  }

  function ResultError(message) {
    this.name = 'ResultError'
    this.message = message
  }

  function fromList(head) {
    if (head === null || head === undefined) return []
    if (typeof head !== 'object' || !('val' in head)) {
      throw new ResultError('Expected the head node of a linked list (a ListNode or null), but got ' + formatValue(head, { language: 'javascript', maxLength: 80 }) + '.')
    }
    var out = []
    var seen = new Set()
    var node = head
    while (node !== null && node !== undefined) {
      if (seen.has(node)) throw new ResultError('Your linked list has a cycle: a node points back to an earlier node.')
      seen.add(node)
      out.push(toPlain(node.val, 0, []))
      node = node.next
      if (out.length > 100000) throw new ResultError('Your linked list is longer than 100,000 nodes. Is a pointer wired wrong?')
    }
    return out
  }

  function fromTree(root) {
    if (root === null || root === undefined) return []
    if (typeof root !== 'object' || !('val' in root)) {
      throw new ResultError('Expected the root node of a tree (a TreeNode or null), but got ' + formatValue(root, { language: 'javascript', maxLength: 80 }) + '.')
    }
    var out = []
    var queue = [root]
    var seen = new Set()
    for (var i = 0; i < queue.length; i++) {
      var node = queue[i]
      if (node === null || node === undefined) {
        out.push(null)
        continue
      }
      if (seen.has(node)) throw new ResultError('Your tree has a cycle: a node points back to an ancestor.')
      seen.add(node)
      out.push(toPlain(node.val, 0, []))
      queue.push(node.left === undefined ? null : node.left, node.right === undefined ? null : node.right)
      if (queue.length > 200000) throw new ResultError('Your tree has more than 100,000 nodes. Is a pointer wired wrong?')
    }
    while (out.length && out[out.length - 1] === null) out.pop()
    return out
  }

  /** Make a value safe to post (structured clone) while keeping it comparable. */
  function toPlain(v, depth, seen) {
    if (v === null || v === undefined) return v
    var t = typeof v
    if (t === 'number' || t === 'string' || t === 'boolean' || t === 'bigint') return v
    if (t === 'function' || t === 'symbol') return formatValue(v)
    if (seen.indexOf(v) >= 0) return '[Circular]'
    if (depth > 64) return '[Too deep]'
    var name = ''
    try {
      var proto = Object.getPrototypeOf(v)
      name = proto && proto.constructor && proto.constructor.name ? proto.constructor.name : ''
    } catch (e) {
      name = ''
    }
    if ((name === 'ListNode' && 'next' in v) || (name === 'TreeNode' && 'left' in v)) return formatValue(v)
    seen.push(v)
    try {
      var out
      if (Array.isArray(v)) {
        out = new Array(v.length)
        for (var i = 0; i < v.length; i++) out[i] = toPlain(v[i], depth + 1, seen)
        return out
      }
      if (ArrayBuffer.isView(v) && typeof v.length === 'number') return Array.prototype.slice.call(v)
      if (v instanceof Set) {
        out = []
        v.forEach(function (x) { out.push(toPlain(x, depth + 1, seen)) })
        return out
      }
      if (v instanceof Map) {
        out = {}
        v.forEach(function (x, k) { out[typeof k === 'string' ? k : formatValue(k)] = toPlain(x, depth + 1, seen) })
        return out
      }
      if (v instanceof Date) return isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString()
      if (v instanceof Error) return v.name + ': ' + v.message
      out = {}
      var keys = Object.keys(v)
      for (var j = 0; j < keys.length; j++) out[keys[j]] = toPlain(v[keys[j]], depth + 1, seen)
      return out
    } finally {
      seen.pop()
    }
  }

  function convertArg(value, kind) {
    if (kind === 'list') return toList(value)
    if (kind === 'tree') return toTree(value)
    if (kind === 'list[]') return Array.isArray(value) ? value.map(toList) : value
    if (kind === 'tree[]') return Array.isArray(value) ? value.map(toTree) : value
    return value
  }

  function convertResult(value, kind) {
    if (kind === 'list') return fromList(value)
    if (kind === 'tree') return fromTree(value)
    if (kind === 'list[]' || kind === 'tree[]') {
      if (!Array.isArray(value)) throw new ResultError('Expected an array of ' + (kind === 'list[]' ? 'lists' : 'trees') + '.')
      return value.map(kind === 'list[]' ? fromList : fromTree)
    }
    return toPlain(value, 0, [])
  }

  // ---- Errors -----------------------------------------------------------------------------

  function frames(err) {
    var stack = ''
    try {
      stack = err && typeof err === 'object' && typeof err.stack === 'string' ? err.stack : ''
    } catch (e) {
      stack = ''
    }
    var out = []
    if (!href || !stack) return out
    var lines = stack.split('\n')
    for (var i = 0; i < lines.length; i++) {
      var text = lines[i]
      var at = text.lastIndexOf(href + ':')
      if (at < 0) continue
      var m = /^:(\d+):(\d+)/.exec(text.slice(at + href.length))
      if (!m) continue
      var line = Number(m[1]) - offset
      if (line < 1 || line > codeLines) continue
      var chrome = /^\s*at\s+(?:async\s+)?(.+?)\s+\(/.exec(text)
      var gecko = /^\s*([^@\s]*)@/.exec(text)
      var fn = chrome ? chrome[1] : gecko ? gecko[1] : ''
      fn = fn.replace(/^Object\./, '').replace(/^new /, '')
      if (fn === 'eval' || fn === 'global code' || fn === 'Object.<anonymous>') fn = ''
      out.push({ line: line, fn: fn })
    }
    return out
  }

  function describe(err) {
    var message
    if (err instanceof ResultError) message = err.message
    else if (err && typeof err === 'object' && typeof err.message === 'string') message = (err.name || 'Error') + ': ' + err.message
    else message = 'Uncaught ' + formatValue(err, { language: 'javascript', maxLength: 300 })
    var found = err instanceof ResultError ? [] : frames(err)
    var trace = []
    for (var i = 0; i < found.length && i < 8; i++) trace.push('line ' + found[i].line + (found[i].fn ? ', in ' + found[i].fn : ''))
    return { message: message, line: found.length ? found[0].line : null, trace: trace }
  }

  function safePost(message) {
    try {
      post(message)
    } catch (e) {
      // The value could not be cloned; send its text instead.
      if ('actual' in message) message.actual = formatValue(message.actual)
      try {
        post(message)
      } catch (e2) {
        post({ t: 'fatal', error: { message: 'Could not send the result back: ' + String(e2 && e2.message), line: null, trace: [] } })
      }
    }
  }

  // ---- Timers: a program is done when its code has run and no timers are left ------------

  var active = new Set()
  var doneScheduled = false

  function guarded(fn, args) {
    try {
      fn.apply(undefined, args)
    } catch (e) {
      reportUncaught(e)
    }
  }

  define('setTimeout', function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2)
    if (typeof fn !== 'function') return 0
    var id = realSetTimeout(function () {
      active.delete(id)
      guarded(fn, args)
      checkIdle()
    }, ms)
    active.add(id)
    return id
  })
  define('clearTimeout', function (id) {
    realClearTimeout(id)
    active.delete(id)
    checkIdle()
  })
  define('setInterval', function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2)
    if (typeof fn !== 'function') return 0
    var id = realSetInterval(function () { guarded(fn, args) }, ms)
    active.add(id)
    return id
  })
  define('clearInterval', function (id) {
    realClearInterval(id)
    active.delete(id)
    checkIdle()
  })

  function checkIdle() {
    if (phase !== 'waiting' || active.size || doneScheduled) return
    doneScheduled = true
    realSetTimeout(function () {
      doneScheduled = false
      if (phase === 'waiting' && !active.size) finishAll()
    }, 0)
  }

  function finishAll() {
    if (phase === 'done') return
    phase = 'done'
    var stdout = takeSink(setupSink)
    setupSink = null
    flush()
    post({ t: 'done', stdout: stdout })
  }

  function reportUncaught(err) {
    var info = describe(err)
    if (phase === 'setup' && config.mode === 'tests') {
      failed = true
      post({ t: 'fatal', error: info })
      finishAll()
      return
    }
    if (phase === 'done') return
    failed = true
    flush()
    post({ t: 'error', error: info })
    if (config.mode === 'script') {
      phase = 'waiting'
      checkIdle()
    }
  }

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('error', function (event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault()
      if (event && event.error !== undefined && event.error !== null) {
        reportUncaught(event.error)
        return
      }
      var line = event && event.lineno ? event.lineno - offset : null
      var info = {
        message: String((event && event.message) || 'Error').replace(/^Uncaught\s+/, ''),
        line: line && line >= 1 && line <= codeLines ? line : null,
        trace: []
      }
      if (config.mode === 'tests' && phase === 'setup') {
        failed = true
        post({ t: 'fatal', error: info })
        finishAll()
      } else {
        failed = true
        post({ t: 'error', error: info })
      }
    })
    scope.addEventListener('unhandledrejection', function (event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault()
      reportUncaught(event ? event.reason : undefined)
    })
  }

  // Learner code has no business with the network or the app's storage.
  if (config.lockdown) {
    var blocked = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'postMessage', 'close', 'Worker', 'SharedWorker', 'BroadcastChannel']
    for (var b = 0; b < blocked.length; b++) define(blocked[b], undefined)
  }

  post({ t: 'start' })

  // ---- Tests ------------------------------------------------------------------------------

  function argKind(j) {
    return config.argTypes && config.argTypes[j] ? config.argTypes[j] : null
  }

  function runTests(fn) {
    phase = 'tests'
    runFrom(fn, 0)
  }

  function runFrom(fn, start) {
    for (var i = start; i < config.tests.length; i++) {
      var pendingResult = runOne(fn, i)
      if (pendingResult) {
        pendingResult.then(function () { runFrom(fn, i + 1) })
        return
      }
    }
    finishAll()
  }

  function runOne(fn, i) {
    post({ t: 'test-start', i: i })
    var args
    try {
      args = JSON.parse(config.tests[i])
      for (var j = 0; j < args.length; j++) args[j] = convertArg(args[j], argKind(j))
    } catch (e) {
      finishTest(i, 0, { error: { message: 'Could not prepare this test: ' + String(e && e.message), line: null, trace: [] } })
      return null
    }
    sink = newSink()
    var started = now()
    var value
    try {
      value = fn.apply(undefined, args)
    } catch (e) {
      finishTest(i, now() - started, { error: describe(e) })
      return null
    }
    if (value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function') {
      return Promise.resolve(value).then(
        function (resolved) { finishValue(i, started, resolved) },
        function (e) { finishTest(i, now() - started, { error: describe(e) }) }
      )
    }
    finishValue(i, started, value)
    return null
  }

  function finishValue(i, started, value) {
    var ms = now() - started
    try {
      var actual = convertResult(value, config.returnType)
      finishTest(i, ms, { hasActual: true, actual: actual })
    } catch (e) {
      finishTest(i, ms, { error: describe(e) })
    }
  }

  function finishTest(i, ms, data) {
    var stdout = takeSink(sink)
    sink = null
    var message = { t: 'test-result', i: i, ms: Math.round(ms * 100) / 100, stdout: stdout, hasActual: Boolean(data.hasActual) }
    if (data.hasActual) message.actual = data.actual
    if (data.error) message.error = data.error
    safePost(message)
  }

  return {
    ListNode: ListNode,
    TreeNode: TreeNode,
    toList: toList,
    toTree: toTree,
    fromList: fromList,
    fromTree: fromTree,
    toPlain: function (v) { return toPlain(v, 0, []) },
    convertArg: convertArg,
    convertResult: convertResult,
    describe: describe,
    /** Called by the code appended after the learner's code. */
    finish: function (getFunction) {
      if (phase !== 'setup') return
      if (config.mode !== 'tests') {
        phase = 'waiting'
        checkIdle()
        return
      }
      if (failed) return
      var fn
      try {
        fn = getFunction()
      } catch (e) {
        fn = undefined
      }
      if (typeof fn !== 'function') {
        post({ t: 'fatal', error: { message: 'Could not find a function named ' + config.fnName + '. Keep the function name from the starter code.', line: null, trace: [] } })
        finishAll()
        return
      }
      runTests(fn)
    }
  }
}
