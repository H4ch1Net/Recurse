import { useRef, useState } from 'react'
import { Check, CircleAlert, CircleCheck, Radio } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { useTokens, useWidth } from '../lib/net-anim'
import { Device, Label, LinkLine, SpeedControl, Token } from '../lib/net-svg'
import { GOAL_VLANS, HOSTS, VLANS, allowedText, defaultConfig, goalStatus, hostById, ipOf, mismatchLog, ping, runningConfig, showInterfacesTrunk, showVlanBrief } from '../lib/vlan-trunk'
import './vlan-trunk.css'

const VLAN_TONE = { 1: 'var(--ink-3)', 10: 'var(--accent)', 20: 'var(--good)', 30: 'var(--warn)' }
const VIEWS = [
  ['vlan', 'show vlan brief'],
  ['trunk', 'show interfaces trunk'],
  ['run', 'show running-config']
]

// Two layouts: side by side for wide screens, stacked (SW1 above SW2) for phones.
const LAYOUTS = {
  wide: {
    box: [480, 262],
    sw: { SW1: { x: 130, y: 72 }, SW2: { x: 350, y: 72 } },
    host: { PC1: { x: 55, y: 182 }, PC2: { x: 130, y: 182 }, PC3: { x: 205, y: 182 }, PC4: { x: 275, y: 182 }, PC5: { x: 350, y: 182 }, PC6: { x: 425, y: 182 } },
    link: [{ x: 160, y: 72 }, { x: 320, y: 72 }],
    title: { x: 240, y: 56, anchor: 'middle' },
    sub: { x: 240, y: 92, anchor: 'middle' },
    swLabel: (p) => ({ x: p.x, y: p.y - 24 }),
    marks: { SW1: { x: 130, y: 112 }, SW2: { x: 350, y: 112 }, link: { x: 240, y: 118 } },
    badge: (p) => ({ x: p.x + 22, y: p.y - 20 })
  },
  tall: {
    box: [320, 452],
    sw: { SW1: { x: 160, y: 150 }, SW2: { x: 160, y: 300 } },
    host: { PC1: { x: 60, y: 80 }, PC2: { x: 160, y: 80 }, PC3: { x: 260, y: 80 }, PC4: { x: 60, y: 370 }, PC5: { x: 160, y: 370 }, PC6: { x: 260, y: 370 } },
    link: [{ x: 160, y: 165 }, { x: 160, y: 285 }],
    title: { x: 150, y: 220, anchor: 'end' },
    sub: { x: 170, y: 228, anchor: 'start' },
    swLabel: (p, sw) => ({ x: p.x - 44, y: p.y + (sw === 'SW1' ? -2 : 8), anchor: 'end' }),
    marks: { SW1: { x: 160, y: 192 }, SW2: { x: 160, y: 262 }, link: { x: 160, y: 262 } },
    badge: (p) => ({ x: p.x + 31, y: p.y })
  }
}

const isAbove = (L, id) => L.host[id].y < L.sw[hostById(id).sw].y
/** Where a host's cable leaves the host. */
const hostEnd = (L, id) => ({ x: L.host[id].x, y: L.host[id].y + (isAbove(L, id) ? 13 : -16) })
/** Where a host's cable meets its switch: spread along the switch edge facing the host. */
function swPort(L, id) {
  const h = hostById(id)
  const index = Number(h.port.slice(-1)) - 2
  const sw = L.sw[h.sw]
  return { x: sw.x + index * 16, y: sw.y + (isAbove(L, id) ? -15 : 15) }
}

