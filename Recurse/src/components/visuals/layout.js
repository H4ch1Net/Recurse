// Pure layout math for the drawn visuals (sequence, topology, tree, fields, bits, cells): text
// measuring and wrapping, a tidy tree, IPv4 bits, field widths and label placement on a network
// drawing. No React and no DOM, so tests run it directly. Every size here is in CSS pixels: the
// drawings size their SVG from the measured box, so a unit in the viewBox is one pixel on screen.

/** Width used before the box is measured where it can never be measured (tests). */
export const DESKTOP_WIDTH = 640
/** Narrowest box a drawing lays out for; anything smaller is a hidden or collapsing box. */
export const MIN_WIDTH = 240
/** Smallest text any drawing renders. */
export const MIN_TEXT = 12

// Advance widths of ASCII 32 to 126 in Instrument Sans, regular and bold, in hundredths of an
// em (measured in Chromium). JetBrains Mono is 0.6 em for every character.
const SANS = [20, 27, 38, 72, 61, 79, 75, 23, 41, 41, 41, 53, 25, 51, 25, 44, 67, 39, 54, 57, 60, 57, 60, 53, 58, 61, 25, 25, 53, 53, 53, 57, 85, 73, 64, 74, 75, 64, 60, 76, 74, 25, 45, 69, 59, 91, 74, 79, 66, 79, 66, 61, 65, 71, 73, 109, 69, 68, 62, 41, 44, 41, 53, 43, 35, 53, 61, 53, 61, 56, 35, 61, 60, 24, 24, 53, 24, 92, 60, 58, 61, 61, 37, 47, 38, 59, 52, 77, 55, 52, 50, 41, 24, 41, 53]
const SANS_BOLD = [19, 31, 48, 73, 65, 79, 77, 27, 46, 46, 44, 55, 28, 49, 28, 44, 68, 38, 56, 58, 62, 58, 62, 57, 61, 62, 28, 28, 55, 55, 55, 59, 87, 74, 65, 75, 76, 63, 59, 76, 72, 25, 41, 72, 59, 89, 72, 80, 67, 81, 67, 65, 67, 70, 74, 109, 72, 71, 63, 46, 44, 46, 55, 49, 35, 57, 63, 56, 63, 57, 38, 63, 62, 27, 27, 57, 27, 95, 62, 60, 63, 63, 40, 50, 42, 61, 54, 82, 60, 54, 52, 46, 23, 46, 55]
// The body sets word-spacing: 0.05em, which SVG text inherits.
const WORD_SPACING = 0.05
// Measured widths plus a little slack, so a label never runs past its box when a fallback font draws it.
const SLACK = 1.04

/** Width in pixels of one line of text at `size` pixels. */
export function textWidth(text, size, { bold = false, mono = false } = {}) {
  const table = bold ? SANS_BOLD : SANS
  let em = 0
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0)
    if (mono) em += 0.6
    else em += code >= 32 && code < 127 ? table[code - 32] / 100 : 0.62
    if (ch === ' ') em += WORD_SPACING
  }
  return em * size * SLACK
}

/** Size of inline `code` inside sans text: a touch smaller, never under the minimum. */
export const codeSize = (size) => Math.max(MIN_TEXT, Math.round(size * 0.92))

/** Inline markup as runs: [{ text, code, bold }]. */
export function parseInline(text) {
  const out = []
  for (const part of String(text ?? '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g)) {
    if (!part) continue
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) out.push({ text: part.slice(1, -1), code: true })
    else if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) out.push({ text: part.slice(2, -2), bold: true })
    else out.push({ text: part })
  }
  return out
}

/** Text with the inline markers removed (aria labels, measuring). */
export const plainText = (text) => parseInline(text).map((r) => r.text).join('')

const pieceWidth = (p, size) => textWidth(p.text, p.small ? codeSize(size) : size, { bold: p.bold, mono: p.mono })
const piecesWidth = (pieces, size) => pieces.reduce((sum, p) => sum + pieceWidth(p, size), 0)

/** Split text into words; a word keeps the style of each run it spans. */
function wordsOf(text, { bold, mono }) {
  const words = []
  let word = null
  let space = false
  for (const run of parseInline(text)) {
    const style = { bold: Boolean(bold || run.bold), mono: Boolean(mono || run.code), small: Boolean(run.code && !mono) }
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) {
        if (word) words.push(word)
        word = null
        space = true
        continue
      }
      if (!word) {
        word = { pieces: [], space: space && words.length > 0 }
        space = false
      }
      word.pieces.push({ text: part, ...style })
    }
  }
  if (word) words.push(word)
  return words
}

/** Join words into one line of runs, merging neighbors of the same style. */
function lineOf(words, size, spaceW) {
  const runs = []
  let width = 0
  words.forEach((w, i) => {
    w.pieces.forEach((p, j) => {
      const text = i > 0 && j === 0 ? ` ${p.text}` : p.text
      const last = runs[runs.length - 1]
      if (last && last.bold === p.bold && last.mono === p.mono && last.small === p.small) last.text += text
      else runs.push({ ...p, text })
    })
    width += (i > 0 ? spaceW : 0) + piecesWidth(w.pieces, size)
  })
  return { runs, width }
}

