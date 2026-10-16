import { Inline } from '../RichText'

const format = (n) => (Math.abs(n) >= 1e15 ? n.toExponential(1) : n.toLocaleString('en-US', { maximumFractionDigits: 2 }))

/** Share of the track for a value: linear from 0, or logarithmic across the range shown. */
function barShare(value, values, scale = 'linear') {
  const max = Math.max(...values)
  if (!(max > 0)) return 0
  if (scale !== 'log') return value / max
  const lo = Math.log10(Math.min(...values)) - 0.5
  const hi = Math.log10(max)
  return hi === lo ? 1 : (Math.log10(value) - lo) / (hi - lo)
}

/** Horizontal bars for comparing sizes. */
export default function Bars({ spec }) {
  const values = spec.items.map((item) => item.value)
  const unit = spec.unit ? (spec.unit === '%' ? '%' : ` ${spec.unit}`) : ''
  return (
    <div className="v-bars-wrap">
      <ul className="v-bars">
        {spec.items.map((item, i) => {
          const share = Math.max(0.015, Math.min(1, barShare(item.value, values, spec.scale)))
          return (
            <li key={i} className={`v-bar${item.tone ? ` toned v-tone-${item.tone}` : ''}`}>
              <span className="v-bar-label"><Inline text={item.label} /></span>
              <span className="v-bar-track">
                <span className="v-bar-fill" style={{ width: `calc((100% - 7em) * ${share.toFixed(4)})` }} />
                <span className="v-bar-value">{item.display !== undefined ? String(item.display) : format(item.value)}{unit}</span>
              </span>
            </li>
          )
        })}
      </ul>
      {spec.scale === 'log' && <div className="v-bars-note">Log scale: each step to the right is about ten times bigger.</div>}
    </div>
  )
}
