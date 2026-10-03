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
