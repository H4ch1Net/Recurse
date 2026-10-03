import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, dayKey, startOfDay } from '../lib/dates'

/** Hover tooltip positioned inside a relatively positioned chart frame. */
function useTooltip() {
  const [tip, setTip] = useState(null)
  const show = (event, text) => {
    const frame = event.currentTarget.closest('.chart-frame')?.getBoundingClientRect()
    const box = event.currentTarget.getBoundingClientRect()
    if (!frame) return
    setTip({ text, x: box.left - frame.left + box.width / 2, y: box.top - frame.top })
  }
  const node = tip && (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="presentation">{tip.text}</div>
  )
  return { show, hide: () => setTip(null), node }
}

/** Column chart of reviews due per day. Single series, value labels on today and the peak. */
export function ForecastChart({ counts, now = new Date() }) {
  const { show, hide, node } = useTooltip()
  const width = 640
  const height = 180
  const pad = { top: 22, bottom: 26, left: 4, right: 4 }
  const max = Math.max(1, ...counts)
  const slot = (width - pad.left - pad.right) / counts.length
  const barW = Math.min(24, slot - 6)
  const plotH = height - pad.top - pad.bottom
  const peak = counts.indexOf(Math.max(...counts))
  const total = counts.reduce((a, b) => a + b, 0)
  const label = (i) => (i === 0 ? 'Today' : addDays(now, i).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))

  return (
    <div className="chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label={`Reviews due over the next ${counts.length} days, ${total} in total`}>
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom + 0.5} y2={height - pad.bottom + 0.5} stroke="var(--rule-strong)" />
        {counts.map((n, i) => {
          const h = n ? Math.max(4, (n / max) * plotH) : 0
          const x = pad.left + i * slot + (slot - barW) / 2
          const y = height - pad.bottom - h
          const r = Math.min(4, h / 2, barW / 2)
          const path = h
            ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`
            : ''
          const date = addDays(now, i)
          return (
            <g key={i}>
              <rect
                x={pad.left + i * slot}
                y={pad.top - 10}
                width={slot}
                height={plotH + 10}
                fill="transparent"
                onMouseEnter={(e) => show(e, `${label(i)}: ${n} ${n === 1 ? 'review' : 'reviews'}`)}
                onMouseLeave={hide}
              />
              {h > 0 && <path d={path} fill={i === 0 ? 'var(--accent)' : 'var(--heat-2)'} pointerEvents="none" />}
              {n > 0 && (i === 0 || i === peak) && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="chart-value">{n}</text>
              )}
              {i % 3 === 0 && (
                <text x={pad.left + i * slot + slot / 2} y={height - 8} textAnchor="middle" className="chart-axis">
                  {i === 0 ? 'Today' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {node}
      <details className="chart-table">
        <summary className="xsmall subtle">Show as table</summary>
        <table>
          <tbody>
            {counts.map((n, i) => (
              <tr key={i}><th scope="row">{label(i)}</th><td className="tabular">{n}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/** GitHub-style calendar of reviews per day, one hue from light to dark. */
export function ActivityHeatmap({ days, weeks = 52, now = new Date() }) {
  const { show, hide, node } = useTooltip()
  const scrollRef = useRef(null)
  // Start scrolled to the most recent weeks on narrow screens.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [])
  const cells = useMemo(() => {
    const end = startOfDay(now)
    const start = addDays(end, -(weeks * 7 - 1) - end.getDay())
    const list = []
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const key = dayKey(d)
      list.push({ date: new Date(d), key, reviews: days[key]?.reviews || 0 })
    }
    return list
  }, [days, weeks, now])
  const max = Math.max(1, ...cells.map((c) => c.reviews))
  const level = (n) => (n === 0 ? 0 : n <= max * 0.25 ? 1 : n <= max * 0.5 ? 2 : n <= max * 0.75 ? 3 : 4)
  const size = 12
  const gap = 3
  const columns = Math.ceil(cells.length / 7)
  const left = 22
  const top = 16
  const width = left + columns * (size + gap) + 24
  const height = top + 7 * (size + gap)
  const activeDays = cells.filter((c) => c.reviews > 0).length
  const months = []
  cells.forEach((c, i) => {
    if (c.date.getDate() === 1 || i === 0) months.push({ col: Math.floor(i / 7), label: c.date.toLocaleDateString(undefined, { month: 'short' }) })
  })

  return (
    <div className="chart-frame heatmap-frame">
      <div className="heatmap-scroll" ref={scrollRef}>
        <svg width={width} height={height} className="heatmap-svg" role="img" aria-label={`Study activity: ${activeDays} active days in the last ${weeks} weeks`}>
          {months.filter((m, i, arr) => i === 0 || m.col - arr[i - 1].col > 2).map((m) => (
            <text key={`${m.col}-${m.label}`} x={left + m.col * (size + gap)} y={10} className="chart-axis">{m.label}</text>
          ))}
          {['M', 'W', 'F'].map((d, i) => (
            <text key={d} x={0} y={top + (i * 2 + 1) * (size + gap) + size - 2} className="chart-axis">{d}</text>
          ))}
          {cells.map((c, i) => (
            <rect
              key={c.key}
              x={left + Math.floor(i / 7) * (size + gap)}
              y={top + (i % 7) * (size + gap)}
              width={size}
              height={size}
              rx={3}
              fill={`var(--heat-${level(c.reviews)})`}
              onMouseEnter={(e) => show(e, `${c.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${c.reviews} ${c.reviews === 1 ? 'review' : 'reviews'}`)}
              onMouseLeave={hide}
            />
          ))}
        </svg>
      </div>
      {node}
      <div className="heatmap-legend xsmall subtle" aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((l) => <span key={l} style={{ background: `var(--heat-${l})` }} />)}
        More
      </div>
    </div>
  )
}

/** Horizontal bars with labels and values in text tokens; the mark carries the color. */
export function BarList({ rows, format = (v) => `${Math.round(v * 100)}%`, empty = 'No data yet.' }) {
  if (!rows.length) return <p className="small subtle">{empty}</p>
  return (
    <div className="bar-list">
      {rows.map((row) => (
        <div key={row.key} className={`bar-list-row ${row.className || ''}`} title={row.title}>
          <div className="row between small">
            <span className="bar-list-label">{row.label}</span>
            <span className="tabular muted">{row.valueLabel ?? format(row.value)}</span>
          </div>
          <div className={`bar ${row.className ? 'mem' : ''}`} aria-hidden="true">
            <span style={{ width: `${Math.max(2, Math.min(1, row.value) * 100)}%` }} />
          </div>
          {row.note && <div className="xsmall subtle">{row.note}</div>}
        </div>
      ))}
    </div>
  )
}