/** Shorten a line until it fits `maxWidth` with an ellipsis at the end. */
function ellipsize(line, maxWidth, size) {
  const runs = line.runs.map((r) => ({ ...r }))
  const ell = textWidth('…', size)
  let width = piecesWidth(runs, size)
  while (runs.length && width + ell > maxWidth) {
    const last = runs[runs.length - 1]
    last.text = last.text.slice(0, -1).replace(/\s+$/, '')
    if (!last.text) runs.pop()
    width = piecesWidth(runs, size)
  }
  if (runs.length) runs[runs.length - 1].text += '…'
  else runs.push({ text: '…', bold: false, mono: false, small: false })
  return { runs, width: piecesWidth(runs, size) }
}

/** Greedy line breaking: words into groups no wider than `limit`. */
function breakWords(words, limit, size, spaceW) {
  const groups = []
  let cur = []
  let curW = 0
  for (const w of words) {
    const ww = piecesWidth(w.pieces, size)
    if (cur.length && curW + spaceW + ww > limit) {
      groups.push(cur)
      cur = [w]
      curW = ww
    } else {
      curW += (cur.length ? spaceW : 0) + ww
      cur.push(w)
    }
  }
  if (cur.length) groups.push(cur)
  return groups
}

/**
 * Wrap text (with inline markup) to lines no wider than `maxWidth`, at most `maxLines` of them;
 * the last line ends in an ellipsis when the text does not fit. A single word wider than the
 * limit gets a line of its own and is left whole. With `balance`, lines come out about even
 * ("10.1.1.20 / for 24 hours", not "10.1.1.20 for 24 / hours").
 * Returns { lines: [{ runs: [{ text, bold, mono, small }], width }], width, truncated }.
 */
export function wrapText(text, maxWidth, size, { bold = false, mono = false, maxLines = 2, balance = true } = {}) {
  const words = wordsOf(text, { bold, mono })
  const spaceW = textWidth(' ', size, { bold, mono })
  let groups = breakWords(words, maxWidth, size, spaceW)
  if (balance && groups.length > 1 && groups.length <= maxLines) {
    // The narrowest limit that still gives the same number of lines.
    let lo = 0
    let hi = maxWidth
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (breakWords(words, mid, size, spaceW).length <= groups.length) hi = mid
      else lo = mid
    }
    groups = breakWords(words, hi, size, spaceW)
  }
  let truncated = false
  if (groups.length > maxLines) {
    truncated = true
    const head = groups.slice(0, maxLines - 1)
    head.push(groups.slice(maxLines - 1).flat())
    groups.length = 0
    groups.push(...head)
  }
  const lines = groups.map((g) => lineOf(g, size, spaceW))
  if (truncated) lines[lines.length - 1] = ellipsize(lines[lines.length - 1], maxWidth, size)
  return { lines, width: Math.max(0, ...lines.map((l) => l.width)), truncated }
}

/** Width of the widest single word: the narrowest a box can be without breaking a word. */
export function longestWord(text, size, opts = {}) {
  return Math.max(0, ...wordsOf(text, opts).map((w) => piecesWidth(w.pieces, size)))
}

/** Baseline for a line of text whose line box starts at `top`. */
export const baseline = (top, size, lineHeight) => top + lineHeight / 2 + size * 0.35

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))

// ---- Tidy tree ---------------------------------------------------------------------------

/**
 * Tidy layout of a tree whose nodes have their own sizes. Each subtree is packed against the
 * contour of its left siblings, so nothing overlaps, and every parent sits centered over its
 * first and last child. `sizeOf(node, depth)` returns { w, h }.
 * Returns { nodes: [{ node, x, y, w, h, depth, parent }], width, height, levels } with x the
 * center, y the top, nodes in preorder and parent the index of the parent (-1 for the root).
 */
export function tidyTree(root, sizeOf, { gap = 12, levelGap = 32 } = {}) {
  const levelH = []
  const measure = (node, depth) => {
    const { w, h } = sizeOf(node, depth)
    levelH[depth] = Math.max(levelH[depth] || 0, h)
    return { node, depth, w, h, dx: 0, kids: (node.children || []).map((c) => measure(c, depth + 1)) }
  }
  const tree = measure(root, 0)

  const place = (n) => {
    if (!n.kids.length) return { left: [-n.w / 2], right: [n.w / 2] }
    let accLeft = null
    let accRight = null
    n.kids.forEach((k, i) => {
      const c = place(k)
      if (i === 0) {
        accLeft = c.left.slice()
        accRight = c.right.slice()
        return
      }
      let shift = -Infinity
      for (let d = 0; d < Math.min(accRight.length, c.left.length); d++) shift = Math.max(shift, accRight[d] + gap - c.left[d])
      k.dx = shift
      c.left.forEach((v, d) => {
        if (d >= accLeft.length) accLeft[d] = v + shift
        accRight[d] = c.right[d] + shift
      })
    })
    const mid = (n.kids[0].dx + n.kids[n.kids.length - 1].dx) / 2
    for (const k of n.kids) k.dx -= mid
    return { left: [-n.w / 2, ...accLeft.map((v) => v - mid)], right: [n.w / 2, ...accRight.map((v) => v - mid)] }
  }
  place(tree)

  const tops = []
  levelH.forEach((h, d) => (tops[d] = d === 0 ? 0 : tops[d - 1] + levelH[d - 1] + levelGap))
  const nodes = []
  const walk = (n, x, parent) => {
    const index = nodes.length
    nodes.push({ node: n.node, x, y: tops[n.depth] + (levelH[n.depth] - n.h) / 2, w: n.w, h: n.h, depth: n.depth, parent })
    for (const k of n.kids) walk(k, x + k.dx, index)
  }
  walk(tree, 0, -1)
  const minX = Math.min(...nodes.map((n) => n.x - n.w / 2))
  for (const n of nodes) n.x -= minX
  const width = Math.max(...nodes.map((n) => n.x + n.w / 2))
  const height = tops[tops.length - 1] + levelH[levelH.length - 1]
  return { nodes, width, height, levels: levelH.map((h, d) => ({ top: tops[d], height: h })) }
}

