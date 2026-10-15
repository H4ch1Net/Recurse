import { Loader2, RotateCcw } from 'lucide-react'
import { useApp } from '../state/context'

/**
 * Renders its children once question text has loaded (it arrives right after startup).
 * `page` gives the placeholder page padding for whole screens.
 */
export default function QuestionGate({ children, page = false }) {
  const { questionsReady, questionsFailed, retryQuestions } = useApp()
  if (questionsReady) return children
  const body = questionsFailed ? (
    <div className="callout warn question-gate" role="alert">
      <span>The questions could not load. Check your connection, then try again.</span>
      <button type="button" className="btn btn-sm" onClick={retryQuestions}><RotateCcw size={14} /> Try again</button>
    </div>
  ) : (
    <div className="question-gate" aria-busy="true"><Loader2 size={18} className="spin" /> Loading questions</div>
  )
  return page ? <div className="page">{body}</div> : body
}
