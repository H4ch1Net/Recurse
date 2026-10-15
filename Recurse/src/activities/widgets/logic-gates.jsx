import { useMemo, useRef, useState } from 'react'
import { Check, Shuffle } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { GATES, XOR_OPTIONS, builtXor, circuitTable, evalGate, expression, gradeTable, normalizeGates, truthTable, xorCircuit } from '../lib/logic-gates'
import './logic-gates.css'

// Gate symbols drawn in a 60 x 40 box. Inputs enter on the left at y = 10 and 30 (or 20 for
// NOT), the output leaves on the right at y = 20.
const OR_BODY = 'M0,0 Q14,20 0,40 Q32,40 50,20 Q32,0 0,0 Z'
const SHAPES = {
  AND: { d: 'M0,0 H30 A20,20 0 0 1 30,40 H0 Z', inX: 0, outX: 50 },
  OR: { d: OR_BODY, inX: 5, outX: 50 },
  XOR: { d: 'M6,0 Q20,20 6,40 Q38,40 56,20 Q38,0 6,0 Z', back: 'M0,0 Q14,20 0,40', inX: 5, outX: 56 },
  NOT: { d: 'M4,2 L42,20 L4,38 Z', bubble: 47, inX: 4, outX: 52 },
  NAND: { d: 'M0,0 H30 A20,20 0 0 1 30,40 H0 Z', bubble: 55, inX: 0, outX: 60 },
  NOR: { d: OR_BODY, bubble: 55, inX: 5, outX: 60 }
}

function GateShape({ type, x, y, scale = 1, lit, label }) {
  const s = SHAPES[type]
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className={`gates-gate${lit ? ' lit' : ''}`}>
      <path d={s.d} vectorEffect="non-scaling-stroke" />
      {s.back && <path d={s.back} className="gates-back" vectorEffect="non-scaling-stroke" />}
      {s.bubble && <circle cx={s.bubble} cy="20" r="5" vectorEffect="non-scaling-stroke" />}
      {label && <text x="24" y="24" className="gates-gate-label">{label}</text>}
    </g>
  )
}

function Switch({ x, y, name, value, onToggle }) {
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle()
    }
  }
  return (
    <g
      className={`gates-switch${value ? ' on' : ''}`}
      transform={`translate(${x} ${y})`}
      role="switch"
      tabIndex={0}
      aria-checked={Boolean(value)}
      aria-label={`Input ${name}, currently ${value}`}
      onClick={onToggle}
      onKeyDown={onKey}
    >
      <rect className="gates-hit" x="-20" y="-23" width="90" height="46" />
      <rect className="gates-focus" x="-4" y="-19" width="72" height="38" rx="19" />
      <rect className="gates-track" x="0" y="-15" width="64" height="30" rx="15" />
      <circle className="gates-knob" cx={value ? 49 : 15} cy="0" r="11" />
      <text className="gates-switch-text" x={value ? 20 : 44} y="5">{value}</text>
      <text className="gates-switch-name" x="-8" y="5">{name}</text>
    </g>
  )
}

const Wire = ({ d, on }) => (
  <g className={`gates-wire${on ? ' on' : ''}`}>
    <path d={d} className="gates-wire-base" />
    {on ? <path d={d} className="gates-wire-flow" /> : null}
  </g>
)

function Lamp({ x, y, on, r = 20 }) {
  return (
    <g className={`gates-lamp${on ? ' on' : ''}`} transform={`translate(${x} ${y})`}>
      {on && <circle className="gates-glow" r={r + 9} />}
      <circle r={r} />
      <text y="5">{on ? 1 : 0}</text>
    </g>
  )
}

function pickTarget(props, gates, avoid) {
  const wanted = String(props.target || '').toUpperCase()
  if (!avoid && GATES[wanted]) return wanted
  const pool = gates.filter((g) => g !== avoid)
  return pool[Math.floor(Math.random() * pool.length)] || gates[0]
}

