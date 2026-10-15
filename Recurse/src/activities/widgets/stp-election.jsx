import { useRef, useState } from 'react'
import { Check, Crown, Network, Shuffle, X } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { normalizeMac } from '../lib/net'
import { useTokens } from '../lib/net-anim'
import { useNarrow } from '../lib/use-width'
import { Device, SpeedControl, Token } from '../lib/net-svg'
import { LONG_COST, PRESETS, PRIORITIES, SHORT_COST, SPEEDS, electStp, gradePrediction, linkCost, listPorts, portKey, presetTopology, showSpanningTree } from '../lib/stp-election'
import './stp-election.css'

const POSITIONS = {
  square: { SW1: { x: 95, y: 72 }, SW2: { x: 325, y: 72 }, SW3: { x: 95, y: 226 }, SW4: { x: 325, y: 226 } },
  triangle: { SW1: { x: 210, y: 64 }, SW2: { x: 340, y: 228 }, SW3: { x: 80, y: 228 } },
  parallel: { SW1: { x: 210, y: 64 }, SW2: { x: 340, y: 228 }, SW3: { x: 80, y: 228 } }
}
// Phone layouts (viewBox 0 0 300 390): taller and narrower, so labels can be big enough to read.
const PHONE_POSITIONS = {
  square: { SW1: { x: 52, y: 100 }, SW2: { x: 248, y: 100 }, SW3: { x: 52, y: 300 }, SW4: { x: 248, y: 300 } },
  triangle: { SW1: { x: 150, y: 100 }, SW2: { x: 246, y: 300 }, SW3: { x: 54, y: 300 } },
  parallel: { SW1: { x: 150, y: 100 }, SW2: { x: 246, y: 300 }, SW3: { x: 54, y: 300 } }
}
const SPEED_LABEL = { '10M': '10 Mb/s', '100M': '100 Mb/s', '1G': '1 Gb/s', '10G': '10 Gb/s' }
const ROLE_LETTER = { root: 'R', designated: 'D', blocked: 'B' }
const ROLE_FILL = { root: 'var(--accent)', designated: 'var(--good)', blocked: 'var(--bad)' }
const ROLE_NAME = { root: 'Root port', designated: 'Designated port', blocked: 'Blocked (alternate)' }

/** Endpoints of each link, nudged apart when two links join the same pair of switches. */
function linkGeometry(topology, pos, inset = 42) {
  const seen = {}
  const counts = {}
  for (const l of topology.links) {
    const pair = [l.a.sw, l.b.sw].sort().join('-')
    counts[pair] = (counts[pair] || 0) + 1
  }
  const out = {}
  for (const l of topology.links) {
    const pair = [l.a.sw, l.b.sw].sort().join('-')
    const index = (seen[pair] = (seen[pair] ?? -1) + 1)
    const offset = counts[pair] > 1 ? (index - (counts[pair] - 1) / 2) * 28 : 0
    const a = pos[l.a.sw]
    const b = pos[l.b.sw]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const ux = (b.x - a.x) / len
    const uy = (b.y - a.y) / len
    const nx = -uy * offset
    const ny = ux * offset
    const A = { x: a.x + nx, y: a.y + ny }
    const B = { x: b.x + nx, y: b.y + ny }
    out[l.id] = {
      A,
      B,
      mid: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 },
      portA: { x: A.x + ux * inset, y: A.y + uy * inset },
      portB: { x: B.x - ux * inset, y: B.y - uy * inset },
      normal: { x: -uy, y: ux }
    }
  }
  return out
}

const pillText = (l, phone) => (phone ? `${l.speed} · ${linkCost(l)}` : `${l.speed} cost ${linkCost(l)}`)
const pillWidth = (l, phone) => (phone ? pillText(l, true).length * 7.2 + 12 : pillText(l).length * 5.8 + 14)

const randomMac = () =>
  normalizeMac(
    Array.from({ length: 6 }, (_, i) => (i === 0 ? 0 : Math.floor(Math.random() * 256)).toString(16).padStart(2, '0')).join('')
  )

