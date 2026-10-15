// Shared SVG pieces for the networking widgets: device icons (router, switch, PC, hub),
// links, labels, the packet token, and the step/play/speed controls. Colors come
// from the design tokens so every theme stays readable.
import { Pause, Play, RotateCcw, StepBack, StepForward } from 'lucide-react'
import { SPEEDS } from './net-anim'

const TONES = {
  idle: { fill: 'transparent', stroke: 'var(--ink-2)', ink: 'var(--ink-2)' },
  active: { fill: 'var(--accent-soft)', stroke: 'var(--accent)', ink: 'var(--accent-text)' },
  good: { fill: 'var(--good-soft)', stroke: 'var(--good)', ink: 'var(--good)' },
  bad: { fill: 'var(--bad-soft)', stroke: 'var(--bad)', ink: 'var(--bad)' },
  warn: { fill: 'var(--warn-soft)', stroke: 'var(--warn)', ink: 'var(--warn)' },
  dim: { fill: 'transparent', stroke: 'var(--rule-strong)', ink: 'var(--ink-3)' }
}

const tone = (name) => TONES[name] || TONES.idle
const arrowStyle = (c) => ({ stroke: c.ink, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
const motion = { transition: 'fill 200ms ease, stroke 200ms ease' }

/** Router: a circle with arrows in and out, like the classic diagram symbol. */
export function RouterIcon({ x, y, r = 20, state = 'idle' }) {
  const c = tone(state)
  const k = r * 0.68
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r={r} style={{ fill: 'var(--card)' }} />
      <circle r={r} style={{ ...motion, fill: c.fill, stroke: c.stroke, strokeWidth: 2 }} />
      <g style={arrowStyle(c)}>
        <path d={`M0 -3 V${-k} M-3.5 ${-k + 4} L0 ${-k} L3.5 ${-k + 4}`} />
        <path d={`M0 3 V${k} M-3.5 ${k - 4} L0 ${k} L3.5 ${k - 4}`} />
        <path d={`M${-k} 0 H-3 M-6.5 -3.5 L-3 0 L-6.5 3.5`} />
        <path d={`M${k} 0 H3 M6.5 -3.5 L3 0 L6.5 3.5`} />
      </g>
    </g>
  )
}

/** Switch: a flat box with arrows both ways. */
export function SwitchIcon({ x, y, w = 52, h = 28, state = 'idle' }) {
  const c = tone(state)
  const a = w / 2 - 10
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="5" style={{ fill: 'var(--card)' }} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="5" style={{ ...motion, fill: c.fill, stroke: c.stroke, strokeWidth: 2 }} />
      <g style={arrowStyle(c)}>
        <path d={`M${-a} -5 H${a} M${a - 4} -8.5 L${a} -5 L${a - 4} -1.5`} />
        <path d={`M${a} 5 H${-a} M${-a + 4} 1.5 L${-a} 5 L${-a + 4} 8.5`} />
      </g>
    </g>
  )
}

/** Desktop PC: a monitor on a stand. */
export function PcIcon({ x, y, state = 'idle' }) {
  const c = tone(state)
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x="-16" y="-15" width="32" height="22" rx="3" style={{ fill: 'var(--card)' }} />
      <rect x="-16" y="-15" width="32" height="22" rx="3" style={{ ...motion, fill: c.fill, stroke: c.stroke, strokeWidth: 2 }} />
      <rect x="-11" y="-10.5" width="22" height="13" rx="1.5" style={{ fill: 'none', stroke: c.ink, strokeWidth: 1, opacity: 0.6 }} />
      <path d="M0 7 V12 M-8 13 H8" style={{ stroke: c.stroke, strokeWidth: 2, strokeLinecap: 'round' }} />
    </g>
  )
}

/** Hub: a Layer 1 repeater, drawn as a narrow box with a two-way arrow. */
export function HubIcon({ x, y, state = 'idle' }) {
  const c = tone(state)
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x="-22" y="-10" width="44" height="20" rx="10" style={{ fill: 'var(--card)' }} />
      <rect x="-22" y="-10" width="44" height="20" rx="10" style={{ ...motion, fill: c.fill, stroke: c.stroke, strokeWidth: 2, strokeDasharray: '4 2' }} />
      <g style={arrowStyle(c)}>
        <path d="M-12 0 H12 M-8 -3.5 L-12 0 L-8 3.5 M8 -3.5 L12 0 L8 3.5" />
      </g>
    </g>
  )
}

/** A device by kind. */
export function Device({ kind, ...rest }) {
  if (kind === 'router') return <RouterIcon {...rest} />
  if (kind === 'switch') return <SwitchIcon {...rest} />
  if (kind === 'hub') return <HubIcon {...rest} />
  return <PcIcon {...rest} />
}

