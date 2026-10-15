// Regex tester logic: compiling with friendly errors, finding matches with limits, puzzle
// grading and a guard against catastrophic backtracking. runRegexJob is self-contained (no
// outside references) so the widget can run it inside a Web Worker and terminate the
// worker if a pattern runs away.

export const MAX_TEXT = 5000
export const MAX_MATCHES = 300
export const TIME_BUDGET_MS = 300
export const ALLOWED_FLAGS = ['g', 'i', 'm']

const HINTS = [
  [/Unterminated group/i, 'A ( has no matching ).'],
  [/Unmatched '\)'|Unmatched \)/i, 'There is a ) without a matching (.'],
  [/Nothing to repeat/i, 'A quantifier like *, + or ? needs something in front of it. Escape it (\\*) to match the symbol itself.'],
  [/Unterminated character class|missing \/|Unterminated character/i, 'A [ has no matching ].'],
  [/Lone quantifier brackets|Incomplete quantifier/i, 'A { } quantifier looks unfinished. Escape the brace (\\{) to match it literally.'],
  [/\\ at end of pattern/i, 'The pattern ends with a lone backslash.'],
  [/Invalid group/i, 'That (? group syntax is not valid. Try (?:...) or (?<name>...).'],
  [/range out of order/i, 'A range like [z-a] is backwards. Put the smaller character first: [a-z].'],
  [/numbers out of order/i, 'In {min,max} the first number must be the smaller one.'],
  [/Invalid capture group name|Duplicate capture group name/i, 'Group names must be unique and made of letters, digits and _.'],
  [/Invalid escape|Invalid Unicode escape/i, 'That backslash escape is not valid here.']
]

/** Compile a pattern. Returns { regex, error: null } or { regex: null, error: { message, hint } }. */
export function compile(pattern, flags = '') {
  const clean = [...new Set(String(flags).split(''))].filter((f) => 'gimsuy'.includes(f)).join('')
  try {
    return { regex: new RegExp(pattern, clean), error: null }
  } catch (e) {
    const raw = String(e?.message || e)
    const message = raw.replace(/^Invalid regular expression: \/.*\/[a-z]*: /, '').replace(/^Invalid regular expression: /, '')
    const hint = HINTS.find(([re]) => re.test(raw))?.[1] ?? 'Check for a stray (, [, { or backslash.'
    return { regex: null, error: { message, hint } }
  }
}

/**
 * The matching core, used both directly and inside a worker. Must stay self-contained.
 * job: { kind: 'matches', pattern, flags, text, maxMatches, maxText, budgetMs }
 *    -> { ok, matches: [{ index, end, text, groups: [{ n, name, text, index }] }], truncated, timedOut, clipped }
 * job: { kind: 'cases', pattern, flags, cases: [string], budgetMs }
 *    -> { ok, results: [true | false | null], ranges: [[start, end] | null], timedOut }
 */
export function runRegexJob(job) {
  const start = Date.now()
  const budget = job.budgetMs || 300
  let re
  let withIndices = true
  const baseFlags = String(job.flags || '').replace(/[^gimsuy]/g, '')
  try {
    re = new RegExp(job.pattern, `${baseFlags}d`)
  } catch {
    withIndices = false
    try {
      re = new RegExp(job.pattern, baseFlags)
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) }
    }
  }
  if (job.kind === 'cases') {
    const single = new RegExp(re.source, re.flags.replace(/[gyd]/g, ''))
    const results = []
    const ranges = []
    let timedOut = false
    for (const c of job.cases || []) {
      if (timedOut || Date.now() - start > budget) {
        timedOut = true
        results.push(null)
        ranges.push(null)
        continue
      }
      const m = single.exec(String(c))
      results.push(m !== null)
      ranges.push(m ? [m.index, m.index + m[0].length] : null)
    }
    return { ok: true, results, ranges, timedOut }
  }
  const maxText = job.maxText || 5000
  const full = String(job.text || '')
  const text = full.length > maxText ? full.slice(0, maxText) : full
  const maxMatches = job.maxMatches || 300
  const matches = []
  let truncated = false
  let timedOut = false
  // Group names in order of their opening parenthesis (null for unnamed groups).
  const groupNames = []
  const src = re.source
  let inClass = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') {
      i++
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      continue
    }
    if (c === '[') {
      inClass = true
      continue
    }
    if (c !== '(') continue
    if (src[i + 1] !== '?') groupNames.push(null)
    else if (src[i + 2] === '<' && src[i + 3] !== '=' && src[i + 3] !== '!') groupNames.push(src.slice(i + 3, src.indexOf('>', i)))
  }
  const toMatch = (m) => {
    const groups = []
    for (let n = 1; n < m.length; n++) {
      groups.push({ n, name: groupNames[n - 1] || null, text: m[n] === undefined ? null : m[n], index: withIndices && m.indices && m.indices[n] ? m.indices[n][0] : null })
    }
    return { index: m.index, end: m.index + m[0].length, text: m[0], groups }
  }
  if (!re.global) {
    const m = re.exec(text)
    if (m) matches.push(toMatch(m))
  } else {
    re.lastIndex = 0
    for (;;) {
      const m = re.exec(text)
      if (!m) break
      matches.push(toMatch(m))
      if (m[0] === '') re.lastIndex++
      if (matches.length >= maxMatches) {
        truncated = true
        break
      }
      if (Date.now() - start > budget) {
        timedOut = true
        break
      }
    }
  }
  return { ok: true, matches, truncated, timedOut, clipped: full.length > maxText }
}

