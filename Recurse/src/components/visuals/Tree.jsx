import { Inline } from '../RichText'
import { Measured, SvgLines } from './drawing'
import { listWords, plainText, tidyTree, wrapText } from './layout'

const toneClass = (tone) => (tone ? ` v-tone-${tone}` : '')
const TEXT = { label: 13, labelLh: 17, sub: 12, subLh: 15 }

// Roomy first; tighter before giving up and drawing the outline.
const FITS = [
  { maxW: 160, padX: 10, gap: 16, levelGap: 30 },
  { maxW: 118, padX: 8, gap: 8, levelGap: 26 },
  { maxW: 96, padX: 6, gap: 5, levelGap: 22, minW: 26 }
]

/** What the tree holds, in words, for screen readers. */
function describe(root) {
  const parts = [`Tree: ${plainText(root.label)}`]
  const walk = (n) => {
    if (!n.children?.length) return
    parts.push(`${plainText(n.label)} has ${listWords(n.children.map((c) => plainText(c.label)))}`)
    n.children.forEach(walk)
  }
  walk(root)
  return `${parts.join('. ')}.`
}

/** The tidy tree for this width, or null when even the tight version does not fit. */
function fitTree(root, width) {
  for (const f of FITS) {
    const texts = new Map()
    const sizeOf = (node) => {
      const label = wrapText(node.label, f.maxW, TEXT.label, { bold: true, maxLines: 2 })
      const sub = node.sub ? wrapText(node.sub, f.maxW, TEXT.sub, { maxLines: 2 }) : null
      texts.set(node, { label, sub })
      const textH = label.lines.length * TEXT.labelLh + (sub ? sub.lines.length * TEXT.subLh : 0)
      return { w: Math.max(f.minW ?? 32, Math.max(label.width, sub?.width ?? 0) + 2 * f.padX), h: Math.max(30, textH + 10) }
    }
    const tree = tidyTree(root, sizeOf, f)
    if (tree.width + 4 <= width) return { ...tree, texts }
  }
  return null
}

function Edges({ tree }) {
  const paths = []
  tree.nodes.forEach((p, i) => {
    const kids = tree.nodes.filter((n) => n.parent === i)
    if (!kids.length) return
    const level = tree.levels[p.depth]
    const next = tree.levels[p.depth + 1]
    const from = p.y + p.h
    const mid = (level.top + level.height + next.top) / 2
    if (kids.length === 1 && Math.abs(kids[0].x - p.x) < 1) {
      paths.push(`M${p.x} ${from} V${kids[0].y}`)
      return
    }
    const xs = kids.map((k) => k.x)
    paths.push(`M${p.x} ${from} V${mid} M${Math.min(...xs)} ${mid} H${Math.max(...xs)}`)
    for (const k of kids) paths.push(`M${k.x} ${mid} V${k.y}`)
  })
  return <path className="vtree-edge" d={paths.join(' ')} />
}

function Drawing({ root, tree }) {
  const W = Math.ceil(tree.width + 4)
  const H = Math.ceil(tree.height + 4)
  return (
    <svg className="vx-svg vtree" width={W} height={H} viewBox={`-2 -2 ${W} ${H}`} role="img" aria-label={describe(root)}>
      <Edges tree={tree} />
      {tree.nodes.map((n, i) => {
        const { label, sub } = tree.texts.get(n.node)
        const textH = label.lines.length * TEXT.labelLh + (sub ? sub.lines.length * TEXT.subLh : 0)
        const top = n.y + (n.h - textH) / 2
        return (
          <g key={i} className={`vtree-node${i === 0 ? ' is-root' : ''}${toneClass(n.node.tone)}`}>
            <rect className="vx-backing" x={n.x - n.w / 2} y={n.y} width={n.w} height={n.h} rx="6" />
            <rect x={n.x - n.w / 2} y={n.y} width={n.w} height={n.h} rx="6" />
            <SvgLines lines={label.lines} x={n.x} top={top} size={TEXT.label} lineHeight={TEXT.labelLh} className="vtree-label" />
            {sub && <SvgLines lines={sub.lines} x={n.x} top={top + label.lines.length * TEXT.labelLh} size={TEXT.sub} lineHeight={TEXT.subLh} className="vtree-sub" />}
          </g>
        )
      })}
    </svg>
  )
}

function OutlineItem({ node }) {
  return (
    <li>
      <span className={`vtree-item${toneClass(node.tone)}`}>
        <span className="vtree-item-label">
          <Inline text={node.label} />
        </span>
        {node.sub && (
          <span className="vtree-item-sub">
            <Inline text={node.sub} />
          </span>
        )}
      </span>
      {node.children?.length > 0 && (
        <ul>
          {node.children.map((c, i) => (
            <OutlineItem key={i} node={c} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** The tree as an indented outline: always readable, however wide the tree is. */
function Outline({ root }) {
  return (
    <ul className="vtree-outline" aria-label={`Tree: ${plainText(root.label)}`}>
      <OutlineItem node={root} />
    </ul>
  )
}

/** A hierarchy drawn as a tidy tree when it fits the box, else as an indented outline. */
export default function Tree({ spec }) {
  return (
    <Measured className="vx-tree">
      {(width) => {
        const tree = spec.layout === 'outline' ? null : fitTree(spec.root, width)
        return tree ? <Drawing root={spec.root} tree={tree} /> : <Outline root={spec.root} />
      }}
    </Measured>
  )
}
