import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, ChevronLeft, CircleCheck, CircleX, Eye, EyeOff, Lightbulb, MessageSquareText, RotateCcw } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { topicOf } from '../lib/progress'
import { codeLanguage } from '../lib/packs'
import { shuffle } from '../lib/random'
import { subjectLabel } from '../lib/subjects'
import RichText, { Inline } from '../components/RichText'
import CodeBlock from '../components/CodeBlock'

/** Retrieval check at the end of a section: answer before moving on. */
function SectionCheck({ check, passed, onPass }) {
  const order = useMemo(() => shuffle(check.choices.map((_, i) => i)), [check])
  const [picked, setPicked] = useState(null)
  const answered = picked !== null
  const correct = picked === check.answer

  const choose = (index) => {
    if (answered) return
    setPicked(index)
    if (index === check.answer) onPass()
  }

  return (
    <div className="lesson-check" aria-live="polite">
      <div className="catalog-head">
        <span className="callno">Check yourself</span>
        {passed && !answered && <span className="stamp good">Passed</span>}
        {answered && correct && <span className="stamp good press">Correct</span>}
      </div>
      <p className="lesson-check-q"><Inline text={check.question} /></p>
      <div className="choices compact">
        {order.map((original, i) => {
          const state = !answered ? '' : original === check.answer ? ' is-correct' : original === picked ? ' is-wrong' : ' is-dim'
          return (
            <button key={original} type="button" className={`choice${state}`} onClick={() => choose(original)} disabled={answered}>
              <span className="choice-key">{String.fromCharCode(65 + i)}</span>
              <span className="choice-text"><Inline text={check.choices[original]} /></span>
              {answered && original === check.answer && <CircleCheck size={18} className="choice-icon good-text" />}
              {answered && original === picked && !correct && <CircleX size={18} className="choice-icon bad-text" />}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className={`callout ${correct ? 'good' : 'bad'} rise`}>
          {correct ? <CircleCheck size={18} /> : <CircleX size={18} />}
          <div className="grow">
            <strong>{correct ? 'Right.' : 'Not quite.'}</strong> <Inline text={check.explanation} />
          </div>
          {!correct && (
            <button type="button" className="btn btn-sm" onClick={() => setPicked(null)}><RotateCcw size={14} /> Try again</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Lesson() {
  const { topicId } = useParams()
  const { packMap, callNos, progress, passCheck, markLessonRead } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const pack = packMap.get(topicId)
  const [hideDefinitions, setHideDefinitions] = useState(false)
  const [revealed, setRevealed] = useState({})
  const [active, setActive] = useState(0)
  const [readProgress, setReadProgress] = useState(0)
  useDocumentTitle(pack ? `${pack.name} lesson` : 'Lesson')

  const lesson = pack?.lesson
  const topic = topicOf(progress, topicId)

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setReadProgress(max > 0 ? Math.min(1, window.scrollY / max) : 1)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Highlight the section in view in the outline.
  useEffect(() => {
    if (!lesson) return
    const nodes = lesson.sections.map((_, i) => document.getElementById(`section-${i + 1}`)).filter(Boolean)
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(Number(visible[0].target.dataset.index))
      },
      { rootMargin: '-20% 0px -60% 0px' }
    )
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [lesson])

  // Deep links like #section-3 from a study session.
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 50)
  }, [location.hash])

  if (!pack) return <Navigate to="/library" replace />
  if (!lesson) return <Navigate to={`/topic/${topicId}`} replace />

  const passedCount = lesson.sections.filter((_, i) => topic.checks?.[i]).length
  const allPassed = passedCount === lesson.sections.length
  const finish = () => {
    markLessonRead(pack.id)
    navigate(`/study/topic/${pack.id}`)
  }

  return (
    <>
      <div className="read-progress" style={{ transform: `scaleX(${readProgress})` }} aria-hidden="true" />
      <div className="page reading">
        <Link to={`/topic/${pack.id}`} className="back-link small"><ChevronLeft size={16} /> {pack.name}</Link>
        <div className="lesson-layout">
          <aside className="lesson-toc" aria-label="Lesson outline">
            <div className="eyebrow">In this lesson</div>
            <ol>
              {lesson.sections.map((section, i) => (
                <li key={i}>
                  <a href={`#section-${i + 1}`} className={active === i ? 'active' : ''} aria-current={active === i ? 'location' : undefined}>
                    <span className={`outline-dot${topic.checks?.[i] ? ' done' : ''}`} aria-hidden="true">{topic.checks?.[i] ? <Check size={11} /> : String(i + 1).padStart(2, '0')}</span>
                    {section.title}
                  </a>
                </li>
              ))}
              <li><a href="#key-terms"><span className="outline-dot aux" aria-hidden="true">Aa</span>Key terms</a></li>
              <li><a href="#summary"><span className="outline-dot aux" aria-hidden="true">Σ</span>Summary</a></li>
            </ol>
            <div className="xsmall subtle" style={{ marginTop: 'var(--s-4)' }}>{passedCount} of {lesson.sections.length} checks passed</div>
            <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${(passedCount / lesson.sections.length) * 100}%` }} /></div>
          </aside>

          <article className="lesson-article">
            <header className="lesson-header">
              <div className="eyebrow"><span style={{ color: 'var(--ink)' }}>{callNos.get(pack.id)}</span> · {subjectLabel(pack.subject)} · {lesson.estimatedMinutes} min read</div>
              <h1 className="page-title">{pack.name}</h1>
              {lesson.intro && <p className="lesson-intro"><Inline text={lesson.intro} /></p>}
              <div className="callout info small">
                <Lightbulb size={18} />
                <span>Each section ends with a question. Answer it from memory before scrolling back: the effort of recalling is what makes it stick.</span>
              </div>
            </header>

            {lesson.sections.map((section, i) => (
              <section key={i} id={`section-${i + 1}`} data-index={i} className="lesson-section" aria-labelledby={`section-title-${i}`}>
                <div className="lesson-section-num">§ {String(i + 1).padStart(2, '0')}</div>
                <h2 id={`section-title-${i}`} className="lesson-section-title">{section.title}</h2>
                <RichText text={section.body} />
                {section.code && <CodeBlock code={section.code} language={codeLanguage(pack, section)} />}
                {section.tip && (
                  <div className="callout">
                    <Lightbulb size={16} />
                    <span><Inline text={section.tip} /></span>
                  </div>
                )}
                {section.check && <SectionCheck check={section.check} passed={Boolean(topic.checks?.[i])} onPass={() => passCheck(pack.id, i)} />}
              </section>
            ))}

            {lesson.keyTerms?.length > 0 && (
              <section id="key-terms" className="lesson-section">
                <div className="row between wrap">
                  <h2 className="lesson-section-title">Key terms</h2>
                  <button type="button" className="btn btn-sm" onClick={() => { setHideDefinitions((v) => !v); setRevealed({}) }} aria-pressed={hideDefinitions}>
                    {hideDefinitions ? <Eye size={14} /> : <EyeOff size={14} />} {hideDefinitions ? 'Show definitions' : 'Quiz me: hide definitions'}
                  </button>
                </div>
                <dl className="terms">
                  {lesson.keyTerms.map((t) => (
                    <div key={t.term}>
                      <dt>{t.term}</dt>
                      {hideDefinitions && !revealed[t.term] ? (
                        <dd><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevealed((r) => ({ ...r, [t.term]: true }))}>Say it out loud, then reveal</button></dd>
                      ) : (
                        <dd className={hideDefinitions ? 'rise' : ''}>{t.definition}</dd>
                      )}
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {lesson.summary?.length > 0 && (
              <section id="summary" className="lesson-section">
                <h2 className="lesson-section-title">Summary</h2>
                <ul className="summary-list">
                  {lesson.summary.map((line, i) => <li key={i}><Inline text={line} /></li>)}
                </ul>
              </section>
            )}

            <section className="card roomy lesson-finish">
              <h2 className="section-title">{allPassed ? 'All checks passed.' : 'Ready to practice?'}</h2>
              <p className="muted">
                {pack.questions.length} cards cover this lesson. Recurse will bring each one back just before you are likely to forget it.
              </p>
              <div className="row wrap">
                <button type="button" className="btn btn-primary btn-lg" onClick={finish}>Start practicing <ArrowRight size={18} /></button>
                <Link to={`/topic/${pack.id}/explain`} className="btn btn-lg" onClick={() => markLessonRead(pack.id)}><MessageSquareText size={18} /> Explain it in your words</Link>
              </div>
            </section>
          </article>
        </div>
      </div>
    </>
  )
}
