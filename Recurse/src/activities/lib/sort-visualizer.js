// Sorting algorithms as step generators, plus a tracer that turns the steps into frames
// a widget can scrub through. Every generator works on its own copy and yields
// self-describing steps:
//   { type: 'compare', i, j }         compare the values at positions i and j
//   { type: 'swap', i, j }            swap positions i and j
//   { type: 'overwrite', i, from }    write one value into position i (merge sort). The value
//                                     comes from position `from` (from >= i) and the values in
//                                     between shift right by one, so the array on screen is a
//                                     real permutation at every step.
//   { type: 'sorted', indices }       these positions hold their final values
//   { type: 'mark', i }               highlight a pivot or current minimum (i = null clears)
//   { type: 'range', lo, hi }         the part of the array being worked on (lo = null clears)
// Each step carries a `note`: a plain sentence describing it for the caption.

export const SORT_ALGORITHMS = ['bubble', 'selection', 'insertion', 'merge', 'quick']

export const SORT_INFO = {
  bubble: {
    label: 'Bubble',
    name: 'Bubble sort',
    big: 'O(n²)',
    blurb: 'Walk the array, swapping neighbors that are out of order. Each pass bubbles the biggest value to the end.',
    mark: null
  },
  selection: {
    label: 'Selection',
    name: 'Selection sort',
    big: 'O(n²)',
    blurb: 'Find the smallest remaining value and swap it into the next slot. Repeat.',
    mark: 'current minimum'
  },
  insertion: {
    label: 'Insertion',
    name: 'Insertion sort',
    big: 'O(n²), fast on nearly sorted data',
    blurb: 'Take each value in turn and slide it left until it fits, like sorting a hand of cards.',
    mark: null
  },
  merge: {
    label: 'Merge',
    name: 'Merge sort',
    big: 'O(n log n)',
    blurb: 'Split the array into halves, sort each half, then merge the two sorted halves.',
    mark: null
  },
  quick: {
    label: 'Quick',
    name: 'Quick sort',
    big: 'O(n log n) on average, O(n²) worst case',
    blurb: 'Pick a pivot, move smaller values to its left and the rest to its right, then sort each side.',
    mark: 'pivot'
  }
}

const span = (lo, hi) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, k) => lo + k)

function swapIn(a, i, j) {
  const t = a[i]
  a[i] = a[j]
  a[j] = t
}

/** Move the value at `from` to `to` (to <= from), shifting the values in between right. */
function moveIn(a, from, to) {
  const [v] = a.splice(from, 1)
  a.splice(to, 0, v)
}

export function* bubbleSort(input) {
  const a = [...input]
  const n = a.length
  if (n <= 1) {
    yield { type: 'sorted', indices: span(0, n - 1), note: 'Nothing to sort.' }
    return
  }
  for (let end = n - 1; end > 0; end--) {
    let swapped = false
    yield { type: 'range', lo: 0, hi: end, note: `Pass ${n - end}: walk positions 0 to ${end}, swapping neighbors that are out of order.` }
    for (let j = 0; j < end; j++) {
      const x = a[j]
      const y = a[j + 1]
      const out = x > y
      yield { type: 'compare', i: j, j: j + 1, note: out ? `Compare ${x} and ${y}: ${x} is bigger, so they swap.` : `Compare ${x} and ${y}: already in order, leave them.` }
      if (out) {
        swapIn(a, j, j + 1)
        swapped = true
        yield { type: 'swap', i: j, j: j + 1, note: `Swap ${x} and ${y}. ${x} keeps moving right.` }
      }
    }
    yield { type: 'sorted', indices: [end], note: `${a[end]} has bubbled to its final spot at the end.` }
    if (!swapped) {
      yield { type: 'range', lo: null, note: '' }
      yield { type: 'sorted', indices: span(0, end - 1), note: 'A whole pass with no swaps means everything is in order, so bubble sort stops early.' }
      return
    }
  }
  yield { type: 'range', lo: null, note: '' }
  yield { type: 'sorted', indices: [0], note: 'Only one value is left, so it is already in place. Sorted!' }
}

export function* selectionSort(input) {
  const a = [...input]
  const n = a.length
  for (let i = 0; i < n - 1; i++) {
    let min = i
    yield { type: 'range', lo: i, hi: n - 1, note: `Find the smallest value from position ${i} onward.` }
    yield { type: 'mark', i: min, note: `Start by assuming ${a[i]} is the smallest.` }
    for (let j = i + 1; j < n; j++) {
      const smaller = a[j] < a[min]
      yield { type: 'compare', i: min, j, note: smaller ? `Compare ${a[j]} with the minimum ${a[min]}: ${a[j]} is smaller.` : `Compare ${a[j]} with the minimum ${a[min]}: not smaller.` }
      if (smaller) {
        min = j
        yield { type: 'mark', i: min, note: `${a[min]} is the new minimum.` }
      }
    }
    if (min !== i) {
      const x = a[i]
      const y = a[min]
      swapIn(a, i, min)
      yield { type: 'swap', i, j: min, note: `Swap the minimum ${y} into position ${i}, trading places with ${x}.` }
    }
    yield { type: 'sorted', indices: [i], note: `${a[i]} is in its final spot.` }
  }
  yield { type: 'range', lo: null, note: '' }
  yield { type: 'sorted', indices: span(0, n - 1), note: n > 1 ? `The last value, ${a[n - 1]}, is the biggest. Sorted!` : 'Nothing to sort.' }
}

