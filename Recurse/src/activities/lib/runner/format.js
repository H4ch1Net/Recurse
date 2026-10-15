// Turning values into short, readable text: console.log output in the JavaScript worker,
// and test inputs, expected values and results in the challenge panel.
//
// formatValue is serialized into the worker source with Function.prototype.toString, so
// it must stay self-contained: no references to anything outside its own body except
// standard globals. Keep the syntax plain (no optional chaining, no class fields).

/**
 * Format any value as compact text.
 * options.language: 'javascript' (null, true, "text") or 'python' (None, True, 'text').
 * options.quoteStrings: false prints a top-level string as is (console.log style).
 */
export function formatValue(value, options) {
  var opts = options || {}
  var py = opts.language === 'python'
  var maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 6
  var maxItems = typeof opts.maxItems === 'number' ? opts.maxItems : 100
  var maxLength = typeof opts.maxLength === 'number' ? opts.maxLength : 20000
  var seen = []

  function pyString(s) {
    var quote = s.indexOf("'") >= 0 && s.indexOf('"') < 0 ? '"' : "'"
    var out = ''
    for (var i = 0; i < s.length; i++) {
      var ch = s[i]
      if (ch === '\\') out += '\\\\'
      else if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += '\\r'
      else if (ch === '\t') out += '\\t'
      else if (ch === quote) out += '\\' + quote
      else out += ch
    }
    return quote + out + quote
  }

  function str(s) {
    return py ? pyString(s) : JSON.stringify(s)
  }

  function num(n) {
    if (n !== n) return py ? 'nan' : 'NaN'
    if (n === Infinity) return py ? 'inf' : 'Infinity'
    if (n === -Infinity) return py ? '-inf' : '-Infinity'
    if (n === 0) return '0'
    return String(n)
  }

  function ctorName(v) {
    try {
      var proto = Object.getPrototypeOf(v)
      if (!proto) return ''
      var c = proto.constructor
      return c && typeof c.name === 'string' ? c.name : ''
    } catch {
      return ''
    }
  }

  function keyText(k) {
    if (py) return pyString(k)
    return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)
  }

  function listNodeText(head) {
    var parts = []
    var visited = []
    var node = head
    while (node && typeof node === 'object' && parts.length < 50) {
      if (visited.indexOf(node) >= 0) {
        parts.push('(cycle)')
        return 'ListNode(' + parts.join(' -> ') + ')'
      }
      visited.push(node)
      parts.push(fmt(node.val, maxDepth))
      node = node.next
    }
    if (node) parts.push('...')
    return 'ListNode(' + parts.join(' -> ') + ')'
  }

  function treeNodeText(root) {
    var out = []
    var queue = [root]
    var visited = []
    for (var i = 0; i < queue.length && out.length < 200; i++) {
      var node = queue[i]
      if (!node || typeof node !== 'object') {
        out.push(py ? 'None' : 'null')
        continue
      }
      if (visited.indexOf(node) >= 0) {
        out.push('(cycle)')
        break
      }
      visited.push(node)
      out.push(fmt(node.val, maxDepth))
      queue.push(node.left || null, node.right || null)
    }
    while (out.length && out[out.length - 1] === (py ? 'None' : 'null')) out.pop()
    return 'TreeNode([' + out.join(', ') + '])'
  }

  function fmt(v, depth) {
    if (v === null) return py ? 'None' : 'null'
    if (v === undefined) return py ? 'None' : 'undefined'
    var t = typeof v
    if (t === 'string') return str(v)
    if (t === 'number') return num(v)
    if (t === 'boolean') return py ? (v ? 'True' : 'False') : String(v)
    if (t === 'bigint') return py ? String(v) : String(v) + 'n'
    if (t === 'symbol') return String(v)
    if (t === 'function') return '[Function' + (v.name ? ': ' + v.name : ' (anonymous)') + ']'
    if (seen.indexOf(v) >= 0) return '[Circular]'
    var name = ctorName(v)
    if (name === 'ListNode' && 'next' in v) return listNodeText(v)
    if (name === 'TreeNode' && 'left' in v) return treeNodeText(v)
    if (depth >= maxDepth) return Array.isArray(v) ? '[...]' : '{...}'
    seen.push(v)
    try {
      var items = []
      var i
      if (Array.isArray(v)) {
        var n = Math.min(v.length, maxItems)
        for (i = 0; i < n; i++) items.push(fmt(v[i], depth + 1))
        if (v.length > maxItems) items.push('... ' + (v.length - maxItems) + ' more')
        return '[' + items.join(', ') + ']'
      }
      if (typeof Map !== 'undefined' && v instanceof Map) {
        v.forEach(function (val, key) {
          if (items.length < maxItems) items.push(fmt(key, depth + 1) + ' => ' + fmt(val, depth + 1))
        })
        return 'Map(' + v.size + ') {' + (items.length ? ' ' + items.join(', ') + ' ' : '') + '}'
      }
      if (typeof Set !== 'undefined' && v instanceof Set) {
        v.forEach(function (val) {
          if (items.length < maxItems) items.push(fmt(val, depth + 1))
        })
        return 'Set(' + v.size + ') {' + (items.length ? ' ' + items.join(', ') + ' ' : '') + '}'
      }
      if (v instanceof Date) return isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString()
      if (v instanceof Error || (typeof v.message === 'string' && typeof v.name === 'string' && 'stack' in v)) {
        return v.name + ': ' + v.message
      }
      if (ArrayBuffer.isView && ArrayBuffer.isView(v) && typeof v.length === 'number') {
        var arr = Array.prototype.slice.call(v, 0, maxItems)
        return name + '(' + v.length + ') [' + arr.map(function (x) { return fmt(x, depth + 1) }).join(', ') + ']'
      }
      var keys = Object.keys(v)
      for (i = 0; i < keys.length && i < maxItems; i++) {
        items.push(keyText(keys[i]) + ': ' + fmt(v[keys[i]], depth + 1))
      }
      if (keys.length > maxItems) items.push('... ' + (keys.length - maxItems) + ' more')
      if (py) return '{' + items.join(', ') + '}'
      var prefix = name && name !== 'Object' ? name + ' ' : ''
      return prefix + (items.length ? '{ ' + items.join(', ') + ' }' : '{}')
    } finally {
      seen.pop()
    }
  }

  var text = opts.quoteStrings === false && typeof value === 'string' ? value : fmt(value, 0)
  return text.length > maxLength ? text.slice(0, maxLength) + ' ...' : text
}

/** "nums = [2, 7], target = 9" from parameter names and an argument list. */
export function formatArgs(params, args, language) {
  const list = Array.isArray(args) ? args : []
  return list
    .map((arg, i) => {
      const value = formatValue(arg, { language, maxItems: 200 })
      return params?.[i] ? `${params[i]} = ${value}` : value
    })
    .join(', ')
}

/**
 * Split two strings into a shared prefix, the differing middles and a shared suffix,
 * so a result panel can highlight exactly where actual and expected part ways.
 */
export function diffStrings(a, b) {
  const x = String(a)
  const y = String(b)
  let start = 0
  const max = Math.min(x.length, y.length)
  while (start < max && x[start] === y[start]) start++
  let end = 0
  while (end < max - start && x[x.length - 1 - end] === y[y.length - 1 - end]) end++
  return {
    prefix: x.slice(0, start),
    a: x.slice(start, x.length - end),
    b: y.slice(start, y.length - end),
    suffix: x.slice(x.length - end)
  }
}
