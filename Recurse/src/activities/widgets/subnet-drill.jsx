import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Calculator, Check, Eye, Flame, ListChecks, Timer } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong, floatText } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { binaryOctets, interestingOctetIndex, intToIp, magicSteps, prefixToMask, subnetFacts, toDottedBinary } from '../lib/net'
import { CALC_TASKS, answerKey, generateQuestion, gradeQuestion, normalizeDifficulty, parseCalcInput } from '../lib/subnet-drill'
import './subnet-drill.css'

const GOAL = 5
const fmt = (n) => Number(n).toLocaleString('en-US')

/** The 32 bits of address, mask, network and broadcast, split at the prefix. */
function BinaryBreakdown({ address, prefix }) {
  const f = subnetFacts(address, prefix)
  const focus = prefix % 8 === 0 || prefix === 32 ? -1 : interestingOctetIndex(prefix)
  const rows = [
    { label: 'Address', value: address },
    { label: 'Mask', value: f.maskInt },
    { label: 'Network', value: f.networkInt, note: 'host bits all 0' },
    { label: 'Broadcast', value: f.broadcastInt, note: 'host bits all 1' }
  ]
  return (
    <div className="subnet-bin">
      <div className="subnet-bin-grid" role="table" aria-label={`Binary breakdown with a /${prefix} prefix`}>
        {rows.map((row) => (
          <div className="subnet-bin-row" role="row" key={row.label}>
            <div className="subnet-bin-label" role="rowheader">
              <strong>{row.label}</strong>
              <span className="mono">{intToIp(row.value)}</span>
            </div>
            <div className="subnet-bin-bits mono" role="cell" aria-label={toDottedBinary(row.value)}>
              {binaryOctets(row.value).map((octet, o) => (
                <span key={o} className={`subnet-oct${o === focus ? ' focus' : ''}`}>
                  {octet.split('').map((bit, i) => {
                    const index = o * 8 + i
                    return (
                      <span key={i} className={`subnet-bit ${index < prefix ? 'net' : 'host'}${index === prefix ? ' edge' : ''}`} style={{ transitionDelay: `${index * 7}ms` }}>
                        {bit}
                      </span>
                    )
                  })}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="w-legend">
        <span><i className="subnet-key net" />Network bits: the first {prefix}</span>
        <span><i className="subnet-key host" />Host bits: the last {32 - prefix}</span>
        {focus >= 0 && <span><i className="subnet-key focus" />Interesting octet</span>}
      </div>
    </div>
  )
}

function MagicSteps({ address, prefix }) {
  const m = magicSteps(address, prefix)
  return (
    <ol className="subnet-steps" key={`${address}/${prefix}`}>
      {m.steps.map((step, i) => (
        <li key={i} style={{ animationDelay: `${i * 70}ms` }}>
          {step}
        </li>
      ))}
    </ol>
  )
}

// ---- Calculator ----------------------------------------------------------------------

function Calc({ onComplete }) {
  const [addressText, setAddressText] = useState('192.168.1.77')
  const [prefixText, setPrefixText] = useState('/26')
  const [current, setCurrent] = useState({ address: 3232235853, prefix: 26 })
  const [error, setError] = useState(null)
  const [done, setDone] = useState(() => new Set())
  const taskRefs = useRef({})

  const apply = (addr, pre) => {
    const parsed = parseCalcInput(addr, pre)
    if (!parsed.ok) {
      setError(parsed)
      return
    }
    setError(null)
    setCurrent({ address: parsed.address, prefix: parsed.prefix })
    const hits = CALC_TASKS.filter((t) => t.test(parsed.prefix) && !done.has(t.id))
    if (hits.length) {
      const next = new Set(done)
      hits.forEach((t) => next.add(t.id))
      setDone(next)
      hits.forEach((t) => feedbackSuccess(taskRefs.current[t.id]))
      if (next.size === CALC_TASKS.length) onComplete({ score: 1, detail: 'Explored three kinds of prefix' })
    }
  }

  const f = subnetFacts(current.address, current.prefix)
  const facts = [
    ['Network', f.network],
    ['Broadcast', f.special === 'p2p' ? 'none (point-to-point)' : f.special === 'host' ? 'none (host route)' : f.broadcast],
    ['First host', f.firstHost],
    ['Last host', f.lastHost],
    ['Usable hosts', fmt(f.usableHosts)],
    ['Total addresses', fmt(f.totalAddresses)],
    ['Mask', `${f.mask} (/${f.prefix})`],
    ['Wildcard', f.wildcard]
  ]

  return (
    <div className="subnet-calc">
      <div className="subnet-calc-inputs">
        <label className="subnet-field">
          <span>IP address</span>
          <input
            className={`input mono${error?.field === 'address' ? ' is-wrong' : ''}`}
            value={addressText}
            inputMode="decimal"
            autoComplete="off"
            spellCheck="false"
            onChange={(e) => {
              setAddressText(e.target.value)
              apply(e.target.value, prefixText)
            }}
          />
        </label>
        <label className="subnet-field">
          <span>Prefix or mask</span>
          <input
            className={`input mono${error?.field === 'prefix' ? ' is-wrong' : ''}`}
            value={prefixText}
            autoComplete="off"
            spellCheck="false"
            onChange={(e) => {
              setPrefixText(e.target.value)
              apply(addressText, e.target.value)
            }}
          />
        </label>
        <label className="w-slider subnet-slider">
          <span>/{current.prefix}</span>
          <input
            type="range"
            min="1"
            max="32"
            value={current.prefix}
            aria-label="Prefix length"
            onChange={(e) => {
              const text = `/${e.target.value}`
              sfx.tick()
              setPrefixText(text)
              const addr = addressText.split('/')[0].trim().split(/\s+/)[0]
              setAddressText(addr)
              apply(addr, text)
            }}
          />
        </label>
      </div>
      <p className={`w-feedback ${error ? 'bad' : ''}`} aria-live="polite">
        {error ? error.error : `${f.address}/${f.prefix} lives in ${f.network}/${f.prefix}.`}
      </p>

      <div className="w-stage subnet-calc-stage">
        <dl className="subnet-facts">
          {facts.map(([label, value]) => (
            <div key={label} className="subnet-fact">
              <dt>{label}</dt>
              <dd className="mono" key={value}>{value}</dd>
            </div>
          ))}
        </dl>
        <h4 className="subnet-h">In binary</h4>
        <BinaryBreakdown address={current.address} prefix={current.prefix} />
        <h4 className="subnet-h">The magic number method</h4>
        <MagicSteps address={current.address} prefix={current.prefix} />
      </div>

      <ul className="w-tasks">
        {CALC_TASKS.map((t) => (
          <li key={t.id} ref={(el) => { taskRefs.current[t.id] = el }} className={`w-task${done.has(t.id) ? ' done' : ''}`}>
            <span className="w-task-mark">{done.has(t.id) && <Check size={13} />}</span>
            <span>{t.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Drill ------------------------------------------------------------------------------

function Drill({ initialDifficulty, onComplete }) {
  const [difficulty, setDifficulty] = useState(initialDifficulty)
  const [question, setQuestion] = useState(() => generateQuestion(initialDifficulty))
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const [timerOn, setTimerOn] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [times, setTimes] = useState([])
  const cardRef = useRef(null)
  const streakRef = useRef(null)
  const firstInput = useRef(null)
  const nextBtn = useRef(null)

  useEffect(() => {
    if (!timerOn || result) return undefined
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [timerOn, result, question.id])

  const newQuestion = (level = difficulty) => {
    setQuestion(generateQuestion(level))
    setAnswers({})
    setResult(null)
    setSeconds(0)
    setMessage({ text: '', tone: '' })
    requestAnimationFrame(() => firstInput.current?.focus())
  }

  const changeDifficulty = (level) => {
    sfx.tap()
    setDifficulty(level)
    newQuestion(level)
  }

  const check = (event) => {
    event.preventDefault()
    if (result) {
      newQuestion()
      return
    }
    const graded = gradeQuestion(question, answers)
    setResult({ ...graded, revealed: false })
    setAttempts((a) => a + 1)
    if (timerOn) setTimes((t) => [...t, seconds])
    if (graded.allCorrect) {
      const s = streak + 1
      const c = correct + 1
      setStreak(s)
      setBest((b) => Math.max(b, s))
      setCorrect(c)
      feedbackCorrect(cardRef.current, { combo: streak })
      if (s >= 2) floatText(streakRef.current, `${s} in a row`, { tone: 'good' })
      const pace = timerOn ? ` in ${seconds} s` : ''
      setMessage({ text: `All ${graded.total} right${pace}. ${c >= GOAL ? 'Goal reached, keep the streak going if you like.' : `${GOAL - c} more to go.`}`, tone: 'good' })
      if (c === GOAL) onComplete({ score: Math.min(1, GOAL / (attempts + 1)), detail: `${GOAL} subnets correct` })
    } else {
      setStreak(0)
      feedbackWrong(cardRef.current)
      setMessage({ text: `${graded.correct} of ${graded.total} right. The worked solution below shows each step.`, tone: 'bad' })
    }
    requestAnimationFrame(() => nextBtn.current?.focus())
  }

  const reveal = () => {
    sfx.flip()
    const graded = gradeQuestion(question, answerKey(question))
    setAnswers(answerKey(question))
    setResult({ ...graded, revealed: true })
    setAttempts((a) => a + 1)
    setStreak(0)
    setMessage({ text: 'Here is the answer. Read the steps, then try a fresh one.', tone: '' })
    requestAnimationFrame(() => nextBtn.current?.focus())
  }

  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null

  return (
    <div className="subnet-drill">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="Difficulty">
          {['easy', 'medium', 'hard'].map((level) => (
            <button key={level} type="button" aria-pressed={difficulty === level} onClick={() => changeDifficulty(level)}>
              {level[0].toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className={`btn btn-sm ${timerOn ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={timerOn} onClick={() => { sfx.tap(); setTimerOn((t) => !t) }}>
          <Timer size={14} /> {timerOn ? `${seconds} s` : 'Timer'}
        </button>
        <span className="grow" />
        <span className="chip outline tabular" title="Correct answers toward the goal">{Math.min(correct, GOAL)} / {GOAL}</span>
        <span ref={streakRef} className={`chip ${streak >= 2 ? 'accent' : 'outline'} subnet-streak${streak >= 3 ? ' hot' : ''}`} aria-label={`Streak ${streak}`}>
          <Flame size={12} /> {streak}
        </span>
      </div>

      <form className="w-stage subnet-card" ref={cardRef} onSubmit={check} key={question.id}>
        <div className="row wrap" style={{ gap: 'var(--s-2)' }}>
          <span className="chip accent">{question.title}</span>
          {question.given.address != null && (
            <span className="subnet-given mono">
              {intToIp(question.given.address)} {question.given.showMask ? prefixToMask(question.given.prefix) : `/${question.given.prefix}`}
            </span>
          )}
        </div>
        <p className="subnet-prompt">{question.prompt}</p>
        <div className="subnet-fields">
          {question.fields.map((field, i) => {
            const r = result?.fields.find((x) => x.key === field.key)
            const state = r ? (result.revealed ? 'revealed' : r.ok ? 'ok' : 'bad') : ''
            return (
              <label key={field.key} className={`subnet-field ${state}`}>
                <span>{field.label}</span>
                <input
                  ref={i === 0 ? firstInput : undefined}
                  className={`input mono${state === 'ok' ? ' is-correct' : state === 'bad' ? ' is-wrong' : ''}`}
                  value={answers[field.key] || ''}
                  readOnly={Boolean(result)}
                  inputMode={field.type === 'number' ? 'numeric' : 'decimal'}
                  autoComplete="off"
                  spellCheck="false"
                  aria-invalid={state === 'bad' || undefined}
                  placeholder={field.type === 'cidr' ? 'a.b.c.d/nn' : field.type === 'number' ? '0' : field.type === 'prefix' ? '/nn' : 'a.b.c.d'}
                  onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.value }))}
                />
                {state === 'bad' && (
                  <span className="subnet-expected">
                    Answer: <strong className="mono">{r.expected}</strong>
                    {r.hint && <span className="subnet-hint">{r.hint}</span>}
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <div className="row wrap" style={{ marginTop: 'var(--s-3)', gap: 'var(--s-2)' }}>
          {result ? (
            <button ref={nextBtn} type="submit" className="btn btn-primary">
              Next question <ArrowRight size={16} />
            </button>
          ) : (
            <>
              <button type="submit" className="btn btn-primary"><Check size={16} /> Check</button>
              <button type="button" className="btn btn-ghost" onClick={reveal}><Eye size={15} /> Show answer</button>
            </>
          )}
        </div>
      </form>

      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>

      {result && (
        <div className="subnet-solution">
          <h4 className="subnet-h"><ListChecks size={15} /> Worked solution</h4>
          <ol className="subnet-steps">
            {question.solution.map((step, i) => (
              <li key={i} style={{ animationDelay: `${i * 80}ms` }}>{step}</li>
            ))}
          </ol>
          {question.binary && <BinaryBreakdown address={question.binary.address} prefix={question.binary.prefix} />}
        </div>
      )}

      {(attempts > 0 || best > 0) && (
        <div className="w-readout">
          <div className="w-stat"><span>Answered</span><strong>{attempts}</strong></div>
          <div className="w-stat"><span>Fully right</span><strong>{correct}</strong></div>
          <div className="w-stat"><span>Best streak</span><strong>{best}</strong></div>
          {avg !== null && <div className="w-stat"><span>Average time</span><strong>{avg} s</strong></div>}
        </div>
      )}
    </div>
  )
}

/** Subnet calculator with a binary breakdown, plus a typed-answer drill at three levels. */
export default function SubnetDrill({ props, onComplete }) {
  const [mode, setMode] = useState(props.mode === 'calc' ? 'calc' : 'drill')
  const difficulty = normalizeDifficulty(props.difficulty)
  return (
    <div className="subnet">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'drill'} onClick={() => { sfx.tap(); setMode('drill') }}>
            <Flame size={12} /> Drill
          </button>
          <button type="button" aria-pressed={mode === 'calc'} onClick={() => { sfx.tap(); setMode('calc') }}>
            <Calculator size={12} /> Calculator
          </button>
        </div>
      </div>
      {/* Both stay mounted so switching tabs keeps the streak and the calculator input. */}
      <div hidden={mode !== 'drill'}>
        <Drill initialDifficulty={difficulty} onComplete={onComplete} />
      </div>
      <div hidden={mode !== 'calc'}>
        <Calc onComplete={onComplete} />
      </div>
    </div>
  )
}
