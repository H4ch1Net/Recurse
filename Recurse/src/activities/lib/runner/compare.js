// Comparing a learner's result with a test's expected value.
// Results arrive as plain data (JSON from Python, structured clones from the JavaScript
// worker), so this only handles arrays, plain objects and primitives. No instanceof checks:
// values can come from another realm (Node's vm in the validator and the tests).

export const COMPARE_MODES = ['exact', 'unordered', 'unordered-deep', 'float']

const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]'
const definedKeys = (obj) => Object.keys(obj).filter((k) => obj[k] !== undefined)

const exactNumbers = (a, b) => a === b || (Number.isNaN(a) && Number.isNaN(b))

/** Numbers within 1e-6 (relative to the size of the numbers once they pass 1). */
const closeNumbers = (a, b) =>
  exactNumbers(a, b) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)))

function equal(a, b, numbersEqual) {
  if (typeof a === 'number' && typeof b === 'number') return numbersEqual(a, b)
  if (a === b) return true
  const arrayA = Array.isArray(a)
  if (arrayA || Array.isArray(b)) {
    if (!arrayA || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i], numbersEqual)) return false
    return true
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = definedKeys(a)
    const keysB = definedKeys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && equal(a[k], b[k], numbersEqual))
  }
  return false
}

/** A string that is equal for two values exactly when they are deeply equal. Used for sorting. */
export function canonicalKey(value) {
  if (value === undefined) return 'u'
  if (value === null) return 'n'
  switch (typeof value) {
    case 'number':
      return Number.isNaN(value) ? '#NaN' : `#${value === 0 ? 0 : value}`
    case 'string':
      return JSON.stringify(value)
    case 'boolean':
      return value ? 'T' : 'F'
    case 'bigint':
      return `b${value}`
    default:
      break
  }
  if (Array.isArray(value)) return `[${value.map(canonicalKey).join(',')}]`
  if (isPlainObject(value)) {
    const keys = definedKeys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalKey(value[k])}`).join(',')}}`
  }
  return `?${String(value)}`
}

function sortByKey(list) {
  return list
    .map((value) => [canonicalKey(value), value])
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .map((pair) => pair[1])
}

/**
 * True when `actual` matches `expected` under a compare mode:
 * exact (deep equality), unordered (outer array order ignored), unordered-deep
 * (order ignored at the outer and inner levels), float (numbers within 1e-6).
 */
export function compareValues(actual, expected, mode = 'exact') {
  switch (mode) {
    case 'float':
      return equal(actual, expected, closeNumbers)
    case 'unordered':
      if (!Array.isArray(actual) || !Array.isArray(expected)) return equal(actual, expected, exactNumbers)
      return actual.length === expected.length && equal(sortByKey(actual), sortByKey(expected), exactNumbers)
    case 'unordered-deep': {
      if (!Array.isArray(actual) || !Array.isArray(expected)) return equal(actual, expected, exactNumbers)
      const inner = (list) => list.map((item) => (Array.isArray(item) ? sortByKey(item) : item))
      return actual.length === expected.length && equal(sortByKey(inner(actual)), sortByKey(inner(expected)), exactNumbers)
    }
    default:
      return equal(actual, expected, exactNumbers)
  }
}
