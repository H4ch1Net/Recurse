// Lesson visuals: tables, diagrams, worked examples and charts that the app draws from a
// small JSON spec (see docs/visuals.md). This module validates specs and splits a section
// body around its [[visual]] and [[code]] placement markers. Rendering lives in
// src/components/visuals/.

export const VISUAL_TYPES = ['table', 'compare', 'steps', 'flow', 'stack', 'bars', 'sequence', 'topology', 'tree', 'fields', 'bits', 'cells']
export const VISUAL_TONES = ['accent', 'good', 'bad', 'warn', 'muted']
export const NODE_KINDS = ['router', 'switch', 'l3switch', 'firewall', 'server', 'pc', 'laptop', 'phone', 'printer', 'ap', 'wlc', 'cloud', 'internet', 'db', 'host']
export const CELL_STYLES = ['array', 'list', 'stack', 'queue', 'hash']
export const LINK_STYLES = ['solid', 'dashed', 'wireless', 'serial']
export const MAX_VISUALS = 4

const MARKER = /^\[\[(visual(?:\s+([1-9]))?|code)\]\]$/

/** The visuals of a section as an array (a section may hold one object or a list). */
export function visualList(section) {
  const v = section?.visual
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * Split a section body into text runs and placement markers, in order. A marker is a
 * paragraph that is exactly [[visual]], [[visual N]] or [[code]].
 * Returns [{ kind: 'text', text }, { kind: 'visual', index }, { kind: 'code' }].
 */
export function splitBody(body) {
  const parts = []
  let text = []
  const flush = () => {
    const joined = text.join('\n\n').trim()
    if (joined) parts.push({ kind: 'text', text: joined })
    text = []
  }
  for (const para of String(body ?? '').split(/\n\s*\n/)) {
    const m = para.trim().match(MARKER)
    if (!m) {
      text.push(para)
      continue
    }
    flush()
    if (m[1] === 'code') parts.push({ kind: 'code' })
    else parts.push({ kind: 'visual', index: m[2] ? Number(m[2]) - 1 : 0 })
  }
  flush()
  return parts
}

/** Body text with the placement markers removed (for word counts and search). */
export const bodyText = (body) => splitBody(body).filter((p) => p.kind === 'text').map((p) => p.text).join('\n\n')

const wordCount = (text) => (String(text || '').match(/\S+/g) || []).length

/** Rough minutes for a section: reading at 200 words a minute, plus visuals, code and an activity. */
export function sectionMinutes(section) {
  if (!section) return 0
  const reading = (wordCount(section.key) + wordCount(bodyText(section.body))) / 200
  const extras = visualList(section).length * 0.4 + (section.code ? section.code.split('\n').length / 25 : 0) + (section.activity ? 3 : 0) + (section.check ? 0.5 : 0)
  return Math.max(1, Math.round(reading + extras))
}

// ---- Validation -------------------------------------------------------------------------

const isText = (v) => typeof v === 'string' && v.trim().length > 0
const isCell = (v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))
const optText = (v) => v === undefined || isText(v)
const optTone = (v) => v === undefined || VISUAL_TONES.includes(v)
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi

function checkTable(at, s, errors, warnings) {
  if (!Array.isArray(s.columns) || s.columns.length < 2 || s.columns.length > 6 || !s.columns.every(isText)) errors.push(`${at}: columns must be 2 to 6 headings`)
  const cols = Array.isArray(s.columns) ? s.columns.length : 0
  if (!Array.isArray(s.rows) || s.rows.length < 1) errors.push(`${at}: rows must be a non-empty array`)
  else {
    if (s.rows.length > 16) warnings.push(`${at}: more than 16 rows; split it or trim it`)
    s.rows.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== cols || !row.every(isCell)) errors.push(`${at}.rows[${i}]: needs ${cols} text cells`)
    })
  }
  for (const key of ['mono', 'highlight']) {
    if (s[key] !== undefined && (!Array.isArray(s[key]) || !s[key].every(Number.isInteger))) errors.push(`${at}: ${key} must be a list of indexes`)
  }
  if (Array.isArray(s.mono) && s.mono.some((c) => c < 0 || c >= cols)) errors.push(`${at}: mono column out of range`)
  if (Array.isArray(s.highlight) && Array.isArray(s.rows) && s.highlight.some((r) => r < 0 || r >= s.rows.length)) errors.push(`${at}: highlight row out of range`)
}