/** Source for a worker that runs jobs: postMessage({ id, job }) -> { id, result }. */
export const WORKER_SOURCE = `const runRegexJob = (${runRegexJob.toString()});
self.onmessage = (event) => {
  const { id, job } = event.data
  let result
  try { result = runRegexJob(job) } catch (err) { result = { ok: false, error: String((err && err.message) || err) } }
  self.postMessage({ id, result })
}`

/**
 * Flag patterns that can backtrack catastrophically: a quantified group that itself
 * contains a quantifier, like (a+)+ or (.*)*. Returns a warning or null.
 */
export function riskyPattern(pattern) {
  const src = String(pattern)
  // Remove escapes and character classes so their contents do not confuse the scan.
  const flat = src.replace(/\\./g, 'x').replace(/\[[^\]]*\]/g, 'x')
  if (/\([^()]*[+*][^()]*\)\s*(?:[+*]|\{\d+,\d*\})/.test(flat)) {
    return 'A repeated group that also repeats inside, like (a+)+, can make the engine try millions of ways to match. Real apps have frozen on patterns like this.'
  }
  return null
}

/** Split text into plain and matched segments for highlighting. Zero-length matches become markers. */
export function segments(text, matches) {
  const out = []
  let pos = 0
  matches.forEach((m, i) => {
    if (m.index < pos) return
    if (m.index > pos) out.push({ text: text.slice(pos, m.index), match: null })
    out.push({ text: text.slice(m.index, m.end), match: i, empty: m.end === m.index })
    pos = m.end
  })
  if (pos < text.length) out.push({ text: text.slice(pos), match: null })
  return out
}

/** Grade a puzzle from case results (same order as match then noMatch). */
export function gradePuzzle(puzzle, results) {
  const rows = [...puzzle.match.map((text) => ({ text, expect: true })), ...puzzle.noMatch.map((text) => ({ text, expect: false }))]
  const graded = rows.map((row, i) => ({ ...row, got: results?.[i] ?? null, ok: results?.[i] === row.expect }))
  return { rows: graded, solved: graded.length > 0 && graded.every((r) => r.ok), passing: graded.filter((r) => r.ok).length }
}

export const puzzleCases = (puzzle) => [...puzzle.match, ...puzzle.noMatch]

