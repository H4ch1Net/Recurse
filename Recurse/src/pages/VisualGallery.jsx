import { useState } from 'react'
import Visual from '../components/visuals/Visual'
import { VISUAL_FIXTURES } from '../components/visuals/fixtures'
import { checkVisual } from '../lib/visuals'

const WIDTHS = [320, 390, 720]

/** Development only: every visual fixture at phone and desktop widths, with validation results. */
export default function VisualGallery() {
  const [filter, setFilter] = useState('')
  const shown = VISUAL_FIXTURES.filter((f) => f.name.includes(filter))
  return (
    <div className="page wide-page visual-gallery">
      <h1 className="page-title">Visuals</h1>
      <input className="input" placeholder="Filter by name or type" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {shown.map((f) => {
        const errors = []
        const warnings = []
        checkVisual('spec', f.spec, errors, warnings)
        return (
          <section key={f.name} className="visual-gallery-item" data-name={f.name}>
            <h2 className="section-title">{f.name}</h2>
            {[...errors, ...warnings].map((e) => <p key={e} className={`small ${errors.includes(e) ? 'bad' : 'subtle'}`}>{e}</p>)}
            <div className="visual-gallery-row">
              {WIDTHS.map((w) => (
                <div key={w} className="visual-gallery-frame" style={{ width: w }}>
                  <div className="xsmall subtle">{w}px</div>
                  <Visual spec={f.spec} />
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
