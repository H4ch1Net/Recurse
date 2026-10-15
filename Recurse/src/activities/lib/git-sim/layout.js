// Layout for the commit graph drawing. Oldest commit at the top, one row per commit in
// creation order, one column (lane) per line of work. Lanes are fixed when a commit is
// made, so existing commits never jump around as the graph grows.
import { reachable, headHash, branchesAt, short } from './repo.js'

export const ROW = 46
export const LANE = 28
export const PAD = 22
export const CHAR = 6.6 // width of one 11px monospace character
export const LABEL_CHAR = 6.1 // 10px monospace
const LABEL_PAD = 14

export function truncate(text, max) {
  const first = String(text).split('\n')[0]
  return first.length > max ? `${first.slice(0, max - 1)}…` : first
}

/**
 * Returns { nodes, edges, labels, width, height }.
 * nodes: { hash, short, message, lane, x, y, live, merge, head }
 * edges: { id, d, lane, live }
 * labels: { id, text, kind: 'head' | 'branch' | 'current', x, y, width }
 */
export function layoutGraph(repo, { maxMessage = 24 } = {}) {
  const live = reachable(repo)
  const head = headHash(repo)
  const maxLane = Math.max(0, ...repo.order.map((h) => repo.commits[h].lane))
  const textX = PAD + maxLane * LANE + 22
  const pos = {}
  const nodes = repo.order.map((hash, row) => {
    const c = repo.commits[hash]
    const x = PAD + c.lane * LANE
    const y = PAD + row * ROW
    pos[hash] = { x, y, lane: c.lane }
    return { hash, short: short(hash), message: truncate(c.message, maxMessage), fullMessage: c.message, lane: c.lane, x, y, live: live.has(hash), merge: c.parents.length > 1, head: hash === head }
  })

  const edges = []
  for (const hash of repo.order) {
    const c = repo.commits[hash]
    const to = pos[hash]
    c.parents.forEach((parent, k) => {
      const from = pos[parent]
      if (!from) return
      let d
      let lane
      if (from.x === to.x) {
        d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`
        lane = to.lane
      } else if (k === 0) {
        // Branching off: leave the parent right away, then run down the new lane.
        const bend = Math.min(from.y + ROW, to.y)
        d = `M ${from.x} ${from.y} C ${from.x} ${from.y + (bend - from.y) * 0.55} ${to.x} ${from.y + (bend - from.y) * 0.45} ${to.x} ${bend} L ${to.x} ${to.y}`
        lane = to.lane
      } else {
        // Merging in: run down the parent's lane, then curve into the merge commit.
        const bend = Math.max(to.y - ROW, from.y)
        d = `M ${from.x} ${from.y} L ${from.x} ${bend} C ${from.x} ${bend + (to.y - bend) * 0.55} ${to.x} ${bend + (to.y - bend) * 0.45} ${to.x} ${to.y}`
        lane = from.lane
      }
      edges.push({ id: `${parent}-${hash}`, d, lane, live: live.has(hash) && live.has(parent) })
    })
  }

  // Labels sit after the short hash, in the order git log prints them: HEAD -> main, others.
  const labels = []
  let width = textX + 160
  for (const node of nodes) {
    let x = textX + 7 * CHAR + 10
    const names = branchesAt(repo, node.hash)
    const items = []
    if (node.head && repo.head.detached) items.push({ id: 'HEAD', text: 'HEAD', kind: 'head' })
    for (const b of names) {
      if (repo.head.branch === b) items.push({ id: 'HEAD', text: 'HEAD', kind: 'head' })
      items.push({ id: `branch:${b}`, text: b, kind: repo.head.branch === b ? 'current' : 'branch' })
    }
    for (const item of items) {
      const w = item.text.length * LABEL_CHAR + LABEL_PAD
      labels.push({ ...item, x, y: node.y, width: w })
      x += w + (item.kind === 'head' ? 14 : 6)
    }
    node.textX = textX
    node.messageX = x + 2
    width = Math.max(width, node.messageX + node.message.length * CHAR + PAD)
  }
  // HEAD on an unborn branch (no commits yet) has nowhere to sit.
  const height = nodes.length ? PAD * 2 + (nodes.length - 1) * ROW : 0
  return { nodes, edges, labels, width: Math.ceil(width), height }
}