/** Predict the spanning tree, then converge and compare. */
export default function StpElection({ onComplete }) {
  const [preset, setPreset] = useState('square')
  const [topology, setTopology] = useState(() => presetTopology('square'))
  const [macDrafts, setMacDrafts] = useState({})
  const [predRoot, setPredRoot] = useState(null)
  const [predRootPorts, setPredRootPorts] = useState({})
  const [predBlocked, setPredBlocked] = useState({})
  const [phase, setPhase] = useState('predict')
  const [result, setResult] = useState(null)
  const [grade, setGrade] = useState(null)
  const [caption, setCaption] = useState('Start by predicting. Which switch has the lowest bridge ID?')
  const [speed, setSpeed] = useState(1)
  const [combo, setCombo] = useState(0)
  const [wins, setWins] = useState(0)
  const [showFor, setShowFor] = useState(null)
  const stageRef = useRef(null)
  const phone = useNarrow(stageRef)
  const { tokens, play, stop, busy } = useTokens()

  const pos = (phone ? PHONE_POSITIONS : POSITIONS)[preset]
  const geo = linkGeometry(topology, pos, phone ? 48 : 42)
  const ports = listPorts(topology)
  const roles = phase === 'done' && result ? result.roles : {}

  const invalidate = () => {
    stop()
    setPhase('predict')
    setResult(null)
    setGrade(null)
  }

  const loadPreset = (name) => {
    sfx.tap()
    setPreset(name)
    setTopology(presetTopology(name))
    setMacDrafts({})
    setPredRoot(null)
    setPredRootPorts({})
    setPredBlocked({})
    setCaption(`${PRESETS[name].label}. Predict the root bridge, each root port and the blocked port.`)
    invalidate()
  }

  const setPriority = (id, priority) => {
    sfx.tick()
    setTopology((t) => ({ ...t, switches: t.switches.map((s) => (s.id === id ? { ...s, priority } : s)) }))
    invalidate()
  }

  const setMacDraft = (id, text) => {
    setMacDrafts((d) => ({ ...d, [id]: text }))
    const mac = normalizeMac(text)
    if (mac) {
      setTopology((t) => ({ ...t, switches: t.switches.map((s) => (s.id === id ? { ...s, mac } : s)) }))
      invalidate()
    }
  }

  const setSpeedOf = (linkId, value) => {
    sfx.tick()
    setTopology((t) => ({ ...t, links: t.links.map((l) => (l.id === linkId ? { ...l, speed: value } : l)) }))
    invalidate()
  }

  const cycleSpeed = (linkId) => {
    const l = topology.links.find((x) => x.id === linkId)
    setSpeedOf(linkId, SPEEDS[(SPEEDS.indexOf(l.speed) + 1) % SPEEDS.length])
  }

  const shuffle = () => {
    sfx.flip()
    const choices = [4096, 8192, 24576, 32768, 32768, 32768]
    setTopology((t) => ({
      switches: t.switches.map((s) => ({ ...s, priority: choices[Math.floor(Math.random() * choices.length)], mac: randomMac() })),
      links: t.links.map((l) => ({ ...l, speed: ['100M', '1G', '1G', '10G'][Math.floor(Math.random() * 4)] }))
    }))
    setMacDrafts({})
    setPredRoot(null)
    setPredRootPorts({})
    setPredBlocked({})
    setCaption('New priorities, MACs and speeds. Predict again.')
    invalidate()
  }

  const nonRoot = topology.switches.filter((s) => s.id !== predRoot)
  const ready = predRoot && nonRoot.every((s) => predRootPorts[s.id])

  const converge = async () => {
    if (busy || !ready) return
    sfx.tap()
    const r = electStp(topology)
    setPhase('running')
    setResult(r)
    setGrade(null)
    const rootSw = r.root
    const segmentsFor = (wave, tone) =>
      wave.map((w, i) => {
        const l = topology.links.find((x) => x.id === w.linkId)
        const g = geo[w.linkId]
        const fromA = l.a.sw === w.from && l.a.port === w.fromPort
        return { id: `${w.linkId}-${w.from}-${i}`, from: fromA ? g.portA : g.portB, to: fromA ? g.portB : g.portA, tone }
      })
    const phases = r.waves.map((wave, i) => segmentsFor(wave, i === 0 ? 'ink' : 'accent'))
    const captions = [
      'Every switch boots up believing it is the root, and sends BPDUs with its own bridge ID as the root ID.',
      `${rootSw} has the lowest bridge ID. Its BPDUs are superior, so the others stop claiming root and listen to ${rootSw}.`,
      'Each switch relays the root BPDU out its designated ports, adding its own root path cost.',
      'The root BPDU reaches the far side of the topology.'
    ]
    setCaption(captions[0])
    const ok = await play(phases, {
      duration: 900 / speed,
      onPhase: (i) => {
        sfx.pop()
        if (i + 1 < phases.length) setCaption(captions[Math.min(i + 1, captions.length - 1)])
      }
    })
    if (!ok) return
    const g = gradePrediction(r, {
      root: predRoot,
      rootPorts: predRootPorts,
      blocked: Object.values(predBlocked).filter((v) => v && v !== 'none')
    })
    setGrade(g)
    setPhase('done')
    setShowFor(r.root)
    if (g.allCorrect) {
      feedbackCorrect(stageRef.current, { combo })
      setCombo((c) => c + 1)
      setWins((w) => w + 1)
      setCaption(`Converged, and your prediction was spot on. ${r.blocked.length ? `Blocking ${r.blocked.map((k) => k.replace(':', ' ')).join(' and ')} breaks the loop.` : ''}`)
      onComplete({ score: 1, detail: 'Predicted the spanning tree' })
    } else {
      setCombo(0)
      feedbackWrong(stageRef.current)
      setCaption(`Converged. ${Math.round(g.score * 100)}% of your prediction was right. Read the reasons below, then change something and predict again.`)
    }
  }

  const portOptions = (swId) => ports.filter((p) => p.sw === swId)
  const mark = (ok) => (ok ? <Check size={14} className="stp-ok" aria-label="correct" /> : <X size={14} className="stp-bad" aria-label="wrong" />)

  return (
    <div className="stp">
      <div className="w-toolbar">
        <label className="stp-inline">
          <Network size={14} />
          <select className="select" value={preset} onChange={(e) => loadPreset(e.target.value)} disabled={busy} aria-label="Topology">
            {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-sm btn-ghost" onClick={shuffle} disabled={busy}><Shuffle size={14} /> Shuffle</button>
        <span className="grow" />
        {wins > 0 && <span className="chip good">{wins} correct</span>}
        <SpeedControl speed={speed} onChange={setSpeed} />
      </div>

      <div className="w-stage grid-bg stp-stage" ref={stageRef}>
        <svg viewBox={phone ? '0 0 300 390' : '0 0 420 300'} className={`stp-svg${phone ? ' phone' : ''}`} role="img" aria-label={`Spanning tree topology with ${topology.switches.length} switches. ${phase === 'done' && result ? `Root bridge ${result.root}. Blocked: ${result.blocked.join(', ') || 'none'}.` : 'Not converged yet.'}`}>
          {topology.links.map((l) => {
            const g = geo[l.id]
            const blockedHere = phase === 'done' && result?.links[l.id].blocked
            return (
              <g key={l.id}>
                <line x1={g.A.x} y1={g.A.y} x2={g.B.x} y2={g.B.y} className={`stp-link${blockedHere ? ' blocked' : ''}${l.speed === '10G' ? ' fast' : ''}`} />
                <g className="stp-cost" transform={`translate(${g.mid.x} ${g.mid.y})`} onClick={() => !busy && cycleSpeed(l.id)}>
                  {phone && <rect className="stp-cost-hit" x={-pillWidth(l, true) / 2 - 4} y="-20" width={pillWidth(l, true) + 8} height="40" />}
                  <rect x={-pillWidth(l, phone) / 2} y={phone ? -13 : -11} width={pillWidth(l, phone)} height={phone ? 26 : 22} rx={phone ? 13 : 11} />
                  <text y={phone ? 4.5 : 4} textAnchor="middle">{pillText(l, phone)}</text>
                </g>
              </g>
            )
          })}
          {topology.links.flatMap((l) =>
            [
              [l.a, geo[l.id].portA],
              [l.b, geo[l.id].portB]
            ].map(([end, p]) => {
              const key = portKey(end.sw, end.port)
              const role = roles[key]
              const predicted = !role && (predRootPorts[end.sw] === key ? 'root' : predBlocked[l.id] === key ? 'blocked' : null)
              const n = geo[l.id].normal
              return (
                <g key={key} className={`stp-port${role ? ' revealed' : ''}`}>
                  <circle cx={p.x} cy={p.y} r={phone ? 11 : 9.5} style={{ fill: role ? ROLE_FILL[role] : 'var(--card)', stroke: role ? ROLE_FILL[role] : predicted ? ROLE_FILL[predicted] : 'var(--rule-strong)', strokeWidth: 1.8, strokeDasharray: predicted ? '3 2' : undefined }} />
                  <text x={p.x} y={p.y + (phone ? 4.5 : 3.5)} textAnchor="middle" className="stp-port-letter" style={{ fill: role ? 'var(--card)' : predicted ? ROLE_FILL[predicted] : 'var(--ink-3)' }}>
                    {role ? ROLE_LETTER[role] : predicted ? `${ROLE_LETTER[predicted]}?` : ''}
                  </text>
                  <text x={p.x + n.x * (phone ? 26 : 18)} y={p.y + n.y * (phone ? 22 : 18) + 4} textAnchor="middle" className="stp-port-name">{end.port}</text>
                </g>
              )
            })
          )}
          {topology.switches.map((s) => {
            const p = pos[s.id]
            const top = p.y < 150
            const isRoot = phase === 'done' && result?.root === s.id
            if (phone) {
              // Name, priority and MAC on separate lines; the crown is left out because "(root)" says it.
              const lines = [s.id + (isRoot ? ' (root)' : ''), String(s.priority), s.mac]
              const cost = phase === 'done' && result && !isRoot ? `root cost ${result.rootCost[s.id]}` : null
              const y0 = top ? p.y - 49 : p.y + 36
              return (
                <g key={s.id}>
                  <Device kind="switch" x={p.x} y={p.y} w={52} h={28} state={isRoot ? 'good' : predRoot === s.id ? 'active' : 'idle'} />
                  <text x={p.x} y={y0} textAnchor="middle" className="stp-name">{lines[0]}</text>
                  <text x={p.x} y={y0 + 14} textAnchor="middle" className="stp-bid">{lines[1]}</text>
                  <text x={p.x} y={y0 + 28} textAnchor="middle" className="stp-bid">{lines[2]}</text>
                  {cost && <text x={p.x} y={top ? y0 - 15 : y0 + 43} textAnchor="middle" className="stp-cost-to-root">{cost}</text>}
                </g>
              )
            }
            return (
              <g key={s.id}>
                <Device kind="switch" x={p.x} y={p.y} w={58} h={30} state={isRoot ? 'good' : predRoot === s.id ? 'active' : 'idle'} />
                <text x={p.x} y={top ? p.y - 36 : p.y + 34} textAnchor="middle" className="stp-name">{s.id}{isRoot ? ' (root)' : ''}</text>
                <text x={p.x} y={top ? p.y - 23 : p.y + 47} textAnchor="middle" className="stp-bid">{s.priority} · {s.mac}</text>
                {isRoot && (
                  <g transform={`translate(${p.x + 32} ${p.y - 20})`} className="stp-crown">
                    <circle r="10" style={{ fill: 'var(--warn)' }} />
                    <path d="M-5 3 L-5 -3 L-2 0 L0 -4 L2 0 L5 -3 L5 3 Z" style={{ fill: 'var(--card)' }} />
                  </g>
                )}
                {phase === 'done' && result && !isRoot && (
                  <text x={p.x} y={top ? p.y - 49 : p.y + 60} textAnchor="middle" className="stp-cost-to-root">root cost {result.rootCost[s.id]}</text>
                )}
              </g>
            )
          })}
          {tokens.map((t) => <Token key={t.id} token={t} size={0.85} />)}
        </svg>
        <div className="w-legend">
          {Object.entries(ROLE_NAME).map(([role, name]) => (
            <span key={role}><i style={{ background: ROLE_FILL[role] }} />{ROLE_LETTER[role]} = {name}</span>
          ))}
          <span>Tap a link to change its speed</span>
        </div>
      </div>
      <p className="w-feedback" aria-live="polite">{caption}</p>

      <div className="stp-panels">
        <section className="stp-panel" aria-labelledby="stp-predict-h">
          <h4 id="stp-predict-h" className="stp-h">1. Predict</h4>
          <div className="stp-row">
            <span className="stp-label">Root bridge {grade && mark(grade.root)}</span>
            <div className="w-pill-group" role="group" aria-label="Predicted root bridge">
              {topology.switches.map((s) => (
                <button key={s.id} type="button" aria-pressed={predRoot === s.id} disabled={busy} onClick={() => { sfx.tap(); setPredRoot(s.id); invalidate() }}>
                  {s.id}
                </button>
              ))}
            </div>
          </div>
          {predRoot && nonRoot.map((s) => (
            <label key={s.id} className="stp-row">
              <span className="stp-label">{s.id} root port {grade && grade.rootPorts[s.id] !== undefined && mark(grade.rootPorts[s.id])}</span>
              <select className="select" value={predRootPorts[s.id] || ''} disabled={busy} onChange={(e) => { sfx.tick(); setPredRootPorts((p) => ({ ...p, [s.id]: e.target.value })); invalidate() }}>
                <option value="">Choose a port</option>
                {portOptions(s.id).map((p) => <option key={p.key} value={p.key}>{p.port} (to {p.other.sw})</option>)}
              </select>
            </label>
          ))}
          <p className="stp-sub">Which end of each link blocks? {grade && mark(grade.blocked)}</p>
          {topology.links.map((l) => (
            <label key={l.id} className="stp-row">
              <span className="stp-label">{l.a.sw} {l.a.port} to {l.b.sw} {l.b.port}</span>
              <select className="select" value={predBlocked[l.id] || 'none'} disabled={busy} onChange={(e) => { sfx.tick(); setPredBlocked((p) => ({ ...p, [l.id]: e.target.value })); invalidate() }}>
                <option value="none">Neither end</option>
                <option value={portKey(l.a.sw, l.a.port)}>{l.a.sw} {l.a.port} blocks</option>
                <option value={portKey(l.b.sw, l.b.port)}>{l.b.sw} {l.b.port} blocks</option>
              </select>
            </label>
          ))}
          <button type="button" className="btn btn-primary stp-go" onClick={converge} disabled={!ready || busy}>
            <Crown size={16} /> {busy ? 'Converging...' : 'Converge'}
          </button>
          {!ready && <p className="stp-sub">Pick a root bridge and a root port for every other switch first.</p>}
        </section>

        <section className="stp-panel" aria-labelledby="stp-config-h">
          <h4 id="stp-config-h" className="stp-h">2. Change the network</h4>
          {topology.switches.map((s) => {
            const draft = macDrafts[s.id] ?? s.mac
            const bad = !normalizeMac(draft)
            return (
              <div key={s.id} className="stp-switch-row">
                <strong>{s.id}</strong>
                <label>
                  <span className="stp-mini">Priority</span>
                  <select className="select" value={s.priority} disabled={busy} onChange={(e) => setPriority(s.id, Number(e.target.value))}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}{p === 32768 ? ' (default)' : ''}</option>)}
                  </select>
                </label>
                <label>
                  <span className="stp-mini">MAC</span>
                  <input className={`input mono${bad ? ' is-wrong' : ''}`} value={draft} disabled={busy} spellCheck="false" autoComplete="off" onChange={(e) => setMacDraft(s.id, e.target.value)} aria-invalid={bad || undefined} />
                </label>
              </div>
            )
          })}
          {topology.links.map((l) => (
            <label key={l.id} className="stp-row">
              <span className="stp-label">{l.a.sw} to {l.b.sw}</span>
              <select className="select" value={l.speed} disabled={busy} onChange={(e) => setSpeedOf(l.id, e.target.value)}>
                {SPEEDS.map((sp) => <option key={sp} value={sp}>{SPEED_LABEL[sp]}, cost {SHORT_COST[sp]}</option>)}
              </select>
            </label>
          ))}
          <table className="stp-costs">
            <caption>Port cost by speed</caption>
            <thead><tr><th scope="col">Speed</th><th scope="col">Short (802.1D)</th><th scope="col">Long (802.1t)</th></tr></thead>
            <tbody>
              {SPEEDS.map((sp) => <tr key={sp}><td>{SPEED_LABEL[sp]}</td><td>{SHORT_COST[sp]}</td><td>{LONG_COST[sp].toLocaleString('en-US')}</td></tr>)}
            </tbody>
          </table>
          <p className="stp-sub">Priority goes in steps of 4096 because the low 12 bits of the field carry the VLAN ID (the extended system ID). That is why show spanning-tree prints 32769 for VLAN 1.</p>
        </section>
      </div>

      {phase === 'done' && result && (
        <section className="stp-results" aria-live="polite">
          <h4 className="stp-h">Why the tree came out this way</h4>
          <ol className="stp-reasons">
            {result.explanations.map((line, i) => <li key={i} style={{ animationDelay: `${i * 60}ms` }}>{line}</li>)}
          </ol>
          <div className="stp-show">
            <div className="w-pill-group" role="group" aria-label="Show spanning-tree for">
              {topology.switches.map((s) => (
                <button key={s.id} type="button" aria-pressed={showFor === s.id} onClick={() => setShowFor(s.id)}>{s.id}</button>
              ))}
            </div>
            {showFor && (
              <div className="terminal">
                <div className="terminal-bar"><span className="dot" /><span className="dot" /><span className="dot" />{showFor}# show spanning-tree vlan 1</div>
                <pre className="terminal-screen stp-pre">{showSpanningTree(topology, result, showFor).join('\n')}</pre>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
