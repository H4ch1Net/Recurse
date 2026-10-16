import { Arrowhead, Measured, SvgLines } from './drawing'
import { DeviceIcon } from './device-icons'
import { layoutSequence, listWords, plainText } from './layout'

const toneClass = (tone) => (tone ? ` v-tone-${tone}` : '')

/** What the diagram says, in words, for screen readers. */
function describe(spec) {
  const names = spec.actors.map((a) => plainText(a.label))
  const steps = spec.messages.map((m) => (m.note !== undefined ? `note: ${plainText(m.note)}` : plainText(m.label)))
  return `Sequence between ${listWords(names)}: ${steps.join(', ')}`
}

/** A card-colored patch behind text, so lifelines never run through a label. */
function Backing({ x, top, text, lineHeight, anchor = 'middle' }) {
  const w = text.width + 8
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x - 4 : x - w + 4
  return <rect className="vx-backing" x={left} y={top + 1} width={w} height={text.lines.length * lineHeight - 2} rx="3" />
}

function Message({ row, T }) {
  const { m, x1, x2, arrowY } = row
  const dir = x2 > x1 ? 1 : -1
  return (
    <g className={`vseq-msg${toneClass(m.tone)}`}>
      <Backing x={row.labelX} top={row.labelTop} text={row.label} lineHeight={T.labelLh} />
      <SvgLines lines={row.label.lines} x={row.labelX} top={row.labelTop} size={T.label} lineHeight={T.labelLh} className="vseq-label" />
      <line className={`vseq-line${m.dashed ? ' vx-dashed' : ''}`} x1={x1} y1={arrowY} x2={x2 - dir * 8} y2={arrowY} />
      <Arrowhead x={x2} y={arrowY} ux={dir} uy={0} className="vseq-head" />
      {row.detail && (
        <>
          <Backing x={row.detailX} top={row.detailTop} text={row.detail} lineHeight={T.detailLh} />
          <SvgLines lines={row.detail.lines} x={row.detailX} top={row.detailTop} size={T.detail} lineHeight={T.detailLh} className="vseq-detail" />
        </>
      )}
    </g>
  )
}

/** A step an actor takes itself: a loop back to its own lifeline, text beside it. */
function SelfStep({ row, T }) {
  const { m, x, right, loopTop, loopH } = row
  const s = right ? 1 : -1
  const anchor = right ? 'start' : 'end'
  const labelH = row.label.lines.length * T.labelLh
  return (
    <g className={`vseq-msg${toneClass(m.tone)}`}>
      <path className={`vseq-line${m.dashed ? ' vx-dashed' : ''}`} d={`M${x} ${loopTop} H${x + s * 26} V${loopTop + loopH} H${x + s * 9}`} />
      <Arrowhead x={x + s * 1} y={loopTop + loopH} ux={-s} uy={0} className="vseq-head" />
      <Backing x={row.textX} top={row.top} text={row.label} lineHeight={T.labelLh} anchor={anchor} />
      <SvgLines lines={row.label.lines} x={row.textX} top={row.top} size={T.label} lineHeight={T.labelLh} anchor={anchor} className="vseq-label" />
      {row.detail && (
        <>
          <Backing x={row.textX} top={row.top + labelH} text={row.detail} lineHeight={T.detailLh} anchor={anchor} />
          <SvgLines lines={row.detail.lines} x={row.textX} top={row.top + labelH} size={T.detail} lineHeight={T.detailLh} anchor={anchor} className="vseq-detail" />
        </>
      )}
    </g>
  )
}

function Note({ row, T }) {
  const { box } = row
  return (
    <g className="vseq-note">
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="5" />
      <SvgLines lines={row.text.lines} x={row.textX} top={row.textTop} size={T.note} lineHeight={T.noteLh} />
    </g>
  )
}

function Drawing({ spec, width }) {
  const L = layoutSequence(spec, width)
  const T = L.text
  return (
    <svg className="vx-svg vseq" width={L.width} height={L.height} viewBox={`0 0 ${L.width} ${L.height}`} role="img" aria-label={describe(spec)}>
      {L.actors.map((a) => (
        <line key={`life-${a.id}`} className="vseq-life" x1={a.x} y1={a.lifeStart} x2={a.x} y2={L.lifeBottom} />
      ))}
      {L.actors.map((a) => (
        <g key={a.id} className="vseq-actor">
          {a.boxed ? <rect className="vseq-actor-box" x={a.box.x} y={a.box.y} width={a.box.w} height={a.box.h} rx="6" /> : <DeviceIcon kind={a.kind} x={a.x} y={a.iconY} scale={L.iconScale} />}
          {!a.boxed && <Backing x={a.textX} top={a.textTop} text={a.text} lineHeight={T.actorLh} />}
          <SvgLines lines={a.text.lines} x={a.textX} top={a.textTop} size={T.actor} lineHeight={T.actorLh} className="vseq-actor-label" />
        </g>
      ))}
      {L.rows.map((row, i) => {
        if (row.kind === 'note') return <Note key={i} row={row} T={T} />
        if (row.kind === 'self') return <SelfStep key={i} row={row} T={T} />
        return <Message key={i} row={row} T={T} />
      })}
    </svg>
  )
}

/** A ladder diagram: messages between two to five actors over time, top to bottom. */
export default function Sequence({ spec }) {
  return <Measured className="vx-sequence">{(width) => <Drawing spec={spec} width={width} />}</Measured>
}
