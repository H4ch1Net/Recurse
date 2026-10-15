import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Pause, Play, RotateCcw, Shuffle, SkipForward, Trophy } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { SORT_ALGORITHMS, SORT_INFO, SORT_PRESETS, makeArray, traceSort } from '../lib/sort-visualizer'
import './sort-visualizer.css'

const DELAYS = [700, 380, 180, 70, 22]
const SPEED_NAMES = ['Slow', 'Easy', 'Medium', 'Fast', 'Blazing']
const MARKERS = { compare: '?', swap: '⇄', overwrite: '↓' }

function pickAlgorithms(list) {
  const valid = Array.isArray(list) ? list.filter((a) => SORT_ALGORITHMS.includes(a)) : []
  return valid.length ? [...new Set(valid)] : SORT_ALGORITHMS
}

function startingArray(props, size) {
  const given = Array.isArray(props.values) ? props.values.map(Number).filter((v) => Number.isFinite(v) && v > 0) : []
  if (given.length >= 2) return given.slice(0, 32).map((v) => Math.min(99, Math.round(v)))
  return makeArray(size, 'random')
}

function stateOf(frame, k) {
  if (frame.active.includes(k)) return frame.kind === 'compare' ? 'compare' : 'swap'
  if (frame.mark === k) return 'mark'
  if (frame.sorted[k]) return 'sorted'
  if (frame.range && (k < frame.range[0] || k > frame.range[1])) return 'dim'
  return ''
}

