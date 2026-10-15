import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight, BookOpen, ChevronLeft, Repeat } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { CONSOLE_LABS, getLab } from '../lib/practice'
import { formatRelative } from '../lib/dates'
import Activity from '../activities/Activity'

/** One Cisco console lab, full width, or a free sandbox at /practice/lab/sandbox. */
export default function LabPage() {
  const { labId } = useParams()
  const sandbox = labId === 'sandbox'
  const lab = sandbox ? null : getLab(labId)
  const { practice, packMap, recordPractice, toast, now } = useApp()
  useDocumentTitle(sandbox ? 'Console sandbox' : lab?.title || 'Lab')
  if (!sandbox && !lab) return <Navigate to="/practice?tab=labs" replace />

  const entry = lab ? practice.labs?.[lab.id] : null
  const topic = lab?.topic ? packMap.get(lab.topic) : null
  const index = lab ? CONSOLE_LABS.findIndex((l) => l.id === lab.id) : -1
  const next = index >= 0 ? CONSOLE_LABS[index + 1] : null

  const complete = (result = {}) => {
    if (!lab) return
    const score = result.score ?? 1
    const xp = recordPractice('lab', lab.id, {
      score,
      hintsUsed: score >= 0.99 ? 0 : score >= 0.8 ? 1 : 2,
      solutionUsed: score < 0.5,
      seconds: result.seconds || 0
    })
    toast(`Lab passed · +${xp} XP`, { tone: 'good' })
  }

  return (
    <div className="page wide-page">
      <Link to="/practice?tab=labs" className="back-link small"><ChevronLeft size={16} /> Console labs</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">{sandbox ? 'Free practice' : `${lab.kind === 'troubleshoot' ? 'Troubleshooting lab' : 'Build lab'} · ${lab.difficulty}`}</div>
          <h1 className="page-title">{sandbox ? 'Console sandbox' : lab.title}</h1>
          {!sandbox && <p className="page-sub">{lab.objective}</p>}
          {sandbox && <p className="page-sub">A router or switch to experiment on. Nothing is graded here: try commands, read the help with <code>?</code>, and break things on purpose.</p>}
        </div>
        <div className="row wrap">
          {topic && <Link to={`/topic/${topic.id}/lesson`} className="btn"><BookOpen size={16} /> {topic.name} lesson</Link>}
        </div>
      </div>
      {entry && (
        <div className="callout good small" style={{ marginBottom: 'var(--s-4)' }}>
          <Repeat size={16} />
          <span>Passed {formatRelative(entry.solved, now)}{entry.count > 1 ? `, ${entry.count} runs` : ''}. {entry.card ? `Next redo ${formatRelative(entry.card.due, now)}.` : ''} Run it again from memory: the redo is what makes the commands automatic.</span>
        </div>
      )}
      <Activity key={labId} spec={{ type: 'ios-console', title: sandbox ? 'Cisco IOS' : 'Console', props: sandbox ? {} : { lab: lab.id } }} done={Boolean(entry)} onComplete={complete} standalone />
      {next && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s-4)' }}>
          <Link to={`/practice/lab/${next.id}`} className="btn">Next lab: {next.title} <ArrowRight size={16} /></Link>
        </div>
      )}
    </div>
  )
}
