import { useMemo, useRef, useState } from 'react'
import { Check, Pause, Play, RotateCcw, StepBack, StepForward } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { ADDR, CHECKPOINTS, buildSteps, changedFields, formatDuration, leaseTimers, relayConfig } from '../lib/dhcp-dora'
import { useNarrow } from '../lib/use-width'
import './dhcp-dora.css'

// Diagram (viewBox 0 0 400 200).
const NODES = {
  client: { x: 46, y: 58 },
  pc2: { x: 46, y: 150 },
  sw: { x: 124, y: 104 },
  r1: { x: 222, y: 104 },
  server: { x: 352, y: 104 }
}
// Phone diagram (viewBox 0 0 300 352): the same network stood on end, with labels big enough to read.
const PHONE_NODES = {
  client: { x: 64, y: 86 },
  pc2: { x: 236, y: 86 },
  sw: { x: 150, y: 152 },
  r1: { x: 150, y: 228 },
  server: { x: 150, y: 314 }
}
const SPEEDS = [0.5, 1, 2]
const MSG_NAME = { Discover: 'Discover', Offer: 'Offer', Request: 'Request', Ack: 'Acknowledge' }

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const wait = (ms, speed = 1) => new Promise((r) => setTimeout(r, reducedMotion() ? 60 : ms / speed))
const tr = (p, dy = 0) => `translate(${p.x}px, ${p.y + dy}px)`

function cancel(node) {
  node?.getAnimations?.().forEach((a) => a.cancel())
}

function fly(node, pts, speed, { fade = false } = {}) {
  if (!node?.animate || pts.length < 2) return Promise.resolve()
  cancel(node)
  const d = [0]
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = d[d.length - 1] || 1
  const frames = pts.map((p, i) => ({ transform: tr(p), opacity: fade && i === pts.length - 1 ? 0 : 1, offset: d[i] / total }))
  const duration = reducedMotion() ? 120 : Math.max(450, (total * 6) / speed)
  return node.animate(frames, { duration, easing: 'cubic-bezier(0.4, 0, 0.3, 1)', fill: 'forwards' }).finished.catch(() => {})
}

function place(node, p) {
  if (!node?.animate) return
  cancel(node)
  node.animate([{ transform: tr(p), opacity: 1 }, { transform: tr(p), opacity: 1 }], { duration: 1, fill: 'forwards' })
}

function hide(node) {
  if (!node?.animate) return
  cancel(node)
  node.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' })
}

function dropAt(node, p) {
  if (!node?.animate) return Promise.resolve()
  cancel(node)
  return node
    .animate(
      [
        { transform: `${tr(p)} scale(1)`, opacity: 1 },
        { transform: `${tr(p)} scale(1.25)`, opacity: 1, offset: 0.25 },
        { transform: `${tr(p, 34)} rotate(25deg) scale(0.8)`, opacity: 0 }
      ],
      { duration: reducedMotion() ? 120 : 800, easing: 'ease-in', fill: 'forwards' }
    )
    .finished.catch(() => {})
}

