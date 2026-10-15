import { describe, expect, it } from 'vitest'
import { buildJsSource, normalizeArgTypes } from './jsSource.js'
import { jsRuntime } from './jsRuntime.js'
import { formatValue } from './format.js'
import { resultsFromMessages, runJsInNode } from './nodeRun.js'

const twoSum = `function twoSum(nums, target) {
  const seen = new Map()
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i]
    seen.set(nums[i], i)
  }
}
`

describe('buildJsSource', () => {
  it('reports the line offset of the learner code', () => {
    const { source, lineOffset, codeLines } = buildJsSource({ code: 'a\nb\nc', mode: 'script' })
    const lines = source.split('\n')
    expect(lines[lineOffset]).toBe('a')
    expect(lines[lineOffset + 2]).toBe('c')
    expect(codeLines).toBe(3)
  })

  it('normalizes argTypes given as an array or by parameter name', () => {
    expect(normalizeArgTypes(['list', null], ['a', 'b'])).toEqual(['list', null])
    expect(normalizeArgTypes({ root: 'tree' }, ['k', 'root'])).toEqual([null, 'tree'])
    expect(normalizeArgTypes(undefined, ['a'])).toEqual([])
  })
})

describe('JavaScript runtime in tests mode', () => {
  it('runs each test and captures console output per test', async () => {
    const code = twoSum.replace('const seen', 'console.log("len", nums.length)\n  const seen')
    const run = await runJsInNode({ code, fnName: 'twoSum', tests: [[[2, 7, 11, 15], 9], [[3, 2, 4], 6]] })
    expect(run.status).toBe('ok')
    const results = resultsFromMessages(run.messages)
    expect(results.map((r) => r.actual)).toEqual([[0, 1], [1, 2]])
    expect(results[0].stdout).toBe('len 4\n')
    expect(results.every((r) => typeof r.ms === 'number')).toBe(true)
  })

  it('reports runtime errors with learner line numbers', async () => {
    const code = 'function f(x) {\n  const a = null\n  return a.length\n}\n'
    const run = await runJsInNode({ code, fnName: 'f', tests: [[1]] })
    const [result] = resultsFromMessages(run.messages)
    expect(result.error.message).toMatch(/TypeError/)
    expect(result.error.line).toBe(3)
    expect(result.error.trace[0]).toBe('line 3, in f')
  })

  it('reports syntax errors with learner line numbers', async () => {
    const run = await runJsInNode({ code: 'function f(x) {\n  return x +\n}\n', fnName: 'f', tests: [[1]] })
    expect(run.status).toBe('error')
    expect(run.syntax).toBe(true)
    expect(run.fatal.line).toBe(3)
  })

  it('explains a missing function', async () => {
    const run = await runJsInNode({ code: 'function other() {}', fnName: 'twoSum', tests: [[1]] })
    expect(run.fatal.message).toMatch(/Could not find a function named twoSum/)
  })

  it('gives every test a fresh copy of its arguments', async () => {
    const code = 'function f(list) {\n  list.push(99)\n  return list.length\n}\n'
    const run = await runJsInNode({ code, fnName: 'f', tests: [[[1, 2]], [[1, 2]]] })
    expect(resultsFromMessages(run.messages).map((r) => r.actual)).toEqual([3, 3])
  })

  it('converts linked lists and trees in and out', async () => {
    const reverse = 'function reverse(head) {\n  let prev = null\n  while (head) { const next = head.next; head.next = prev; prev = head; head = next }\n  return prev\n}'
    const lists = await runJsInNode({ code: reverse, fnName: 'reverse', tests: [[[1, 2, 3]], [[]]], argTypes: ['list'], returnType: 'list' })
    expect(resultsFromMessages(lists.messages).map((r) => r.actual)).toEqual([[3, 2, 1], []])

    const invert = 'function invert(root) {\n  if (!root) return null\n  const l = root.left\n  root.left = invert(root.right)\n  root.right = invert(l)\n  return root\n}'
    const trees = await runJsInNode({ code: invert, fnName: 'invert', tests: [[[4, 2, 7, 1, 3, 6, 9]], [[1, null, 2]]], argTypes: ['tree'], returnType: 'tree' })
    expect(resultsFromMessages(trees.messages).map((r) => r.actual)).toEqual([[4, 7, 2, 9, 6, 3, 1], [1, 2]])
  })

  it('lets learner code define its own ListNode', async () => {
    const code = 'class ListNode { constructor(val, next = null) { this.val = val; this.next = next } }\nfunction make(n) { return new ListNode(n, new ListNode(n + 1)) }'
    const run = await runJsInNode({ code, fnName: 'make', tests: [[1]], returnType: 'list' })
    expect(resultsFromMessages(run.messages)[0].actual).toEqual([1, 2])
  })

  it('reports a returned list with a cycle instead of hanging', async () => {
    const code = 'function f() {\n  const a = new ListNode(1)\n  a.next = a\n  return a\n}'
    const run = await runJsInNode({ code, fnName: 'f', tests: [[]], returnType: 'list' })
    expect(resultsFromMessages(run.messages)[0].error.message).toMatch(/cycle/)
  })

  it('awaits functions that return promises', async () => {
    const run = await runJsInNode({ code: 'async function f(x) { return x * 2 }', fnName: 'f', tests: [[2], [5]] })
    expect(resultsFromMessages(run.messages).map((r) => r.actual)).toEqual([4, 10])
  })

  it('keeps undefined results distinct (a forgotten return)', async () => {
    const run = await runJsInNode({ code: 'function f(x) { x + 1 }', fnName: 'f', tests: [[1]] })
    const [result] = resultsFromMessages(run.messages)
    expect(result.hasActual).toBe(true)
    expect(result.actual).toBeUndefined()
  })

  it('stops an infinite loop with the time limit', async () => {
    const run = await runJsInNode({ code: 'function f() { while (true) {} }', fnName: 'f', tests: [[]], timeout: 200 })
    expect(run.status).toBe('timeout')
  })

  it('reports an error thrown while the code loads', async () => {
    const run = await runJsInNode({ code: 'const x = 1\nthrow new Error("boom")\nfunction f() {}', fnName: 'f', tests: [[]] })
    expect(run.status).toBe('error')
    expect(run.fatal.message).toBe('Error: boom')
    expect(run.fatal.line).toBe(2)
  })
})