function checkCompare(at, s, errors) {
  if (!Array.isArray(s.items) || s.items.length < 2 || s.items.length > 3) {
    errors.push(`${at}: items must hold 2 or 3 entries`)
    return
  }
  s.items.forEach((item, i) => {
    const w = `${at}.items[${i}]`
    if (!isText(item?.title)) errors.push(`${w}: title is required`)
    if (!optText(item?.sub)) errors.push(`${w}: sub must be text`)
    if (!optTone(item?.tone)) errors.push(`${w}: unknown tone`)
    if (!Array.isArray(item?.points) || item.points.length < 1 || item.points.length > 6 || !item.points.every(isText)) errors.push(`${w}: points must be 1 to 6 lines`)
  })
}

function checkSteps(at, s, errors, warnings) {
  if (!Array.isArray(s.steps) || s.steps.length < 2 || s.steps.length > 8) {
    errors.push(`${at}: steps must hold 2 to 8 entries`)
    return
  }
  s.steps.forEach((step, i) => {
    const w = `${at}.steps[${i}]`
    if (!isText(step?.label)) errors.push(`${w}: label is required`)
    if (!optText(step?.work)) errors.push(`${w}: work must be text`)
    if (!optText(step?.note)) errors.push(`${w}: note must be text`)
    if (isText(step?.work)) {
      const lines = step.work.split('\n')
      if (lines.length > 3) errors.push(`${w}: work is at most 3 lines`)
      if (lines.some((l) => l.length > 36)) warnings.push(`${w}: work lines over 36 characters wrap on phones`)
    }
  })
  if (!optText(s.result)) errors.push(`${at}: result must be text`)
}

function checkFlow(at, s, errors) {
  if (!Array.isArray(s.steps) || s.steps.length < 2 || s.steps.length > 8) {
    errors.push(`${at}: steps must hold 2 to 8 entries`)
    return
  }
  s.steps.forEach((step, i) => {
    const w = `${at}.steps[${i}]`
    if (!isText(step?.label)) errors.push(`${w}: label is required`)
    for (const key of ['detail', 'yes', 'no']) if (!optText(step?.[key])) errors.push(`${w}: ${key} must be text`)
    if (!optTone(step?.tone)) errors.push(`${w}: unknown tone`)
  })
  if (!optText(s.loop)) errors.push(`${at}: loop must be text`)
  if (s.direction !== undefined && !['down', 'across'].includes(s.direction)) errors.push(`${at}: direction is down or across`)
}

function checkStack(at, s, errors) {
  if (!Array.isArray(s.layers) || s.layers.length < 2 || s.layers.length > 9) {
    errors.push(`${at}: layers must hold 2 to 9 entries`)
    return
  }
  s.layers.forEach((layer, i) => {
    const w = `${at}.layers[${i}]`
    if (!isText(layer?.label)) errors.push(`${w}: label is required`)
    for (const key of ['tag', 'detail']) if (layer?.[key] !== undefined && !isCell(layer[key])) errors.push(`${w}: ${key} must be text`)
    if (!optTone(layer?.tone)) errors.push(`${w}: unknown tone`)
  })
  ;(s.groups || []).forEach((g, i) => {
    const w = `${at}.groups[${i}]`
    if (!isText(g?.label)) errors.push(`${w}: label is required`)
    if (!intIn(g?.from, 0, s.layers.length - 1) || !intIn(g?.to, 0, s.layers.length - 1) || g.to < g.from) errors.push(`${w}: from and to must index layers in order`)
  })
  if (s.groups !== undefined && !Array.isArray(s.groups)) errors.push(`${at}: groups must be an array`)
  if (s.arrow !== undefined && !['down', 'up', 'both'].includes(s.arrow)) errors.push(`${at}: arrow is down, up or both`)
  if (!optText(s.arrowLabel)) errors.push(`${at}: arrowLabel must be text`)
}

function checkBars(at, s, errors) {
  if (!Array.isArray(s.items) || s.items.length < 2 || s.items.length > 10) {
    errors.push(`${at}: items must hold 2 to 10 entries`)
    return
  }
  s.items.forEach((item, i) => {
    const w = `${at}.items[${i}]`
    if (!isText(item?.label)) errors.push(`${w}: label is required`)
    if (typeof item?.value !== 'number' || !Number.isFinite(item.value) || item.value < 0) errors.push(`${w}: value must be a number of 0 or more`)
    if (item?.display !== undefined && !isCell(item.display)) errors.push(`${w}: display must be text`)
    if (!optTone(item?.tone)) errors.push(`${w}: unknown tone`)
  })
  if (s.scale !== undefined && !['linear', 'log'].includes(s.scale)) errors.push(`${at}: scale is linear or log`)
  if (s.scale === 'log' && s.items.some((item) => item?.value <= 0)) errors.push(`${at}: a log scale needs values above 0`)
  if (!optText(s.unit)) errors.push(`${at}: unit must be text`)
}

