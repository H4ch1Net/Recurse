// Simulations and exact formulas for the probability-sim widget: coin flips, dice sums and the
// birthday problem. Every simulator takes an rng() returning [0, 1) so tests can seed it.

/** Small, fast seeded generator. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const RUN_SIZES = [1, 10, 100, 1000, 10000]
export const ENOUGH = 1000
export const MAX_FLIPS = 200000

// ---- Exact binomial probabilities ------------------------------------------------------

const SMALL_LOG_FACT = [0]
for (let n = 1; n < 30; n++) SMALL_LOG_FACT[n] = SMALL_LOG_FACT[n - 1] + Math.log(n)

/** ln(n!) exactly for small n, Stirling series beyond (accurate to about 1e-12). */
export function logFactorial(n) {
  if (n < 30) return SMALL_LOG_FACT[n]
  return n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n) + 1 / (12 * n) - 1 / (360 * n ** 3) + 1 / (1260 * n ** 5)
}

export function binomialPmf(n, k, p = 0.5) {
  if (k < 0 || k > n) return 0
  if (p <= 0) return k === 0 ? 1 : 0
  if (p >= 1) return k === n ? 1 : 0
  return Math.exp(logFactorial(n) - logFactorial(k) - logFactorial(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

/** P(lo <= X <= hi) for X ~ Binomial(n, p). */
export function binomialRangeProb(n, lo, hi, p = 0.5) {
  let sum = 0
  for (let k = Math.max(0, lo); k <= Math.min(n, hi); k++) sum += binomialPmf(n, k, p)
  return Math.min(1, sum)
}

/** Chance that n flips land within `half` of p as a share of heads (inclusive). */
export function bandProb(n, p = 0.5, half = 0.05) {
  const lo = Math.ceil(n * (p - half) - 1e-9)
  const hi = Math.floor(n * (p + half) + 1e-9)
  return binomialRangeProb(n, lo, hi, p)
}

// ---- Coins ---------------------------------------------------------------------------------

/** Flip counts at which the running share is recorded: every flip up to 200, then about 1.5% apart. */
function nextCheckpoint(n) {
  return n < 200 ? n + 1 : Math.max(n + 1, Math.round(n * 1.015))
}

export const emptyCoinRun = () => ({ flips: 0, heads: 0, points: [], recent: [], next: 1 })

/**
 * Adds `count` flips to a run. Returns a new run: totals, chart points [{ n, heads }]
 * (at checkpoints and at the end of the batch) and the last 20 flips (1 = heads).
 */
export function extendCoinRun(run, count, rng = Math.random, p = 0.5) {
  const n = Math.max(0, Math.min(count, MAX_FLIPS - run.flips))
  let { flips, heads, next } = run
  const points = run.points.slice()
  const recent = run.recent.slice()
  for (let k = 0; k < n; k++) {
    const h = rng() < p ? 1 : 0
    flips++
    heads += h
    if (k >= n - 20) recent.push({ id: flips, h })
    if (flips === next) {
      points.push({ n: flips, heads })
      next = nextCheckpoint(flips)
    }
  }
  if (n && points[points.length - 1]?.n !== flips) points.push({ n: flips, heads })
  return { flips, heads, points, recent: recent.slice(-20), next }
}

// ---- Dice ----------------------------------------------------------------------------------

/** Exact probabilities of each sum of `count` six-sided dice, indexed by the sum. */
export function diceDistribution(count = 2) {
  let dist = [1]
  for (let d = 0; d < count; d++) {
    const next = new Array(dist.length + 6).fill(0)
    dist.forEach((pr, s) => {
      for (let face = 1; face <= 6; face++) next[s + face] += pr / 6
    })
    dist = next
  }
  return dist
}

/** The most likely sums (two of them tie for three dice). */
export function diceModes(count = 2) {
  const dist = diceDistribution(count)
  const max = Math.max(...dist)
  return dist.map((p, s) => (Math.abs(p - max) < 1e-12 ? s : -1)).filter((s) => s >= 0)
}

/** Rolls `count` dice `times` times. Returns counts per sum and the faces of the last roll. */
export function rollDice(times, count = 2, rng = Math.random) {
  const counts = new Array(6 * count + 1).fill(0)
  let last = []
  for (let t = 0; t < times; t++) {
    let sum = 0
    const faces = []
    for (let d = 0; d < count; d++) {
      const face = 1 + Math.floor(rng() * 6)
      faces.push(face)
      sum += face
    }
    counts[sum]++
    if (t === times - 1) last = faces
  }
  return { counts, last }
}

// ---- Birthdays -----------------------------------------------------------------------------

/** Exact chance that at least two of k people share a birthday (365 equally likely days). */
export function birthdayExact(k, days = 365) {
  if (k > days) return 1
  let none = 1
  for (let i = 0; i < k; i++) none *= (days - i) / days
  return 1 - none
}

/** Smallest group size whose chance passes p. */
export function birthdayThreshold(p = 0.5, days = 365) {
  for (let k = 1; k <= days + 1; k++) if (birthdayExact(k, days) > p) return k
  return days + 1
}

/** Simulates `trials` rooms of k people. Returns how many had a shared birthday and the last room. */
export function birthdaySim(k, trials, rng = Math.random, days = 365) {
  const seen = new Int32Array(days)
  let shared = 0
  let lastRoom = null
  for (let t = 1; t <= trials; t++) {
    let hit = false
    const isLast = t === trials
    const room = isLast ? [] : null
    let pair = null
    for (let i = 0; i < k; i++) {
      const day = Math.floor(rng() * days)
      if (isLast) room.push(day)
      if (seen[day] === t) {
        if (!hit && isLast) pair = day
        hit = true
        if (!isLast) break
      }
      seen[day] = t
    }
    if (hit) shared++
    if (isLast) lastRoom = { days: room, shared: pair }
  }
  return { shared, trials, lastRoom }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Day 0 is Jan 1 in a non-leap year. */
export function dayLabel(day) {
  let d = day
  for (let m = 0; m < 12; m++) {
    if (d < MONTH_DAYS[m]) return `${MONTHS[m]} ${d + 1}`
    d -= MONTH_DAYS[m]
  }
  return 'Dec 31'
}

/** Number of pairs in a group of k people: the reason the birthday chance climbs so fast. */
export const pairCount = (k) => (k * (k - 1)) / 2
