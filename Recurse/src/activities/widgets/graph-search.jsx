import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Eraser, FastForward, Pause, Play, RotateCcw, SkipForward, Trophy } from 'lucide-react'
import { feedbackCorrect } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { PRESETS, SIZES, cellIndex, cellName, cellRowCol, describeStep, gridKey, presetGrid, presetsFor, runSearch } from '../lib/graph-search'
import './graph-search.css'

const DELAYS = [600, 320, 160, 70, 25]
const SPEED_NAMES = ['Slow', 'Easy', 'Medium', 'Fast', 'Blazing']
const INFO = {
  bfs: { label: 'BFS', name: 'Breadth-first search', box: 'Queue', rule: 'First in, first out. New cells join at the bottom.' },
  dfs: { label: 'DFS', name: 'Depth-first search', box: 'Stack', rule: 'Last in, first out. New cells go on top.' }
}
const TOOLS = [
  ['wall', 'Walls'],
  ['start', 'Move S'],
  ['goal', 'Move G']
]
const SHOWN_FRONTIER = 9

function cellState(i, grid, step, pathIndex) {
  if (grid.walls[i]) return 'is-wall'
  if (!step) return ''
  if (pathIndex.has(i)) return 'is-path'
  if (i === step.current) return 'is-current'
  if (step.frontier[0] === i) return 'is-frontier is-next'
  if (step.frontier.includes(i)) return 'is-frontier'
  if (step.visitedOrder.has(i)) return 'is-visited'
  return ''
}

