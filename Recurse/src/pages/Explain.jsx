import { useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, ChevronLeft, CircleAlert, Lightbulb, Loader2, MessageCircleQuestion, Sparkles, Trophy } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { AUDIENCES, gradeExplanation, isAIConfigured, PROVIDERS } from '../lib/ai'
import { feedbackComplete, feedbackSuccess } from '../lib/juice'
import { sfx } from '../lib/sfx'
import { Inline } from '../components/RichText'
import MemoryRing from '../components/MemoryRing'

const MIN_WORDS = 40
const FOLLOW_UP_WORDS = 15
const AUDIENCE_LABELS = { friend: 'A friend', kid: 'A 12-year-old', teammate: 'A new teammate', interviewer: 'An interviewer' }
const FACETS = [
  { id: 'what', label: 'What it is, in one plain sentence' },
  { id: 'why', label: 'Why it matters or what problem it solves' },
  { id: 'how', label: 'How it works, step by step' },
  { id: 'example', label: 'A concrete example' },
  { id: 'mistake', label: 'A common mistake or limit' }
]
const SELF_RATINGS = [
  { score: 25, label: 'Shaky', hint: 'I got stuck or hand-waved' },
  { score: 50, label: 'Partial', hint: 'The gist, with gaps' },
  { score: 75, label: 'Solid', hint: 'Clear, missed a detail' },
  { score: 95, label: 'Nailed it', hint: 'A beginner would follow it' }
]

const elapsedSince = (start) => (start ? Math.round((Date.now() - start) / 1000) : 0)

/** Key terms the text mentions, matched loosely on word boundaries. */
function termHits(text, terms) {
  const lower = text.toLowerCase()
  return terms.map((t) => {
    const needle = t.term.toLowerCase().replace(/[()]/g, '').split(/[,/]/)[0].trim()
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return { ...t, hit: needle.length > 1 && new RegExp(`(^|[^a-z0-9])${escaped}`, 'i').test(lower) }
  })
}

/** Without AI: follow up on the section whose ideas the explanation touched least. */
function offlineFollowUp(pack, text, asked) {
  const lower = text.toLowerCase()
  const sections = pack.lesson.sections
    .map((s, i) => ({ s, i, overlap: s.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && lower.includes(w)).length }))
    .filter(({ i }) => !asked.includes(i))
    .sort((a, b) => a.overlap - b.overlap)
  const pick = sections[0]
  return pick ? { index: pick.i, question: `Now explain “${pick.s.title}” in more depth. What happens, and why?` } : null
}

