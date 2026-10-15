// Call traces and a compact tree layout for the recursion-tree widget.

export const FUNCTIONS = {
  fib: {
    label: 'fib',
    title: 'Fibonacci',
    isBase: (n) => n <= 1,
    baseValue: (n) => n,
    children: (n) => [n - 1, n - 2],
    combine: (n, [a, b]) => a + b,
    formula: (n, [a, b], value) => `fib(${n}) = fib(${n - 1}) + fib(${n - 2}) = ${a} + ${b} = ${value}`,
    code: ['if (n <= 1) return n', 'return fib(n - 1) + fib(n - 2)']
  },
  factorial: {
    label: 'fact',
    title: 'Factorial',
    isBase: (n) => n <= 1,
    baseValue: () => 1,
    children: (n) => [n - 1],
    combine: (n, [a]) => n * a,
    formula: (n, [a], value) => `fact(${n}) = ${n} × fact(${n - 1}) = ${n} × ${a} = ${value}`,
    code: ['if (n <= 1) return 1', 'return n * fact(n - 1)']
  },
  sum: {
    label: 'sum',
    title: 'Sum 1 to n',
    isBase: (n) => n <= 1,
    baseValue: (n) => n,
    children: (n) => [n - 1],
    combine: (n, [a]) => n + a,
    formula: (n, [a], value) => `sum(${n}) = ${n} + sum(${n - 1}) = ${n} + ${a} = ${value}`,
    code: ['if (n <= 1) return n', 'return n + sum(n - 1)']
  }
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS)

export const callName = (fn, n) => `${(FUNCTIONS[fn] || FUNCTIONS.fib).label}(${n})`

/**
 * Runs fn(n) and records every call as a tree node plus an ordered list of events:
 * { type: 'call' | 'return' | 'hit', id }. 'hit' is a memoized call answered from the cache.
 */
export function buildTrace(fn, n, memo = false) {
  const name = FUNCTIONS[fn] ? fn : 'fib'
  const def = FUNCTIONS[name]
  const nodes = []
  const events = []
  const cache = new Map()
  let hits = 0
  let maxDepth = 0

  const visit = (arg, parent, depth) => {
    const id = nodes.length
    const node = { id, arg, parent, depth, children: [], childValues: [], value: null, hit: false, base: false }
    nodes.push(node)
    if (parent !== null) nodes[parent].children.push(id)
    maxDepth = Math.max(maxDepth, depth)
    if (memo && cache.has(arg)) {
      node.hit = true
      node.value = cache.get(arg)
      hits++
      events.push({ type: 'hit', id })
      return node.value
    }
    events.push({ type: 'call', id })
    let value
    if (def.isBase(arg)) {
      node.base = true
      value = def.baseValue(arg)
    } else {
      node.childValues = def.children(arg).map((childArg) => visit(childArg, id, depth + 1))
      value = def.combine(arg, node.childValues)
    }
    node.value = value
    if (memo) cache.set(arg, value)
    events.push({ type: 'return', id })
    return value
  }

  const result = visit(n, null, 0)
  return { fn: name, n, memo, nodes, events, result, calls: nodes.length, hits, maxDepth }
}

/** Number of calls fn(n) makes with or without memoization, without building a trace. */
export function countCalls(fn, n, memo = false) {
  return buildTrace(fn, n, memo).calls
}

/** One plain sentence for the event at index k, plus which code line it runs. */
export function describeEvent(trace, k) {
  const event = trace.events[k]
  if (!event) return { text: '', line: null }
  const node = trace.nodes[event.id]
  const me = callName(trace.fn, node.arg)
  const parent = node.parent === null ? null : callName(trace.fn, trace.nodes[node.parent].arg)
  if (event.type === 'hit') {
    return { text: `${parent} needs ${me}, and it is already in the memo. Reuse ${node.value} right away: no new calls, nothing pushed.`, line: 'memo' }
  }
  if (event.type === 'call') {
    const who = parent ? `${parent} calls ${me}.` : `Call ${me}.`
    return { text: `${who} Push it on the stack at depth ${node.depth + 1}.`, line: node.base ? 'base' : 'recurse' }
  }
  const handBack = parent ? ` Pop it off the stack and hand ${node.value} back to ${parent}.` : ' Pop it off the stack. That is the final answer.'
  if (node.base) return { text: `${me} is a base case, so it returns ${node.value} without calling anything.${handBack}`, line: 'base' }
  const def = FUNCTIONS[trace.fn]
  const saved = trace.memo ? ` Save it in the memo.` : ''
  return { text: `${def.formula(node.arg, node.childValues, node.value)}.${saved}${handBack}`, line: 'recurse' }
}

/**
 * Compact tidy layout: each subtree is pushed right just far enough that no two nodes on the
 * same level are closer than `sep`, and every parent sits centered over its children.
 * Returns x (in units) and depth for every node, plus the overall width.
 */
export function layoutTree(nodes, sep = 1) {
  if (!nodes.length) return { x: [], depth: [], width: 0, levels: 0 }
  const rel = new Array(nodes.length).fill(0)

  const place = (id) => {
    const kids = nodes[id].children
    if (!kids.length) return { left: [0], right: [0] }
    const contours = kids.map(place)
    const offsets = [0]
    const left = contours[0].left.slice()
    const right = contours[0].right.slice()
    for (let k = 1; k < kids.length; k++) {
      const c = contours[k]
      let shift = -Infinity
      for (let d = 0; d < Math.min(right.length, c.left.length); d++) shift = Math.max(shift, right[d] - c.left[d] + sep)
      offsets.push(shift)
      for (let d = 0; d < c.left.length; d++) {
        if (d < left.length) {
          left[d] = Math.min(left[d], c.left[d] + shift)
          right[d] = Math.max(right[d], c.right[d] + shift)
        } else {
          left.push(c.left[d] + shift)
          right.push(c.right[d] + shift)
        }
      }
    }
    const mid = (offsets[0] + offsets[offsets.length - 1]) / 2
    kids.forEach((kid, k) => {
      rel[kid] = offsets[k] - mid
    })
    return { left: [0, ...left.map((v) => v - mid)], right: [0, ...right.map((v) => v - mid)] }
  }

  place(0)
  // Nodes are numbered in call order, so a parent always comes before its children.
  const x = new Array(nodes.length).fill(0)
  for (const node of nodes) if (node.parent !== null) x[node.id] = x[node.parent] + rel[node.id]
  const minX = Math.min(...x)
  const shifted = x.map((v) => v - minX)
  const depth = nodes.map((node) => node.depth)
  return { x: shifted, depth, width: Math.max(...shifted), levels: Math.max(...depth) + 1 }
}
