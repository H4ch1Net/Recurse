// JSON explorer logic: a small JSON parser that keeps key order and reports friendly errors
// with line and column, path formatting (dot and bracket notation), and quiz questions.

export class JsonError extends Error {
  constructor(message, offset, text) {
    super(message)
    this.offset = offset
    const before = text.slice(0, offset)
    this.line = before.split('\n').length
    this.column = offset - before.lastIndexOf('\n')
  }
}

const isIdent = (key) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)

/**
 * Parse JSON text into a tree of nodes:
 * { type: 'object'|'array'|'string'|'number'|'boolean'|'null', key, path, value, raw, children }
 * Returns { ok: true, root, value } or { ok: false, error: { message, line, column, offset } }.
 */
export function parseJson(text) {
  const src = String(text ?? '')
  let i = 0
  const fail = (message, at = i) => {
    throw new JsonError(message, Math.min(at, src.length), src)
  }
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++
    if (src.startsWith('//', i) || src.startsWith('/*', i)) fail('Comments are not allowed in JSON.')
  }
  const word = () => /^[A-Za-z_$][\w$]*/.exec(src.slice(i))?.[0] ?? src[i]

  const parseString = () => {
    if (src[i] === "'") fail('Strings must use double quotes ("), not single quotes.')
    const start = i
    i++
    let out = ''
    while (i < src.length) {
      const c = src[i]
      if (c === '"') {
        i++
        return { value: out, raw: src.slice(start, i) }
      }
      if (c === '\n') fail('This string is missing its closing quote, or has a line break inside it. Write line breaks as \\n.')
      if (c === '\\') {
        const e = src[i + 1]
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
        if (e in map) {
          out += map[e]
          i += 2
          continue
        }
        if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16))
          i += 6
          continue
        }
        fail(`"\\${e ?? ''}" is not a valid escape. Use \\\\ for a backslash.`)
      }
      if (c < ' ') fail('Control characters such as tabs must be escaped inside strings (\\t).')
      out += c
      i++
    }
    fail('This string is missing its closing quote.', start)
  }

  const parseValue = (key, path) => {
    ws()
    if (i >= src.length) fail('The JSON ends too early. Is a value or a closing } or ] missing?')
    const c = src[i]
    const start = i
    if (c === '{') {
      i++
      const node = { type: 'object', key, path, children: [], start }
      ws()
      if (src[i] === '}') {
        i++
        node.end = i
        return node
      }
      for (;;) {
        ws()
        if (src[i] === '}') fail('Trailing commas are not allowed in JSON. Remove the comma before }.')
        if (src[i] === "'") fail('Property names must use double quotes ("), not single quotes.')
        if (src[i] !== '"') {
          if (i >= src.length) fail('The JSON ends inside an object. Is a closing } missing?')
          fail(`Property names must be in double quotes. Found ${JSON.stringify(word())}.`)
        }
        const k = parseString().value
        ws()
        if (src[i] !== ':') fail(`Expected a colon after the property name "${k}".`)
        i++
        node.children.push(parseValue(k, [...path, k]))
        ws()
        if (src[i] === ',') {
          i++
          continue
        }
        if (src[i] === '}') {
          i++
          node.end = i
          return node
        }
        if (i >= src.length) fail('The JSON ends inside an object. Is a closing } missing?')
        fail(src[i] === '"' ? 'Expected a comma between these two properties.' : 'Expected a comma or a closing } after this value.')
      }
    }
    if (c === '[') {
      i++
      const node = { type: 'array', key, path, children: [], start }
      ws()
      if (src[i] === ']') {
        i++
        node.end = i
        return node
      }
      for (;;) {
        ws()
        if (src[i] === ']') fail('Trailing commas are not allowed in JSON. Remove the comma before ].')
        const n = node.children.length
        node.children.push(parseValue(n, [...path, n]))
        ws()
        if (src[i] === ',') {
          i++
          continue
        }
        if (src[i] === ']') {
          i++
          node.end = i
          return node
        }
        if (i >= src.length) fail('The JSON ends inside an array. Is a closing ] missing?')
        fail('Expected a comma or a closing ] after this item.')
      }
    }
    if (c === '"' || c === "'") {
      const s = parseString()
      return { type: 'string', key, path, value: s.value, raw: s.raw, start, end: i }
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i))
      if (!m) fail('A minus sign must be followed by digits.')
      if (/^-?0\d/.test(src.slice(i))) fail('Numbers cannot have leading zeros (write 7, not 07).')
      i += m[0].length
      if (src[i] === '.') fail('A decimal point must be followed by digits (write 1.0, not 1.).')
      return { type: 'number', key, path, value: Number(m[0]), raw: m[0], start, end: i }
    }
    for (const [lit, value] of [['true', true], ['false', false], ['null', null]]) {
      if (src.startsWith(lit, i) && !/[\w$]/.test(src[i + lit.length] ?? '')) {
        i += lit.length
        return { type: value === null ? 'null' : 'boolean', key, path, value, raw: lit, start, end: i }
      }
    }
    const w = word()
    if (/^(True|False|TRUE|FALSE|None|NULL|Null)$/.test(w)) fail(`"${w}" is not JSON. Use lowercase true, false and null.`)
    if (/^(undefined|NaN|Infinity)$/.test(w)) fail(`"${w}" is not a JSON value. Use null, or a number.`)
    if (c === '}' || c === ']') fail(`Unexpected ${c}: a value is missing here.`)
    fail(/[A-Za-z_]/.test(c) ? `Unexpected word "${w}". Text values need double quotes.` : `Unexpected character "${c}".`)
  }

  try {
    if (!src.trim()) return { ok: false, error: { message: 'Paste some JSON to explore.', line: 1, column: 1, offset: 0, empty: true } }
    const root = parseValue(null, [])
    ws()
    if (i < src.length) fail('There is extra text after the end of the JSON. Is it two documents, or a missing [ ] around a list?')
    return { ok: true, root, value: toValue(root) }
  } catch (e) {
    if (e instanceof JsonError) return { ok: false, error: { message: e.message, line: e.line, column: e.column, offset: e.offset } }
    throw e
  }
}

