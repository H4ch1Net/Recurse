import { useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Check, ChevronLeft, CircleAlert, Lightbulb, Loader2, Sparkles } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { gradeExplanation, isAIConfigured, PROVIDERS } from '../lib/ai'
import { Inline } from '../components/RichText'

const MIN_WORDS = 40
const SELF_RATINGS = [
  { score: 25, label: 'Shaky', hint: 'I got stuck or hand-waved' },
  { score: 50, label: 'Partial', hint: 'The gist, with gaps' },
  { score: 75, label: 'Solid', hint: 'Clear, missed a detail' },
  { score: 95, label: 'Nailed it', hint: 'A beginner would follow it' }
]

/** Key terms the text mentions, matched loosely on word boundaries. */
function termHits(text, terms) {
  const lower = text.toLowerCase()
  return terms.map((t) => {
    const needle = t.term.toLowerCase().replace(/[()]/g, '').split(/[,/]/)[0].trim()
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return { ...t, hit: needle.length > 1 && new RegExp(`(^|[^a-z0-9])${escaped}`, 'i').test(lower) }
  })
}

export default function Explain() {
  const { topicId } = useParams()
  const { packMap, ai, recordFeynman, toast } = useApp()
  const pack = packMap.get(topicId)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [selfReview, setSelfReview] = useState(false)
  const [saved, setSaved] = useState(null)
  const startedAt = useRef(null)
  useDocumentTitle(pack ? `Explain ${pack.name}` : 'Explain')

  const terms = useMemo(() => termHits(text, pack?.lesson?.keyTerms || []), [text, pack])
  if (!pack) return <Navigate to="/library" replace />
  if (!pack.lesson) return <Navigate to={`/topic/${topicId}`} replace />

  const words = text.trim().split(/\s+/).filter(Boolean).length
  const ready = words >= MIN_WORDS
  const configured = isAIConfigured(ai)
  const seconds = () => (startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0)

  const save = (score, aiGraded) => {
    const xp = recordFeynman(pack.id, { text, words, score, ai: aiGraded, seconds: seconds() })
    setSaved({ score, xp })
    toast(`Explanation saved · +${xp} XP`, { tone: 'good' })
  }

  const submitAI = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await gradeExplanation(ai, {
        topic: pack.name,
        prompt: pack.lesson.feynmanPrompt,
        keyTerms: pack.lesson.keyTerms.map((t) => t.term),
        text
      })
      setFeedback(result)
      save(result.score, true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setText('')
    setFeedback(null)
    setSelfReview(false)
    setSaved(null)
    setError('')
    startedAt.current = null
  }

  const done = Boolean(feedback || (selfReview && saved))

  return (
    <div className="page narrow">
      <Link to={`/topic/${pack.id}`} className="back-link small"><ChevronLeft size={16} /> {pack.name}</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">Feynman technique</div>
          <h1 className="page-title">Explain it simply</h1>
          <p className="page-sub">Write an explanation a friend with no background could follow. Gaps you cannot explain are exactly what to review next.</p>
        </div>
      </div>

      <section className="card roomy stack">
        <div className="feynman-prompt">
          <Lightbulb size={18} />
          <p><Inline text={pack.lesson.feynmanPrompt} /></p>
        </div>
        <div className="field">
          <label htmlFor="explanation" className="sr-only">Your explanation</label>
          <textarea
            id="explanation"
            className="textarea feynman-text"
            rows={10}
            value={text}
            readOnly={done}
            onChange={(e) => {
              if (!startedAt.current) startedAt.current = Date.now()
              setText(e.target.value)
            }}
            placeholder="Use plain words. Give an example. Say why, not just what."
          />
          <div className="row between xsmall">
            <span className={ready ? 'good-text' : 'subtle'}>{ready ? <><Check size={12} style={{ verticalAlign: '-1px' }} /> {words} words</> : `${words} / ${MIN_WORDS} words`}</span>
            <span className="subtle">Write from memory first. Peeking defeats the purpose.</span>
          </div>
        </div>

        <div>
          <div className="eyebrow">Key ideas you used</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {terms.map((t) => (
              <span key={t.term} className={`chip ${t.hit ? 'good' : 'outline'}`} title={t.hit ? 'Mentioned' : 'Not mentioned yet'}>
                {t.hit && <Check size={12} />} {t.term}
              </span>
            ))}
          </div>
        </div>

        {error && <div className="callout bad" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}

        {!done && !selfReview && (
          <div className="row wrap">
            {configured && (
              <button type="button" className="btn btn-primary btn-lg" onClick={submitAI} disabled={!ready || busy}>
                {busy ? <><Loader2 size={18} className="spin" /> Reading your explanation</> : <><Sparkles size={18} /> Get AI feedback</>}
              </button>
            )}
            <button type="button" className={`btn btn-lg ${configured ? '' : 'btn-primary'}`} onClick={() => setSelfReview(true)} disabled={!ready || busy}>
              Compare with the lesson
            </button>
          </div>
        )}
        {!configured && !done && (
          <p className="xsmall subtle">
            Want written feedback? <Link to="/settings#ai">Add an API key</Link> from {Object.values(PROVIDERS).map((p) => p.label).join(', ')}. Without one, you compare your explanation with the lesson summary yourself.
          </p>
        )}
      </section>

      {selfReview && (
        <section className="card roomy stack rise" style={{ marginTop: 'var(--s-5)' }}>
          <h2 className="section-title">Compare and grade yourself</h2>
          <p className="small muted">Read the summary below. Which points did your explanation cover clearly? Which did you skip or blur?</p>
          <ul className="summary-list">
            {pack.lesson.summary.map((line, i) => <li key={i}><Inline text={line} /></li>)}
          </ul>
          {!saved ? (
            <>
              <div className="eyebrow" style={{ marginTop: 'var(--s-2)' }}>How well did you explain it?</div>
              <div className="grades self-grades">
                {SELF_RATINGS.map((r) => (
                  <button key={r.score} type="button" className="grade" onClick={() => save(r.score, false)}>
                    <span className="grade-label">{r.label}</span>
                    <span className="grade-when">{r.hint}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="callout good"><Check size={18} /><span>Saved. {saved.score < 75 ? 'Reread the sections you blurred, then try again tomorrow.' : 'Nice. Try explaining it again in a week to check it held.'}</span></div>
          )}
        </section>
      )}

      {feedback && (
        <section className="stack rise" style={{ marginTop: 'var(--s-5)' }}>
          <div className="card roomy row" style={{ gap: 'var(--s-5)' }}>
            <div className="display-num feynman-score">{feedback.score}</div>
            <div>
              <div className="eyebrow">Understanding score</div>
              <p className="small muted">{feedback.score >= 80 ? 'Clear and accurate.' : feedback.score >= 55 ? 'Good foundation with some gaps.' : 'Worth another pass after rereading the lesson.'}</p>
            </div>
          </div>
          <div className="grid-2">
            <div className="card"><h3 className="small good-text feedback-title">What worked</h3><p className="small">{feedback.strengths}</p></div>
            <div className="card"><h3 className="small warn-text feedback-title">What was missing</h3><p className="small">{feedback.gaps}</p></div>
          </div>
          {feedback.misconceptions && (
            <div className="card"><h3 className="small bad-text feedback-title">Misconceptions to fix</h3><p className="small">{feedback.misconceptions}</p></div>
          )}
          <div className="card"><h3 className="small feedback-title">A clear way to put it</h3><p className="small">{feedback.modelExplanation}</p></div>
          <p className="xsmall subtle">AI feedback can be wrong. Check anything surprising against the lesson.</p>
        </section>
      )}

      {done && (
        <div className="row wrap" style={{ marginTop: 'var(--s-5)' }}>
          <Link to={`/topic/${pack.id}/lesson`} className="btn">Reread the lesson</Link>
          <Link to={`/study/topic/${pack.id}`} className="btn btn-primary">Study the cards</Link>
          <button type="button" className="btn btn-ghost" onClick={reset}>Try again</button>
        </div>
      )}
    </div>
  )
}