/** Paint a maze, then watch BFS and DFS explore it with their frontier shown as a queue or stack. */
export default function GraphSearch({ props, onComplete, standalone }) {
  const algorithms = useMemo(() => (props.algorithm === 'bfs' || props.algorithm === 'dfs' ? [props.algorithm] : ['bfs', 'dfs']), [props.algorithm])
  const [sizeKey, setSizeKey] = useState('small')
  const [preset, setPreset] = useState('walls')
  const [grid, setGrid] = useState(() => presetGrid('walls', SIZES.small.cols, SIZES.small.rows))
  const [algo, setAlgo] = useState(algorithms[0])
  const [run, setRun] = useState(null)
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [results, setResults] = useState({ key: '', runs: {} })
  const [tool, setTool] = useState('wall')
  const [cursor, setCursor] = useState(() => presetGrid('walls', SIZES.small.cols, SIZES.small.rows).start)
  const [cursorNote, setCursorNote] = useState('')
  const [message, setMessage] = useState({ text: '', tone: '' })
  const gridRef = useRef(null)
  const dragRef = useRef(null)
  const finishedRef = useRef(null)

  const key = useMemo(() => gridKey(grid), [grid])
  const activeRun = run && run.key === key ? run : null
  const last = activeRun ? activeRun.steps.length - 1 : 0
  const at = Math.min(pos, last)
  const isPlaying = playing && Boolean(activeRun)
  const done = results.key === key ? results.runs : {}

  const step = useMemo(() => {
    if (!activeRun) return null
    const raw = activeRun.steps[at]
    return { ...raw, visitedOrder: new Set(activeRun.order.slice(0, raw.visitedCount)) }
  }, [activeRun, at])
  const pathIndex = useMemo(() => new Map((step?.kind === 'found' ? step.path : []).map((cell, k) => [cell, k])), [step])

  const finish = (r) => {
    if (finishedRef.current === r) return
    finishedRef.current = r
    const runs = { ...(results.key === r.key ? results.runs : {}), [r.algorithm]: { visited: r.order.length, moves: r.found ? r.path.length - 1 : -1 } }
    setResults({ key: r.key, runs })
    if (!r.found) {
      sfx.error()
      setMessage({ text: 'No route to the goal. Erase a wall or two and run it again.', tone: 'bad' })
      return
    }
    const ran = algorithms.filter((a) => runs[a])
    feedbackCorrect(gridRef.current?.children[grid.goal], { combo: ran.length - 1 })
    if (ran.length < algorithms.length) {
      const other = algorithms.find((a) => !runs[a])
      setMessage({ text: `${INFO[r.algorithm].label} found a path of ${runs[r.algorithm].moves} moves. Now run ${INFO[other].label} on the same maze and compare.`, tone: 'good' })
      return
    }
    if (algorithms.length === 1) {
      setMessage({ text: `${INFO[r.algorithm].label} found a path of ${runs[r.algorithm].moves} moves after visiting ${runs[r.algorithm].visited} cells.`, tone: 'good' })
      onComplete({ score: 1 })
      return
    }
    const b = runs.bfs
    const d = runs.dfs
    const text =
      b.moves < d.moves
        ? `BFS: ${b.moves} moves. DFS: ${d.moves} moves. BFS spreads out in rings of growing distance, so the first time it touches the goal is along a shortest path. DFS commits to one direction and only backs up at dead ends, so its path can wander.`
        : `Both found ${b.moves} moves here, but BFS visited ${b.visited} cells and DFS ${d.visited}. This maze leaves little choice of route. Try the open field to see DFS wander.`
    setMessage({ text, tone: 'good' })
    onComplete({ score: 1, detail: `BFS ${b.moves} moves, DFS ${d.moves} moves` })
  }

  const goTo = (p) => {
    if (!activeRun) return
    const target = Math.max(0, Math.min(last, p))
    setPos(target)
    if (target === last) {
      setPlaying(false)
      finish(activeRun)
    }
  }

  const tick = useEffectEvent(() => goTo(at + 1))
  useEffect(() => {
    if (!isPlaying) return undefined
    const id = setTimeout(tick, DELAYS[speed])
    return () => clearTimeout(id)
  }, [isPlaying, at, speed])

  const newRun = (which = algo) => {
    const r = { ...runSearch(grid, which), key }
    setRun(r)
    setPos(0)
    setMessage({ text: '', tone: '' })
    return r
  }

  const togglePlay = () => {
    sfx.tap()
    if (isPlaying) return setPlaying(false)
    if (!activeRun || at >= last) newRun()
    setPlaying(true)
  }

  const stepForward = () => {
    sfx.tick()
    setPlaying(false)
    if (!activeRun) {
      newRun()
      return
    }
    goTo(at + 1)
  }

  const skipToEnd = () => {
    sfx.tap()
    setPlaying(false)
    const r = activeRun || newRun()
    setPos(r.steps.length - 1)
    finish(r)
  }

  const chooseAlgo = (name) => {
    if (name === algo) return
    sfx.tap()
    setAlgo(name)
    setRun(null)
    setPlaying(false)
    setPos(0)
  }

  const loadGrid = (next, presetName) => {
    sfx.flip()
    setGrid(next)
    setPreset(presetName)
    setCursor(next.start)
    setPlaying(false)
    setMessage({ text: '', tone: '' })
  }

  const choosePreset = (name) => loadGrid(presetGrid(name, grid.cols, grid.rows), name)

  const chooseSize = (name) => {
    const { cols, rows } = SIZES[name]
    setSizeKey(name)
    const nextPreset = presetsFor(cols, rows).includes(preset) ? preset : 'open'
    loadGrid(presetGrid(nextPreset, cols, rows), nextPreset)
  }

  const clearWalls = () => {
    sfx.tap()
    setGrid((g) => ({ ...g, walls: g.walls.map(() => false) }))
  }

  // ---- Editing: pointer (mouse, pen, touch) and keyboard --------------------------

  const edit = (cell, mode) => {
    setGrid((g) => {
      if (mode === 'start' || mode === 'goal') {
        const other = mode === 'start' ? g.goal : g.start
        if (cell === other || g[mode] === cell) return g
        const walls = g.walls[cell] ? g.walls.map((w, i) => (i === cell ? false : w)) : g.walls
        return { ...g, walls, [mode]: cell }
      }
      if (cell === g.start || cell === g.goal) return g
      const want = mode === 'paint'
      if (g.walls[cell] === want) return g
      const walls = g.walls.slice()
      walls[cell] = want
      return { ...g, walls }
    })
  }

  const cellAt = (e) => {
    const rect = gridRef.current.getBoundingClientRect()
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * grid.cols)
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * grid.rows)
    if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) return -1
    return cellIndex(grid.cols, r, c)
  }

  const onPointerDown = (e) => {
    if (e.button > 0) return
    const cell = cellAt(e)
    if (cell < 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    let mode
    if (cell === grid.start) mode = 'start'
    else if (cell === grid.goal) mode = 'goal'
    else if (tool !== 'wall') mode = tool
    else mode = grid.walls[cell] ? 'erase' : 'paint'
    dragRef.current = { mode, last: cell }
    setCursor(cell)
    edit(cell, mode)
    if (mode === 'start' || mode === 'goal') sfx.pop()
    else sfx.tap()
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const cell = cellAt(e)
    if (cell < 0 || cell === drag.last) return
    drag.last = cell
    edit(cell, drag.mode)
    if (drag.mode === 'paint' || drag.mode === 'erase') sfx.tap()
  }

  const endDrag = () => {
    if (dragRef.current && (dragRef.current.mode === 'start' || dragRef.current.mode === 'goal')) sfx.pop()
    dragRef.current = null
  }

  const describeCell = (i, g = grid) => {
    const what = i === g.start ? 'start' : i === g.goal ? 'goal' : g.walls[i] ? 'wall' : 'open'
    return `${cellName(g.cols, i)}: ${what}`
  }

  const onKeyDown = (e) => {
    const [r, c] = cellRowCol(grid.cols, cursor)
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[e.key]) {
      e.preventDefault()
      const nr = Math.max(0, Math.min(grid.rows - 1, r + moves[e.key][0]))
      const nc = Math.max(0, Math.min(grid.cols - 1, c + moves[e.key][1]))
      const next = cellIndex(grid.cols, nr, nc)
      setCursor(next)
      setCursorNote(describeCell(next))
      return
    }
    const k = e.key.toLowerCase()
    if (k === ' ' || k === 'enter' || k === 's' || k === 'g') {
      e.preventDefault()
      if (k === 's' || k === 'g') {
        edit(cursor, k === 's' ? 'start' : 'goal')
        sfx.pop()
        setCursorNote(`${k === 's' ? 'Start' : 'Goal'} moved to ${cellName(grid.cols, cursor)}`)
      } else if (cursor !== grid.start && cursor !== grid.goal) {
        edit(cursor, grid.walls[cursor] ? 'erase' : 'paint')
        sfx.tap()
        setCursorNote(`${cellName(grid.cols, cursor)}: ${grid.walls[cursor] ? 'open' : 'wall'}`)
      }
    }
  }

  // ---- Render ----------------------------------------------------------------------

  const caption = step
    ? describeStep(step, algo, grid.cols)
    : `Click or drag to draw walls, and drag S or G to move them. Then press Play to watch ${INFO[algo].label} search.`
  const frontier = step ? step.frontier : []
  const ran = algorithms.filter((a) => done[a])
  const bestMoves = ran.length ? Math.min(...ran.map((a) => done[a].moves).filter((m) => m >= 0)) : 0
  const progress = last ? (at / last) * 100 : 0
  const cellCount = grid.cols * grid.rows

  return (
    <div className="gsearch">
      <div className="w-toolbar">
        {algorithms.length > 1 && (
          <div className="w-pill-group" role="group" aria-label="Algorithm">
            {algorithms.map((name) => (
              <button key={name} type="button" aria-pressed={name === algo} onClick={() => chooseAlgo(name)} title={INFO[name].name}>
                {INFO[name].label}
                {done[name] && <span className="gsearch-check" aria-label="ran on this maze"> ✓</span>}
              </button>
            ))}
          </div>
        )}
        <span className="chip outline">{INFO[algo].name}</span>
        <span className="grow" />
        <label className="gsearch-select">
          <span className="sr-only">Load a maze</span>
          <select className="select" value={preset} onChange={(e) => choosePreset(e.target.value)}>
            {presetsFor(grid.cols, grid.rows).map((name) => (
              <option key={name} value={name}>{PRESETS[name]}</option>
            ))}
          </select>
        </label>
        {standalone && (
          <label className="gsearch-select">
            <span className="sr-only">Grid size</span>
            <select className="select" value={sizeKey} onChange={(e) => chooseSize(e.target.value)}>
              <option value="small">14 by 9</option>
              <option value="large">22 by 13</option>
            </select>
          </label>
        )}
      </div>

      <div className="w-toolbar gsearch-tools">
        <span className="xsmall subtle">Draw</span>
        <div className="w-pill-group" role="group" aria-label="Drawing tool">
          {TOOLS.map(([name, label]) => (
            <button key={name} type="button" aria-pressed={tool === name} onClick={() => { sfx.tap(); setTool(name) }}>{label}</button>
          ))}
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={clearWalls}><Eraser size={14} /> Clear walls</button>
      </div>

      <div className="w-stage gsearch-stage">
        <div className="gsearch-main">
          <div
            ref={gridRef}
            className={`gsearch-grid${standalone ? ' big' : ''}`}
            style={{ '--cols': grid.cols, '--rows': grid.rows }}
            role="group"
            tabIndex={0}
            aria-label={`Maze, ${grid.cols} columns by ${grid.rows} rows. Arrow keys move the cursor, Space toggles a wall, S places the start and G places the goal.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
          >
            {Array.from({ length: cellCount }, (_, i) => {
              const k = pathIndex.get(i)
              return (
                <div
                  key={i}
                  className={`gsearch-cell ${cellState(i, grid, step, pathIndex)}${i === cursor ? ' is-cursor' : ''}`}
                  style={k !== undefined ? { '--k': k } : undefined}
                >
                  {i === grid.start && <span className="gsearch-mark start">S</span>}
                  {i === grid.goal && <span className="gsearch-mark goal">G</span>}
                </div>
              )
            })}
          </div>

          <aside className="gsearch-side" aria-label={`${INFO[algo].box} contents`}>
            <div className="gsearch-side-head">
              <strong>{INFO[algo].box}</strong>
              <span className="chip outline tabular">{frontier.length}</span>
            </div>
            <p className="gsearch-side-rule">{INFO[algo].rule}</p>
            <ol className={`gsearch-frontier ${algo}`}>
              {frontier.slice(0, SHOWN_FRONTIER).map((cell, k) => (
                <li key={cell} className={`${k === 0 ? 'next' : ''}${step?.added.includes(cell) ? ' fresh' : ''}`}>
                  <span className="mono">{cellName(grid.cols, cell)}</span>
                  {k === 0 && <span className="gsearch-out">next out</span>}
                </li>
              ))}
              {!frontier.length && <li className="gsearch-empty">empty</li>}
            </ol>
            {frontier.length > SHOWN_FRONTIER && <p className="gsearch-more">and {frontier.length - SHOWN_FRONTIER} more</p>}
          </aside>
        </div>
        <div className="gsearch-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      </div>

      <p className="gsearch-caption" aria-live={isPlaying ? 'off' : 'polite'}>{caption}</p>
      <p className="sr-only" aria-live="polite">{cursorNote}</p>

      <div className="w-toolbar gsearch-controls">
        <button type="button" className="btn btn-sm" onClick={() => { sfx.tick(); setPlaying(false); goTo(at - 1) }} disabled={!activeRun || at === 0} aria-label="Step back">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={togglePlay}>
          {isPlaying ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {activeRun && at >= last ? 'Replay' : activeRun && at ? 'Resume' : `Run ${INFO[algo].label}`}</>}
        </button>
        <button type="button" className="btn btn-sm" onClick={stepForward} disabled={Boolean(activeRun) && at >= last}>
          <SkipForward size={15} /> Step
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={skipToEnd} disabled={Boolean(activeRun) && at >= last} aria-label="Skip to the end">
          <FastForward size={15} />
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setRun(null); setPos(0) }} disabled={!activeRun} aria-label="Clear the search">
          <RotateCcw size={15} />
        </button>
        <label className="w-slider">
          <span>Speed</span>
          <input type="range" min="0" max="4" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={SPEED_NAMES[speed]} />
        </label>
      </div>

      <div className="w-readout">
        <div className="w-stat"><span>Step</span><strong>{at} / {last}</strong></div>
        <div className="w-stat"><span>Cells visited</span><strong>{step ? step.visitedCount : 0}</strong></div>
        <div className="w-stat"><span>Waiting</span><strong>{frontier.length}</strong></div>
        <div className="w-stat"><span>Path length</span><strong>{step?.kind === 'found' ? `${step.path.length - 1} moves` : '?'}</strong></div>
      </div>

      <div className="w-legend">
        <span><i className="gsearch-key start" />Start (S)</span>
        <span><i className="gsearch-key goal" />Goal (G)</span>
        <span><i className="gsearch-key wall" />Wall</span>
        <span><i className="gsearch-key frontier" />Waiting in the {INFO[algo].box.toLowerCase()}</span>
        <span><i className="gsearch-key current" />Being explored</span>
        <span><i className="gsearch-key visited" />Visited</span>
        <span><i className="gsearch-key path" />Final path</span>
      </div>

      {ran.length > 0 && (
        <table className="gsearch-compare">
          <caption className="xsmall subtle">Runs on this maze</caption>
          <thead>
            <tr><th scope="col">Search</th><th scope="col">Cells visited</th><th scope="col">Path length</th></tr>
          </thead>
          <tbody>
            {algorithms.map((name) => (
              <tr key={name} className={done[name] && ran.length > 1 && done[name].moves === bestMoves ? 'best' : ''}>
                <th scope="row">{INFO[name].label}</th>
                <td className="tabular">{done[name] ? done[name].visited : 'not run yet'}</td>
                <td className="tabular">
                  {done[name] ? (done[name].moves >= 0 ? `${done[name].moves} moves` : 'no path') : 'not run yet'}
                  {done[name] && ran.length > 1 && done[name].moves === bestMoves && <span className="chip good gsearch-best"><Trophy size={11} /> shortest</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
    </div>
  )
}