function checkSequence(at, s, errors, warnings) {
  if (!Array.isArray(s.actors) || s.actors.length < 2 || s.actors.length > 5) {
    errors.push(`${at}: actors must hold 2 to 5 entries`)
    return
  }
  const ids = new Set()
  s.actors.forEach((a, i) => {
    const w = `${at}.actors[${i}]`
    if (!isText(a?.id)) errors.push(`${w}: id is required`)
    else if (ids.has(a.id)) errors.push(`${w}: duplicate id ${a.id}`)
    else ids.add(a.id)
    if (!isText(a?.label)) errors.push(`${w}: label is required`)
    if (a?.kind !== undefined && !NODE_KINDS.includes(a.kind)) errors.push(`${w}: unknown kind ${a.kind}`)
  })
  if (!Array.isArray(s.messages) || s.messages.length < 1 || s.messages.length > 14) {
    errors.push(`${at}: messages must hold 1 to 14 entries`)
    return
  }
  s.messages.forEach((m, i) => {
    const w = `${at}.messages[${i}]`
    if (m?.note !== undefined) {
      if (!isText(m.note)) errors.push(`${w}: note must be text`)
      if (!Array.isArray(m.over) || !m.over.length || !m.over.every((id) => ids.has(id))) errors.push(`${w}: over must list actor ids`)
      return
    }
    if (!ids.has(m?.from) || !ids.has(m?.to)) errors.push(`${w}: from and to must be actor ids`)
    if (!isText(m?.label)) errors.push(`${w}: label is required`)
    if (!optText(m?.detail)) errors.push(`${w}: detail must be text`)
    if (!optTone(m?.tone)) errors.push(`${w}: unknown tone`)
    if (isText(m?.label) && m.label.length > 40) warnings.push(`${w}: label over 40 characters`)
  })
}

function checkTopology(at, s, errors, warnings) {
  if (!Array.isArray(s.nodes) || s.nodes.length < 1 || s.nodes.length > 12) {
    errors.push(`${at}: nodes must hold 1 to 12 entries`)
    return
  }
  const ids = new Set()
  const cells = new Set()
  s.nodes.forEach((n, i) => {
    const w = `${at}.nodes[${i}]`
    if (!isText(n?.id)) errors.push(`${w}: id is required`)
    else if (ids.has(n.id)) errors.push(`${w}: duplicate id ${n.id}`)
    else ids.add(n.id)
    if (!NODE_KINDS.includes(n?.kind)) errors.push(`${w}: unknown kind ${n?.kind}`)
    if (!isText(n?.label)) errors.push(`${w}: label is required`)
    if (!optText(n?.sub)) errors.push(`${w}: sub must be text`)
    if (!intIn(n?.x, 0, 3) || !intIn(n?.y, 0, 9)) errors.push(`${w}: x must be 0 to 3 and y 0 to 9`)
    else {
      const cell = `${n.x},${n.y}`
      if (cells.has(cell)) errors.push(`${w}: two nodes share cell ${cell}`)
      cells.add(cell)
      if (n.x === 3) warnings.push(`${w}: a fourth column is cramped on phones`)
    }
    if (isText(n?.label) && n.label.length > 12) warnings.push(`${w}: label over 12 characters`)
    if (!optTone(n?.tone)) errors.push(`${w}: unknown tone`)
  })
  if (s.links !== undefined && !Array.isArray(s.links)) errors.push(`${at}: links must be an array`)
  ;(s.links || []).forEach((l, i) => {
    const w = `${at}.links[${i}]`
    if (!ids.has(l?.from) || !ids.has(l?.to) || l.from === l.to) errors.push(`${w}: from and to must be two different node ids`)
    for (const key of ['label', 'fromLabel', 'toLabel']) if (!optText(l?.[key])) errors.push(`${w}: ${key} must be text`)
    if (l?.style !== undefined && !LINK_STYLES.includes(l.style)) errors.push(`${w}: unknown style ${l.style}`)
    if (!optTone(l?.tone)) errors.push(`${w}: unknown tone`)
  })
  ;(s.zones || []).forEach((z, i) => {
    const w = `${at}.zones[${i}]`
    if (!isText(z?.label)) errors.push(`${w}: label is required`)
    if (!Array.isArray(z?.nodes) || !z.nodes.length || !z.nodes.every((id) => ids.has(id))) errors.push(`${w}: nodes must list node ids`)
    if (!optTone(z?.tone)) errors.push(`${w}: unknown tone`)
  })
  const links = s.links || []
  ;(s.marks || []).forEach((m, i) => {
    const w = `${at}.marks[${i}]`
    if (!isText(m?.text)) errors.push(`${w}: text is required`)
    const link = typeof m?.at === 'string' && m.at.match(/^link:(\d+)$/)
    if (!(ids.has(m?.at) || (link && Number(link[1]) < links.length))) errors.push(`${w}: at must be a node id or link:N`)
    if (!optTone(m?.tone)) errors.push(`${w}: unknown tone`)
  })
}

