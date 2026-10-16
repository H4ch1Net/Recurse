import { Inline } from '../RichText'
import { Measured } from './drawing'
import { plainText } from './layout'

const toneClass = (tone) => (tone ? ` v-tone-${tone}` : '')
// Row labels sit to the left of the cells from this width up, above them below it.
const LABEL_LEFT = 480

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

function ArrowUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 11 V2 M2.5 5.5 L6 2 L9.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const pointersAt = (row, i) => (row.pointers || []).filter((p) => p.at === i)

/** Pointer labels under a cell, each with an arrow up to it. */
function Pointers({ list }) {
  if (!list.length) return null
  return (
    <div className="vc-pointers">
      {list.map((p, i) => (
        <span key={i} className={`vc-pointer${toneClass(p.tone)}`}>
          <ArrowUp />
          <Inline text={p.label} />
        </span>
      ))}
    </div>
  )
}

function Cell({ row, i }) {
  const tone = row.tones?.[i]
  return (
    <div className={`vc-cell${tone ? ` is-toned${toneClass(tone)}` : ''}`}>
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

/** Boxes side by side with optional indexes above and pointers below. */
function ArrayRow({ row }) {
  return (
    <div className="vc-row" style={row.index ? { '--vc-label-pad': '23px' } : undefined}>
      <Label row={row} />
      <div className="vc-items">
        {row.cells.length === 0 && <span className="vc-empty">empty</span>}
        {row.cells.map((_, i) => (
          <div key={i} className="vc-col">
            {row.index && <span className="vc-index">{i}</span>}
            <Cell row={row} i={i} />
            <Pointers list={pointersAt(row, i)} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Nodes joined by next arrows, from the head pointer to null. */
function ListRow({ row }) {
  return (
    <div className="vc-row">
      <div className="vc-items">
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
            <div className="vc-col">
              <div className="vc-node">
                <Cell row={row} i={i} />
                <span className="vc-next" />
              </div>
              <Pointers list={pointersAt(row, i)} />
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
  return (
    <div className="vc-row">
      <Label row={row} />
      <div className="vc-items">
        <span className="vc-queue-io">
          <ArrowLeft />
          out
        </span>
        {row.cells.length === 0 && <span className="vc-empty">empty</span>}
        {row.cells.map((_, i) => (
          <div key={i} className="vc-col">
            <Cell row={row} i={i} />
            {(i === 0 || i === last) && <span className="vc-end">{i === 0 && i === last ? 'front, back' : i === 0 ? 'front' : 'back'}</span>}
            <Pointers list={pointersAt(row, i)} />
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
function BucketRow({ row, width }) {
  return (
    <div className="vc-row">
      <div className="vc-items">
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
              <div className="vc-col">
                <Cell row={row} i={i} />
                <Pointers list={pointersAt(row, i)} />
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
    body = spec.rows.map((row, i) => <BucketRow key={i} row={row} width={`calc(${longest}ch + 20px)`} />)
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
