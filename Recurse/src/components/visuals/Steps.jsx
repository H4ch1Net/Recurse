import { Inline } from '../RichText'

/** A worked example: numbered steps with short monospace work, ending in the result. */
export default function Steps({ spec }) {
  return (
    <div className="v-steps">
      <ol>
        {spec.steps.map((step, i) => (
          <li key={i} className="v-step">
            <span className="v-step-num" aria-hidden="true">{i + 1}</span>
            <div className="v-step-body">
              <div className="v-step-label"><Inline text={step.label} /></div>
              {step.work && <pre className="v-step-work">{step.work}</pre>}
              {step.note && <div className="v-step-note"><Inline text={step.note} /></div>}
            </div>
          </li>
        ))}
      </ol>
      {spec.result && (
        <div className="v-steps-result">
          <span className="v-steps-result-label">Result</span>
          <span><Inline text={spec.result} /></span>
        </div>
      )}
    </div>
  )
}