export function* insertionSort(input) {
  const a = [...input]
  const n = a.length
  for (let i = 1; i < n; i++) {
    yield { type: 'range', lo: 0, hi: i, note: `Positions 0 to ${i - 1} are sorted so far. Take ${a[i]} and slide it left until it fits.` }
    let j = i
    while (j > 0) {
      const x = a[j - 1]
      const y = a[j]
      const out = x > y
      yield { type: 'compare', i: j - 1, j, note: out ? `Compare ${x} and ${y}: ${x} is bigger, so ${y} moves left.` : `Compare ${x} and ${y}: ${y} fits here, stop.` }
      if (!out) break
      swapIn(a, j - 1, j)
      yield { type: 'swap', i: j - 1, j, note: `${y} slides left past ${x}.` }
      j--
    }
  }
  yield { type: 'range', lo: null, note: '' }
  yield { type: 'sorted', indices: span(0, n - 1), note: n > 1 ? 'Every value has been inserted into place. Sorted!' : 'Nothing to sort.' }
}

export function* mergeSort(input) {
  const a = [...input]
  const n = a.length

  function* merge(lo, mid, hi) {
    yield { type: 'range', lo, hi, note: `Merge the sorted halves ${lo} to ${mid} and ${mid + 1} to ${hi}.` }
    let k = lo
    let left = mid - lo + 1
    let right = hi - mid
    while (left > 0 && right > 0) {
      const li = k
      const ri = k + left
      const x = a[li]
      const y = a[ri]
      const takeLeft = x <= y
      yield { type: 'compare', i: li, j: ri, note: takeLeft ? `Front of each half: ${x} and ${y}. ${x} is smaller or equal, take it.` : `Front of each half: ${x} and ${y}. ${y} is smaller, take it.` }
      if (takeLeft) {
        yield { type: 'overwrite', i: k, from: li, note: `Write ${x} into position ${k}.` }
        left--
      } else {
        moveIn(a, ri, k)
        yield { type: 'overwrite', i: k, from: ri, note: `Write ${y} into position ${k}.` }
        right--
      }
      k++
    }
    const rest = left > 0 ? 'left' : 'right'
    while (left + right > 0) {
      yield { type: 'overwrite', i: k, from: k, note: `The other half is used up, so copy ${a[k]} from the ${rest} half.` }
      if (left > 0) left--
      else right--
      k++
    }
  }

  function* sort(lo, hi) {
    if (lo >= hi) return
    const mid = (lo + hi) >> 1
    yield* sort(lo, mid)
    yield* sort(mid + 1, hi)
    yield* merge(lo, mid, hi)
    if (lo === 0 && hi === n - 1) {
      yield { type: 'range', lo: null, note: '' }
      yield { type: 'sorted', indices: span(0, n - 1), note: 'The last merge combined both halves. Sorted!' }
    }
  }

  if (n <= 1) {
    yield { type: 'sorted', indices: span(0, n - 1), note: 'Nothing to sort.' }
    return
  }
  yield* sort(0, n - 1)
}

export function* quickSort(input) {
  const a = [...input]
  const n = a.length

  function* quick(lo, hi) {
    if (lo > hi) return
    if (lo === hi) {
      yield { type: 'sorted', indices: [lo], note: `${a[lo]} is alone in its range, so it is already in its final spot.` }
      return
    }
    const p = a[hi]
    yield { type: 'range', lo, hi, note: `Partition positions ${lo} to ${hi}.` }
    yield { type: 'mark', i: hi, note: `The pivot is ${p}, the last value in this range.` }
    let i = lo
    for (let j = lo; j < hi; j++) {
      const less = a[j] < p
      yield { type: 'compare', i: j, j: hi, note: less ? `${a[j]} is smaller than the pivot ${p}, so it belongs on the left side.` : `${a[j]} is not smaller than the pivot ${p}, so it stays on the right side.` }
      if (less) {
        if (i !== j) {
          const x = a[i]
          const y = a[j]
          swapIn(a, i, j)
          yield { type: 'swap', i, j, note: `Swap ${y} into the left side, trading places with ${x}.` }
        }
        i++
      }
    }
    if (i !== hi) {
      const x = a[i]
      swapIn(a, i, hi)
      yield { type: 'swap', i, j: hi, note: `Put the pivot ${p} between the two sides, trading places with ${x}.` }
    }
    yield { type: 'mark', i: null, note: '' }
    yield { type: 'sorted', indices: [i], note: `${p} is in its final spot: smaller values on its left, the rest on its right.` }
    yield* quick(lo, i - 1)
    yield* quick(i + 1, hi)
  }

  if (n === 0) {
    yield { type: 'sorted', indices: [], note: 'Nothing to sort.' }
    return
  }
  yield* quick(0, n - 1)
  yield { type: 'range', lo: null, note: 'Every pivot is in place. Sorted!' }
}

