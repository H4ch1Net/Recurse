import { ArrowDown, ArrowDownUp, ArrowUp } from 'lucide-react'
import { Inline } from '../RichText'

const ARROWS = { down: ArrowDown, up: ArrowUp, both: ArrowDownUp }

/** Layers drawn top to bottom, with optional brackets grouping runs of layers. */
export default function Stack({ spec }) {
  const groups = spec.groups || []
  const Arrow = ARROWS[spec.arrow]
  return (
    <div className="v-stack-wrap">
      {Arrow && (
        <div className="v-stack-arrow">
          <Arrow size={15} aria-hidden="true" />
          {spec.arrowLabel && <span><Inline text={spec.arrowLabel} /></span>}
        </div>
      )}
      <div className={`v-stack${groups.length ? ' grouped' : ''}`}>
        {spec.layers.map((layer, i) => (
          <div key={i} className={`v-stack-layer${layer.tone ? ` toned v-tone-${layer.tone}` : ''}`} style={{ gridRow: i + 1 }}>
            {layer.tag !== undefined && <span className="v-stack-tag">{layer.tag}</span>}
            <span className="v-stack-text">
              <strong><Inline text={layer.label} /></strong>
              {layer.detail !== undefined && <small><Inline text={String(layer.detail)} /></small>}
            </span>
          </div>
        ))}
        {groups.map((g, i) => (
          <div key={`g${i}`} className="v-stack-group" style={{ gridRow: `${g.from + 1} / ${g.to + 2}` }}>
            <span><Inline text={g.label} /></span>
          </div>
        ))}
      </div>
    </div>
  )
}
