import { useEffect, useId, useRef, useState } from 'react'
import { Lock, Play } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import {
  ENOUGH,
  MAX_FLIPS,
  RUN_SIZES,
  bandProb,
  birthdayExact,
  birthdaySim,
  birthdayThreshold,
  dayLabel,
  diceDistribution,
  diceModes,
  emptyCoinRun,
  extendCoinRun,
  pairCount,
  rollDice
} from '../lib/probability-sim'
import { useWidth } from '../lib/use-width'
import './probability-sim.css'

const EXPERIMENTS = { coin: 'Coin flips', dice: 'Two dice', birthday: 'Birthday problem' }
const W = 480
const H = 220
const M = { l: 40, r: 12, t: 12, b: 26 }
const PW = W - M.l - M.r
const PH = H - M.t - M.b
const DESKTOP = { W, H, M, PW, PH, phone: false }

/** Chart size: the desktop drawing, or on a phone the stage's real width so 12px labels stay 12px. */
function useChartGeo(stageRef) {
  const width = useWidth(stageRef)
  if (width === null || width >= 480) return DESKTOP
  const w = Math.max(240, width)
  const h = 230
  const m = { l: 42, r: 16, t: 12, b: 28 }
  return { W: w, H: h, M: m, PW: w - m.l - m.r, PH: h - m.t - m.b, phone: true }
}
const num = (n) => Math.round(n).toLocaleString('en-US')
const pct = (p, digits = 1) => `${(p * 100).toFixed(digits)}%`
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Animates a counter from one value to another with an ease-out curve, then calls done. */
function useCountUp() {
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  return (from, to, set, done) => {
    cancelAnimationFrame(raf.current)
    if (reducedMotion() || to - from <= 1) {
      set(to)
      done?.()
      return
    }
    const duration = Math.min(1000, 280 + Math.log10(to - from + 1) * 170)
    const start = performance.now()
    const frame = () => {
      const k = Math.min(1, (performance.now() - start) / duration)
      set(Math.round(from + (to - from) * (1 - (1 - k) ** 3)))
      if (k < 1) raf.current = requestAnimationFrame(frame)
      else done?.()
    }
    raf.current = requestAnimationFrame(frame)
  }
}

function RunButtons({ onRun, locked, noun, total, remaining = Infinity }) {
  return (
    <div className="probsim-run">
      <span className="small"><Play size={13} /> Run</span>
      {RUN_SIZES.map((n) => (
        <button key={n} type="button" className="btn btn-sm" onClick={() => onRun(n)} disabled={!locked || n > remaining} aria-label={`Run ${num(n)} ${noun}`}>
          {num(n)}
        </button>
      ))}
      <span className="probsim-run-note xsmall subtle">{locked ? `${num(total)} ${noun} so far` : 'Make a prediction first'}</span>
    </div>
  )
}

function Progress({ total, revealed }) {
  const share = Math.min(1, total / ENOUGH)
  return (
    <div className={`probsim-progress${revealed ? ' done' : ''}`}>
      <span className="xsmall">{revealed ? 'Prediction checked' : `${num(Math.min(total, ENOUGH))} of ${num(ENOUGH)} trials to check your prediction`}</span>
      <span className="probsim-progress-bar"><span style={{ width: `${share * 100}%` }} /></span>
    </div>
  )
}

function Message({ message }) {
  return <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
}

// ---- Coin flips -------------------------------------------------------------------------

