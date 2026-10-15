// Dynamic programming tables, cell by cell, for the dp-table widget.
// Every builder returns the same shape so one widget can draw and quiz any of them:
// { problem, rows, cols, rowHeads, colHeads, values, steps, answer, intro, rule, hint, question, answerText }
// steps: [{ r, c, value, base, deps: [{ r, c, used }], formula, explain }] in fill order.

export const PROBLEMS = {
  'grid-paths': 'Grid paths',
  'coin-change': 'Coin change',
  lcs: 'Common subsequence'
}

export const fmtValue = (v) => (v === Infinity ? '∞' : String(v))

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback
}

const grid2d = (rows, cols, fill) => Array.from({ length: rows }, () => new Array(cols).fill(fill))

// ---- Unique paths in an m x n grid ----------------------------------------------

export function gridPaths(m = 3, n = 4) {
  const rows = clampInt(m, 2, 6, 3)
  const cols = clampInt(n, 2, 7, 4)
  const values = grid2d(rows, cols, 0)
  const steps = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || c === 0) {
        values[r][c] = 1
        const explain =
          r === 0 && c === 0
            ? 'The start square: there is exactly 1 way to be here, by not moving.'
            : r === 0
              ? `Top row: the robot can only arrive from the left, so there is just 1 route to (${r}, ${c}).`
              : `Left column: the robot can only arrive from above, so there is just 1 route to (${r}, ${c}).`
        steps.push({ r, c, value: 1, base: true, deps: [], formula: `(${r}, ${c}) = 1`, explain })
        continue
      }
      const up = values[r - 1][c]
      const left = values[r][c - 1]
      const value = up + left
      values[r][c] = value
      steps.push({
        r,
        c,
        value,
        base: false,
        deps: [
          { r: r - 1, c, used: true },
          { r, c: c - 1, used: true }
        ],
        formula: `(${r}, ${c}) = above + left = ${up} + ${left} = ${value}`,
        explain: `Every route into (${r}, ${c}) arrives from above (${up} routes) or from the left (${left} routes). Add them: ${up} + ${left} = ${value}.`
      })
    }
  }
  const total = values[rows - 1][cols - 1]
  return {
    problem: 'grid-paths',
    rows,
    cols,
    rowHeads: Array.from({ length: rows }, (_, r) => String(r)),
    colHeads: Array.from({ length: cols }, (_, c) => String(c)),
    values,
    steps,
    answer: { r: rows - 1, c: cols - 1 },
    cellLabel: (r, c) => `cell (${r}, ${c})`,
    intro: `A robot starts at the top-left of a ${rows} by ${cols} grid and only moves right or down. Each cell counts the routes from the start to that cell.`,
    rule: 'routes(r, c) = routes(r - 1, c) + routes(r, c - 1)',
    hint: 'Add the cell above and the cell to the left.',
    question: 'Which cell holds the number of routes to the bottom-right corner?',
    answerText: `${total} different routes reach the bottom-right corner.`
  }
}

// ---- Minimum coins for every amount 0..N ------------------------------------------

/** Coins used by the greedy "largest coin first" strategy, or null when it gets stuck. */
export function greedyCoins(coins, amount) {
  const sorted = [...coins].sort((a, b) => b - a)
  const used = []
  let left = amount
  for (const coin of sorted) {
    while (left >= coin) {
      used.push(coin)
      left -= coin
    }
  }
  return left === 0 ? used : null
}

