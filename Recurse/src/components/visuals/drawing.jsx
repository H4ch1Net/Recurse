// Shared pieces for the drawn visuals: a measured panel that hands its width to the drawing,
// and SVG text lines from wrapText (layout.js).
import { useRef } from 'react'
import { useWidth } from '../../activities/lib/use-width'
import { DESKTOP_WIDTH, MIN_WIDTH, baseline, codeSize } from './layout'
import './visuals-svg.css'

/**
 * The panel a drawing sits in. Children is a function of the panel's inner width in pixels.
 * Nothing draws until the first measurement, so a phone never flashes the desktop layout;
 * where the width can never be measured (tests) the desktop layout draws right away.
 */
export function Measured({ className = '', children }) {
  const ref = useRef(null)
  const measured = useWidth(ref)
  const width = measured ?? (typeof ResizeObserver === 'undefined' ? DESKTOP_WIDTH : null)
  return (
    <div ref={ref} className={`vx-panel ${className}`}>
      {width !== null && children(Math.max(MIN_WIDTH, width))}
    </div>
  )
}

/** One piece of a wrapped line: bold and mono runs keep their style. */
function Run({ run, size }) {
  const cls = `${run.bold ? 'vx-b' : ''}${run.mono ? ' vx-m' : ''}`.trim()
  return (
    <tspan className={cls || undefined} style={run.small ? { fontSize: codeSize(size) } : undefined}>
      {run.text}
    </tspan>
  )
}

/**
 * Wrapped lines of SVG text. `top` is the top of the first line box; `anchor` is start, middle
 * or end at `x`.
 */
export function SvgLines({ lines, x, top, size, lineHeight, anchor = 'middle', className = '' }) {
  return (
    <text x={x} y={baseline(top, size, lineHeight)} textAnchor={anchor} className={`vx-text ${className}`} style={{ fontSize: size }}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lineHeight}>
          {line.runs.map((run, j) => (
            <Run key={j} run={run} size={size} />
          ))}
        </tspan>
      ))}
    </text>
  )
}

/** A filled arrowhead with its tip at (x, y), pointing along (ux, uy). */
export function Arrowhead({ x, y, ux, uy, size = 9, className = '' }) {
  const bx = x - ux * size
  const by = y - uy * size
  const px = -uy * size * 0.48
  const py = ux * size * 0.48
  return <path className={`vx-head ${className}`} d={`M${x} ${y} L${bx + px} ${by + py} L${bx - px} ${by - py} Z`} />
}
