import { memoryTone } from '../lib/progress'

/** Circular gauge for memory strength (0..1) or any ratio. */
export default function MemoryRing({ value, size = 120, stroke = 8, label = 'memory', toneOverride }) {
  const ratio = value === null || value === undefined ? 0 : Math.max(0, Math.min(1, value))
  const tone = toneOverride || memoryTone(value)
  const r = (size - stroke) / 2 - (size >= 90 ? 9 : 0)
  const c = 2 * Math.PI * r
  const text = value === null || value === undefined ? '—' : `${Math.round(ratio * 100)}%`
  return (
    <svg className={`mem-${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${text}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-3)" strokeWidth={stroke} />
      {/* Tick marks every 10%, like a gauge face. */}
      {size >= 90 && Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * 2 * Math.PI - Math.PI / 2
        const r1 = r + stroke / 2 + 3
        const r2 = r1 + 4
        return <line key={i} x1={size / 2 + r1 * Math.cos(a)} y1={size / 2 + r1 * Math.sin(a)} x2={size / 2 + r2 * Math.cos(a)} y2={size / 2 + r2 * Math.sin(a)} stroke="var(--rule-strong)" strokeWidth="1" />
      })}
      {ratio > 0 && (
        <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--mem)" strokeWidth={stroke} strokeLinecap="butt"
          strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ '--circ': c, transition: 'stroke-dashoffset 600ms var(--ease)' }} />
      )}
      <text x="50%" y="50%" dy="0.06em" textAnchor="middle" dominantBaseline="middle" className="ring-label" fontSize={size * 0.27} fill="var(--ink)">
        {text}
      </text>
      {size >= 100 && (
        <text x="50%" y="50%" dy={size * 0.2} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-mono)" letterSpacing="1.2" fill="var(--ink-3)">{label.toUpperCase()}</text>
      )}
    </svg>
  )
}
