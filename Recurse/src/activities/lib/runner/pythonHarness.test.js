import { describe, expect, it } from 'vitest'
import { hasPython, runPythonJobs } from './nodeRun.js'

// The harness runs in Pyodide in the browser; python3 runs the same text here when installed.
const python = hasPython()

function runOne(job) {
  const out = runPythonJobs([{ id: 'job', mode: 'tests', ...job }])
  if (out.error) throw new Error(out.error)
  return out.byJob.get('job')
}

const resultsOf = (events) => events.filter((e) => e.kind === 'test-result').map((e) => e.payload)

describe.skipIf(!python)('Python harness', () => {
  it('runs tests and captures printed output per test', () => {
    const code = 'def two_sum(nums, target):\n    print("n =", len(nums))\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n'
    const results = resultsOf(runOne({ code, fn: 'two_sum', tests: [[[2, 7, 11, 15], 9], [[3, 2, 4], 6]] }))
    expect(results.map((r) => r.actual)).toEqual([[0, 1], [1, 2]])
    expect(results[0].stdout).toBe('n = 4\n')
  })

  it('reports runtime errors with learner line numbers', () => {
    const [result] = resultsOf(runOne({ code: 'def f(x):\n    y = 0\n    return x / y\n', fn: 'f', tests: [[1]] }))
    expect(result.error.message).toBe('ZeroDivisionError: division by zero')
    expect(result.error.line).toBe(3)
    expect(result.error.trace[0]).toBe('line 3, in f')
  })

  it('reports syntax errors as fatal with the line', () => {
    const events = runOne({ code: 'def f(x)\n    return x\n', fn: 'f', tests: [[1]] })
    const fatal = events.find((e) => e.kind === 'fatal').payload
    expect(fatal.message).toMatch(/SyntaxError/)
    expect(fatal.line).toBe(1)
  })

  it('names the functions it found when the expected one is missing', () => {
    const events = runOne({ code: 'def twoSum(a, b):\n    return []\n', fn: 'two_sum', tests: [[[1], 1]] })
    expect(events.find((e) => e.kind === 'fatal').payload.message).toMatch(/Your code defines: twoSum/)
  })

  it('accepts a LeetCode style Solution class', () => {
    const code = 'class Solution:\n    def maxDepth(self, root):\n        if not root:\n            return 0\n        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))\n'
    const [result] = resultsOf(runOne({ code, fn: 'max_depth', tests: [[[3, 9, 20, null, null, 15, 7]]], argTypes: ['tree'] }))
    expect(result.actual).toBe(3)
  })

  it('converts linked lists both ways and turns tuples and sets into lists', () => {
    const reverse = 'def reverse(head):\n    prev = None\n    while head:\n        head.next, prev, head = prev, head, head.next\n    return prev\n'
    expect(resultsOf(runOne({ code: reverse, fn: 'reverse', tests: [[[1, 2, 3]], [[]]], argTypes: ['list'], returnType: 'list' })).map((r) => r.actual)).toEqual([[3, 2, 1], []])
    const pair = 'def f():\n    return (1, {3, 2})\n'
    expect(resultsOf(runOne({ code: pair, fn: 'f', tests: [[]] }))[0].actual).toEqual([1, [2, 3]])
  })

  it('gives every test a fresh copy of its arguments', () => {
    const code = 'def f(items):\n    items.append(9)\n    return len(items)\n'
    expect(resultsOf(runOne({ code, fn: 'f', tests: [[[1]], [[1]]] })).map((r) => r.actual)).toEqual([2, 2])
  })

  it('stops a runaway test with the time limit', () => {
    const events = runOne({ code: 'def f():\n    while True:\n        pass\n', fn: 'f', tests: [[]], timeout: 0.3 })
    expect(events.some((e) => e.kind === 'timeout')).toBe(true)
  })

  it('streams program output in script mode', () => {
    const out = runPythonJobs([{ id: 's', mode: 'script', code: 'print("a", 1)\nprint(nope)\n' }])
    const events = out.byJob.get('s')
    expect(events.filter((e) => e.kind === 'out').map((e) => e.payload).join('')).toBe('a 1\n')
    const error = events.find((e) => e.kind === 'error').payload
    expect(error.message).toMatch(/NameError/)
    expect(error.line).toBe(2)
  })
})
