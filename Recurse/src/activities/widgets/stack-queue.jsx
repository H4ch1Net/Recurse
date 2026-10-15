import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeftFromLine, ArrowRightToLine, ArrowUpFromLine, Check, Eye, Play, RotateCcw } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { BRACKET_PUZZLES, bracketStep, servedInOrder, startBrackets } from '../lib/stack-queue'
import './stack-queue.css'

const CUSTOMERS = ['A', 'B', 'C']

const TASKS = {
  lifo: { mode: 'stack', text: 'Push three values, then pop one.', hint: 'Watch which value comes out. The last one in is the first one out.' },
  brackets: { mode: 'stack', text: 'Check whether ( [ { } ] ) is balanced, bracket by bracket.', hint: 'Push each opener. For each closer, pop and check that it matches.' },
  customers: { mode: 'queue', text: 'Customers A, B and C arrive in that order. Enqueue them, then serve them in arrival order.', hint: 'Leave the box empty and press Enqueue to add the next customer.' }
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** A quick glow on the item a peek looks at. */
function pulse(el) {
  if (!el?.animate || reducedMotion()) return
  el.animate(
    [{ transform: 'scale(1)', boxShadow: '0 0 0 0 var(--accent)' }, { transform: 'scale(1.12)', boxShadow: '0 0 0 5px var(--accent-soft)' }, { transform: 'scale(1)', boxShadow: '0 0 0 0 var(--accent-soft)' }],
    { duration: 520, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' }
  )
}

function pickMode(mode) {
  return ['stack', 'queue', 'both'].includes(mode) ? mode : 'both'
}

/** Push, pop, enqueue and dequeue with animation, plus bracket matching and a fair checkout line. */
export default function StackQueue({ props, onComplete, standalone }) {
  const mode = pickMode(props.mode)
  const showStack = mode !== 'queue'
  const showQueue = mode !== 'stack'
  const stackCap = standalone ? 9 : 7
  const queueCap = standalone ? 8 : 6
  const activeTasks = Object.keys(TASKS).filter((k) => mode === 'both' || TASKS[k].mode === mode)

  const [stack, setStack] = useState([])
  const [queue, setQueue] = useState([])
  const [stackInput, setStackInput] = useState('')
  const [queueInput, setQueueInput] = useState('')
  const [popped, setPopped] = useState(null)
  const [served, setServed] = useState([])
  const [lastServed, setLastServed] = useState(null)
  const [stackMsg, setStackMsg] = useState({ text: 'Push a value onto the stack. Leave the box empty to push the next number.', tone: '' })
  const [queueMsg, setQueueMsg] = useState({ text: 'Enqueue adds at the back. Dequeue removes from the front.', tone: '' })
  const [nextNum, setNextNum] = useState(1)
  const [walk, setWalk] = useState(null)
  const [puzzle, setPuzzle] = useState(0)
  const [combo, setCombo] = useState(0)
  const [done, setDone] = useState({})
  const ids = useRef(1)
  const stackRef = useRef(null)
  const queueRef = useRef(null)
  const queueTrack = useRef(null)
  const flip = useRef(null)
  const charRefs = useRef([])

  // Slide the remaining queue items forward after a dequeue (FLIP animation).
  useLayoutEffect(() => {
    const before = flip.current
    flip.current = null
    if (!before || !queueTrack.current) return
    for (const el of queueTrack.current.querySelectorAll('[data-id]')) {
      const old = before.get(el.dataset.id)
      if (!old || !el.animate) continue
      const dx = old - el.getBoundingClientRect().left
      if (Math.abs(dx) > 1) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' })
    }
  }, [queue])

  const finishTask = (key, el) => {
    if (done[key]) return
    const next = { ...done, [key]: true }
    setDone(next)
    feedbackSuccess(el, 'Task done')
    if (activeTasks.every((k) => next[k])) onComplete({ score: 1 })
  }

  // ---- Stack ----
  const push = () => {
    if (stack.length >= stackCap) {
      feedbackWrong(stackRef.current)
      setStackMsg({ text: `Stack overflow: this stack holds ${stackCap} items. Real call stacks have limits too, which is what a "stack overflow" error means.`, tone: 'bad' })
      return
    }
    const typed = stackInput.trim().slice(0, 4)
    const value = typed || String(nextNum)
    if (!typed) setNextNum(nextNum + 1)
    sfx.pop()
    setStack([...stack, { id: ids.current++, v: value }])
    setStackInput('')
    setStackMsg({ text: `Push ${value} onto the top. Size is now ${stack.length + 1}. Pushing is O(1): nothing else moves.`, tone: '' })
  }

  const pop = () => {
    if (!stack.length) {
      feedbackWrong(stackRef.current)
      setStackMsg({ text: 'Stack underflow: there is nothing to pop.', tone: 'bad' })
      return
    }
    const top = stack[stack.length - 1]
    sfx.flip()
    setStack(stack.slice(0, -1))
    setPopped(top)
    const lifo = stack.length >= 3
    setStackMsg({ text: lifo ? `Pop returns ${top.v}, the last value you pushed. Last in, first out.` : `Pop removes and returns the top value, ${top.v}.`, tone: lifo ? 'good' : '' })
    if (lifo) finishTask('lifo', stackRef.current)
  }

  const peekStack = () => {
    if (!stack.length) return setStackMsg({ text: 'The stack is empty, so there is nothing to peek at.', tone: '' })
    sfx.tick()
    const top = stack[stack.length - 1]
    pulse(stackRef.current?.querySelector('.sq-item.top'))
    setStackMsg({ text: `Peek shows the top value, ${top.v}, without removing it.`, tone: '' })
  }

  // ---- Bracket walkthrough ----
  const startWalk = (index = puzzle) => {
    sfx.flip()
    setPuzzle(index)
    setWalk(startBrackets(BRACKET_PUZZLES[index]))
    setStack([])
    setCombo(0)
    setStackMsg({ text: 'Read the brackets left to right. For each one, choose Push or Pop and match.', tone: '' })
  }

  const exitWalk = () => {
    setWalk(null)
    setStack([])
    setStackMsg({ text: 'Back to free play.', tone: '' })
  }

  const choose = (action) => {
    const r = bracketStep(walk, action)
    const el = charRefs.current[walk.pos]
    if (!r.ok) {
      setCombo(0)
      feedbackWrong(el)
      setStackMsg({ text: r.message, tone: 'bad' })
      return
    }
    const nextCombo = combo + 1
    setCombo(nextCombo)
    setWalk(r.state)
    const ch = walk.chars[walk.pos]
    if (r.outcome === 'pushed') setStack([...stack, { id: ids.current++, v: ch }])
    else {
      const top = stack[stack.length - 1]
      setStack(stack.slice(0, -1))
      if (top) setPopped(top)
    }
    if (r.state.status === 'balanced') {
      feedbackCorrect(el, { combo: nextCombo })
      setStackMsg({ text: `${r.message} Balanced! ${r.state.reason}`, tone: 'good' })
      if (puzzle === 0) finishTask('brackets', stackRef.current)
    } else if (r.state.status === 'unbalanced') {
      feedbackCorrect(el, { combo: nextCombo })
      setStackMsg({ text: `${r.message} Not balanced: ${r.state.reason} You caught it.`, tone: 'warn' })
    } else {
      feedbackCorrect(el, { combo: nextCombo })
      setStackMsg({ text: r.message, tone: '' })
    }
  }

  // ---- Queue ----
  const nextCustomer = () => CUSTOMERS.find((c) => !queue.some((q) => q.v === c) && !served.includes(c))
  const enqueue = () => {
    if (queue.length >= queueCap) {
      feedbackWrong(queueRef.current)
      setQueueMsg({ text: `The line is full (${queueCap} people). Serve someone first.`, tone: 'bad' })
      return
    }
    const auto = !done.customers && activeTasks.includes('customers') ? nextCustomer() : null
    const typed = queueInput.trim().slice(0, 4)
    const value = typed || auto || String(nextNum)
    if (!typed && !auto) setNextNum(nextNum + 1)
    sfx.pop()
    setQueue([...queue, { id: ids.current++, v: value }])
    setQueueInput('')
    setQueueMsg({ text: `Enqueue ${value} at the back of the line. ${queue.length ? `${queue[0].v} is still at the front.` : 'It is also the front, since the line was empty.'}`, tone: '' })
  }

  const dequeue = () => {
    if (!queue.length) {
      feedbackWrong(queueRef.current)
      setQueueMsg({ text: 'The queue is empty: nobody to serve.', tone: 'bad' })
      return
    }
    const front = queue[0]
    if (queueTrack.current) {
      flip.current = new Map([...queueTrack.current.querySelectorAll('[data-id]')].map((el) => [el.dataset.id, el.getBoundingClientRect().left]))
    }
    sfx.flip()
    const nextServed = [...served, front.v]
    setQueue(queue.slice(1))
    setServed(nextServed)
    setLastServed(front)
    if (activeTasks.includes('customers') && !done.customers && servedInOrder(nextServed, CUSTOMERS)) {
      setQueueMsg({ text: `Served ${front.v}. A, B and C were served in the order they arrived: first in, first out. A stack would have served C first, which is not fair at a checkout.`, tone: 'good' })
      finishTask('customers', queueRef.current)
    } else if (activeTasks.includes('customers') && !done.customers && CUSTOMERS.includes(front.v) && front.v !== 'A' && served[served.length - 1] !== CUSTOMERS[CUSTOMERS.indexOf(front.v) - 1]) {
      setQueueMsg({ text: `Served ${front.v}, but customers should be served in arrival order: A, then B, then C. Enqueue them in that order and try again.`, tone: 'bad' })
    } else {
      setQueueMsg({ text: `Dequeue serves ${front.v} from the front. Everyone else moves up one place.`, tone: '' })
    }
  }

  const peekQueue = () => {
    if (!queue.length) return setQueueMsg({ text: 'The queue is empty, so there is nothing to peek at.', tone: '' })
    sfx.tick()
    pulse(queueTrack.current?.querySelector('.sq-item.front'))
    setQueueMsg({ text: `Peek shows the front, ${queue[0].v}, without serving them.`, tone: '' })
  }

  const resetQueue = () => {
    sfx.tap()
    setQueue([])
    setServed([])
    setLastServed(null)
    setQueueMsg({ text: 'Fresh line. Enqueue adds at the back.', tone: '' })
  }

  const msgClass = (m) => `w-feedback ${m.tone === 'warn' ? 'sq-warn' : m.tone}`
  const current = walk && walk.status === 'running' ? walk.chars[walk.pos] : null

  return (
    <div className="sq">
      <ul className="w-tasks sq-tasks">
        {activeTasks.map((key) => (
          <li key={key} className={`w-task${done[key] ? ' done' : ''}`}>
            <span className="w-task-mark">{done[key] && <Check size={13} />}</span>
            <span className="grow">
              {TASKS[key].text}
              <span className="w-task-hint">{TASKS[key].hint}</span>
            </span>
            {key === 'brackets' && !walk && (
              <button type="button" className="btn btn-sm" onClick={() => startWalk(0)}><Play size={14} /> {done.brackets ? 'Again' : 'Start'}</button>
            )}
          </li>
        ))}
      </ul>

      <div className={`sq-panels${showStack && showQueue ? ' both' : ''}`}>
        {showStack && (
          <section className="sq-panel" ref={stackRef} aria-labelledby="sq-stack-title">
            <header className="sq-panel-head">
              <h4 id="sq-stack-title">Stack</h4>
              <span className="xsmall subtle">Last in, first out</span>
            </header>

            {walk && (
              <div className="sq-walk">
                <div className="sq-chars" aria-label={`Brackets: ${walk.chars.join(' ')}`}>
                  {walk.chars.map((ch, k) => (
                    <span
                      key={k}
                      ref={(el) => { charRefs.current[k] = el }}
                      className={`sq-char${k < walk.pos ? ' past' : ''}${k === walk.pos && walk.status === 'running' ? ' now' : ''}`}
                    >
                      {ch}
                    </span>
                  ))}
                </div>
                {walk.status === 'running' ? (
                  <div className="row wrap sq-walk-actions">
                    <button type="button" className="btn btn-primary" onClick={() => choose('push')}><ArrowDownToLine size={15} /> Push {current}</button>
                    <button type="button" className="btn" onClick={() => choose('pop')}><ArrowUpFromLine size={15} /> Pop and match</button>
                    {combo >= 3 && <span className="chip accent">{combo} in a row</span>}
                  </div>
                ) : (
                  <div className="row wrap sq-walk-actions">
                    <span className={`chip ${walk.status === 'balanced' ? 'good' : 'warn'}`}>{walk.status === 'balanced' ? 'Balanced' : 'Not balanced'}</span>
                    {(standalone || done.brackets) && (
                      <button type="button" className="btn btn-sm" onClick={() => startWalk((puzzle + 1) % BRACKET_PUZZLES.length)}>Try another string</button>
                    )}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={exitWalk}>Free play</button>
                  </div>
                )}
              </div>
            )}

            <div className="sq-stack-area">
              <div className="sq-tube" style={{ '--cap': stackCap }} aria-label={`Stack, ${stack.length} items${stack.length ? `, top is ${stack[stack.length - 1].v}` : ''}`} role="img">
                {popped && <span key={`p${popped.id}`} className="sq-item sq-ghost-up" style={{ bottom: `calc(8px + ${stack.length} * 38px)` }} aria-hidden="true">{popped.v}</span>}
                {stack.map((item, k) => (
                  <span
                    key={item.id}
                    className={`sq-item${k === stack.length - 1 ? ' top' : ''}${walk ? ' bracket' : ''}`}
                  >
                    {item.v}
                    {k === stack.length - 1 && <span className="sq-top-tag">top</span>}
                  </span>
                ))}
                {!stack.length && <span className="sq-empty xsmall">empty</span>}
              </div>
            </div>

            {!walk && (
              <div className="sq-controls">
                <input
                  className="input sq-input"
                  value={stackInput}
                  maxLength={4}
                  placeholder={String(nextNum)}
                  aria-label="Value to push"
                  onChange={(e) => setStackInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') push() }}
                />
                <button type="button" className="btn btn-primary" onClick={push}><ArrowDownToLine size={15} /> Push</button>
                <button type="button" className="btn" onClick={pop}><ArrowUpFromLine size={15} /> Pop</button>
                <button type="button" className="btn btn-ghost" onClick={peekStack}><Eye size={15} /> Peek</button>
              </div>
            )}
            <div className="w-readout">
              <div className="w-stat"><span>Size</span><strong>{stack.length}</strong></div>
              <div className="w-stat"><span>Top</span><strong>{stack.length ? stack[stack.length - 1].v : 'none'}</strong></div>
              {popped && <div className="w-stat"><span>Last popped</span><strong>{popped.v}</strong></div>}
            </div>
            <p className={msgClass(stackMsg)} aria-live="polite">{stackMsg.text}</p>
          </section>
        )}

        {showQueue && (
          <section className="sq-panel" ref={queueRef} aria-labelledby="sq-queue-title">
            <header className="sq-panel-head">
              <h4 id="sq-queue-title">Queue</h4>
              <span className="xsmall subtle">First in, first out</span>
              <span className="grow" />
              <button type="button" className="btn btn-sm btn-ghost" onClick={resetQueue} aria-label="Empty the queue"><RotateCcw size={14} /></button>
            </header>

            <div className="sq-line">
              <div className="sq-ends xsmall" aria-hidden="true"><span>← front (dequeue)</span><span>back (enqueue) ←</span></div>
              <div className="sq-track" ref={queueTrack} role="img" aria-label={`Queue, ${queue.length} items${queue.length ? `, front is ${queue[0].v}` : ''}`}>
                {lastServed && <span key={`s${lastServed.id}`} className="sq-item sq-ghost-left" aria-hidden="true">{lastServed.v}</span>}
                {queue.map((item, k) => (
                  <span key={item.id} data-id={item.id} className={`sq-item q${k === 0 ? ' front' : ''}`}>
                    {item.v}
                  </span>
                ))}
                {!queue.length && <span className="sq-empty xsmall">empty</span>}
              </div>
            </div>

            <div className="sq-controls">
              <input
                className="input sq-input"
                value={queueInput}
                maxLength={4}
                placeholder={(!done.customers && activeTasks.includes('customers') && nextCustomer()) || String(nextNum)}
                aria-label="Value to enqueue"
                onChange={(e) => setQueueInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') enqueue() }}
              />
              <button type="button" className="btn btn-primary" onClick={enqueue}><ArrowLeftFromLine size={15} /> Enqueue</button>
              <button type="button" className="btn" onClick={dequeue}><ArrowRightToLine size={15} className="sq-flip" /> Dequeue</button>
              <button type="button" className="btn btn-ghost" onClick={peekQueue}><Eye size={15} /> Peek</button>
            </div>
            <div className="w-readout">
              <div className="w-stat"><span>Size</span><strong>{queue.length}</strong></div>
              <div className="w-stat"><span>Front</span><strong>{queue.length ? queue[0].v : 'none'}</strong></div>
              <div className="w-stat"><span>Served</span><strong className="sq-served">{served.length ? served.slice(-6).join(', ') : 'nobody yet'}</strong></div>
            </div>
            <p className={msgClass(queueMsg)} aria-live="polite">{queueMsg.text}</p>
          </section>
        )}
      </div>
    </div>
  )
}
