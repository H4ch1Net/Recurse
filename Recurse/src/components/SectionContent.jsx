import { Fragment } from 'react'
import { BookOpenText, ChevronDown } from 'lucide-react'
import { codeLanguage } from '../lib/packs'
import { splitBody, visualList } from '../lib/visuals'
import CodeBlock from './CodeBlock'
import RichText from './RichText'
import Visual from './visuals/Visual'

/**
 * A lesson section's teaching content: body text with its visuals and code block placed where
 * the [[visual]] and [[code]] markers put them, any unplaced visuals after it, then the code
 * block, then the collapsed Go deeper. Used by the lesson and the lesson peek after an answer.
 */
export default function SectionContent({ pack, section, proseClass = 'prose', deeper = true, codeFirst = false }) {
  const visuals = visualList(section)
  const parts = splitBody(section.body)
  const placed = new Set(parts.filter((p) => p.kind === 'visual').map((p) => p.index))
  const codeBlock = section.code && <CodeBlock code={section.code} language={codeLanguage(pack, section)} />
  const code = !parts.some((p) => p.kind === 'code') && codeBlock
  return (
    <>
      {codeFirst && code}
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part.kind === 'text' && <RichText text={part.text} className={proseClass} />}
          {part.kind === 'code' && codeBlock}
          {part.kind === 'visual' && visuals[part.index] && <Visual spec={visuals[part.index]} />}
        </Fragment>
      ))}
      {visuals.map((spec, i) => !placed.has(i) && <Visual key={`v${i}`} spec={spec} />)}
      {!codeFirst && code}
      {deeper && section.deeper && (
        <details className="lesson-deeper">
          <summary><BookOpenText size={15} /> Go deeper <ChevronDown size={15} className="lesson-deeper-chevron" /></summary>
          <RichText text={section.deeper} />
        </details>
      )}
    </>
  )
}

/** A question's exhibit: its visuals, then its code block. */
export function QuestionExhibit({ pack, question }) {
  return (
    <>
      {visualList(question).map((spec, i) => <Visual key={i} spec={spec} />)}
      {question.code && <CodeBlock code={question.code} language={codeLanguage(pack, question)} />}
    </>
  )
}