export function toValue(node) {
  if (node.type === 'object') return Object.fromEntries(node.children.map((c) => [c.key, toValue(c)]))
  if (node.type === 'array') return node.children.map(toValue)
  return node.value
}

/** The line of source with a caret under the error column. */
export function errorExcerpt(text, error) {
  const lines = String(text).split('\n')
  const src = lines[error.line - 1] ?? ''
  return { line: src, caret: `${' '.repeat(Math.max(0, error.column - 1))}^` }
}

/** response.interfaces[1].ipv4.address */
export function formatPath(path, root = 'response') {
  return path.reduce((acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : isIdent(seg) ? `${acc}.${seg}` : `${acc}[${JSON.stringify(seg)}]`), root)
}

/** data["interfaces"][1]["ipv4"]["address"], how Python reads it after json.loads. */
export function pythonPath(path, root = 'data') {
  return path.reduce((acc, seg) => `${acc}[${typeof seg === 'number' ? seg : JSON.stringify(seg)}]`, root)
}

export const pathKey = (path) => JSON.stringify(path)

export function getNode(root, path) {
  let node = root
  for (const seg of path) {
    node = node?.children?.find((c) => c.key === seg)
    if (!node) return null
  }
  return node
}

export function allNodes(root) {
  const out = []
  const visit = (n) => {
    out.push(n)
    n.children?.forEach(visit)
  }
  if (root) visit(root)
  return out
}

/** Short preview used next to collapsed containers and leaves. */
export function preview(node) {
  if (node.type === 'object') return `{…} ${node.children.length} ${node.children.length === 1 ? 'key' : 'keys'}`
  if (node.type === 'array') return `[…] ${node.children.length} ${node.children.length === 1 ? 'item' : 'items'}`
  return node.raw
}

