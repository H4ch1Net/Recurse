// Grid mazes and step-by-step breadth-first and depth-first search for the graph-search widget.
// A grid is { cols, rows, walls: boolean[], start, goal } with cells numbered row by row.

/** Neighbor order used by both searches: up, right, down, left. */
export const DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1]
]

export const SIZES = {
  small: { cols: 14, rows: 9 },
  large: { cols: 22, rows: 13 }
}

export const cellIndex = (cols, r, c) => r * cols + c
export const cellRowCol = (cols, i) => [Math.floor(i / cols), i % cols]
export const cellName = (cols, i) => {
  const [r, c] = cellRowCol(cols, i)
  return `(${r}, ${c})`
}

export function emptyGrid(cols, rows) {
  const mid = Math.floor(rows / 2)
  return { cols, rows, walls: new Array(cols * rows).fill(false), start: cellIndex(cols, mid, 1), goal: cellIndex(cols, mid, cols - 2) }
}

/** Open, in-bounds neighbors of cell i, in DIRS order. */
export function neighbors(grid, i) {
  const [r, c] = cellRowCol(grid.cols, i)
  const out = []
  for (const [dr, dc] of DIRS) {
    const nr = r + dr
    const nc = c + dc
    if (nr < 0 || nc < 0 || nr >= grid.rows || nc >= grid.cols) continue
    const j = cellIndex(grid.cols, nr, nc)
    if (!grid.walls[j]) out.push(j)
  }
  return out
}

function tracePath(parent, start, goal) {
  const path = [goal]
  let at = goal
  while (at !== start) {
    at = parent[at]
    if (at < 0) return []
    path.push(at)
  }
  return path.reverse()
}

/**
 * Breadth-first search. Yields one step per cell taken from the queue.
 * Step: { kind: 'start' | 'expand' | 'found' | 'none', current, frontier (next out first), added, visitedCount, order, path }
 */
export function* bfs(grid) {
  const n = grid.cols * grid.rows
  const seen = new Array(n).fill(false)
  const parent = new Array(n).fill(-1)
  const order = []
  const queue = [grid.start]
  seen[grid.start] = true
  yield { kind: 'start', current: null, frontier: [grid.start], added: [grid.start], visitedCount: 0, order, path: [] }
  while (queue.length) {
    const current = queue.shift()
    order.push(current)
    if (current === grid.goal) {
      yield { kind: 'found', current, frontier: queue.slice(), added: [], visitedCount: order.length, order, path: tracePath(parent, grid.start, grid.goal) }
      return
    }
    const added = []
    for (const next of neighbors(grid, current)) {
      if (seen[next]) continue
      seen[next] = true
      parent[next] = current
      queue.push(next)
      added.push(next)
    }
    yield { kind: 'expand', current, frontier: queue.slice(), added, visitedCount: order.length, order, path: [] }
  }
  yield { kind: 'none', current: null, frontier: [], added: [], visitedCount: order.length, order, path: [] }
}

/** Unique cells still waiting on the stack, top first, skipping ones already visited. */
function stackFrontier(stack, done) {
  const out = []
  const listed = new Set()
  for (let k = stack.length - 1; k >= 0; k--) {
    const cell = stack[k].cell
    if (done[cell] || listed.has(cell)) continue
    listed.add(cell)
    out.push(cell)
  }
  return out
}

/**
 * Depth-first search with an explicit stack. A cell counts as visited when it is popped, so the
 * search dives along the newest neighbor first, exactly like the recursive version.
 */
export function* dfs(grid) {
  const n = grid.cols * grid.rows
  const done = new Array(n).fill(false)
  const parent = new Array(n).fill(-1)
  const order = []
  const stack = [{ cell: grid.start, from: -1 }]
  yield { kind: 'start', current: null, frontier: [grid.start], added: [grid.start], visitedCount: 0, order, path: [], skipped: 0 }
  let skipped = 0
  while (stack.length) {
    const { cell, from } = stack.pop()
    if (done[cell]) {
      skipped++
      continue
    }
    done[cell] = true
    parent[cell] = from
    order.push(cell)
    if (cell === grid.goal) {
      yield { kind: 'found', current: cell, frontier: stackFrontier(stack, done), added: [], visitedCount: order.length, order, path: tracePath(parent, grid.start, grid.goal), skipped }
      return
    }
    const fresh = neighbors(grid, cell).filter((next) => !done[next])
    // Push in reverse so the first direction ends up on top and is explored first.
    for (let k = fresh.length - 1; k >= 0; k--) stack.push({ cell: fresh[k], from: cell })
    yield { kind: 'expand', current: cell, frontier: stackFrontier(stack, done), added: fresh, visitedCount: order.length, order, path: [], skipped }
    skipped = 0
  }
  yield { kind: 'none', current: null, frontier: [], added: [], visitedCount: order.length, order, path: [], skipped }
}

