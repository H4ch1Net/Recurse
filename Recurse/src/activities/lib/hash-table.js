// A teaching hash table: sum-of-character-codes hash, separate chaining, load factor,
// and a resize that doubles the buckets and rehashes every key.

export const RESIZE_AT = 0.75

export const SAMPLE_KEYS = ['cat', 'dog', 'owl', 'emu', 'yak', 'ant', 'bee', 'cow', 'elk', 'fox', 'gnu', 'hen', 'pig', 'ram', 'bat', 'eel', 'act', 'god', 'cod', 'doc']

/** The hash, shown step by step: { codes: [{ ch, code }], sum, index }. */
export function hashOf(key, buckets) {
  const codes = [...String(key)].map((ch) => ({ ch, code: ch.charCodeAt(0) }))
  const sum = codes.reduce((s, c) => s + c.code, 0)
  return { codes, sum, index: buckets > 0 ? sum % buckets : 0 }
}

export function emptyTable(buckets) {
  return Array.from({ length: Math.max(1, buckets) }, () => [])
}

export const countKeys = (table) => table.reduce((n, chain) => n + chain.length, 0)

export function loadFactor(table) {
  return countKeys(table) / table.length
}

export const needsResize = (table) => loadFactor(table) > RESIZE_AT

/**
 * Insert a key. Returns { table, index, chainBefore, comparisons, duplicate, collision }.
 * comparisons: keys checked in the chain to rule out a duplicate.
 */
export function insert(table, key) {
  const { index } = hashOf(key, table.length)
  const chain = table[index]
  const at = chain.indexOf(key)
  const comparisons = at === -1 ? chain.length : at + 1
  if (at !== -1) return { table, index, chainBefore: chain, comparisons, duplicate: true, collision: false }
  const next = table.map((c, k) => (k === index ? [...c, key] : c))
  return { table: next, index, chainBefore: chain, comparisons, duplicate: false, collision: chain.length > 0 }
}

/** Look a key up. Returns { index, found, comparisons, path } where path is the keys compared. */
export function lookup(table, key) {
  const { index } = hashOf(key, table.length)
  const chain = table[index]
  const path = []
  for (const k of chain) {
    path.push(k)
    if (k === key) return { index, found: true, comparisons: path.length, path }
  }
  return { index, found: false, comparisons: path.length, path }
}

/** Remove a key if present. */
export function remove(table, key) {
  const { index } = hashOf(key, table.length)
  if (!table[index].includes(key)) return { table, index, removed: false }
  return { table: table.map((c, k) => (k === index ? c.filter((x) => x !== key) : c)), index, removed: true }
}

/** Double the bucket count and rehash every key. Returns { table, moves: [{ key, from, to, sum }] }. */
export function resize(table) {
  const size = table.length * 2
  let next = emptyTable(size)
  const moves = []
  table.forEach((chain, from) => {
    for (const key of chain) {
      const { index, sum } = hashOf(key, size)
      next = next.map((c, k) => (k === index ? [...c, key] : c))
      moves.push({ key, from, to: index, sum })
    }
  })
  return { table: next, moves }
}

/** Sorted letters, so the widget can point out anagrams that always collide with this hash. */
export const letters = (key) => [...String(key)].sort().join('')

export function longestChain(table) {
  return table.reduce((m, c) => Math.max(m, c.length), 0)
}
