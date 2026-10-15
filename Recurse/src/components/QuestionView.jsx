import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, CircleCheck, CircleX, Eye, Terminal, Undo2, X } from 'lucide-react'
import { checkCli, checkMatch, checkMulti, checkOrder, checkTyped } from '../lib/answers'
import { isChoiceType } from '../lib/packSchema'
import { sfx } from '../lib/sfx'
import { Inline } from './RichText'


const LETTERS = 'ABCDEF'
const isTyping = (target) => target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

/** Run a key handler while `active`, ignoring keys typed into fields and open dialogs. */
function useKeys(active, handler) {
  const onKey = useEffectEvent((event) => {
    if (!active || event.altKey || event.metaKey || event.ctrlKey || event.defaultPrevented) return
    if (document.querySelector('[role="dialog"]')) return
    if (isTyping(event.target)) return
    if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return
    if (handler(event.key.length === 1 ? event.key.toLowerCase() : event.key) !== false) event.preventDefault()
  })
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function ChoiceAnswer({ question, order, answered, outcome, onSubmit, keys }) {
  const submit = (original) => {
    if (answered) return
    onSubmit({ correct: original === question.answer, given: question.choices[original], picked: original })
  }
  useKeys(keys && !answered, (key) => {
    const i = 'abcdef'.indexOf(key)
    if (i === -1 || order[i] === undefined) return false
    submit(order[i])
  })
  return (
    <div className="choices" role="group" aria-label="Answer choices">
      {order.map((original, i) => {
        const isAnswer = original === question.answer
        const state = !answered ? '' : isAnswer ? ' is-correct' : original === outcome?.picked ? ' is-wrong' : ' is-dim'
        return (
          <button key={original} type="button" className={`choice${state}`} onClick={() => submit(original)} disabled={answered} aria-keyshortcuts={keys ? 'abcdef'[i] : undefined}>
            <span className="choice-key">{LETTERS[i]}</span>
            <span className="choice-text"><Inline text={question.choices[original]} /></span>
            {answered && isAnswer && <CircleCheck size={20} className="choice-icon good-text" aria-label="Correct answer" />}
            {answered && original === outcome?.picked && !isAnswer && <CircleX size={20} className="choice-icon bad-text" aria-label="Your answer" />}
          </button>
        )
      })}
    </div>
  )
}

function MultiAnswer({ question, order, answered, outcome, onSubmit, keys }) {
  const [selected, setSelected] = useState([])
  const toggle = (original) => {
    if (answered) return
    sfx.tap()
    setSelected((list) => (list.includes(original) ? list.filter((x) => x !== original) : [...list, original]))
  }
  const submit = () => {
    if (answered || !selected.length) return
    const result = checkMulti(selected, question)
    onSubmit({ correct: result.correct, given: selected.map((i) => question.choices[i]).join('; '), selected })
  }
  useKeys(keys && !answered, (key) => {
    if (key === 'Enter') return selected.length ? submit() : false
    const i = 'abcdef'.indexOf(key)
    if (i === -1 || order[i] === undefined) return false
    toggle(order[i])
  })
  const chosen = answered ? outcome?.selected || [] : selected
  return (
    <div className="stack-sm">
      <div className="choices" role="group" aria-label="Select all that apply">
        {order.map((original, i) => {
          const on = chosen.includes(original)
          const right = question.answers.includes(original)
          const state = !answered ? (on ? ' is-on' : '') : right ? (on ? ' is-correct' : ' is-missed') : on ? ' is-wrong' : ' is-dim'
          return (
            <button key={original} type="button" className={`choice multi${state}`} onClick={() => toggle(original)} disabled={answered} aria-pressed={on}>
              <span className="choice-key multi-box" aria-hidden="true">{on ? <Check size={14} /> : LETTERS[i]}</span>
              <span className="choice-text"><Inline text={question.choices[original]} /></span>
              {answered && right && !on && <span className="xsmall warn-text choice-note">Missed</span>}
              {answered && right && on && <CircleCheck size={20} className="choice-icon good-text" aria-label="Correct" />}
              {answered && !right && on && <CircleX size={20} className="choice-icon bad-text" aria-label="Not correct" />}
            </button>
          )
        })}
      </div>
      {!answered && (
        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!selected.length}>Check <span className="kbd">Enter</span></button>
          <span className="xsmall subtle">{selected.length} selected</span>
        </div>
      )}
    </div>
  )
}

