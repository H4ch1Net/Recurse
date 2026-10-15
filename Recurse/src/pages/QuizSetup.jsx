import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, FileCheck2, Timer } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { COLLECTIONS, getCollection } from '../lib/collections'
import { quizScope } from '../lib/quiz'
import { sfx } from '../lib/sfx'

const LENGTHS = [10, 20, 30, 50, 100]

export default function QuizSetup() {
  useDocumentTitle('Quizzes and exams')
  const { packs, packMap, progress } = useApp()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [scopeKind, setScopeKind] = useState(params.get('topic') ? 'topic' : params.get('path') ? 'path' : 'path')
  const [pathId, setPathId] = useState(params.get('path') || COLLECTIONS[0]?.id)
  const [stageId, setStageId] = useState(params.get('stage') || '')
  const [topicId, setTopicId] = useState(params.get('topic') || '')
  const [mode, setMode] = useState(params.get('mode') || 'quiz')
  const [n, setN] = useState(Number(params.get('n')) || 20)
  const path = getCollection(pathId)

  const scope = useMemo(() => quizScope({
    path: scopeKind === 'path' ? path : null,
    stageId: scopeKind === 'path' ? stageId || null : null,
    topicId: scopeKind === 'topic' ? topicId : null,
    packs,
    packMap,
    progress
  }), [scopeKind, path, stageId, topicId, packs, packMap, progress])
  const supply = scope ? scope.groups.reduce((sum, g) => sum + g.packs.reduce((s, p) => s + p.questions.filter((q) => q.type !== 'recall').length, 0), 0) : 0
  const count = Math.min(n, supply)
  const minutes = Math.max(5, Math.round(count * (path?.exam ? path.exam.minutes / path.exam.questions : 1.2)))

  const start = () => {
    sfx.pop()
    const q = new URLSearchParams({ mode, n: String(count) })
    if (scopeKind === 'path' && path) {
      q.set('path', path.id)
      if (stageId) q.set('stage', stageId)
    }
    if (scopeKind === 'topic' && topicId) q.set('topic', topicId)
    if (mode === 'exam') q.set('minutes', String(minutes))
    navigate(`/quiz/run?${q}`)
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <div className="eyebrow">Test yourself</div>
          <h1 className="page-title">Quizzes and exams</h1>
          <p className="page-sub">A quiz shows the answer after each question. An exam is timed, mixes topics like the real thing and only shows your score at the end. Every answer also updates your review schedule.</p>
        </div>
      </div>

      <section className="card roomy stack">
        <div className="stack-sm">
          <div className="label">Mode</div>
          <div className="grid-2 mode-choice">
            <button type="button" className={`mode-option${mode === 'quiz' ? ' on' : ''}`} onClick={() => setMode('quiz')} aria-pressed={mode === 'quiz'}>
              <FileCheck2 size={20} /> <strong>Quiz</strong>
              <span className="small muted">Feedback after every question. Best while learning.</span>
            </button>
            <button type="button" className={`mode-option${mode === 'exam' ? ' on' : ''}`} onClick={() => setMode('exam')} aria-pressed={mode === 'exam'}>
              <Timer size={20} /> <strong>Exam</strong>
              <span className="small muted">Timed, no feedback until the end. Measures readiness.</span>
            </button>
          </div>
        </div>

        <div className="stack-sm">
          <div className="label">What to cover</div>
          <div className="segmented" role="group" aria-label="Scope">
            {[['path', 'A path'], ['topic', 'One topic'], ['studied', 'Everything I studied']].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={scopeKind === id} onClick={() => setScopeKind(id)}>{label}</button>
            ))}
          </div>
          {scopeKind === 'path' && (
            <div className="row wrap">
              <select className="select" value={pathId} onChange={(e) => { setPathId(e.target.value); setStageId('') }} aria-label="Path">
                {COLLECTIONS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="select" value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="Stage">
                <option value="">Whole path</option>
                {path?.stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
          )}
          {scopeKind === 'topic' && (
            <select className="select" value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="Topic">
              <option value="">Choose a topic</option>
              {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>

        <div className="stack-sm">
          <div className="label">Questions</div>
          <div className="segmented" role="group" aria-label="Number of questions">
            {LENGTHS.map((len) => <button key={len} type="button" aria-pressed={n === len} onClick={() => setN(len)} disabled={supply > 0 && len > supply && len !== LENGTHS[0]}>{len}</button>)}
          </div>
          <p className="xsmall subtle">
            {scope ? `${supply} questions available in ${scope.title}.` : scopeKind === 'studied' ? 'Study a topic first, then quiz yourself on everything you have learned.' : 'Choose what to cover.'}
            {mode === 'exam' && scope ? ` Time limit: ${minutes} minutes.` : ''}
          </p>
        </div>

        <div>
          <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!scope || !count}>
            Start {mode === 'exam' ? 'exam' : 'quiz'} · {count} questions <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </div>
  )
}