export function coinChange(coinList = [1, 3, 4], target = 6) {
  const coins = [...new Set((Array.isArray(coinList) ? coinList : []).map((c) => Math.round(Number(c))).filter((c) => c >= 1 && c <= 12))].sort((a, b) => a - b)
  if (!coins.length) coins.push(1, 3, 4)
  const amount = clampInt(target, 1, 12, 6)
  const dp = new Array(amount + 1).fill(Infinity)
  const pick = new Array(amount + 1).fill(0)
  dp[0] = 0
  const steps = [{ r: 0, c: 0, value: 0, base: true, deps: [], formula: 'coins(0) = 0', explain: 'Making 0 needs no coins at all. This is the base case everything else builds on.' }]
  for (let a = 1; a <= amount; a++) {
    const options = coins.filter((coin) => coin <= a).map((coin) => ({ coin, rest: a - coin, prev: dp[a - coin], total: dp[a - coin] + 1 }))
    let best = Infinity
    for (const o of options) {
      if (o.total < best) {
        best = o.total
        pick[a] = o.coin
      }
    }
    dp[a] = best
    let chosen = false
    const deps = options.map((o) => {
      const used = !chosen && o.total === best && best !== Infinity
      if (used) chosen = true
      return { r: 0, c: o.rest, used }
    })
    const formula = options.length
      ? `coins(${a}) = 1 + min(${options.map((o) => `coins(${o.rest})`).join(', ')}) = 1 + min(${options.map((o) => fmtValue(o.prev)).join(', ')}) = ${fmtValue(best)}`
      : `coins(${a}) = ∞`
    const explain = !options.length
      ? `No coin is small enough to make ${a}, so it cannot be made: ∞.`
      : best === Infinity
        ? `Every coin leaves an amount that cannot be made, so ${a} cannot be made either: ∞.`
        : `Try each coin as the last one: ${options.map((o) => `a ${o.coin} leaves ${o.rest}, which needs ${fmtValue(o.prev)}`).join('; ')}. The best choice is a ${pick[a]}, so ${a} needs 1 + ${fmtValue(dp[a - pick[a]])} = ${best} ${best === 1 ? 'coin' : 'coins'}.`
    steps.push({ r: 0, c: a, value: best, base: false, deps, formula, explain })
  }
  const used = []
  if (dp[amount] !== Infinity) {
    for (let left = amount; left > 0; left -= pick[left]) used.push(pick[left])
  }
  const greedy = greedyCoins(coins, amount)
  const greedyNote = greedy && greedy.length > used.length ? ` A greedy pick (largest coin first) would need ${greedy.length}: ${greedy.join(' + ')}.` : ''
  return {
    problem: 'coin-change',
    rows: 1,
    cols: amount + 1,
    rowHeads: ['coins'],
    colHeads: Array.from({ length: amount + 1 }, (_, a) => String(a)),
    values: [dp],
    steps,
    coins,
    amount,
    used,
    answer: { r: 0, c: amount },
    cellLabel: (r, c) => `amount ${c}`,
    intro: `Coins: ${coins.join(', ')}. Each cell holds the fewest coins that add up to that amount (∞ if it cannot be made).`,
    rule: 'coins(a) = 1 + the smallest coins(a - coin), over every coin that fits',
    hint: 'Try each coin as the last coin: 1 + the answer for what is left. Keep the smallest.',
    question: `Which cell tells you the fewest coins for ${amount}?`,
    answerText:
      dp[amount] === Infinity
        ? `${amount} cannot be made from these coins.`
        : `${amount} needs ${dp[amount]} ${dp[amount] === 1 ? 'coin' : 'coins'}: ${used.join(' + ')}.${greedyNote}`
  }
}

// ---- Longest common subsequence ---------------------------------------------------

export function lcsString(a, b, values) {
  let r = a.length
  let c = b.length
  const out = []
  while (r > 0 && c > 0) {
    if (a[r - 1] === b[c - 1]) {
      out.push(a[r - 1])
      r--
      c--
    } else if (values[r - 1][c] >= values[r][c - 1]) r--
    else c--
  }
  return out.reverse().join('')
}

const cleanWord = (w, fallback) => {
  const s = String(w || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6)
  return s || fallback
}

