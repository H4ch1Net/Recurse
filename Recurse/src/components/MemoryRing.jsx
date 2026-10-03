import { memoryTone } from '../lib/progress'

/** Circular gauge for memory strength (0..1) or any ratio. */
export default function MemoryRing({ value, size = 120, stroke = 10, label = 'memory', toneOverride }) {
  const ratio = value === null || value === undefined ? 0 : Math.max(0, Math.min(1, value))
  const tone = toneOverride || memoryTone(value)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const text = value === null || value === undefined ? '—' : `${Math.round(ratio * 100)}%`
  return (
    <svg className={`mem-${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${text}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--mem)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 600ms var(--ease)' }} />
      <text x="50%" y="50%" dy="0.06em" textAnchor="middle" dominantBaseline="middle" className="ring-label" fontSize={size * 0.24} fill="var(--text)">
        {text}
      </text>
      {size >= 100 && (
        <text x="50%" y="50%" dy={size * 0.2} textAnchor="middle" fontSize={11} fill="var(--text-3)">{label}</text>
      )}
    </svg>
  )
}