function CoinSim({ onComplete, standalone }) {
  const [p, setP] = useState(0.5)
  const [prediction, setPrediction] = useState(null)
  const [run, setRun] = useState(emptyCoinRun)
  const [shown, setShown] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const stageRef = useRef(null)
  const { W, H, M, PW, PH, phone } = useChartGeo(stageRef)
  const countUp = useCountUp()

  const reveal = (right, total) => {
    setRevealed(true)
    const b10 = bandProb(10, p)
    const b1000 = bandProb(1000, p)
    const facts = `10 flips land within 5 points of ${pct(p, 0)} only ${pct(b10)} of the time; 1,000 flips do it ${pct(b1000)} of the time.`
    if (right) {
      feedbackCorrect(stageRef.current, { combo: 2 })
      setMessage({ text: `Right. ${facts} The line swings wildly at first, then settles into the band. That is the law of large numbers.`, tone: 'good' })
    } else {
      feedbackWrong(stageRef.current)
      setMessage({ text: `Not quite: the long run wins. ${facts} Short runs are noisy; long runs settle near the true chance.`, tone: 'bad' })
    }
    onComplete({ score: right ? 1 : 0.6, detail: `${num(total)} flips` })
  }

  const doRun = (n) => {
    if (!prediction) return
    const next = extendCoinRun(run, n, Math.random, p)
    setRun(next)
    if (n <= 10) sfx.flip()
    else sfx.pop()
    countUp(run.flips, next.flips, setShown, () => {
      if (!revealed && next.flips >= ENOUGH) reveal(prediction === '1000', next.flips)
    })
  }

  const changeBias = (value) => {
    sfx.tick()
    setP(value)
    setRun(emptyCoinRun())
    setShown(0)
    setPrediction(null)
    setRevealed(false)
    setMessage({ text: '', tone: '' })
  }

  const visible = run.points.filter((pt) => pt.n <= shown)
  const lastPt = visible[visible.length - 1]
  const flips = lastPt ? lastPt.n : 0
  const heads = lastPt ? lastPt.heads : 0
  const xExp = Math.max(1, Math.ceil(Math.log10(Math.max(10, flips))))
  const px = (n) => M.l + (Math.log10(n) / xExp) * PW
  const py = (share) => M.t + (1 - share) * PH
  const path = visible.map((pt, k) => `${k ? 'L' : 'M'}${px(pt.n).toFixed(1)} ${py(pt.heads / pt.n).toFixed(1)}`).join(' ')
  const done = shown === run.flips

  const options = [
    ['10', '10 flips'],
    ['1000', '1,000 flips'],
    ['same', 'Equally likely']
  ]

  return (
    <div className="probsim-panel">
      {standalone && (
        <label className="w-slider">
          <span>Chance of heads: <strong className="tabular">{pct(p, 0)}</strong></span>
          <input type="range" min="0.1" max="0.9" step="0.05" value={p} onChange={(e) => changeBias(Number(e.target.value))} />
        </label>
      )}
      <div className={`probsim-predict${prediction ? ' made' : ''}`}>
        <span className="small"><strong>Predict:</strong> which run is more likely to finish within 5 points of {pct(p, 0)} heads?</span>
        <div className="row wrap probsim-choices" role="group" aria-label="Your prediction">
          {options.map(([key, label]) => (
            <button key={key} type="button" className="btn btn-sm" aria-pressed={prediction === key} disabled={run.flips > 0 && prediction !== key} onClick={() => { sfx.pop(); setPrediction(key) }}>{label}</button>
          ))}
        </div>
      </div>

      <RunButtons onRun={doRun} locked={Boolean(prediction)} noun="flips" total={run.flips} remaining={MAX_FLIPS - run.flips} />

      <div className="w-stage probsim-stage" ref={stageRef}>
        <svg className={`probsim-svg${phone ? ' phone' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Running share of heads: ${flips ? pct(heads / flips) : 'no flips yet'} after ${num(flips)} flips`}>
          <rect className="probsim-band" x={M.l} width={PW} y={py(Math.min(1, p + 0.05))} height={py(Math.max(0, p - 0.05)) - py(Math.min(1, p + 0.05))} />
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line className="probsim-grid" x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} />
              <text className="probsim-tick y" x={M.l - 6} y={py(v) + 4}>{pct(v, 0)}</text>
            </g>
          ))}
          {Array.from({ length: xExp + 1 }, (_, e) => (
            <g key={e}>
              <line className="probsim-grid" x1={px(10 ** e)} x2={px(10 ** e)} y1={M.t} y2={H - M.b} />
              <text className="probsim-tick" x={px(10 ** e)} y={H - 8}>{phone && e >= 3 ? `${10 ** (e - 3)}k` : num(10 ** e)}</text>
            </g>
          ))}
          <line className="probsim-truth" x1={M.l} x2={W - M.r} y1={py(p)} y2={py(p)} />
          <path className="probsim-line" d={path} />
          {lastPt && <circle className="probsim-dot" cx={px(lastPt.n)} cy={py(lastPt.heads / lastPt.n)} r="4" />}
        </svg>
        <div className="probsim-coins" aria-label="Most recent flips">
          {done && run.recent.map((f) => (
            <span key={f.id} className={`probsim-coin ${f.h ? 'heads' : 'tails'}`} title={f.h ? 'Heads' : 'Tails'}>{f.h ? 'H' : 'T'}</span>
          ))}
        </div>
      </div>

      <div className="w-readout">
        <div className="w-stat"><span>Flips</span><strong>{num(flips)}</strong></div>
        <div className="w-stat"><span>Heads</span><strong>{num(heads)}</strong></div>
        <div className="w-stat"><span>Share of heads</span><strong>{flips ? pct(heads / flips) : '?'}</strong></div>
        <div className="w-stat"><span>Gap from {pct(p, 0)}</span><strong>{flips ? `${((heads / flips - p) * 100).toFixed(1)} pts` : '?'}</strong></div>
      </div>
      <div className="w-legend">
        <span><i className="probsim-key line" />Running share of heads</span>
        <span><i className="probsim-key band" />Within 5 points of {pct(p, 0)}</span>
        <span><i className="probsim-key truth" />True chance</span>
      </div>
      <p className="probsim-caption">The x axis grows by powers of ten, so the first few flips get as much room as the last thousands. Early on, one flip moves the share a lot; later, each flip barely nudges it.</p>
      <Progress total={run.flips} revealed={revealed} />
      <Message message={message} />
    </div>
  )
}