/** Number of nodes in a tree. */
export const treeSize = (node) => 1 + (node.children || []).reduce((sum, c) => sum + treeSize(c), 0)

// ---- IPv4 bits ---------------------------------------------------------------------------

/** "192.168.1.5" as [192, 168, 1, 5]. */
export const ipv4Octets = (value) => String(value).split('.').map(Number)

/** A number as a zero-padded binary string. */
export const toBinary = (n, width = 8) => (Number(n) >>> 0).toString(2).padStart(width, '0').slice(-width)

/** "192.168.1.5" as four 8-character binary strings. */
export const ipv4ToBits = (value) => ipv4Octets(value).map((o) => toBinary(o))

/**
 * One bits row as octets ready to draw. Each octet is { index, binary, text, digits, net } where
 * digits is [{ bit, host, cut }] for a binary octet (cut marks the first host bit), and net is
 * 'net', 'host' or 'mixed' against the prefix (null without one).
 * Raw bit strings come back as { raw: true, groups: [[...digits]] }.
 */
export function bitsRow(row, { prefix, octets } = {}) {
  const shown = new Set(octets ?? [0, 1, 2, 3])
  const side = (pos) => (prefix === undefined ? null : pos < prefix ? 'net' : 'host')
  const digitsOf = (bits, start) =>
    [...bits].map((bit, i) => {
      const s = side(start + i)
      return { bit, host: s === 'host', net: s === 'net', cut: prefix !== undefined && prefix > 0 && prefix < 32 && start + i === prefix }
    })
  if (row.bits !== undefined) {
    const compact = row.bits.replace(/ /g, '')
    if (compact.length === 32 && !row.bits.includes(' ')) {
      return { raw: false, octets: [0, 1, 2, 3].map((i) => ({ index: i, binary: true, text: compact.slice(i * 8, i * 8 + 8), digits: digitsOf(compact.slice(i * 8, i * 8 + 8), i * 8) })) }
    }
    // Any other bit string keeps the author's grouping. Prefix colors only apply to 32 bits.
    let pos = 0
    const whole = compact.length === 32
    const groups = row.bits.trim().split(/ +/).map((g) => {
      const digits = whole ? digitsOf(g, pos) : [...g].map((bit) => ({ bit, host: false, net: false, cut: false }))
      pos += g.length
      return digits
    })
    return { raw: true, groups }
  }
  const values = ipv4Octets(row.value)
  return {
    raw: false,
    octets: values.map((v, i) => {
      const lo = i * 8
      const net = prefix === undefined ? null : prefix >= lo + 8 ? 'net' : prefix <= lo ? 'host' : 'mixed'
      if (!shown.has(i)) return { index: i, binary: false, text: String(v), net }
      return { index: i, binary: true, text: toBinary(v), digits: digitsOf(toBinary(v), lo), net }
    })
  }
}

// ---- Fields ------------------------------------------------------------------------------

/**
 * Relative widths of a row of header fields. Numeric sizes count as they are. A variable field
 * (text size) shares what is left of `width` by weight, or without a width takes `weight` times
 * the average numeric field of the row.
 */
export function fieldShares(row, width) {
  const fixed = row.filter((f) => typeof f.size === 'number')
  const fixedSum = fixed.reduce((sum, f) => sum + f.size, 0)
  const weightOf = (f) => f.weight ?? 2
  const weights = row.filter((f) => typeof f.size !== 'number').reduce((sum, f) => sum + weightOf(f), 0)
  const unit = width && width > fixedSum && weights ? (width - fixedSum) / weights : fixed.length ? fixedSum / fixed.length : 1
  return row.map((f) => (typeof f.size === 'number' ? f.size : weightOf(f) * unit))
}

/**
 * Split `total` pixels in proportion to `shares`, but never give a field less than its minimum:
 * fields under their minimum get exactly that and the rest share what remains. Null when the
 * minimums alone do not fit.
 */
export function fitWidths(shares, mins, total) {
  if (mins.reduce((a, b) => a + b, 0) > total + 0.5) return null
  const widths = shares.map(() => 0)
  const locked = new Set()
  for (;;) {
    const free = shares.map((_, i) => i).filter((i) => !locked.has(i))
    const room = total - [...locked].reduce((sum, i) => sum + widths[i], 0)
    const shareSum = free.reduce((sum, i) => sum + shares[i], 0)
    const want = (i) => (shareSum > 0 ? (shares[i] / shareSum) * room : room / free.length)
    const short = free.filter((i) => want(i) < mins[i])
    if (!short.length) {
      for (const i of free) widths[i] = want(i)
      return widths
    }
    for (const i of short) {
      widths[i] = mins[i]
      locked.add(i)
    }
  }
}

