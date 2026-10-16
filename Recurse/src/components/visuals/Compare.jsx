import { Check } from 'lucide-react'
import { Inline } from '../RichText'

/** Two or three things side by side, stacked when the box is narrow. */
export default function Compare({ spec }) {
  return (
    <div className="v-compare-wrap">
      <div className={`v-compare n${spec.items.length}`}>
        {spec.items.map((item, i) => (
          <section key={i} className={`v-compare-item v-tone-${item.tone || 'muted'}${item.tone ? ' toned' : ''}`}>
            <h4 className="v-compare-title"><Inline text={item.title} /></h4>
            {item.sub && <p className="v-compare-sub"><Inline text={item.sub} /></p>}
            <ul>
              {item.points.map((p, j) => (
                <li key={j}><Check size={14} aria-hidden="true" /><span><Inline text={p} /></span></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
