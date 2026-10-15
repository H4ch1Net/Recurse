import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import { Check, Dice5, ListOrdered, Pause, Play, Plus, Scale, Search, SkipForward, TrendingUp } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { TRAVERSALS, balancedOrder, compareSequences, contains, fromValues, height, inOrder, insert, isBalanced, layout, minHeight, parseSequence, search, size } from '../lib/bst'
import './bst.css'

const COLW = 40
const LEVELH = 54
const R = 16
const PAD = 12
const SPEEDS = [1000, 620, 340]
const SORTED_DEMO = [10, 20, 30, 40, 50, 60, 70]
const DEFAULT_VALUES = [50, 30, 70, 20, 40, 60, 85, 35]

function startValues(props) {
  const given = Array.isArray(props.values) ? props.values.map(Number).filter((v) => Number.isInteger(v) && v >= 0 && v < 1000) : []
  return given.length ? given : DEFAULT_VALUES
}

/** Insert, search and traverse a binary search tree, and watch it degenerate on sorted input. */
export default function Bst({ props, onComplete, standalone }) {
  const maxNodes = standalone ? 18 : 12
  const [root, setRoot] = useState(() => fromValues(startValues(props).slice(0, maxNodes)))
  const [input, setInput] = useState('')
  const [anim, setAnim] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [lastInsert, setLastInsert] = useState(null)
  const [predict, setPredict] = useState(null)
  const [note, setNote] = useState(null)
  const [failedOn, setFailedOn] = useState(null)
  const [done, setDone] = useState({})
  const [combo, setCombo] = useState(0)
  const [message, setMessage] = useState({ text: 'Insert values, search for one, or run a traversal. Click a node to search for it.', tone: '' })
  const stageRef = useRef(null)
  const predictRef = useRef(null)
  const guessId = `bst-guess-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const shape = useMemo(() => layout(root), [root])
  const pos = useMemo(() => Object.fromEntries(shape.nodes.map((n) => [n.value, { x: PAD + n.rank * COLW + COLW / 2, y: PAD + R + n.depth * LEVELH }])), [shape])
  const count = size(root)
  const levels = height(root)
  const balanced = isBalanced(root)
  const ghost = anim?.kind === 'search' && anim.pos >= anim.seq.length && !anim.found ? anim.ghost : null
  const width = Math.max(3, shape.columns) * COLW + PAD * 2
  const svgHeight = Math.max(1, levels + (ghost ? 1 : 0)) * LEVELH + PAD * 2 - (LEVELH - 2 * R) + 4

  const markDone = (key) => {
    if (done[key]) return done
    const next = { ...done, [key]: true }
    setDone(next)
    if (next.search && next.predict) onComplete({ score: 1 })
    return next
  }

  // ---- Animations: search path, traversals, and the build demos ----
  const startAnim = (next) => {
    setAnim(next)
    setPlaying(true)
  }

  const finishSearch = (a) => {
    const n = a.steps.length
    if (a.found) {
      setMessage({ text: `Found ${a.target} in ${n} ${n === 1 ? 'step' : 'steps'}. Each comparison skipped a whole subtree, so a search never takes more steps than the tree is tall (${levels}).`, tone: 'good' })
      feedbackSuccess(stageRef.current, 'Found!')
    } else {
      sfx.tap()
      setMessage({ text: `${a.target} is not in the tree. The search fell off the bottom after ${n} ${n === 1 ? 'comparison' : 'comparisons'}, right where ${a.target} would be inserted.`, tone: '' })
    }
    markDone('search')
  }

  const finishTraversal = (a) => {
    const t = TRAVERSALS[a.kind]
    const extra = a.kind === 'in'
      ? ' In-order visits a BST in sorted order. That is the BST property at work.'
      : a.kind === 'pre'
        ? ' Pre-order lists a parent before its children, which is how you would copy the tree.'
        : ' Post-order lists children before their parent, which is how you would delete the tree safely.'
    setMessage({ text: `${t.label}: ${a.seq.join(', ')}.${extra}`, tone: 'good' })
    sfx.success()
  }

  const step = () => {
    if (!anim) return setPlaying(false)
    if (anim.kind === 'build') {
      if (anim.pos >= anim.values.length) return setPlaying(false)
      const v = anim.values[anim.pos]
      const r = insert(root, v)
      setRoot(r.root)
      setLastInsert({ value: v, path: r.path, n: anim.pos })
      sfx.pop()
      const nextPos = anim.pos + 1
      setAnim({ ...anim, pos: nextPos })
      const h = height(r.root)
      if (nextPos >= anim.values.length) {
        setPlaying(false)
        setMessage(anim.sorted
          ? { text: `Height ${h} for ${size(r.root)} nodes: every value was bigger than the last, so each one went right. This tree is a linked list in disguise, and searching it is O(n). Try "Balanced order" to compare.`, tone: 'warn' }
          : { text: `Height ${h} for ${size(r.root)} nodes, the best possible. Inserting the middle value first keeps both sides even, so searches stay O(log n).`, tone: 'good' })
      } else {
        setMessage({ text: anim.sorted ? `Insert ${v}: bigger than everything so far, so it goes right ${r.path.length} ${r.path.length === 1 ? 'time' : 'times'}. Height is now ${h}.` : `Insert ${v}. Height is ${h}.`, tone: '' })
      }
      return undefined
    }
    if (anim.pos >= anim.seq.length) return setPlaying(false)
    const nextPos = anim.pos + 1
    const next = { ...anim, pos: nextPos }
    setAnim(next)
    sfx.tick()
    if (anim.kind === 'search') {
      const s = anim.steps[nextPos - 1]
      if (s.dir === 'found') setMessage({ text: `${anim.target} equals ${s.value}. Found it!`, tone: 'good' })
      else if (s.dir === 'missing') setMessage({ text: `${anim.target} is ${s.side === 'left' ? 'smaller' : 'bigger'} than ${s.value}, but ${s.value} has no ${s.side} child.`, tone: '' })
      else setMessage({ text: `Compare ${anim.target} with ${s.value}: ${s.dir === 'left' ? 'smaller, so go left' : 'bigger, so go right'}. Everything on the other side is skipped.`, tone: '' })
      if (nextPos >= anim.seq.length) {
        setPlaying(false)
        finishSearch(anim)
      }
    } else {
      const v = anim.seq[nextPos - 1]
      setMessage({ text: `Visit ${v} (${nextPos} of ${anim.seq.length}). ${TRAVERSALS[anim.kind].label} means ${TRAVERSALS[anim.kind].rule}.`, tone: '' })
      if (nextPos >= anim.seq.length) {
        setPlaying(false)
        finishTraversal(anim)
      }
    }
    return undefined
  }

  const tick = useEffectEvent(step)
  useEffect(() => {
    if (!playing) return undefined
    const id = setTimeout(tick, SPEEDS[speed])
    return () => clearTimeout(id)
  }, [playing, anim, speed])

  // ---- Actions ----
  const readValue = () => {
    const v = parseInt(input, 10)
    return Number.isInteger(v) && v >= 0 && v < 1000 ? v : null
  }

  const doInsert = (v) => {
    if (v === null) return setMessage({ text: 'Type a whole number from 0 to 999.', tone: 'bad' })
    if (count >= maxNodes && !contains(root, v)) {
      feedbackWrong(stageRef.current)
      return setMessage({ text: `This tree holds up to ${maxNodes} nodes here. Use the demos to start fresh.`, tone: 'bad' })
    }
    const r = insert(root, v)
    setInput('')
    setAnim(null)
    setPlaying(false)
    if (r.duplicate) {
      sfx.error()
      return setMessage({ text: `${v} is already in the tree. A BST keeps each value once.`, tone: 'bad' })
    }
    sfx.pop()
    setRoot(r.root)
    setLastInsert({ value: v, path: r.path })
    const parent = r.path[r.path.length - 1]
    const route = r.path.map((p) => `${v} ${v < p ? '<' : '>'} ${p}, go ${v < p ? 'left' : 'right'}`).join('; ')
    setMessage({ text: parent === undefined ? `${v} is the root.` : `${route}. ${v} becomes ${parent}'s ${v < parent ? 'left' : 'right'} child.`, tone: '' })
  }

  const randomInsert = () => {
    let v
    for (let tries = 0; tries < 50; tries++) {
      v = 1 + Math.floor(Math.random() * 99)
      if (!contains(root, v)) break
    }
    doInsert(v)
  }

  const doSearch = (v) => {
    if (v === null) return setMessage({ text: 'Type the number to search for.', tone: 'bad' })
    if (!root) return setMessage({ text: 'The tree is empty. Insert something first.', tone: 'bad' })
    sfx.tap()
    const r = search(root, v)
    const last = r.path[r.path.length - 1]
    const lastPos = pos[last]
    const side = v < last ? -1 : 1
    startAnim({ kind: 'search', target: v, seq: r.path, steps: r.steps, found: r.found, pos: 0, ghost: lastPos ? { x: lastPos.x + side * COLW * 0.6, y: lastPos.y + LEVELH } : null })
    setLastInsert(null)
    setMessage({ text: `Searching for ${v}, starting at the root.`, tone: '' })
  }

  const runTraversal = (kind) => {
    if (!root) return setMessage({ text: 'The tree is empty. Insert something first.', tone: 'bad' })
    if (kind === 'in' && predict?.open) {
      document.getElementById(guessId)?.focus()
      setMessage({ text: 'Type your prediction first, or choose Skip.', tone: '' })
      return undefined
    }
    if (kind === 'in' && !done.predict && failedOn !== inOrder(root).join(',')) {
      setPredict({ open: true, text: '' })
      setNote(null)
      setAnim(null)
      setPlaying(false)
      setMessage({ text: 'Before it runs, predict the in-order sequence.', tone: '' })
      return undefined
    }
    sfx.tap()
    startAnim({ kind, seq: TRAVERSALS[kind].run(root), pos: 0 })
    setLastInsert(null)
    setMessage({ text: `${TRAVERSALS[kind].label}: ${TRAVERSALS[kind].rule}.`, tone: '' })
    return undefined
  }

  const checkPrediction = () => {
    const guess = parseSequence(predict.text)
    const actual = inOrder(root)
    const result = compareSequences(guess, actual)
    if (result.correct) {
      const next = combo + 1
      setCombo(next)
      feedbackCorrect(predictRef.current, { combo: next + 1 })
      setPredict(null)
      setNote(null)
      markDone('predict')
      startAnim({ kind: 'in', seq: actual, pos: 0 })
      setMessage({ text: 'Exactly right! Watch it confirm your prediction.', tone: 'good' })
    } else {
      setCombo(0)
      feedbackWrong(predictRef.current)
      const k = result.firstWrong
      const detail = k >= guess.length ? `You listed ${guess.length} values, but the tree has ${actual.length}.` : `Position ${k + 1} should be ${actual[k] ?? 'nothing'}, not ${guess[k]}.`
      setNote(`Not quite. ${detail} Hint: in a BST, in-order always comes out in sorted order. Watch it run, then insert a new value and press In-order to predict again.`)
      setPredict(null)
      setFailedOn(actual.join(','))
      startAnim({ kind: 'in', seq: actual, pos: 0 })
    }
  }

  const runDemo = (sorted) => {
    sfx.flip()
    setRoot(null)
    setLastInsert(null)
    setPredict(null)
    const values = sorted ? SORTED_DEMO : balancedOrder(SORTED_DEMO)
    startAnim({ kind: 'build', values, pos: 0, sorted })
    setMessage({ text: sorted ? `Inserting ${SORTED_DEMO.join(', ')} in sorted order. Watch the shape.` : `Inserting the same values middle first: ${values.join(', ')}.`, tone: '' })
  }

  // ---- Drawing state ----
  const visited = anim && anim.kind !== 'build' ? anim.seq.slice(0, anim.pos) : []
  const current = visited[visited.length - 1]
  const isTraversal = anim && ['in', 'pre', 'post'].includes(anim.kind)
  const searchFound = anim?.kind === 'search' && anim.found && anim.pos >= anim.seq.length
  const animating = anim && anim.kind !== 'build' ? anim.pos < anim.seq.length : anim ? anim.pos < anim.values.length : false
  const tasks = [
    { key: 'search', text: 'Search for a value.', hint: 'Type a number and press Search, or click a node.' },
    { key: 'predict', text: 'Predict the in-order traversal.', hint: 'Press In-order and type the sequence before it runs.' }
  ]

  return (
    <div className="bst">
      <ul className="w-tasks bst-tasks">
        {tasks.map((t) => (
          <li key={t.key} className={`w-task${done[t.key] ? ' done' : ''}`}>
            <span className="w-task-mark">{done[t.key] && <Check size={13} />}</span>
            <span>{t.text}<span className="w-task-hint">{t.hint}</span></span>
          </li>
        ))}
      </ul>

      <div className="w-toolbar bst-tools">
        <input
          className="input bst-input"
          value={input}
          inputMode="numeric"
          maxLength={3}
          placeholder="45"
          aria-label="Value"
          onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') doInsert(readValue()) }}
        />
        <button type="button" className="btn btn-sm btn-primary" onClick={() => doInsert(readValue())}><Plus size={14} /> Insert</button>
        <button type="button" className="btn btn-sm" onClick={() => doSearch(readValue())}><Search size={14} /> Search</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={randomInsert}><Dice5 size={14} /> Random</button>
      </div>
      <div className="w-toolbar bst-tools">
        <span className="xsmall subtle"><ListOrdered size={13} /> Traverse</span>
        {Object.entries(TRAVERSALS).map(([kind, t]) => (
          <button key={kind} type="button" className={`btn btn-sm${anim?.kind === kind ? ' bst-on' : ''}`} onClick={() => runTraversal(kind)}>{t.label}</button>
        ))}
        <span className="grow" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => runDemo(true)}><TrendingUp size={14} /> Sorted inserts</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => runDemo(false)}><Scale size={14} /> Balanced order</button>
      </div>

      {predict?.open && (
        <div className="bst-predict" ref={predictRef}>
          <label className="small" htmlFor={guessId}><strong>Predict:</strong> type the in-order sequence (left subtree, node, right subtree).</label>
          <div className="row wrap">
            <input
              id={guessId}
              className="input bst-guess"
              value={predict.text}
              placeholder="e.g. 20, 30, 35"
              onChange={(e) => setPredict({ ...predict, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') checkPrediction() }}
            />
            <button type="button" className="btn btn-sm btn-primary" onClick={checkPrediction} disabled={!parseSequence(predict.text).length}><Check size={14} /> Check</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPredict(null); sfx.tap(); startAnim({ kind: 'in', seq: inOrder(root), pos: 0 }) }}>Skip, just run it</button>
          </div>
        </div>
      )}

      {note && <div className="callout bad bst-note" role="status"><span>{note}</span></div>}

      <div className={`w-stage grid-bg bst-stage${standalone ? ' big' : ''}`} ref={stageRef}>
        {!root && <p className="bst-empty small subtle">The tree is empty. Insert a value to plant the root.</p>}
        <svg viewBox={`0 0 ${width} ${svgHeight}`} style={{ maxWidth: `${width * 1.5}px` }} className="bst-svg" role="img" aria-label={root ? `Binary search tree with ${count} nodes, in order: ${inOrder(root).join(', ')}` : 'Empty tree'}>
          {shape.nodes.map((n) => {
            if (n.parent === null) return null
            const a = pos[n.parent]
            const b = pos[n.value]
            const d = `M${a.x},${a.y} L${b.x},${b.y}`
            const onPath = visited.includes(n.value) && visited.includes(n.parent) && anim?.kind === 'search'
            return <path key={`e${n.value}`} d={d} style={{ d: `path("${d}")` }} className={`bst-edge${onPath ? ' on' : ''}`} />
          })}
          {ghost && (
            <g className="bst-ghost" style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}>
              <circle r={R} />
              <text y="5" textAnchor="middle">{anim.target}?</text>
            </g>
          )}
          {shape.nodes.map((n) => {
            const p = pos[n.value]
            const order = isTraversal ? visited.indexOf(n.value) : -1
            const onPath = anim?.kind === 'search' && visited.includes(n.value)
            const inserted = lastInsert && lastInsert.value === n.value
            const pathIdx = lastInsert ? lastInsert.path.indexOf(n.value) : -1
            const cls = [
              'bst-node',
              order !== -1 ? 'visited' : '',
              onPath ? 'path' : '',
              current === n.value && animating ? 'current' : '',
              searchFound && n.value === anim.target ? 'found' : '',
              inserted ? 'fresh' : '',
              pathIdx !== -1 ? 'walk' : ''
            ].filter(Boolean).join(' ')
            return (
              <g
                key={n.value}
                className={cls}
                style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
                role="button"
                tabIndex={0}
                aria-label={`Node ${n.value}. Search for it.`}
                onClick={() => doSearch(n.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSearch(n.value) } }}
              >
                <g className="bst-node-inner" style={inserted ? { animationDelay: `${lastInsert.path.length * 140}ms` } : pathIdx !== -1 ? { animationDelay: `${pathIdx * 140}ms` } : undefined}>
                  <circle r={R} className="bst-circle" />
                  <text y="5" textAnchor="middle" className="bst-value">{n.value}</text>
                </g>
                {order !== -1 && (
                  <g className="bst-badge" transform={`translate(${R - 2}, ${-R + 2})`}>
                    <circle r="8" />
                    <text y="3.5" textAnchor="middle">{order + 1}</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {isTraversal && (
        <div className="bst-seq" aria-label={`${TRAVERSALS[anim.kind].label} so far`}>
          <span className="xsmall subtle">{TRAVERSALS[anim.kind].label}:</span>
          {visited.map((v, k) => <span key={`${k}-${v}`} className="bst-chip mono">{v}</span>)}
          {anim.pos < anim.seq.length && <span className="bst-chip pending mono">?</span>}
        </div>
      )}

      {anim && (
        <div className="w-toolbar bst-player">
          <button type="button" className="btn btn-sm" onClick={() => { sfx.tap(); setPlaying(!playing) }} disabled={!animating}>
            {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => { setPlaying(false); step() }} disabled={!animating}><SkipForward size={14} /> Step</button>
          <label className="w-slider">
            <span>Speed</span>
            <input type="range" min="0" max="2" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={['Slow', 'Medium', 'Fast'][speed]} />
          </label>
        </div>
      )}

      <p className={`w-feedback ${message.tone === 'warn' ? 'bst-warn' : message.tone}`} aria-live={playing ? 'off' : 'polite'}>{message.text}</p>

      <div className="w-readout">
        <div className="w-stat"><span>Nodes</span><strong>{count}</strong></div>
        <div className="w-stat"><span>Height</span><strong>{levels} {levels === 1 ? 'level' : 'levels'}</strong></div>
        <div className="w-stat"><span>Best possible</span><strong>{minHeight(count)}</strong></div>
        <div className="w-stat"><span>Balanced</span><strong className={balanced ? 'good-text' : 'warn-text'}>{balanced ? 'Yes' : 'No'}</strong></div>
      </div>

      <div className="w-legend">
        <span><i className="bst-key path" />Search path</span>
        <span><i className="bst-key found" />Found</span>
        <span><i className="bst-key visited" />Visited (numbered in order)</span>
        <span><i className="bst-key current" />Current step</span>
      </div>
    </div>
  )
}
