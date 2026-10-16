// Device icons for lesson diagrams, one per topology node kind. Router, switch and PC come from
// the networking widgets (activities/lib/net-svg.jsx); the rest are drawn in the same language:
// an opaque card underlay, a tinted body with a 2px edge and 1.8px glyph strokes. Each icon is
// centered on (x, y) and fits the box listed in ICON_BOX (layout.js).
import { PcIcon, RouterIcon, SwitchIcon } from '../../activities/lib/net-svg'

const TONES = {
  none: { fill: 'transparent', stroke: 'var(--ink-2)', ink: 'var(--ink-2)' },
  accent: { fill: 'var(--accent-soft)', stroke: 'var(--accent)', ink: 'var(--accent-text)' },
  good: { fill: 'var(--good-soft)', stroke: 'var(--good)', ink: 'var(--good)' },
  bad: { fill: 'var(--bad-soft)', stroke: 'var(--bad)', ink: 'var(--bad)' },
  warn: { fill: 'var(--warn-soft)', stroke: 'var(--warn)', ink: 'var(--warn)' },
  muted: { fill: 'transparent', stroke: 'var(--rule-strong)', ink: 'var(--ink-3)' }
}
// The widget icons name their tones by state.
const STATE = { accent: 'active', good: 'good', bad: 'bad', warn: 'warn', muted: 'dim' }