export const SORT_GENERATORS = {
  bubble: bubbleSort,
  selection: selectionSort,
  insertion: insertionSort,
  merge: mergeSort,
  quick: quickSort
}

/**
 * Run an algorithm to the end and record a frame per step.
 * Frame: { values, ids, sorted, active, kind, mark, range, comparisons, swaps, writes, caption }.
 * `ids` follow each value as it moves so a renderer can animate bars sliding.
 */
export function traceSort(name, input) {
  const gen = (SORT_GENERATORS[name] || bubbleSort)(input)
  const values = [...input]
  const ids = input.map((_, k) => k)
  const sorted = input.map(() => false)
  let comparisons = 0
  let swaps = 0
  let writes = 0
  let mark = null
  let range = null
  let caption = `${SORT_INFO[name]?.name || 'Sort'}: ${SORT_INFO[name]?.blurb || ''} Press Play or Step.`
  const frames = [{ values: [...values], ids: [...ids], sorted: [...sorted], active: [], kind: 'start', mark, range, comparisons, swaps, writes, caption }]

  for (const step of gen) {
    let active = []
    switch (step.type) {
      case 'compare':
        comparisons++
        active = [step.i, step.j]
        break
      case 'swap':
        swaps++
        writes += 2
        swapIn(values, step.i, step.j)
        swapIn(ids, step.i, step.j)
        active = [step.i, step.j]
        break
      case 'overwrite':
        writes++
        moveIn(values, step.from, step.i)
        moveIn(ids, step.from, step.i)
        active = [step.i]
        break
      case 'sorted':
        for (const k of step.indices) sorted[k] = true
        mark = null
        break
      case 'mark':
        mark = step.i
        break
      case 'range':
        range = step.lo === null || step.lo === undefined ? null : [step.lo, step.hi]
        break
      default:
        break
    }
    if (step.note) caption = step.note
    // Range and mark changes with no caption fold into the next frame instead of adding a pause.
    if (!step.note && (step.type === 'range' || step.type === 'mark')) continue
    frames.push({ values: [...values], ids: [...ids], sorted: [...sorted], active, kind: step.type, mark, range, comparisons, swaps, writes, caption })
  }
  // Fold any trailing silent range or mark change into the last frame.
  const last = frames[frames.length - 1]
  last.mark = mark
  last.range = range
  return { frames, comparisons, swaps, writes, values }
}

export function isSortedAscending(list) {
  for (let k = 1; k < list.length; k++) if (list[k - 1] > list[k]) return false
  return true
}

export const SORT_PRESETS = {
  random: 'Random',
  nearly: 'Nearly sorted',
  reversed: 'Reversed',
  few: 'Few unique'
}

/** A starting array of `n` values between 5 and 99 in the chosen shape. */
export function makeArray(n, preset = 'random', random = Math.random) {
  const size = Math.max(2, Math.min(64, Math.round(n) || 10))
  const rand = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1))
  if (preset === 'few') {
    const levels = [20, 45, 70, 95]
    return Array.from({ length: size }, () => levels[rand(0, levels.length - 1)])
  }
  // Distinct values spread across the range so bars are easy to tell apart.
  const pool = Array.from({ length: 95 }, (_, k) => k + 5)
  for (let k = pool.length - 1; k > 0; k--) {
    const j = rand(0, k)
    swapIn(pool, k, j)
  }
  const values = pool.slice(0, size)
  if (preset === 'random') return values
  values.sort((x, y) => x - y)
  if (preset === 'reversed') return values.reverse()
  // Nearly sorted: a couple of neighbor swaps.
  const swapsWanted = Math.max(1, Math.round(size / 8))
  for (let s = 0; s < swapsWanted; s++) {
    const k = rand(0, size - 2)
    swapIn(values, k, k + 1)
  }
  return values
}

/** Comparisons and swaps/writes for every algorithm on one array, for the summary table. */
export function compareAll(input, names = SORT_ALGORITHMS) {
  return names.map((name) => {
    const { comparisons, swaps, writes } = traceSort(name, input)
    return { name, comparisons, swaps, writes }
  })
}