function checkTreeNode(at, node, errors, depth, count) {
  if (!isText(node?.label)) errors.push(`${at}: label is required`)
  if (!optText(node?.sub)) errors.push(`${at}: sub must be text`)
  if (!optTone(node?.tone)) errors.push(`${at}: unknown tone`)
  count.n++
  if (depth > 5) {
    errors.push(`${at}: trees go at most 5 levels deep`)
    return
  }
  if (node?.children !== undefined && !Array.isArray(node.children)) errors.push(`${at}: children must be an array`)
  ;(node?.children || []).forEach((child, i) => checkTreeNode(`${at}.children[${i}]`, child, errors, depth + 1, count))
}

function checkTree(at, s, errors) {
  if (!s.root || typeof s.root !== 'object') {
    errors.push(`${at}: root is required`)
    return
  }
  const count = { n: 0 }
  checkTreeNode(`${at}.root`, s.root, errors, 1, count)
  if (count.n > 24) errors.push(`${at}: at most 24 nodes`)
  if (s.layout !== undefined && !['auto', 'outline'].includes(s.layout)) errors.push(`${at}: layout is auto or outline`)
}

function checkFields(at, s, errors) {
  if (!['bits', 'bytes'].includes(s.unit)) errors.push(`${at}: unit is bits or bytes`)
  if (!Array.isArray(s.rows) || s.rows.length < 1 || s.rows.length > 12) {
    errors.push(`${at}: rows must hold 1 to 12 rows`)
    return
  }
  s.rows.forEach((row, r) => {
    if (!Array.isArray(row) || row.length < 1 || row.length > 8) {
      errors.push(`${at}.rows[${r}]: 1 to 8 fields per row`)
      return
    }
    let total = 0
    let fixed = true
    row.forEach((f, i) => {
      const w = `${at}.rows[${r}][${i}]`
      if (!isText(f?.label)) errors.push(`${w}: label is required`)
      if (typeof f?.size === 'number') {
        if (!(f.size > 0)) errors.push(`${w}: size must be above 0`)
        total += f.size
      } else if (isText(f?.size)) fixed = false
      else errors.push(`${w}: size must be a number or text`)
      if (f?.weight !== undefined && !(typeof f.weight === 'number' && f.weight > 0)) errors.push(`${w}: weight must be a positive number`)
      if (!optTone(f?.tone)) errors.push(`${w}: unknown tone`)
      if (!optText(f?.note)) errors.push(`${w}: note must be text`)
    })
    if (s.width !== undefined && fixed && total !== s.width) errors.push(`${at}.rows[${r}]: sizes add up to ${total}, not ${s.width}`)
  })
  if (s.width !== undefined && !(Number.isInteger(s.width) && s.width > 0)) errors.push(`${at}: width must be a positive whole number`)
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** True for a dotted IPv4 value with every octet 0 to 255. */
export const isIpv4 = (v) => {
  const m = typeof v === 'string' && v.match(IPV4)
  return Boolean(m) && m.slice(1).every((o) => Number(o) <= 255)
}

function checkBits(at, s, errors) {
  if (!Array.isArray(s.rows) || s.rows.length < 1 || s.rows.length > 8) {
    errors.push(`${at}: rows must hold 1 to 8 entries`)
    return
  }
  s.rows.forEach((row, i) => {
    const w = `${at}.rows[${i}]`
    if (!isText(row?.label)) errors.push(`${w}: label is required`)
    if (row?.bits !== undefined) {
      if (!(typeof row.bits === 'string' && /^[01 ]+$/.test(row.bits) && row.bits.replace(/ /g, '').length <= 32)) errors.push(`${w}: bits must be up to 32 zeros and ones`)
      if (row.value !== undefined && !isCell(row.value)) errors.push(`${w}: value must be text`)
    } else if (!isIpv4(row?.value)) errors.push(`${w}: value must be a dotted IPv4 value, or give bits`)
    if (!optTone(row?.tone)) errors.push(`${w}: unknown tone`)
  })
  if (s.prefix !== undefined && !intIn(s.prefix, 0, 32)) errors.push(`${at}: prefix must be 0 to 32`)
  if (s.octets !== undefined && (!Array.isArray(s.octets) || !s.octets.length || !s.octets.every((o) => intIn(o, 0, 3)))) errors.push(`${at}: octets must list 0 to 3`)
}

function checkCells(at, s, errors) {
  if (!CELL_STYLES.includes(s.style)) errors.push(`${at}: style is one of ${CELL_STYLES.join(', ')}`)
  if (!Array.isArray(s.rows) || s.rows.length < 1 || s.rows.length > 8) {
    errors.push(`${at}: rows must hold 1 to 8 entries`)
    return
  }
  s.rows.forEach((row, i) => {
    const w = `${at}.rows[${i}]`
    if (!Array.isArray(row?.cells) || row.cells.length > 12 || !row.cells.every(isCell)) errors.push(`${w}: cells must be up to 12 values`)
    if (!optText(row?.label)) errors.push(`${w}: label must be text`)
    const n = Array.isArray(row?.cells) ? row.cells.length : 0
    ;(row?.pointers || []).forEach((p, j) => {
      if (!intIn(p?.at, 0, Math.max(0, n - 1)) || !isText(p?.label)) errors.push(`${w}.pointers[${j}]: at must index a cell and label is required`)
      if (!optTone(p?.tone)) errors.push(`${w}.pointers[${j}]: unknown tone`)
    })
    if (row?.tones !== undefined) {
      if (typeof row.tones !== 'object' || Array.isArray(row.tones)) errors.push(`${w}: tones must map cell indexes to tones`)
      else for (const [k, v] of Object.entries(row.tones)) if (!intIn(Number(k), 0, n - 1) || !VISUAL_TONES.includes(v)) errors.push(`${w}: tones[${k}] is invalid`)
    }
  })
}

const CHECKS = {
  table: checkTable,
  compare: checkCompare,
  steps: checkSteps,
  flow: checkFlow,
  stack: checkStack,
  bars: checkBars,
  sequence: checkSequence,
  topology: checkTopology,
  tree: checkTree,
  fields: checkFields,
  bits: checkBits,
  cells: checkCells
}

/** Validate one visual spec. Problems go to `errors`; style advice goes to `warnings`. */
export function checkVisual(at, spec, errors, warnings = []) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    errors.push(`${at}: a visual must be an object`)
    return
  }
  if (!VISUAL_TYPES.includes(spec.type)) {
    errors.push(`${at}: unknown visual type ${spec.type}`)
    return
  }
  if (!optText(spec.title)) errors.push(`${at}: title must be text`)
  if (!optText(spec.caption)) errors.push(`${at}: caption must be text`)
  CHECKS[spec.type](`${at} (${spec.type})`, spec, errors, warnings)
}

/** Validate a section's visuals and its placement markers. */
export function checkSectionVisuals(where, section, errors, warnings = []) {
  const list = visualList(section)
  if (section?.visual !== undefined && !list.length) errors.push(`${where}: visual is empty`)
  if (list.length > MAX_VISUALS) errors.push(`${where}: at most ${MAX_VISUALS} visuals per section`)
  list.forEach((spec, i) => checkVisual(`${where}.visual${Array.isArray(section.visual) ? `[${i}]` : ''}`, spec, errors, warnings))
  const placed = new Set()
  for (const part of splitBody(section?.body)) {
    if (part.kind === 'visual') {
      if (part.index >= list.length) errors.push(`${where}: [[visual${part.index ? ` ${part.index + 1}` : ''}]] has no matching visual`)
      else if (placed.has(part.index)) errors.push(`${where}: visual ${part.index + 1} is placed twice`)
      placed.add(part.index)
    }
    if (part.kind === 'code' && !section?.code) errors.push(`${where}: [[code]] but the section has no code`)
  }
}
