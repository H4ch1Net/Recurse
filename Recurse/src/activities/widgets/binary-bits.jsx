import { useMemo, useRef, useState } from 'react'
import { Check, Shuffle } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import './binary-bits.css'

const clampBits = (n) => ([4, 8, 16].includes(Number(n)) ? Number(n) : 8)

function randomTarget(bits, previous) {
  const max = 2 ** bits - 1
  let n = previous
  while (n === previous) n = 1 + Math.floor(Math.random() * max)
  return n
}

const toHex = (n, bits) => n.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0')

/** Flip bits to hit target numbers; shows place values, decimal and hex as you go. */
export default function BinaryBits({ props, onComplete }) {
  const bits = clampBits(props.bits)
  const rounds = Math.max(1, Math.min(10, Number(props.rounds) || 5))
  const [value, setValue] = useState(0)
  const [target, setTarget] = useState(() => randomTarget(bits, -1))
  const [solved, setSolved] = useState(0)
  const [combo, setCombo] = useState(0)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const stageRef = useRef(null)
  const places = useMemo(() => Array.from({ length: bits }, (_, i) => bits - 1 - i), [bits])

  const flip = (place) => {
    sfx.tap()
    setValue((v) => v ^ (1 << place))
    setMessage({ text: '', tone: '' })
  }

  const check = () => {
    if (value === target) {
      const next = solved + 1
      setSolved(next)
      setCombo((c) => c + 1)
      feedbackCorrect(stageRef.current, { combo })
      setMessage({ text: `${target} is ${value.toString(2).padStart(bits, '0')} in binary and 0x${toHex(target, bits)} in hex.`, tone: 'good' })
      if (next >= rounds) onComplete({ score: 1 })
      else {
        setTarget(randomTarget(bits, target))
        setValue(0)
      }
    } else {
      setCombo(0)
      feedbackWrong(stageRef.current)
      const diff = target - value
      setMessage({ text: `That is ${value}. You are ${Math.abs(diff)} ${diff > 0 ? 'short' : 'over'}. Start from the biggest place value that fits.`, tone: 'bad' })
    }
  }

  return (
    <div className="bits">
      <div className="w-toolbar">
        <span className="small">Build <strong className="bits-target">{target}</strong> in binary</span>
        <span className="grow" />
        <span className="chip outline tabular">{Math.min(solved, rounds)} / {rounds}</span>
        {combo >= 2 && <span className="chip accent">{combo} in a row</span>}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setTarget(randomTarget(bits, target)); setValue(0) }}>
          <Shuffle size={14} /> New number
        </button>
      </div>
      <div className="w-stage bits-stage" ref={stageRef}>
        <div className="bits-row" style={{ '--cols': bits }}>
          {places.map((place) => {
            const on = Boolean(value & (1 << place))
            return (
              <button
                key={place}
                type="button"
                className={`bit${on ? ' on' : ''}`}
                onClick={() => flip(place)}
                aria-pressed={on}
                aria-label={`Bit worth ${2 ** place}, ${on ? 'on' : 'off'}`}
              >
                <span className="bit-digit">{on ? 1 : 0}</span>
                <span className="bit-place">{2 ** place}</span>
              </button>
            )
          })}
        </div>
        <div className="w-readout">
          <div className="w-stat"><span>Decimal</span><strong>{value}</strong></div>
          <div className="w-stat"><span>Hex</span><strong>0x{toHex(value, bits)}</strong></div>
          <div className="w-stat"><span>Sum</span><strong className="bits-sum">{places.filter((p) => value & (1 << p)).map((p) => 2 ** p).join(' + ') || '0'}</strong></div>
        </div>
      </div>
      <div className="row wrap" style={{ marginTop: 'var(--s-3)' }}>
        <button type="button" className="btn btn-primary" onClick={check}><Check size={16} /> Check</button>
        <button type="button" className="btn btn-ghost" onClick={() => setValue(0)}>Clear bits</button>
      </div>
      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
    </div>
  )
}
