// Binary search tree as immutable nested nodes { value, left, right }.

export function insert(root, value) {
  const path = []
  function go(node) {
    if (!node) return { value, left: null, right: null }
    path.push(node.value)
    if (value === node.value) return node
    if (value < node.value) return { ...node, left: go(node.left) }
    return { ...node, right: go(node.right) }
  }
  const dup = contains(root, value)
  const next = dup ? root : go(root)
  if (dup) {
    path.length = 0
    path.push(...search(root, value).path)
  }
  return { root: next, path, duplicate: dup }
}

export function fromValues(values) {
  let root = null
  for (const v of values) root = insert(root, v).root
  return root
}

export function contains(root, value) {
  let node = root
  while (node) {
    if (value === node.value) return true
    node = value < node.value ? node.left : node.right
  }
  return false
}

/**
 * Search from the root. Returns { path, found, steps } where steps describe each move:
 * { value, dir: 'left' | 'right' | 'found' | 'missing' }.
 */
export function search(root, value) {
  const path = []
  const steps = []
  let node = root
  while (node) {
    path.push(node.value)
    if (value === node.value) {
      steps.push({ value: node.value, dir: 'found' })
      return { path, found: true, steps }
    }
    const dir = value < node.value ? 'left' : 'right'
    const child = dir === 'left' ? node.left : node.right
    steps.push({ value: node.value, dir: child ? dir : 'missing', side: dir })
    node = child
  }
  return { path, found: false, steps }
}

/** Height in levels: an empty tree is 0, a single node is 1. */
export function height(node) {
  return node ? 1 + Math.max(height(node.left), height(node.right)) : 0
}

export function size(node) {
  return node ? 1 + size(node.left) + size(node.right) : 0
}

/** Balanced when every node's subtrees differ in height by at most one. */
export function isBalanced(node) {
  if (!node) return true
  return Math.abs(height(node.left) - height(node.right)) <= 1 && isBalanced(node.left) && isBalanced(node.right)
}

/** The smallest possible height for this many nodes. */
export const minHeight = (count) => (count ? Math.floor(Math.log2(count)) + 1 : 0)

export function inOrder(node, out = []) {
  if (node) {
    inOrder(node.left, out)
    out.push(node.value)
    inOrder(node.right, out)
  }
  return out
}

export function preOrder(node, out = []) {
  if (node) {
    out.push(node.value)
    preOrder(node.left, out)
    preOrder(node.right, out)
  }
  return out
}

export function postOrder(node, out = []) {
  if (node) {
    postOrder(node.left, out)
    postOrder(node.right, out)
    out.push(node.value)
  }
  return out
}

export const TRAVERSALS = {
  in: { label: 'In-order', rule: 'left subtree, node, right subtree', run: inOrder },
  pre: { label: 'Pre-order', rule: 'node, left subtree, right subtree', run: preOrder },
  post: { label: 'Post-order', rule: 'left subtree, right subtree, node', run: postOrder }
}

/**
 * Positions for drawing: x is the node's in-order rank (so every node has its own column and
 * left children always sit to the left), y is its depth.
 * Returns { nodes: [{ value, rank, depth, parent }], columns, levels }.
 */
export function layout(root) {
  const nodes = []
  let rank = 0
  function walk(node, depth, parent) {
    if (!node) return
    walk(node.left, depth + 1, node.value)
    nodes.push({ value: node.value, rank: rank++, depth, parent })
    walk(node.right, depth + 1, node.value)
  }
  walk(root, 0, null)
  return { nodes, columns: rank, levels: height(root) }
}

/** Numbers from free text such as "3, 5 7". */
export function parseSequence(text) {
  return String(text)
    .split(/[^0-9-]+/)
    .filter((t) => t && t !== '-')
    .map(Number)
    .filter(Number.isFinite)
}

/** Compare a guessed sequence with the real one. firstWrong is -1 when they match. */
export function compareSequences(guess, actual) {
  const n = Math.max(guess.length, actual.length)
  for (let k = 0; k < n; k++) if (guess[k] !== actual[k]) return { correct: false, firstWrong: k }
  return { correct: true, firstWrong: -1 }
}

/** An insertion order that builds a perfectly balanced tree from sorted values. */
export function balancedOrder(sorted) {
  const out = []
  function go(lo, hi) {
    if (lo > hi) return
    const mid = (lo + hi) >> 1
    out.push(sorted[mid])
    go(lo, mid - 1)
    go(mid + 1, hi)
  }
  go(0, sorted.length - 1)
  return out
}
