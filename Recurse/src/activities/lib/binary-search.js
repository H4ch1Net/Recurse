// Binary search game logic: sorted arrays, probes that shrink the low/high range,
// and the numbers behind the log2(n) + 1 guarantee.

/** The most probes binary search can ever need on n sorted items. */
export function maxProbes(n) {
  return n <= 0 ? 0 : Math.floor(Math.log2(n)) + 1
}

/** The index binary search probes: the middle of low..high, rounded down. */
export function middle(low, high) {
  return Math.floor((low + high) / 2)
}

/** True when `index` splits low..high as evenly as possible (either middle when the count is even). */
export function isMiddle(low, high, index) {
  const m = (low + high) / 2
  return index === Math.floor(m) || index === Math.ceil(m)
}

/** n distinct ascending numbers with small random gaps, so neighbors are not predictable. */
export function makeSortedValues(n, random = Math.random) {
  const size = Math.max(1, Math.round(n))
  const out = []
  let v = 1 + Math.floor(random() * 6)
  for (let k = 0; k < size; k++) {
    out.push(v)
    v += 1 + Math.floor(random() * (size > 40 ? 3 : 5))
  }
  return out
}

export function pickTarget(values, random = Math.random) {
  return values[Math.floor(random() * values.length)]
}

export function startSearch(values, target) {
  return { values, target, low: 0, high: values.length - 1, probes: [], found: false }
}

/**
 * Probe one index. Returns { state, outcome, value, ruledOut, even }:
 *   outcome 'found' | 'go-right' (value too small) | 'go-left' (value too big) | 'eliminated' | 'done'
 *   ruledOut: how many boxes this probe removed from the range
 *   even: whether the probe was a middle (best possible) split
 */
export function probe(state, index) {
  if (state.found) return { state, outcome: 'done', value: state.values[index], ruledOut: 0, even: false }
  if (index < state.low || index > state.high) return { state, outcome: 'eliminated', value: state.values[index], ruledOut: 0, even: false }
  const value = state.values[index]
  const even = isMiddle(state.low, state.high, index)
  const before = state.high - state.low + 1
  const probes = [...state.probes, index]
  if (value === state.target) {
    return { state: { ...state, probes, found: true, low: index, high: index }, outcome: 'found', value, ruledOut: before - 1, even }
  }
  if (value < state.target) {
    const next = { ...state, probes, low: index + 1 }
    return { state: next, outcome: 'go-right', value, ruledOut: before - (next.high - next.low + 1), even }
  }
  const next = { ...state, probes, high: index - 1 }
  return { state: next, outcome: 'go-left', value, ruledOut: before - (next.high - next.low + 1), even }
}

/** How many checks a left-to-right scan needs to find the target. */
export function linearChecks(values, target) {
  const k = values.indexOf(target)
  return k === -1 ? values.length : k + 1
}

/** Worst-case items left after each perfect middle probe: 32, 16, 8, 4, 2, 1. Its length is maxProbes(n). */
export function halvingChain(n) {
  const chain = []
  let r = Math.max(0, Math.floor(n))
  if (!r) return chain
  chain.push(r)
  while (r > 1) {
    r = Math.floor(r / 2)
    chain.push(r)
  }
  return chain
}

/** Run the always-probe-the-middle strategy and return the probes it used. */
export function autoSearch(values, target) {
  let state = startSearch(values, target)
  while (!state.found && state.low <= state.high) state = probe(state, middle(state.low, state.high)).state
  return state.probes
}
