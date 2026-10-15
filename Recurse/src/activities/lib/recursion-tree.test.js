import { describe, expect, it } from 'vitest'
import { buildTrace, countCalls, describeEvent, layoutTree } from './recursion-tree'

describe('buildTrace', () => {
  it('computes the right answers', () => {
    expect(buildTrace('fib', 7).result).toBe(13)
    expect(buildTrace('fib', 7, true).result).toBe(13)
    expect(buildTrace('factorial', 5).result).toBe(120)
    expect(buildTrace('sum', 5).result).toBe(15)
    expect(buildTrace('fib', 0).result).toBe(0)
    expect(buildTrace('fib', 1).result).toBe(1)
  })

  it('counts naive fib calls as 2 * fib(n + 1) - 1', () => {
    expect(countCalls('fib', 1)).toBe(1)
    expect(countCalls('fib', 5)).toBe(15)
    expect(countCalls('fib', 7)).toBe(41)
    expect(countCalls('fib', 8)).toBe(67)
  })

  it('memoized fib makes 2n - 1 calls, n - 2 of them answered from the memo', () => {
    const t = buildTrace('fib', 5, true)
    expect(t.calls).toBe(9)
    expect(t.hits).toBe(3)
    expect(buildTrace('fib', 7, true).calls).toBe(13)
    expect(buildTrace('fib', 7, true).hits).toBe(5)
  })

  it('memo makes no difference when subproblems do not overlap', () => {
    expect(countCalls('factorial', 6)).toBe(6)
    expect(countCalls('factorial', 6, true)).toBe(6)
    expect(countCalls('sum', 4, true)).toBe(countCalls('sum', 4))
  })

  it('records a call and a return for every computed node, and one event per memo hit', () => {
    const plain = buildTrace('fib', 5)
    expect(plain.events).toHaveLength(plain.calls * 2)
    const memo = buildTrace('fib', 5, true)
    expect(memo.events).toHaveLength((memo.calls - memo.hits) * 2 + memo.hits)
    // Calls and returns nest like a stack.
    const stack = []
    for (const e of plain.events) {
      if (e.type === 'call') stack.push(e.id)
      else expect(stack.pop()).toBe(e.id)
    }
    expect(stack).toEqual([])
  })

  it('memo hits are leaves with a stored value', () => {
    const t = buildTrace('fib', 6, true)
    for (const node of t.nodes.filter((n) => n.hit)) {
      expect(node.children).toEqual([])
      expect(node.value).not.toBeNull()
    }
  })
})

describe('describeEvent', () => {
  it('explains calls, base cases, returns and memo hits', () => {
    const t = buildTrace('fib', 3, true)
    expect(describeEvent(t, 0).text).toMatch(/Call fib\(3\)\. Push it on the stack at depth 1/)
    expect(describeEvent(t, 1).text).toMatch(/fib\(3\) calls fib\(2\)/)
    const baseReturn = t.events.findIndex((e) => e.type === 'return' && t.nodes[e.id].base)
    expect(describeEvent(t, baseReturn).text).toMatch(/base case/)
    const hit = t.events.findIndex((e) => e.type === 'hit')
    expect(describeEvent(t, hit).text).toMatch(/already in the memo/)
    expect(describeEvent(t, t.events.length - 1).text).toMatch(/fib\(3\) = fib\(2\) \+ fib\(1\) = 1 \+ 1 = 2/)
  })
})

describe('layoutTree', () => {
  const check = (trace) => {
    const { x, depth } = layoutTree(trace.nodes)
    const byLevel = {}
    trace.nodes.forEach((n) => (byLevel[depth[n.id]] ||= []).push(x[n.id]))
    for (const xs of Object.values(byLevel)) {
      xs.sort((a, b) => a - b)
      for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeGreaterThanOrEqual(1 - 1e-9)
    }
    for (const n of trace.nodes) {
      if (!n.children.length) continue
      const first = x[n.children[0]]
      const last = x[n.children[n.children.length - 1]]
      expect(x[n.id]).toBeCloseTo((first + last) / 2)
    }
    expect(Math.min(...x)).toBe(0)
  }

  it('never overlaps nodes on a level and centers parents', () => {
    for (let n = 1; n <= 8; n++) {
      check(buildTrace('fib', n))
      check(buildTrace('fib', n, true))
      check(buildTrace('factorial', n))
    }
  })

  it('packs fib(7) narrower than one slot per leaf', () => {
    const t = buildTrace('fib', 7)
    const leaves = t.nodes.filter((n) => !n.children.length).length
    expect(leaves).toBe(21)
    const { width, levels } = layoutTree(t.nodes)
    expect(width).toBeLessThan(leaves - 1)
    expect(levels).toBe(7)
  })

  it('stacks a linear recursion in one column', () => {
    const { width, levels } = layoutTree(buildTrace('sum', 6).nodes)
    expect(width).toBe(0)
    expect(levels).toBe(6)
  })
})
