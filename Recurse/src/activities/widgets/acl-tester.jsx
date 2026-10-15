import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ClipboardCheck, Plus, Send, Trash2 } from 'lucide-react'
import { feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import {
  HOSTS,
  INTERFACES,
  POLICIES,
  PROTOCOLS,
  SERVICES,
  aclName,
  blankRule,
  cloneAcl,
  configLines,
  gradePolicy,
  normalizedBase,
  numberFits,
  maskFromPrefix,
  parseIp,
  runPacket,
  specText,
  validateAcl,
  wildcardFromPrefix,
  wildcardRange
} from '../lib/acl-tester'
import { useNarrow } from '../lib/use-width'
import './acl-tester.css'

const FREE = {
  id: 'free',
  title: 'Free build',
  text: 'No policy here. Build any ACL, apply it anywhere and send packets to see what it does.',
  draft: { acl: { kind: 'standard', naming: 'numbered', number: '10', name: '', rules: [] }, applied: { router: 'R1', iface: 'Gi0/1', dir: 'in' } }
}
const CHALLENGES = [...POLICIES, FREE]

// Diagram (viewBox 0 0 400 200).
const NODE = {
  sales: { x: 52, y: 48 },
  guest: { x: 52, y: 152 },
  R1: { x: 160, y: 100 },
  R2: { x: 264, y: 100 },
  servers: { x: 356, y: 100 }
}
// Phone diagram (viewBox 0 0 300 404): the same network stood on end, so labels can be big enough to read.
const PHONE_NODE = {
  sales: { x: 74, y: 62 },
  guest: { x: 226, y: 62 },
  R1: { x: 150, y: 148 },
  R2: { x: 150, y: 256 },
  servers: { x: 150, y: 350 }
}
const GEO = {
  desktop: { viewBox: '0 0 400 200', node: NODE, hit: 13, lan: { sales: 'above', guest: 'below', servers: 'below' }, routerLabel: { x: 0, y: 34, anchor: 'middle' } },
  phone: { viewBox: '0 0 300 404', node: PHONE_NODE, hit: 17, lan: { sales: 'above', guest: 'above', servers: 'below' }, routerLabel: { x: -30, y: 6, anchor: 'end' } }
}
// Phone marker labels sit beside the marker instead of above it.
const PHONE_LABEL = {
  'R1 Gi0/0': { x: -14, y: 14, anchor: 'end' },
  'R1 Gi0/1': { x: 14, y: 14, anchor: 'start' },
  'R1 Gi0/2': { x: 16, y: 5, anchor: 'start' },
  'R2 Gi0/2': { x: 16, y: 5, anchor: 'start' },
  'R2 Gi0/0': { x: 16, y: 5, anchor: 'start' }
}
const IFACE_LINKS = {
  'R1 Gi0/0': 'sales',
  'R1 Gi0/1': 'guest',
  'R1 Gi0/2': 'R2',
  'R2 Gi0/2': 'R1',
  'R2 Gi0/0': 'servers'
}
const LAN_LABEL = {
  sales: ['Sales 10.1.1.0/24', 'PC .20, Admin .50'],
  guest: ['Guest 10.1.2.0/24', 'Guest PC .15'],
  servers: ['Servers 10.2.2.0/24', 'Web .10, DNS .20']
}
const LABEL_DY = { 'R1 Gi0/1': 20, 'R2 Gi0/2': 20 }
const SPEEDS = [0.5, 1, 2]

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

function markerPos(router, iface, node = NODE) {
  const a = node[router]
  const b = node[IFACE_LINKS[`${router} ${iface}`]]
  const k = iface === 'Gi0/2' ? 0.36 : 0.34
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

const lanOf = (ip, node = NODE) => {
  const host = HOSTS.find((h) => h.ip === ip)
  return host ? node[host.subnet] : null
}

/** Waypoints for a packet, and the waypoint index of each interface crossing. */
function waypoints(path, packet, node = NODE) {
  const pts = [lanOf(packet.src, node)]
  const crossingAt = []
  for (const c of path) {
    pts.push(markerPos(c.router, c.iface, node))
    crossingAt.push(pts.length - 1)
    if (c.dir === 'in') pts.push(node[c.router])
  }
  pts.push(lanOf(packet.dst, node))
  return { pts, crossingAt }
}

function flyAlong(node, pts, speed) {
  if (!node?.animate || pts.length < 2) return Promise.resolve()
  node.getAnimations().forEach((a) => a.cancel())
  const dists = [0]
  for (let i = 1; i < pts.length; i++) dists.push(dists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = dists[dists.length - 1] || 1
  const frames = pts.map((p, i) => ({ transform: `translate(${p.x}px, ${p.y}px)`, opacity: 1, offset: dists[i] / total }))
  const duration = reducedMotion() ? 120 : Math.max(380, (total * 5.2) / speed)
  return node.animate(frames, { duration, easing: 'cubic-bezier(0.4, 0, 0.3, 1)', fill: 'forwards' }).finished.catch(() => {})
}

function dropAt(node, p) {
  if (!node?.animate) return Promise.resolve()
  node.getAnimations().forEach((a) => a.cancel())
  return node
    .animate(
      [
        { transform: `translate(${p.x}px, ${p.y}px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${p.x}px, ${p.y + 6}px) rotate(-14deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${p.x}px, ${p.y + 34}px) rotate(20deg)`, opacity: 0 }
      ],
      { duration: reducedMotion() ? 120 : 650, easing: 'ease-in', fill: 'forwards' }
    )
    .finished.catch(() => {})
}

const pause = (ms, speed) => new Promise((r) => setTimeout(r, reducedMotion() ? 60 : ms / speed))

function DeviceRouter({ x, y, label, at }) {
  return (
    <g className="acl-dev" transform={`translate(${x} ${y})`}>
      <circle r="19" className="acl-dev-body" />
      <path className="acl-dev-mark" d="M0 -4 V-13 M-3.5 -9.5 L0 -13 L3.5 -9.5 M0 4 V13 M-3.5 9.5 L0 13 L3.5 9.5 M-13 0 H-4 M-7.5 -3.5 L-4 0 L-7.5 3.5 M13 0 H4 M7.5 -3.5 L4 0 L7.5 3.5" />
      <text x={at.x} y={at.y} className="acl-dev-name" textAnchor={at.anchor}>{label}</text>
    </g>
  )
}

function DeviceLan({ x, y, lines, below, phone }) {
  // Phone labels are bigger, so they sit a little further from the box.
  const name = below ? (phone ? 32 : 29) : phone ? -35 : -32
  const sub = below ? (phone ? 47 : 41) : -20
  return (
    <g className="acl-dev" transform={`translate(${x} ${y})`}>
      <rect x="-24" y="-13" width="48" height="26" rx="5" className="acl-dev-body" />
      <path className="acl-dev-mark" d="M-14 -5 H14 M10 -8.5 L14 -5 L10 -1.5 M14 5 H-14 M-10 1.5 L-14 5 L-10 8.5" />
      <text y={name} className="acl-dev-name" textAnchor="middle">{lines[0]}</text>
      <text y={sub} className="acl-dev-sub" textAnchor="middle">{lines[1]}</text>
    </g>
  )
}

function Topology({ applied, onPick, packetRef, verdict, phone }) {
  const geo = phone ? GEO.phone : GEO.desktop
  const node = geo.node
  const links = [
    ['sales', 'R1'],
    ['guest', 'R1'],
    ['R1', 'R2'],
    ['R2', 'servers']
  ]
  const ap = markerPos(applied.router, applied.iface, node)
  const routerPos = node[applied.router]
  const angle = (Math.atan2(routerPos.y - ap.y, routerPos.x - ap.x) * 180) / Math.PI
  const arrowAngle = applied.dir === 'in' ? angle : angle + 180
  return (
    <svg className={`acl-topo${phone ? ' phone' : ''}`} viewBox={geo.viewBox} role="group" aria-label="Topology: Sales and Guest LANs on R1, R1 linked to R2, Servers LAN on R2. Interface markers can be selected to apply the ACL.">
      {links.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={node[a].x} y1={node[a].y} x2={node[b].x} y2={node[b].y} className="acl-link" />
      ))}
      {['sales', 'guest', 'servers'].map((lan) => (
        <DeviceLan key={lan} x={node[lan].x} y={node[lan].y} lines={LAN_LABEL[lan]} below={geo.lan[lan] === 'below'} phone={phone} />
      ))}
      <DeviceRouter x={node.R1.x} y={node.R1.y} label="R1" at={geo.routerLabel} />
      <DeviceRouter x={node.R2.x} y={node.R2.y} label="R2" at={geo.routerLabel} />
      <g className="acl-dir" transform={`translate(${ap.x} ${ap.y}) rotate(${arrowAngle})`} aria-hidden="true">
        <path d="M-15 0 H9 M3 -6 L10 0 L3 6" />
      </g>
      {INTERFACES.map((it) => {
        const p = markerPos(it.router, it.iface, node)
        const on = it.router === applied.router && it.iface === applied.iface
        const label = `${it.router} ${it.iface}`
        const at = phone ? PHONE_LABEL[label] : { x: 0, y: LABEL_DY[label] ?? -11, anchor: 'middle' }
        return (
          <g
            key={label}
            className={`acl-marker${on ? ' on' : ''}`}
            transform={`translate(${p.x} ${p.y})`}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`Apply the ACL to ${label}, facing the ${it.faces}`}
            onClick={() => onPick(it)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPick(it)
              }
            }}
          >
            <circle r={geo.hit} className="acl-marker-hit" />
            <circle r="6.5" className="acl-marker-dot" />
            <text x={at.x} y={at.y} className="acl-marker-label" textAnchor={at.anchor}>{it.iface}</text>
          </g>
        )
      })}
      <g ref={packetRef} className={`acl-packet ${verdict || ''}`} style={{ opacity: 0 }} aria-hidden="true">
        <rect x="-10" y="-7" width="20" height="14" rx="3" />
        <path d="M-9 -5.5 L0 1 L9 -5.5" />
      </g>
    </svg>
  )
}