describe('JavaScript runtime in script mode', () => {
  it('streams console output and waits for timers', async () => {
    const run = await runJsInNode({ mode: 'script', code: 'console.log("a", [1, 2], { k: "v" })\nsetTimeout(() => console.error("later"), 5)' })
    expect(run.status).toBe('ok')
    const chunks = run.messages.filter((m) => m.t === 'out').flatMap((m) => m.chunks)
    expect(chunks).toEqual([
      ['out', 'a [1, 2] { k: "v" }\n'],
      ['err', 'later\n']
    ])
  })
})

describe('runtime helpers', () => {
  const fakeScope = () => ({
    postMessage: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    location: { href: 'x.js' }
  })

  it('builds and reads level-order trees with null gaps', () => {
    const rt = jsRuntime(fakeScope(), formatValue, { mode: 'tests', tests: [] })
    const tree = rt.toTree([1, null, 2, 3])
    expect(tree.left).toBeNull()
    expect(tree.right.left.val).toBe(3)
    expect(rt.fromTree(tree)).toEqual([1, null, 2, 3])
    expect(rt.fromTree(rt.toTree([]))).toEqual([])
  })

  it('makes values safe to post', () => {
    const rt = jsRuntime(fakeScope(), formatValue, { mode: 'tests', tests: [] })
    expect(rt.toPlain(new Set([1, 2]))).toEqual([1, 2])
    expect(rt.toPlain({ f() {} }).f).toMatch(/Function/)
  })
})
