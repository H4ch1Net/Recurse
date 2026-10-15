// Answer checking for typed questions. Lenient about formatting, strict about content.

const stripAccents = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '')

export function normalizeAnswer(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?¡¿]+$/g, '')
    .replace(/^[¡¿]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse plain numbers, thousands separators, simple fractions and percentages. */
export function parseNumber(text) {
  const value = String(text ?? '').trim().replace(/,(?=\d{3}\b)/g, '').replace(/\s+/g, '')
  if (/^[-+]?\d+\/\d+$/.test(value)) {
    const [num, den] = value.split('/').map(Number)
    return den === 0 ? null : num / den
  }
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(value)) {
    const n = Number(value.replace('%', ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function numbersEqual(a, b) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

/**
 * Compare a typed response against a question's answer and accept list.
 * Returns { correct, nearMiss, expected }. nearMiss means only accents differ:
 * it counts as correct, and the UI points out the spelling.
 */
export function checkTyped(response, question) {
  const expected = String(question.answer ?? '')
  const candidates = [expected, ...(question.accept || [])]
  const given = normalizeAnswer(response)
  if (!given) return { correct: false, nearMiss: false, expected }

  for (const candidate of candidates) {
    if (normalizeAnswer(candidate) === given) return { correct: true, nearMiss: false, expected }
  }
  const givenNumber = parseNumber(given)
  if (givenNumber !== null) {
    for (const candidate of candidates) {
      const n = parseNumber(normalizeAnswer(candidate))
      if (n !== null && numbersEqual(n, givenNumber)) return { correct: true, nearMiss: false, expected }
    }
  }
  const bare = stripAccents(given)
  for (const candidate of candidates) {
    if (stripAccents(normalizeAnswer(candidate)) === bare) return { correct: true, nearMiss: true, expected }
  }
  return { correct: false, nearMiss: false, expected }
}

// ---- Commands ---------------------------------------------------------------

// Cisco interface names typed any common way ("gi0/1", "g 0/1", "GigabitEthernet0/1")
// become one spelling. Single-letter prefixes only count when a slash follows the number.
const IF_NAMES = [
  [/^(?:te|ten|tengig|tengigabitethernet)$/, 'tengigabitethernet'],
  [/^(?:gi|gig|giga|gigabit|gigabitethernet)$/, 'gigabitethernet'],
  [/^(?:fa|fas|fast|fastethernet)$/, 'fastethernet'],
  [/^(?:eth|ether|ethernet)$/, 'ethernet'],
  [/^(?:lo|loop|loopback)$/, 'loopback'],
  [/^(?:vl|vla|vlan)$/, 'vlan'],
  [/^(?:po|port-channel|port-ch|portchannel)$/, 'port-channel'],
  [/^(?:se|ser|serial)$/, 'serial'],
  [/^(?:tu|tun|tunnel)$/, 'tunnel']
]
const SINGLE_LETTER_IFS = { g: 'gigabitethernet', f: 'fastethernet', e: 'ethernet', s: 'serial', t: 'tengigabitethernet' }

function canonicalInterfaces(text) {
  return text.replace(/\b([a-z][a-z-]*)\s?(\d+(?:\/\d+)*(?:\.\d+)?)(?=\s|$|,)/g, (whole, word, number) => {
    for (const [pattern, name] of IF_NAMES) if (pattern.test(word)) return `${name}${number}`
    if (SINGLE_LETTER_IFS[word] && number.includes('/')) return `${SINGLE_LETTER_IFS[word]}${number}`
    return whole
  })
}

function normalizeCommand(text, shell) {
  let value = String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/\s+/g, ' ')
  if (shell === 'sql') value = value.replace(/;+$/, '').toLowerCase().replace(/\s*([(),=<>])\s*/g, '$1')
  if (shell === 'ios') value = canonicalInterfaces(value.toLowerCase().replace(/^do /, ''))
  if (shell !== 'ios' && shell !== 'sql') value = value.replace(/'/g, '"')
  return value
}

const isKeyword = (token) => /^[a-z][a-z-]*$/.test(token)

/** IOS accepts any unambiguous prefix of a keyword: compare token by token. */
function iosMatches(given, expected) {
  const a = given.split(' ')
  const b = expected.split(' ')
  if (a.length !== b.length) return false
  return a.every((token, i) => {
    if (token === b[i]) return true
    if (!isKeyword(b[i]) || !isKeyword(token)) return false
    return token.length >= (i === 0 ? 2 : 1) && b[i].startsWith(token)
  })
}

/** Check a typed command. IOS commands accept abbreviations; other shells match exactly. */
export function checkCli(response, question) {
  const shell = question.shell || 'bash'
  const expected = String(question.answer ?? '')
  const given = normalizeCommand(response, shell)
  if (!given) return { correct: false, nearMiss: false, expected }
  const candidates = [expected, ...(question.accept || [])].map((c) => normalizeCommand(c, shell))
  const correct = candidates.some((c) => (shell === 'ios' ? iosMatches(given, c) : given === c))
  return { correct, nearMiss: false, expected }
}

// ---- Interactive types ---------------------------------------------------------

/** Select-all: right only when exactly the correct set is chosen. */
export function checkMulti(selected, question) {
  const want = new Set(question.answers)
  const got = new Set(selected)
  const correct = want.size === got.size && [...want].every((i) => got.has(i))
  return { correct, missed: [...want].filter((i) => !got.has(i)), extra: [...got].filter((i) => !want.has(i)) }
}

/** Order: `sequence` lists item indexes in the order the learner placed them. */
export function checkOrder(sequence, question) {
  const correct = sequence.length === question.items.length && sequence.every((index, position) => index === position)
  return { correct, rightPositions: sequence.map((index, position) => index === position) }
}

/** Match: `pairing` maps a left index to the right index the learner chose. */
export function checkMatch(pairing, question) {
  const results = question.pairs.map((_, i) => pairing[i] === i)
  return { correct: results.every(Boolean), results }
}

/** A short, readable form of the correct answer for any question type. */
export function answerText(question) {
  switch (question.type) {
    case 'mcq':
    case 'code-fill':
    case 'debug':
      return question.choices[question.answer]
    case 'multi':
      return question.answers.map((i) => question.choices[i]).join('; ')
    case 'order':
      return question.items.join(' → ')
    case 'match':
      return question.pairs.map((p) => `${p.left}: ${p.right}`).join('; ')
    default:
      return question.answer
  }
}
