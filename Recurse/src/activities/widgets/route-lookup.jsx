import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowRight, Binary, Shuffle, Trash2 } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import {
  IFACE_NEIGHBOR,
  QUESTIONS,
  andMath,
  exitInterface,
  explain,
  gatewayLine,
  gradePick,
  lookup,
  parseIp,
  routeLabel,
  routeText,
  shuffled,
  tableFor,
  tableRows
} from '../lib/route-lookup'
import { useNarrow } from '../lib/use-width'
import './route-lookup.css'

const GOAL = 5

// Diagram coordinates (viewBox 0 0 360 160).
const POS = {
  r1: { x: 180, y: 80 },
  isp: { x: 52, y: 34 },
  lan: { x: 52, y: 126 },
  r2: { x: 308, y: 34 },
  r3: { x: 308, y: 126 }
}
// Phone diagram (viewBox 0 0 300 262): the same star, taller, with names and addresses on two lines.
const PHONE_POS = {
  r1: { x: 150, y: 130 },
  isp: { x: 62, y: 54 },
  lan: { x: 62, y: 206 },
  r2: { x: 238, y: 54 },
  r3: { x: 238, y: 206 }
}
const NEIGHBORS = [
  { id: 'isp', iface: 'Gi0/3', lines: ['ISP', '203.0.113.1'] },
  { id: 'lan', iface: 'Gi0/0', lines: ['LAN', '192.168.10.0/24'] },
  { id: 'r2', iface: 'Gi0/1', lines: ['R2', '10.0.12.2'] },
  { id: 'r3', iface: 'Gi0/2', lines: ['R3', '10.0.13.2'] }
]

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const at = (p, dy = 0) => `translate(${p.x}px, ${p.y + dy}px)`