function OrderAnswer({ question, order, answered, outcome, onSubmit, keys }) {
  const [placed, setPlaced] = useState([])
  const remaining = order.filter((i) => !placed.includes(i))
  const place = (index) => {
    if (answered) return
    sfx.pop()
    setPlaced((list) => [...list, index])
  }
  const unplace = (index) => {
    if (answered) return
    sfx.tap()
    setPlaced((list) => list.filter((x) => x !== index))
  }
  const move = (position, delta) => {
    setPlaced((list) => {
      const next = [...list]
      const target = position + delta
      if (target < 0 || target >= next.length) return list
      ;[next[position], next[target]] = [next[target], next[position]]
      return next
    })
  }
  const submit = () => {
    if (answered || placed.length !== question.items.length) return
    const result = checkOrder(placed, question)
    onSubmit({ correct: result.correct, given: placed.map((i) => question.items[i]).join(' → '), sequence: placed })
  }
  useKeys(keys && !answered, (key) => {
    if (key === 'Enter') return placed.length === question.items.length ? submit() : false
    if (key === 'Backspace' && placed.length) return unplace(placed[placed.length - 1])
    const i = Number(key) - 1
    if (!Number.isInteger(i) || i < 0 || remaining[i] === undefined) return false
    place(remaining[i])
  })
  const sequence = answered ? outcome?.sequence || [] : placed
  return (
    <div className="order-answer">
      <ol className="order-slots" aria-label="Your order">
        {question.items.map((_, position) => {
          const index = sequence[position]
          const filled = index !== undefined
          const state = answered && filled ? (index === position ? ' is-correct' : ' is-wrong') : ''
          return (
            <li key={position} className={`order-slot${filled ? ' filled' : ''}${state}`}>
              <span className="order-num">{position + 1}</span>
              {filled ? (
                <>
                  <span className="grow"><Inline text={question.items[index]} /></span>
                  {!answered && (
                    <span className="order-tools">
                      <button type="button" className="icon-btn sm" onClick={() => move(position, -1)} disabled={position === 0} aria-label="Move up"><ArrowUp size={14} /></button>
                      <button type="button" className="icon-btn sm" onClick={() => move(position, 1)} disabled={position === placed.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
                      <button type="button" className="icon-btn sm" onClick={() => unplace(index)} aria-label="Remove"><X size={14} /></button>
                    </span>
                  )}
                  {answered && index !== position && <span className="xsmall subtle order-should">should be step {index + 1}</span>}
                </>
              ) : (
                <span className="subtle small">{position === placed.length && !answered ? 'Tap the next step below' : ''}</span>
              )}
            </li>
          )
        })}
      </ol>
      {!answered && remaining.length > 0 && (
        <div className="order-pool" role="group" aria-label="Steps to place">
          {remaining.map((index, i) => (
            <button key={index} type="button" className="order-chip" onClick={() => place(index)}>
              {keys && i < 9 && <span className="kbd">{i + 1}</span>} <Inline text={question.items[index]} />
            </button>
          ))}
        </div>
      )}
      {!answered && (
        <div className="row wrap" style={{ marginTop: 'var(--s-3)' }}>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={placed.length !== question.items.length}>Check <span className="kbd">Enter</span></button>
          {placed.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => setPlaced([])}><Undo2 size={14} /> Start over</button>}
        </div>
      )}
    </div>
  )
}

const PAIR_HUES = [250, 145, 25, 310, 80, 190]