export function lcs(first = 'SEND', second = 'ENDS') {
  const a = cleanWord(first, 'SEND')
  const b = cleanWord(second, 'ENDS')
  const rows = a.length + 1
  const cols = b.length + 1
  const values = grid2d(rows, cols, 0)
  const steps = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || c === 0) {
        steps.push({ r, c, value: 0, base: true, deps: [], formula: `(${r}, ${c}) = 0`, explain: 'An empty prefix shares nothing with anything, so this cell is 0.' })
        continue
      }
      const x = a[r - 1]
      const y = b[c - 1]
      if (x === y) {
        const diag = values[r - 1][c - 1]
        const value = diag + 1
        values[r][c] = value
        steps.push({
          r,
          c,
          value,
          base: false,
          deps: [{ r: r - 1, c: c - 1, used: true }],
          formula: `${x} = ${y}, a match: 1 + diagonal = 1 + ${diag} = ${value}`,
          explain: `${x} matches ${y}. Take the best answer without both letters (the diagonal, ${diag}) and add 1 for this shared letter.`
        })
      } else {
        const up = values[r - 1][c]
        const left = values[r][c - 1]
        const value = Math.max(up, left)
        values[r][c] = value
        steps.push({
          r,
          c,
          value,
          base: false,
          deps: [
            { r: r - 1, c, used: up >= left },
            { r, c: c - 1, used: left > up }
          ],
          formula: `${x} ≠ ${y}: max(above, left) = max(${up}, ${left}) = ${value}`,
          explain: `${x} and ${y} differ, so one of them is not part of the answer. Drop a letter and keep the better result: the larger of above (${up}) and left (${left}).`
        })
      }
    }
  }
  const total = values[rows - 1][cols - 1]
  const str = lcsString(a, b, values)
  return {
    problem: 'lcs',
    rows,
    cols,
    rowHeads: ['·', ...a],
    colHeads: ['·', ...b],
    values,
    steps,
    a,
    b,
    lcs: str,
    answer: { r: rows - 1, c: cols - 1 },
    cellLabel: (r, c) => `${a.slice(0, r) || 'empty'} and ${b.slice(0, c) || 'empty'}`,
    intro: `Rows are prefixes of ${a}, columns are prefixes of ${b}. Each cell holds the length of the longest sequence of letters both prefixes share, in order.`,
    rule: 'letters match: 1 + diagonal. Otherwise: max(above, left)',
    hint: 'Compare the row letter with the column letter. Same letter: 1 + diagonal. Different: the larger of above and left.',
    question: `Which cell holds the answer for all of ${a} and all of ${b}?`,
    answerText: total ? `The longest common subsequence of ${a} and ${b} is "${str}", length ${total}.` : `${a} and ${b} share no letters, so the answer is 0.`
  }
}

/** Builds the table for a problem name with optional params from content. */
export function buildProblem(problem, params = {}) {
  if (problem === 'coin-change') return coinChange(params.coins, params.amount)
  if (problem === 'lcs') return lcs(params.a, params.b)
  return gridPaths(params.m, params.n)
}

const WORD_PAIRS = [
  ['SEND', 'ENDS'],
  ['CAKE', 'BAKER'],
  ['RIVER', 'DRIVE'],
  ['MOUSE', 'HOUSE'],
  ['STONE', 'NOTES'],
  ['ABCBD', 'BDCAB']
]
const COIN_SETS = [
  [[1, 3, 4], 6],
  [[1, 5, 6], 10],
  [[1, 2, 5], 11],
  [[1, 4, 5], 8],
  [[2, 3], 7],
  [[1, 3, 5], 9]
]

/** Fresh numbers for "New numbers". */
export function randomParams(problem, rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length)]
  if (problem === 'coin-change') {
    const [coins, amount] = pick(COIN_SETS)
    return { coins, amount }
  }
  if (problem === 'lcs') {
    const [a, b] = pick(WORD_PAIRS)
    return { a, b }
  }
  return { m: 2 + Math.floor(rng() * 3), n: 3 + Math.floor(rng() * 3) }
}

/** Reads what the learner typed: a whole number, or infinity written as ∞, inf or none. */
export function parseCellInput(text) {
  const s = String(text ?? '').trim().toLowerCase()
  if (!s) return null
  if (['∞', 'inf', 'infinity', 'none', 'x', 'impossible'].includes(s)) return Infinity
  if (!/^-?\d+$/.test(s)) return null
  return Number(s)
}