/** Bars that sort themselves one step at a time, with live counters and a comparison table. */
export default function SortVisualizer({ props, onComplete, standalone }) {
  const algorithms = useMemo(() => pickAlgorithms(props.algorithms), [props.algorithms])
  const maxSize = standalone ? 32 : 24
  const initialSize = Math.max(6, Math.min(maxSize, Number(props.size) || (Array.isArray(props.values) && props.values.length) || 12))
  const [size, setSize] = useState(initialSize)
  const [preset, setPreset] = useState('random')
  const [start, setStart] = useState(() => startingArray(props, initialSize))
  const [algo, setAlgo] = useState(algorithms[0])
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(standalone ? 2 : 3)
  const [results, setResults] = useState({})
  const [prediction, setPrediction] = useState(null)
  const [verdict, setVerdict] = useState(null)
  const stageRef = useRef(null)

  const trace = useMemo(() => traceSort(algo, start), [algo, start])
  const last = trace.frames.length - 1
  const frame = trace.frames[Math.min(pos, last)]
  const maxValue = Math.max(...start, 1)
  const posOf = useMemo(() => {
    const out = []
    frame.ids.forEach((id, k) => { out[id] = k })
    return out
  }, [frame])
  const ran = Object.keys(results)
  const showLabels = start.length <= (standalone ? 18 : 14)

  const finish = (name) => {
    if (results[name]) return
    const next = { ...results, [name]: { comparisons: trace.comparisons, swaps: trace.swaps, writes: trace.writes } }
    setResults(next)
    sfx.success()
    const names = Object.keys(next)
    if (names.length < 2) return
    const fewest = Math.min(...names.map((n) => next[n].comparisons))
    if (prediction && prediction !== 'skip' && next[prediction]) {
      const right = next[prediction].comparisons === fewest
      setVerdict(right ? 'right' : 'wrong')
      if (right) feedbackCorrect(stageRef.current, { combo: 2 })
    }
    if (names.length === 2) {
      feedbackSuccess(stageRef.current, 'Compared!')
      onComplete({ score: 1, detail: names.map((n) => `${SORT_INFO[n].label} ${next[n].comparisons}`).join(', ') })
    }
  }

  const goTo = (p) => {
    const target = Math.max(0, Math.min(last, p))
    setPos(target)
    if (target === last) {
      setPlaying(false)
      finish(algo)
    }
  }

  const tick = useEffectEvent(() => goTo(pos + 1))
  useEffect(() => {
    if (!playing) return undefined
    const id = setTimeout(tick, DELAYS[speed])
    return () => clearTimeout(id)
  }, [playing, pos, speed])

  const newArray = (nextSize = size, nextPreset = preset) => {
    sfx.flip()
    setStart(makeArray(nextSize, nextPreset))
    setPos(0)
    setPlaying(false)
    setResults({})
    setPrediction(null)
    setVerdict(null)
  }

  const chooseAlgo = (name) => {
    if (name === algo) return
    sfx.tap()
    setAlgo(name)
    setPos(0)
    setPlaying(false)
  }

  const togglePlay = () => {
    sfx.tap()
    if (playing) return setPlaying(false)
    if (pos >= last) setPos(0)
    setPlaying(true)
  }

  const predict = (name) => {
    sfx.pop()
    setPrediction(name)
  }

  const showPredict = prediction === null && ran.length === 0 && pos === 0 && algorithms.length >= 2
  const fewest = ran.length ? Math.min(...ran.map((n) => results[n].comparisons)) : 0
  const most = ran.length ? Math.max(...ran.map((n) => results[n].comparisons)) : 0
  const winner = ran.find((n) => results[n].comparisons === fewest)
  const loser = ran.find((n) => results[n].comparisons === most)
  const progress = last ? (Math.min(pos, last) / last) * 100 : 100

  return (
    <div className="sv">
      <div className="w-toolbar">
        <div className="w-pill-group sv-algos" role="group" aria-label="Algorithm">
          {algorithms.map((name) => (
            <button key={name} type="button" aria-pressed={name === algo} onClick={() => chooseAlgo(name)}>
              {SORT_INFO[name].label}
              {results[name] && <span className="sv-done-dot" aria-label="finished"> ✓</span>}
            </button>
          ))}
        </div>
        <span className="grow" />
        <span className="chip outline">{SORT_INFO[algo].big}</span>
      </div>

      {showPredict && (
        <div className="sv-predict">
          <span className="small"><strong>Predict first:</strong> which algorithm will need the fewest comparisons on this array?</span>
          <div className="row wrap sv-predict-row">
            {algorithms.map((name) => (
              <button key={name} type="button" className="btn btn-sm" onClick={() => predict(name)}>{SORT_INFO[name].label}</button>
            ))}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => predict('skip')}>Skip</button>
          </div>
        </div>
      )}
      {prediction && prediction !== 'skip' && ran.length < 2 && (
        <p className="xsmall subtle sv-pick">Your prediction: <strong>{SORT_INFO[prediction].label}</strong> will need the fewest comparisons. Run two algorithms to check.</p>
      )}

      <div className={`w-stage grid-bg sv-stage${standalone ? ' big' : ''}`} ref={stageRef} style={{ '--sv-dur': `${Math.min(300, Math.round(DELAYS[speed] * 0.8))}ms` }}>
        <div className={`sv-bars${start.length > 12 ? ' crowded' : ''}`} role="img" aria-label={`Array: ${frame.values.join(', ')}`}>
          {start.map((value, id) => {
            const k = posOf[id]
            const state = stateOf(frame, k)
            return (
              <div key={id} className={`sv-bar ${state}`} style={{ width: `${100 / start.length}%`, transform: `translateX(${k * 100}%)` }}>
                <div className="sv-fill" style={{ height: `${Math.max(4, (value / maxValue) * 100)}%` }}>
                  {showLabels && <span className="sv-val">{value}</span>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="sv-markers" aria-hidden="true">
          {frame.values.map((_, k) => {
            const glyph = frame.active.includes(k) ? MARKERS[frame.kind] : frame.mark === k ? (algo === 'quick' ? 'P' : 'min') : ''
            return <span key={k} style={{ width: `${100 / start.length}%` }}>{glyph}</span>
          })}
        </div>
        <div className="sv-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      </div>

      <p className="sv-caption" aria-live={playing ? 'off' : 'polite'}>{frame.caption}</p>

      <div className="w-toolbar sv-controls">
        <button type="button" className="btn btn-sm" onClick={() => { sfx.tick(); goTo(pos - 1) }} disabled={pos === 0} aria-label="Step back">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="btn btn-sm btn-primary sv-play" onClick={togglePlay}>
          {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {pos >= last ? 'Replay' : pos ? 'Resume' : 'Play'}</>}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => { sfx.tick(); setPlaying(false); goTo(pos + 1) }} disabled={pos >= last}>
          <SkipForward size={15} /> Step
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setPos(0) }} disabled={pos === 0} aria-label="Rewind to the start">
          <RotateCcw size={15} />
        </button>
        <label className="w-slider">
          <span>Speed</span>
          <input type="range" min="0" max="4" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={SPEED_NAMES[speed]} />
        </label>
      </div>

      <div className="w-readout">
        <div className="w-stat"><span>Step</span><strong>{Math.min(pos, last)} / {last}</strong></div>
        <div className="w-stat"><span>Comparisons</span><strong className="sv-count">{frame.comparisons}</strong></div>
        <div className="w-stat"><span>Swaps</span><strong className="sv-count">{frame.swaps}</strong></div>
        <div className="w-stat"><span>Writes</span><strong className="sv-count">{frame.writes}</strong></div>
      </div>

      <div className="w-legend">
        <span><i className="sv-key compare" />Comparing (?)</span>
        <span><i className="sv-key swap" />Swapping or writing (⇄ ↓)</span>
        <span><i className="sv-key mark" />Pivot (P) or minimum (min)</span>
        <span><i className="sv-key sorted" />In final place</span>
        <span><i className="sv-key dim" />Outside the current range</span>
      </div>

      <div className="w-toolbar sv-array-tools">
        <button type="button" className="btn btn-sm" onClick={() => newArray()}><Shuffle size={15} /> Shuffle</button>
        <label className="w-slider">
          <span>Size {size}</span>
          <input type="range" min="6" max={maxSize} value={size} onChange={(e) => { const n = Number(e.target.value); setSize(n); newArray(n) }} />
        </label>
        {standalone && (
          <label className="w-slider">
            <span>Shape</span>
            <select className="select" value={preset} onChange={(e) => { setPreset(e.target.value); newArray(size, e.target.value) }}>
              {Object.entries(SORT_PRESETS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        )}
      </div>

      {ran.length > 0 && (
        <div className="sv-table-wrap">
          <table className="sv-table">
            <caption className="xsmall subtle">Same starting array, different algorithms</caption>
            <thead>
              <tr><th scope="col">Algorithm</th><th scope="col">Comparisons</th><th scope="col">Swaps</th><th scope="col">Writes</th></tr>
            </thead>
            <tbody>
              {ran.map((name) => (
                <tr key={name} className={ran.length > 1 && results[name].comparisons === fewest ? 'best' : ''}>
                  <th scope="row">
                    {SORT_INFO[name].label}
                    {ran.length > 1 && results[name].comparisons === fewest && <span className="chip good sv-best"><Trophy size={11} /> fewest</span>}
                  </th>
                  <td className="tabular">
                    <span className="sv-bar-cell" style={{ '--w': `${(results[name].comparisons / Math.max(1, most)) * 100}%` }} />
                    {results[name].comparisons}
                  </td>
                  <td className="tabular">{results[name].swaps}</td>
                  <td className="tabular">{results[name].writes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small sv-summary" aria-live="polite">
            {ran.length < 2
              ? `${SORT_INFO[ran[0]].name} finished. Pick another algorithm and run it on the same array to compare.`
              : fewest === most
                ? `They tied at ${fewest} comparisons on this array. Try Shuffle or a bigger size to pull them apart.`
                : `${SORT_INFO[loser].label} needed ${most} comparisons, ${(most / Math.max(1, fewest)).toFixed(1)} times as many as ${SORT_INFO[winner].label} (${fewest}). The gap grows fast as the array gets bigger.`}
          </p>
          {verdict && (
            <p className={`w-feedback ${verdict === 'right' ? 'good' : 'bad'}`}>
              {verdict === 'right'
                ? `Your prediction was right: ${SORT_INFO[prediction].label} needed the fewest comparisons.`
                : `You predicted ${SORT_INFO[prediction].label}, but ${SORT_INFO[winner].label} needed fewer comparisons here. Notice which approach avoids comparing every pair.`}
            </p>
          )}
          {prediction && prediction !== 'skip' && ran.length >= 2 && !results[prediction] && (
            <p className="xsmall subtle">Run {SORT_INFO[prediction].label} too to check your prediction.</p>
          )}
        </div>
      )}
    </div>
  )
}
