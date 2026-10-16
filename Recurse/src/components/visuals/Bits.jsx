import { Fragment } from 'react'
import { Inline } from '../RichText'
import { Measured } from './drawing'
import { bitsRow, plainText, textWidth } from './layout'

const toneClass = (tone) => (tone ? ` v-tone-${tone}` : '')
// Pixel sizes matching visuals-svg.css: 14px mono digits.
const DIGIT = 14 * 0.6 + 2.5
const DECIMAL = 14 * 0.6 * 3.4 + 4
const DOT = 12
const GROUP_GAP = 6
const ROW_INSET = 19

const octetWidth = (o) => (o.binary ? DIGIT * 8 : DECIMAL)
const rawWidth = (groups) => groups.reduce((sum, g) => sum + g.length * DIGIT, 0) + (groups.length - 1) * GROUP_GAP

/** Rows split into lines of octets (or bit groups) for the chosen layout. */
function linesOf(row, perLine, room) {
  if (!row.raw) {
    const lines = []
    for (let i = 0; i < 4; i += perLine) lines.push(row.octets.slice(i, i + perLine))
    return lines
  }
  const lines = [[]]
  let used = 0
  for (const g of row.groups) {
    const w = g.length * DIGIT
    if (used && used + GROUP_GAP + w > room) {
      lines.push([])
      used = 0
    }
    used += (used ? GROUP_GAP : 0) + w
    lines[lines.length - 1].push(g)
  }
  return lines
}

/** Side by side when everything fits on one line, label above when not, two octets a line on phones. */
function chooseMode(rows, specRows, width) {
  const headW = Math.min(150, Math.max(...specRows.map((r) => Math.max(textWidth(plainText(r.label), 13, { bold: true }), r.value !== undefined ? textWidth(String(r.value), 12, { mono: true }) : 0))) + 4)
  const bitsW = Math.max(...rows.map((r) => (r.raw ? rawWidth(r.groups) : r.octets.reduce((sum, o) => sum + octetWidth(o), 0) + 3 * DOT)))
  if (headW + 12 + bitsW + ROW_INSET <= width) return { mode: 'side', perLine: 4, headW }
  if (bitsW + ROW_INSET <= width) return { mode: 'stacked', perLine: 4, headW }
  return { mode: 'wrap', perLine: 2, headW }
}

function Digits({ digits }) {
  return digits.map((d, i) => (
    <span key={i} className={`vb-bit${d.net ? ' vb-net' : ''}${d.host ? ' vb-host' : ''}${d.cut ? ' vb-cut' : ''}`}>
      {d.bit}
    </span>
  ))
}

function Line({ row, line, last }) {
  if (row.raw) {
    return (
      <div className="vb-line">
        {line.map((g, i) => (
          <span key={i} className="vb-octet vb-group">
            <Digits digits={g} />
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="vb-line">
      {line.map((o, i) => (
        <Fragment key={o.index}>
          {o.binary ? (
            <span className="vb-octet">
              <Digits digits={o.digits} />
            </span>
          ) : (
            <span className={`vb-dec${o.net === 'net' ? ' vb-net' : o.net === 'host' ? ' vb-host' : ''}`}>{o.text}</span>
          )}
          {(i < line.length - 1 || !last) && <span className="vb-dot">.</span>}
        </Fragment>
      ))}
    </div>
  )
}

function describe(spec, rows) {
  const parts = spec.rows.map((r, i) => {
    const row = rows[i]
    const bits = row.raw ? row.groups.map((g) => g.map((d) => d.bit).join('')).join(' ') : row.octets.map((o) => o.text).join('.')
    return `${plainText(r.label)}${r.value !== undefined ? ` ${r.value}` : ''}: ${bits}`
  })
  if (spec.prefix !== undefined) parts.push(`prefix /${spec.prefix}: ${spec.prefix} network bits and ${32 - spec.prefix} host bits`)
  return `Bits. ${parts.join('; ')}`
}

function Drawing({ spec, width }) {
  const rows = spec.rows.map((r) => bitsRow(r, spec))
  const { mode, perLine, headW } = chooseMode(rows, spec.rows, width)
  return (
    <div className={`vb vb-${mode}`} role="img" aria-label={describe(spec, rows)}>
      <div className="vb-rows" style={{ '--vb-head': `${headW}px` }}>
        {spec.rows.map((r, i) => {
          const lines = linesOf(rows[i], perLine, width - ROW_INSET)
          return (
            <div key={i} className={`vb-row${toneClass(r.tone)}`}>
              <div className="vb-head">
                <span className="vb-label">
                  <Inline text={r.label} />
                </span>
                {r.value !== undefined && <span className="vb-value">{r.value}</span>}
              </div>
              <div className="vb-bits">
                {lines.map((line, j) => (
                  <Line key={j} row={rows[i]} line={line} last={j === lines.length - 1} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {spec.prefix !== undefined && (
        <div className="vb-legend" aria-hidden="true">
          <span>
            <i className="vb-net" />
            Network: {spec.prefix} bits
          </span>
          <span>
            <i className="vb-host" />
            Host: {32 - spec.prefix} bits
          </span>
        </div>
      )}
    </div>
  )
}

/** Binary views of addresses and masks, network and host bits colored by the prefix. */
export default function Bits({ spec }) {
  return <Measured className="vx-bits">{(width) => <Drawing spec={spec} width={width} />}</Measured>
}