export const TYPE_INFO = {
  object: { label: 'object', python: 'dict', note: 'keys and values in { }' },
  array: { label: 'array', python: 'list', note: 'an ordered list in [ ], counted from 0' },
  string: { label: 'string', python: 'str', note: 'text in double quotes' },
  number: { label: 'number', python: 'int / float', note: 'no quotes' },
  boolean: { label: 'boolean', python: 'bool', note: 'true or false, lowercase' },
  null: { label: 'null', python: 'None', note: 'no value' }
}
export const TYPES = Object.keys(TYPE_INFO)

/** Does a typed answer match a node's value? Quotes optional for strings. */
export function answerMatches(node, answer) {
  if (!node || node.children) return false
  let a = String(answer ?? '').trim()
  if (!a) return false
  if (node.type === 'string') {
    if (/^".*"$/.test(a) || /^'.*'$/.test(a)) a = a.slice(1, -1)
    return a === node.value
  }
  if (node.type === 'number') return a !== '' && Number(a) === node.value
  return a.toLowerCase() === node.raw
}

// ---- Quiz --------------------------------------------------------------------------------

export const SAMPLE_JSON = `{
  "device": {
    "hostname": "edge-rtr-01",
    "model": "ISR4331",
    "osVersion": "17.9.4",
    "uptimeSeconds": 864210,
    "managed": true
  },
  "interfaces": [
    {
      "name": "GigabitEthernet0/0/0",
      "enabled": true,
      "description": "Uplink to ISP",
      "ipv4": { "address": "203.0.113.2", "prefixLength": 30 },
      "mtu": 1500,
      "vlans": []
    },
    {
      "name": "GigabitEthernet0/0/1",
      "enabled": true,
      "description": "LAN",
      "ipv4": { "address": "192.168.10.1", "prefixLength": 24 },
      "mtu": 1500,
      "vlans": [10, 20, 30]
    },
    {
      "name": "GigabitEthernet0/0/2",
      "enabled": false,
      "description": null,
      "ipv4": null,
      "mtu": 1500,
      "vlans": []
    }
  ],
  "ntpServers": ["192.0.2.10", "192.0.2.11"],
  "lastConfigChange": null
}
`

/** Questions for the built-in sample. kind: value | click | type | choice | count. */
export const SAMPLE_QUIZ = [
  { kind: 'value', path: ['interfaces', 1, 'ipv4', 'address'], prompt: 'What is the value at response.interfaces[1].ipv4.address?', explain: 'interfaces[1] is the second interface, because arrays count from 0.' },
  { kind: 'click', path: ['interfaces', 1, 'name'], prompt: "Click the node holding the second interface's name.", explain: 'The second interface is interfaces[1], and its name is a string inside it.' },
  { kind: 'type', path: ['interfaces', 2, 'ipv4'], prompt: 'What type is response.interfaces[2].ipv4?', explain: 'The disabled interface has no address, so ipv4 is null: a value meaning "nothing here", not the text "null".' },
  {
    kind: 'choice',
    path: ['device', 'hostname'],
    prompt: "Which path leads to the router's hostname?",
    choices: ['response.device.hostname', 'response.hostname', 'response.device[0].hostname', 'response.interfaces[0].name'],
    answer: 'response.device.hostname',
    explain: 'device is an object, not an array, so you step into it with a dot and the key name.'
  },
  { kind: 'value', path: ['interfaces', 1, 'vlans', 2], prompt: 'What is response.interfaces[1].vlans[2]?', explain: 'vlans[2] is the third item: [10, 20, 30] counts 0, 1, 2.' }
]

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (list, rand) => list[Math.floor(rand() * list.length)]

