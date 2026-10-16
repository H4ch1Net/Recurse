import { Inline } from '../RichText'
import { Measured } from './drawing'
import { plainText, pointerLevels, textWidth } from './layout'

const toneClass = (tone) => (tone ? ` v-tone-${tone}` : '')
// Row labels sit to the left of the cells from this width up, above them below it.
const LABEL_LEFT = 480
// Pixel sizes matching visuals-svg.css: 14px mono values, 8px padding and a 1.5px border a side.
const CELL_MIN = 38
const CELL_INSET = 19
const NEXT_W = 14.5
const ARROW_W = 28
// Pointer labels: the arrow stem down to the first line, then 15px a line.
const STEM = 12
const LINE_H = 15

/** Width of a cell box holding this value. */
const cellWidth = (value) => Math.max(CELL_MIN, textWidth(plainText(String(value)), 14, { mono: true }) + CELL_INSET)

function ArrowRight() {
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
      <path d="M2 6 H20 M15 2 L20 6 L15 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowLeft() {
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
      <path d="M22 6 H4 M9 2 L4 6 L9 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Where a row's pointer labels go. Labels pointing at one cell stack; a label wider than its cell
 * spills sideways, centered, and wraps past two cells' width; a label that would touch its
 * neighbor's drops to a lower line, with a longer arrow. `centers` and `widths` give each cell's
 * middle and box width along the row, `end` the row's length.
 * Returns { at: { [cell]: group }, reserve, left, right }: the space to keep under the row and
 * the room a spilling label needs at either end.
 */
function pointerPlan(row, centers, widths, end) {
  const byCell = new Map()
  for (const p of row.pointers || []) byCell.set(p.at, [...(byCell.get(p.at) || []), p])
  const groups = [...byCell.entries()].map(([at, list]) => {
    const maxW = Math.max(2 * widths[at] - 8, 64)
    const labels = list.map((p) => {
      const w = textWidth(plainText(p.label), 12, { mono: true, bold: true }) + 2
      return { ...p, wrap: w > maxW, w: Math.min(w, maxW) }
    })
    return { at, labels, maxW, center: centers[at], width: Math.max(...labels.map((l) => l.w)), lines: labels.reduce((sum, l) => sum + (l.wrap ? 2 : 1), 0) }
  })
  const levels = pointerLevels(groups)
  groups.forEach((g, i) => (g.level = levels[i]))
  const depth = Math.max(0, ...groups.map((g) => g.level + g.lines))
  return {
    at: Object.fromEntries(groups.map((g) => [g.at, g])),
    reserve: depth ? STEM + depth * LINE_H + 4 : 0,
    left: Math.ceil(Math.max(0, ...groups.map((g) => g.width / 2 - g.center))),
    right: Math.ceil(Math.max(0, ...groups.map((g) => g.center + g.width / 2 - end)))
  }
}

/** The labels pointing at one cell, under it, with one arrow up to the cell. */
function Pointers({ group }) {
  if (!group) return null
  const stem = STEM + group.level * LINE_H
  const tone = group.labels.length === 1 ? group.labels[0].tone : undefined
  return (
    <div className="vc-pointers">
      <svg className={toneClass(tone).trim() || undefined} width="12" height={stem} viewBox={`0 0 12 ${stem}`} aria-hidden="true">
        <path d={`M6 ${stem - 1} V2 M2.5 5.5 L6 2 L9.5 5.5`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {group.labels.map((p, i) => (
        <span key={i} className={`vc-pointer${p.wrap ? ' is-wrapped' : ''}${toneClass(p.tone)}`} style={p.wrap ? { width: group.maxW } : undefined}>
          <Inline text={p.label} />
        </span>
      ))}
    </div>
  )
}

function Cell({ row, i, width }) {
  const tone = row.tones?.[i]
  return (
    <div className={`vc-cell${tone ? ` is-toned${toneClass(tone)}` : ''}`} style={width ? { width } : undefined}>
      <Inline text={String(row.cells[i])} />
    </div>
  )
}

function Label({ row }) {
  if (!row.label) return null
  return (
    <div className="vc-row-label">
      <Inline text={row.label} />
    </div>
  )
}

/** Room a row keeps under itself and at its ends for pointer labels. */
const roomFor = (plan) => ({ paddingLeft: plan.left || undefined, paddingRight: plan.right || undefined })

/** Boxes of one width side by side, with optional indexes above and pointers below. */
function ArrayRow({ row }) {
  const w = Math.max(CELL_MIN, ...row.cells.map(cellWidth))
  const plan = pointerPlan(row, row.cells.map((_, i) => i * (w - 1.5) + w / 2), row.cells.map(() => w), row.cells.length * (w - 1.5))
  return (
    <div className="vc-row" style={row.index ? { '--vc-label-pad': '23px' } : undefined}>
      <Label row={row} />
      <div className="vc-items" style={roomFor(plan)}>
        {row.cells.length === 0 && <span className="vc-empty">empty</span>}
        {row.cells.map((_, i) => (
          <div key={i} className="vc-col" style={{ marginBottom: plan.reserve }}>
            {row.index && <span className="vc-index">{i}</span>}
            <Cell row={row} i={i} width={w} />
            <Pointers group={plan.at[i]} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Nodes joined by next arrows, from the head pointer to null. */
function ListRow({ row }) {
  const w = Math.max(CELL_MIN, ...row.cells.map(cellWidth))
  const head = row.label ? textWidth(plainText(row.label), 12, { mono: true, bold: true }) + 2 + ARROW_W : 0
  const stride = w + NEXT_W + ARROW_W
  const plan = pointerPlan(row, row.cells.map((_, i) => head + i * stride + (w + NEXT_W) / 2), row.cells.map(() => w + NEXT_W), head + row.cells.length * stride + 32)
  return (
    <div className="vc-row">
      <div className="vc-items" style={roomFor(plan)}>
        {row.label && (
          <span className="vc-null vc-end">
            <Inline text={row.label} />
            <span className="vc-arrow">
              <ArrowRight />
            </span>
          </span>
        )}
        {row.cells.map((_, i) => (
          <div key={i} className="vc-col vc-col-link">
            <div className="vc-col" style={{ marginBottom: plan.reserve }}>
              <div className="vc-node">
                <Cell row={row} i={i} width={w} />
                <span className="vc-next" />
              </div>
              <Pointers group={plan.at[i]} />
            </div>
            <span className="vc-arrow">
              <ArrowRight />
            </span>
          </div>
        ))}
        <span className="vc-null">null</span>
      </div>
    </div>
  )
}

/** A vertical stack, top first: the last cell listed is the top. */
function StackColumn({ row }) {
  const order = row.cells.map((_, i) => i).reverse()
  return (
    <div className="vc-stack">
      <div className="vc-stack-body">
        <span className="vc-stack-tag">
          {order.length > 0 && (
            <>
              top
              <ArrowRight />
            </>
          )}
        </span>
        <div className="vc-stack-box">
          {order.length === 0 && <span className="vc-empty">empty</span>}
          {order.map((i) => (
            <div key={i} className="vc-stack-cell">
              <Cell row={row} i={i} />
            </div>
          ))}
        </div>
      </div>
      <Label row={row} />
    </div>
  )
}

/** A queue left to right: leaves at the front, joins at the back. */
function QueueRow({ row }) {
  const last = row.cells.length - 1
  const w = Math.max(CELL_MIN, ...row.cells.map(cellWidth))
  // The "out" arrow before the front gives a spilling label room on the left.
  const plan = pointerPlan(row, row.cells.map((_, i) => 52 + i * (w - 1.5) + w / 2), row.cells.map(() => w), 52 + row.cells.length * (w - 1.5) + 40)
  return (
    <div className="vc-row">
      <Label row={row} />
      <div className="vc-items" style={roomFor(plan)}>
        <span className="vc-queue-io">
          <ArrowLeft />
          out
        </span>
        {row.cells.length === 0 && <span className="vc-empty">empty</span>}
        {row.cells.map((_, i) => (
          <div key={i} className="vc-col" style={{ marginBottom: plan.reserve }}>
            <Cell row={row} i={i} width={w} />
            {(i === 0 || i === last) && <span className="vc-end">{i === 0 && i === last ? 'front, back' : i === 0 ? 'front' : 'back'}</span>}
            <Pointers group={plan.at[i]} />
          </div>
        ))}
        <span className="vc-queue-io">
          <ArrowLeft />
          in
        </span>
      </div>
    </div>
  )
}

/** One hash bucket and the chain of entries hanging off it. */
function BucketRow({ row, width, bucketW }) {
  const widths = row.cells.map(cellWidth)
  const centers = []
  let x = bucketW
  widths.forEach((w, i) => {
    centers[i] = x + ARROW_W + w / 2
    x += ARROW_W + w
  })
  const plan = pointerPlan(row, centers, widths, x)
  return (
    <div className="vc-row">
      <div className="vc-items" style={roomFor(plan)}>
        <div className="vc-col vc-bucket" style={{ minWidth: width }}>
          <div className="vc-cell" style={{ minWidth: width }}>
            <Inline text={row.label ?? ''} />
          </div>
        </div>
        {row.cells.length === 0 ? (
          <span className="vc-empty">&nbsp;&nbsp;empty</span>
        ) : (
          row.cells.map((_, i) => (
            <div key={i} className="vc-col vc-col-link">
              <span className="vc-arrow">
                <ArrowRight />
              </span>
              <div className="vc-col" style={{ marginBottom: plan.reserve }}>
                <Cell row={row} i={i} />
                <Pointers group={plan.at[i]} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function describe(spec) {
  const cells = (row) => row.cells.map((c) => plainText(String(c)))
  const name = (row) => (row.label ? ` ${plainText(row.label)}` : '')
  const ptrs = (row) => (row.pointers || []).map((p) => `${plainText(p.label)} at index ${p.at}`)
  const rows = spec.rows.map((row) => {
    const extra = ptrs(row).length ? `; ${ptrs(row).join(', ')}` : ''
    if (spec.style === 'list') return `Linked list${name(row)}: ${[...cells(row), 'null'].join(', ')}${extra}`
    if (spec.style === 'stack') return `Stack${name(row)}, top first: ${cells(row).reverse().join(', ') || 'empty'}${extra}`
    if (spec.style === 'queue') return `Queue${name(row)}, front to back: ${cells(row).join(', ') || 'empty'}${extra}`
    if (spec.style === 'hash') return `bucket${name(row)} ${row.cells.length ? `holds ${cells(row).join(', ')}` : 'is empty'}`
    return `Array${name(row)}: ${cells(row).join(', ') || 'empty'}${extra}`
  })
  return spec.style === 'hash' ? `Hash table: ${rows.join('; ')}` : rows.join('. ')
}

function Drawing({ spec, width }) {
  const left = width >= LABEL_LEFT && spec.rows.some((r) => r.label)
  const style = spec.style
  let body
  if (style === 'stack') body = <div className="vc-stacks">{spec.rows.map((row, i) => <StackColumn key={i} row={row} />)}</div>
  else if (style === 'hash') {
    const longest = Math.max(1, ...spec.rows.map((r) => plainText(r.label ?? '').length))
    const bucketW = longest * 14 * 0.6 + 23
    body = spec.rows.map((row, i) => <BucketRow key={i} row={row} width={`calc(${longest}ch + 20px)`} bucketW={bucketW} />)
  } else if (style === 'list') body = spec.rows.map((row, i) => <ListRow key={i} row={row} />)
  else if (style === 'queue') body = spec.rows.map((row, i) => <QueueRow key={i} row={row} />)
  else body = spec.rows.map((row, i) => <ArrayRow key={i} row={row} />)
  return (
    <div className={`vc vc-${style}${left && (style === 'array' || style === 'queue') ? ' vc-left' : ''}`} role="img" aria-label={describe(spec)}>
      {body}
    </div>
  )
}

/** Data structures: arrays, linked lists, stacks, queues and hash buckets. */
export default function Cells({ spec }) {
  return <Measured className="vx-cells">{(width) => <Drawing spec={spec} width={width} />}</Measured>
}