function AddressField({ label, spec, onChange }) {
  const ipBad = spec.kind !== 'any' && parseIp(spec.ip) === null
  const wcBad = spec.kind === 'wild' && parseIp(spec.wildcard) === null
  return (
    <fieldset className="acl-addr">
      <legend>{label}</legend>
      <select className="select" value={spec.kind} aria-label={`${label} type`} onChange={(e) => onChange({ ...spec, kind: e.target.value })}>
        <option value="any">any</option>
        <option value="host">host</option>
        <option value="wild">address + wildcard</option>
      </select>
      {spec.kind !== 'any' && (
        <input
          className={`input mono acl-ip${ipBad ? ' is-wrong' : ''}`}
          value={spec.ip || ''}
          placeholder={spec.kind === 'host' ? '10.2.2.10' : '10.1.2.0'}
          aria-label={`${label} address`}
          spellCheck={false}
          inputMode="decimal"
          onChange={(e) => onChange({ ...spec, ip: e.target.value.trim() })}
        />
      )}
      {spec.kind === 'wild' && (
        <input
          className={`input mono acl-ip${wcBad ? ' is-wrong' : ''}`}
          value={spec.wildcard || ''}
          placeholder="0.0.0.255"
          aria-label={`${label} wildcard`}
          spellCheck={false}
          inputMode="decimal"
          onChange={(e) => onChange({ ...spec, wildcard: e.target.value.trim() })}
        />
      )}
    </fieldset>
  )
}

