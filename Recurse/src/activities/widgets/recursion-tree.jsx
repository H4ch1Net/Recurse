import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ChevronLeft, FastForward, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { feedbackCorrect, floatText } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { FUNCTIONS, FUNCTION_NAMES, buildTrace, callName, describeEvent, layoutTree } from '../lib/recursion-tree'
import { useWidth } from '../lib/use-width'
import './recursion-tree.css'

const DELAYS = [900, 560, 320, 150, 60]
const SPEED_NAMES = ['Slow', 'Easy', 'Medium', 'Fast', 'Blazing']
const PAD = 14

function sizing(width, phone = false) {
  // Compact boxes (argument only) for wide trees, and for any branching tree on a phone.
  const compact = width > 9 || (phone && width > 3)
  return compact ? { compact, w: 32, h: 36, ux: 37, uy: 66 } : { compact, w: 52, h: 36, ux: 60, uy: 66 }
}

function replay(trace, pos) {
  const status = new Array(trace.nodes.length).fill('hidden')
  const stack = []
  const memo = []
  const perArg = {}
  let calls = 0
  let deepest = 0
  for (let k = 0; k < pos; k++) {
    const event = trace.events[k]
    const node = trace.nodes[event.id]
    if (event.type === 'return') {
      status[event.id] = 'done'
      stack.pop()
      if (trace.memo) memo.push(event.id)
      continue
    }
    calls++
    perArg[node.arg] = (perArg[node.arg] || 0) + 1
    if (event.type === 'hit') status[event.id] = 'hit'
    else {
      status[event.id] = 'active'
      stack.push(event.id)
      deepest = Math.max(deepest, stack.length)
    }
  }
  return { status, stack, memo, perArg, calls, deepest, event: pos > 0 ? trace.events[pos - 1] : null }
}