function RouterGlyph({ x, y, active }) {
  return (
    <g className={`route-dev${active ? ' active' : ''}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r="19" className="route-dev-body" />
      <path className="route-dev-mark" d="M0 -4 V-13 M-3.5 -9.5 L0 -13 L3.5 -9.5 M0 4 V13 M-3.5 9.5 L0 13 L3.5 9.5 M-13 0 H-4 M-7.5 -3.5 L-4 0 L-7.5 3.5 M13 0 H4 M7.5 -3.5 L4 0 L7.5 3.5" />
    </g>
  )
}

function SwitchGlyph({ x, y, active }) {
  return (
    <g className={`route-dev${active ? ' active' : ''}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x="-24" y="-13" width="48" height="26" rx="5" className="route-dev-body" />
      <path className="route-dev-mark" d="M-14 -5 H14 M10 -8.5 L14 -5 L10 -1.5 M14 5 H-14 M-10 1.5 L-14 5 L-10 8.5" />
    </g>
  )
}

function CloudGlyph({ x, y, active }) {
  return (
    <g className={`route-dev${active ? ' active' : ''}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      <path className="route-dev-body" d="M-20 11 C-32 11 -32 -5 -19 -4 C-18 -15 -2 -17 2 -9 C9 -17 23 -12 21 -2 C32 -2 32 11 20 11 Z" />
    </g>
  )
}

/** R1 with its four neighbors; the exit link lights up and the packet flies out of it. */
function Topology({ exit, outcome, packetRef, phone }) {
  const POS_ = phone ? PHONE_POS : POS
  return (
    <svg className={`route-topo${phone ? ' phone' : ''}`} viewBox={phone ? '0 0 300 262' : '0 0 360 160'} role="img" aria-label="Router R1 with four neighbors: the ISP on Gi0/3, the LAN on Gi0/0, R2 on Gi0/1 and R3 on Gi0/2.">
      {NEIGHBORS.map((n) => (
        <line key={n.id} x1={POS_.r1.x} y1={POS_.r1.y} x2={POS_[n.id].x} y2={POS_[n.id].y} className={`route-link${exit === n.id ? ' active' : ''}`} />
      ))}
      {NEIGHBORS.map((n) => {
        const p = POS_[n.id]
        let lx = POS_.r1.x + (p.x - POS_.r1.x) * 0.36
        let ly = POS_.r1.y + (p.y - POS_.r1.y) * 0.36 + (p.y < POS_.r1.y ? -6 : 12)
        if (phone) {
          // Beside the link, toward the middle, far enough that the label never sits on the line.
          const dx = p.x - POS_.r1.x
          const dy = p.y - POS_.r1.y
          const len = Math.hypot(dx, dy)
          const nx = (Math.sign(-dx) * Math.abs(dy)) / len
          const ny = (Math.sign(dy) * Math.abs(dx)) / len
          const off = 6 + 18.5 * Math.abs(nx) + 6 * Math.abs(ny)
          lx = POS_.r1.x + dx * 0.45 + nx * off
          ly = POS_.r1.y + dy * 0.45 + ny * off + 4
        }
        return (
          <text key={`if-${n.id}`} x={lx} y={ly} className={`route-iface${exit === n.id ? ' active' : ''}`} textAnchor="middle">
            {n.iface}
          </text>
        )
      })}
      <CloudGlyph x={POS_.isp.x} y={POS_.isp.y} active={exit === 'isp'} />
      <SwitchGlyph x={POS_.lan.x} y={POS_.lan.y} active={exit === 'lan'} />
      <RouterGlyph x={POS_.r2.x} y={POS_.r2.y} active={exit === 'r2'} />
      <RouterGlyph x={POS_.r3.x} y={POS_.r3.y} active={exit === 'r3'} />
      <RouterGlyph x={POS_.r1.x} y={POS_.r1.y} active={outcome === 'local'} />
      <text x={POS_.r1.x} y={POS_.r1.y + 34} className="route-dev-name" textAnchor="middle">R1</text>
      {NEIGHBORS.map((n) => {
        const p = POS_[n.id]
        const below = p.y > POS_.r1.y
        if (phone) {
          return (
            <text key={`lb-${n.id}`} x={p.x} y={below ? p.y + 34 : p.y - 38} className="route-dev-name" textAnchor="middle">
              <tspan>{n.lines[0]}</tspan>
              <tspan x={p.x} dy="15" className="route-dev-sub">{n.lines[1]}</tspan>
            </text>
          )
        }
        return (
          <text key={`lb-${n.id}`} x={p.x} y={below ? p.y + 28 : p.y - 22} className="route-dev-name" textAnchor="middle">
            <tspan>{n.lines[0]} </tspan>
            <tspan className="route-dev-sub">{n.lines[1]}</tspan>
          </text>
        )
      })}
      <g ref={packetRef} className={`route-packet${outcome === 'drop' ? ' dropped' : ''}`} style={{ opacity: 0 }} aria-hidden="true">
        <rect x="-10" y="-7" width="20" height="14" rx="3" />
        <path d="M-9 -5.5 L0 1 L9 -5.5" />
      </g>
    </svg>
  )
}

/** The AND-with-mask working for one route. */
function MathPanel({ route, ip }) {
  const m = andMath(route, ip)
  return (
    <div className="route-math" aria-live="polite">
      <p className="small route-math-intro">
        Does <code>{routeLabel(route)}</code> match? AND the destination with the mask, then compare the result with the route&apos;s network. Bits in color are the network part.
      </p>
      <div className="route-math-grid">
        {m.rows.map((row, i) => (
          <div key={row.label} className={`route-math-row${i === 2 ? ' result' : ''}`} style={{ '--i': i }}>
            <span className="route-math-label">{row.label}</span>
            <span className="route-math-dotted">{row.dotted}</span>
            <span className="route-math-bits" aria-hidden="true">
              {row.bits.map((octet, o) => (
                <span key={o} className="route-octet">
                  {[...octet].map((b, k) => (
                    <span key={k} className={o * 8 + k < m.prefix ? 'net' : 'host'}>{b}</span>
                  ))}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className={`route-math-verdict ${m.matches ? 'good' : 'bad'}`}>
        {m.matches ? 'The result equals the route’s network, so this route matches.' : 'The result is different from the route’s network, so this route does not match.'}
      </p>
    </div>
  )
}

/** Pick the route a router uses: longest prefix, then administrative distance, then metric. */
export default function RouteLookup({ onComplete, standalone }) {
  const [mode, setMode] = useState('drill')
  const [order, setOrder] = useState(() => QUESTIONS.map((_, i) => i))
  const [step, setStep] = useState(0)
  const [answer, setAnswer] = useState(null)
  const [solved, setSolved] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [combo, setCombo] = useState(0)
  const [mathFor, setMathFor] = useState(null)
  const [showMath, setShowMath] = useState(false)
  const [exploreText, setExploreText] = useState('10.1.1.25')
  const [exploreNoDefault, setExploreNoDefault] = useState(false)
  const [flight, setFlight] = useState({ exit: null, outcome: null })
  const stageRef = useRef(null)
  const phone = useNarrow(stageRef)
  const packetRef = useRef(null)
  const doneRef = useRef(false)

  const question = QUESTIONS[order[step % order.length]]
  const drillRoutes = useMemo(() => tableFor(question), [question])
  const drillIp = parseIp(question.ip)

  const exploreIp = parseIp(exploreText)
  const exploreRoutes = useMemo(() => tableFor({ noDefault: exploreNoDefault }), [exploreNoDefault])

  const routes = mode === 'drill' ? drillRoutes : exploreRoutes
  const ip = mode === 'drill' ? drillIp : exploreIp
  const revealed = mode === 'explore' ? ip !== null : answer !== null
  const result = useMemo(() => (ip === null ? null : lookup(routes, ip)), [routes, ip])
  const rows = useMemo(() => tableRows(routes), [routes])
  const lines = useMemo(() => (revealed && ip !== null ? explain(routes, ip) : []), [revealed, routes, ip])

  const winnerId = result?.winners[0] || null
  const winner = routes.find((r) => r.id === winnerId) || null
  const mathRoute = routes.find((r) => r.id === mathFor) || winner

  const fly = useCallback((routeList, res) => {
    const node = packetRef.current
    const win = routeList.find((r) => r.id === res.winners[0])
    let outcome = 'forward'
    let exit = null
    if (!win) outcome = 'drop'
    else if (win.code === 'L') outcome = 'local'
    else exit = IFACE_NEIGHBOR[exitInterface(routeList, win)] || null
    setFlight({ exit, outcome })
    if (!node?.animate) return
    node.getAnimations().forEach((a) => a.cancel())
    const quick = reducedMotion()
    const start = (phone ? PHONE_POS : POS).r1
    let frames
    if (outcome === 'drop') {
      frames = [
        { transform: `${at(start)} scale(0.4)`, opacity: 0 },
        { transform: `${at(start)} scale(1.15)`, opacity: 1, offset: 0.3 },
        { transform: `${at(start, 30)} scale(0.9)`, opacity: 0 }
      ]
    } else if (outcome === 'local') {
      frames = [
        { transform: `${at(start, -40)} scale(0.6)`, opacity: 0 },
        { transform: `${at(start, -30)} scale(1)`, opacity: 1, offset: 0.4 },
        { transform: `${at(start)} scale(0.5)`, opacity: 0 }
      ]
    } else {
      const end = (phone ? PHONE_POS : POS)[exit] || start
      frames = [
        { transform: `${at(start)} scale(0.4)`, opacity: 0 },
        { transform: `${at(start)} scale(1.1)`, opacity: 1, offset: 0.2 },
        { transform: `${at(end)} scale(1)`, opacity: 1, offset: 0.9 },
        { transform: `${at(end)} scale(0.6)`, opacity: 0 }
      ]
    }
    const anim = node.animate(frames, { duration: quick ? 160 : 1100, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' })
    anim.finished.then(() => outcome !== 'drop' && sfx.pop(), () => {})
  }, [])

  const pick = (id) => {
    if (mode === 'explore' || answer) {
      if (id === 'drop') return
      sfx.tap()
      setMathFor(id)
      setShowMath(true)
      return
    }
    const graded = gradePick(drillRoutes, drillIp, id)
    setAnswer({ pick: id, ...graded })
    setAttempts((n) => n + 1)
    setMathFor(null)
    fly(drillRoutes, lookup(drillRoutes, drillIp))
    if (graded.correct) {
      const next = solved + 1
      setSolved(next)
      setCombo((c) => c + 1)
      feedbackCorrect(stageRef.current, { combo })
      if (next >= GOAL && !doneRef.current) {
        doneRef.current = true
        onComplete?.({ score: Math.min(1, next / (attempts + 1)) })
      }
    } else {
      setCombo(0)
      feedbackWrong(stageRef.current)
    }
  }

  const next = () => {
    sfx.tap()
    setAnswer(null)
    setMathFor(null)
    setShowMath(false)
    setFlight({ exit: null, outcome: null })
    packetRef.current?.getAnimations?.().forEach((a) => a.cancel())
    if (step + 1 >= order.length) {
      setOrder((o) => (standalone ? shuffled(o) : o))
      setStep(0)
    } else setStep((s) => s + 1)
  }

  const switchMode = (m) => {
    if (m === mode) return
    sfx.tap()
    setMode(m)
    setMathFor(null)
    setFlight({ exit: null, outcome: null })
    packetRef.current?.getAnimations?.().forEach((a) => a.cancel())
  }

  const rowState = (route) => {
    if (!revealed || !result) return ''
    if (result.winners.includes(route.id)) return 'win'
    if (result.matches.includes(route.id)) return 'match'
    return 'miss'
  }

  const badge = (route) => {
    const state = rowState(route)
    const parts = []
    if (mode === 'drill' && answer?.pick === route.id) parts.push('your pick')
    if (state === 'win') parts.push(result.winners.length > 1 ? 'used, load balanced' : 'used')
    else if (state === 'match') parts.push(`matches /${route.prefix}`)
    return parts.join(' · ')
  }

  const feedback = (() => {
    if (mode === 'explore') {
      if (ip === null) return { tone: 'bad', text: 'Type a valid IPv4 address, like 10.1.1.20.' }
      return { tone: '', text: winner ? `R1 uses ${winner.code} ${routeLabel(winner)}.` : 'No route matches, so R1 drops it.' }
    }
    if (!answer) return { tone: '', text: '' }
    if (answer.correct) {
      return { tone: 'good', text: winner ? `Right: ${winner.code} ${routeLabel(winner)} wins.` : 'Right: nothing matches, so the packet is dropped.' }
    }
    return { tone: 'bad', text: `Not quite. ${answer.why}` }
  })()

  return (
    <div className="route">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'drill'} onClick={() => switchMode('drill')}>Drill</button>
          <button type="button" aria-pressed={mode === 'explore'} onClick={() => switchMode('explore')}>Explore</button>
        </div>
        <span className="grow" />
        {mode === 'drill' && <span className="chip outline tabular">{Math.min(solved, GOAL)} / {GOAL}</span>}
        {mode === 'drill' && combo >= 2 && <span className="chip accent">{combo} in a row</span>}
        {mode === 'drill' && standalone && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setOrder((o) => shuffled(o)); setStep(0); setAnswer(null); setFlight({ exit: null, outcome: null }) }}>
            <Shuffle size={14} /> Shuffle
          </button>
        )}
      </div>

      <div className="w-stage route-stage" ref={stageRef}>
        {mode === 'drill' ? (
          <div className="route-question">
            <span className="route-q-label">Packet for</span>
            <strong className="route-q-ip">{question.ip}</strong>
            <span className="small subtle route-q-focus">{question.focus} Pick the route R1 uses{question.noDefault ? ', or drop it' : ''}.</span>
          </div>
        ) : (
          <div className="route-explore">
            <label className="route-explore-field">
              <span className="xsmall subtle">Destination</span>
              <input
                className={`input mono${exploreIp === null ? ' is-wrong' : ''}`}
                value={exploreText}
                onChange={(e) => { setExploreText(e.target.value); setMathFor(null) }}
                spellCheck={false}
                inputMode="decimal"
                aria-label="Destination IP address"
              />
            </label>
            <label className="route-check">
              <input type="checkbox" checked={!exploreNoDefault} onChange={(e) => { setExploreNoDefault(!e.target.checked); setMathFor(null) }} />
              <span>Default route configured</span>
            </label>
            <button type="button" className="btn btn-sm" disabled={exploreIp === null} onClick={() => result && fly(exploreRoutes, result)}>
              <ArrowRight size={14} /> Send it
            </button>
          </div>
        )}
        <Topology exit={flight.exit} outcome={flight.outcome} packetRef={packetRef} phone={phone} />
      </div>

      <div className="terminal route-term">
        <div className="terminal-bar"><span className="dot" /><span className="dot" /><span className="dot" />R1 console</div>
        <div className="terminal-screen route-screen">
          <p className="terminal-line"><span className="terminal-prompt">R1#</span> show ip route</p>
          <p className="terminal-line terminal-dim">Codes: L - local, C - connected, S - static, O - OSPF, * - candidate default</p>
          <p className="terminal-line terminal-dim route-note">! Every candidate is listed so you can compare them. The real output shows only the winner for each prefix.</p>
          <p className="terminal-line route-gw">{gatewayLine(routes)}</p>
          <div className="route-rows" role="list" aria-label="Routing table">
            {rows.map((row) =>
              row.type === 'header' ? (
                <p key={row.key} className="terminal-line route-header" role="listitem">{row.text}</p>
              ) : (
                <div key={row.route.id} role="listitem">
                  <button
                    type="button"
                    className={`route-row ${rowState(row.route)}${answer && answer.pick === row.route.id && mode === 'drill' ? (answer.correct ? ' picked-good' : ' picked-bad') : ''}${mathRoute && revealed && mathRoute.id === row.route.id ? ' focused' : ''}`}
                    onClick={() => pick(row.route.id)}
                    aria-label={`${row.route.code} ${routeText(row.route)}${badge(row.route) ? `, ${badge(row.route)}` : ''}`}
                  >
                    <span className="route-code">{row.route.code}</span>
                    <span className={`route-text${row.indent ? ' indent' : ''}`}>{routeText(row.route)}</span>
                    {badge(row.route) && <span className="route-badge">{badge(row.route)}</span>}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      <div className="row wrap route-actions">
        {mode === 'drill' && !answer && (
          <button type="button" className="btn" onClick={() => pick('drop')}>
            <Trash2 size={15} /> No route: drop it
          </button>
        )}
        {mode === 'drill' && answer && (
          <button type="button" className="btn btn-primary" onClick={next}>
            Next packet <ArrowRight size={15} />
          </button>
        )}
      </div>

      <p className={`w-feedback ${feedback.tone}`} aria-live="polite">{feedback.text}</p>

      {revealed && lines.length > 0 && (
        <ol className="route-explain">
          {lines.map((line, i) => (
            <li key={i} style={{ '--i': i }}>{line}</li>
          ))}
        </ol>
      )}

      {revealed && mathRoute && ip !== null && (
        <div className="route-math-wrap">
          <button type="button" className="btn btn-sm" aria-expanded={showMath} onClick={() => { sfx.tap(); setShowMath((v) => !v) }}>
            <Binary size={15} /> {showMath ? 'Hide' : 'Show'} the AND math for {mathRoute.code} {routeLabel(mathRoute)}
          </button>
          {showMath && <MathPanel route={mathRoute} ip={ip} />}
          {showMath && <p className="xsmall subtle">Tip: select any route in the table to check its math.</p>}
        </div>
      )}
    </div>
  )
}
