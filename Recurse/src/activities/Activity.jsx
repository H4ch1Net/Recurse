import { Component, Suspense, lazy, useRef, useState } from 'react'
import { CircleAlert, Loader2, MousePointerClick, RotateCcw, Target } from 'lucide-react'
import { ACTIVITY_GROUPS, ACTIVITY_MAP } from './catalog'
import { feedbackSuccess } from '../lib/juice'
import { Inline } from '../components/RichText'

// Widgets load on demand: a lesson only downloads the activities it actually shows.
// lazy() does not fetch anything until a widget first renders.
const WIDGETS = Object.fromEntries(
  Object.entries(import.meta.glob('./widgets/*.jsx')).map(([path, load]) => [path.slice('./widgets/'.length, -'.jsx'.length), lazy(load)])
)

/** Keeps one broken widget from taking the whole lesson down with it. */
class WidgetBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="callout bad">
          <CircleAlert size={18} />
          <span>This activity hit a problem and stopped. Use Reset to try again.</span>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * An interactive activity: frame (title, prompt, goal, reset) around a lazily loaded widget.
 * spec: { type, title?, prompt?, goal?, props? }. `done` marks a goal reached in an earlier visit.
 * Widgets call onComplete(result) when the learner reaches the goal; it fires once per run.
 */
export default function Activity({ spec, done = false, onComplete, standalone = false, compact = false }) {
  const meta = ACTIVITY_MAP[spec?.type]
  const Widget = WIDGETS[spec?.type]
  const [run, setRun] = useState(0)
  const [achieved, setAchieved] = useState(false)
  const frameRef = useRef(null)
  const reported = useRef(false)

  if (!meta) return null

  const complete = (result = {}) => {
    if (reported.current) return
    reported.current = true
    setAchieved(true)
    feedbackSuccess(frameRef.current?.querySelector('.activity-goal'), 'Goal reached')
    onComplete?.(result)
  }

  const reset = () => {
    reported.current = false
    setAchieved(false)
    setRun((n) => n + 1)
  }

  const goal = spec.goal || meta.goal
  return (
    <section ref={frameRef} className={`activity${compact ? ' compact' : ''}${achieved ? ' achieved' : ''}`} data-group={meta.group} aria-label={spec.title || meta.title}>
      <header className="activity-head">
        <span className="activity-badge"><MousePointerClick size={13} /> Interactive · {ACTIVITY_GROUPS[meta.group]}</span>
        {(achieved || done) && <span className="stamp good press">Done</span>}
        <button type="button" className="btn btn-ghost btn-sm activity-reset" onClick={reset} title="Start this activity over">
          <RotateCcw size={14} /> Reset
        </button>
      </header>
      <h3 className="activity-title">{spec.title || meta.title}</h3>
      {(spec.prompt || standalone) && <p className="activity-prompt"><Inline text={spec.prompt || meta.description} /></p>}
      {goal && (
        <div className={`activity-goal${achieved ? ' reached' : ''}`}>
          <Target size={15} />
          <span><strong>Goal:</strong> <Inline text={goal} /></span>
        </div>
      )}
      <div className="activity-body">
        {Widget ? (
          <WidgetBoundary key={run}>
            <Suspense fallback={<div className="activity-loading"><Loader2 size={18} className="spin" /> Loading activity</div>}>
              <Widget props={spec.props || {}} onComplete={complete} standalone={standalone} />
            </Suspense>
          </WidgetBoundary>
        ) : (
          <p className="small subtle">This activity is not available in this version.</p>
        )}
      </div>
    </section>
  )
}