// ---- Dice -----------------------------------------------------------------------------------

const PIPS = {
  1: [[20, 20]],
  2: [[11, 11], [29, 29]],
  3: [[11, 11], [20, 20], [29, 29]],
  4: [[11, 11], [29, 11], [11, 29], [29, 29]],
  5: [[11, 11], [29, 11], [20, 20], [11, 29], [29, 29]],
  6: [[11, 11], [29, 11], [11, 20], [29, 20], [11, 29], [29, 29]]
}

function Die({ face }) {
  return (
    <svg className="probsim-die" viewBox="0 0 40 40" role="img" aria-label={`Die showing ${face}`}>
      <rect x="1.5" y="1.5" width="37" height="37" rx="8" />
      {PIPS[face].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="3.6" />)}
    </svg>
  )
}

function niceMax(v) {
  for (const step of [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1]) if (v <= step) return step
  return 1
}

function DiceSim({ onComplete, standalone }) {
  const [count, setCount] = useState(2)
  const [prediction, setPrediction] = useState(null)
  const [counts, setCounts] = useState(() => new Array(13).fill(0))
  const [rolls, setRolls] = useState(0)
  const [shown, setShown] = useState(0)
  const [last, setLast] = useState([])
  const [revealed, setRevealed] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const stageRef = useRef(null)
  const { W, H, M, PW, PH, phone } = useChartGeo(stageRef)
  const countUp = useCountUp()

  const dist = diceDistribution(count)
  const lo = count
  const hi = 6 * count
  const sums = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
  const combos = 6 ** count
  const ways = (s) => Math.round(dist[s] * combos)

  const reveal = (total) => {
    setRevealed(true)
    const modes = diceModes(count)
    const right = modes.includes(prediction)
    const modeText = modes.join(' and ')
    const why = count === 2 ? 'Six of the 36 combinations add to 7 (1+6, 2+5, 3+4, 4+3, 5+2, 6+1), but only one makes 2 or 12.' : `${ways(modes[0])} of the ${combos} combinations make ${modeText}, more than any other sum.`
    if (right) {
      feedbackCorrect(stageRef.current, { combo: 2 })
      setMessage({ text: `Yes, ${modeText} is the most common. ${why}`, tone: 'good' })
    } else {
      feedbackWrong(stageRef.current)
      setMessage({ text: `The most common sum is ${modeText}, not ${prediction}. ${why} ${prediction} has ${ways(prediction)} way${ways(prediction) === 1 ? '' : 's'}.`, tone: 'bad' })
    }
    onComplete({ score: right ? 1 : 0.6, detail: `${num(total)} rolls` })
  }

  const doRun = (n) => {
    if (!prediction) return
    const res = rollDice(n, count)
    const next = counts.map((c, s) => c + (res.counts[s] || 0))
    const total = rolls + n
    setCounts(next)
    setRolls(total)
    setLast(res.last)
    if (n <= 10) sfx.flip()
    else sfx.pop()
    countUp(rolls, total, setShown, () => {
      if (!revealed && total >= ENOUGH) reveal(total)
    })
  }

  const changeCount = (value) => {
    if (value === count) return
    sfx.tap()
    setCount(value)
    setCounts(new Array(6 * value + 1).fill(0))
    setRolls(0)
    setShown(0)
    setLast([])
    setPrediction(null)
    setRevealed(false)
    setMessage({ text: '', tone: '' })
  }

  const observedMax = rolls ? Math.max(...counts.map((c) => c / rolls)) : 0
  const yMax = niceMax(Math.max(observedMax, Math.max(...dist) * 1.25))
  const slot = PW / sums.length
  const bx = (s) => M.l + (s - lo) * slot
  const py = (share) => M.t + (1 - share / yMax) * PH
  const theory = sums.map((s, k) => `${k ? 'L' : 'M'}${(bx(s) + slot / 2).toFixed(1)} ${py(dist[s]).toFixed(1)}`).join(' ')
  const yTicks = [0, yMax / 2, yMax]
  const leader = rolls ? sums.reduce((best, s) => (counts[s] > counts[best] ? s : best), sums[0]) : null

  return (
    <div className="probsim-panel">
      {standalone && (
        <div className="w-pill-group" role="group" aria-label="Number of dice">
          {[2, 3].map((n) => <button key={n} type="button" aria-pressed={count === n} onClick={() => changeCount(n)}>{n} dice</button>)}
        </div>
      )}
      <div className={`probsim-predict${prediction ? ' made' : ''}`}>
        <span className="small"><strong>Predict:</strong> roll {count} dice and add them up. Which sum comes up most often?</span>
        <div className="probsim-sums" role="group" aria-label="Your prediction">
          {sums.map((s) => (
            <button key={s} type="button" className="btn btn-sm" aria-pressed={prediction === s} disabled={rolls > 0 && prediction !== s} onClick={() => { sfx.pop(); setPrediction(s) }}>{s}</button>
          ))}
        </div>
      </div>

      <RunButtons onRun={doRun} locked={prediction !== null} noun="rolls" total={rolls} />

      <div className="w-stage probsim-stage" ref={stageRef}>
        {last.length > 0 && (
          <div className="probsim-dice" key={rolls} aria-live="polite">
            {last.map((face, k) => <Die key={k} face={face} />)}
            <span className="probsim-dice-sum">= {last.reduce((a, b) => a + b, 0)}</span>
          </div>
        )}
        <svg className={`probsim-svg${phone ? ' phone' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Share of rolls for each sum after ${num(rolls)} rolls${leader ? `. Most common so far: ${leader}` : ''}`}>
          {yTicks.map((v) => (
            <g key={v}>
              <line className="probsim-grid" x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} />
              <text className="probsim-tick y" x={M.l - 6} y={py(v) + 4}>{pct(v, 0)}</text>
            </g>
          ))}
          {sums.map((s) => {
            const share = rolls ? counts[s] / rolls : 0
            return (
              <g key={s}>
                <rect
                  className={`probsim-bar${prediction === s ? ' picked' : ''}${s === leader ? ' leader' : ''}`}
                  x={bx(s) + slot * 0.12}
                  width={slot * 0.76}
                  y={M.t}
                  height={PH}
                  style={{ transform: `scaleY(${Math.min(1, share / yMax)})` }}
                >
                  <title>{`Sum ${s}: ${num(counts[s])} rolls (${pct(share)})`}</title>
                </rect>
                {(!phone || slot >= 20 || s % 2 === 0) && <text className="probsim-tick" x={bx(s) + slot / 2} y={H - 8}>{s}</text>}
              </g>
            )
          })}
          {revealed && (
            <g className="probsim-theory">
              <path d={theory} />
              {sums.map((s) => <circle key={s} cx={bx(s) + slot / 2} cy={py(dist[s])} r="3.2" />)}
            </g>
          )}
        </svg>
      </div>

      <div className="w-readout">
        <div className="w-stat"><span>Rolls</span><strong>{num(shown)}</strong></div>
        <div className="w-stat"><span>Most common so far</span><strong>{leader ?? '?'}</strong></div>
        {prediction !== null && <div className="w-stat"><span>Your pick ({prediction})</span><strong>{rolls ? pct(counts[prediction] / rolls) : '?'}</strong></div>}
        {revealed && <div className="w-stat"><span>Exact chance of {prediction}</span><strong>{ways(prediction)} / {combos}</strong></div>}
      </div>
      <div className="w-legend">
        <span><i className="probsim-key bar" />Share of rolls</span>
        <span><i className="probsim-key picked" />Your prediction</span>
        {revealed && <span><i className="probsim-key theory" />Exact chances</span>}
      </div>
      <p className="probsim-caption">Each bar is the share of rolls that landed on that sum. With a handful of rolls the shape is lumpy; with thousands it settles into the true shape.</p>
      <Progress total={rolls} revealed={revealed} />
      <Message message={message} />
    </div>
  )
}