function MatchAnswer({ question, order, answered, outcome, onSubmit, keys }) {
  const [pairing, setPairing] = useState({})
  const [active, setActive] = useState(null)
  const shown = answered ? outcome?.pairing || {} : pairing
  const leftOf = (right) => Object.keys(shown).find((left) => shown[left] === right)
  const complete = Object.keys(pairing).length === question.pairs.length
  const pickLeft = (i) => {
    if (answered) return
    sfx.tap()
    setActive((a) => (a === i ? null : i))
  }
  const pickRight = (r) => {
    if (answered) return
    const left = active ?? question.pairs.findIndex((_, i) => pairing[i] === undefined)
    if (left === -1 || left === null) return
    sfx.pop()
    setPairing((p) => {
      const next = { ...p }
      for (const k of Object.keys(next)) if (next[k] === r) delete next[k]
      next[left] = r
      return next
    })
    setActive(null)
  }
  const submit = () => {
    if (answered || !complete) return
    const result = checkMatch(pairing, question)
    onSubmit({ correct: result.correct, given: question.pairs.map((p, i) => `${p.left}: ${question.pairs[pairing[i]]?.right ?? ''}`).join('; '), pairing })
  }
  useKeys(keys && !answered, (key) => (key === 'Enter' && complete ? submit() : false))
  const results = answered ? checkMatch(shown, question).results : []
  return (
    <div className="match-answer">
      <div className="match-grid">
        <div className="match-col" role="group" aria-label="Items">
          {question.pairs.map((pair, i) => {
            const paired = shown[i] !== undefined
            const hue = PAIR_HUES[i % PAIR_HUES.length]
            const state = answered ? (results[i] ? ' is-correct' : ' is-wrong') : active === i ? ' is-active' : ''
            return (
              <button key={i} type="button" className={`match-item left${paired ? ' paired' : ''}${state}`} style={paired ? { '--pair-hue': hue } : undefined} onClick={() => pickLeft(i)} disabled={answered} aria-pressed={active === i}>
                <Inline text={pair.left} />
                {paired && <span className="match-dot" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        <div className="match-col" role="group" aria-label="Matches">
          {order.map((r) => {
            const left = leftOf(r)
            const paired = left !== undefined
            const hue = PAIR_HUES[Number(left) % PAIR_HUES.length]
            return (
              <button key={r} type="button" className={`match-item right${paired ? ' paired' : ''}`} style={paired ? { '--pair-hue': hue } : undefined} onClick={() => pickRight(r)} disabled={answered}>
                {paired && <span className="match-dot" aria-hidden="true" />}
                <Inline text={question.pairs[r].right} />
              </button>
            )
          })}
        </div>
      </div>
      {answered && results.some((r) => !r) && (
        <ul className="match-key small">
          {question.pairs.map((p, i) => !results[i] && <li key={i}><strong><Inline text={p.left} /></strong> → <Inline text={p.right} /></li>)}
        </ul>
      )}
      {!answered && (
        <div className="row wrap" style={{ marginTop: 'var(--s-3)' }}>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!complete}>Check <span className="kbd">Enter</span></button>
          {Object.keys(pairing).length > 0 && <button type="button" className="btn btn-ghost" onClick={() => { setPairing({}); setActive(null) }}><Undo2 size={14} /> Clear</button>}
          <span className="xsmall subtle">{Object.keys(pairing).length} / {question.pairs.length} matched</span>
        </div>
      )}
    </div>
  )
}

function TextAnswer({ question, answered, outcome, onSubmit, autoFocus, allowGiveUp }) {
  const [text, setText] = useState('')
  const ref = useRef(null)
  const cli = question.type === 'cli'
  useEffect(() => {
    if (autoFocus && !answered) ref.current?.focus({ preventScroll: true })
  }, [autoFocus, answered])
  const submit = (giveUp = false) => {
    if (answered || (!giveUp && !text.trim())) return
    const check = giveUp ? { correct: false, nearMiss: false } : cli ? checkCli(text, question) : checkTyped(text, question)
    onSubmit({ ...check, given: giveUp ? '' : text.trim(), gaveUp: giveUp })
  }
  return (
    <form className={`typed-form${cli ? ' cli-form' : ''}`} onSubmit={(e) => { e.preventDefault(); submit() }}>
      <div className={cli ? 'cli-input-wrap' : undefined}>
        {cli && <span className="cli-prompt" aria-hidden="true">{question.shell === 'ios' ? 'R1#' : question.shell === 'sql' ? 'sql>' : '$'}</span>}
        <input
          ref={ref}
          className={`input lg${cli ? ' cli-input' : ''}${outcome ? (outcome.correct ? ' is-correct' : ' is-wrong') : ''}`}
          value={answered ? outcome?.given ?? text : text}
          onChange={(e) => setText(e.target.value)}
          readOnly={answered}
          placeholder={cli ? 'command' : 'Your answer'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Your answer"
        />
      </div>
      {!answered && (
        <div className="row wrap">
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>{cli ? <Terminal size={16} /> : null} Check <span className="kbd">Enter</span></button>
          {allowGiveUp && <button type="button" className="btn btn-ghost" onClick={() => submit(true)}>I don’t know</button>}
        </div>
      )}
    </form>
  )
}

function RecallAnswer({ answered, onSubmit, keys }) {
  const [text, setText] = useState('')
  const reveal = () => !answered && onSubmit({ correct: null, given: text.trim() })
  useKeys(keys && !answered, (key) => (key === ' ' || key === 'Enter' ? reveal() : false))
  if (answered) return null
  return (
    <div className="stack-sm">
      <textarea
        className="textarea lined"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            reveal()
          }
        }}
        placeholder="Optional: write your answer first. Writing it out shows you what you actually know. Ctrl+Enter reveals."
        aria-label="Your answer (optional)"
      />
      <div>
        <button type="button" className="btn btn-primary" onClick={() => { sfx.flip(); reveal() }}><Eye size={16} /> Show answer <span className="kbd hide-mobile">Space</span></button>
      </div>
    </div>
  )
}

/**
 * The answering part of any question type. Calls onSubmit(outcome) once:
 * outcome.correct is true/false, or null for a self-graded recall card.
 * After submitting, pass the same outcome back with answered=true to show the graded state.
 */
export default function AnswerArea({ question, item, answered, outcome, onSubmit, keys = true, autoFocus = true, allowGiveUp = true }) {
  const order = item?.order || (question.choices || question.pairs || question.items || []).map((_, i) => i)
  const common = { question, order, answered, outcome, onSubmit, keys }
  if (isChoiceType(question.type)) return <ChoiceAnswer {...common} />
  if (question.type === 'multi') return <MultiAnswer {...common} />
  if (question.type === 'order') return <OrderAnswer {...common} />
  if (question.type === 'match') return <MatchAnswer {...common} />
  if (question.type === 'recall') return <RecallAnswer {...common} />
  return <TextAnswer {...common} autoFocus={autoFocus} allowGiveUp={allowGiveUp} />
}
