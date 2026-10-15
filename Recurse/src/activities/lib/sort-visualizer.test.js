import { describe, expect, it } from 'vitest'
import { SORT_ALGORITHMS, SORT_GENERATORS, compareAll, isSortedAscending, makeArray, traceSort } from './sort-visualizer'
import { createRandom } from '../../lib/random'

const KNOWN = [5, 1, 4, 2, 8]

describe('sort-visualizer', () => {
  it('every algorithm sorts random, sorted, reversed and duplicate-heavy arrays', () => {
    const random = createRandom(7)
    const inputs = [[], [3], [2, 1], [1, 2, 3, 4], [4, 3, 2, 1], [5, 5, 1, 5, 1], KNOWN]
    for (let size = 2; size <= 24; size++) {
      inputs.push(makeArray(size, 'random', random), makeArray(size, 'few', random), makeArray(size, 'nearly', random), makeArray(size, 'reversed', random))
    }
    for (const name of SORT_ALGORITHMS) {
      for (const input of inputs) {
        const before = [...input]
        const { frames, values } = traceSort(name, input)
        const expected = [...input].sort((x, y) => x - y)
        expect(values).toEqual(expected)
        const last = frames[frames.length - 1]
        expect(last.values).toEqual(expected)
        expect(last.sorted.every(Boolean)).toBe(true)
        // The input array is never mutated.
        expect(input).toEqual(before)
        expect(isSortedAscending(values)).toBe(true)
      }
    }
  })

  it('keeps every frame a permutation of the input, so bars can be keyed by id', () => {
    const input = makeArray(16, 'random', createRandom(3))
    for (const name of SORT_ALGORITHMS) {
      for (const frame of traceSort(name, input).frames) {
        expect([...frame.ids].sort((x, y) => x - y)).toEqual(input.map((_, k) => k))
        expect(frame.ids.map((id) => input[id])).toEqual(frame.values)
      }
    }
  })

  it('counts comparisons, swaps and writes for a known input', () => {
    const counts = Object.fromEntries(compareAll(KNOWN).map((c) => [c.name, c]))
    expect(counts.bubble).toMatchObject({ comparisons: 9, swaps: 4, writes: 8 })
    expect(counts.selection).toMatchObject({ comparisons: 10, swaps: 2 })
    expect(counts.insertion).toMatchObject({ comparisons: 7, swaps: 4 })
    expect(counts.merge).toMatchObject({ comparisons: 8, swaps: 0, writes: 12 })
    expect(counts.quick).toMatchObject({ comparisons: 8, swaps: 2 })
  })

  it('shows the best and worst cases the lessons talk about', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(traceSort('bubble', sorted).comparisons).toBe(7)
    expect(traceSort('insertion', sorted).comparisons).toBe(7)
    expect(traceSort('quick', sorted).comparisons).toBe(28)
    expect(traceSort('selection', sorted).comparisons).toBe(28)
    expect(traceSort('selection', sorted).swaps).toBe(0)
  })

  it('selection sort always makes n(n-1)/2 comparisons', () => {
    const input = makeArray(12, 'random', createRandom(11))
    expect(traceSort('selection', input).comparisons).toBe(66)
  })

  it('counts frames consistently with the generator steps', () => {
    for (const name of SORT_ALGORITHMS) {
      const steps = [...SORT_GENERATORS[name](KNOWN)]
      const compares = steps.filter((s) => s.type === 'compare').length
      expect(traceSort(name, KNOWN).comparisons).toBe(compares)
      for (const step of steps) if (step.type === 'compare' || step.type === 'swap') expect(step.note).toBeTruthy()
    }
  })

  it('makes arrays in each preset shape', () => {
    const random = createRandom(5)
    expect(makeArray(10, 'random', random)).toHaveLength(10)
    const reversed = makeArray(10, 'reversed', random)
    expect([...reversed].reverse()).toEqual([...reversed].sort((x, y) => x - y))
    expect(new Set(makeArray(20, 'few', random)).size).toBeLessThanOrEqual(4)
  })
})