// ---- Birthday problem -------------------------------------------------------------------------

function BirthdaySimPanel({ onComplete, standalone }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const maxK = standalone ? 100 : 80
  const [guess, setGuess] = useState(40)
  const [locked, setLocked] = useState(false)
  const [k, setK] = useState(10)
  const [sims, setSims] = useState({})
  const [rooms, setRooms] = useState(0)
  const [shown, setShown] = useState(0)
  const [lastRoom, setLastRoom] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const stageRef = useRef(null)
  const { W, H, M, PW, PH, phone } = useChartGeo(stageRef)
  const countUp = useCountUp()
  const answer = birthdayThreshold(0.5)

  const reveal = (total) => {
    setRevealed(true)
    const right = Math.abs(guess - answer) <= 3
    const why = `With ${answer} people there are ${pairCount(answer)} different pairs, and every pair is a fresh chance to match. The chance passes 50% at ${answer} people (${pct(birthdayExact(answer))}).`
    if (right) {
      feedbackCorrect(stageRef.current, { combo: 2 })
      setMessage({ text: `Great guess. ${why}`, tone: 'good' })
    } else {
      feedbackWrong(stageRef.current)
      const tip = guess > answer ? 'Most people guess too high: they picture someone matching their own birthday, not any pair matching.' : 'Below that size a match is still less likely than not.'
      setMessage({ text: `You guessed ${guess}. ${why} ${tip}`, tone: 'bad' })
    }
    onComplete({ score: right ? 1 : 0.6, detail: `${num(total)} rooms simulated` })
  }

  const doRun = (n) => {
    if (!locked) return
    const res = birthdaySim(k, n)
    const prev = sims[k] || { shared: 0, trials: 0 }
    setSims({ ...sims, [k]: { shared: prev.shared + res.shared, trials: prev.trials + res.trials } })
    const total = rooms + n
    setRooms(total)
    setLastRoom({ ...res.lastRoom, k })
    if (n <= 10) sfx.flip()
    else sfx.pop()
    countUp(rooms, total, setShown, () => {
      if (!revealed && total >= ENOUGH) reveal(total)
    })
  }

  const lockIn = () => {
    sfx.pop()
    setLocked(true)
    setMessage({ text: `Locked in: ${guess} people. Now simulate rooms of different sizes and watch where the chance crosses 50%.`, tone: '' })
  }

  const px = (people) => M.l + ((people - 1) / (maxK - 1)) * PW
  const py = (share) => M.t + (1 - share) * PH
  const exactPath = Array.from({ length: maxK }, (_, i) => `${i ? 'L' : 'M'}${px(i + 1).toFixed(1)} ${py(birthdayExact(i + 1)).toFixed(1)}`).join(' ')
  const current = sims[k]
  const xTicks = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].filter((v) => v <= maxK)

  // Room strip: one dot per person on a 365-day line, shared days ringed.
  const roomDots = []
  if (lastRoom) {
    const stack = {}
    lastRoom.days.forEach((day, i) => {
      const level = stack[day] || 0
      stack[day] = level + 1
      roomDots.push({ i, day, level })
    })
    roomDots.forEach((d) => {
      d.shared = stack[d.day] > 1
    })
  }
  const sharedDays = [...new Set(roomDots.filter((d) => d.shared).map((d) => d.day))]

  return (
    <div className="probsim-panel">
      <div className={`probsim-predict${locked ? ' made' : ''}`}>
        <span className="small"><strong>Predict:</strong> how many people need to be in a room before it is more likely than not that two share a birthday?</span>
        <div className="row wrap probsim-guess">
          <label className="w-slider">
            <span className="sr-only">Your guess</span>
            <input type="range" min="2" max={maxK} value={guess} disabled={locked} onChange={(e) => { sfx.tick(); setGuess(Number(e.target.value)) }} aria-valuetext={`${guess} people`} />
          </label>
          <strong className="probsim-guess-value tabular">{guess} people</strong>
          <button type="button" className="btn btn-sm btn-primary" onClick={lockIn} disabled={locked}><Lock size={14} /> {locked ? 'Locked' : 'Lock in'}</button>
        </div>
      </div>

      <label className="w-slider probsim-k">
        <span>People in each room: <strong className="tabular">{k}</strong></span>
        <input type="range" min="2" max={maxK} value={k} onChange={(e) => { sfx.tick(); setK(Number(e.target.value)) }} />
      </label>
      <RunButtons onRun={doRun} locked={locked} noun="rooms" total={rooms} />

      <div className="w-stage probsim-stage" ref={stageRef}>
        <svg className={`probsim-svg${phone ? ' phone' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance of a shared birthday by room size.${current ? ` Simulated for ${k} people: ${pct(current.shared / current.trials)}.` : ''}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line className={`probsim-grid${v === 0.5 ? ' half' : ''}`} x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} />
              <text className="probsim-tick y" x={M.l - 6} y={py(v) + 4}>{pct(v, 0)}</text>
            </g>
          ))}
          {xTicks.map((v) => <text key={v} className="probsim-tick" x={px(v)} y={H - 8}>{v}</text>)}
          <line className="probsim-current" x1={px(k)} x2={px(k)} y1={M.t} y2={H - M.b} />
          {locked && <line className="probsim-guessline" x1={px(guess)} x2={px(guess)} y1={M.t} y2={H - M.b} />}
          {revealed && (
            <g className="probsim-exact">
              <path d={exactPath} pathLength="1" />
              <circle cx={px(answer)} cy={py(birthdayExact(answer))} r="5" />
              <text x={px(answer) + 8} y={py(birthdayExact(answer)) + 16}>{answer} people</text>
            </g>
          )}
          {Object.entries(sims).map(([people, s]) => (
            <circle
              key={people}
              className={`probsim-sim${Number(people) === k ? ' now' : ''}`}
              cx={px(Number(people))}
              cy={py(s.shared / s.trials)}
              r={Math.min(7, 2.5 + Math.log10(s.trials))}
            >
              <title>{`${people} people: ${pct(s.shared / s.trials)} of ${num(s.trials)} rooms`}</title>
            </circle>
          ))}
        </svg>

        {lastRoom && (
          <div className="probsim-room">
            <svg viewBox="0 0 480 46" className={`probsim-room-svg${phone ? ' phone' : ''}`} aria-hidden="true">
              <defs>
                <clipPath id={`${uid}-strip`}><rect x="0" y="0" width="480" height="46" /></clipPath>
              </defs>
              <line className="probsim-grid" x1="4" x2="476" y1="34" y2="34" />
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((mo, i) => (
                // On a phone the strip is too narrow for twelve names: every other month.
                (!phone || i % 2 === 0) && <text key={mo} className="probsim-tick" x={4 + ((i * 30.4 + 15) / 365) * 472} y="45">{mo}</text>
              ))}
              <g clipPath={`url(#${uid}-strip)`}>
                {roomDots.map((d) => (
                  <circle key={d.i} className={`probsim-person${d.shared ? ' shared' : ''}`} cx={4 + (d.day / 365) * 472} cy={30 - d.level * 7} r={d.shared ? 4 : 3} />
                ))}
              </g>
            </svg>
            <p className="xsmall">
              Last room of {lastRoom.k}: {sharedDays.length ? `people share ${sharedDays.slice(0, 3).map(dayLabel).join(', ')}${sharedDays.length > 3 ? ' and more' : ''}.` : 'no one shares a birthday.'}
            </p>
          </div>
        )}
      </div>

      <div className="w-readout">
        <div className="w-stat"><span>People</span><strong>{k}</strong></div>
        <div className="w-stat"><span>Pairs to compare</span><strong>{num(pairCount(k))}</strong></div>
        <div className="w-stat"><span>Simulated</span><strong>{current ? pct(current.shared / current.trials) : '?'}</strong></div>
        <div className="w-stat"><span>Exact</span><strong>{revealed ? pct(birthdayExact(k)) : '?'}</strong></div>
        <div className="w-stat"><span>Rooms so far</span><strong>{num(shown)}</strong></div>
      </div>
      <div className="w-legend">
        <span><i className="probsim-key sim" />Simulated chance (bigger dot, more rooms)</span>
        <span><i className="probsim-key current" />Room size you are testing</span>
        {locked && <span><i className="probsim-key guess" />Your guess</span>}
        {revealed && <span><i className="probsim-key exact" />Exact formula</span>}
      </div>
      <p className="probsim-caption">Exact chance: 1 minus the chance that everyone has a different birthday, which is 365/365 × 364/365 × 363/365 × ... for each person added.</p>
      <Progress total={rooms} revealed={revealed} />
      <Message message={message} />
    </div>
  )
}

