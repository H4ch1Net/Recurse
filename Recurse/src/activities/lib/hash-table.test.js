import { describe, expect, it } from 'vitest'
import { countKeys, emptyTable, hashOf, insert, letters, loadFactor, longestChain, lookup, needsResize, remove, resize } from './hash-table'

describe('hash-table', () => {
  it('hashes by summing character codes', () => {
    const h = hashOf('cat', 8)
    expect(h.codes.map((c) => c.code)).toEqual([99, 97, 116])
    expect(h.sum).toBe(312)
    expect(h.index).toBe(0)
    expect(hashOf('act', 8).index).toBe(hashOf('cat', 8).index)
  })

  it('inserts with separate chaining and spots collisions and duplicates', () => {
    let table = emptyTable(4)
    let r = insert(table, 'cat')
    expect(r.collision).toBe(false)
    table = r.table
    r = insert(table, 'act')
    expect(r.collision).toBe(true)
    expect(r.comparisons).toBe(1)
    table = r.table
    expect(table[r.index]).toEqual(['cat', 'act'])
    r = insert(table, 'cat')
    expect(r.duplicate).toBe(true)
    expect(r.table).toBe(table)
    expect(countKeys(table)).toBe(2)
  })

  it('tracks the load factor and when to resize', () => {
    let table = emptyTable(4)
    for (const k of ['cat', 'dog', 'owl']) table = insert(table, k).table
    expect(loadFactor(table)).toBe(0.75)
    expect(needsResize(table)).toBe(false)
    table = insert(table, 'emu').table
    expect(needsResize(table)).toBe(true)
  })

  it('doubles the buckets and rehashes every key', () => {
    let table = emptyTable(4)
    for (const k of ['cat', 'dog', 'owl', 'emu', 'yak']) table = insert(table, k).table
    const { table: bigger, moves } = resize(table)
    expect(bigger).toHaveLength(8)
    expect(countKeys(bigger)).toBe(5)
    expect(moves).toHaveLength(5)
    for (const m of moves) {
      expect(bigger[m.to]).toContain(m.key)
      expect(m.to).toBe(m.sum % 8)
      expect(m.to % 4).toBe(m.from)
    }
    expect(loadFactor(bigger)).toBe(0.625)
  })

  it('counts lookup comparisons along the chain', () => {
    let table = emptyTable(4)
    for (const k of ['cat', 'act', 'tac']) table = insert(table, k).table
    expect(lookup(table, 'tac')).toMatchObject({ found: true, comparisons: 3, path: ['cat', 'act', 'tac'] })
    expect(lookup(table, 'cta')).toMatchObject({ found: false, comparisons: 3 })
    expect(lookup(table, 'dog').found).toBe(false)
    expect(longestChain(table)).toBe(3)
  })

  it('removes keys and knows anagrams', () => {
    let table = insert(emptyTable(4), 'cat').table
    table = remove(table, 'cat').table
    expect(countKeys(table)).toBe(0)
    expect(letters('act')).toBe(letters('cat'))
  })
})
