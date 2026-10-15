import { Check } from 'lucide-react'
import { COLLECTIONS } from '../lib/collections'
import { groupGoals } from '../lib/goals'
import PathIcon from './PathIcon'

/** "What do you want to achieve?": every goal as a toggle, grouped by kind. */
export default function GoalPicker({ selected = [], onToggle, showTaglines = true }) {
  const chosen = new Set(selected)
  return (
    <div className="goal-groups">
      {groupGoals(COLLECTIONS).map((group) => (
        <section key={group.kind} className="goal-group" aria-labelledby={`goal-group-${group.kind}`}>
          <div className="goal-group-head">
            <h2 className="list-title" id={`goal-group-${group.kind}`}>{group.title}</h2>
            <p className="xsmall subtle">{group.blurb}</p>
          </div>
          <div className="goal-grid">
            {group.paths.map((c) => (
              <button key={c.id} type="button" className="goal-option" aria-pressed={chosen.has(c.id)} onClick={() => onToggle(c.id)} style={{ '--hue': c.hue }}>
                <PathIcon collection={c} size="sm" />
                <span className="grow">
                  <span className="list-title">{c.name}</span>
                  {showTaglines && <span className="xsmall subtle">{c.tagline}</span>}
                </span>
                {chosen.has(c.id) && <Check size={16} className="check" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
