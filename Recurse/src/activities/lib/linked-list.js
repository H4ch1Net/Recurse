// Singly linked list as plain data: { nodes: { [id]: { id, value, next } }, head, nextId }.
// Every operation returns a new list plus what it had to walk, so the widget can animate it.
// The reversal walkthrough is a small state machine over the classic three-pointer loop.

export function fromValues(values) {
  const nodes = {}
  let head = null
  let nextId = 1
  const ids = values.map(() => `n${nextId++}`)
  ids.forEach((id, k) => {
    nodes[id] = { id, value: values[k], next: ids[k + 1] ?? null }
  })
  if (ids.length) head = ids[0]
  return { nodes, head, nextId }
}

/** Nodes from head to the end, as [{ id, value, next }]. Stops if it ever sees a node twice. */
export function toArray(list) {
  const out = []
  const seen = new Set()
  let id = list.head
  while (id && !seen.has(id) && list.nodes[id]) {
    seen.add(id)
    out.push(list.nodes[id])
    id = list.nodes[id].next
  }
  return out
}

export const values = (list) => toArray(list).map((n) => n.value)

function addNode(list, value, next) {
  const id = `n${list.nextId}`
  const nodes = { ...list.nodes, [id]: { id, value, next } }
  return { list: { ...list, nodes, nextId: list.nextId + 1 }, id }
}

function setNext(list, id, next) {
  return { ...list, nodes: { ...list.nodes, [id]: { ...list.nodes[id], next } } }
}

export function insertHead(list, value) {
  const { list: added, id } = addNode(list, value, list.head)
  const old = list.head ? list.nodes[list.head].value : null
  return {
    list: { ...added, head: id },
    id,
    walked: [],
    caption: old === null ? `The list was empty, so ${value} becomes the head and points to null.` : `${value} points to the old head (${old}), then head moves to ${value}. No walking needed: O(1).`
  }
}

export function insertTail(list, value) {
  const order = toArray(list)
  if (!order.length) return insertHead(list, value)
  const tail = order[order.length - 1]
  const { list: added, id } = addNode(list, value, null)
  return {
    list: setNext(added, tail.id, id),
    id,
    walked: order.map((n) => n.id),
    caption: `Walked ${order.length} ${order.length === 1 ? 'node' : 'nodes'} from the head to find the tail (${tail.value}), then pointed it at ${value}. That walk makes this O(n) without a tail pointer.`
  }
}

export function insertAfter(list, afterId, value) {
  const order = toArray(list)
  const at = order.findIndex((n) => n.id === afterId)
  if (at === -1) return insertTail(list, value)
  const prev = order[at]
  const { list: added, id } = addNode(list, value, prev.next)
  const nextValue = prev.next ? list.nodes[prev.next].value : 'null'
  return {
    list: setNext(added, prev.id, id),
    id,
    walked: order.slice(0, at + 1).map((n) => n.id),
    caption: `${value} points to ${nextValue} first, then ${prev.value} points to ${value}. In that order, nothing gets lost.`
  }
}

export function deleteNode(list, id) {
  const order = toArray(list)
  const at = order.findIndex((n) => n.id === id)
  if (at === -1) return { list, walked: [], caption: 'That node is not in the list.' }
  const target = order[at]
  const nodes = { ...list.nodes }
  delete nodes[id]
  const nextValue = target.next ? list.nodes[target.next].value : 'null'
  if (at === 0) {
    return { list: { ...list, nodes, head: target.next }, walked: [id], caption: `Deleting the head: head moves to ${nextValue}. O(1).` }
  }
  const prev = order[at - 1]
  return {
    list: setNext({ ...list, nodes }, prev.id, target.next),
    walked: order.slice(0, at + 1).map((n) => n.id),
    caption: `Walked to ${prev.value}, the node before ${target.value}, and pointed it at ${nextValue}. ${target.value} is skipped and gone.`
  }
}

// ---- Reversal -----------------------------------------------------------------------