export default function Explain() {
  const { topicId } = useParams()
  const { packMap, callNos, ai, recordFeynman, toast } = useApp()
  const pack = packMap.get(topicId)
  const [audience, setAudience] = useState('friend')
  const [rounds, setRounds] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [facets, setFacets] = useState({})
  const [selfReview, setSelfReview] = useState(false)
  const [finished, setFinished] = useState(null)
  const [showModel, setShowModel] = useState(false)
  const startedAt = useRef(null)
  const resultRef = useRef(null)
  useDocumentTitle(pack ? `Explain ${pack.name}` : 'Explain')

  const terms = useMemo(() => termHits([...rounds.map((r) => r.text), text].join(' '), pack?.lesson?.keyTerms || []), [rounds, text, pack])
  if (!pack) return <Navigate to="/library" replace />
  if (!pack.lesson) return <Navigate to={`/topic/${topicId}`} replace />

  const configured = isAIConfigured(ai)
  const round = rounds.length
  const followUp = round > 0 ? rounds[round - 1].followUp : null
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const minWords = round ? FOLLOW_UP_WORDS : MIN_WORDS
  const ready = words >= minWords
  const facetCount = FACETS.filter((f) => facets[f.id]).length

  const finish = (score, aiGraded, allRounds) => {
    const fullText = allRounds.map((r) => r.text).join('\n\n')
    const xp = recordFeynman(pack.id, { text: fullText, words: fullText.split(/\s+/).filter(Boolean).length, score, ai: aiGraded, seconds: elapsedSince(startedAt.current), rounds: allRounds.length, audience })
    setFinished({ score, xp, gotIt: score >= 85 })
    if (score >= 85) feedbackComplete({ big: true })
    else feedbackSuccess(resultRef.current, `+${xp} XP`)
    toast(`Explanation saved · +${xp} XP`, { tone: 'good' })
  }

  const submitAI = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await gradeExplanation(ai, {
        topic: pack.name,
        prompt: followUp || pack.lesson.feynmanPrompt,
        keyTerms: pack.lesson.keyTerms.map((t) => t.term),
        text,
        audience,
        rounds
      })
      const nextRounds = [...rounds, { text, followUp: result.gotIt ? '' : result.followUp, score: result.score }]
      setRounds(nextRounds)
      setFeedback(result)
      setShowModel(false)
      setText('')
      if (result.gotIt || !result.followUp) finish(result.score, true, nextRounds)
      else sfx.flip()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const submitSelf = (score) => {
    const asked = rounds.map((r) => r.sectionIndex).filter((i) => i !== undefined)
    const next = score >= 75 && facetCount >= 4 ? null : offlineFollowUp(pack, [...rounds.map((r) => r.text), text].join(' '), asked)
    const nextRounds = [...rounds, { text, followUp: next?.question || '', sectionIndex: next?.index, score }]
    setRounds(nextRounds)
    setSelfReview(false)
    setText('')
    setFacets({})
    if (!next) finish(score, false, nextRounds)
    else sfx.flip()
  }

  const stopHere = () => {
    const last = rounds[rounds.length - 1]
    finish(last?.score ?? 50, Boolean(feedback), rounds)
  }

  const reset = () => {
    setRounds([])
    setText('')
    setFeedback(null)
    setSelfReview(false)
    setFinished(null)
    setFacets({})
    setError('')
    startedAt.current = null
  }

  const waitingForFollowUp = round > 0 && followUp && !finished
  return (
    <div className="page narrow">
      <Link to={`/topic/${pack.id}`} className="back-link small"><ChevronLeft size={16} /> {pack.name}</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">Feynman technique</div>
          <h1 className="page-title">Explain it simply</h1>
          <p className="page-sub">Explain the topic so your listener could follow it. Each round points at a gap and asks one follow-up question. Keep going until it says you have got it.</p>
        </div>
      </div>

      {!finished && (
        <section className="card roomy stack">
          <div className="catalog-head"><span className="callno">{callNos.get(pack.id)} · {pack.name}</span><span className="callno">Round {round + 1}</span></div>

          {round === 0 && (
            <div className="stack-sm">
              <div className="label">Who are you explaining to?</div>
              <div className="segmented" role="group" aria-label="Audience">
                {Object.keys(AUDIENCES).map((id) => (
                  <button key={id} type="button" aria-pressed={audience === id} onClick={() => setAudience(id)}>{AUDIENCE_LABELS[id]}</button>
                ))}
              </div>
            </div>
          )}

          {rounds.length > 0 && (
            <details className="feynman-history">
              <summary className="small">Your earlier {rounds.length === 1 ? 'round' : 'rounds'}</summary>
              {rounds.map((r, i) => <p key={i} className="small muted" style={{ whiteSpace: 'pre-wrap' }}><strong>Round {i + 1}:</strong> {r.text}</p>)}
            </details>
          )}

          <div className={`feynman-prompt${waitingForFollowUp ? ' follow-up' : ''}`}>
            {waitingForFollowUp ? <MessageCircleQuestion size={18} /> : <Lightbulb size={18} />}
            <p>{waitingForFollowUp ? <><strong>Follow-up:</strong> <Inline text={followUp} /></> : <Inline text={pack.lesson.feynmanPrompt} />}</p>
          </div>

          {feedback && waitingForFollowUp && (
            <div className="grid-2 feynman-feedback rise">
              <div className="card"><h3 className="small good-text feedback-title">What worked</h3><p className="small">{feedback.strengths}</p></div>
              <div className="card"><h3 className="small warn-text feedback-title">What was missing</h3><p className="small">{feedback.gaps}</p></div>
              {feedback.misconceptions && <div className="card" style={{ gridColumn: '1 / -1' }}><h3 className="small bad-text feedback-title">Misconceptions to fix</h3><p className="small">{feedback.misconceptions}</p></div>}
            </div>
          )}

          <div className="field">
            <label htmlFor="explanation" className="sr-only">Your explanation</label>
            <textarea
              id="explanation"
              className="textarea lined feynman-text"
              rows={round ? 6 : 10}
              value={text}
              onChange={(e) => {
                if (!startedAt.current) startedAt.current = Date.now()
                setText(e.target.value)
              }}
              readOnly={selfReview}
              placeholder={round ? 'Answer the follow-up in plain words.' : 'Use plain words. Give an example. Say why, not just what.'}
            />
            <div className="row between xsmall">
              <span className={ready ? 'good-text' : 'subtle'}>{ready ? <><Check size={12} style={{ verticalAlign: '-1px' }} /> {words} words</> : `${words} / ${minWords} words`}</span>
              <span className="subtle">Write from memory. Peeking defeats the purpose.</span>
            </div>
          </div>

          <div>
            <div className="eyebrow">Key ideas you have used</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {terms.map((t) => (
                <span key={t.term} className={`chip ${t.hit ? 'good' : 'outline'}`} title={t.hit ? 'Mentioned' : 'Not mentioned yet'}>
                  {t.hit && <Check size={12} />} {t.term}
                </span>
              ))}
            </div>
          </div>

          {error && <div className="callout bad" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}

          {!selfReview && (
            <div className="row wrap">
              {configured && (
                <button type="button" className="btn btn-primary btn-lg" onClick={submitAI} disabled={!ready || busy}>
                  {busy ? <><Loader2 size={18} className="spin" /> Reading your explanation</> : <><Sparkles size={18} /> {round ? 'Send my answer' : 'Get feedback'}</>}
                </button>
              )}
              <button type="button" className={`btn btn-lg ${configured ? '' : 'btn-primary'}`} onClick={() => setSelfReview(true)} disabled={!ready || busy}>
                Check it myself
              </button>
              {round > 0 && <button type="button" className="btn btn-ghost" onClick={stopHere}>Finish for now</button>}
            </div>
          )}
          {!configured && round === 0 && (
            <p className="xsmall subtle">
              Want written feedback and follow-up questions from AI? <Link to="/settings#ai">Add an API key</Link> from {Object.values(PROVIDERS).map((p) => p.label).join(', ')}. Without one, you check your explanation against a checklist and the lesson summary, and Recurse picks the follow-up.
            </p>
          )}

          {selfReview && (
            <div className="stack rise self-review">
              <h2 className="section-title">Check it honestly</h2>
              <p className="small muted">Tick only what your explanation actually did. Then compare with the summary below.</p>
              <div className="stack-sm">
                {FACETS.map((f) => (
                  <label key={f.id} className="check-row">
                    <input type="checkbox" checked={Boolean(facets[f.id])} onChange={(e) => { setFacets((x) => ({ ...x, [f.id]: e.target.checked })); sfx.tap() }} />
                    <span className="small">{f.label}</span>
                  </label>
                ))}
              </div>
              <ul className="summary-list">
                {pack.lesson.summary.map((line, i) => <li key={i}><Inline text={line} /></li>)}
              </ul>
              <div className="eyebrow">How well did you explain it?</div>
              <div className="grades self-grades">
                {SELF_RATINGS.map((r) => (
                  <button key={r.score} type="button" className="grade" onClick={() => submitSelf(r.score)}>
                    <span className="grade-label">{r.label}</span>
                    <span className="grade-when">{r.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {finished && (
        <section ref={resultRef} className={`card roomy stack rise feynman-result${finished.gotIt ? ' got-it' : ''}`}>
          <div className="catalog-head"><span className="callno">{rounds.length} {rounds.length === 1 ? 'round' : 'rounds'} · {AUDIENCE_LABELS[audience]}</span>{finished.gotIt && <span className="stamp good press">Got it</span>}</div>
          <div className="row" style={{ gap: 'var(--s-5)' }}>
            <MemoryRing value={finished.score / 100} size={104} stroke={9} label="score" />
            <div className="stack-sm">
              <h2 className="page-title">{finished.gotIt ? <><Trophy size={26} /> You have got it.</> : 'Good progress.'}</h2>
              <p className="muted">{finished.gotIt ? 'Explaining it clearly is the strongest sign you understand it. Try again in a week to check it held.' : 'Reread the sections you blurred, then come back and explain it again. Each attempt makes the next one easier.'}</p>
            </div>
          </div>
          {feedback && (
            <>
              <div className="grid-2">
                <div className="card"><h3 className="small good-text feedback-title">What worked</h3><p className="small">{feedback.strengths}</p></div>
                <div className="card"><h3 className="small warn-text feedback-title">Still worth adding</h3><p className="small">{feedback.gaps}</p></div>
              </div>
              {feedback.modelExplanation && (
                <div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowModel((v) => !v)}>{showModel ? 'Hide' : 'Show'} a model explanation</button>
                  {showModel && <p className="small rise" style={{ marginTop: 8 }}>{feedback.modelExplanation}</p>}
                </div>
              )}
              <p className="xsmall subtle">AI feedback can be wrong. Check anything surprising against the lesson.</p>
            </>
          )}
          <div className="row wrap">
            <Link to={`/study/topic/${pack.id}`} className="btn btn-primary">Study the cards <ArrowRight size={16} /></Link>
            <Link to={`/topic/${pack.id}/lesson`} className="btn">Reread the lesson</Link>
            <button type="button" className="btn btn-ghost" onClick={reset}>Explain it again</button>
          </div>
        </section>
      )}
    </div>
  )
}
