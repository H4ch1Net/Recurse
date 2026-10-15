import { describe, expect, it } from 'vitest'
import { bfs, cellIndex, cellRowCol, describeStep, dfs, emptyGrid, gridKey, neighbors, presetGrid, presetsFor, randomWalls, runSearch, shortestPathLength } from './graph-search'

function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function expectValidPath(grid, path) {
  expect(path[0]).toBe(grid.start)
  expect(path[path.length - 1]).toBe(grid.goal)
  for (let k = 1; k < path.length; k++) {
    const [r1, c1] = cellRowCol(grid.cols, path[k - 1])
    const [r2, c2] = cellRowCol(grid.cols, path[k])
    expect(Math.abs(r1 - r2) + Math.abs(c1 - c2)).toBe(1)
    expect(grid.walls[path[k]]).toBe(false)
  }
  expect(new Set(path).size).toBe(path.length)
}

describe('neighbors', () => {
  it('lists open cells up, right, down, left and skips walls and edges', () => {
    const grid = emptyGrid(3, 3)
    expect(neighbors(grid, cellIndex(3, 1, 1))).toEqual([1, 5, 7, 3])
    expect(neighbors(grid, 0)).toEqual([1, 3])
    grid.walls[5] = true
    expect(neighbors(grid, 4)).toEqual([1, 7, 3])
  })
})

describe('bfs', () => {
  it('finds the Manhattan distance on an open grid', () => {
    const grid = emptyGrid(14, 9)
    const run = runSearch(grid, 'bfs')
    expect(run.found).toBe(true)
    expect(run.path.length - 1).toBe(11)
    expectValidPath(grid, run.path)
  })

  it('treats the frontier as a queue: oldest first', () => {
    const grid = emptyGrid(5, 3)
    grid.start = cellIndex(5, 1, 2)
    grid.goal = cellIndex(5, 0, 0)
    const steps = Array.from(bfs(grid))
    expect(steps[0].kind).toBe('start')
    expect(steps[1].current).toBe(grid.start)
    expect(steps[1].added).toEqual([2, 8, 12, 6])
    // The next cells out are the start's neighbors in the order they were added.
    expect(steps[2].current).toBe(2)
    expect(steps[3].current).toBe(8)
    expect(steps[4].current).toBe(12)
  })

  it('finds the shortest way around a wall', () => {
    const grid = emptyGrid(5, 5)
    grid.start = cellIndex(5, 2, 0)
    grid.goal = cellIndex(5, 2, 4)
    for (let r = 0; r < 4; r++) grid.walls[cellIndex(5, r, 2)] = true
    // Must drop to row 4 to cross column 2: 2 down, 4 across, 2 up.
    expect(shortestPathLength(grid)).toBe(8)
  })

  it('reports none when the goal is walled off', () => {
    const grid = emptyGrid(5, 3)
    for (let r = 0; r < 3; r++) grid.walls[cellIndex(5, r, 2)] = true
    const run = runSearch(grid, 'bfs')
    expect(run.found).toBe(false)
    expect(run.path).toEqual([])
    expect(run.steps[run.steps.length - 1].kind).toBe('none')
    expect(shortestPathLength(grid)).toBe(-1)
  })
})

describe('dfs', () => {
  it('dives along the first direction (up) before anything else', () => {
    const grid = emptyGrid(5, 5)
    grid.start = cellIndex(5, 4, 0)
    grid.goal = cellIndex(5, 4, 4)
    const steps = Array.from(dfs(grid))
    expect(steps[1].current).toBe(grid.start)
    expect(steps[2].current).toBe(cellIndex(5, 3, 0))
    expect(steps[3].current).toBe(cellIndex(5, 2, 0))
    // The stack frontier lists the top first.
    expect(steps[1].frontier[0]).toBe(cellIndex(5, 3, 0))
  })

  it('finds a valid path that is never shorter than the BFS path', () => {
    for (const name of ['open', 'walls', 'maze']) {
      const grid = presetGrid(name, 14, 9)
      const b = runSearch(grid, 'bfs')
      const d = runSearch(grid, 'dfs')
      expect(d.found).toBe(true)
      expectValidPath(grid, d.path)
      expect(d.path.length).toBeGreaterThanOrEqual(b.path.length)
    }
  })

  it('takes a longer route than BFS on the open field', () => {
    const grid = presetGrid('open', 14, 9)
    expect(runSearch(grid, 'dfs').path.length).toBeGreaterThan(runSearch(grid, 'bfs').path.length)
  })

  it('visits each cell at most once', () => {
    const grid = presetGrid('open', 14, 9)
    const { order } = runSearch(grid, 'dfs')
    expect(new Set(order).size).toBe(order.length)
  })
})

describe('presets', () => {
  it('every preset at every size has a reachable goal', () => {
    for (const [cols, rows] of [[14, 9], [22, 13]]) {
      for (const name of presetsFor(cols, rows)) {
        const grid = presetGrid(name, cols, rows, seeded(7))
        expect(grid.walls).toHaveLength(cols * rows)
        expect(grid.walls[grid.start]).toBe(false)
        expect(grid.walls[grid.goal]).toBe(false)
        expect(shortestPathLength(grid)).toBeGreaterThan(0)
      }
    }
  })

  it('only offers the hand-drawn maze at the small size', () => {
    expect(presetsFor(14, 9)).toContain('maze')
    expect(presetsFor(22, 13)).not.toContain('maze')
  })

  it('random walls are reachable and change the grid key', () => {
    const a = randomWalls(14, 9, seeded(1))
    const b = randomWalls(14, 9, seeded(2))
    expect(shortestPathLength(a)).toBeGreaterThan(0)
    expect(gridKey(a)).not.toBe(gridKey(b))
  })
})

describe('describeStep', () => {
  it('explains queue and stack steps in plain words', () => {
    const grid = emptyGrid(14, 9)
    const b = runSearch(grid, 'bfs')
    const d = runSearch(grid, 'dfs')
    expect(describeStep(b.steps[1], 'bfs', 14)).toMatch(/oldest cell from the front of the queue/)
    expect(describeStep(d.steps[1], 'dfs', 14)).toMatch(/newest cell from the top of the stack/)
    expect(describeStep(b.steps[b.steps.length - 1], 'bfs', 14)).toMatch(/path is 11 moves/)
  })
})
