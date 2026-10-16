import { Inline } from '../RichText'
import { Measured, SvgLines } from './drawing'
import { DeviceIcon } from './device-icons'
import { TOPO_TEXT as T, kindWords, layoutTopology, listWords, plainText } from './layout'

const toneClass = (tone) => (tone ? ` v-tone-${tone}` : '')

/** What the drawing shows, in words, for screen readers. */
function describe(spec) {
  const byId = Object.fromEntries(spec.nodes.map((n) => [n.id, plainText(n.label)]))
  if (spec.nodes.every((n) => n.kind === 'vertex')) return describeGraph(spec, byId)
  const nodes = spec.nodes.map((n) => `${plainText(n.label)} (${kindWords(n.kind)}${n.sub ? `, ${plainText(n.sub)}` : ''})`)
  const links = (spec.links || []).map((l) => {
    const ports = [l.fromLabel && `${byId[l.from]} ${plainText(l.fromLabel)}`, l.toLabel && `${byId[l.to]} ${plainText(l.toLabel)}`].filter(Boolean)
    const extra = [l.label && plainText(l.label), l.style && l.style !== 'solid' && l.style, ports.length && ports.join(' to ')].filter(Boolean)
    return `${byId[l.from]} to ${byId[l.to]}${extra.length ? ` (${extra.join(', ')})` : ''}`
  })
  const zones = (spec.zones || []).map((z) => `${plainText(z.label)}: ${listWords(z.nodes.map((id) => byId[id]))}`)
  const marks = (spec.marks || []).map((m) => {
    const link = typeof m.at === 'string' && m.at.match(/^link:(\d+)$/)
    const l = link && spec.links[Number(link[1])]
    return `${l ? `${byId[l.from]} to ${byId[l.to]} link` : byId[m.at]}: ${plainText(m.text)}`
  })
  const parts = [`Network diagram: ${listWords(nodes)}`]
  if (links.length) parts.push(`Links: ${links.join('; ')}`)
  if (zones.length) parts.push(`Zones: ${zones.join('; ')}`)
  if (marks.length) parts.push(`Notes: ${marks.join('; ')}`)
  return `${parts.join('. ')}.`
}

/** An algorithm graph in words: its vertices, then its edges with their weights. */
function describeGraph(spec, byId) {
  const vertices = spec.nodes.map((n) => `${plainText(n.label)}${n.sub ? ` (${plainText(n.sub)})` : ''}`)
  const edges = (spec.links || []).map((l) => `${byId[l.from]} to ${byId[l.to]}${l.label ? `, weight ${plainText(l.label)}` : ''}`)
  const marks = (spec.marks || []).map((m) => plainText(m.text))
  return `Graph with vertices ${listWords(vertices)}. Edges: ${edges.join('; ')}.${marks.length ? ` Notes: ${marks.join('; ')}.` : ''}`
}

/** The line of a link, in its style: straight, dashed, a serial lightning bolt or a radio wave. */
function linkPath(g) {
  const { x1, y1, x2, y2 } = g
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ux = (x2 - x1) / (len || 1)
  const uy = (y2 - y1) / (len || 1)
  const nx = -uy
  const ny = ux
  const at = (d, off = 0) => `${(x1 + ux * d + nx * off).toFixed(1)} ${(y1 + uy * d + ny * off).toFixed(1)}`
  if (g.style === 'serial' && len > 30) {
    const m = len / 2
    return `M${at(0)} L${at(m - 6)} L${at(m - 1, 7)} L${at(m + 1, -7)} L${at(m + 6)} L${at(len)}`
  }
  if (g.style === 'wireless' && len > 16) {
    const half = 6
    const count = Math.floor(len / half)
    const start = (len - count * half) / 2
    let d = `M${at(0)} L${at(start)}`
    for (let k = 0; k < count; k++) d += ` Q${at(start + (k + 0.5) * half, k % 2 ? -7 : 7)} ${at(start + (k + 1) * half)}`
    return `${d} L${at(len)}`
  }
  return `M${at(0)} L${at(len)}`
}

function Link({ g }) {
  return (
    <g className={`vtop-link-group${toneClass(g.tone)}`}>
      <path className={`vtop-link${g.style === 'dashed' ? ' is-dashed' : ''}${g.edge ? ' is-edge' : ''}`} d={linkPath(g)} />
    </g>
  )
}

function LinkLabels({ g }) {
  return (
    <g className={toneClass(g.tone).trim() || undefined}>
      {g.labels.map((l, i) => {
        const { rect: r } = l
        if (l.kind === 'port') return <SvgLines key={i} lines={l.text.lines} x={r.x + r.w / 2} top={r.y} size={T.port} lineHeight={T.portLh} className="vtop-port" />
        if (l.kind === 'weight') {
          return (
            <g key={i} className="vtop-weight">
              <rect className="vx-backing" x={r.x} y={r.y} width={r.w} height={r.h} rx="4" />
              <SvgLines lines={l.text.lines} x={r.x + r.w / 2} top={r.y} size={T.weight} lineHeight={T.weightLh} />
            </g>
          )
        }
        return (
          <g key={i} className="vtop-pill">
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(r.h / 2, 9)} />
            <SvgLines lines={l.text.lines} x={r.x + r.w / 2} top={r.y + 2.5} size={T.link} lineHeight={T.linkLh} />
          </g>
        )
      })}
    </g>
  )
}

