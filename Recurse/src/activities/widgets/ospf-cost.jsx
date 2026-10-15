import { useMemo, useRef, useState } from 'react'
import { Check, Pause, Play, RotateCcw, Send, StepBack, StepForward } from 'lucide-react'
import { feedbackSuccess } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import {
  BANDWIDTH_OPTIONS,
  BOTTOM_PATH,
  LINKS,
  LINK_TYPES,
  REFERENCE_OPTIONS,
  ROUTERS,
  TOP_PATH,
  bestPaths,
  commands,
  defaultConfig,
  ifaceKey,
  interfaces,
  pathCost,
  routeChoice,
  spf
} from '../lib/ospf-cost'
import { useNarrow } from '../lib/use-width'
import './ospf-cost.css'

// Diagram (viewBox 0 0 400 236).
const POS = {
  R1: { x: 46, y: 118 },
  R2: { x: 200, y: 40 },
  R4: { x: 354, y: 118 },
  R3: { x: 134, y: 198 },
  R5: { x: 266, y: 198 }
}
const CENTER = { x: 200, y: 125 }
// Phone diagram (viewBox 0 0 300 446): the top path runs down the left, the bottom path down the right.
const PHONE_POS = {
  R1: { x: 150, y: 56 },
  R2: { x: 60, y: 226 },
  R3: { x: 240, y: 160 },
  R5: { x: 240, y: 296 },
  R4: { x: 150, y: 392 }
}
const PHONE_CENTER = { x: 150, y: 224 }
// Where each router's cost badge sits on the phone layout: inside the diamond, clear of the links.
const PHONE_BADGE = { R1: { x: 0, y: -36 }, R4: { x: 0, y: 38 }, R2: { x: 58, y: 0 }, R3: { x: -58, y: 0 }, R5: { x: -58, y: 0 } }
const SPEEDS = [0.5, 1, 2]
const SHORT = { fe: 'FE 100M', ge: 'GE 1G', te: '10GE' }

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const wait = (ms, speed = 1) => new Promise((r) => setTimeout(r, reducedMotion() ? 60 : ms / speed))
const fmt = (n) => (n === Infinity ? '∞' : String(n))
const pathText = (p) => p.join(' → ')
const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