/** Build up to `count` questions for any JSON tree. Deterministic for a given seed. */
export function generateQuiz(root, { seed = 1, count = 5, rootName = 'response' } = {}) {
  const rand = rng(seed)
  const nodes = allNodes(root).filter((n) => n.path.length > 0)
  const leaves = nodes.filter((n) => !n.children)
  const deepFirst = [...leaves].sort((a, b) => b.path.length - a.path.length || rand() - 0.5)
  const arrays = nodes.filter((n) => n.type === 'array' && n.children.length > 1)
  const used = new Set()
  const take = (list) => {
    const options = list.filter((n) => !used.has(pathKey(n.path)))
    if (!options.length) return null
    const n = pick(options.slice(0, Math.max(3, Math.ceil(options.length / 2))), rand)
    used.add(pathKey(n.path))
    return n
  }
  const qs = []
  const valueNode = take(deepFirst.filter((n) => n.type === 'string' || n.type === 'number'))
  if (valueNode) qs.push({ kind: 'value', path: valueNode.path, prompt: `What is the value at ${formatPath(valueNode.path, rootName)}?` })
  const clickNode = take(deepFirst)
  if (clickNode) qs.push({ kind: 'click', path: clickNode.path, prompt: `Click the node at ${formatPath(clickNode.path, rootName)}.` })
  const typeNode = take([...nodes].sort(() => rand() - 0.5))
  if (typeNode) qs.push({ kind: 'type', path: typeNode.path, prompt: `What type is ${formatPath(typeNode.path, rootName)}?` })
  const unique = leaves.filter((n) => leaves.filter((m) => m.raw === n.raw).length === 1)
  const choiceNode = take(unique)
  if (choiceNode) {
    const right = formatPath(choiceNode.path, rootName)
    const choices = [right, ...distractors(root, choiceNode.path, rootName)].slice(0, 4)
    if (choices.length >= 2) qs.push({ kind: 'choice', path: choiceNode.path, prompt: `Which path leads to the value ${choiceNode.raw}?`, choices: shuffle(choices, rand), answer: right })
  }
  const arrayNode = arrays.length ? pick(arrays, rand) : null
  if (arrayNode) qs.push({ kind: 'count', path: arrayNode.path, prompt: `How many items are in ${formatPath(arrayNode.path, rootName)}?` })
  // Top up with more value questions if the document is small or flat.
  while (qs.length < count) {
    const n = take(deepFirst)
    if (!n) break
    qs.push({ kind: 'value', path: n.path, prompt: `What is the value at ${formatPath(n.path, rootName)}?` })
  }
  return qs.slice(0, count)
}

function shuffle(list, rand) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Plausible wrong paths: off-by-one indexes, a skipped level, a sibling key. */
function distractors(root, path, rootName) {
  const right = formatPath(path, rootName)
  const out = new Set()
  path.forEach((seg, i) => {
    if (typeof seg === 'number') {
      out.add(formatPath([...path.slice(0, i), seg + 1, ...path.slice(i + 1)], rootName))
      if (seg > 0) out.add(formatPath([...path.slice(0, i), seg - 1, ...path.slice(i + 1)], rootName))
    } else {
      const parent = getNode(root, path.slice(0, i))
      const sibling = parent?.children?.find((c) => c.key !== seg && typeof c.key === 'string')
      if (sibling) out.add(formatPath([...path.slice(0, i), sibling.key, ...path.slice(i + 1)], rootName))
    }
  })
  if (path.length > 1) out.add(formatPath(path.slice(1), rootName))
  if (path.length > 1) out.add(formatPath([...path.slice(0, -2), path[path.length - 1]], rootName))
  out.delete(right)
  return [...out]
}

/** Grade an answer for a question. Returns { correct, expected } where expected is display text. */
export function gradeQuestion(root, q, answer) {
  const node = getNode(root, q.path)
  if (!node) return { correct: false, expected: '' }
  const where = formatPath(q.path)
  switch (q.kind) {
    case 'value':
      return { correct: answerMatches(node, answer), expected: node.raw }
    case 'click':
      return { correct: pathKey(answer ?? []) === pathKey(q.path), expected: where }
    case 'type':
      return { correct: answer === node.type, expected: node.type }
    case 'choice':
      return { correct: answer === q.answer, expected: q.answer }
    case 'count':
      return { correct: Number(String(answer).trim()) === node.children?.length, expected: String(node.children?.length ?? 0) }
    default:
      return { correct: false, expected: '' }
  }
}
