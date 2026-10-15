import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Pause, Play, Shuffle, X } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { shuffle } from '../../lib/random'
import { GROWTH, checkRanking, correctOrder, formatCount, formatDuration, opsAt, perspective, pickClasses, sampleCurve, scientific } from '../lib/big-o'
import './big-o.css'

const STYLE = {
  1: { color: 'var(--ink-3)', dash: '2 5' },
  'log n': { color: 'var(--mem-steady)', dash: '9 4' },
  n: { color: 'var(--good)', dash: '' },
  'n log n': { color: 'var(--accent)', dash: '12 4 3 4' },
  'n^2': { color: 'var(--warn)', dash: '' },
  '2^n': { color: 'var(--bad)', dash: '5 3' },
  'n!': { color: 'var(--ink)', dash: '1 3' }
}

const W = 440
const H = 270
const PAD = { l: 44, r: 70, t: 14, b: 28 }
const PW = W - PAD.l - PAD.r
const PH = H - PAD.t - PAD.b

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function scrambled(keys) {
  if (keys.length < 2) return keys
  let out = shuffle(keys)
  for (let tries = 0; tries < 10 && checkRanking(out, keys).correct; tries++) out = shuffle(keys)
  return out
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

const sup = (k) => scientific(10 ** k, 0).replace(/^1 × /, '')

/** Growth curves racing apart as n grows, an operation-count table, and a ranking game. */
export default function BigO({ props, onComplete, standalone }) {
  const classes = useMemo(() => pickClasses(props.classes), [props.classes])
  const [n, setN] = useState(standalone ? 16 : 10)
  const [logScale, setLogScale] = useState(false)
  const [mix, setMix] = useState(0)
  const [racing, setRacing] = useState(false)
  const [pool, setPool] = useState(() => scrambled(classes))
  const [order, setOrder] = useState([])
  const [marks, setMarks] = useState(null)
  const [solved, setSolved] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const anim = useRef({ id: 0 })
  const clipId = `bigo-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const rankRef = useRef(null)

  useEffect(() => {
    const a = anim.current
    return () => cancelAnimationFrame(a.id)
  }, [])

  const raceTick = useEffectEvent(() => {
    if (n >= 64) setRacing(false)
    else setN(n + 1)
  })
  useEffect(() => {
    if (!racing) return undefined
    const id = setInterval(raceTick, 70)
    return () => clearInterval(id)
  }, [racing])

  const setScale = (toLog) => {
    if (toLog === logScale) return
    sfx.flip()
    setLogScale(toLog)
    cancelAnimationFrame(anim.current.id)
    const from = mix
    const to = toLog ? 1 : 0
    if (reducedMotion()) return setMix(to)
    const t0 = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 480)
      const eased = 1 - (1 - t) ** 3
      setMix(from + (to - from) * eased)
      if (t < 1) anim.current.id = requestAnimationFrame(step)
    }
    anim.current.id = requestAnimationFrame(step)
  }

  const toggleRace = () => {
    sfx.tap()
    if (racing) return setRacing(false)
    if (n >= 64) setN(1)
    setRacing(true)
  }

  // ---- Chart geometry ----
  const chart = useMemo(() => {
    const xMax = Math.max(n, 2)
    const at = classes.map((key) => ({ key, ops: opsAt(key, n) }))
    const poly = at.filter((c) => GROWTH[c.key].rank <= 4)
    let linMax = Math.max(2, ...(poly.length ? poly : at).map((c) => c.ops))
    for (const c of at) if (c.ops <= linMax * 1.6) linMax = Math.max(linMax, c.ops)
    linMax *= 1.08
    const logMax = Math.max(1, Math.log10(Math.max(...at.map((c) => c.ops))) * 1.05)
    const xOf = (v) => PAD.l + ((v - 1) / (xMax - 1)) * PW
    const yOf = (ops) => {
      const lin = PAD.t + PH - (ops / linMax) * PH
      const log = PAD.t + PH - (Math.log10(ops) / logMax) * PH
      return lin * (1 - mix) + log * mix
    }
    const curves = classes.map((key) => {
      const pts = sampleCurve(key, xMax, 90).map(([x, y]) => [xOf(x), yOf(y)])
      const d = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)},${Math.max(-2000, y).toFixed(1)}`).join(' ')
      const endY = yOf(opsAt(key, xMax))
      const off = endY < PAD.t - 1
      const cross = off ? pts.find(([, y]) => y < PAD.t)?.[0] ?? xOf(xMax) : null
      return { key, d, endY, off, cross, dotX: xOf(n), dotY: yOf(opsAt(key, n)) }
    })
    // End labels, nudged apart so they never overlap.
    const labels = curves.map((c) => ({ key: c.key, y: Math.min(PAD.t + PH, Math.max(PAD.t + 4, c.endY)), off: c.off })).sort((a, b) => a.y - b.y)
    for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 13)
    const overflow = labels.length ? labels[labels.length - 1].y - (PAD.t + PH + 4) : 0
    if (overflow > 0) for (const l of labels) l.y -= overflow
    for (let k = labels.length - 2; k >= 0; k--) labels[k].y = Math.min(labels[k].y, labels[k + 1].y - 13)
    // Y ticks for whichever scale is (mostly) showing.
    let yTicks
    if (mix < 0.5) {
      const step = niceStep(linMax / 4)
      yTicks = []
      for (let v = 0; v <= linMax; v += step) yTicks.push({ y: yOf(Math.max(v, 1)), text: v === 0 ? '0' : formatCount(v) })
    } else {
      const top = Math.floor(logMax)
      const every = Math.max(1, Math.ceil(top / 5))
      yTicks = []
      for (let k = 0; k <= top; k += every) yTicks.push({ y: yOf(10 ** k), text: k === 0 ? '1' : k <= 3 ? String(10 ** k) : `10${sup(k)}` })
    }
    const xTicks = [...new Set([1, Math.round(xMax / 4), Math.round(xMax / 2), Math.round((3 * xMax) / 4), xMax])].filter((v) => v >= 1)
    return { curves, labels, yTicks, xTicks: xTicks.map((v) => ({ x: xOf(v), text: v })) }
  }, [classes, n, mix])

  // ---- Ranking game ----
  const place = (key) => {
    if (solved) return
    sfx.pop()
    setPool((p) => p.filter((k) => k !== key))
    setOrder((o) => [...o, key])
    setMarks(null)
    setMessage({ text: '', tone: '' })
  }
  const unplace = (key) => {
    if (solved) return
    sfx.tap()
    setOrder((o) => o.filter((k) => k !== key))
    setPool((p) => [...p, key])
    setMarks(null)
  }
  const move = (index, delta) => {
    if (solved) return
    const j = index + delta
    if (j < 0 || j >= order.length) return
    sfx.tap()
    const next = [...order]
    ;[next[index], next[j]] = [next[j], next[index]]
    setOrder(next)
    setMarks(null)
  }
  const check = () => {
    const result = checkRanking(order, classes)
    setMarks(result.marks)
    setAttempts((a) => a + 1)
    if (result.correct) {
      setSolved(true)
      feedbackCorrect(rankRef.current, { combo: attempts === 0 ? 4 : 1 })
      setMessage({ text: attempts === 0 ? 'Perfect on the first try. Slow growers are what make programs scale.' : 'That is the right order. Slow growers are what make programs scale.', tone: 'good' })
      onComplete({ score: attempts === 0 ? 1 : Math.max(0.5, 1 - attempts * 0.15) })
    } else {
      feedbackWrong(rankRef.current)
      setMessage({ text: `${result.right} of ${classes.length} are in the right place. Hint: slide n to 64, switch to the log scale and read the curves from bottom to top.`, tone: 'bad' })
    }
  }
  const resetRanking = () => {
    sfx.flip()
    setPool(scrambled(classes))
    setOrder([])
    setMarks(null)
    setSolved(false)
    setMessage({ text: '', tone: '' })
  }

  const fastest = correctOrder(classes)[classes.length - 1]
  const fastestOps = opsAt(fastest, n)
  const scale = perspective(fastestOps)
  const maxLog = Math.log10(Math.max(...classes.map((k) => opsAt(k, n)))) || 1

  return (
    <div className="bigo">
      <div className="w-toolbar">
        <label className="w-slider bigo-n">
          <span>n = <strong className="tabular">{n}</strong></span>
          <input type="range" min="1" max="64" value={n} onChange={(e) => { setRacing(false); setN(Number(e.target.value)) }} aria-label="Input size n" />
        </label>
        <button type="button" className="btn btn-sm" onClick={toggleRace}>
          {racing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Race to 64</>}
        </button>
        <span className="grow" />
        <div className="w-pill-group" role="group" aria-label="Y axis scale">
          <button type="button" aria-pressed={!logScale} onClick={() => setScale(false)}>Linear</button>
          <button type="button" aria-pressed={logScale} onClick={() => setScale(true)}>Log scale</button>
        </div>
      </div>

      <div className="w-stage bigo-stage">
        <svg viewBox={`0 0 ${W} ${H}`} className="bigo-chart" role="img" aria-label={`Growth curves up to n = ${n}, ${logScale ? 'log' : 'linear'} scale`}>
          <defs>
            <clipPath id={clipId}><rect x={PAD.l} y={PAD.t - 2} width={PW + 2} height={PH + 4} /></clipPath>
          </defs>
          {chart.yTicks.map((t) => (
            <g key={`y${t.text}`} className="bigo-tick">
              <line x1={PAD.l} x2={PAD.l + PW} y1={t.y} y2={t.y} />
              <text x={PAD.l - 6} y={t.y + 4} textAnchor="end">{t.text}</text>
            </g>
          ))}
          {chart.xTicks.map((t) => (
            <text key={`x${t.text}`} className="bigo-xtick" x={t.x} y={PAD.t + PH + 16} textAnchor="middle">{t.text}</text>
          ))}
          <text className="bigo-axis" x={PAD.l + PW} y={H - 1} textAnchor="end">n</text>
          <text className="bigo-axis" x={4} y={PAD.t + 2} dominantBaseline="hanging">ops</text>
          <line className="bigo-base" x1={PAD.l} x2={PAD.l + PW} y1={PAD.t + PH} y2={PAD.t + PH} />
          <line className="bigo-base" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={PAD.t + PH} />
          <g clipPath={`url(#${clipId})`}>
            {chart.curves.map((c) => (
              <path key={c.key} d={c.d} className="bigo-curve" style={{ stroke: STYLE[c.key].color }} strokeDasharray={STYLE[c.key].dash || undefined} />
            ))}
            {chart.curves.map((c) => !c.off && (
              <circle key={`dot-${c.key}`} cx={c.dotX} cy={c.dotY} r="3.5" className="bigo-dot" style={{ fill: STYLE[c.key].color }} />
            ))}
          </g>
          {chart.curves.filter((c) => c.off).map((c) => (
            <text key={`off-${c.key}`} className="bigo-off" x={Math.min(PAD.l + PW - 4, c.cross + 4)} y={PAD.t + 12} style={{ fill: STYLE[c.key].color }}>↑ off the chart</text>
          ))}
          {chart.labels.map((l) => (
            <text key={`lab-${l.key}`} className="bigo-label" x={PAD.l + PW + 6} y={l.y + 4} style={{ fill: STYLE[l.key].color }}>
              {GROWTH[l.key].label}{l.off ? ' ↑' : ''}
            </text>
          ))}
        </svg>
      </div>

      <div className="w-legend">
        {classes.map((key) => (
          <span key={key}>
            <svg width="22" height="10" aria-hidden="true" className="bigo-swatch"><line x1="1" x2="21" y1="5" y2="5" style={{ stroke: STYLE[key].color }} strokeDasharray={STYLE[key].dash || undefined} /></svg>
            {GROWTH[key].label} {GROWTH[key].name}
          </span>
        ))}
      </div>

      <div className="bigo-table-wrap">
        <table className="bigo-table">
          <caption className="xsmall subtle">At n = {n}, if one operation takes 1 microsecond</caption>
          <thead>
            <tr><th scope="col">Growth</th><th scope="col">Operations</th><th scope="col">Time</th></tr>
          </thead>
          <tbody>
            {correctOrder(classes).map((key) => {
              const ops = opsAt(key, n)
              const width = maxLog ? (Math.log10(ops) / maxLog) * 100 : 0
              const slow = ops >= 1e6
              return (
                <tr key={key} className={slow ? 'slow' : ''}>
                  <th scope="row">
                    <span className="bigo-dotkey" style={{ background: STYLE[key].color }} />
                    <span className="mono">{GROWTH[key].label}</span>
                    <span className="bigo-example">{GROWTH[key].example}</span>
                  </th>
                  <td className="mono tabular">
                    <span className="bigo-mag" style={{ width: `${Math.max(2, width)}%`, background: STYLE[key].color }} />
                    {formatCount(ops)}
                  </td>
                  <td className="mono tabular">{formatDuration(ops)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {scale && (
        <div className="callout warn bigo-scale">
          <span>
            <strong>{GROWTH[fastest].label} at n = {n}</strong> is {formatCount(fastestOps)} operations. At a million operations per second that takes {formatDuration(fastestOps)}: {scale}.
          </span>
        </div>
      )}

      <section className="bigo-rank" ref={rankRef} aria-labelledby="bigo-rank-title">
        <h4 id="bigo-rank-title" className="bigo-rank-title">Rank them: slowest growing first</h4>
        <p className="xsmall subtle">Tap each class in order, from the one that grows slowest to the one that grows fastest. Use the arrows to fix the order.</p>
        {pool.length > 0 && (
          <div className="row wrap bigo-pool" role="group" aria-label="Classes to place">
            {pool.map((key) => (
              <button key={key} type="button" className="btn btn-sm bigo-chip" onClick={() => place(key)}>
                <span className="bigo-dotkey" style={{ background: STYLE[key].color }} />
                {GROWTH[key].label}
              </button>
            ))}
          </div>
        )}
        {order.length > 0 && (
          <ol className="bigo-order">
            {order.map((key, k) => (
              <li key={key} className={marks ? (marks[k] ? 'right' : 'wrong') : ''}>
                <span className="bigo-pos tabular">{k + 1}</span>
                <span className="bigo-dotkey" style={{ background: STYLE[key].color }} />
                <span className="mono grow">{GROWTH[key].label}</span>
                {marks && <span className="bigo-mark" aria-label={marks[k] ? 'right place' : 'wrong place'}>{marks[k] ? '✓' : '✗'}</span>}
                {!solved && (
                  <span className="bigo-moves">
                    <button type="button" className="icon-btn" onClick={() => move(k, -1)} disabled={k === 0} aria-label={`Move ${GROWTH[key].label} up`}><ArrowUp size={15} /></button>
                    <button type="button" className="icon-btn" onClick={() => move(k, 1)} disabled={k === order.length - 1} aria-label={`Move ${GROWTH[key].label} down`}><ArrowDown size={15} /></button>
                    <button type="button" className="icon-btn" onClick={() => unplace(key)} aria-label={`Take ${GROWTH[key].label} out`}><X size={15} /></button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="row wrap bigo-rank-actions">
          <button type="button" className="btn btn-primary" onClick={check} disabled={pool.length > 0 || solved}><Check size={16} /> Check order</button>
          {(solved || attempts > 0) && <button type="button" className="btn btn-ghost" onClick={resetRanking}><Shuffle size={15} /> Start over</button>}
        </div>
        <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
      </section>
    </div>
  )
}
