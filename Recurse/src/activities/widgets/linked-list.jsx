import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { ArrowLeftRight, LogOut, Pause, Play, Plus, SkipForward, Trash2 } from 'lucide-react'
import { burstFrom, feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { REVERSE_LINES, applyLine, deleteNode, expectedLine, fromValues, insertAfter, insertHead, insertTail, reversalLength, startReversal, toArray } from '../lib/linked-list'
import { useWidth } from '../lib/use-width'
import './linked-list.css'

const NW = 62
const NH = 44
// Node spacing: a little tighter on a phone, where a long list scrolls sideways in the stage.
const DESKTOP = { SP: 98, PADL: 74 }
const PHONE = { SP: 88, PADL: 66 }
const NODE_Y = 70
const SPEEDS = [1100, 700, 380]
const CLICKABLE = new Set(['init', 'save', 'repoint', 'prev', 'curr', 'head'])

function startValues(props) {
  const given = Array.isArray(props.values) ? props.values.map((v) => String(v).slice(0, 3)).filter(Boolean) : []
  return given.length ? given.slice(0, 8) : ['3', '7', '1', '9']
}

function arrowPath(from, to) {
  const sx = from + NW - 10
  const sy = NODE_Y + NH / 2
  if (to > from) return `M${sx},${sy} L${to - 3},${sy}`
  // Backward arrows curve underneath the row.
  const tx = to + NW / 2
  return `M${sx},${NODE_Y + NH - 2} C${sx},${NODE_Y + NH + 44} ${tx},${NODE_Y + NH + 44} ${tx},${NODE_Y + NH + 4}`
}

/** A singly linked list in SVG: insert, delete, and a hands-on three-pointer reversal. */
export default function LinkedList({ props, onComplete, standalone }) {
  const maxNodes = standalone ? 8 : 6
  const [list, setList] = useState(() => fromValues(startValues(props).slice(0, maxNodes)))
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState(null)
  const [fresh, setFresh] = useState(null)
  const [walked, setWalked] = useState({ ids: [], n: 0 })
  const [doomed, setDoomed] = useState(null)
  const [rev, setRev] = useState(null)
  const [revOrder, setRevOrder] = useState([])
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [combo, setCombo] = useState(0)
  const [message, setMessage] = useState({ text: 'Pick a node to select it, or add a value. When you are ready, start the reversal.', tone: '' })
  const stageRef = useRef(null)
  const lineRefs = useRef({})
  const stageW = useWidth(stageRef)
  const phone = stageW !== null && stageW < 480
  const { SP, PADL } = phone ? PHONE : DESKTOP
  const timer = useRef({ id: 0 })
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  useEffect(() => {
    const t = timer.current
    return () => clearTimeout(t.id)
  }, [])

  const order = toArray(rev ? rev.list : list)
  const layoutIds = rev ? revOrder : order.map((n) => n.id)
  const nodesById = (rev ? rev.list : list).nodes
  const xOf = (id) => PADL + layoutIds.indexOf(id) * SP
  const width = PADL + Math.max(1, layoutIds.length) * SP + 40
  const height = 172
  const busy = Boolean(doomed)

  // On a phone a long list is wider than the screen: keep the node being worked on in view.
  const focusId = rev?.curr ?? selected
  const focusX = focusId && layoutIds.includes(focusId) ? xOf(focusId) : null
  useEffect(() => {
    const el = stageRef.current
    const svg = el?.querySelector('svg')
    if (!phone || focusX === null || !svg || el.scrollWidth <= el.clientWidth) return
    const scale = svg.getBoundingClientRect().width / width
    const left = (focusX + NW / 2) * scale - el.clientWidth / 2
    el.scrollTo?.({ left: Math.max(0, left), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [phone, focusX, width])

  // Pointer tags: where each one sits (a node id or 'null-left' / 'null-right').
  const tags = []
  const headId = rev ? rev.list.head : list.head
  tags.push({ name: 'head', at: headId ?? 'null-right' })
  if (rev?.started) {
    tags.push({ name: 'prev', at: rev.prev ?? 'null-left' })
    tags.push({ name: 'curr', at: rev.curr ?? 'null-right' })
    if (rev.last !== 'init' && !rev.done) tags.push({ name: 'next', at: rev.next ?? 'null-right' })
  }
  const tagX = (at) => (at === 'null-left' ? PADL - SP * 0.62 + NW / 2 : at === 'null-right' ? PADL + layoutIds.length * SP - 4 : xOf(at) + NW / 2)
  const stackIndex = {}
  const placedTags = tags.map((t) => {
    const slot = stackIndex[t.at] ?? 0
    stackIndex[t.at] = slot + 1
    return { ...t, x: tagX(t.at), y: NODE_Y - 16 - slot * 19 }
  })

  // ---- Editing ----
  const valueToAdd = () => input.trim().slice(0, 3) || String(Math.floor(Math.random() * 90) + 10)
  const full = order.length >= maxNodes

  const apply = (result, tone = '') => {
    setList(result.list)
    setFresh(result.id ?? null)
    setWalked((w) => ({ ids: result.walked || [], n: w.n + 1 }))
    setMessage({ text: result.caption, tone })
    setInput('')
  }

  const add = (where) => {
    if (full) {
      feedbackWrong(stageRef.current)
      setMessage({ text: `This list holds up to ${maxNodes} nodes here. Delete one first.`, tone: 'bad' })
      return
    }
    sfx.pop()
    const v = valueToAdd()
    if (where === 'head') apply(insertHead(list, v))
    else if (where === 'tail') apply(insertTail(list, v))
    else apply(insertAfter(list, selected, v))
  }

  const remove = () => {
    if (!selected || busy) return
    sfx.tap()
    const result = deleteNode(list, selected)
    setDoomed(selected)
    setWalked((w) => ({ ids: result.walked.filter((id) => id !== selected), n: w.n + 1 }))
    const delay = result.walked.length * 110 + 280
    timer.current.id = setTimeout(() => {
      sfx.flip()
      setList(result.list)
      setDoomed(null)
      setSelected(null)
      setFresh(null)
      setMessage({ text: result.caption, tone: '' })
    }, delay)
  }

  const select = (id) => {
    if (rev || busy) return
    sfx.tap()
    setSelected(selected === id ? null : id)
  }

  // ---- Reversal ----
  const beginReversal = () => {
    if (order.length < 2) {
      setMessage({ text: 'Add at least two nodes so there is something to reverse.', tone: 'bad' })
      return
    }
    sfx.flip()
    setRevOrder(order.map((n) => n.id))
    setRev(startReversal(list))
    setSelected(null)
    setFresh(null)
    setCombo(0)
    setPlaying(false)
    setMessage({ text: 'Pick the line of code that runs next. Start at the top.', tone: '' })
  }

  const leaveReversal = () => {
    setList(rev.list)
    setRev(null)
    setPlaying(false)
    setMessage({ text: rev.done ? 'The list stays reversed. Edit it or reverse it again.' : 'Reversal stopped. The arrows stay where you left them.', tone: '' })
  }

  const runLine = (line, auto = false) => {
    if (!rev || rev.done) return
    const r = applyLine(rev, line)
    const el = lineRefs.current[line]
    if (!r.ok) {
      setCombo(0)
      feedbackWrong(el)
      setMessage({ text: `Not yet. ${r.caption}`, tone: 'bad' })
      return
    }
    setRev(r.rev)
    if (auto) {
      sfx.tick()
      setCombo(0)
    } else {
      const next = combo + 1
      setCombo(next)
      feedbackCorrect(el, { combo: next })
    }
    if (r.rev.done) {
      setPlaying(false)
      setMessage({ text: r.caption, tone: 'good' })
      feedbackSuccess(stageRef.current, 'Reversed!')
      burstFrom(stageRef.current, { kind: 'confetti', count: 28 })
      onComplete({ score: 1 })
    } else {
      setMessage({ text: r.caption, tone: '' })
    }
  }

  const tick = useEffectEvent(() => {
    const line = rev && expectedLine(rev)
    if (line) runLine(line, true)
    else setPlaying(false)
  })
  useEffect(() => {
    if (!playing) return undefined
    const id = setTimeout(tick, SPEEDS[speed])
    return () => clearTimeout(id)
  }, [playing, rev, speed])

  const want = rev ? expectedLine(rev) : null
  const total = rev ? reversalLength(revOrder.length) : 0

  return (
    <div className="ll">
      {!rev ? (
        <div className="w-toolbar ll-tools">
          <input
            className="input ll-input"
            value={input}
            maxLength={3}
            placeholder="value"
            aria-label="Value for a new node"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add('tail') }}
          />
          <button type="button" className="btn btn-sm" onClick={() => add('head')} disabled={busy}><Plus size={14} /> At head</button>
          <button type="button" className="btn btn-sm" onClick={() => add('tail')} disabled={busy}><Plus size={14} /> At tail</button>
          <button type="button" className="btn btn-sm" onClick={() => add('after')} disabled={!selected || busy}><Plus size={14} /> After selected</button>
          <button type="button" className="btn btn-sm btn-danger" onClick={remove} disabled={!selected || busy}><Trash2 size={14} /> Delete selected</button>
          <span className="grow" />
          <button type="button" className="btn btn-sm btn-primary" onClick={beginReversal} disabled={busy}><ArrowLeftRight size={14} /> Start reversal</button>
        </div>
      ) : (
        <div className="w-toolbar ll-tools">
          <span className="chip outline tabular">Line {rev.steps} / {total}</span>
          {combo >= 3 && <span className="chip accent">{combo} in a row</span>}
          <span className="grow" />
          <button type="button" className="btn btn-sm" onClick={() => { sfx.tap(); setPlaying(!playing) }} disabled={rev.done}>
            {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Auto-play</>}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => { setPlaying(false); if (want) runLine(want, true) }} disabled={rev.done}><SkipForward size={14} /> Step</button>
          <label className="w-slider">
            <span>Speed</span>
            <input type="range" min="0" max="2" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={['Slow', 'Medium', 'Fast'][speed]} />
          </label>
          <button type="button" className="btn btn-sm btn-ghost" onClick={leaveReversal}><LogOut size={14} /> {rev.done ? 'Back to editing' : 'Stop'}</button>
        </div>
      )}

      <div className={`w-stage grid-bg ll-stage${rev?.done ? ' done' : ''}`} ref={stageRef}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: `${width * 1.35}px`, '--vbw': width }} className={`ll-svg${phone ? ' phone' : ''}`} role="group" aria-label={`Linked list: ${order.map((n) => n.value).join(' then ') || 'empty'}, then null`}>
          <defs>
            <marker id={`ll-a-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="ll-head" />
            </marker>
            <marker id={`ll-h-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="ll-head hot" />
            </marker>
          </defs>

          {rev?.started && (
            <g className="ll-null-left" aria-hidden="true">
              <text x={PADL - SP * 0.62 + NW / 2} y={NODE_Y + NH / 2 + 4} textAnchor="middle">null</text>
            </g>
          )}

          {layoutIds.map((id) => {
            const node = nodesById[id]
            if (!node) return null
            const x = xOf(id)
            if (node.next === null) {
              return (
                <g key={`null-${id}`} className="ll-null" aria-hidden="true">
                  <line x1={x + NW - 10} y1={NODE_Y + NH / 2} x2={x + NW + 6} y2={NODE_Y + NH / 2} />
                  <text x={x + NW + 9} y={NODE_Y + NH / 2 + 4}>null</text>
                </g>
              )
            }
            const to = xOf(node.next)
            const flipped = layoutIds.indexOf(node.next) < layoutIds.indexOf(id)
            const d = arrowPath(x, to)
            return (
              <path
                key={`${id}->${node.next}`}
                d={d}
                style={{ d: `path("${d}")` }}
                pathLength="1"
                className={`ll-arrow${flipped ? ' hot' : ''}`}
                markerEnd={`url(#${flipped ? `ll-h-${uid}` : `ll-a-${uid}`})`}
              />
            )
          })}

          {layoutIds.map((id) => {
            const node = nodesById[id]
            if (!node) return null
            const x = xOf(id)
            const walkIndex = walked.ids.indexOf(id)
            const cls = [
              'll-node',
              selected === id ? 'selected' : '',
              fresh === id ? 'fresh' : '',
              doomed === id ? 'doomed' : '',
              rev?.curr === id ? 'curr' : '',
              rev?.prev === id ? 'prev' : '',
              rev?.done ? 'reversed' : ''
            ].filter(Boolean).join(' ')
            return (
              <g
                key={id}
                className={cls}
                style={{ transform: `translate(${x}px, ${NODE_Y}px)` }}
                role="button"
                tabIndex={rev ? -1 : 0}
                aria-pressed={selected === id}
                aria-label={`Node ${node.value}, points to ${node.next ? nodesById[node.next]?.value : 'null'}`}
                onClick={() => select(id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id) } }}
              >
                <g className="ll-node-inner">
                  <rect className="ll-box" width={NW} height={NH} rx="7" />
                  <line className="ll-divider" x1={NW - 20} x2={NW - 20} y1="4" y2={NH - 4} />
                  <text className="ll-value" x={(NW - 20) / 2} y={NH / 2 + 6} textAnchor="middle">{node.value}</text>
                  <circle className="ll-dot" cx={NW - 10} cy={NH / 2} r="3.5" />
                  {walkIndex !== -1 && (
                    <rect key={`w${walked.n}`} className="ll-walk" width={NW} height={NH} rx="7" style={{ animationDelay: `${walkIndex * 110}ms` }} />
                  )}
                </g>
              </g>
            )
          })}

          {placedTags.map((t) => (
            <g key={t.name} className={`ll-tag ${t.name}`} style={{ transform: `translate(${t.x}px, ${t.y}px)` }} aria-hidden="true">
              <rect x="-22" y="-13" width="44" height="17" rx="8" />
              <text y="0" textAnchor="middle">{t.name}</text>
              {t.y === NODE_Y - 16 && <path d="M0,5 L0,13" className="ll-tag-stem" />}
            </g>
          ))}
        </svg>
      </div>

      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>

      {rev && (
        <div className="ll-code" role="group" aria-label="Reversal code. Choose the line that runs next.">
          {REVERSE_LINES.map((line) => {
            const clickable = CLICKABLE.has(line.id)
            const isNext = rev.done ? false : line.id === want
            const ran = rev.last === line.id
            return clickable ? (
              <button
                key={line.id}
                ref={(el) => { lineRefs.current[line.id] = el }}
                type="button"
                className={`ll-line${ran ? ' ran' : ''}${isNext && (playing || rev.steps === 0) ? ' cue' : ''}`}
                onClick={() => { setPlaying(false); runLine(line.id) }}
                disabled={rev.done}
              >
                <code>{line.code}</code>
              </button>
            ) : (
              <div key={line.id} className="ll-line static"><code>{line.code}</code></div>
            )
          })}
        </div>
      )}

      <div className="w-legend">
        <span><i className="ll-key node" />Node: value and next pointer</span>
        <span><i className="ll-key hot" />Arrow already flipped</span>
        {rev && <span><i className="ll-key curr" />curr</span>}
        {rev && <span><i className="ll-key prev" />prev</span>}
        {!rev && <span><i className="ll-key sel" />Selected</span>}
      </div>
    </div>
  )
}