export const REVERSE_LINES = [
  { id: 'init', code: 'prev = null; curr = head' },
  { id: 'loop', code: 'while (curr != null) {' },
  { id: 'save', code: '  next = curr.next' },
  { id: 'repoint', code: '  curr.next = prev' },
  { id: 'prev', code: '  prev = curr' },
  { id: 'curr', code: '  curr = next' },
  { id: 'end', code: '}' },
  { id: 'head', code: 'head = prev' }
]

export function startReversal(list) {
  return { list, prev: null, curr: null, next: null, started: false, last: null, done: false, steps: 0 }
}

/** The line that has to run next. */
export function expectedLine(rev) {
  if (rev.done) return null
  if (!rev.started) return 'init'
  switch (rev.last) {
    case 'save':
      return 'repoint'
    case 'repoint':
      return 'prev'
    case 'prev':
      return 'curr'
    default:
      return rev.curr === null ? 'head' : 'save'
  }
}

const valueOf = (rev, id) => (id ? rev.list.nodes[id].value : 'null')

/** Why the expected line comes next, for a learner who picked another one. */
export function hintFor(rev) {
  switch (expectedLine(rev)) {
    case 'init':
      return 'Start by setting up the pointers: prev is null and curr is the head.'
    case 'save':
      return `Before changing ${valueOf(rev, rev.curr)}.next, save the node after it. Otherwise the rest of the list is lost.`
    case 'repoint':
      return 'next is saved, so it is now safe to flip curr.next to point back at prev.'
    case 'prev':
      return 'The arrow is flipped. Move prev up to curr before curr moves on, or you lose your place.'
    case 'curr':
      return 'prev has caught up. Now move curr to the saved next node.'
    case 'head':
      return 'curr is null, so the loop is over. The last node you visited (prev) is the new head.'
    default:
      return ''
  }
}

/**
 * Run a line of the reversal loop. Returns { rev, ok, caption }.
 * A wrong line leaves the state alone and returns ok: false with a hint as the caption.
 */
export function applyLine(rev, line) {
  const want = expectedLine(rev)
  if (!want) return { rev, ok: false, caption: 'The list is already reversed.' }
  if (line !== want) return { rev, ok: false, caption: hintFor(rev) }
  const steps = rev.steps + 1
  switch (line) {
    case 'init': {
      const curr = rev.list.head
      return { rev: { ...rev, started: true, prev: null, curr, next: null, last: 'init', steps }, ok: true, caption: curr ? `prev starts at null and curr starts at the head, ${valueOf(rev, curr)}.` : 'The list is empty, so curr starts at null.' }
    }
    case 'save': {
      const next = rev.list.nodes[rev.curr].next
      return { rev: { ...rev, next, last: 'save', steps }, ok: true, caption: next ? `Save next = curr.next, which is ${valueOf(rev, next)}, so the rest of the list is not lost.` : 'Save next = curr.next, which is null: this is the last node.' }
    }
    case 'repoint': {
      const list = setNext(rev.list, rev.curr, rev.prev)
      return { rev: { ...rev, list, last: 'repoint', steps }, ok: true, caption: `Flip the arrow: ${valueOf(rev, rev.curr)} now points back to ${valueOf(rev, rev.prev)}.` }
    }
    case 'prev':
      return { rev: { ...rev, prev: rev.curr, last: 'prev', steps }, ok: true, caption: `Move prev up to ${valueOf(rev, rev.curr)}.` }
    case 'curr': {
      const caption = rev.next ? `Move curr up to ${valueOf(rev, rev.next)}. It is not null, so the loop runs again.` : 'Move curr up to null. The loop condition fails, so the loop ends.'
      return { rev: { ...rev, curr: rev.next, last: 'curr', steps }, ok: true, caption }
    }
    case 'head': {
      const list = { ...rev.list, head: rev.prev }
      return { rev: { ...rev, list, done: true, last: 'head', steps }, ok: true, caption: rev.prev ? `head = prev, which is ${valueOf(rev, rev.prev)}. The list is reversed!` : 'head = prev, which is null. An empty list reversed is still empty.' }
    }
    default:
      return { rev, ok: false, caption: hintFor(rev) }
  }
}

/** Total lines a full reversal runs: 1 + 4 per node + 1. */
export const reversalLength = (count) => 2 + 4 * count