const under = { fill: 'var(--card)' }
const body = (c) => ({ fill: c.fill, stroke: c.stroke, strokeWidth: 2, strokeLinejoin: 'round' })
const glyph = (c, width = 1.8) => ({ fill: 'none', stroke: c.ink, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' })
const dot = (c) => ({ fill: c.ink })

/** A shape drawn twice: opaque underlay, then the tinted body on top. */
function Shape({ as: Tag, c, ...attrs }) {
  return (
    <>
      <Tag {...attrs} style={under} />
      <Tag {...attrs} style={body(c)} />
    </>
  )
}

/** Layer 3 switch: a switch box with arrows out to all four sides. */
function L3Switch({ c }) {
  return (
    <>
      <Shape as="rect" c={c} x="-26" y="-17" width="52" height="34" rx="5" />
      <g style={glyph(c)}>
        <path d="M0 -3.5 V-11 M-3.5 -7.5 L0 -11 L3.5 -7.5" />
        <path d="M0 3.5 V11 M-3.5 7.5 L0 11 L3.5 7.5" />
        <path d="M-5 0 H-17 M-13.5 -3.5 L-17 0 L-13.5 3.5" />
        <path d="M5 0 H17 M13.5 -3.5 L17 0 L13.5 3.5" />
      </g>
    </>
  )
}

/** Firewall: a brick wall. */
function Firewall({ c }) {
  return (
    <>
      <Shape as="rect" c={c} x="-22" y="-16" width="44" height="32" rx="3" />
      <g style={{ ...glyph(c, 1.4), opacity: 0.85 }}>
        <path d="M-22 -5.3 H22 M-22 5.3 H22" />
        <path d="M-8 -16 V-5.3 M8 -16 V-5.3 M0 -5.3 V5.3 M-15 -5.3 V5.3 M15 -5.3 V5.3 M-8 5.3 V16 M8 5.3 V16" />
      </g>
    </>
  )
}

/** Server: a tower with drive bays and a power light. */
function Server({ c }) {
  return (
    <>
      <Shape as="rect" c={c} x="-15" y="-20" width="30" height="40" rx="3" />
      <g style={glyph(c)}>
        <path d="M-8 -12 H8 M-8 -5.5 H8 M-8 1 H8" />
      </g>
      <circle cx="0" cy="11" r="2.2" style={dot(c)} />
    </>
  )
}

/** Laptop: a screen on a keyboard base. */
function Laptop({ c }) {
  return (
    <>
      <Shape as="rect" c={c} x="-15" y="-15" width="30" height="21" rx="2.5" />
      <rect x="-10.5" y="-11" width="21" height="13" rx="1.5" style={{ ...glyph(c, 1), opacity: 0.6 }} />
      <Shape as="path" c={c} d="M-21 8 H21 L18 14 H-18 Z" />
    </>
  )
}

/** IP phone: a handset beside a body with a screen and keypad. */
function Phone({ c }) {
  const keys = []
  for (const x of [-3, 3, 9]) for (const y of [1.5, 6, 10.5]) keys.push(<circle key={`${x},${y}`} cx={x} cy={y} r="1.3" style={dot(c)} />)
  return (
    <>
      <Shape as="rect" c={c} x="-10" y="-14" width="26" height="28" rx="4" />
      <Shape as="rect" c={c} x="-18" y="-15" width="7" height="30" rx="3.5" />
      <rect x="-5" y="-9.5" width="16" height="6" rx="1" style={glyph(c, 1.3)} />
      {keys}
    </>
  )
}

/** Printer: paper in, body, paper out. */
function Printer({ c }) {
  return (
    <>
      <Shape as="rect" c={c} x="-11" y="-17" width="22" height="10" rx="1.5" />
      <Shape as="rect" c={c} x="-19" y="-8" width="38" height="17" rx="3" />
      <Shape as="rect" c={c} x="-12" y="4" width="24" height="13" rx="1.5" />
      <path d="M-7 9 H7 M-7 13 H3" style={glyph(c, 1.3)} />
      <circle cx="13.5" cy="-2.5" r="1.8" style={dot(c)} />
    </>
  )
}

/** Wireless access point: a flat puck with radio waves above it. */
function AccessPoint({ c }) {
  return (
    <>
      <Shape as="rect" c={c} x="-17" y="4" width="34" height="11" rx="5.5" />
      <g style={glyph(c)}>
        <path d="M-4.9 -0.9 A7 7 0 0 1 4.9 -0.9" />
        <path d="M-8.5 -4.5 A12 12 0 0 1 8.5 -4.5" />
        <path d="M-12 -8 A17 17 0 0 1 12 -8" />
      </g>
      <circle cx="0" cy="9.5" r="1.8" style={dot(c)} />
    </>
  )
}

/** Wireless LAN controller: a rack unit with a radio symbol and status lights. */
function Wlc({ c }) {
  return (
    <>
      <Shape as="rect" c={c} x="-25" y="-14" width="50" height="28" rx="4" />
      <g style={glyph(c, 1.6)}>
        <path d="M-15.5 1 A5 5 0 0 1 -8.5 1" />
        <path d="M-18.5 -2 A9.5 9.5 0 0 1 -5.5 -2" />
      </g>
      <circle cx="-12" cy="5" r="1.8" style={dot(c)} />
      <path d="M2 -5 H17 M2 1 H17 M2 7 H11" style={glyph(c, 1.6)} />
    </>
  )
}

/** Cloud: a WAN, provider or cloud service. */
function Cloud({ c }) {
  const d = 'M-19 15 A9 9 0 0 1 -23 -1 A10 10 0 0 1 -9 -10 A13 13 0 0 1 15 -8 A10 10 0 0 1 21 15 Z'
  return <Shape as="path" c={c} d={d} />
}

/** The internet: a globe. */
function Internet({ c }) {
  return (
    <>
      <Shape as="circle" c={c} r="18" />
      <g style={glyph(c, 1.3)}>
        <ellipse rx="7.5" ry="18" />
        <path d="M-18 0 H18 M-15.6 -9 H15.6 M-15.6 9 H15.6" />
      </g>
    </>
  )
}

/** Database: a cylinder. */
function Database({ c }) {
  return (
    <>
      <Shape as="path" c={c} d="M-15 -14 V14 A15 5.5 0 0 0 15 14 V-14" />
      <Shape as="ellipse" c={c} cy="-14" rx="15" ry="5.5" />
      <path d="M-15 0 A15 5.5 0 0 0 15 0" style={glyph(c, 1.3)} />
    </>
  )
}

/** Host: a workstation, monitor and tower. */
function Host({ c }) {
  return (
    <>
      <Shape as="rect" c={c} x="-22" y="-14" width="30" height="21" rx="2.5" />
      <rect x="-17.5" y="-10" width="21" height="13" rx="1.5" style={{ ...glyph(c, 1), opacity: 0.6 }} />
      <path d="M-7 7 V12 M-14 14 H0" style={{ ...glyph(c, 2), stroke: c.stroke }} />
      <Shape as="rect" c={c} x="11" y="-17" width="11" height="31" rx="2" />
      <path d="M14 -11 H19 M14 -7 H19" style={glyph(c, 1.4)} />
    </>
  )
}

const DRAWN = { l3switch: L3Switch, firewall: Firewall, server: Server, laptop: Laptop, phone: Phone, printer: Printer, ap: AccessPoint, wlc: Wlc, cloud: Cloud, internet: Internet, db: Database, host: Host }

/** A device icon by node kind, centered on (x, y), tinted by tone. */
export function DeviceIcon({ kind, x, y, tone, scale = 1 }) {
  const state = STATE[tone] || 'idle'
  const move = `translate(${x} ${y})${scale !== 1 ? ` scale(${scale})` : ''}`
  if (kind === 'router') return <g transform={move}><RouterIcon x={0} y={0} state={state} /></g>
  if (kind === 'switch') return <g transform={move}><SwitchIcon x={0} y={0} state={state} /></g>
  if (kind === 'pc') return <g transform={move}><PcIcon x={0} y={0} state={state} /></g>
  const Drawn = DRAWN[kind] || Host
  return (
    <g transform={move} aria-hidden="true">
      <Drawn c={TONES[tone] || TONES.none} />
    </g>
  )
}
