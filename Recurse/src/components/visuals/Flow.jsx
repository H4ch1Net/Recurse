import { ArrowDown, Check, CornerLeftUp, GitBranch } from 'lucide-react'
import { Inline } from '../RichText'

/** A process or decision procedure. Decisions show where "yes" leads and what "no" means. */
export default function Flow({ spec }) {
  const across = spec.direction === 'across' && spec.steps.length <= 5 && spec.steps.every((s) => !s.detail && !s.yes && !s.no)
  return (
    <div className={`v-flow-wrap${across ? ' across' : ''}`}>
      <ol className={`v-flow${spec.loop ? ' looped' : ''}`}>
        {spec.steps.map((step, i) => {
          const decision = Boolean(step.yes || step.no)
          return (
            <li key={i} className={`v-flow-step${decision ? ' decision' : ''}${step.tone ? ` toned v-tone-${step.tone}` : ''}`}>
              <div className="v-flow-card">
                <div className="v-flow-label">
                  {decision && <GitBranch size={14} className="v-flow-icon" aria-hidden="true" />}
                  <Inline text={step.label} />
                </div>
                {step.detail && <div className="v-flow-detail"><Inline text={step.detail} /></div>}
                {decision && (
                  <div className="v-flow-branches">
                    {step.yes && <div className="v-flow-yes"><Check size={13} aria-hidden="true" /><strong>Yes</strong><span><Inline text={step.yes} /></span></div>}
                    {step.no && <div className="v-flow-no"><ArrowDown size={13} aria-hidden="true" /><strong>No</strong><span><Inline text={step.no} /></span></div>}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {spec.loop && (
        <div className="v-flow-loop"><CornerLeftUp size={15} aria-hidden="true" /><span><Inline text={spec.loop} /></span></div>
      )}
    </div>
  )
}