// ---- Geometry ----------------------------------------------------------------------------

export const rect = (x, y, w, h) => ({ x, y, w, h })
export const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

/** True when the segment from (x1, y1) to (x2, y2) crosses the rectangle (Liang-Barsky clip). */
export function segmentHitsRect(x1, y1, x2, y2, r) {
  let t0 = 0
  let t1 = 1
  const dx = x2 - x1
  const dy = y2 - y1
  const edges = [
    [-dx, x1 - r.x],
    [dx, r.x + r.w - x1],
    [-dy, y1 - r.y],
    [dy, r.y + r.h - y1]
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

/** Distance from a box's center to its edge along the unit direction (ux, uy). */
export function edgeDistance(w, h, ux, uy) {
  const ax = Math.abs(ux)
  const ay = Math.abs(uy)
  if (ax < 1e-9) return h / 2
  if (ay < 1e-9) return w / 2
  return Math.min(w / 2 / ax, h / 2 / ay)
}

// ---- Device icons ------------------------------------------------------------------------

/** Width and height of each device icon (see device-icons.jsx), centered on its node. */
export const ICON_BOX = {
  router: { w: 40, h: 40 },
  switch: { w: 52, h: 28 },
  l3switch: { w: 52, h: 34 },
  firewall: { w: 44, h: 32 },
  server: { w: 30, h: 40 },
  pc: { w: 32, h: 30 },
  laptop: { w: 44, h: 30 },
  phone: { w: 36, h: 30 },
  printer: { w: 38, h: 34 },
  ap: { w: 40, h: 30 },
  wlc: { w: 50, h: 28 },
  cloud: { w: 58, h: 38 },
  internet: { w: 38, h: 38 },
  db: { w: 32, h: 40 },
  host: { w: 44, h: 34 }
}

const KIND_WORDS = {
  router: 'router',
  switch: 'switch',
  l3switch: 'Layer 3 switch',
  firewall: 'firewall',
  server: 'server',
  pc: 'PC',
  laptop: 'laptop',
  phone: 'IP phone',
  printer: 'printer',
  ap: 'access point',
  wlc: 'wireless LAN controller',
  cloud: 'cloud',
  internet: 'internet',
  db: 'database',
  host: 'host'
}

/** A device kind in words, for aria labels. */
export const kindWords = (kind) => KIND_WORDS[kind] || kind

/** "a, b and c". */
export function listWords(items) {
  const list = items.filter(Boolean)
  if (list.length < 2) return list.join('')
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

// ---- Sequence ----------------------------------------------------------------------------

/** Sizes for the sequence diagram, a step larger when there is room. */
export const sequenceText = (big) => ({
  label: big ? 14 : 13,
  labelLh: big ? 18 : 17,
  detail: big ? 13 : 12,
  detailLh: big ? 16 : 15,
  actor: 13,
  actorLh: 16,
  note: big ? 13 : 12,
  noteLh: big ? 17 : 16
})

/**
 * Positions for a sequence diagram drawn `width` pixels wide: actor lanes spread across the
 * width (up to a comfortable maximum) and one row per message, with labels wrapped to two lines.
 * Returns { width, height, text, iconScale, actors, rows, lifeTop, lifeBottom }.
 */
export function layoutSequence(spec, width) {
  const n = spec.actors.length
  const W = Math.min(width, 140 * n + 200)
  const T = sequenceText(W >= 560)
  const colW = W / n
  const lanes = spec.actors.map((_, i) => colW * (i + 0.5))
  const lane = Object.fromEntries(spec.actors.map((a, i) => [a.id, lanes[i]]))
  const iconScale = colW < 76 ? 0.8 : 1
  const iconH = Math.max(0, ...spec.actors.filter((a) => a.kind).map((a) => (ICON_BOX[a.kind]?.h ?? 30) * iconScale))
  const edge = 4

  // A name with a word wider than its lane would run into its neighbors: the names then
  // alternate between two rows, which gives each one two lanes of room.
  const stagger = n > 2 && spec.actors.some((a) => longestWord(a.label, T.actor, { bold: true }) > colW - 8)
  const room = stagger ? 2 * colW - 14 : colW - 8
  const texts = spec.actors.map((a) => wrapText(a.label, Math.max(room - (a.kind ? 0 : 12), 44), T.actor, { bold: true, maxLines: 3 }))
  const rowA = Math.max(...texts.filter((_, i) => i % 2 === 0).map((t) => t.lines.length)) * T.actorLh + 4
  const actors = spec.actors.map((a, i) => {
    const boxed = !a.kind
    const text = texts[i]
    const textH = text.lines.length * T.actorLh
    const shift = stagger && i % 2 ? rowA : 0
    const x = clamp(lanes[i], text.width / 2 + edge, W - text.width / 2 - edge)
    if (boxed) {
      const boxW = Math.min(room + 6, text.width + 20)
      const top = (iconH ? iconH / 2 - textH / 2 - 5 : 0) + shift
      return { ...a, x: lanes[i], boxed, text, textX: x, textTop: top + 5, box: rect(lanes[i] - boxW / 2, top, boxW, textH + 10), bottom: top + textH + 10, lifeStart: top + textH + 10 }
    }
    const top = iconH + 6 + shift
    const ownH = (ICON_BOX[a.kind]?.h ?? 30) * iconScale
    return { ...a, x: lanes[i], boxed, text, textX: x, textTop: top, iconY: iconH / 2, bottom: top + textH, lifeStart: iconH / 2 + ownH / 2 + 4 }
  })
  const lifeTop = Math.max(...actors.map((a) => a.bottom)) + 6

  let y = lifeTop + 10
  const rows = spec.messages.map((m) => {
    if (m.note !== undefined) {
      const xs = m.over.map((id) => lane[id])
      const lo = Math.min(...xs)
      const hi = Math.max(...xs)
      const padX = Math.min(colW * 0.42, 70)
      const minW = Math.min(W - 2 * edge, Math.max(hi - lo + 2 * padX, 220))
      const text = wrapText(m.note, minW - 20, T.note, { maxLines: 4 })
      const boxW = Math.min(W - 2 * edge, Math.max(hi - lo + 2 * padX, text.width + 20))
      const cx = clamp((lo + hi) / 2, boxW / 2 + edge, W - boxW / 2 - edge)
      const boxH = text.lines.length * T.noteLh + 12
      const row = { kind: 'note', m, text, box: rect(cx - boxW / 2, y, boxW, boxH), textX: cx, textTop: y + 6 }
      y += boxH + 14
      return row
    }
    const a = lane[m.from]
    const b = lane[m.to]
    if (m.from === m.to) {
      const right = a + 40 < W - 90 || a < W / 2
      const room = right ? W - a - 40 - edge : a - 40 - edge
      const label = wrapText(m.label, room, T.label, { bold: true, maxLines: 3 })
      const detail = m.detail ? wrapText(m.detail, room, T.detail, { maxLines: 3 }) : null
      const textH = label.lines.length * T.labelLh + (detail ? detail.lines.length * T.detailLh : 0)
      const loopH = Math.max(18, textH - 10)
      const row = { kind: 'self', m, x: a, right, label, detail, top: y, loopTop: y + 6, loopH, textX: right ? a + 38 : a - 38 }
      y += Math.max(textH, loopH + 12) + 14
      return row
    }
    const span = Math.abs(b - a)
    const mid = (a + b) / 2
    // One line if it fits a little past the lanes, else two lines between them, else wider.
    const oneLine = Math.min(W - 2 * edge, span + colW * 0.5)
    const wide = Math.min(W - 2 * edge, Math.max(span - 16, 220))
    const fit = (text, size, bold) => {
      const one = wrapText(text, oneLine, size, { bold, maxLines: 1 })
      if (!one.truncated && one.width <= oneLine) return one
      const two = wrapText(text, span - 16, size, { bold, maxLines: 2 })
      if (!two.truncated && two.width <= span - 16) return two
      return wrapText(text, wide, size, { bold, maxLines: 3 })
    }
    const label = fit(m.label, T.label, true)
    const detail = m.detail ? fit(m.detail, T.detail, false) : null
    const labelH = label.lines.length * T.labelLh
    const arrowY = y + labelH + 5
    const row = {
      kind: 'message',
      m,
      x1: a,
      x2: b,
      arrowY,
      label,
      labelX: clamp(mid, label.width / 2 + edge, W - label.width / 2 - edge),
      labelTop: y,
      detail,
      detailX: detail ? clamp(mid, detail.width / 2 + edge, W - detail.width / 2 - edge) : 0,
      detailTop: arrowY + 5
    }
    y = arrowY + (detail ? 5 + detail.lines.length * T.detailLh : 4) + 14
    return row
  })
  return { width: W, height: y + 2, text: T, iconScale, actors, rows, lifeTop, lifeBottom: y - 6 }
}


// ---- Topology ----------------------------------------------------------------------------

/** Sizes for the topology drawing. */
export const TOPO_TEXT = { label: 13, labelLh: 16, sub: 12, subLh: 15, port: 12, portLh: 15, link: 12, linkLh: 15, mark: 12, markLh: 15 }

const grow = (r, d) => rect(r.x - d, r.y - d, r.w + 2 * d, r.h + 2 * d)

/** The smallest rectangle around a list of rectangles. */
function bounds(list) {
  const x = Math.min(...list.map((b) => b.x))
  const y = Math.min(...list.map((b) => b.y))
  return rect(x, y, Math.max(...list.map((b) => b.x + b.w)) - x, Math.max(...list.map((b) => b.y + b.h)) - y)
}

/** Keep a rectangle inside [x0, x1] horizontally. */
const inside = (r, x0, x1) => ({ ...r, x: clamp(r.x, x0, x1 - r.w) })

/**
 * The cheapest of several spots for a label: each pays its own cost plus a price for running
 * off the sides, sitting on an icon or another label, or crossing a link (and, for a callout,
 * a leader that crosses text).
 */
function placeBest(candidates, world, skipLink = -1) {
  return scored(candidates, world, skipLink).reduce((a, b) => (b.score < a.score ? b : a))
}

/** Like placeBest, then nudges the best few spots a little to slip into gaps between lines. */
function placeNudged(candidates, world) {
  const top = scored(candidates, world).sort((a, b) => a.score - b.score).slice(0, 6)
  const nudged = []
  for (const c of top) {
    for (let dx = -36; dx <= 36; dx += 4) {
      for (let dy = -16; dy <= 16; dy += 4) {
        const r = rect(clamp(c.rect.x + dx, world.x0, world.x1 - c.rect.w), c.rect.y + dy, c.rect.w, c.rect.h)
        const leader = c.leader && [c.leader[0], c.leader[1], r.x + r.w / 2, r.y + r.h / 2]
        nudged.push({ ...c, rect: r, leader, cost: c.cost + (Math.abs(dx) + Math.abs(dy)) / 24 })
      }
    }
  }
  return placeBest(nudged, world)
}

function scored(candidates, world, skipLink = -1) {
  return candidates.map((c) => {
    const r = c.rect
    let s = c.cost ?? 0
    if (r.x < world.x0 - 0.5 || r.x + r.w > world.x1 + 0.5) s += 60
    if (r.y < world.y0) s += (world.y0 - r.y) / 10
    if (r.y + r.h > world.y1) s += (r.y + r.h - world.y1) / 10
    // Text on another device's icon is the worst outcome: worse than crossing a line or touching a label.
    for (const o of world.icons) if (overlaps(r, o, 3)) s += 30 + overlapArea(grow(r, 3), o) / 30
    for (const o of world.texts) {
      if (overlaps(r, o, 6)) s += 14 + overlapArea(grow(r, 6), o) / 30
      // Two labels side by side on one line read as one phrase.
      else if (overlaps(r, o, 24) && r.y < o.y + o.h && o.y < r.y + r.h) s += 3
    }
    for (const l of world.segments) {
      // Keep text a few pixels off every line (a radio wave swings about 4px either side).
      if (l.index !== skipLink && segmentHitsRect(l.x1, l.y1, l.x2, l.y2, grow(r, l.style === 'wireless' ? 6 : 4))) s += l.index === c.link ? 30 : 9
    }
    if (c.leader) {
      const [x1, y1, x2, y2] = c.leader
      for (const o of world.texts) if (segmentHitsRect(x1, y1, x2, y2, o)) s += 5
      for (const o of world.icons) if (o !== c.own && segmentHitsRect(x1, y1, x2, y2, o)) s += 5
    }
    return { ...c, score: s }
  })
}

// Directions tried around a callout's anchor, best first: above, the upper diagonals, the sides, below.
const RING = [-90, -55, -125, 0, 180, -20, -160, 20, 160, 90, 55, 125].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)])