const PANELS = { coin: CoinSim, dice: DiceSim, birthday: BirthdaySimPanel }

/** Predict, then run thousands of trials and watch frequencies converge on the exact answer. */
export default function ProbabilitySim({ props, onComplete, standalone }) {
  const initial = EXPERIMENTS[props.experiment] ? props.experiment : 'coin'
  const [experiment, setExperiment] = useState(initial)
  const [opened, setOpened] = useState({ [initial]: true })
  const showPicker = standalone || !EXPERIMENTS[props.experiment]

  const choose = (name) => {
    if (name === experiment) return
    sfx.tap()
    setExperiment(name)
    setOpened((o) => ({ ...o, [name]: true }))
  }

  return (
    <div className="probsim">
      {showPicker && (
        <div className="w-toolbar">
          <div className="w-pill-group probsim-tabs" role="group" aria-label="Experiment">
            {Object.entries(EXPERIMENTS).map(([name, label]) => (
              <button key={name} type="button" aria-pressed={experiment === name} onClick={() => choose(name)}>{label}</button>
            ))}
          </div>
        </div>
      )}
      {Object.keys(EXPERIMENTS).map((name) => {
        if (!opened[name]) return null
        const Panel = PANELS[name]
        return (
          <div key={name} hidden={name !== experiment}>
            <Panel onComplete={onComplete} standalone={standalone} />
          </div>
        )
      })}
    </div>
  )
}