/** Animated call tree and call stack for fib, factorial or sum, with and without memoization. */
export default function RecursionTree({ props, onComplete, standalone }) {
  const maxN = standalone ? 8 : 7
  const [fn, setFn] = useState(FUNCTIONS[props.fn] ? props.fn : 'fib')
  const [n, setN] = useState(() => Math.max(1, Math.min(maxN, Math.round(Number(props.n)) || 5)))
  const [memo, setMemo] = useState(Boolean(props.memo))
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [runs, setRuns] = useState({})
  const [message, setMessage] = useState({ text: '', tone: '' })
  const compareRef = useRef(null)
  const treeRef = useRef(null)
  const treeW = useWidth(treeRef)
  const phone = treeW !== null && treeW < 480

  const trace = useMemo(() => buildTrace(fn, n, memo), [fn, n, memo])
  const layout = useMemo(() => layoutTree(trace.nodes), [trace])
  const view = useMemo(() => replay(trace, pos), [trace, pos])
  const last = trace.events.length
  const size = sizing(layout.width, phone)
  const vbW = Math.max(layout.width * size.ux + size.w + PAD * 2, 240)
  const vbH = (layout.levels - 1) * size.uy + size.h + PAD * 2
  const offsetX = (vbW - (layout.width * size.ux + size.w)) / 2 + size.w / 2
  const px = (id) => offsetX + layout.x[id] * size.ux
  const py = (id) => PAD + size.h / 2 + layout.depth[id] * size.uy
  const runKey = `${fn}:${n}`
  const pair = runs[runKey] || {}

  const finish = () => {
    const next = { ...pair, [memo ? 'memo' : 'plain']: trace.calls }
    setRuns({ ...runs, [runKey]: next })
    sfx.success()
    const label = callName(fn, n)
    if (next.plain !== undefined && next.memo !== undefined) {
      feedbackCorrect(compareRef.current, { combo: 2 })
      const saved = next.plain - next.memo
      if (saved > 0) floatText(compareRef.current, `${saved} calls saved`, { tone: 'good' })
      setMessage({
        text: saved > 0
          ? `${label} took ${next.plain} calls without memo and ${next.memo} with it. The memo skipped ${saved} repeated calls by reusing answers it had already worked out.`
          : `${label} took ${next.plain} calls either way. Each subproblem is needed only once here, so a memo has nothing to reuse. Try fib to see it shine.`,
        tone: 'good'
      })
      onComplete({ score: 1, detail: `${label}: ${next.plain} calls plain, ${next.memo} with memo` })
    } else {
      setMessage({ text: `${label} returned ${trace.result} after ${trace.calls} calls. Now flip memoization ${memo ? 'off' : 'on'} and run it again to compare.`, tone: 'good' })
    }
  }

  const goTo = (p) => {
    const target = Math.max(0, Math.min(last, p))
    setPos(target)
    if (target === last && pos !== last) {
      setPlaying(false)
      finish()
    }
  }

  const tick = useEffectEvent(() => {
    const event = trace.events[pos]
    if (event?.type === 'hit') sfx.pop()
    goTo(pos + 1)
  })
  useEffect(() => {
    if (!playing || pos >= last) return undefined
    const id = setTimeout(tick, DELAYS[speed])
    return () => clearTimeout(id)
  }, [playing, pos, speed, last])

  const reset = () => {
    setPos(0)
    setPlaying(false)
    setMessage({ text: '', tone: '' })
  }

  const chooseFn = (name) => {
    if (name === fn) return
    sfx.tap()
    setFn(name)
    reset()
  }

  const toggleMemo = () => {
    sfx.flip()
    setMemo((m) => !m)
    reset()
  }

  const togglePlay = () => {
    sfx.tap()
    if (playing) return setPlaying(false)
    if (pos >= last) setPos(0)
    setPlaying(true)
  }

  const caption = view.event ? describeEvent(trace, pos - 1) : { text: `Press Play to call ${callName(fn, n)}. Each call pushes a frame on the stack; each return pops one and hands its value to the caller.`, line: null }
  const lastEvent = view.event
  const bubble = lastEvent && lastEvent.type === 'return' && trace.nodes[lastEvent.id].parent !== null ? trace.nodes[lastEvent.id] : null
  const def = FUNCTIONS[fn]
  const label = (arg) => (size.compact ? String(arg) : callName(fn, arg))
  const stackTop = view.stack[view.stack.length - 1]
  // On a phone a big tree scrolls sideways: keep the running call in view.
  const topX = stackTop === undefined ? null : px(stackTop)
  useEffect(() => {
    const el = treeRef.current
    const svg = el?.querySelector('svg')
    if (!phone || topX === null || !svg || el.scrollWidth <= el.clientWidth) return
    const scale = svg.getBoundingClientRect().width / vbW
    el.scrollLeft = Math.max(0, topX * scale - el.clientWidth / 2)
  }, [phone, topX, vbW])
  const argCounts = Object.entries(view.perArg).sort((a, b) => Number(b[0]) - Number(a[0]))
  const maxCount = Math.max(1, ...argCounts.map(([, c]) => c))

  return (
    <div className="rtree">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="Function">
          {FUNCTION_NAMES.map((name) => (
            <button key={name} type="button" aria-pressed={name === fn} onClick={() => chooseFn(name)}>{FUNCTIONS[name].title}</button>
          ))}
        </div>
        <label className="w-slider">
          <span>n = <strong className="tabular">{n}</strong></span>
          <input type="range" min="1" max={maxN} value={n} onChange={(e) => { sfx.tick(); setN(Number(e.target.value)); reset() }} aria-label="Argument n" />
        </label>
        <span className="grow" />
        <button type="button" className={`btn btn-sm rtree-memo${memo ? ' on' : ''}`} role="switch" aria-checked={memo} onClick={toggleMemo}>
          <span className="rtree-switch" aria-hidden="true"><span /></span>
          Memoization {memo ? 'on' : 'off'}
        </button>
      </div>

      <div className="w-stage grid-bg rtree-stage">
        <div className="rtree-main">
          <div className="rtree-left">
            <pre className="rtree-code" aria-label="Code">
              <code>
                <span className="rtree-line">{`function ${def.label}(n) {`}</span>
                {memo && <span className={`rtree-line${caption.line === 'memo' ? ' hot' : ''}`}>{'  if (memo.has(n)) return memo.get(n)'}</span>}
                <span className={`rtree-line${caption.line === 'base' ? ' hot' : ''}`}>{`  ${def.code[0]}`}</span>
                <span className={`rtree-line${caption.line === 'recurse' ? ' hot' : ''}`}>{`  ${def.code[1]}`}</span>
                <span className="rtree-line">{'}'}</span>
              </code>
            </pre>
            <div className="rtree-tree" ref={treeRef}>
              <svg className={`rtree-svg${phone ? ' phone' : ''}`} viewBox={`0 0 ${vbW} ${vbH}`} style={{ maxWidth: `${Math.round(vbW * 1.4)}px`, '--vbw': vbW }} role="img" aria-label={`Call tree for ${callName(fn, n)}: ${view.calls} of ${trace.calls} calls made so far`}>
                <g className="rtree-edges">
                  {trace.nodes.map((node) => {
                    if (node.parent === null || view.status[node.id] === 'hidden') return null
                    const st = view.status[node.id]
                    return (
                      <line
                        key={node.id}
                        className={`rtree-edge ${st}`}
                        x1={px(node.parent)}
                        y1={py(node.parent) + size.h / 2}
                        x2={px(node.id)}
                        y2={py(node.id) - size.h / 2}
                      />
                    )
                  })}
                </g>
                {trace.nodes.map((node) => {
                  const st = view.status[node.id]
                  if (st === 'hidden') return null
                  const isTop = node.id === stackTop
                  const showValue = st === 'done' || st === 'hit'
                  return (
                    <g key={node.id} transform={`translate(${px(node.id)} ${py(node.id)})`}>
                      <g className={`rtree-node ${st}${isTop ? ' top' : ''}`}>
                        <rect x={-size.w / 2} y={-size.h / 2} width={size.w} height={size.h} rx="8" />
                        <text className="rtree-label" y={showValue ? -3 : 4}>{label(node.arg)}</text>
                        {showValue && <text className="rtree-value" y="12">{`= ${node.value}`}</text>}
                        {st === 'hit' && !size.compact && <text className="rtree-tag" y={-size.h / 2 - 4}>memo</text>}
                      </g>
                    </g>
                  )
                })}
                {bubble && (
                  <g transform={`translate(${px(bubble.parent)} ${py(bubble.parent)})`}>
                    <g
                      key={pos}
                      className="rtree-bubble"
                      style={{ '--dx': `${px(bubble.id) - px(bubble.parent)}px`, '--dy': `${py(bubble.id) - py(bubble.parent)}px` }}
                    >
                      <circle r="11" />
                      <text y="4">{bubble.value}</text>
                    </g>
                  </g>
                )}
              </svg>
            </div>
          </div>

          <aside className="rtree-side" aria-label="Call stack">
            <div className="rtree-side-head">
              <strong>Call stack</strong>
              <span className="chip outline tabular">depth {view.stack.length}</span>
            </div>
            <ol className="rtree-stack">
              {[...view.stack].reverse().map((id, k) => (
                <li key={id} className={k === 0 ? 'top' : ''}>
                  <span className="mono">{callName(fn, trace.nodes[id].arg)}</span>
                  <span className="rtree-depth">{k === 0 ? 'running' : 'waiting'}</span>
                </li>
              ))}
              {!view.stack.length && <li className="rtree-empty">{pos >= last ? 'empty, all done' : 'empty'}</li>}
            </ol>
            {memo && (
              <div className="rtree-memo-box">
                <strong className="xsmall">Memo</strong>
                <div className="rtree-memo-list">
                  {view.memo.length ? view.memo.map((id) => (
                    <span key={id} className="chip accent rtree-memo-chip">{callName(fn, trace.nodes[id].arg)} = {trace.nodes[id].value}</span>
                  )) : <span className="xsmall subtle">nothing saved yet</span>}
                </div>
              </div>
            )}
          </aside>
        </div>
        <div className="rtree-progress" aria-hidden="true"><span style={{ width: `${(pos / last) * 100}%` }} /></div>
      </div>

      <p className="rtree-caption" aria-live={playing ? 'off' : 'polite'}>{caption.text}</p>

      <div className="w-toolbar rtree-controls">
        <button type="button" className="btn btn-sm" onClick={() => { sfx.tick(); setPlaying(false); goTo(pos - 1) }} disabled={pos === 0} aria-label="Step back">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={togglePlay}>
          {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {pos >= last ? 'Replay' : pos ? 'Resume' : 'Play'}</>}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => { sfx.tick(); setPlaying(false); goTo(pos + 1) }} disabled={pos >= last}>
          <SkipForward size={15} /> Step
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { sfx.tap(); setPlaying(false); goTo(last) }} disabled={pos >= last} aria-label="Skip to the end">
          <FastForward size={15} />
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={reset} disabled={pos === 0} aria-label="Rewind to the start">
          <RotateCcw size={15} />
        </button>
        <label className="w-slider">
          <span>Speed</span>
          <input type="range" min="0" max="4" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={SPEED_NAMES[speed]} />
        </label>
      </div>

      <div className="w-readout">
        <div className="w-stat"><span>Calls so far</span><strong>{view.calls}</strong></div>
        {memo && <div className="w-stat"><span>From memo</span><strong>{view.status.filter((s) => s === 'hit').length}</strong></div>}
        <div className="w-stat"><span>Stack depth</span><strong>{view.stack.length}</strong></div>
        <div className="w-stat"><span>Deepest</span><strong>{view.deepest}</strong></div>
        <div className="w-stat"><span>Answer</span><strong>{pos >= last ? trace.result : '?'}</strong></div>
      </div>

      <div className="w-legend">
        <span><i className="rtree-key top" />Running (top of stack)</span>
        <span><i className="rtree-key active" />Waiting for a child</span>
        <span><i className="rtree-key done" />Returned a value</span>
        {memo && <span><i className="rtree-key hit" />Answered from the memo</span>}
      </div>

      {argCounts.length > 0 && fn === 'fib' && (
        <div className="rtree-repeats">
          <p className="xsmall subtle">Times each fib(n) was called so far</p>
          {argCounts.map(([arg, count]) => (
            <div key={arg} className="rtree-repeat">
              <span className="mono xsmall">fib({arg})</span>
              <span className="rtree-bar"><span style={{ width: `${(count / maxCount) * 100}%` }} className={count > 1 && !memo ? 'repeat' : ''} /></span>
              <strong className="tabular xsmall">{count}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="rtree-compare" ref={compareRef}>
        <div className={`rtree-compare-card${pair.plain !== undefined ? ' filled' : ''}`}>
          <span>Without memo</span>
          <strong>{pair.plain !== undefined ? pair.plain : '?'}</strong>
          <span className="xsmall subtle">calls</span>
        </div>
        <div className={`rtree-compare-card${pair.memo !== undefined ? ' filled' : ''}`}>
          <span>With memo</span>
          <strong>{pair.memo !== undefined ? pair.memo : '?'}</strong>
          <span className="xsmall subtle">calls</span>
        </div>
        {pair.plain !== undefined && pair.memo !== undefined && pair.memo < pair.plain && (
          <div className="rtree-compare-card win">
            <span>Saved</span>
            <strong>{pair.plain - pair.memo}</strong>
            <span className="xsmall subtle">{Math.round((1 - pair.memo / pair.plain) * 100)}% fewer</span>
          </div>
        )}
      </div>

      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
    </div>
  )
}