function WildcardHelper() {
  const [prefix, setPrefix] = useState(24)
  const [base, setBase] = useState('10.1.2.0')
  const wc = wildcardFromPrefix(prefix)
  const maskText = maskFromPrefix(prefix)
  const range = wildcardRange(base, wc)
  return (
    <details className="acl-helper">
      <summary>Wildcard mask helper</summary>
      <div className="acl-helper-body">
        <label className="w-slider">
          <span>Prefix /{prefix}</span>
          <input type="range" min="0" max="32" value={prefix} onChange={(e) => setPrefix(Number(e.target.value))} aria-label="Prefix length" />
        </label>
        <div className="acl-helper-grid mono">
          <span className="subtle">Subnet mask</span><strong>{maskText}</strong>
          <span className="subtle">Wildcard</span><strong className="acl-wc">{wc}</strong>
        </div>
        <p className="small subtle">A wildcard is 255.255.255.255 minus the subnet mask. A 0 bit means this bit must match; a 1 bit means ignore it.</p>
        <label className="acl-helper-base">
          <span className="xsmall subtle">Base address</span>
          <input className="input mono" value={base} onChange={(e) => setBase(e.target.value.trim())} spellCheck={false} aria-label="Base address" />
        </label>
        {range ? (
          <p className="small">
            <code>{base} {wc}</code> matches {range.count === 1 ? 'exactly one address' : `${range.count.toLocaleString('en-US')} addresses`}: {range.first}
            {range.count > 1 ? ` to ${range.last}` : ''}.
          </p>
        ) : (
          <p className="small subtle">Type a valid base address to see the range.</p>
        )}
      </div>
    </details>
  )
}

