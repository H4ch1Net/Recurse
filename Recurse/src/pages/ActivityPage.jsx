import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { ACTIVITY_MAP } from '../activities/catalog'
import { AVAILABLE_TYPES } from '../activities/available'
import Activity from '../activities/Activity'

/** A simulator from the lessons, on its own as a sandbox. */
export default function ActivityPage() {
  const { type } = useParams()
  const meta = ACTIVITY_MAP[type]
  const { practice, recordSandbox, packs } = useApp()
  useDocumentTitle(meta?.title || 'Simulator')
  if (!meta || !AVAILABLE_TYPES.has(type)) return <Navigate to="/practice?tab=activities" replace />
  const usedIn = packs.filter((p) => p.lesson?.sections?.some((s) => s.activity?.type === type)).slice(0, 6)
  return (
    <div className="page wide-page">
      <Link to="/practice?tab=activities" className="back-link small"><ChevronLeft size={16} /> Simulators</Link>
      <Activity key={type} spec={{ type }} done={Boolean(practice.activities?.[type])} onComplete={() => recordSandbox(type)} standalone />
      {usedIn.length > 0 && (
        <p className="small muted" style={{ marginTop: 'var(--s-4)' }}>
          Used in: {usedIn.map((p, i) => <span key={p.id}>{i > 0 && ', '}<Link to={`/topic/${p.id}/lesson`}>{p.name}</Link></span>)}
        </p>
      )}
    </div>
  )
}
