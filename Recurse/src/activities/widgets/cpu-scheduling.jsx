import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { FastForward, Pause, Play, Plus, RotateCcw, Shuffle, SkipForward, Trophy, X } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { ALGORITHMS, ALGORITHM_KEYS, bestAlgorithms, cleanProcesses, explainBest, randomProcesses, simulateAll } from '../lib/cpu-scheduling'
import './cpu-scheduling.css'

const DELAYS = [800, 520, 320, 170, 70]
const SPEED_NAMES = ['Slow', 'Easy', 'Medium', 'Fast', 'Blazing']
const COLORS = ['var(--accent)', 'var(--good)', 'var(--warn)', 'var(--mem-steady)', 'var(--stamp)', 'var(--ink-2)']
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

function pickAlgorithms(list) {
  const valid = Array.isArray(list) ? list.filter((k) => ALGORITHMS[k]) : []
  return valid.length >= 2 ? ALGORITHM_KEYS.filter((k) => valid.includes(k)) : ALGORITHM_KEYS
}

const labelOf = (key, quantum) => (key === 'rr' ? `Round robin (q = ${quantum})` : ALGORITHMS[key].label)

/** Same processes, three schedulers: predict the winner, watch the Gantt charts race, read the waits. */
export default function CpuScheduling({ props, onComplete, standalone }) {
  const algos = useMemo(() => pickAlgorithms(props.algorithms), [props.algorithms])
  const maxQ = standalone ? 10 : 6
  const [drafts, setDrafts] = useState(() => cleanProcesses(props.processes))
  const [quantum, setQuantum] = useState(() => Math.max(1, Math.min(maxQ, Math.round(Number(props.quantum)) || 2)))
  const [prediction, setPrediction] = useState(null)
  const [run, setRun] = useState(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [phase, setPhase] = useState('setup')
  const [focus, setFocus] = useState(algos[0])
  const [message, setMessage] = useState({ text: '', tone: '' })
  const resultsRef = useRef(null)

  const procs = useMemo(() => cleanProcesses(drafts), [drafts])
  const total = run ? Math.max(...algos.map((k) => run.results[k].end)) : 0
  const finished = run && t >= total
  const best = useMemo(() => (run ? bestAlgorithms(run.results).filter((k) => algos.includes(k)) : []), [run, algos])
  const colorOf = (name) => COLORS[procs.findIndex((p) => p.name === name) % COLORS.length]

  // ---- Setup ------------------------------------------------------------------------

  const invalidate = () => {
    setRun(null)
    setT(0)
    setPlaying(false)
    setPhase('setup')
    setPrediction(null)
    setMessage({ text: '', tone: '' })
  }

  // Inputs hold what the learner typed; the simulation uses the cleaned copy.
  const editProc = (k, field, value) => {
    setDrafts((list) => list.map((p, i) => (i === k ? { ...p, [field]: value } : p)))
    invalidate()
  }

  const tidy = () => setDrafts(cleanProcesses(drafts))

  const addProc = () => {
    sfx.pop()
    setDrafts(cleanProcesses([...procs, { arrival: Math.min(20, procs[procs.length - 1].arrival + 1), burst: 3 }]))
    invalidate()
  }

  const removeProc = (k) => {
    sfx.tap()
    setDrafts(cleanProcesses(procs.filter((_, i) => i !== k)))
    invalidate()
  }

  const randomize = () => {
    sfx.flip()
    setDrafts(cleanProcesses(randomProcesses()))
    invalidate()
  }

  const predict = (key) => {
    if (run) return
    sfx.pop()
    setPrediction(key)
  }

  // ---- Running ------------------------------------------------------------------------

  const reveal = (current) => {
    const winners = bestAlgorithms(current.results).filter((k) => algos.includes(k))
    const why = explainBest(current.results)
    if (winners.includes(current.prediction)) {
      setPhase('done')
      feedbackCorrect(resultsRef.current, { combo: 2 })
      setMessage({ text: `You called it. ${why}`, tone: 'good' })
      onComplete({ score: 1, detail: `Best: ${winners.map((k) => ALGORITHMS[k].label).join(', ')}` })
    } else {
      setPhase('identify')
      feedbackWrong(resultsRef.current)
      setMessage({ text: `Not this time: ${labelOf(current.prediction, current.quantum)} averaged ${fmt(current.results[current.prediction].avgWaiting)}. Read the averages below and pick the algorithm with the lowest average wait.`, tone: 'bad' })
    }
  }

  const goTo = (time) => {
    if (!run) return
    const target = Math.max(0, Math.min(total, time))
    setT(target)
    if (target >= total) {
      setPlaying(false)
      if (phase === 'running') reveal(run)
    }
  }

  const tick = useEffectEvent(() => {
    sfx.tick()
    goTo(t + 1)
  })
  useEffect(() => {
    if (!playing || !run || t >= total) return undefined
    const id = setTimeout(tick, DELAYS[speed])
    return () => clearTimeout(id)
  }, [playing, run, t, total, speed])

  const start = () => {
    if (!prediction) {
      sfx.error()
      setMessage({ text: 'Make a prediction first: which algorithm will have the lowest average waiting time?', tone: 'bad' })
      return
    }
    sfx.tap()
    if (!run) {
      setRun({ results: simulateAll(procs, quantum), prediction, quantum })
      setPhase('running')
      setT(0)
      setMessage({ text: '', tone: '' })
      setPlaying(true)
      return
    }
    if (playing) return setPlaying(false)
    if (finished) setT(0)
    setPlaying(true)
  }

  const stepOnce = () => {
    if (!run) return start()
    sfx.tick()
    setPlaying(false)
    goTo(t + 1)
  }

  const identify = (key) => {
    if (phase !== 'identify') return
    if (best.includes(key)) {
      setPhase('done')
      feedbackCorrect(resultsRef.current, { combo: 1 })
      setMessage({ text: `Yes. ${explainBest(run.results)}`, tone: 'good' })
      onComplete({ score: 0.5, detail: `Best: ${best.map((k) => ALGORITHMS[k].label).join(', ')}` })
    } else {
      feedbackWrong(resultsRef.current)
      setMessage({ text: `${labelOf(key, run.quantum)} averaged ${fmt(run.results[key].avgWaiting)}. Look for the smallest number.`, tone: 'bad' })
    }
  }

  // ---- Captions ------------------------------------------------------------------------

  const nowLines = run
    ? algos.map((k) => {
        const segs = run.results[k].segments
        const seg = t >= total ? segs[segs.length - 1] : segs.find((s) => s.start <= t && t < s.end)
        const text = t >= total ? 'All processes are done.' : seg ? (seg.name ? `${seg.name} is on the CPU. ${seg.start === t ? seg.reason : ''}` : seg.reason) : ''
        return { k, text }
      })
    : []

  const ticks = []
  if (total) {
    const every = total <= 20 ? 1 : total <= 40 ? 2 : 5
    for (let x = 0; x <= total; x += every) ticks.push(x)
    if (ticks[ticks.length - 1] !== total) ticks.push(total)
  }
  const maxAvg = run ? Math.max(...algos.map((k) => run.results[k].avgWaiting), 0.001) : 1
  const focusStats = run ? run.results[focus].stats : []

  return (
    <div className="sched">
      <div className="w-toolbar">
        <span className="small"><strong>Processes</strong></span>
        <span className="grow" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={randomize}><Shuffle size={14} /> Randomize</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={addProc} disabled={procs.length >= 6}><Plus size={14} /> Add</button>
      </div>

      <div className="sched-procs" role="table" aria-label="Processes">
        <div className="sched-proc head" role="row">
          <span role="columnheader">Process</span>
          <span role="columnheader">Arrives at</span>
          <span role="columnheader">Burst (CPU time)</span>
          <span role="columnheader"><span className="sr-only">Remove</span></span>
        </div>
        {procs.map((p, k) => (
          <div className="sched-proc" role="row" key={p.name}>
            <span role="cell" className="sched-name" style={{ '--c': colorOf(p.name) }}><i />{p.name}</span>
            <span role="cell"><input className="input sched-num" type="number" min="0" max="20" value={drafts[k]?.arrival ?? p.arrival} onChange={(e) => editProc(k, 'arrival', e.target.value)} onBlur={tidy} aria-label={`${p.name} arrival time`} /></span>
            <span role="cell"><input className="input sched-num" type="number" min="1" max="12" value={drafts[k]?.burst ?? p.burst} onChange={(e) => editProc(k, 'burst', e.target.value)} onBlur={tidy} aria-label={`${p.name} burst time`} /></span>
            <span role="cell">
              <button type="button" className="btn btn-sm btn-ghost sched-remove" onClick={() => removeProc(k)} disabled={procs.length <= 2} aria-label={`Remove ${p.name}`}><X size={14} /></button>
            </span>
          </div>
        ))}
      </div>

      {algos.includes('rr') && (
        <label className="w-slider sched-quantum">
          <span>Round robin quantum: <strong className="tabular">{quantum}</strong></span>
          <input type="range" min="1" max={maxQ} value={quantum} onChange={(e) => { sfx.tick(); setQuantum(Number(e.target.value)); invalidate() }} />
        </label>
      )}

      <div className={`sched-predict${prediction ? ' made' : ''}`}>
        <span className="small"><strong>Predict:</strong> which algorithm gives the lowest <em>average waiting time</em> for these processes?</span>
        <div className="row wrap sched-predict-row" role="group" aria-label="Your prediction">
          {algos.map((k) => (
            <button key={k} type="button" className="btn btn-sm" aria-pressed={prediction === k} onClick={() => predict(k)} disabled={Boolean(run) && prediction !== k}>
              {labelOf(k, quantum)}
            </button>
          ))}
        </div>
      </div>

      <div className="w-stage sched-stage">
        {!run ? (
          <p className="sched-empty small subtle">The Gantt charts appear here. Each row shows which process holds the CPU at each moment.</p>
        ) : (
          <div className="sched-gantt">
            {algos.map((k) => (
              <div className="sched-row" key={k}>
                <div className="sched-row-label">
                  <strong>{labelOf(k, run.quantum)}</strong>
                  {finished && <span className="xsmall">avg wait {fmt(run.results[k].avgWaiting)}</span>}
                </div>
                <div className="sched-track">
                  {run.results[k].segments.map((s, i) => {
                    const shown = Math.max(0, Math.min(t, s.end) - s.start)
                    if (shown <= 0) return null
                    return (
                      <div
                        key={i}
                        className={`sched-seg${s.name ? '' : ' idle'}${shown >= s.end - s.start ? ' full' : ''}`}
                        style={{ left: `${(s.start / total) * 100}%`, width: `${(shown / total) * 100}%`, '--c': s.name ? colorOf(s.name) : undefined, '--dur': `${DELAYS[speed]}ms` }}
                        title={`${s.name || 'Idle'}: ${s.start} to ${s.end}`}
                      >
                        <span>{s.name || ''}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="sched-row sched-axis-row" aria-hidden="true">
              <div />
              <div className="sched-axis">
                {ticks.map((x) => <span key={x} style={{ left: `${(x / total) * 100}%` }}>{x}</span>)}
              </div>
            </div>
            <div className="sched-cursor-layer" aria-hidden="true">
              <span className="sched-cursor" style={{ left: `${(t / total) * 100}%`, '--dur': `${DELAYS[speed]}ms` }} />
            </div>
          </div>
        )}
      </div>

      {run && (
        <div className="sched-now" aria-live={playing ? 'off' : 'polite'}>
          {nowLines.map(({ k, text }) => (
            <p key={k}><strong>{ALGORITHMS[k].label}:</strong> {text}</p>
          ))}
        </div>
      )}

      <div className="w-toolbar sched-controls">
        <button type="button" className="btn btn-sm btn-primary" onClick={start} disabled={!prediction && !run}>
          {!run ? <><Play size={15} /> Run all {algos.length === 3 ? 'three' : algos.length}</> : playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {finished ? 'Replay' : 'Resume'}</>}
        </button>
        <button type="button" className="btn btn-sm" onClick={stepOnce} disabled={(!prediction && !run) || finished}>
          <SkipForward size={15} /> Step
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { sfx.tap(); setPlaying(false); goTo(total) }} disabled={!run || finished} aria-label="Skip to the end">
          <FastForward size={15} />
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setT(0) }} disabled={!run || t === 0} aria-label="Rewind to t = 0">
          <RotateCcw size={15} />
        </button>
        <label className="w-slider">
          <span>Speed</span>
          <input type="range" min="0" max="4" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={SPEED_NAMES[speed]} />
        </label>
      </div>

      <div className="w-readout">
        <div className="w-stat"><span>Time</span><strong>t = {t}{run ? ` of ${total}` : ''}</strong></div>
        <div className="w-stat"><span>Processes</span><strong>{procs.length}</strong></div>
        <div className="w-stat"><span>Total CPU work</span><strong>{procs.reduce((sum, p) => sum + p.burst, 0)}</strong></div>
        <div className="w-stat"><span>Your pick</span><strong>{prediction ? ALGORITHMS[prediction].label : '?'}</strong></div>
      </div>

      <div className="w-legend">
        {procs.map((p) => <span key={p.name}><i style={{ background: colorOf(p.name) }} />{p.name}</span>)}
        <span><i className="sched-idle-key" />CPU idle</span>
        <span><i className="sched-cursor-key" />Current time</span>
      </div>

      {run && (
        <div className="sched-results" ref={resultsRef}>
          <p className="xsmall subtle sched-results-title">Average waiting time (lower is better)</p>
          {algos.map((k) => {
            const avg = run.results[k].avgWaiting
            const isBest = finished && phase !== 'identify' && best.includes(k)
            const Tag = phase === 'identify' ? 'button' : 'div'
            return (
              <Tag
                key={k}
                type={Tag === 'button' ? 'button' : undefined}
                className={`sched-bar-row${isBest ? ' best' : ''}${Tag === 'button' ? ' pickable' : ''}`}
                onClick={Tag === 'button' ? () => identify(k) : undefined}
              >
                <span className="sched-bar-label">{labelOf(k, run.quantum)}</span>
                <span className="sched-bar"><span style={{ width: finished ? `${Math.max(2, (avg / maxAvg) * 100)}%` : '0%' }} /></span>
                <strong className="tabular">{finished ? fmt(avg) : '?'}</strong>
                {isBest && <span className="chip good"><Trophy size={11} /> lowest</span>}
                {run.prediction === k && <span className="chip outline">your pick</span>}
              </Tag>
            )
          })}

          <div className="sched-breakdown">
            <div className="w-pill-group" role="group" aria-label="Show details for">
              {algos.map((k) => <button key={k} type="button" aria-pressed={focus === k} onClick={() => { sfx.tap(); setFocus(k) }}>{ALGORITHMS[k].label}</button>)}
            </div>
            <table className="sched-table">
              <thead>
                <tr><th scope="col">Process</th><th scope="col">Arrives</th><th scope="col">Burst</th><th scope="col">Finishes</th><th scope="col">Turnaround</th><th scope="col">Waiting</th></tr>
              </thead>
              <tbody>
                {focusStats.map((s) => {
                  const done = t >= s.completion
                  return (
                    <tr key={s.name} className={done ? 'done' : ''}>
                      <th scope="row"><span className="sched-name" style={{ '--c': colorOf(s.name) }}><i />{s.name}</span></th>
                      <td>{s.arrival}</td>
                      <td>{s.burst}</td>
                      <td>{done ? s.completion : '...'}</td>
                      <td>{done ? `${s.completion} - ${s.arrival} = ${s.turnaround}` : '...'}</td>
                      <td>{done ? `${s.turnaround} - ${s.burst} = ${s.waiting}` : '...'}</td>
                    </tr>
                  )
                })}
              </tbody>
              {finished && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4}>Average</th>
                    <td>{fmt(run.results[focus].avgTurnaround)}</td>
                    <td>{fmt(run.results[focus].avgWaiting)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            <p className="xsmall subtle">Turnaround = finish time minus arrival. Waiting = turnaround minus burst: the time spent ready but not running.</p>
          </div>
        </div>
      )}

      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
    </div>
  )
}
