import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function NotFound() {
  useDocumentTitle('Not found')
  return (
    <div className="page narrow">
      <div className="card">
        <EmptyState art="lost" title="This card is missing from the drawer" action={<Link to="/" className="btn btn-primary">Go to Today</Link>}>
          The link may be old, or the pack it pointed to was removed.
        </EmptyState>
      </div>
    </div>
  )
}