/** Build an ACL, apply it, send packets through it and meet a policy. */
export default function AclTester({ onComplete }) {
  const [challengeId, setChallengeId] = useState(POLICIES[0].id)
  const challenge = CHALLENGES.find((c) => c.id === challengeId)
  const [acl, setAcl] = useState(() => cloneAcl(POLICIES[0].draft.acl))
  const [applied, setApplied] = useState(() => ({ ...POLICIES[0].draft.applied }))
  const [form, setForm] = useState({ src: 'guest-pc', dst: 'web', service: 'http' })
  const [marks, setMarks] = useState({ lines: {}, implicit: null, reasons: {} })
  const [caption, setCaption] = useState({ text: 'Pick a source, destination and service, then send a packet.', tone: '' })
  const [verdict, setVerdict] = useState('')
  const [busy, setBusy] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [grade, setGrade] = useState(null)
  const [passed, setPassed] = useState(() => new Set())
  const packetRef = useRef(null)
  const gradeRef = useRef(null)
  const runRef = useRef(0)
  const stageRef = useRef(null)
  const phone = useNarrow(stageRef)

  const errors = useMemo(() => validateAcl(acl), [acl])
  const lines = useMemo(() => configLines(acl, applied), [acl, applied])
  const ext = acl.kind === 'extended'

  const stopRun = () => {
    runRef.current += 1
    setBusy(false)
    packetRef.current?.getAnimations?.().forEach((a) => a.cancel())
    if (packetRef.current) packetRef.current.style.opacity = '0'
  }

  const touched = () => {
    stopRun()
    setGrade(null)
    setMarks({ lines: {}, implicit: null, reasons: {} })
    setVerdict('')
  }

  const loadChallenge = (id) => {
    const c = CHALLENGES.find((x) => x.id === id)
    sfx.flip()
    touched()
    setChallengeId(id)
    setAcl(cloneAcl(c.draft.acl))
    setApplied({ ...c.draft.applied })
    setCaption({ text: c.draftNote || 'Pick a source, destination and service, then send a packet.', tone: '' })
  }

  const updateAcl = (fn) => {
    touched()
    setAcl((a) => {
      const next = cloneAcl(a)
      fn(next)
      return next
    })
  }

  const setKind = (kind) => {
    if (kind === acl.kind) return
    sfx.tap()
    updateAcl((a) => {
      a.kind = kind
      if (a.naming === 'numbered' && !numberFits(kind, a.number)) a.number = kind === 'standard' ? '10' : '110'
    })
  }

  const pickIface = (it) => {
    sfx.tap()
    touched()
    setApplied((a) => ({ ...a, router: it.router, iface: it.iface }))
  }

  const send = async () => {
    if (errors.length) {
      setCaption({ text: `Fix the ACL first: ${errors[0]}`, tone: 'bad' })
      feedbackWrong(gradeRef.current)
      return
    }
    const srcHost = HOSTS.find((h) => h.id === form.src)
    const dstHost = HOSTS.find((h) => h.id === form.dst)
    if (srcHost.id === dstHost.id) {
      setCaption({ text: 'Pick two different hosts.', tone: 'bad' })
      return
    }
    const service = SERVICES.find((s) => s.id === form.service)
    const packet = { src: srcHost.ip, dst: dstHost.ip, protocol: service.protocol, port: service.port }
    const run = runPacket(acl, applied, packet)
    const id = ++runRef.current
    setBusy(true)
    setGrade(null)
    setVerdict('')
    setMarks({ lines: {}, implicit: null, reasons: {} })
    sfx.tap()
    const node = packetRef.current
    const live = () => id === runRef.current
    if (!run.path.length) {
      setCaption({ text: `${srcHost.name} and ${dstHost.name} are on the same LAN. The packet never crosses a router, so no router ACL can filter it.`, tone: '' })
      setBusy(false)
      return
    }
    const { pts, crossingAt } = waypoints(run.path, packet, phone ? PHONE_NODE : NODE)
    const name = aclName(acl)
    if (run.filterAt === -1) {
      setCaption({ text: `${srcHost.name} sends ${service.label} to ${dstHost.name}. Its path never crosses ${applied.router} ${applied.iface} ${applied.dir}bound, so ACL ${name} never checks it.`, tone: '' })
      await flyAlong(node, pts, speed)
      if (!live()) return
      sfx.pop()
      setVerdict('ok')
      setCaption({ text: `Delivered to ${dstHost.name}, unfiltered: ACL ${name} is not on this packet's path in that direction.`, tone: 'good' })
      setBusy(false)
      return
    }
    const stop = crossingAt[run.filterAt]
    setCaption({ text: `${srcHost.name} sends ${service.label} to ${dstHost.name}.`, tone: '' })
    await flyAlong(node, pts.slice(0, stop + 1), speed)
    if (!live()) return
    setCaption({ text: `It reaches ${applied.router} ${applied.iface} ${applied.dir}bound, where ACL ${name} is applied. Checking lines from the top.`, tone: '' })
    await pause(450, speed)
    for (const step of run.evaluation.steps) {
      if (!live()) return
      setMarks((m) => ({ ...m, lines: { ...m.lines, [step.index]: 'checking' } }))
      await pause(380, speed)
      if (!live()) return
      sfx.tick()
      setMarks((m) => ({ lines: { ...m.lines, [step.index]: step.match ? 'match' : 'nomatch' }, implicit: m.implicit, reasons: { ...m.reasons, [step.index]: step.reason } }))
      await pause(260, speed)
    }
    if (!live()) return
    const ev = run.evaluation
    if (ev.matchIndex === -1) {
      setMarks((m) => ({ ...m, implicit: 'checking' }))
      await pause(380, speed)
      if (!live()) return
      setMarks((m) => ({ ...m, implicit: 'match' }))
    }
    const lineNo = ev.matchIndex === -1 ? 'the implicit deny at the end' : `line ${ev.matchIndex + 1} (${acl.rules[ev.matchIndex].action})`
    if (run.delivered) {
      setCaption({ text: `First match is ${lineNo}, so the packet is permitted. Lines below it are never checked.`, tone: '' })
      await pause(300, speed)
      await flyAlong(node, pts.slice(stop), speed)
      if (!live()) return
      sfx.pop()
      setVerdict('ok')
      setCaption({ text: `Permitted by ${lineNo} and delivered to ${dstHost.name}.`, tone: 'good' })
    } else {
      setVerdict('dropped')
      sfx.error()
      await dropAt(node, pts[stop])
      if (!live()) return
      setCaption({
        text: ev.matchIndex === -1 ? 'No line matched, so the packet hit the implicit deny and was dropped. Every ACL ends with one, even though you never type it.' : `Denied by ${lineNo}. The packet is dropped at ${applied.router} ${applied.iface}.`,
        tone: 'bad'
      })
    }
    setBusy(false)
  }

  const check = () => {
    if (challengeId === 'free') return
    stopRun()
    const g = gradePolicy(acl, applied, challenge)
    setGrade(g)
    if (g.pass) {
      feedbackSuccess(gradeRef.current, 'Policy met')
      if (!passed.has(challengeId)) {
        const next = new Set(passed)
        next.add(challengeId)
        setPassed(next)
        onComplete?.({ score: 1, detail: challenge.title })
      }
    } else {
      feedbackWrong(gradeRef.current)
    }
  }

  const moveRule = (i, d) => {
    sfx.tap()
    updateAcl((a) => {
      const j = i + d
      if (j < 0 || j >= a.rules.length) return
      ;[a.rules[i], a.rules[j]] = [a.rules[j], a.rules[i]]
    })
  }

  return (
    <div className="acl">
      <div className="w-toolbar">
        <label className="acl-challenge">
          <span className="sr-only">Challenge</span>
          <select className="select" value={challengeId} onChange={(e) => loadChallenge(e.target.value)} aria-label="Challenge">
            {CHALLENGES.map((c, i) => (
              <option key={c.id} value={c.id}>{c.id === 'free' ? c.title : `${i + 1}. ${c.title}`}{passed.has(c.id) ? ' (done)' : ''}</option>
            ))}
          </select>
        </label>
        <span className="grow" />
        <span className="chip outline tabular">{passed.size} / {POLICIES.length} policies</span>
      </div>

      <div className="callout info acl-policy">
        <ClipboardCheck size={18} />
        <div>
          <strong>{challenge.id === 'free' ? 'Sandbox' : 'Policy'}:</strong> {challenge.text}
          {challenge.draftNote && <span className="acl-draft-note">{challenge.draftNote}</span>}
        </div>
      </div>

      <div className="w-stage acl-stage" ref={stageRef}>
        <Topology applied={applied} onPick={pickIface} packetRef={packetRef} verdict={verdict} phone={phone} />
        <div className="acl-apply">
          <label className="acl-field">
            <span className="xsmall subtle">Applied to</span>
            <select
              className="select"
              value={`${applied.router} ${applied.iface}`}
              onChange={(e) => pickIface(INTERFACES.find((it) => `${it.router} ${it.iface}` === e.target.value))}
            >
              {INTERFACES.map((it) => (
                <option key={`${it.router} ${it.iface}`} value={`${it.router} ${it.iface}`}>{it.router} {it.iface} (faces {it.faces})</option>
              ))}
            </select>
          </label>
          <div className="acl-field">
            <span className="xsmall subtle">Direction</span>
            <div className="w-pill-group" role="group" aria-label="Direction">
              {['in', 'out'].map((d) => (
                <button key={d} type="button" aria-pressed={applied.dir === d} onClick={() => { sfx.tap(); touched(); setApplied((a) => ({ ...a, dir: d })) }}>
                  {d === 'in' ? 'in (entering router)' : 'out (leaving router)'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="acl-editor" aria-label="ACL editor">
        <div className="acl-head">
          <div className="w-pill-group" role="group" aria-label="ACL type">
            <button type="button" aria-pressed={acl.kind === 'standard'} onClick={() => setKind('standard')}>Standard</button>
            <button type="button" aria-pressed={acl.kind === 'extended'} onClick={() => setKind('extended')}>Extended</button>
          </div>
          <div className="w-pill-group" role="group" aria-label="Numbered or named">
            <button type="button" aria-pressed={acl.naming === 'numbered'} onClick={() => updateAcl((a) => { a.naming = 'numbered'; if (!numberFits(a.kind, a.number)) a.number = a.kind === 'standard' ? '10' : '110' })}>Numbered</button>
            <button type="button" aria-pressed={acl.naming === 'named'} onClick={() => updateAcl((a) => { a.naming = 'named'; if (!a.name) a.name = a.kind === 'standard' ? 'GUEST-BLOCK' : 'GUEST-FILTER' })}>Named</button>
          </div>
          {acl.naming === 'numbered' ? (
            <label className="acl-id">
              <span className="xsmall subtle">Number</span>
              <input
                className={`input mono${numberFits(acl.kind, acl.number) ? '' : ' is-wrong'}`}
                value={acl.number}
                inputMode="numeric"
                onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, '').slice(0, 4); updateAcl((a) => { a.number = v }) }}
                aria-label="ACL number"
              />
            </label>
          ) : (
            <label className="acl-id wide">
              <span className="xsmall subtle">Name</span>
              <input className="input mono" value={acl.name} onChange={(e) => { const v = e.target.value.replace(/\s/g, '').slice(0, 31); updateAcl((a) => { a.name = v }) }} aria-label="ACL name" spellCheck={false} />
            </label>
          )}
        </div>
        <p className="xsmall subtle acl-kind-note">
          {ext ? 'Extended: matches protocol, source, destination and port. Numbers 100 to 199 or 2000 to 2699.' : 'Standard: matches the source address only. Numbers 1 to 99 or 1300 to 1999.'}
        </p>

        <ol className="acl-rules">
          {acl.rules.map((rule, i) => {
            const fixSrc = normalizedBase(rule.src)
            const fixDst = ext ? normalizedBase(rule.dst) : null
            return (
              <li key={i} className={`acl-rule ${rule.action}`}>
                <span className="acl-rule-no" aria-hidden="true">{i + 1}</span>
                <select className="select acl-action" value={rule.action} aria-label={`Line ${i + 1} action`} onChange={(e) => updateAcl((a) => { a.rules[i].action = e.target.value })}>
                  <option value="permit">permit</option>
                  <option value="deny">deny</option>
                </select>
                {ext && (
                  <select className="select acl-proto" value={rule.protocol} aria-label={`Line ${i + 1} protocol`} onChange={(e) => updateAcl((a) => { a.rules[i].protocol = e.target.value })}>
                    {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
                <AddressField label="Source" spec={rule.src} onChange={(spec) => updateAcl((a) => { a.rules[i].src = spec })} />
                {ext && <AddressField label="Destination" spec={rule.dst} onChange={(spec) => updateAcl((a) => { a.rules[i].dst = spec })} />}
                {ext && (rule.protocol === 'tcp' || rule.protocol === 'udp') && (
                  <label className="acl-port">
                    <span>eq</span>
                    <input
                      className="input mono"
                      value={rule.port}
                      placeholder="port"
                      inputMode="numeric"
                      aria-label={`Line ${i + 1} destination port`}
                      onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, '').slice(0, 5); updateAcl((a) => { a.rules[i].port = v }) }}
                    />
                  </label>
                )}
                <div className="acl-rule-tools">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => moveRule(i, -1)} disabled={i === 0} aria-label={`Move line ${i + 1} up`}><ArrowUp size={14} /></button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => moveRule(i, 1)} disabled={i === acl.rules.length - 1} aria-label={`Move line ${i + 1} down`}><ArrowDown size={14} /></button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => { sfx.tap(); updateAcl((a) => { a.rules.splice(i, 1) }) }} aria-label={`Delete line ${i + 1}`}><Trash2 size={14} /></button>
                </div>
                {(fixSrc || fixDst) && (
                  <p className="acl-rule-note xsmall">
                    IOS will store {fixSrc ? `the source as ${fixSrc} ${rule.src.wildcard}` : ''}{fixSrc && fixDst ? ' and ' : ''}{fixDst ? `the destination as ${fixDst} ${rule.dst.wildcard}` : ''}, because bits the wildcard ignores are zeroed.
                  </p>
                )}
              </li>
            )
          })}
          {!acl.rules.length && <li className="acl-empty small subtle">No lines yet. With only the implicit deny, this ACL blocks everything it checks.</li>}
        </ol>
        <button type="button" className="btn btn-sm" onClick={() => { sfx.pop(); updateAcl((a) => { a.rules.push(blankRule()) }) }} disabled={acl.rules.length >= 8}>
          <Plus size={14} /> Add a line
        </button>
        {errors.length > 0 && (
          <ul className="acl-errors small" aria-live="polite">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </section>

      <div className="terminal acl-term">
        <div className="terminal-bar"><span className="dot" /><span className="dot" /><span className="dot" />{applied.router}(config)#</div>
        <div className="terminal-screen acl-screen">
          {lines.map((line, i) => {
            const mark = line.kind === 'rule' ? marks.lines[line.index] : line.kind === 'implicit' ? marks.implicit : null
            const reason = line.kind === 'rule' && mark && mark !== 'checking' ? marks.reasons[line.index] : null
            const rule = line.kind === 'rule' ? acl.rules[line.index] : null
            return (
              <div key={i} className={`acl-line ${line.kind}${mark ? ` ${mark}` : ''}${mark === 'match' ? ` ${line.kind === 'implicit' ? 'deny' : rule.action}` : ''}`}>
                <span className="acl-line-text">{line.text}</span>
                {mark === 'match' && <span className="acl-line-tag">match</span>}
                {mark === 'nomatch' && <span className="acl-line-tag">no</span>}
                {reason && mark === 'nomatch' && <span className="acl-line-why">{reason}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <section className="acl-test" aria-label="Send a test packet">
        <div className="acl-test-row">
          <label className="acl-field">
            <span className="xsmall subtle">From</span>
            <select className="select" value={form.src} onChange={(e) => setForm((f) => ({ ...f, src: e.target.value }))}>
              {HOSTS.map((h) => <option key={h.id} value={h.id}>{h.name} {h.ip}</option>)}
            </select>
          </label>
          <label className="acl-field">
            <span className="xsmall subtle">To</span>
            <select className="select" value={form.dst} onChange={(e) => setForm((f) => ({ ...f, dst: e.target.value }))}>
              {HOSTS.map((h) => <option key={h.id} value={h.id}>{h.name} {h.ip}</option>)}
            </select>
          </label>
          <label className="acl-field">
            <span className="xsmall subtle">Service</span>
            <select className="select" value={form.service} onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}>
              {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="row wrap acl-test-actions">
          <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
            <Send size={15} /> Send packet
          </button>
          <div className="w-pill-group" role="group" aria-label="Animation speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</button>
            ))}
          </div>
        </div>
        <p className={`w-feedback ${caption.tone}`} aria-live="polite">{caption.text}</p>
      </section>

      {challengeId !== 'free' && (
        <div className="acl-grade" ref={gradeRef}>
          <button type="button" className="btn btn-primary" onClick={check}>
            <Check size={16} /> Check against the policy
          </button>
          <div aria-live="polite">
            {grade && (
              <div className={`acl-result ${grade.pass ? 'pass' : 'fail'}`}>
                <p className="acl-result-head">
                  {grade.pass ? 'Policy met.' : 'Not yet.'} {grade.total ? `${grade.passed} of ${grade.total} hidden test packets handled correctly.` : ''}
                </p>
                {grade.failures.length > 0 && (
                  <ul className="acl-fails">
                    {grade.failures.map((f) => (
                      <li key={f.label}>
                        <span className={`chip ${f.got === 'permit' ? 'warn' : 'bad'}`}>{f.got === 'permit' ? 'Wrongly allowed' : 'Wrongly denied'}</span> {f.label}
                      </li>
                    ))}
                  </ul>
                )}
                {grade.hints.length > 0 && (
                  <ul className="acl-hints small">
                    {grade.hints.map((h) => <li key={h}>{h}</li>)}
                  </ul>
                )}
                {grade.placementTip && <p className="small acl-tip">{grade.placementTip}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      <ul className="w-tasks">
        {POLICIES.map((p) => (
          <li key={p.id} className={`w-task${passed.has(p.id) ? ' done' : ''}`}>
            <span className="w-task-mark">{passed.has(p.id) && <Check size={13} />}</span>
            <span>
              {p.title}
              <span className="w-task-hint">{p.kind === 'standard' ? 'Standard ACL' : 'Extended ACL'}{passed.has(p.id) ? ', passed' : ''}</span>
            </span>
          </li>
        ))}
      </ul>

      <WildcardHelper />
      <p className="xsmall subtle acl-footnote">Source and destination are written as {specText({ kind: 'host', ip: '10.2.2.10' })}, {specText({ kind: 'wild', ip: '10.1.2.0', wildcard: '0.0.0.255' })} or any. Placement rule of thumb: standard near the destination, extended near the source.</p>
    </div>
  )
}
