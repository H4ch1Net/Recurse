// Growth-rate math for the Big O widget: operation counts, human-scale durations,
// chart samples and the ranking check.

function factorial(n) {
  let out = 1
  for (let k = 2; k <= Math.round(n); k++) out *= k
  return out
}

export const GROWTH = {
  1: { key: '1', label: 'O(1)', name: 'constant', rank: 0, f: () => 1, example: 'Reading an array item by its index' },
  'log n': { key: 'log n', label: 'O(log n)', name: 'logarithmic', rank: 1, f: (n) => Math.log2(n), example: 'Binary search in a sorted list' },
  n: { key: 'n', label: 'O(n)', name: 'linear', rank: 2, f: (n) => n, example: 'Scanning a list once' },
  'n log n': { key: 'n log n', label: 'O(n log n)', name: 'linearithmic', rank: 3, f: (n) => n * Math.log2(n), example: 'Merge sort' },
  'n^2': { key: 'n^2', label: 'O(n²)', name: 'quadratic', rank: 4, f: (n) => n * n, example: 'Comparing every pair, like bubble sort' },
  '2^n': { key: '2^n', label: 'O(2ⁿ)', name: 'exponential', rank: 5, f: (n) => 2 ** n, example: 'Trying every subset of n items' },
  'n!': { key: 'n!', label: 'O(n!)', name: 'factorial', rank: 6, f: factorial, example: 'Trying every ordering of n items' }
}

export const DEFAULT_CLASSES = ['1', 'log n', 'n', 'n log n', 'n^2', '2^n']

/** Valid, de-duplicated classes from props, or the defaults. Needs at least two. */
export function pickClasses(list) {
  const valid = Array.isArray(list) ? [...new Set(list.map(String).filter((c) => GROWTH[c]))] : []
  return valid.length >= 2 ? valid : DEFAULT_CLASSES
}

/** Operations for input size n. Every algorithm takes at least one step. */
export function opsAt(key, n) {
  return Math.max(1, GROWTH[key].f(n))
}

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
const superscript = (n) => String(n).split('').map((c) => SUPERSCRIPT[c] ?? c).join('')

/** 1.8 × 10¹⁹ style text for a big number. */
export function scientific(x, digits = 1) {
  if (!Number.isFinite(x)) return 'more than 10³⁰⁸'
  const exp = Math.floor(Math.log10(x))
  let mant = x / 10 ** exp
  let e = exp
  if (Number(mant.toFixed(digits)) >= 10) {
    mant /= 10
    e += 1
  }
  return `${mant.toFixed(digits)} × 10${superscript(e)}`
}

/** Operation counts: whole numbers with commas, one decimal for small fractions, scientific when huge. */
export function formatCount(x) {
  if (x >= 1e9) return scientific(x)
  if (x < 100 && !Number.isInteger(x)) return String(Math.round(x * 10) / 10)
  return Math.round(x).toLocaleString('en-US')
}

const YEAR_SECONDS = 365.25 * 24 * 3600
const UNIVERSE_YEARS = 1.38e10

function round(x) {
  if (x >= 100) return Math.round(x).toLocaleString('en-US')
  if (x >= 10) return String(Math.round(x))
  return String(Math.round(x * 10) / 10)
}

const plural = (text, value) => (text === '1' ? `${text} ${value}` : `${text} ${value}s`)

/** A duration given in microseconds, in the biggest unit that reads naturally. */
export function formatDuration(us) {
  if (us < 1000) return `${round(us)} µs`
  if (us < 1e6) return `${round(us / 1000)} ms`
  const s = us / 1e6
  if (s < 60) return plural(round(s), 'second')
  if (s < 3600) return plural(round(s / 60), 'minute')
  if (s < 86400) return plural(round(s / 3600), 'hour')
  if (s < YEAR_SECONDS) return plural(round(s / 86400), 'day')
  const years = s / YEAR_SECONDS
  if (years < 1e6) return plural(round(years), 'year')
  if (years < 1e9) return `${round(years / 1e6)} million years`
  if (years < 1e12) return `${round(years / 1e9)} billion years`
  return `${scientific(years)} years`
}

/** A sense of scale for a duration in microseconds, or '' when it is unremarkable. */
export function perspective(us) {
  const s = us / 1e6
  const years = s / YEAR_SECONDS
  if (years >= UNIVERSE_YEARS * 10) return `about ${scientific(years / UNIVERSE_YEARS)} times the age of the universe`
  if (years >= UNIVERSE_YEARS) return `longer than the universe has existed`
  if (years >= 300000) return 'longer than humans have existed'
  if (years >= 4500) return 'longer than the pyramids have stood'
  if (years >= 80) return 'longer than a human lifetime'
  if (s >= 86400) return 'days of waiting'
  if (s >= 60) return 'long enough to go make coffee'
  if (s >= 1) return 'a noticeable wait'
  return ''
}

/** Classes from slowest-growing to fastest-growing. */
export function correctOrder(keys) {
  return [...keys].sort((a, b) => GROWTH[a].rank - GROWTH[b].rank)
}

/** Check a ranking. Returns { correct, marks (per position), right (count) }. */
export function checkRanking(order, keys = order) {
  const answer = correctOrder(keys)
  const marks = answer.map((key, k) => order[k] === key)
  const right = marks.filter(Boolean).length
  return { correct: order.length === answer.length && right === answer.length, marks, right }
}

/** Points [n, ops] for a curve from n = 1 to nMax. Factorial is sampled at whole numbers. */
export function sampleCurve(key, nMax, samples = 80) {
  const points = []
  if (key === 'n!') {
    for (let n = 1; n <= Math.max(1, Math.floor(nMax)); n++) points.push([n, opsAt(key, n)])
    return points
  }
  for (let k = 0; k <= samples; k++) {
    const n = 1 + ((nMax - 1) * k) / samples
    points.push([n, opsAt(key, n)])
  }
  return points
}