function Node({ n }) {
  const { rect: r, align, label, sub } = n.text
  const x = align === 'middle' ? r.x + r.w / 2 : align === 'start' ? r.x : r.x + r.w
  const labelH = label ? label.lines.length * T.labelLh : 0
  return (
    <g className={`vtop-node${toneClass(n.tone)}${n.inside ? ' is-vertex' : ''}`}>
      <DeviceIcon kind={n.kind} x={n.cx} y={n.cy} tone={n.tone} size={n.box.w} />
      {n.inside && <SvgLines lines={n.inside.lines} x={n.cx} top={n.cy - T.vertexLh / 2} size={T.vertex} lineHeight={T.vertexLh} className="vtop-vertex-label" />}
      {label && <SvgLines lines={label.lines} x={x} top={r.y} size={T.label} lineHeight={T.labelLh} anchor={align} className="vtop-node-label" />}
      {sub && <SvgLines lines={sub.lines} x={x} top={r.y + labelH} size={T.sub} lineHeight={T.subLh} anchor={align} className="vtop-node-sub" />}
    </g>
  )
}

function Drawing({ spec, width }) {
  const L = layoutTopology(spec, width)
  return (
    <>
      <Picture spec={spec} L={L} />
      <Key nodes={L.nodes} links={L.links} />
      <Notes marks={L.marks} />
    </>
  )
}

function Picture({ spec, L }) {
  return (
    <svg className="vx-svg vtop" width={L.width} height={L.height} viewBox={`0 0 ${L.width} ${L.height}`} role="img" aria-label={describe(spec)}>
      {L.zones.map((z, i) => (
        <g key={i} className={`vtop-zone${toneClass(z.tone)}`}>
          <rect x={z.rect.x} y={z.rect.y} width={z.rect.w} height={z.rect.h} rx="10" />
          <SvgLines lines={z.text.lines} x={z.textRect.x} top={z.textRect.y} size={T.label - 1} lineHeight={T.labelLh} anchor="start" />
        </g>
      ))}
      {L.links.map((g) => (
        <Link key={g.index} g={g} />
      ))}
      {L.marks.map((m, i) => (
        <g key={i} className={toneClass(m.tone).trim() || undefined}>
          <line className="vtop-leader" x1={m.from.x} y1={m.from.y} x2={m.rect.x + m.rect.w / 2} y2={m.rect.y + m.rect.h / 2} />
          {String(m.at).startsWith('link:') && <circle className="vtop-dot" cx={m.from.x} cy={m.from.y} r="3" />}
        </g>
      ))}
      {L.nodes.map((n) => (
        <Node key={n.id} n={n} />
      ))}
      {L.links.map((g) => (
        <LinkLabels key={g.index} g={g} />
      ))}
      {L.marks.map((m, i) => (
        <g key={i} className={`vtop-mark${toneClass(m.tone)}`}>
          <rect className="vx-backing" x={m.rect.x} y={m.rect.y} width={m.rect.w} height={m.rect.h} rx={m.badge ? m.rect.h / 2 : 6} />
          <rect x={m.rect.x} y={m.rect.y} width={m.rect.w} height={m.rect.h} rx={m.badge ? m.rect.h / 2 : 6} />
          {m.badge ? (
            <text x={m.rect.x + m.rect.w / 2} y={m.rect.y + m.rect.h / 2 + 4.2} textAnchor="middle" className="vx-text" style={{ fontSize: T.mark }}>
              {m.badge}
            </text>
          ) : (
            <SvgLines lines={m.lines.lines} x={m.rect.x + m.rect.w / 2} top={m.rect.y + 4} size={T.mark} lineHeight={T.markLh} />
          )}
        </g>
      ))}
    </svg>
  )
}

/** Sub lines and port names that did not fit beside their device, listed under the drawing. */
function Key({ nodes, links }) {
  const items = [
    ...nodes.filter((n) => n.text.keyed).map((n) => ({ key: n.id, name: n.label, text: n.sub })),
    ...links.flatMap((g) => g.keyed.map((k) => ({ key: `${g.index}-${k.node.id}-${k.port ? 'port' : 'link'}`, name: k.node.label, text: k.port ?? k.label, mono: Boolean(k.port), to: k.other.label })))
  ]
  if (!items.length) return null
  return (
    <ul className="vtop-notes vtop-key">
      {items.map((item) => (
        <li key={item.key}>
          <strong>
            <Inline text={item.name} />
          </strong>
          {item.mono === false ? (
            <span className="vtop-key-to">
              to <Inline text={item.to} />
            </span>
          ) : null}
          <span className={item.mono === false ? 'vtop-key-link' : 'vtop-key-sub'}>
            <Inline text={item.text} />
          </span>
          {item.mono && (
            <span className="vtop-key-to">
              to <Inline text={item.to} />
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Callouts that did not fit on the drawing, listed under it by their badge number. */
function Notes({ marks }) {
  const listed = marks.filter((m) => m.badge)
  if (!listed.length) return null
  return (
    <ol className="vtop-notes">
      {listed.map((m) => (
        <li key={m.badge} className={toneClass(m.tone).trim() || undefined}>
          <span className="vtop-badge" aria-hidden="true">
            {m.badge}
          </span>
          <span>
            <Inline text={m.text} />
          </span>
        </li>
      ))}
    </ol>
  )
}

/** A network drawing: devices on a small grid, links with port labels, zones and callouts. */
export default function Topology({ spec }) {
  return <Measured className="vx-topology">{(width) => <Drawing spec={spec} width={width} />}</Measured>
}