/** Two switches, six hosts: assign VLANs, build a trunk, and ping to see what crosses. */
export default function VlanTrunk({ onComplete }) {
  const [config, setConfig] = useState(defaultConfig)
  const [from, setFrom] = useState('PC1')
  const [to, setTo] = useState('PC4')
  const [result, setResult] = useState(null)
  const [fail, setFail] = useState(null)
  const [lit, setLit] = useState([])
  const [pinged, setPinged] = useState(() => new Set())
  const [view, setView] = useState('vlan')
  const [viewSw, setViewSw] = useState('SW1')
  const [speed, setSpeed] = useState(1)
  const [combo, setCombo] = useState(0)
  const stageRef = useRef(null)
  const wrapRef = useRef(null)
  const tasksRef = useRef(null)
  const reported = useRef(false)
  const { tokens, play, stop, busy } = useTokens()
  const width = useWidth(wrapRef, 640)
  const L = width < 520 ? LAYOUTS.tall : LAYOUTS.wide
  const tall = L === LAYOUTS.tall
  // The tall (phone) layout uses bigger type, so text-sized shapes grow with it.
  const k = tall ? 1.35 : 1
  const [LINK_A, LINK_B] = L.link

  const status = goalStatus(config)
  const log = mismatchLog(config)
  const link = config.link

  const change = (fn) => {
    stop()
    setResult(null)
    setFail(null)
    setLit([])
    setConfig((c) => {
      const next = structuredClone(c)
      fn(next)
      return next
    })
  }

  const setAccess = (id, vlan) => {
    sfx.tick()
    change((c) => {
      c.access[id] = vlan
    })
  }
  const setMode = (mode) => {
    sfx.tap()
    change((c) => {
      c.link.mode = mode
    })
  }
  const toggleAllowed = (vlan) => {
    sfx.tap()
    change((c) => {
      c.link.removed = c.link.removed.includes(vlan) ? c.link.removed.filter((v) => v !== vlan) : [...c.link.removed, vlan]
    })
  }

  const pickHost = (id) => {
    if (busy) return
    sfx.tap()
    if (id === from) return
    if (id === to) {
      setTo(from)
      setFrom(id)
    } else setTo(id)
  }

  const run = async () => {
    if (busy || from === to) return
    sfx.tap()
    const r = ping(config, from, to)
    setResult(null)
    setFail(null)
    const a = hostById(from)
    const b = hostById(to)
    const tagLabel = r.tag ? `802.1Q VLAN ${r.tag}` : 'untagged'
    const legs = (src, dst, tone) => {
      const s = hostById(src)
      const d = hostById(dst)
      const phases = [[{ from: hostEnd(L, src), to: swPort(L, src), tone }]]
      if (s.sw !== d.sw) phases.push([{ from: s.sw === 'SW1' ? LINK_A : LINK_B, to: s.sw === 'SW1' ? LINK_B : LINK_A, tone, label: tagLabel }])
      phases.push([{ from: swPort(L, dst), to: hostEnd(L, dst), tone }])
      return phases
    }
    let phases
    let mark = null
    if (r.ok) phases = [...legs(from, to, 'accent'), ...legs(to, from, 'good')]
    else if (r.reason === 'different-vlan') {
      phases = [[{ from: hostEnd(L, from), to: swPort(L, from), tone: 'accent' }]]
      mark = { ...L.marks[a.sw], text: 'No router between VLANs' }
    } else if (r.reason === 'native') {
      const request = legs(from, to, 'accent')
      const lost = r.leg === 'request' ? request.slice(0, 2) : [...request, ...legs(to, from, 'good').slice(0, 2)]
      phases = lost
      mark = { ...L.marks[r.leg === 'request' ? b.sw : a.sw], text: `Landed in VLAN ${r.landsIn}` }
    } else {
      phases = [[{ from: hostEnd(L, from), to: swPort(L, from), tone: 'accent' }], [{ from: a.sw === 'SW1' ? LINK_A : LINK_B, to: a.sw === 'SW1' ? LINK_B : LINK_A, tone: 'bad', drop: 0.12 }]]
      mark = { ...L.marks.link, text: r.reason === 'access-link' ? `Access link: VLAN ${link.accessVlan} only` : `VLAN ${r.vlan} not allowed` }
    }
    setLit([from, to])
    const ok = await play(phases, { duration: 620 / speed, onPhase: () => sfx.pop() })
    if (!ok) return
    setResult(r)
    setLit([])
    if (r.ok) {
      feedbackCorrect(stageRef.current, { combo })
      setCombo((c) => c + 1)
      if (r.crosses) {
        const next = new Set(pinged)
        next.add(r.vlan)
        setPinged(next)
        const goalNow = GOAL_VLANS.every((v) => next.has(v)) && status.done
        if (goalNow && !reported.current) {
          reported.current = true
          feedbackSuccess(tasksRef.current, 'All VLANs connected')
          onComplete({ score: 1, detail: 'VLANs 10, 20 and 30 reach across the trunk' })
        }
      }
    } else {
      setCombo(0)
      setFail(mark)
      feedbackWrong(stageRef.current)
    }
  }

  const terminalLines = view === 'vlan' ? showVlanBrief(config, viewSw) : view === 'trunk' ? showInterfacesTrunk(config, viewSw) : runningConfig(config, viewSw)
  const linkTitle = link.mode === 'trunk' ? `Trunk (802.1Q), native ${link.native.SW1 === link.native.SW2 ? link.native.SW1 : `${link.native.SW1} / ${link.native.SW2}`}` : `Access link, VLAN ${link.accessVlan}`
  const crossOk = GOAL_VLANS.filter((v) => pinged.has(v))

  return (
    <div className="vlan" ref={wrapRef}>
      <div className="w-stage grid-bg vlan-stage" ref={stageRef}>
        <svg viewBox={`0 0 ${L.box[0]} ${L.box[1]}`} className={`vlan-svg${L === LAYOUTS.tall ? ' tall' : ''}`} role="img" aria-label={`SW1 with PC1 to PC3 and SW2 with PC4 to PC6, joined by ${linkTitle}`}>
          <LinkLine a={LINK_A} b={LINK_B} state={link.mode === 'trunk' ? 'active' : 'idle'} width={link.mode === 'trunk' ? 6 : 2.5} />
          {link.mode === 'trunk' && (() => {
            // One thin colored lane per VLAN the trunk carries.
            const carried = VLANS.filter((v) => !link.removed.includes(v))
            const len = Math.hypot(LINK_B.x - LINK_A.x, LINK_B.y - LINK_A.y) || 1
            const ux = (LINK_B.x - LINK_A.x) / len
            const uy = (LINK_B.y - LINK_A.y) / len
            return (
              <g aria-hidden="true">
                {carried.map((v, i) => {
                  const off = (i - (carried.length - 1) / 2) * 2.4
                  return (
                    <line key={v} x1={LINK_A.x + ux * 6 - uy * off} y1={LINK_A.y + uy * 6 + ux * off} x2={LINK_B.x - ux * 6 - uy * off} y2={LINK_B.y - uy * 6 + ux * off}
                      style={{ stroke: VLAN_TONE[v], strokeWidth: 1.2, opacity: 0.9 }} />
                  )
                })}
              </g>
            )
          })()}
          <text x={L.title.x} y={L.title.y} textAnchor={L.title.anchor} className={`vlan-link-title${link.mode === 'trunk' ? ' trunk' : ''}`}>
            {L === LAYOUTS.tall
              ? linkTitle.split(', ').map((part, i) => <tspan key={i} x={L.title.x} dy={i ? 14 : 0}>{part}</tspan>)
              : linkTitle}
          </text>
          <text x={L.sub.x} y={L.sub.y} textAnchor={L.sub.anchor} className="vlan-port">Gi0/1 to Gi0/1</text>
          {HOSTS.map((h) => (
            <LinkLine key={h.id} a={swPort(L, h.id)} b={hostEnd(L, h.id)} state={lit.includes(h.id) ? 'active' : 'idle'} width={2} />
          ))}
          {['SW1', 'SW2'].map((sw) => {
            const lp = L.swLabel(L.sw[sw], sw)
            return (
              <g key={sw}>
                <Device kind="switch" x={L.sw[sw].x} y={L.sw[sw].y} w={62} h={30} />
                <Label x={lp.x} y={lp.y} anchor={lp.anchor} lines={[sw]} size={tall ? 14 : 12} />
              </g>
            )
          })}
          {HOSTS.map((h) => {
            const v = config.access[h.id]
            const role = h.id === from ? 'From' : h.id === to ? 'To' : null
            const p = L.host[h.id]
            // Labels sit on the side away from the switch: name, VLAN chip, IP.
            const up = isAbove(L, h.id)
            const y = up ? { name: p.y - 62, chip: p.y - 45, ip: p.y - 23 } : { name: p.y + 28, chip: p.y + 42, ip: p.y + 64 }
            const badge = L.badge(p)
            return (
              <g key={h.id} className="vlan-host" onClick={() => pickHost(h.id)}>
                <Device kind="pc" x={p.x} y={p.y} state={role === 'From' ? 'active' : role === 'To' ? 'good' : 'idle'} />
                <text x={p.x} y={y.name} textAnchor="middle" className="vlan-host-name">{h.id} <tspan className="vlan-port">{h.port}</tspan></text>
                <g transform={`translate(${p.x} ${y.chip})`}>
                  <rect x={tall ? -33 : -25} y={tall ? -11 : -9} width={tall ? 66 : 50} height={tall ? 19 : 16} rx={tall ? 9.5 : 8} style={{ fill: VLAN_TONE[v], transition: 'fill 200ms ease' }} />
                  <text y={tall ? 3.5 : 3} textAnchor="middle" className="vlan-chip-text">VLAN {v}</text>
                </g>
                <text x={p.x} y={y.ip} textAnchor="middle" className="vlan-ip">{ipOf(config, h.id)}</text>
                {role && (
                  <g transform={`translate(${badge.x} ${badge.y})`} className={`vlan-role ${role === 'From' ? 'from' : 'to'}`}>
                    {tall ? <rect x="-21" y="-10" width="42" height="19" rx="9.5" /> : <rect x="-15" y="-8" width="30" height="15" rx="7.5" />}
                    <text y={tall ? 4 : 3} textAnchor="middle">{role}</text>
                  </g>
                )}
              </g>
            )
          })}
          {fail && (
            <g className="vlan-fail" transform={`translate(${fail.x} ${fail.y})`}>
              <rect x={-fail.text.length * 3.1 * k - 16} y="-11" width={fail.text.length * 6.2 * k + 32} height={tall ? 22 : 20} rx="10" style={{ fill: 'var(--bad)' }} />
              <path d={`M${-fail.text.length * 3.1 * k - 8} -4 l7 7 m0 -7 l-7 7`} style={{ stroke: 'var(--card)', strokeWidth: 2, strokeLinecap: 'round' }} />
              <text x="6" y="3.5" textAnchor="middle" className="vlan-fail-text">{fail.text}</text>
            </g>
          )}
          {tokens.map((t) => <Token key={t.id} token={t} />)}
        </svg>
      </div>

      <div className="vlan-ping">
        <div className="vlan-pick">
          <span className="vlan-label">From</span>
          <div className="w-pill-group" role="group" aria-label="Ping from">
            {HOSTS.map((h) => <button key={h.id} type="button" aria-pressed={from === h.id} disabled={busy} onClick={() => { sfx.tap(); setFrom(h.id); if (to === h.id) setTo(from) }}>{h.id.slice(2)}</button>)}
          </div>
        </div>
        <div className="vlan-pick">
          <span className="vlan-label">To</span>
          <div className="w-pill-group" role="group" aria-label="Ping to">
            {HOSTS.map((h) => <button key={h.id} type="button" aria-pressed={to === h.id} disabled={busy || h.id === from} onClick={() => { sfx.tap(); setTo(h.id) }}>{h.id.slice(2)}</button>)}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy || from === to}>
          <Radio size={15} /> Ping {ipOf(config, to)}
        </button>
        <SpeedControl speed={speed} onChange={setSpeed} />
      </div>

      <div aria-live="polite">
        {result && (
          <div className={`callout ${result.ok ? 'good' : 'bad'} vlan-result`}>
            {result.ok ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
            <div>
              <strong className="mono">{result.ok ? `Reply from ${ipOf(config, to)}` : 'Request timed out.'}</strong>
              <p>{result.text}</p>
            </div>
          </div>
        )}
      </div>

      <div className="vlan-panels">
        <section className="vlan-panel" aria-labelledby="vlan-access-h">
          <h4 id="vlan-access-h" className="vlan-h">Access ports</h4>
          {['SW1', 'SW2'].map((sw) => (
            <div key={sw} className="vlan-sw">
              <strong>{sw}</strong>
              {HOSTS.filter((h) => h.sw === sw).map((h) => (
                <label key={h.id} className="vlan-row">
                  <span>{h.port} ({h.id})</span>
                  <select className="select" value={config.access[h.id]} disabled={busy} onChange={(e) => setAccess(h.id, Number(e.target.value))}>
                    {VLANS.map((v) => <option key={v} value={v}>VLAN {v}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ))}
        </section>

        <section className="vlan-panel" aria-labelledby="vlan-link-h">
          <h4 id="vlan-link-h" className="vlan-h">Link between the switches (Gi0/1)</h4>
          <div className="w-pill-group" role="group" aria-label="Link mode">
            <button type="button" aria-pressed={link.mode === 'access'} disabled={busy} onClick={() => setMode('access')}>Access</button>
            <button type="button" aria-pressed={link.mode === 'trunk'} disabled={busy} onClick={() => setMode('trunk')}>Trunk</button>
          </div>
          {link.mode === 'access' ? (
            <label className="vlan-row">
              <span>Access VLAN (both ends)</span>
              <select className="select" value={link.accessVlan} disabled={busy} onChange={(e) => { sfx.tick(); change((c) => { c.link.accessVlan = Number(e.target.value) }) }}>
                {VLANS.map((v) => <option key={v} value={v}>VLAN {v}</option>)}
              </select>
            </label>
          ) : (
            <>
              <div className="vlan-row">
                <span>Allowed VLANs</span>
                <div className="vlan-allowed" role="group" aria-label="Allowed VLANs on the trunk">
                  {VLANS.map((v) => (
                    <button key={v} type="button" className="vlan-allow" aria-pressed={!link.removed.includes(v)} disabled={busy} onClick={() => toggleAllowed(v)} style={{ '--vlan': VLAN_TONE[v] }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <p className="vlan-sub mono">switchport trunk allowed vlan {allowedText(link.removed)}</p>
              {['SW1', 'SW2'].map((sw) => (
                <label key={sw} className="vlan-row">
                  <span>{sw} native VLAN</span>
                  <select className="select" value={link.native[sw]} disabled={busy} onChange={(e) => { sfx.tick(); change((c) => { c.link.native[sw] = Number(e.target.value) }) }}>
                    {VLANS.map((v) => <option key={v} value={v}>VLAN {v}</option>)}
                  </select>
                </label>
              ))}
              <p className="vlan-sub">Frames in the native VLAN cross untagged. Every other VLAN gets a 4-byte 802.1Q tag holding its 12-bit VLAN ID.</p>
            </>
          )}
        </section>
      </div>

      <div className="terminal vlan-term">
        <div className="terminal-bar"><span className="dot" /><span className="dot" /><span className="dot" />{viewSw}# {VIEWS.find(([k]) => k === view)[1]}</div>
        <div className="vlan-term-tabs">
          <div className="w-pill-group" role="group" aria-label="Switch">
            {['SW1', 'SW2'].map((sw) => <button key={sw} type="button" aria-pressed={viewSw === sw} onClick={() => setViewSw(sw)}>{sw}</button>)}
          </div>
          <div className="w-pill-group" role="group" aria-label="Command">
            {VIEWS.map(([k, label]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{label.replace('show ', '')}</button>)}
          </div>
        </div>
        <pre className="terminal-screen vlan-pre">
          {log && <span className="terminal-err">{log}{'\n\n'}</span>}
          {terminalLines.length ? terminalLines.join('\n') : <span className="terminal-dim">(no output: Gi0/1 is not trunking, so there are no trunks to show)</span>}
        </pre>
      </div>

      <ul className="w-tasks" ref={tasksRef}>
        <li className={`w-task${status.assigned ? ' done' : ''}`}>
          <span className="w-task-mark">{status.assigned && <Check size={13} />}</span>
          <span>Put one host on each switch into each of VLAN 10, 20 and 30<span className="w-task-hint">Every port starts in VLAN 1, the default.</span></span>
        </li>
        <li className={`w-task${status.trunk ? ' done' : ''}`}>
          <span className="w-task-mark">{status.trunk && <Check size={13} />}</span>
          <span>Make the link a trunk that carries VLANs 10, 20 and 30<span className="w-task-hint">An access link carries exactly one VLAN.</span></span>
        </li>
        <li className={`w-task${crossOk.length === 3 && status.done ? ' done' : ''}`}>
          <span className="w-task-mark">{crossOk.length === 3 && status.done && <Check size={13} />}</span>
          <span>Ping across the switches in each VLAN ({crossOk.length}/3{crossOk.length ? `: VLAN ${crossOk.join(', ')}` : ''})<span className="w-task-hint">Then break it on purpose: set different native VLANs and ping in one of them.</span></span>
        </li>
      </ul>
    </div>
  )
}