export const BUILT_IN_PUZZLES = [
  {
    id: 'digit',
    prompt: 'Match strings that contain a number anywhere.',
    match: ['Room 42', '7 days left', 'R2-D2'],
    noMatch: ['no numbers here', 'forty-two'],
    hint: '\\d matches one digit, and a string counts as a match if the pattern is found anywhere in it.',
    solution: '\\d'
  },
  {
    id: 'only-digits',
    prompt: 'Now match strings made of digits only, nothing else.',
    match: ['42', '2026', '7'],
    noMatch: ['42a', 'x7', '4 2', '12.5'],
    hint: '\\d+ finds digits inside "42a" too. Pin the pattern to the start and end with ^ and $.',
    solution: '^\\d+$'
  },
  {
    id: 'capital',
    prompt: 'Match words that start with a capital letter.',
    match: ['Alice', 'Paris', 'Recurse'],
    noMatch: ['bob', 'iPhone', '42nd'],
    hint: 'A character class [A-Z] matches one uppercase letter. Anchor it to the start with ^.',
    solution: '^[A-Z]'
  },
  {
    id: 'error-word',
    prompt: 'Match lines with the word "error" in any letter case, but not words that merely contain it.',
    match: ['ERROR: disk full', 'Error 42', 'an error occurred'],
    noMatch: ['terror alert', 'errors pile up', 'err0r'],
    hint: '\\b marks a word boundary, so \\berror\\b skips "terror". Turn on the i flag to ignore case.',
    solution: '\\berror\\b',
    flags: 'i'
  },
  {
    id: 'date',
    prompt: 'Match dates written as YYYY-MM-DD.',
    match: ['2026-10-14', '1999-01-31', '2000-12-01'],
    noMatch: ['14-10-2026', '2026/10/14', '2026-1-4', '20261014'],
    hint: '\\d{4} means exactly four digits. Join the pieces with literal dashes and anchor both ends.',
    solution: '^\\d{4}-\\d{2}-\\d{2}$'
  },
  {
    id: 'hex',
    prompt: 'Match CSS hex colors: # then exactly 3 or 6 hex digits.',
    match: ['#fff', '#1a2B3c', '#000000'],
    noMatch: ['#ggg', 'fff', '#12345', '#1234567'],
    hint: 'Hex digits are [0-9a-fA-F]. Use alternation inside a group: (...{3}|...{6}), and anchor it.',
    solution: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'
  },
  {
    id: 'ipv4',
    prompt: 'Match dotted IPv4 addresses: four groups of 1 to 3 digits.',
    match: ['192.168.1.1', '10.0.0.254', '8.8.8.8'],
    noMatch: ['192.168.1', '1.2.3.4.5', 'a.b.c.d', '192.168.1.1.'],
    hint: 'A dot means "any character", so escape it: \\. and repeat a group: (\\d{1,3}\\.){3}\\d{1,3}',
    solution: '^(\\d{1,3}\\.){3}\\d{1,3}$'
  },
  {
    id: 'email',
    prompt: 'Match simple email addresses: name, @, then a domain with at least one dot.',
    match: ['ada@example.com', 'grace.hopper@navy.mil', 'x_y@mail.co.uk'],
    noMatch: ['ada@', '@example.com', 'ada example.com', 'ada@example'],
    hint: 'Something like ^[\\w.]+@[\\w-]+(\\.[\\w-]+)+$: name characters, @, a label, then one or more .label parts.',
    solution: '^[\\w.]+@[\\w-]+(\\.[\\w-]+)+$'
  },
  {
    id: 'repeat',
    prompt: 'Catch a word typed twice in a row, like "the the".',
    match: ['the the cat', 'it is is fine', 'go go'],
    noMatch: ['the cat', 'is this it', 'then the end'],
    hint: 'Capture a word with (\\w+), then \\1 means "the same text again". Add \\b so "then the" does not count.',
    solution: '\\b(\\w+) \\1\\b'
  }
]

/** Validate puzzles from content. Returns a clean array (built-ins when nothing valid). */
export function normalizePuzzles(list) {
  if (!Array.isArray(list)) return BUILT_IN_PUZZLES
  const clean = list
    .filter((p) => p && typeof p.prompt === 'string' && Array.isArray(p.match) && Array.isArray(p.noMatch))
    .map((p, i) => ({
      id: String(p.id ?? `p${i + 1}`),
      prompt: p.prompt,
      match: p.match.map(String).slice(0, 12),
      noMatch: p.noMatch.map(String).slice(0, 12),
      hint: typeof p.hint === 'string' ? p.hint : '',
      solution: typeof p.solution === 'string' ? p.solution : '',
      flags: typeof p.flags === 'string' ? p.flags : ''
    }))
    .filter((p) => p.match.length + p.noMatch.length > 0)
    .slice(0, 20)
  return clean.length ? clean : BUILT_IN_PUZZLES
}

export const CHEAT_SHEET = [
  {
    title: 'Characters',
    rows: [
      ['.', 'any character except a newline'],
      ['\\d', 'a digit, 0 to 9'],
      ['\\w', 'a word character: letter, digit or _'],
      ['\\s', 'whitespace: space, tab, newline'],
      ['\\D \\W \\S', 'the opposite of \\d, \\w, \\s'],
      ['[abc]', 'one of a, b or c'],
      ['[^abc]', 'any character except a, b or c'],
      ['[a-z0-9]', 'one character from these ranges'],
      ['\\. \\* \\(', 'a literal dot, star, parenthesis']
    ]
  },
  {
    title: 'Quantifiers',
    rows: [
      ['*', '0 or more of the thing before'],
      ['+', '1 or more'],
      ['?', '0 or 1 (optional)'],
      ['{3}', 'exactly 3'],
      ['{2,4}', '2 to 4'],
      ['{2,}', '2 or more'],
      ['*? +?', 'lazy: as few as possible']
    ]
  },
  {
    title: 'Anchors',
    rows: [
      ['^', 'start of the text (of each line with m)'],
      ['$', 'end of the text (of each line with m)'],
      ['\\b', 'a word boundary']
    ]
  },
  {
    title: 'Groups',
    rows: [
      ['(abc)', 'capture group, numbered 1, 2, 3...'],
      ['(?:abc)', 'group without capturing'],
      ['(?<year>\\d{4})', 'named capture group'],
      ['\\1', 'the text group 1 matched, again'],
      ['cat|dog', 'cat or dog']
    ]
  },
  {
    title: 'Flags',
    rows: [
      ['g', 'global: find every match, not just the first'],
      ['i', 'ignore case'],
      ['m', 'multiline: ^ and $ work per line']
    ]
  }
]