/** Toggle inputs through logic gates, fill in a truth table, and build XOR from simpler gates. */
export default function LogicGates({ props, onComplete, standalone }) {
  const gates = useMemo(() => normalizeGates(props.gates), [props.gates])
  const [tab, setTab] = useState('explore')
  const [gate, setGate] = useState(() => (GATES[String(props.target || '').toUpperCase()] ? String(props.target).toUpperCase() : gates[0]))
  const [a, setA] = useState(0)
  const [b, setB] = useState(1)
  const [target, setTarget] = useState(() => pickTarget(props, gates))
  const [answers, setAnswers] = useState(() => truthTable(target).map(() => null))
  const [graded, setGraded] = useState(null)
  const [solved, setSolved] = useState({})
  const [tries, setTries] = useState(0)
  const [combo, setCombo] = useState(0)
  const [xa, setXa] = useState(1)
  const [xb, setXb] = useState(0)
  const [missing, setMissing] = useState(null)
  const [xorDone, setXorDone] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const quizRef = useRef(null)
  const xorRef = useRef(null)

  const one = GATES[gate].inputs === 1
  const out = evalGate(gate, a, b)
  const rows = truthTable(gate)
  const quizRows = truthTable(target)
  const targetOne = GATES[target].inputs === 1

  const toggle = (setter) => () => {
    sfx.tap()
    setter((v) => 1 - v)
  }

  const chooseTab = (name) => {
    if (name === tab) return
    sfx.tap()
    setTab(name)
    setMessage({ text: '', tone: '' })
  }

  const chooseGate = (name) => {
    sfx.pop()
    setGate(name)
  }

  // ---- Truth table quiz -----------------------------------------------------------

  const setAnswer = (k, value) => {
    sfx.tap()
    setAnswers((list) => list.map((v, i) => (i === k ? value : v)))
    setGraded(null)
  }

  const cycle = (k) => setAnswer(k, answers[k] === null ? 0 : 1 - answers[k])

  const onCellKey = (k) => (e) => {
    if (e.key === '0' || e.key === '1') {
      e.preventDefault()
      setAnswer(k, Number(e.key))
    }
  }

  const check = () => {
    if (answers.some((v) => v === null)) {
      sfx.error()
      setMessage({ text: 'Fill every output first. Tap a cell to cycle it between 0 and 1.', tone: 'bad' })
      return
    }
    const result = gradeTable(target, answers)
    setGraded(result.correct)
    const attempt = tries + 1
    setTries(attempt)
    if (result.allRight) {
      const next = combo + 1
      setCombo(next)
      feedbackCorrect(quizRef.current, { combo: next })
      setSolved((s) => ({ ...s, [target]: true }))
      setMessage({ text: `All ${quizRows.length} rows right. ${GATES[target].rule}`, tone: 'good' })
      onComplete({ score: attempt === 1 ? 1 : 0.7, detail: `${target} truth table` })
      return
    }
    setCombo(0)
    feedbackWrong(quizRef.current)
    const rowsWord = result.wrong === 1 ? '1 row needs' : `${result.wrong} rows need`
    setMessage({
      text: attempt === 1 ? `${rowsWord} another look. Try those inputs on the Explore tab if you are unsure.` : `${rowsWord} another look. Remember: ${GATES[target].rule}`,
      tone: 'bad'
    })
  }

  const nextGate = () => {
    sfx.flip()
    const name = pickTarget(props, gates, target)
    setTarget(name)
    setAnswers(truthTable(name).map(() => null))
    setGraded(null)
    setTries(0)
    setMessage({ text: '', tone: '' })
  }

  // ---- Build XOR --------------------------------------------------------------------

  const wires = xorCircuit(missing, xa, xb)
  const table = missing ? circuitTable(missing) : null

  const chooseMissing = (name) => {
    sfx.pop()
    setMissing(name)
    if (builtXor(name)) {
      setXorDone(true)
      feedbackCorrect(xorRef.current, { combo: 3 })
      setMessage({ text: 'That is XOR: (A OR B) AND NOT (A AND B). In words: at least one input is on, but not both.', tone: 'good' })
    } else {
      feedbackWrong(xorRef.current)
      const bad = circuitTable(name).filter((r) => !r.match).map((r) => `${r.a}${r.b}`)
      setMessage({ text: `With ${name} the output is wrong for input${bad.length > 1 ? 's' : ''} ${bad.join(' and ')}. XOR must be 1 only when the inputs differ.`, tone: 'bad' })
    }
  }

  // Explorer geometry (viewBox 0 0 340 150).
  const shape = SHAPES[gate]
  const G = { x: 150, y: 51, s: 1.2 }
  const inA = one ? 75 : 63
  const inB = 87
  const outX = G.x + shape.outX * G.s
  const inX = G.x + shape.inX * G.s

  // XOR circuit geometry (viewBox 0 0 430 210).
  const slot = missing ? SHAPES[missing] : null
  const slotIn = 310 + (slot ? slot.inX : 0)
  const slotOut = 310 + (slot ? slot.outX : 60)

  return (
    <div className="gates">
      <div className="w-toolbar">
        <div className="w-pill-group gates-tabs" role="group" aria-label="Part">
          <button type="button" aria-pressed={tab === 'explore'} onClick={() => chooseTab('explore')}>1. Explore</button>
          <button type="button" aria-pressed={tab === 'quiz'} onClick={() => chooseTab('quiz')}>2. Truth table{solved[target] ? ' ✓' : ''}</button>
          <button type="button" aria-pressed={tab === 'xor'} onClick={() => chooseTab('xor')}>3. Build XOR{xorDone ? ' ✓' : ''}</button>
        </div>
      </div>

      {tab === 'explore' && (
        <div className="gates-panel">
          <div className="w-pill-group gates-picker" role="group" aria-label="Gate">
            {gates.map((name) => (
              <button key={name} type="button" aria-pressed={name === gate} onClick={() => chooseGate(name)}>{name}</button>
            ))}
          </div>
          <div className="w-stage grid-bg gates-stage">
            <div className="gates-explore">
              <svg className="gates-svg" viewBox="0 0 340 150" role="group" aria-label={`${gate} gate`}>
                <Switch x={22} y={one ? 75 : 45} name="A" value={a} onToggle={toggle(setA)} />
                {!one && <Switch x={22} y={105} name="B" value={b} onToggle={toggle(setB)} />}
                <Wire d={`M86 ${one ? 75 : 45} H118 V${inA} H${inX}`} on={a} />
                {!one && <Wire d={`M86 105 H118 V${inB} H${inX}`} on={b} />}
                <Wire d={`M${outX} 75 H264`} on={out} />
                <GateShape type={gate} x={G.x} y={G.y} scale={G.s} lit={out} />
                <text className="gates-name" x={G.x + 30 * G.s} y={G.y - 8}>{gate}</text>
                <Lamp x={288} y={75} on={out} />
              </svg>
              <table className="gates-table" aria-label={`${gate} truth table`}>
                <thead>
                  <tr><th scope="col">A</th>{!one && <th scope="col">B</th>}<th scope="col">Out</th></tr>
                </thead>
                <tbody>
                  {rows.map((row, k) => {
                    const now = row.a === a && (one || row.b === b)
                    return (
                      <tr key={k} className={now ? 'now' : ''}>
                        <td>{row.a}</td>
                        {!one && <td>{row.b}</td>}
                        <td className={row.out ? 'hi' : ''}>{row.out}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="gates-caption" aria-live="polite">
            <strong className="mono">{one ? expression(gate, a) : expression(gate, a, b)}</strong> {GATES[gate].rule}
          </p>
          <p className="xsmall subtle">Flip the switches (or focus one and press Space). The highlighted row of the table is the one you are testing.</p>
        </div>
      )}

      {tab === 'quiz' && (
        <div className="gates-panel">
          <div className="gates-quiz-head">
            <span className="small">Fill the output column for</span>
            <span className="gates-target">{target}</span>
            <svg className="gates-mini" viewBox="-4 -4 70 48" aria-hidden="true"><GateShape type={target} x={0} y={0} /></svg>
            <span className="grow" />
            {combo >= 2 && <span className="chip accent">{combo} in a row</span>}
          </div>
          <div className="w-stage gates-quiz-stage" ref={quizRef}>
            <table className="gates-table gates-quiz">
              <thead>
                <tr><th scope="col">A</th>{!targetOne && <th scope="col">B</th>}<th scope="col">{target}</th><th scope="col"><span className="sr-only">Result</span></th></tr>
              </thead>
              <tbody>
                {quizRows.map((row, k) => {
                  const mark = graded ? (graded[k] ? 'right' : 'wrong') : ''
                  const label = targetOne ? `A = ${row.a}` : `A = ${row.a}, B = ${row.b}`
                  return (
                    <tr key={k} className={mark}>
                      <td>{row.a}</td>
                      {!targetOne && <td>{row.b}</td>}
                      <td>
                        <button
                          type="button"
                          className={`gates-bit${answers[k] === null ? ' empty' : answers[k] ? ' one' : ' zero'}`}
                          onClick={() => cycle(k)}
                          onKeyDown={onCellKey(k)}
                          aria-label={`Output for ${label}: ${answers[k] === null ? 'not set' : answers[k]}. Press 0 or 1, or click to change.`}
                        >
                          {answers[k] === null ? '?' : answers[k]}
                        </button>
                      </td>
                      <td className="gates-mark" aria-label={mark ? (mark === 'right' ? 'correct' : 'wrong') : undefined}>{mark === 'right' ? '✓' : mark === 'wrong' ? '✗' : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="row wrap gates-actions">
            <button type="button" className="btn btn-primary" onClick={check}><Check size={16} /> Check</button>
            {(solved[target] || standalone) && gates.length > 1 && (
              <button type="button" className="btn btn-ghost" onClick={nextGate}><Shuffle size={15} /> Another gate</button>
            )}
          </div>
        </div>
      )}

      {tab === 'xor' && (
        <div className="gates-panel">
          <p className="small gates-xor-intro">XOR is not a basic building block. You can make it from AND, OR and NOT. One gate is missing: pick the one that makes this circuit act like XOR.</p>
          <div className="w-stage grid-bg gates-stage" ref={xorRef}>
            <svg className="gates-svg gates-xor-svg" viewBox="0 0 430 210" role="group" aria-label="XOR circuit with a missing gate">
              <Wire d="M86 35 H155" on={xa} />
              <Wire d="M100 35 V145 H150" on={xa} />
              <Wire d="M86 175 H120" on={xb} />
              <Wire d="M120 175 V55 H155" on={xb} />
              <Wire d="M120 175 V165 H150" on={xb} />
              <circle className={`gates-dot${xa ? ' on' : ''}`} cx="100" cy="35" r="3.5" />
              <circle className={`gates-dot${xb ? ' on' : ''}`} cx="120" cy="175" r="3.5" />
              <Wire d={`M200 45 H262 V90 H${slotIn}`} on={wires.or} />
              <Wire d="M200 155 H229" on={wires.and} />
              <Wire d={`M277 155 H290 V110 H${slotIn}`} on={wires.not} />
              <Wire d={`M${slotOut} 100 H384`} on={wires.out === 1} />
              <GateShape type="OR" x={150} y={25} lit={wires.or} />
              <GateShape type="AND" x={150} y={135} lit={wires.and} />
              <GateShape type="NOT" x={225} y={135} lit={wires.not} />
              <text className="gates-name" x="175" y="17">OR</text>
              <text className="gates-name" x="175" y="129">AND</text>
              <text className="gates-name" x="250" y="129">NOT</text>
              <text className={`gates-bitlabel${wires.or ? ' on' : ''}`} x="232" y="40">{wires.or}</text>
              <text className={`gates-bitlabel${wires.and ? ' on' : ''}`} x="214" y="150">{wires.and}</text>
              <text className={`gates-bitlabel${wires.not ? ' on' : ''}`} x="296" y="140">{wires.not}</text>
              {missing ? (
                <g key={missing} className="gates-drop">
                  <GateShape type={missing} x={310} y={80} lit={wires.out === 1} />
                  <text className="gates-name" x="335" y="72">{missing}</text>
                </g>
              ) : (
                <g className="gates-slot">
                  <rect x="310" y="80" width="60" height="40" rx="6" />
                  <text x="340" y="106">?</text>
                </g>
              )}
              <Switch x={22} y={35} name="A" value={xa} onToggle={toggle(setXa)} />
              <Switch x={22} y={175} name="B" value={xb} onToggle={toggle(setXb)} />
              <Lamp x={404} y={100} on={wires.out === 1} r={16} />
            </svg>
          </div>
          <div className="row wrap gates-options" role="group" aria-label="Missing gate">
            {XOR_OPTIONS.map((name) => (
              <button key={name} type="button" className={`btn btn-sm${missing === name ? (builtXor(name) ? ' right' : ' wrong') : ''}`} aria-pressed={missing === name} onClick={() => chooseMissing(name)}>
                <svg viewBox="-2 -2 66 44" width="28" height="20" aria-hidden="true"><GateShape type={name} x={0} y={0} /></svg>
                {name}
              </button>
            ))}
          </div>
          {table && (
            <table className="gates-table gates-compare">
              <thead>
                <tr><th scope="col">A</th><th scope="col">B</th><th scope="col">Circuit</th><th scope="col">XOR</th><th scope="col"><span className="sr-only">Match</span></th></tr>
              </thead>
              <tbody>
                {table.map((row, k) => (
                  <tr key={k} className={`${row.match ? 'right' : 'wrong'}${row.a === xa && row.b === xb ? ' now' : ''}`}>
                    <td>{row.a}</td>
                    <td>{row.b}</td>
                    <td>{row.out}</td>
                    <td>{row.want}</td>
                    <td className="gates-mark">{row.match ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="w-legend">
        <span><i className="gates-key on" />Wire carrying 1</span>
        <span><i className="gates-key off" />Wire carrying 0</span>
        <span><i className="gates-key lamp" />Output lamp lit (1)</span>
      </div>

      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
    </div>
  )
}