/**
 * Positions for a network drawing `width` pixels wide. Grid columns spread across the width;
 * every label is placed on the free side of its node or link so lines never run through text.
 * Returns { width, height, nodes, links, zones, marks } in pixels, ready to draw.
 */
export function layoutTopology(spec, width) {
  const T = TOPO_TEXT
  const cols = Math.max(...spec.nodes.map((n) => n.x)) + 1
  const rows = Math.max(...spec.nodes.map((n) => n.y)) + 1
  const W = Math.min(width, cols * 200 + 40)
  const phone = W < 420
  const colW = W / cols
  const links = spec.links || []
  const rowOf = Object.fromEntries(spec.nodes.map((n) => [n.id, n.y]))

  // Row pitch: room for icons and labels, plus a little more where a link carries a label.
  const pitch = phone ? 112 : 124
  const rowY = [0]
  for (let r = 1; r < rows; r++) {
    const labeled = links.some((l) => l.label && Math.min(rowOf[l.from], rowOf[l.to]) < r && Math.max(rowOf[l.from], rowOf[l.to]) >= r)
    rowY[r] = rowY[r - 1] + pitch + (labeled ? 18 : 0)
  }

  const nodes = spec.nodes.map((n) => {
    const box = ICON_BOX[n.kind] || ICON_BOX.host
    const cx = colW * (n.x + 0.5)
    const cy = rowY[n.y]
    return { ...n, cx, cy, box, iconRect: rect(cx - box.w / 2, cy - box.h / 2, box.w, box.h) }
  })
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const world = { x0: 2, x1: W - 2, y0: -48, y1: rowY[rows - 1] + 64, icons: nodes.map((n) => n.iconRect), texts: [], segments: [] }

  const linkGeo = links.map((l, index) => {
    const a = byId[l.from]
    const b = byId[l.to]
    const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1
    const ux = (b.cx - a.cx) / len
    const uy = (b.cy - a.cy) / len
    const da = edgeDistance(a.box.w, a.box.h, ux, uy) + 3
    const db = edgeDistance(b.box.w, b.box.h, ux, uy) + 3
    const geo = { ...l, index, a, b, ux, uy, len, x1: a.cx + ux * da, y1: a.cy + uy * da, x2: b.cx - ux * db, y2: b.cy - uy * db, labels: [], keyed: [] }
    world.segments.push(geo)
    return geo
  })

  // Directions of the other links at a node, to keep port labels on the far side of them.
  const others = (node, self) =>
    linkGeo.filter((g) => g !== self && (g.a === node || g.b === node)).map((g) => (g.a === node ? [g.ux, g.uy] : [-g.ux, -g.uy]))

  // Interface labels sit beside the line, just past the device they belong to.
  for (const g of linkGeo) {
    for (const end of ['from', 'to']) {
      const text = g[`${end}Label`]
      if (!text) continue
      const t = wrapText(text, 90, T.port, { mono: true, maxLines: 1 })
      const w = t.width + 4
      const h = T.portLh
      const sign = end === 'from' ? 1 : -1
      const ox = end === 'from' ? g.x1 : g.x2
      const oy = end === 'from' ? g.y1 : g.y2
      const near = others(end === 'from' ? g.a : g.b, g)
      const candidates = []
      for (const along of [8, 22]) {
        for (const side of [1, -1]) {
          const nx = -g.uy * side
          const ny = g.ux * side
          const ext = Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2) + (g.style === 'serial' || g.style === 'wireless' ? 7 : 3)
          const reach = along + Math.abs(g.ux) * (w / 2) + Math.abs(g.uy) * (h / 2)
          const cx = ox + sign * g.ux * reach + nx * ext
          const cy = oy + sign * g.uy * reach + ny * ext
          const crowd = near.reduce((sum, [dx, dy]) => sum + Math.max(0, nx * dx + ny * dy), 0)
          candidates.push({ rect: rect(cx - w / 2, cy - h / 2, w, h), cost: (along > 8 ? 2 : 0) + (side < 0 ? 0.3 : 0) + crowd * 1.5 })
        }
      }
      const best = placeBest(candidates, world, g.index)
      // No room beside a very short link: the port goes to the key under the drawing.
      if (best.score - best.cost >= 12) {
        g.keyed.push({ node: end === 'from' ? g.a : g.b, other: end === 'from' ? g.b : g.a, port: text })
        continue
      }
      world.texts.push(best.rect)
      g.labels.push({ kind: 'port', text: t, rect: best.rect })
    }
  }

  // A link's own label is a pill on the line.
  for (const g of linkGeo) {
    if (!g.label) continue
    const t = wrapText(g.label, Math.max(80, Math.min(140, g.len - 20)), T.link, { maxLines: 2 })
    const w = t.width + 12
    const h = t.lines.length * T.linkLh + 5
    // On the line first; beside it when a short link has no room.
    const candidates = []
    ;[0.5, 0.4, 0.6, 0.32, 0.68].forEach((f, i) => {
      const cx = g.x1 + (g.x2 - g.x1) * f
      const cy = g.y1 + (g.y2 - g.y1) * f
      candidates.push({ rect: rect(cx - w / 2, cy - h / 2, w, h), cost: i * 0.8 })
      for (const side of [1, -1]) {
        const nx = -g.uy * side
        const ny = g.ux * side
        const ext = Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2) + 4
        candidates.push({ rect: rect(cx + nx * ext - w / 2, cy + ny * ext - h / 2, w, h), cost: 4 + i * 0.8 })
      }
    })
    const best = placeBest(candidates, world, g.index)
    if (best.score - best.cost >= 12) {
      g.keyed.push({ node: g.a, other: g.b, label: g.label })
      continue
    }
    world.texts.push(best.rect)
    g.labels.push({ kind: 'link', text: t, rect: best.rect })
  }

  // Node labels go below the icon unless a link or another label is there. When no spot is
  // clear, the sub line (an address, a role) moves to a key under the drawing.
  const labelSpots = (n, label, sub) => {
    const w = Math.max(label.width, sub?.width ?? 0)
    const h = label.lines.length * T.labelLh + (sub ? sub.lines.length * T.subLh : 0)
    const { cx, cy } = n
    const { w: bw, h: bh } = n.box
    const fit = (x, y) => inside(rect(x, y, w, h), 2, W - 2)
    return [
      { rect: fit(cx - w / 2, cy + bh / 2 + 4), align: 'middle', cost: 0 },
      { rect: rect(cx + bw / 2 + 7, cy - h / 2, w, h), align: 'start', cost: 1 },
      { rect: rect(cx - bw / 2 - 7 - w, cy - h / 2, w, h), align: 'end', cost: 1.4 },
      { rect: fit(cx - w / 2, cy - bh / 2 - 4 - h), align: 'middle', cost: 2 },
      { rect: rect(cx + bw / 2 + 4, cy + bh / 2 - 4, w, h), align: 'start', cost: 2.6 },
      { rect: rect(cx - bw / 2 - 4 - w, cy + bh / 2 - 4, w, h), align: 'end', cost: 2.8 },
      { rect: rect(cx + bw / 2 + 4, cy - bh / 2 + 4 - h, w, h), align: 'start', cost: 3 },
      { rect: rect(cx - bw / 2 - 4 - w, cy - bh / 2 + 4 - h, w, h), align: 'end', cost: 3.2 }
    ]
  }
  for (const n of nodes) {
    const label = wrapText(n.label, Math.max(colW - 10, 70), T.label, { bold: true, maxLines: 2 })
    const sub = n.sub ? wrapText(n.sub, Math.max(colW - 4, 96), T.sub, { mono: true, maxLines: 2 }) : null
    let best = placeBest(labelSpots(n, label, sub), world)
    let keyed = false
    if (sub && best.score - best.cost >= 12) {
      const bare = placeBest(labelSpots(n, label, null), world)
      if (bare.score - bare.cost < best.score - best.cost) {
        best = bare
        keyed = true
      }
    }
    world.texts.push(best.rect)
    n.text = { label, sub: keyed ? null : sub, keyed, rect: best.rect, align: best.align }
  }

  // Zones wrap their nodes and labels; the zone's name takes the freest corner, and the zone
  // grows to hold it.
  const zones = (spec.zones || []).map((z) => {
    const members = z.nodes.map((id) => byId[id])
    // Wrap the labels too, unless that would take in a device outside the zone.
    let boxes = members.flatMap((m) => [m.iconRect, m.text.rect])
    if (nodes.some((o) => !z.nodes.includes(o.id) && overlaps(grow(bounds(boxes), 8), o.iconRect))) boxes = members.map((m) => m.iconRect)
    const b = bounds(boxes)
    const t = wrapText(z.label, Math.max(80, W / 2), T.label - 1, { bold: true, maxLines: 1 })
    const th = T.labelLh
    const spots = [
      [b.x, b.y - th - 4, 0],
      [b.x + b.w - t.width, b.y - th - 4, 0.5],
      [b.x, b.y + b.h + 4, 1],
      [b.x + b.w - t.width, b.y + b.h + 4, 1.5],
      [b.x - t.width - 10, b.y, 2],
      [b.x + b.w + 10, b.y, 2.5]
    ]
    const best = placeNudged(spots.map(([x, y, cost]) => ({ rect: inside(rect(x, y, t.width, th), 9, W - 9), cost })), world)
    world.texts.push(best.rect)
    const box = grow(bounds([...boxes, best.rect]), 8)
    const x0 = Math.max(1, box.x)
    return { ...z, rect: rect(x0, box.y, Math.min(W - 1, box.x + box.w) - x0, box.h), text: t, textRect: best.rect }
  })

  // Callouts take the nearest free spot around their node or link, joined by a short leader.
  // When none is free (a crowded phone drawing), the callout becomes a numbered badge and its
  // text is listed under the drawing.
  let badges = 0
  const ring = (anchors, shapes, dists, link) => {
    const candidates = []
    shapes.forEach((t, s) => {
      const w = t ? t.width + 14 : 20
      const h = t ? t.lines.length * T.markLh + 8 : 20
      anchors.forEach((a, k) => {
        dists.forEach((dist, d) => {
          RING.forEach(([ux, uy], j) => {
            const reach = (a.w ? edgeDistance(a.w, a.h, ux, uy) : 0) + dist + edgeDistance(w, h, ux, uy)
            const r = inside(rect(a.x + ux * reach - w / 2, a.y + uy * reach - h / 2, w, h), 2, W - 2)
            candidates.push({ rect: r, text: t, from: { x: a.x, y: a.y }, own: a.own, link, leader: [a.x, a.y, r.x + r.w / 2, r.y + r.h / 2], cost: s * 1.5 + k * 0.6 + d * 1.2 + j * 0.08 })
          })
        })
      })
    })
    return placeNudged(candidates, world)
  }
  const marks = (spec.marks || []).map((m) => {
    // One line where it fits; a narrower two-line version can slip between links.
    const wide = wrapText(m.text, Math.min(160, Math.max(110, W * 0.5)), T.mark, { bold: true, maxLines: 3 })
    const narrow = wrapText(m.text, Math.max(56, wide.width / 2 + 10), T.mark, { bold: true, maxLines: 3 })
    const shapes = narrow.lines.length > wide.lines.length && !narrow.truncated ? [wide, narrow] : [wide]
    const link = typeof m.at === 'string' && m.at.startsWith('link:') ? linkGeo[Number(m.at.slice(5))] : null
    const anchors = link
      ? [0.5, 0.35, 0.65].map((f) => ({ x: link.x1 + (link.x2 - link.x1) * f, y: link.y1 + (link.y2 - link.y1) * f, w: 0, h: 0 }))
      : [{ x: byId[m.at].cx, y: byId[m.at].cy, w: byId[m.at].box.w, h: byId[m.at].box.h, own: byId[m.at].iconRect }]
    let best = ring(anchors, shapes, [8, 24, 44, 70], link?.index)
    let badge = null
    if (best.score - best.cost > 8) {
      best = ring(anchors, [null], [6, 16, 30], link?.index)
      badge = ++badges
    }
    world.texts.push(best.rect)
    return { ...m, lines: best.text, badge, rect: best.rect, from: best.from }
  })

  // Fit the drawing's height to everything placed, with the top at y = 0.
  const all = [...nodes.flatMap((n) => [n.iconRect, n.text.rect]), ...linkGeo.flatMap((g) => g.labels.map((l) => l.rect)), ...zones.map((z) => z.rect), ...marks.map((m) => m.rect)]
  const minY = Math.min(...all.map((r) => r.y)) - 4
  const maxY = Math.max(...all.map((r) => r.y + r.h)) + 4
  const dy = -minY
  const move = (r) => ({ ...r, y: r.y + dy })
  for (const n of nodes) {
    n.cy += dy
    n.iconRect = move(n.iconRect)
    n.text.rect = move(n.text.rect)
  }
  for (const g of linkGeo) {
    g.y1 += dy
    g.y2 += dy
    g.labels = g.labels.map((l) => ({ ...l, rect: move(l.rect) }))
  }
  for (const z of zones) {
    z.rect = move(z.rect)
    z.textRect = move(z.textRect)
  }
  for (const m of marks) {
    m.rect = move(m.rect)
    m.from = { x: m.from.x, y: m.from.y + dy }
  }
  return { width: W, height: maxY - minY, phone, nodes, links: linkGeo, zones, marks }
}