/** Runs a search to the end. Returns { steps, order, path, found }. */
export function runSearch(grid, algorithm) {
  const steps = Array.from(algorithm === 'dfs' ? dfs(grid) : bfs(grid))
  const last = steps[steps.length - 1]
  return { algorithm, steps, order: last.order.slice(), path: last.path, found: last.kind === 'found' }
}

/** Length in moves of the shortest path, or -1 when the goal cannot be reached. */
export function shortestPathLength(grid) {
  const { path, found } = runSearch(grid, 'bfs')
  return found ? path.length - 1 : -1
}

/** A short sentence that explains one step. */
export function describeStep(step, algorithm, cols) {
  const isBfs = algorithm !== 'dfs'
  const box = isBfs ? 'queue' : 'stack'
  const name = (i) => cellName(cols, i)
  if (step.kind === 'start') return `Start at S. Put it ${isBfs ? 'in the queue' : 'on the stack'} and begin.`
  if (step.kind === 'none') return `The ${box} is empty and the goal was never reached. Walls block every route.`
  if (step.kind === 'found') {
    const moves = step.path.length - 1
    return `${isBfs ? 'BFS' : 'DFS'} reached the goal after visiting ${step.visitedCount} cells. Follow the parent links back to S: the path is ${moves} ${moves === 1 ? 'move' : 'moves'} long.`
  }
  const taken = isBfs ? `BFS takes the oldest cell from the front of the queue, ${name(step.current)}.` : `DFS takes the newest cell from the top of the stack, ${name(step.current)}.`
  const skip = !isBfs && step.skipped ? ` It first throws away ${step.skipped} stale ${step.skipped === 1 ? 'entry' : 'entries'} for cells it already visited.` : ''
  if (!step.added.length) return `${taken}${skip} It has no new neighbors, so nothing is added.`
  const count = step.added.length
  const what = `${count} new ${count === 1 ? 'neighbor' : 'neighbors'}`
  if (isBfs) return `${taken} It adds ${what} to the back of the queue, so they wait their turn.`
  return `${taken}${skip} It pushes ${what} on top, so it dives into ${name(step.added[0])} next.`
}

// ---- Presets ----------------------------------------------------------------------

const MAZE_14x9 = [
  '...#.....#....',
  '.#.#.###.#.##.',
  '.#...#...#..#.',
  '.####.#.###.#.',
  '.S..#.#...#G#.',
  '.##.#.###.#.#.',
  '..#...#...#...',
  '#.###.#.#####.',
  '......#.......'
]

function fromRows(lines) {
  const rows = lines.length
  const cols = lines[0].length
  const grid = emptyGrid(cols, rows)
  lines.forEach((line, r) => {
    for (let c = 0; c < cols; c++) {
      const ch = line[c]
      const i = cellIndex(cols, r, c)
      if (ch === '#') grid.walls[i] = true
      if (ch === 'S') grid.start = i
      if (ch === 'G') grid.goal = i
    }
  })
  return grid
}

function twoWalls(cols, rows) {
  const grid = emptyGrid(cols, rows)
  const c1 = Math.round(cols * 0.3)
  const c2 = Math.round(cols * 0.72)
  const gap1 = Math.floor(rows / 2) + 1
  for (let r = 0; r < rows; r++) {
    if (r !== gap1) grid.walls[cellIndex(cols, r, c1)] = true
    if (r !== 0 && r !== rows - 1 && r !== rows - 2) grid.walls[cellIndex(cols, r, c2)] = true
  }
  return grid
}

export const PRESETS = {
  open: 'Open field',
  walls: 'Two walls',
  maze: 'Maze',
  random: 'Random walls'
}

/** Presets available for a grid size (the hand-drawn maze only exists at the small size). */
export function presetsFor(cols, rows) {
  return Object.keys(PRESETS).filter((key) => key !== 'maze' || (cols === 14 && rows === 9))
}

/** Builds a preset grid. `rng` is only used by 'random'. */
export function presetGrid(name, cols, rows, rng = Math.random) {
  if (name === 'maze' && cols === 14 && rows === 9) return fromRows(MAZE_14x9)
  if (name === 'walls') return twoWalls(cols, rows)
  if (name === 'random') return randomWalls(cols, rows, rng)
  return emptyGrid(cols, rows)
}

/** Scatters walls at random, retrying until the goal is reachable. */
export function randomWalls(cols, rows, rng = Math.random, density = 0.3) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const grid = emptyGrid(cols, rows)
    for (let i = 0; i < cols * rows; i++) {
      if (i !== grid.start && i !== grid.goal && rng() < density) grid.walls[i] = true
    }
    if (shortestPathLength(grid) >= 0) return grid
  }
  return emptyGrid(cols, rows)
}

/** A string that changes whenever the maze changes, used to compare runs on the same maze. */
export const gridKey = (grid) => `${grid.cols}x${grid.rows}:${grid.start}:${grid.goal}:${grid.walls.map((w) => (w ? 1 : 0)).join('')}`
