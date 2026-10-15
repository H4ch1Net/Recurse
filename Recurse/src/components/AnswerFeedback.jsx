import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { codeLanguage } from '../lib/packs'
import CodeBlock from './CodeBlock'
import RichText, { Inline } from './RichText'

/**
 * What comes after answering: the right answer for typed and recall cards, the
 * explanation, the concept, and a peek at the lesson section that teaches it.
 */
export default function AnswerFeedback({ pack, question, outcome, lessonKey = true, showLessonDefault = false }) {
  const [showLesson, setShowLesson] = useState(showLessonDefault)
  const section = question.section != null ? pack?.lesson?.sections?.[question.section] : null
  const textual = ['typed', 'cli', 'recall'].includes(question.type)

  return (
    <div className="answer-feedback stack-sm">
      {textual && (
        <div className="answer-compare">
          <div>
            <div className="eyebrow">{question.type === 'cli' ? 'Command' : 'Answer'}</div>
            <div className={`answer-text${question.type === 'cli' ? ' mono' : ''}`}><Inline text={question.answer} /></div>
            {question.accept?.length > 0 && (
              <div className="xsmall subtle">Also accepted: {question.accept.slice(0, 4).join(', ')}</div>
            )}
            {question.type === 'cli' && question.shell === 'ios' && <div className="xsmall subtle">Abbreviations such as <code>sh ip int br</code> are accepted.</div>}
          </div>
          {outcome?.given && question.type === 'recall' && (
            <div>
              <div className="eyebrow">You wrote</div>
              <div className="answer-text muted" style={{ whiteSpace: 'pre-wrap' }}>{outcome.given}</div>
            </div>
          )}
        </div>
      )}
      {question.explanation && <RichText text={question.explanation} className="prose feedback-explain" />}
      {question.concept && <div className="xsmall subtle">Concept: {question.concept}</div>}
      {section && (
        <div className="lesson-peek">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLesson((v) => !v)} aria-expanded={showLesson}>
            <BookOpen size={14} /> {showLesson ? 'Hide' : 'Show'} the lesson: {section.title} {lessonKey && <span className="kbd hide-mobile">E</span>}
          </button>
          {showLesson && (
            <div className="lesson-peek-body rise">
              <RichText text={section.body} className="prose small-prose" />
              {section.code && <CodeBlock code={section.code} language={codeLanguage(pack, section)} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