function Router({ x, y, relay, active, phone }) {
  return (
    <g className={`dhcp-dev${active ? ' active' : ''}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r="20" className="dhcp-dev-body" />
      <path className="dhcp-dev-mark" d="M0 -4 V-13 M-3.5 -9.5 L0 -13 L3.5 -9.5 M0 4 V13 M-3.5 9.5 L0 13 L3.5 9.5 M-13 0 H-4 M-7.5 -3.5 L-4 0 L-7.5 3.5 M13 0 H4 M7.5 -3.5 L4 0 L7.5 3.5" />
      {phone ? (
        <>
          <text x="-30" y="5" className="dhcp-dev-name" textAnchor="end">R1</text>
          <text x="28" y="6" className={`dhcp-helper ${relay ? 'on' : 'off'}`}>{relay ? 'helper 10.0.0.10' : 'no helper'}</text>
          <text x="24" y="-20" className="dhcp-if">Gi0/0 .10.1</text>
          <text x="24" y="36" className="dhcp-if">Gi0/1 10.0.0.1</text>
        </>
      ) : (
        <>
          <text y="36" className="dhcp-dev-name" textAnchor="middle">R1</text>
          <text y="48" className={`dhcp-helper ${relay ? 'on' : 'off'}`} textAnchor="middle">{relay ? 'helper 10.0.0.10' : 'no helper'}</text>
          <text x="-26" y="-26" className="dhcp-if" textAnchor="end">Gi0/0 .10.1</text>
          <text x="26" y="-26" className="dhcp-if" textAnchor="start">Gi0/1 10.0.0.1</text>
        </>
      )}
    </g>
  )
}

function Pc({ x, y, name, sub, active, phone }) {
  // On the phone layout the labels sit above the PC, clear of the links below it.
  return (
    <g className={`dhcp-dev${active ? ' active' : ''}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x="-15" y="-14" width="30" height="20" rx="3" className="dhcp-dev-body" />
      <path className="dhcp-dev-mark" d="M0 6 V11 M-7 12 H7" />
      <text y={phone ? -37 : 26} className="dhcp-dev-name" textAnchor="middle">{name}</text>
      <text y={phone ? -22 : 37} className="dhcp-dev-sub" textAnchor="middle">{sub}</text>
    </g>
  )
}

function Topology({ relay, step, mainRef, copyRef, leased, phone }) {
  const letter = step?.letter || 'D'
  const at = step ? step.path[step.path.length - 1] : null
  const N = phone ? PHONE_NODES : NODES
  return (
    <svg className={`dhcp-topo${phone ? ' phone' : ''}`} viewBox={phone ? '0 0 300 352' : '0 0 400 200'} role="img" aria-label={`Client and PC2 on a switch, router R1 ${relay ? 'with ip helper-address 10.0.0.10' : 'without a helper address'}, and the DHCP server 10.0.0.10 on another subnet.`}>
      {phone ? (
        <>
          <rect x="4" y="4" width="292" height="252" rx="10" className="dhcp-subnet" />
          <rect x="4" y="256" width="292" height="92" rx="10" className="dhcp-subnet alt" />
          <text x="12" y="22" className="dhcp-subnet-label">192.168.10.0/24</text>
          <text x="12" y="276" className="dhcp-subnet-label">10.0.0.0/24</text>
        </>
      ) : (
        <>
          <rect x="4" y="18" width="250" height="176" rx="10" className="dhcp-subnet" />
          <rect x="254" y="58" width="142" height="96" rx="10" className="dhcp-subnet alt" />
          <text x="12" y="32" className="dhcp-subnet-label">192.168.10.0/24</text>
          <text x="388" y="72" className="dhcp-subnet-label" textAnchor="end">10.0.0.0/24</text>
        </>
      )}
      {[['client', 'sw'], ['pc2', 'sw'], ['sw', 'r1'], ['r1', 'server']].map(([a, b]) => (
        <line key={a + b} x1={N[a].x} y1={N[a].y} x2={N[b].x} y2={N[b].y} className="dhcp-link" />
      ))}
      <Pc x={N.client.x} y={N.client.y} name="Client" sub={leased ? ADDR.offered : 'no IP yet'} active={at === 'client'} phone={phone} />
      <Pc x={N.pc2.x} y={N.pc2.y} name="PC2" sub="192.168.10.50" phone={phone} />
      <g className="dhcp-dev" transform={`translate(${N.sw.x} ${N.sw.y})`} aria-hidden="true">
        <rect x="-22" y="-12" width="44" height="24" rx="5" className="dhcp-dev-body" />
        <path className="dhcp-dev-mark" d="M-12 -4.5 H12 M8 -8 L12 -4.5 L8 -1 M12 4.5 H-12 M-8 1 L-12 4.5 L-8 8" />
        {phone ? <text x="-32" y="5" className="dhcp-dev-name" textAnchor="end">SW1</text> : <text y="28" className="dhcp-dev-name" textAnchor="middle">SW1</text>}
      </g>
      <Router x={N.r1.x} y={N.r1.y} relay={relay} active={at === 'r1'} phone={phone} />
      <g className={`dhcp-dev${at === 'server' ? ' active' : ''}`} transform={`translate(${N.server.x} ${N.server.y})`} aria-hidden="true">
        <rect x="-12" y="-18" width="24" height="36" rx="3" className="dhcp-dev-body" />
        <path className="dhcp-dev-mark" d="M-7 -9 H7 M-7 -2 H7 M-7 5 H7" />
        {phone ? (
          <>
            <text x="24" y="-2" className="dhcp-dev-name">DHCP server</text>
            <text x="24" y="14" className="dhcp-dev-sub">10.0.0.10</text>
          </>
        ) : (
          <>
            <text y="32" className="dhcp-dev-name" textAnchor="middle">DHCP server</text>
            <text y="44" className="dhcp-dev-sub" textAnchor="middle">10.0.0.10</text>
          </>
        )}
      </g>
      {[copyRef, mainRef].map((ref, i) => (
        <g key={i} ref={ref} className={`dhcp-packet ${step?.cast || 'broadcast'}${i === 0 ? ' copy' : ''}`} style={{ opacity: 0 }} aria-hidden="true">
          <rect x="-11" y="-9" width="22" height="18" rx="4" />
          <text y="4.5" textAnchor="middle">{letter}</text>
        </g>
      ))}
    </svg>
  )
}

function Field({ label, value, changed, mono = true }) {
  return (
    <div className={`dhcp-field${changed ? ' changed' : ''}`}>
      <span className="dhcp-field-label">{label}</span>
      <span key={value} className={`dhcp-field-value${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  )
}

/** DHCP Discover, Offer, Request, Acknowledge through a relay agent, hop by hop. */
export default function DhcpDora({ onComplete }) {
  const [relay, setRelay] = useState(true)
  const steps = useMemo(() => buildSteps({ relay }), [relay])
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [pending, setPending] = useState(null)
  const [answered, setAnswered] = useState(() => new Set())
  const [cpMsg, setCpMsg] = useState({ text: '', tone: '' })
  const [tasks, setTasks] = useState({ lease: false, checks: false, norelay: false })
  const mainRef = useRef(null)
  const copyRef = useRef(null)
  const cpRef = useRef(null)
  const stageRef = useRef(null)
  const phone = useNarrow(stageRef)
  const N = phone ? PHONE_NODES : NODES
  const sim = useRef({ index: -1, pending: null, playing: false, run: 0, steps, answered: new Set(), tasks: { lease: false, checks: false, norelay: false }, done: false, speed: 1 })

  const current = index >= 0 ? steps[index] : null
  const previous = index > 0 ? steps[index - 1] : null
  const changed = useMemo(() => changedFields(previous, current), [previous, current])
  const leased = relay && index === steps.length - 1 && !steps[index].dropped
  const timers = leaseTimers()

  const markTask = (key) => {
    const s = sim.current
    if (s.tasks[key]) return
    s.tasks = { ...s.tasks, [key]: true }
    setTasks(s.tasks)
    if (s.tasks.lease && s.tasks.checks && !s.done) {
      s.done = true
      onComplete?.({ score: 1 })
    }
  }

  const reset = (nextSteps = steps) => {
    const s = sim.current
    s.run += 1
    s.index = -1
    s.pending = null
    s.playing = false
    s.steps = nextSteps
    setIndex(-1)
    setPending(null)
    setPlaying(false)
    setAnimating(false)
    setCpMsg({ text: '', tone: '' })
    hide(mainRef.current)
    hide(copyRef.current)
  }

  /** Animate the next step. Resolves to true if it advanced. */
  const advance = async () => {
    const s = sim.current
    if (s.pending) return false
    const next = s.index + 1
    const step = s.steps[next]
    if (!step) return false
    const run = ++s.run
    const live = () => run === s.run
    s.index = next
    setIndex(next)
    setAnimating(true)
    setCpMsg({ text: '', tone: '' })
    const main = mainRef.current
    const copy = copyRef.current
    hide(copy)
    const pts = step.path.map((id) => N[id])
    if (step.dropped) {
      sfx.error()
      await dropAt(main, N.r1)
      if (!live()) return false
      markTask('norelay')
    } else {
      sfx.tap()
      const swAt = step.path.indexOf('sw')
      if (step.flood.length && swAt > 0) {
        await fly(main, pts.slice(0, swAt + 1), s.speed)
        if (!live()) return false
        await Promise.all([fly(main, pts.slice(swAt), s.speed), fly(copy, [N.sw, N.pc2], s.speed, { fade: true })])
      } else if (step.flood.length && swAt === 0) {
        await Promise.all([fly(main, pts, s.speed), fly(copy, [N.sw, N.pc2], s.speed, { fade: true })])
      } else {
        await fly(main, pts, s.speed)
      }
      if (!live()) return false
      sfx.pop()
    }
    setAnimating(false)
    if (step.checkpoint && !s.answered.has(step.checkpoint)) {
      s.pending = step.checkpoint
      setPending(step.checkpoint)
    }
    if (next === s.steps.length - 1 && !step.dropped) {
      feedbackSuccess(stageRef.current, 'Lease complete')
      markTask('lease')
    }
    return true
  }

  const step = async () => {
    if (animating || playing) return
    await advance()
  }

  const play = async () => {
    const s = sim.current
    if (s.playing || animating) return
    s.playing = true
    setPlaying(true)
    while (s.playing) {
      const ok = await advance()
      if (!ok || s.pending || s.index >= s.steps.length - 1) break
      await wait(650, s.speed)
    }
    s.playing = false
    setPlaying(false)
  }

  const pause = () => {
    sim.current.playing = false
    setPlaying(false)
  }

  const back = () => {
    const s = sim.current
    if (s.index < 0 || animating || playing) return
    s.run += 1
    s.pending = null
    setPending(null)
    setCpMsg({ text: '', tone: '' })
    const prev = s.index - 1
    s.index = prev
    setIndex(prev)
    hide(copyRef.current)
    if (prev < 0) hide(mainRef.current)
    else {
      const st = s.steps[prev]
      place(mainRef.current, N[st.path[st.path.length - 1]])
    }
    sfx.tap()
  }

  const toggleRelay = (on) => {
    sfx.flip()
    setRelay(on)
    reset(buildSteps({ relay: on }))
  }

  const answer = (option) => {
    const s = sim.current
    if (!s.pending) return
    if (option.correct) {
      feedbackCorrect(cpRef.current, { combo: s.answered.size })
      const nextAnswered = new Set(s.answered)
      nextAnswered.add(s.pending)
      s.answered = nextAnswered
      setAnswered(nextAnswered)
      s.pending = null
      setPending(null)
      setCpMsg({ text: option.why, tone: 'good' })
      if (Object.keys(CHECKPOINTS).every((id) => nextAnswered.has(id))) markTask('checks')
    } else {
      feedbackWrong(cpRef.current)
      setCpMsg({ text: option.why, tone: 'bad' })
    }
  }

  const changeSpeed = (v) => {
    sim.current.speed = v
    setSpeed(v)
  }

  const canStep = !pending && index < steps.length - 1 && !animating
  const cp = pending ? CHECKPOINTS[pending] : null

  return (
    <div className="dhcp">
      <div className="w-toolbar">
        <label className="dhcp-toggle">
          <input type="checkbox" checked={relay} onChange={(e) => toggleRelay(e.target.checked)} />
          <span className="dhcp-toggle-track" aria-hidden="true"><span /></span>
          <span>Relay configured (<code>ip helper-address</code>)</span>
        </label>
        <span className="grow" />
        <span className="chip outline tabular">Step {Math.max(0, index + 1)} / {steps.length}</span>
      </div>

      <ol className="dhcp-progress" aria-label="DORA progress">
        {steps.map((s, i) => (
          <li key={s.id} className={`${i < index ? 'done' : i === index ? 'now' : ''}${s.dropped ? ' dead' : ''}`} title={`${MSG_NAME[s.msg]}: ${s.hop}`}>
            <span className="dhcp-progress-letter">{s.dropped ? 'X' : s.letter}</span>
            <span className="dhcp-progress-hop">{s.hop}</span>
          </li>
        ))}
      </ol>

      <div className="w-stage dhcp-stage" ref={stageRef}>
        <Topology relay={relay} step={current} mainRef={mainRef} copyRef={copyRef} leased={leased} phone={phone} />
        <div className="w-legend">
          <span><i className="dhcp-key broadcast" />Broadcast</span>
          <span><i className="dhcp-key unicast" />Unicast</span>
        </div>
      </div>

      <div className="dhcp-controls">
        <button type="button" className="btn btn-sm" onClick={back} disabled={index < 0 || animating || playing} aria-label="Previous step"><StepBack size={14} /></button>
        {playing ? (
          <button type="button" className="btn btn-sm" onClick={pause}><Pause size={14} /> Pause</button>
        ) : (
          <button type="button" className="btn btn-sm" onClick={play} disabled={!canStep}><Play size={14} /> Play</button>
        )}
        <button type="button" className="btn btn-sm btn-primary" onClick={step} disabled={!canStep || playing}>
          <StepForward size={14} /> {index < 0 ? 'Start' : 'Next hop'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { sfx.tap(); reset() }} aria-label="Start over"><RotateCcw size={14} /></button>
        <div className="w-pill-group" role="group" aria-label="Animation speed">
          {SPEEDS.map((v) => (
            <button key={v} type="button" aria-pressed={speed === v} onClick={() => changeSpeed(v)}>{v}x</button>
          ))}
        </div>
      </div>

      <section className={`dhcp-panel${current?.dropped ? ' dead' : ''}`} aria-live="polite">
        {current ? (
          <>
            <div className="dhcp-panel-head">
              <span className={`dhcp-letter ${current.cast}`}>{current.dropped ? 'X' : current.letter}</span>
              <strong>{MSG_NAME[current.msg]}</strong>
              <span className="subtle small">{current.hop}</span>
              <span className={`chip ${current.dropped ? 'bad' : current.cast === 'broadcast' ? 'warn' : 'accent'}`}>{current.dropped ? 'Dropped' : current.cast}</span>
            </div>
            <div className="dhcp-fields">
              <Field label="Ethernet source" value={current.l2.src} changed={changed.has('l2src')} />
              <Field label="Ethernet destination" value={current.l2.dst} changed={changed.has('l2dst')} />
              <Field label="IP source" value={current.l3.src} changed={changed.has('l3src')} />
              <Field label="IP destination" value={current.l3.dst} changed={changed.has('l3dst')} />
              <Field label="UDP ports" value={`${current.udp.src} to ${current.udp.dst}`} changed={changed.has('udp')} />
              <Field label="giaddr (relay)" value={current.giaddr} changed={changed.has('giaddr')} />
              <Field label={current.requested ? 'Requested IP' : 'yiaddr (offered IP)'} value={current.requested || current.yiaddr} changed={changed.has('yiaddr') || Boolean(current.requested)} />
            </div>
            <p className="dhcp-caption">{current.caption}</p>
          </>
        ) : (
          <p className="dhcp-caption">
            The client just booted with no IP address. Its DHCP server, 10.0.0.10, is on a different subnet. Press Start to watch it lease an address{relay ? ' through the relay on R1' : ''}.
          </p>
        )}
      </section>

      <div className="dhcp-check-wrap" ref={cpRef}>
      {cp && (
        <section className="dhcp-check" aria-label="Checkpoint question">
          <strong className="dhcp-check-title">Checkpoint</strong>
          <p className="dhcp-check-q">{cp.question}</p>
          <div className="dhcp-check-options">
            {cp.options.map((o) => (
              <button key={o.text} type="button" className="btn dhcp-option" onClick={() => answer(o)}>{o.text}</button>
            ))}
          </div>
        </section>
      )}
      <p className={`w-feedback ${cpMsg.tone}`} aria-live="polite">{cpMsg.text}</p>
      </div>

      {leased && (
        <section className="dhcp-lease" aria-label="Lease details">
          <div className="dhcp-lease-head">
            <strong>Lease</strong>
            <span className="mono small">{ADDR.offered}/24, gateway {ADDR.r1Lan}, DNS {ADDR.dns}</span>
          </div>
          <div className="dhcp-timeline" aria-hidden="true">
            <span className="dhcp-tick" style={{ left: '0%' }}><b>0</b>Leased</span>
            <span className="dhcp-tick t1" style={{ left: '50%' }}><b>T1</b>{formatDuration(timers.t1)}</span>
            <span className="dhcp-tick t2" style={{ left: '87.5%' }}><b>T2</b>{formatDuration(timers.t2)}</span>
            <span className="dhcp-tick end" style={{ left: '100%' }}><b>End</b>{formatDuration(timers.lease)}</span>
          </div>
          <p className="small dhcp-lease-text">
            At T1 (50%, {formatDuration(timers.t1)}) the client unicasts a Request straight to 10.0.0.10 to renew. If that keeps failing, at T2 (87.5%, {formatDuration(timers.t2)}) it broadcasts to rebind with any server. If the lease runs out, it must stop using the address.
          </p>
        </section>
      )}

      <div className="terminal dhcp-term">
        <div className="terminal-bar"><span className="dot" /><span className="dot" /><span className="dot" />R1 running-config</div>
        <div className="terminal-screen dhcp-screen">
          {relayConfig(relay).map((line) => (
            <p key={line} className={`terminal-line${line.includes('helper') ? ' terminal-ok dhcp-helper-line' : ''}`}>{line}</p>
          ))}
          {!relay && <p className="terminal-line terminal-err">! no ip helper-address: DHCP broadcasts stop here</p>}
        </div>
      </div>

      <ul className="w-tasks">
        {[
          ['lease', 'Complete a lease through the relay', 'Step all the way to the Ack with the relay on.'],
          ['checks', 'Answer the four checkpoints', `${answered.size} of 4 answered.`],
          ['norelay', 'Optional: turn the relay off', 'Watch the Discover die at R1.']
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