/** A link between two points. */
export function LinkLine({ a, b, state = 'idle', dashed = false, width = 2.5 }) {
  const stroke = { idle: 'var(--rule-strong)', active: 'var(--accent)', good: 'var(--good)', bad: 'var(--bad)', warn: 'var(--warn)', dim: 'var(--rule)' }[state] || 'var(--rule-strong)'
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      style={{ stroke, strokeWidth: width, strokeLinecap: 'round', strokeDasharray: dashed ? '6 5' : undefined, transition: 'stroke 200ms ease' }}
    />
  )
}

/**
 * Multi-line label. `lines` are strings or { text, mono, strong, tone }.
 * The first line is bold by default.
 */
export function Label({ x, y, lines, anchor = 'middle', size = 11, gap = 13 }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ fontSize: size, fontFamily: 'var(--font-ui)' }}>
      {lines.filter(Boolean).map((line, i) => {
        const item = typeof line === 'string' ? { text: line } : line
        const strong = item.strong ?? i === 0
        const fill = item.tone === 'accent' ? 'var(--accent-text)' : item.tone === 'good' ? 'var(--good)' : item.tone === 'bad' ? 'var(--bad)' : item.tone === 'warn' ? 'var(--warn)' : strong ? 'var(--ink)' : 'var(--ink-3)'
        return (
          <tspan
            key={i}
            x={x}
            dy={i === 0 ? 0 : gap}
            style={{ fill, fontWeight: strong ? 700 : 400, fontFamily: item.mono ? 'var(--font-mono)' : undefined, fontSize: item.size || (item.mono ? size - 1 : size) }}
          >
            {item.text}
          </tspan>
        )
      })}
    </text>
  )
}

/** The moving packet: a small envelope, with an optional caption chip above it. */
export function Token({ token, size = 1 }) {
  const fill = { warn: 'var(--warn)', bad: 'var(--bad)', good: 'var(--good)', ink: 'var(--ink-2)' }[token.tone] || 'var(--accent)'
  return (
    <g transform={`translate(${token.x} ${token.y}) scale(${size})`} style={{ opacity: token.opacity }} aria-hidden="true">
      <rect x="-9" y="-6.5" width="18" height="13" rx="2.5" style={{ fill, stroke: 'var(--card)', strokeWidth: 1.5 }} />
      <path d="M-8 -5 L0 1 L8 -5" style={{ fill: 'none', stroke: 'var(--card)', strokeWidth: 1.4, strokeLinejoin: 'round' }} />
      {token.label && (
        <g transform="translate(0 -15)">
          <rect x={-token.label.length * 3.1 - 5} y="-8" width={token.label.length * 6.2 + 10} height="14" rx="7" style={{ fill: 'var(--card)', stroke: fill, strokeWidth: 1 }} />
          <text y="2.5" textAnchor="middle" style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', fontWeight: 700, fill: 'var(--ink)' }}>
            {token.label}
          </text>
        </g>
      )}
    </g>
  )
}

/** Animation speed pills (0.5x, 1x, 2x). */
export function SpeedControl({ speed, onChange }) {
  return (
    <div className="w-pill-group" role="group" aria-label="Animation speed">
      {SPEEDS.map((s) => (
        <button key={s} type="button" aria-pressed={speed === s} onClick={() => onChange(s)}>
          {s}x
        </button>
      ))}
    </div>
  )
}

/** Back, Play/Pause, Step, Restart and speed for step-through visualizations. */
export function StepControls({ playing, onPlay, onPause, onStep, onBack, onRestart, canStep = true, canBack = true, speed, onSpeed, stepLabel = 'Step' }) {
  return (
    <div className="row wrap" style={{ gap: 'var(--s-2)' }}>
      <button type="button" className="btn btn-sm" onClick={onBack} disabled={!canBack || playing} aria-label="Previous step">
        <StepBack size={14} />
      </button>
      {playing ? (
        <button type="button" className="btn btn-sm" onClick={onPause}>
          <Pause size={14} /> Pause
        </button>
      ) : (
        <button type="button" className="btn btn-sm" onClick={onPlay} disabled={!canStep}>
          <Play size={14} /> Play
        </button>
      )}
      <button type="button" className="btn btn-sm btn-primary" onClick={onStep} disabled={!canStep || playing}>
        <StepForward size={14} /> {stepLabel}
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={onRestart} aria-label="Start over">
        <RotateCcw size={14} />
      </button>
      {onSpeed && <SpeedControl speed={speed} onChange={onSpeed} />}
    </div>
  )
}
