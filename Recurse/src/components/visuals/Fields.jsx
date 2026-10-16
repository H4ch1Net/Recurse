import { Inline } from '../RichText'
import { Measured } from './drawing'
import { fieldShares, fitWidths, longestWord, plainText, textWidth } from './layout'

const toneClass = (tone) => (tone ? ` v-tone-${tone}` : '')
const LABEL = 13
const SMALL = 12
// Horizontal padding and border inside a field box.
const INSET = 10
// Below this width a header is a list of fields.
const PHONE = 480

/** "4 bits", "1 byte", "46-1500 bytes". */
function sizeText(f, unit) {
  const one = f.size === 1
  return `${f.size} ${one ? unit.replace(/s$/, '') : unit}`
}

/**
 * The narrowest a field box can be: no word broken and the label in at most two lines. Roomy
 * also keeps the size with its unit ("6 bytes") and a short note on one line.
 */
function minWidth(f, unit, roomy) {
  const label = Math.max(longestWord(f.label, LABEL, { bold: true }), textWidth(plainText(f.label), LABEL, { bold: true }) / 2 + 8)
  const size = textWidth(roomy ? sizeText(f, unit) : String(f.size), SMALL, { mono: true })
  const noteW = f.note ? textWidth(plainText(f.note), SMALL) : 0
  const note = f.note ? (roomy && noteW < 100 ? noteW : longestWord(f.note, SMALL)) : 0
  return Math.max(label, size, note) + INSET
}

/**
 * Box widths for every row as percentages, or null on a phone or when some field would be too
 * narrow (the list layout then takes over). Rows with a set width first try one shared bit scale, so
 * boundaries line up across rows under a ruler; failing that, and for rows without a width,
 * each row is proportional on its own with every field kept readable.
 */
function boxLayout(spec, width) {
  const avail = width - 3
  let tries = spec.width ? [[true, true], [true, false], [false, true], [false, false]] : [[false, true], [false, false]]
  // Phones get the list, except a single row that fits with every size in full.
  if (width < PHONE) tries = spec.rows.length === 1 ? tries.filter(([, roomy]) => roomy) : []
  for (const [aligned, roomy] of tries) {
    const rows = boxRows(spec, avail, aligned, roomy)
    if (rows) return { rows, ruler: aligned && spec.unit === 'bits' }
  }
  return null
}

function boxRows(spec, avail, aligned, roomy) {
  const rows = []
  for (const row of spec.rows) {
    const shares = fieldShares(row, spec.width)
    const mins = row.map((f) => minWidth(f, spec.unit, roomy))
    let widths
    if (aligned) {
      widths = shares.map((s) => (s / spec.width) * avail)
      if (widths.some((w, i) => w < mins[i])) return null
    } else {
      widths = fitWidths(shares, mins, avail)
      if (!widths) return null
    }
    const total = aligned ? avail : widths.reduce((a, b) => a + b, 0)
    rows.push(row.map((f, i) => ({ f, px: widths[i], pct: (widths[i] / total) * 100 })))
  }
  return rows
}

/** Bit offsets along the top of a header drawn in bits: 0, 8, 16, 24 and the last bit. */
function Ruler({ width }) {
  const step = width >= 16 && width % 8 === 0 ? 8 : width % 4 === 0 ? 4 : width
  const ticks = []
  for (let b = 0; b < width; b += step) ticks.push(b)
  return (
    <div className="vf-ruler" aria-hidden="true">
      {ticks.map((b) => (
        <span key={b} style={{ left: `${(b / width) * 100}%` }}>
          {b}
        </span>
      ))}
      <span className="is-end" style={{ left: '100%' }}>
        {width - 1}
      </span>
    </div>
  )
}

/** Row headings for the list: bit or byte offsets when every size is known. */
function rowTitles(spec) {
  if (spec.rows.length < 2) return spec.rows.map(() => null)
  const known = spec.width && spec.rows.every((row) => row.every((f) => typeof f.size === 'number'))
  const word = spec.unit === 'bits' ? 'Bits' : 'Bytes'
  return spec.rows.map((_, r) => (known ? `${word} ${r * spec.width} to ${r * spec.width + spec.width - 1}` : `Row ${r + 1}`))
}

function describe(spec) {
  const titles = rowTitles(spec)
  const rows = spec.rows.map((row, r) => {
    const fields = row.map((f) => `${plainText(f.label)} ${sizeText(f, spec.unit)}${f.note ? ` (${plainText(f.note)})` : ''}`).join(', ')
    return titles[r] ? `${titles[r]}: ${fields}` : fields
  })
  return `Fields: ${rows.join('; ')}`
}

function Boxes({ spec, rows, ruler }) {
  return (
    <div className="vf vf-boxes" role="img" aria-label={describe(spec)}>
      {ruler && <Ruler width={spec.width} />}
      <div className="vf-grid">
        {rows.map((row, r) => (
          <div key={r} className="vf-row">
            {row.map(({ f, px, pct }, i) => {
              const full = sizeText(f, spec.unit)
              const fits = textWidth(full, SMALL, { mono: true }) + INSET <= px
              return (
                <div key={i} className={`vf-field${toneClass(f.tone)}`} style={{ width: `${pct}%` }}>
                  <span className="vf-label">
                    <Inline text={f.label} />
                  </span>
                  <span className="vf-size">{fits ? full : f.size}</span>
                  {f.note && (
                    <span className="vf-note">
                      <Inline text={f.note} />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function Items({ row, unit }) {
  return (
    <ol className="vf-items">
      {row.map((f, i) => (
        <li key={i} className={`vf-item${toneClass(f.tone)}`}>
          <span className="vf-label">
            <Inline text={f.label} />
          </span>
          <span className="vf-size">{sizeText(f, unit)}</span>
          {f.note && (
            <span className="vf-note">
              <Inline text={f.note} />
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/** The phone layout: every field in order with its size, one group per row. */
function List({ spec }) {
  const titles = rowTitles(spec)
  if (spec.rows.length === 1) return <Items row={spec.rows[0]} unit={spec.unit} />
  return (
    <ol className="vf-groups">
      {spec.rows.map((row, r) => (
        <li key={r}>
          <p className="vf-group-title">{titles[r]}</p>
          <Items row={row} unit={spec.unit} />
        </li>
      ))}
    </ol>
  )
}

/** Header and frame layouts: proportional boxes when they fit, a list of fields when not. */
export default function Fields({ spec }) {
  return (
    <Measured className="vx-fields">
      {(width) => {
        const boxes = boxLayout(spec, width)
        return boxes ? <Boxes spec={spec} rows={boxes.rows} ruler={boxes.ruler} /> : <List spec={spec} />
      }}
    </Measured>
  )
}
