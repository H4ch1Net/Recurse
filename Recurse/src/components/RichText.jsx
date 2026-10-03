import { Fragment } from 'react'

/** Inline markup: `code` and **bold**. Everything else is plain text (no HTML). */
export function Inline({ text }) {
  const parts = String(text ?? '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    return <Fragment key={i}>{part}</Fragment>
  })
}

const BULLET = /^\s*[-*] /

/** Group a block's lines into paragraphs and bullet lists, in order. */
function runs(block) {
  const out = []
  for (const line of block.split('\n')) {
    const bullet = BULLET.test(line)
    const last = out[out.length - 1]
    if (bullet) {
      if (last?.type === 'list') last.items.push(line.replace(BULLET, ''))
      else out.push({ type: 'list', items: [line.replace(BULLET, '')] })
    } else if (line.trim()) {
      if (last?.type === 'p') last.text += ` ${line.trim()}`
      else out.push({ type: 'p', text: line.trim() })
    }
  }
  return out
}

/** Paragraphs split on blank lines; lines starting with "- " become bullet lists. */
export default function RichText({ text, className = 'prose' }) {
  const blocks = String(text ?? '').split(/\n\s*\n/).flatMap(runs)
  return (
    <div className={className}>
      {blocks.map((block, i) =>
        block.type === 'list' ? (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Inline text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        )
      )}
    </div>
  )
}
