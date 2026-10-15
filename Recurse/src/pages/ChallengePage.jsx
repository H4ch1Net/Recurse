import { Link, Navigate, useParams } from 'react-router-dom'
import { BookOpen, ChevronLeft, Repeat } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getChallengeMeta } from '../lib/practice'
import { formatRelative, redoText } from '../lib/dates'
import ChallengeView from '../components/ChallengeView'

const LANGUAGE_NAMES = { javascript: 'JavaScript', python: 'Python' }

/** A coding challenge on its own page: problem on the left, editor and tests on the right. */
export default function ChallengePage() {
  const { challengeId } = useParams()
  const challenge = getChallengeMeta(challengeId)
  const { practice, packMap, recordPractice, toast, now } = useApp()
  useDocumentTitle(challenge?.title || 'Challenge')
  if (!challenge) return <Navigate to="/practice?tab=challenges" replace />
  const entry = practice.challenges?.[challenge.id]
  const topic = challenge.topic ? packMap.get(challenge.topic) : null

  const solved = ({ language, hintsUsed = 0, solutionViewed = false, seconds = 0 } = {}) => {
    const xp = recordPractice('challenge', challenge.id, { language, hintsUsed, solutionUsed: solutionViewed, seconds, difficulty: challenge.difficulty })
    toast(`Solved · +${xp} XP`, { tone: 'good' })
  }

  return (
    <div className="page wide-page">
      <div className="row between wrap page-links">
        <Link to="/practice?tab=challenges" className="back-link small"><ChevronLeft size={16} /> Coding challenges</Link>
        {topic && <Link to={`/topic/${topic.id}/lesson`} className="small"><BookOpen size={14} style={{ verticalAlign: '-2px' }} /> Lesson: {topic.name}</Link>}
      </div>
      {entry && (
        <div className="callout good small" style={{ marginBottom: 'var(--s-4)' }}>
          <Repeat size={16} />
          <span>Solved {formatRelative(entry.solved, now)}{entry.languages?.length ? ` in ${entry.languages.map((l) => LANGUAGE_NAMES[l] || l).join(' and ')}` : ''}. {redoText(entry.card, now)} Solve it again without looking at your old code.</span>
        </div>
      )}
      <ChallengeView key={challenge.id} id={challenge.id} standalone solvedBefore={Boolean(entry)} onSolved={solved} />
    </div>
  )
}
