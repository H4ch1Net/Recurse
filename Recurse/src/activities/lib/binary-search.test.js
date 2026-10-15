import { describe, expect, it } from 'vitest'
import { autoSearch, halvingChain, isMiddle, linearChecks, makeSortedValues, maxProbes, middle, probe, startSearch } from './binary-search'
import { createRandom } from '../../lib/random'

describe('binary-search', () => {
  it('knows the probe limit', () => {
    expect(maxProbes(1)).toBe(1)
    expect(maxProbes(8)).toBe(4)
    expect(maxProbes(16)).toBe(5)
    expect(maxProbes(20)).toBe(5)
    expect(maxProbes(64)).toBe(7)
  })

  it('makes distinct ascending values', () => {
    const values = makeSortedValues(64, createRandom(2))
    expect(values).toHaveLength(64)
    for (let k = 1; k < values.length; k++) expect(values[k]).toBeGreaterThan(values[k - 1])
  })

  it('always finds any target within the limit by probing the middle', () => {
    for (let n = 1; n <= 64; n++) {
      const values = makeSortedValues(n, createRandom(n))
      for (const target of values) {
        const probes = autoSearch(values, target)
        expect(values[probes[probes.length - 1]]).toBe(target)
        expect(probes.length).toBeLessThanOrEqual(maxProbes(n))
      }
    }
  })

  it('moves low and high and reports what was ruled out', () => {
    const values = [2, 4, 6, 8, 10, 12, 14, 16]
    let state = startSearch(values, 14)
    let r = probe(state, middle(0, 7))
    expect(r.outcome).toBe('go-right')
    expect(r.even).toBe(true)
    expect(r.state.low).toBe(4)
    expect(r.ruledOut).toBe(4)
    state = r.state
    r = probe(state, 1)
    expect(r.outcome).toBe('eliminated')
    r = probe(state, 7)
    expect(r.outcome).toBe('go-left')
    expect(r.even).toBe(false)
    expect(r.ruledOut).toBe(1)
    r = probe(r.state, 6)
    expect(r.outcome).toBe('found')
    expect(r.state.probes).toEqual([3, 7, 6])
  })

  it('treats both middles of an even range as even splits', () => {
    expect(isMiddle(0, 7, 3)).toBe(true)
    expect(isMiddle(0, 7, 4)).toBe(true)
    expect(isMiddle(0, 7, 5)).toBe(false)
    expect(isMiddle(2, 2, 2)).toBe(true)
  })

  it('counts linear checks and the halving chain', () => {
    expect(linearChecks([1, 3, 5, 7], 5)).toBe(3)
    expect(halvingChain(32)).toEqual([32, 16, 8, 4, 2, 1])
    expect(halvingChain(20)).toEqual([20, 10, 5, 2, 1])
    for (let n = 1; n <= 64; n++) expect(halvingChain(n)).toHaveLength(maxProbes(n))
  })
})