function fly(node, routers, pos = POS) {
  if (!node?.animate || routers.length < 2) return Promise.resolve()
  node.getAnimations().forEach((a) => a.cancel())
  const pts = routers.map((r) => pos[r])
  const d = [0]
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = d[d.length - 1] || 1
  const frames = pts.map((p, i) => ({ transform: `translate(${p.x}px, ${p.y}px)`, opacity: i === 0 || i === pts.length - 1 ? 0.2 : 1, offset: d[i] / total }))
  frames[0].opacity = 1
  return node.animate(frames, { duration: reducedMotion() ? 140 : Math.max(700, total * 4.2), easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' }).finished.catch(() => {})
}

function along(a, b, k) {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

function Topology({ ifs, linkState, badges, settled, current, selected, onSelect, packetRefs, phone }) {
  const POS_ = phone ? PHONE_POS : POS
  const center = phone ? PHONE_CENTER : CENTER
  // Bigger type on the phone layout needs wider cost pills.
  const pill = phone ? { pad: 18, ch: 8.2, h: 24, hit: 42 } : { pad: 14, ch: 7, h: 18, hit: 26 }
  return (
    <svg className={`ospf-topo${phone ? ' phone' : ''}`} viewBox={phone ? '0 0 300 446' : '0 0 400 236'} role="group" aria-label="OSPF topology. Top path: R1 to R2 to R4 over FastEthernet. Bottom path: R1 to R3 to R5 to R4 over Gigabit and 10 Gigabit links. Select a cost to edit that interface.">
      {LINKS.map((link) => {
        const a = POS_[link.ends[0].router]
        const b = POS_[link.ends[1].router]
        const mid = along(a, b, 0.5)
        const nx = -(b.y - a.y)
        const ny = b.x - a.x
        const len = Math.hypot(nx, ny) || 1
        const side = (mid.x - center.x) * nx + (mid.y - center.y) * ny >= 0 ? 1 : -1
        // On the phone the label must clear the line at any angle, so the offset grows with its width.
        const off = phone ? 7 + (SHORT[link.kind].length * 3.75 * Math.abs(nx)) / len + (6 * Math.abs(ny)) / len : 13
        const lx = mid.x + (nx / len) * off * side
        const ly = mid.y + (ny / len) * off * side + (phone ? 4 : 3)
        return (
          <g key={link.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`ospf-link ${link.kind} ${linkState[link.id] || ''}`} />
            <text x={lx} y={ly} className="ospf-link-label" textAnchor="middle">{SHORT[link.kind]}</text>
          </g>
        )
      })}
      {ROUTERS.map((r) => {
        const p = POS_[r]
        const below = p.y > 150
        const at = phone ? PHONE_BADGE[r] : { x: 0, y: below ? 33 : -31 }
        return (
          <g key={r} className={`ospf-router${settled.includes(r) ? ' settled' : ''}${current === r ? ' current' : ''}`} transform={`translate(${p.x} ${p.y})`}>
            <circle r="20" className="ospf-router-body" />
            <text y="4.5" className="ospf-router-name" textAnchor="middle">{r}</text>
            <g transform={`translate(${at.x} ${at.y})`}>
              {phone ? <rect x="-32" y="-12" width="64" height="22" rx="11" className="ospf-badge" /> : <rect x="-24" y="-9" width="48" height="16" rx="8" className="ospf-badge" />}
              <text y={phone ? 4 : 3} className="ospf-badge-text" textAnchor="middle">{r === 'R1' ? 'root' : `cost ${fmt(badges[r])}`}</text>
            </g>
          </g>
        )
      })}
      {LINKS.flatMap((link) =>
        link.ends.map((end, i) => {
          const other = link.ends[1 - i]
          const p = along(POS_[end.router], POS_[other.router], phone ? 0.3 : 0.31)
          const info = ifs[ifaceKey(end)]
          const w = pill.pad + String(info.cost).length * pill.ch
          const key = ifaceKey(end)
          return (
            <g
              key={key}
              className={`ospf-pill${selected === key ? ' on' : ''}${info.source === 'manual' || info.bandwidthSet ? ' set' : ''}`}
              transform={`translate(${p.x} ${p.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={selected === key}
              aria-label={`${key}, cost ${info.cost}${info.source === 'manual' ? ', set by hand' : ''}. Edit`}
              onClick={() => onSelect(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(key)
                }
              }}
            >
              <rect x={-Math.max(w + 8, pill.hit) / 2} y={-pill.hit / 2} width={Math.max(w + 8, pill.hit)} height={pill.hit} className="ospf-pill-hit" />
              <rect x={-w / 2} y={-pill.h / 2} width={w} height={pill.h} rx={pill.h / 2} className="ospf-pill-body" />
              <text y={phone ? 4.5 : 4} className="ospf-pill-text" textAnchor="middle">{info.cost}</text>
            </g>
          )
        })
      )}
      {packetRefs.map((ref, i) => (
        <g key={i} ref={ref} className="ospf-packet" style={{ opacity: 0 }} aria-hidden="true">
          <rect x="-9" y="-6.5" width="18" height="13" rx="3" />
          <path d="M-8 -5 L0 1 L8 -5" />
        </g>
      ))}
    </svg>
  )
}

/** A number field that only commits whole numbers from 1 to 65535, so typing feels normal. */
function CostInput({ value, onCommit }) {
  const [draft, setDraft] = useState(String(value))
  return (
    <input
      className="input mono ospf-cost-input"
      inputMode="numeric"
      value={draft}
      aria-label="ip ospf cost"
      onChange={(e) => {
        const text = e.target.value.replace(/[^\d]/g, '').slice(0, 5)
        setDraft(text)
        const v = Number(text)
        if (text && v >= 1 && v <= 65535 && v !== value) onCommit(v)
      }}
      onBlur={() => setDraft(String(value))}
    />
  )
}

function spfCaption(step) {
  if (!step) return ''
  const parts = step.updates
    .filter((u) => u.result !== 'done')
    .map((u) => {
      if (u.result === 'better') return `${u.to} at ${step.cost} + ${u.edgeCost} = ${u.cost}${u.before === Infinity ? '' : `, better than ${u.before}`}`
      if (u.result === 'tie') return `${u.to} at ${u.cost} ties, so both paths are kept`
      return `${u.to} at ${u.cost} is worse than ${u.before}, ignored`
    })
  const head = step.visit === 'R1' ? 'Start at the root, R1, cost 0.' : `Settle ${step.visit} at cost ${step.cost}, the lowest cost not yet settled.`
  return parts.length ? `${head} Through it: ${parts.join('; ')}.` : `${head} Every neighbor is already settled.`
}

/** OSPF cost: reference bandwidth, interface costs, SPF and a path-steering challenge. */
export default function OspfCost({ onComplete }) {
  const [config, setConfig] = useState(defaultConfig)
  const [selected, setSelected] = useState('R1 Fa0/0')
  const [spfIdx, setSpfIdx] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [tasks, setTasks] = useState({ bottom: false, ecmp: false, spf: false })
  const [note, setNote] = useState({ text: '', tone: '' })
  const packetA = useRef(null)
  const packetB = useRef(null)
  const stageRef = useRef(null)
  const phone = useNarrow(stageRef)
  const tasksRef = useRef(tasks)
  const doneRef = useRef(false)
  const playRef = useRef({ playing: false, run: 0, speed: 1 })

  const ifs = useMemo(() => interfaces(config), [config])
  const result = useMemo(() => spf(config), [config])
  const paths = useMemo(() => bestPaths(result, 'R4'), [result])
  const choice = routeChoice(config)
  const top = pathCost(config, TOP_PATH)
  const bottom = pathCost(config, BOTTOM_PATH)
  const sel = ifs[selected]
  const selLink = LINKS.find((l) => l.id === sel.link)
  const selSet = config.ifaces[selected] || {}
  const cmds = commands(config)
  const stepping = spfIdx !== null
  const step = stepping ? result.trace[spfIdx] : null

  const linkState = useMemo(() => {
    const out = {}
    if (stepping) {
      const settledSet = new Set(step.settled)
      for (const r of step.settled) for (const e of result.preds[r]) if (settledSet.has(e.from)) out[e.link] = 'tree'
      return out
    }
    for (const r of ROUTERS) for (const e of result.preds[r]) out[e.link] = 'tree'
    for (const p of paths) for (let i = 0; i < p.length - 1; i++) {
      const link = LINKS.find((l) => (l.ends[0].router === p[i] && l.ends[1].router === p[i + 1]) || (l.ends[1].router === p[i] && l.ends[0].router === p[i + 1]))
      out[link.id] = 'best'
    }
    return out
  }, [stepping, step, result, paths])

  const badges = stepping ? step.tentative : result.dist
  const settled = stepping ? step.settled : []

  const markTask = (key, label) => {
    if (tasksRef.current[key]) return
    const next = { ...tasksRef.current, [key]: true }
    tasksRef.current = next
    setTasks(next)
    feedbackSuccess(stageRef.current, label)
    if (key === 'bottom' && !doneRef.current) {
      doneRef.current = true
      onComplete?.({ score: 1 })
    }
  }

  const sendTraffic = (cfg) => {
    const ps = bestPaths(spf(cfg), 'R4')
    const refs = [packetA, packetB]
    ;[packetA, packetB].forEach((r) => r.current?.getAnimations?.().forEach((a) => a.cancel()))
    Promise.all(ps.slice(0, 2).map((p, i) => fly(refs[i].current, p, phone ? PHONE_POS : POS))).then(() => sfx.pop())
  }

  const apply = (next, label) => {
    playRef.current.run += 1
    playRef.current.playing = false
    setPlaying(false)
    setSpfIdx(null)
    const before = routeChoice(config)
    const after = routeChoice(next)
    setConfig(next)
    if (before !== after) {
      sfx.flip()
      sendTraffic(next)
      setNote({
        text: after === 'both' ? 'Equal cost! R1 now load balances across both paths.' : `${label} R1 now sends traffic to R4 over the ${after} path.`,
        tone: after === 'bottom' ? 'good' : ''
      })
    } else {
      sfx.tap()
      setNote({ text: `${label} The best path did not change.`, tone: '' })
    }
    if (after === 'bottom') markTask('bottom', 'Path moved')
    if (after === 'both') markTask('ecmp', 'Load balancing')
  }

  const setRef = (ref) => apply({ ...config, ref }, `Reference bandwidth is now ${ref.toLocaleString('en-US')} Mbps.`)

  const setIface = (key, patch, label) => {
    const cur = config.ifaces[key] || {}
    const merged = { ...cur, ...patch }
    if (merged.cost == null) delete merged.cost
    if (merged.bandwidth == null) delete merged.bandwidth
    const ifaces = { ...config.ifaces, [key]: merged }
    if (!Object.keys(merged).length) delete ifaces[key]
    apply({ ...config, ifaces }, label)
  }

  const startSpf = async () => {
    const s = playRef.current
    if (s.playing) return
    s.run += 1
    const run = s.run
    s.playing = true
    setPlaying(true)
    let i = spfIdx === null || spfIdx >= result.trace.length - 1 ? -1 : spfIdx
    while (s.playing && run === s.run && i < result.trace.length - 1) {
      i += 1
      setSpfIdx(i)
      sfx.tick()
      if (i === result.trace.length - 1) markTask('spf', 'SPF done')
      await wait(1500, s.speed)
    }
    if (run === s.run) {
      s.playing = false
      setPlaying(false)
    }
  }

  const pauseSpf = () => {
    playRef.current.playing = false
    setPlaying(false)
  }

  const stepSpf = (d) => {
    pauseSpf()
    sfx.tick()
    const max = result.trace.length - 1
    const next = spfIdx === null ? 0 : Math.max(0, Math.min(max, spfIdx + d))
    setSpfIdx(next)
    if (next === max) markTask('spf', 'SPF done')
  }

  const exitSpf = () => {
    pauseSpf()
    playRef.current.run += 1
    setSpfIdx(null)
  }

  const reset = () => {
    apply(defaultConfig(), 'Back to the defaults.')
    setSelected('R1 Fa0/0')
  }

  const problem = config.ref === 100 && ifs['R1 Fa0/0'].cost === ifs['R1 Gi0/1'].cost && ifs['R1 Fa0/0'].source === 'auto'

  return (
    <div className="ospf">
      <div className="w-toolbar">
        <label className="ospf-ref">
          <span className="small">Reference bandwidth</span>
          <select className="select" value={config.ref} onChange={(e) => setRef(Number(e.target.value))} aria-label="auto-cost reference-bandwidth in Mbps">
            {REFERENCE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r.toLocaleString('en-US')} Mbps{r === 100 ? ' (default)' : ''}</option>
            ))}
          </select>
        </label>
        <span className="grow" />
        <button type="button" className="btn btn-sm" onClick={() => { sfx.tap(); sendTraffic(config) }}><Send size={14} /> Send traffic</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={reset}><RotateCcw size={14} /> Defaults</button>
      </div>

      <div className="w-stage ospf-stage" ref={stageRef}>
        <Topology ifs={ifs} linkState={linkState} badges={badges} settled={settled} current={step?.visit} selected={selected} onSelect={(k) => { sfx.tap(); setSelected(k) }} packetRefs={[packetA, packetB]} phone={phone} />
        <div className="w-legend">
          <span><i className="ospf-key best" />Best path to R4</span>
          <span><i className="ospf-key tree" />Shortest path tree</span>
          <span><i className="ospf-key pill" />Outgoing interface cost (select to edit)</span>
        </div>
      </div>

      <section className={`ospf-result ${choice}`} aria-live="polite">
        <p className="ospf-result-head">
          {choice === 'both'
            ? `R1 load balances to R4 over both paths, cost ${top.total} each.`
            : `R1 reaches R4 via ${pathText(paths[0])}, total cost ${result.dist.R4}.`}
        </p>
        <div className="ospf-paths">
          {[['Top', TOP_PATH, top], ['Bottom', BOTTOM_PATH, bottom]].map(([name, p, c]) => {
            const used = paths.some((x) => samePath(x, p))
            return (
              <div key={name} className={`ospf-path${used ? ' used' : ''}`}>
                <span className="ospf-path-name">{name} {used && <span className="chip good">used</span>}</span>
                <span className="mono small">{c.hops.map((h) => `${h.iface.split(' ')[1]} (${h.cost})`).join(' + ')} = <strong>{c.total}</strong></span>
              </div>
            )
          })}
        </div>
        {problem && (
          <p className="small ospf-problem">
            See the problem? With the default 100 Mbps reference, FastEthernet, Gigabit and 10 Gigabit all cost 1, so OSPF just counts hops and picks the slow top path. Raise the reference bandwidth or set costs by hand.
          </p>
        )}
        <p className="small ospf-rule">Lowest total cost wins. Only the outgoing interface on each hop counts.</p>
      </section>
      <p className={`w-feedback ${note.tone}`} aria-live="polite">{note.text}</p>

      <section className="ospf-editor" aria-label={`Edit ${selected}`}>
        <div className="ospf-editor-head">
          <strong>{sel.router} {sel.name}</strong>
          <span className="small subtle">{LINK_TYPES[selLink.kind].label}, {LINK_TYPES[selLink.kind].speed}, toward {selLink.ends.find((e) => e.router !== sel.router).router}</span>
        </div>
        <div className="ospf-editor-grid">
          <label className="ospf-field">
            <span className="xsmall subtle">bandwidth (what OSPF thinks the speed is)</span>
            <select
              className="select"
              value={selSet.bandwidth || ''}
              onChange={(e) => setIface(selected, { bandwidth: e.target.value ? Number(e.target.value) : null }, e.target.value ? `${selected} bandwidth set to ${Number(e.target.value).toLocaleString('en-US')} kbps.` : `${selected} bandwidth back to default.`)}
            >
              <option value="">Default ({LINK_TYPES[selLink.kind].speed})</option>
              {BANDWIDTH_OPTIONS.map((b) => <option key={b.kbps} value={b.kbps}>{b.label} (bandwidth {b.kbps})</option>)}
            </select>
          </label>
          <div className="ospf-field">
            <span className="xsmall subtle">Cost</span>
            <div className="w-pill-group" role="group" aria-label="Cost source">
              <button type="button" aria-pressed={sel.source === 'auto'} onClick={() => setIface(selected, { cost: null }, `${selected} cost is calculated again.`)}>Calculated</button>
              <button type="button" aria-pressed={sel.source === 'manual'} onClick={() => setIface(selected, { cost: Math.max(sel.auto, 10) }, `${selected} cost set by hand.`)}>ip ospf cost</button>
            </div>
          </div>
          {sel.source === 'manual' && (
            <label className="ospf-field">
              <span className="xsmall subtle">ip ospf cost (1 to 65535)</span>
              <CostInput key={selected} value={sel.cost} onCommit={(v) => setIface(selected, { cost: v }, `${selected} cost is ${v}.`)} />
            </label>
          )}
        </div>
        <p className="small ospf-formula">
          {sel.source === 'manual'
            ? `Set by hand to ${sel.cost}. The formula would give ${sel.auto}.`
            : `Cost = reference / bandwidth in kbps: ${sel.formula}.`}{' '}
          This cost counts only for packets leaving {sel.router} on {sel.iface}.
        </p>
      </section>

      <section className="ospf-spf" aria-label="Shortest path first, step by step">
        <div className="ospf-spf-controls">
          <strong className="ospf-spf-title">Dijkstra from R1</strong>
          <button type="button" className="btn btn-sm" onClick={() => stepSpf(-1)} disabled={!stepping || spfIdx === 0 || playing} aria-label="Previous SPF step"><StepBack size={14} /></button>
          {playing ? (
            <button type="button" className="btn btn-sm" onClick={pauseSpf}><Pause size={14} /> Pause</button>
          ) : (
            <button type="button" className="btn btn-sm" onClick={startSpf}><Play size={14} /> {stepping ? 'Play' : 'Run SPF'}</button>
          )}
          <button type="button" className="btn btn-sm btn-primary" onClick={() => stepSpf(1)} disabled={playing || (stepping && spfIdx >= result.trace.length - 1)}><StepForward size={14} /> Step</button>
          {stepping && <button type="button" className="btn btn-sm btn-ghost" onClick={exitSpf}>Done</button>}
          <div className="w-pill-group" role="group" aria-label="SPF speed">
            {SPEEDS.map((v) => (
              <button key={v} type="button" aria-pressed={speed === v} onClick={() => { playRef.current.speed = v; setSpeed(v) }}>{v}x</button>
            ))}
          </div>
        </div>
        <p className="small ospf-spf-caption" aria-live="polite">
          {stepping
            ? `Step ${spfIdx + 1} of ${result.trace.length}. ${spfCaption(step)}`
            : 'Every router runs this on its own copy of the map. Step through it to watch R1 settle the cheapest router each round.'}
        </p>
      </section>

      <div className="ospf-table-wrap">
        <table className="ospf-table">
          <caption className="xsmall subtle">Interface costs, like show ip ospf interface brief</caption>
          <thead>
            <tr><th scope="col">Interface</th><th scope="col">Bandwidth</th><th scope="col">Cost</th></tr>
          </thead>
          <tbody>
            {Object.values(ifs).map((i) => (
              <tr key={i.key} className={`${selected === i.key ? 'on' : ''}`} onClick={() => { sfx.tap(); setSelected(i.key) }}>
                <td>
                  <button type="button" className="ospf-row-btn" onClick={() => setSelected(i.key)} aria-pressed={selected === i.key}>{i.router} {i.iface}</button>
                </td>
                <td>{(i.kbps / 1000).toLocaleString('en-US')} Mbps{i.bandwidthSet ? ' *' : ''}</td>
                <td><strong>{i.cost}</strong>{i.source === 'manual' ? ' (set)' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="terminal ospf-term">
        <div className="terminal-bar"><span className="dot" /><span className="dot" /><span className="dot" />Commands for your changes</div>
        <div className="terminal-screen ospf-screen">
          {!cmds.length && <p className="terminal-line terminal-dim">! No changes yet. Every router uses auto-cost reference-bandwidth 100.</p>}
          {cmds.map((block) => (
            <div key={block.router} className="ospf-cmd-block">
              {block.router === 'every router' && <p className="terminal-line terminal-dim">! On every router, R1 to R5. The reference must match everywhere.</p>}
              {block.lines.map((l, i) =>
                l.output ? (
                  <p key={i} className="terminal-line terminal-out">{l.output}</p>
                ) : (
                  <p key={i} className="terminal-line"><span className="terminal-prompt">{block.router === 'every router' ? 'R1' : block.router}{l.mode}#</span> {l.cmd}</p>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <ul className="w-tasks">
        {[
          ['bottom', 'Make R1 send traffic to R4 over the bottom path', 'R1, R3, R5, R4: the fast Gigabit and 10 Gig links.'],
          ['ecmp', 'Bonus: make both paths cost the same', 'OSPF then load balances (up to 4 equal paths by default).'],
          ['spf', 'Step through SPF to the end', 'Watch the lowest-cost router settle each round.']
        ].map(([key, title, hint]) => (
          <li key={key} className={`w-task${tasks[key] ? ' done' : ''}`}>
            <span className="w-task-mark">{tasks[key] && <Check size={13} />}</span>
            <span>{title}<span className="w-task-hint">{hint}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
