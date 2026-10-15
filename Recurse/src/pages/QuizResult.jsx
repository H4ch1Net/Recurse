import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight, BookOpen, ChevronDown, CircleCheck, CircleX, RotateCcw } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { answerText } from '../lib/answers'
import { formatDuration } from '../lib/dates'
import { feedbackComplete } from '../lib/juice'
import { getCollection } from '../lib/collections'
import { Inline } from '../components/RichText'
import RichText from '../components/RichText'
import MemoryRing from '../components/MemoryRing'
import CountUp from '../components/CountUp'

export default function QuizResult() {
  const { examId } = useParams()
  const { practice, packMap } = useApp()
  const exam = practice.exams.find((e) => e.id === examId)
  useDocumentTitle(exam?.mode === 'exam' ? 'Exam results' : 'Quiz results')
  const [open, setOpen] = useState({})
  const celebrated = useRef(false)
  useEffect(() => {
    if (!exam || celebrated.current) return
    celebrated.current = true
    if (Date.now() - new Date(exam.date) < 15000 && exam.score >= 70) setTimeout(() => feedbackComplete({ big: exam.score >= (exam.pass || 85) }), 250)
  }, [exam])
  if (!exam) return <Navigate to="/quiz" replace />

  const path = getCollection(exam.pathId)
  const pass = exam.pass ? exam.score >= exam.pass : null
  const missed = (exam.answers || []).filter((a) => !a.correct).map((a) => {
    const pack = packMap.get(a.packId)
    return { pack, question: pack?.questions.find((q) => q.id === a.questionId) }
  }).filter((m) => m.question)
  const retake = new URLSearchParams({ mode: exam.mode, n: String(exam.total) })
  if (exam.pathId) retake.set('path', exam.pathId)
  if (exam.stageId) retake.set('stage', exam.stageId)
  if (exam.topicId) retake.set('topic', exam.topicId)

  return (
    <div className="page narrow">
      <section className="slip complete-hero">
        <div className="catalog-head">
          <span className="callno">{exam.mode === 'exam' ? 'Practice exam' : 'Quiz'} · {exam.title}</span>
          {pass !== null && <span className={`stamp press${pass ? ' good' : ''}`}>{pass ? 'Pass' : 'Not yet'}</span>}
        </div>
        <div className="quiz-score">
          <MemoryRing value={exam.score / 100} size={132} stroke={10} label="score" />
          <div className="stack-sm">
            <h1 className="page-title"><CountUp value={exam.correct} /> of {exam.total} right</h1>
            <p className="page-sub">
              {pass === null
                ? exam.score >= 85 ? 'Excellent recall.' : exam.score >= 65 ? 'Good, with a few gaps worth reviewing.' : 'The misses below are now scheduled to come back soon.'
                : pass ? `At or above the ${exam.pass}% target. Keep taking exams to make sure it is consistent.` : `The target is ${exam.pass}%. The domains below show where to focus.`}
            </p>
            <p className="xsmall subtle">{formatDuration(exam.seconds)} · +{exam.xp} XP · every answer updated your review schedule</p>
          </div>
        </div>
        {exam.byGroup?.length > 1 && (
          <div className="stack-sm" style={{ marginTop: 'var(--s-4)' }}>
            {exam.byGroup.map((g) => {
              const pct = g.total ? g.correct / g.total : 0
              return (
                <div key={g.id} className="experiment-mini-row wide">
                  <span className="small">{g.title}</span>
                  <span className={`bar ${pct < 0.7 ? 'bar-warn' : ''}`}><span style={{ width: `${pct * 100}%` }} /></span>
                  <span className="xsmall tabular">{g.correct}/{g.total}</span>
                </div>
              )
            })}
          </div>
        )}
        <div className="row wrap" style={{ marginTop: 'var(--s-4)' }}>
          {missed.length > 0 && <Link to="/study/mistakes" className="btn btn-primary btn-lg">Review the {missed.length} misses <ArrowRight size={18} /></Link>}
          <Link to={`/quiz/run?${retake}`} className="btn btn-lg"><RotateCcw size={18} /> New {exam.mode === 'exam' ? 'exam' : 'quiz'}</Link>
          {path && <Link to={`/path/${path.id}`} className="btn btn-lg btn-ghost">Back to {path.short}</Link>}
        </div>
      </section>

      {missed.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }}>
          <div className="section-head"><h2 className="section-title">What you missed</h2><span className="callno">{missed.length}</span></div>
          <div className="list">
            {missed.map(({ pack, question }) => {
              const key = `${pack.id}:${question.id}`
              const section = question.section != null ? pack.lesson?.sections?.[question.section] : null
              return (
                <div key={key} className="list-row result-row missed-row">
                  <CircleX size={18} className="bad-text" aria-label="Missed" />
                  <div className="grow stack-sm">
                    <button type="button" className="missed-toggle" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} aria-expanded={Boolean(open[key])}>
                      <span className="small"><Inline text={question.question} /></span>
                      <ChevronDown size={16} className={open[key] ? 'flip' : ''} />
                    </button>
                    <div className="xsmall good-text"><CircleCheck size={12} style={{ verticalAlign: '-2px' }} /> <Inline text={String(answerText(question))} /></div>
                    {open[key] && (
                      <div className="rise stack-sm">
                        {question.explanation && <RichText text={question.explanation} className="prose small-prose" />}
                        {section && <Link to={`/topic/${pack.id}/lesson#section-${question.section + 1}`} className="xsmall"><BookOpen size={12} /> Reread: {section.title} ({pack.name})</Link>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
