import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Eye, FastForward, Lightbulb, Pause, Play, RotateCcw, Shuffle, SkipForward } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { PROBLEMS, buildProblem, fmtValue, parseCellInput, randomParams } from '../lib/dp-table'
import './dp-table.css'

const DELAYS = [1600, 1000, 620, 340, 140]
const SPEED_NAMES = ['Slow', 'Easy', 'Medium', 'Fast', 'Blazing']
const CS = 46
const CH = 26
const PAD = 8

const hideResult = (formula) => formula.replace(/ = [^=]+$/, ' = ?')

function initialParams(props, problem) {
  if (problem === 'coin-change') return { coins: props.coins, amount: props.amount }
  if (problem === 'lcs') return { a: props.a, b: props.b }
  return { m: props.m ?? props.rows, n: props.n ?? props.cols }
}

/** Fill a dynamic programming table cell by cell: watch it happen, then do it yourself. */
export default function DpTable({ props, onComplete, standalone }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [problem, setProblem] = useState(PROBLEMS[props.problem] ? props.problem : 'grid-paths')
  const [params, setParams] = useState(() => initialParams(props, PROBLEMS[props.problem] ? props.problem : 'grid-paths'))
  const [mode, setMode] = useState('watch')
  const [shown, setShown] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [fillIdx, setFillIdx] = useState(0)
  const [hint, setHint] = useState(0)
  const [draft, setDraft] = useState('')
  const [combo, setCombo] = useState(0)
  const [firstTry, setFirstTry] = useState(0)
  const [phase, setPhase] = useState('fill')
  const [flash, setFlash] = useState(null)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const svgRef = useRef(null)
  const formRef = useRef(null)
  const inputRef = useRef(null)

  const table = useMemo(() => buildProblem(problem, params), [problem, params])
  const order = useMemo(() => table.steps.map((s, k) => (s.base ? -1 : k)).filter((k) => k >= 0), [table])
  const total = table.steps.length
  const isCoin = problem === 'coin-change'
  const RH = isCoin ? 54 : 30
  const arcRoom = isCoin ? 54 : 0
  const vbW = PAD * 2 + RH + table.cols * CS
  const vbH = PAD * 2 + CH + table.rows * CS + arcRoom
  const cellX = (c) => PAD + RH + c * CS
  const cellY = (r) => PAD + CH + r * CS
  const allowsInfinity = isCoin && table.values[0].includes(Infinity)

  // What is on the table right now, and which cell is in focus.
  const { filled, current } = useMemo(() => {
    const map = new Map()
    if (mode === 'watch') {
      for (let k = 0; k < shown; k++) map.set(`${table.steps[k].r}-${table.steps[k].c}`, k)
      return { filled: map, current: shown > 0 ? table.steps[shown - 1] : null }
    }
    table.steps.forEach((s, k) => s.base && map.set(`${s.r}-${s.c}`, k))
    for (let k = 0; k < fillIdx; k++) map.set(`${table.steps[order[k]].r}-${table.steps[order[k]].c}`, order[k])
    return { filled: map, current: fillIdx < order.length ? table.steps[order[fillIdx]] : null }
  }, [mode, shown, fillIdx, table, order])

  const fillDone = fillIdx >= order.length
  const showDeps = mode === 'watch' ? Boolean(current) : Boolean(current) && hint >= 1

  // ---- Watch mode player --------------------------------------------------------

  const goTo = (p) => {
    const target = Math.max(0, Math.min(total, p))
    setShown(target)
    if (target === total) {
      setPlaying(false)
      if (shown !== total) {
        sfx.success()
        setMessage({ text: `${table.answerText} Now switch to Fill and do it yourself.`, tone: 'good' })
      }
    }
  }
  const tick = useEffectEvent(() => goTo(shown + 1))
  useEffect(() => {
    if (!playing || mode !== 'watch' || shown >= total) return undefined
    const id = setTimeout(tick, DELAYS[speed])
    return () => clearTimeout(id)
  }, [playing, shown, speed, mode, total])

  const togglePlay = () => {
    sfx.tap()
    if (playing) return setPlaying(false)
    if (shown >= total) setShown(0)
    setMessage({ text: '', tone: '' })
    setPlaying(true)
  }

  // ---- Setup changes ------------------------------------------------------------

  const resetProgress = () => {
    setShown(0)
    setPlaying(false)
    setFillIdx(0)
    setHint(0)
    setDraft('')
    setCombo(0)
    setFirstTry(0)
    setPhase('fill')
    setFlash(null)
    setMessage({ text: '', tone: '' })
  }

  const chooseProblem = (name) => {
    if (name === problem) return
    sfx.tap()
    setProblem(name)
    setParams(name === props.problem ? initialParams(props, name) : {})
    resetProgress()
  }

  const newNumbers = () => {
    sfx.flip()
    setParams(randomParams(problem))
    resetProgress()
  }

  const chooseMode = (name) => {
    if (name === mode) return
    sfx.tap()
    setMode(name)
    setPlaying(false)
    setMessage({ text: '', tone: '' })
  }

  // ---- Fill mode ----------------------------------------------------------------

  const cellEl = (r, c) => svgRef.current?.querySelector(`[data-cell="${r}-${c}"]`)

  const check = (e) => {
    e.preventDefault()
    if (!current) return
    const value = parseCellInput(draft)
    if (value === null) {
      sfx.error()
      setMessage({ text: allowsInfinity ? 'Type a whole number, or ∞ (inf) if the amount cannot be made.' : 'Type a whole number.', tone: 'bad' })
      return
    }
    if (value === current.value) {
      const nextCombo = hint === 0 ? combo + 1 : 0
      feedbackCorrect(cellEl(current.r, current.c), { combo: nextCombo })
      setCombo(nextCombo)
      if (hint === 0) setFirstTry((n) => n + 1)
      setFlash({ key: `${current.r}-${current.c}`, tone: 'good' })
      setMessage({ text: `Right: ${current.formula}.`, tone: 'good' })
      setDraft('')
      setHint(0)
      const next = fillIdx + 1
      setFillIdx(next)
      if (next >= order.length) {
        setPhase('pick')
        setMessage({ text: `Table complete. ${table.question} Select it.`, tone: 'good' })
      }
      inputRef.current?.focus()
      return
    }
    feedbackWrong(formRef.current)
    setCombo(0)
    setFlash({ key: `${current.r}-${current.c}`, tone: 'bad' })
    const level = Math.min(3, hint + 1)
    setHint(level)
    const tips = {
      1: `Not ${fmtValue(value)}. Hint: ${table.hint} The arrows show which cells to use.`,
      2: `Still not it. Fill in the numbers: ${hideResult(current.formula)}`,
      3: `Not quite. ${current.explain}`
    }
    setMessage({ text: tips[level], tone: 'bad' })
  }

  const reveal = () => {
    if (!current) return
    sfx.flip()
    setCombo(0)
    setDraft(fmtValue(current.value))
    setMessage({ text: `${current.explain} Type ${fmtValue(current.value)} and check it.`, tone: '' })
    inputRef.current?.focus()
  }

  const showHint = () => {
    sfx.pop()
    const level = Math.min(2, hint + 1)
    setHint(level)
    setMessage({ text: level === 1 ? `Hint: ${table.hint}` : `Fill in the numbers: ${hideResult(current.formula)}`, tone: '' })
  }

  const pickCell = (r, c) => {
    if (phase !== 'pick') return
    const el = cellEl(r, c)
    if (r === table.answer.r && c === table.answer.c) {
      feedbackCorrect(el, { combo: combo + 1 })
      setPhase('done')
      setFlash({ key: `${r}-${c}`, tone: 'good' })
      setMessage({ text: `Yes. ${table.answerText}`, tone: 'good' })
      onComplete({ score: order.length ? firstTry / order.length : 1, detail: `${firstTry} of ${order.length} cells right on the first try` })
    } else {
      feedbackWrong(el)
      setFlash({ key: `${r}-${c}`, tone: 'bad' })
      setMessage({ text: `That cell answers a smaller problem (${table.cellLabel(r, c)}). The full problem is the one that uses everything.`, tone: 'bad' })
    }
  }

  // ---- Drawing ------------------------------------------------------------------

  const arrows = []
  if (showDeps && current) {
    const tx = cellX(current.c) + CS / 2
    const ty = cellY(current.r) + CS / 2
    current.deps.forEach((d, k) => {
      const fx = cellX(d.c) + CS / 2
      const fy = cellY(d.r) + CS / 2
      let path
      if (isCoin) {
        const base = cellY(0) + CS - 4
        const h = Math.min(arcRoom - 6, 14 + 9 * Math.abs(current.c - d.c))
        path = `M ${fx} ${base} Q ${(fx + tx) / 2} ${base + h * 2 - 8} ${tx - 3} ${base}`
      } else {
        const dx = tx - fx
        const dy = ty - fy
        path = `M ${fx + dx * 0.28} ${fy + dy * 0.28} L ${tx - dx * 0.36} ${ty - dy * 0.36}`
      }
      arrows.push(<path key={k} d={path} className={`dpt-arrow${d.used ? ' used' : ''}`} markerEnd={`url(#${uid}-${d.used ? 'used' : 'other'})`} />)
    })
  }
  const depKeys = new Set(showDeps && current ? current.deps.map((d) => `${d.r}-${d.c}`) : [])

  const watchCaption = current ? current.explain : `${table.intro} Press Play to watch the table fill, one cell at a time.`
  const fillCaption = phase === 'fill' && current ? `What goes in ${table.cellLabel(current.r, current.c)}?` : phase === 'pick' ? table.question : table.answerText

  return (
    <div className="dpt">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="Problem">
          {Object.entries(PROBLEMS).map(([name, label]) => (
            <button key={name} type="button" aria-pressed={name === problem} onClick={() => chooseProblem(name)}>{label}</button>
          ))}
        </div>
        <span className="grow" />
        <div className="w-pill-group" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'watch'} onClick={() => chooseMode('watch')}>Watch</button>
          <button type="button" aria-pressed={mode === 'fill'} onClick={() => chooseMode('fill')}>Fill{phase === 'done' ? ' ✓' : ''}</button>
        </div>
        {(standalone || props.randomize) && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={newNumbers}><Shuffle size={14} /> New numbers</button>
        )}
      </div>

      <p className="dpt-intro small">{table.intro}</p>
      <div className="dpt-rule">
        <span className="dpt-rule-label">Rule</span>
        <code className="mono">{table.rule}</code>
      </div>

      <div className="w-stage grid-bg dpt-stage">
        <svg
          ref={svgRef}
          className="dpt-svg"
          viewBox={`0 0 ${vbW} ${vbH}`}
          style={{ maxWidth: `${Math.round(vbW * 1.3)}px` }}
          role="img"
          aria-label={`Table with ${table.rows} rows and ${table.cols} columns, ${filled.size} cells filled`}
        >
          <defs>
            <marker id={`${uid}-used`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="dpt-head used" />
            </marker>
            <marker id={`${uid}-other`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="dpt-head" />
            </marker>
          </defs>
          {table.colHeads.map((h, c) => (
            <text key={`ch${c}`} className="dpt-head-text" x={cellX(c) + CS / 2} y={PAD + CH - 9}>{h}</text>
          ))}
          {table.rowHeads.map((h, r) => (
            <text key={`rh${r}`} className="dpt-head-text" x={PAD + RH - 8} y={cellY(r) + CS / 2 + 4} textAnchor="end">{h}</text>
          ))}
          {table.steps.map((s) => {
            const key = `${s.r}-${s.c}`
            const isFilled = filled.has(key)
            const isCurrent = current && current.r === s.r && current.c === s.c
            const isAnswer = phase === 'done' && mode === 'fill' && s.r === table.answer.r && s.c === table.answer.c
            const cls = [
              'dpt-cell',
              isFilled ? 'filled' : '',
              s.base ? 'base' : '',
              isCurrent ? (mode === 'fill' ? 'ask' : 'current') : '',
              depKeys.has(key) ? 'dep' : '',
              isAnswer ? 'answer' : '',
              flash?.key === key ? `flash-${flash.tone}` : ''
            ].join(' ')
            const pickable = phase === 'pick' && mode === 'fill'
            return (
              <g
                key={key}
                className={`${cls}${pickable ? ' pickable' : ''}`}
                {...(pickable
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `${table.cellLabel(s.r, s.c)}: ${fmtValue(s.value)}`,
                      onClick: () => pickCell(s.r, s.c),
                      onKeyDown: (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          pickCell(s.r, s.c)
                        }
                      }
                    }
                  : {})}
              >
                <rect data-cell={key} x={cellX(s.c) + 2} y={cellY(s.r) + 2} width={CS - 4} height={CS - 4} rx="6" />
                {isFilled && <text className="dpt-val" x={cellX(s.c) + CS / 2} y={cellY(s.r) + CS / 2 + 6}>{fmtValue(s.value)}</text>}
                {!isFilled && isCurrent && mode === 'fill' && <text className="dpt-q" x={cellX(s.c) + CS / 2} y={cellY(s.r) + CS / 2 + 6}>?</text>}
              </g>
            )
          })}
          <g className="dpt-arrows">{arrows}</g>
        </svg>
      </div>

      {mode === 'watch' ? (
        <>
          <div className="dpt-formula mono" aria-hidden={!current}>{current ? current.formula : ' '}</div>
          <p className="dpt-caption" aria-live={playing ? 'off' : 'polite'}>{watchCaption}</p>
          <div className="w-toolbar dpt-controls">
            <button type="button" className="btn btn-sm" onClick={() => { sfx.tick(); setPlaying(false); goTo(shown - 1) }} disabled={shown === 0} aria-label="Step back">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={togglePlay}>
              {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {shown >= total ? 'Replay' : shown ? 'Resume' : 'Play'}</>}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => { sfx.tick(); setPlaying(false); goTo(shown + 1) }} disabled={shown >= total}>
              <SkipForward size={15} /> Step
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { sfx.tap(); setPlaying(false); goTo(total) }} disabled={shown >= total} aria-label="Fill everything">
              <FastForward size={15} />
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setShown(0) }} disabled={shown === 0} aria-label="Clear the table">
              <RotateCcw size={15} />
            </button>
            <label className="w-slider">
              <span>Speed</span>
              <input type="range" min="0" max="4" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={SPEED_NAMES[speed]} />
            </label>
          </div>
        </>
      ) : (
        <>
          <p className="dpt-caption" aria-live="polite">{fillCaption}</p>
          {!fillDone && (
            <form ref={formRef} className="dpt-form" onSubmit={check}>
              <label className="dpt-input-label" htmlFor={`${uid}-input`}>
                {current ? table.cellLabel(current.r, current.c) : ''}
              </label>
              <input
                id={`${uid}-input`}
                ref={inputRef}
                className="input dpt-input mono"
                inputMode={allowsInfinity ? 'text' : 'numeric'}
                autoComplete="off"
                value={draft}
                placeholder={allowsInfinity ? 'number or ∞' : 'number'}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm"><Check size={15} /> Check</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={showHint} disabled={hint >= 2}><Lightbulb size={14} /> Hint</button>
              {hint >= 2 && <button type="button" className="btn btn-sm btn-ghost" onClick={reveal}><Eye size={14} /> Show me</button>}
            </form>
          )}
        </>
      )}

      <div className="w-readout">
        {mode === 'watch' ? (
          <div className="w-stat"><span>Cells filled</span><strong>{shown} / {total}</strong></div>
        ) : (
          <>
            <div className="w-stat"><span>Cells to fill</span><strong>{Math.min(fillIdx, order.length)} / {order.length}</strong></div>
            <div className="w-stat"><span>First try</span><strong>{firstTry}</strong></div>
            <div className="w-stat"><span>Streak</span><strong>{combo}</strong></div>
          </>
        )}
        <div className="w-stat"><span>Answer cell</span><strong>{mode === 'fill' && phase === 'done' ? fmtValue(table.values[table.answer.r][table.answer.c]) : mode === 'watch' && shown >= total ? fmtValue(table.values[table.answer.r][table.answer.c]) : '?'}</strong></div>
      </div>

      <div className="w-legend">
        <span><i className="dpt-key base" />Base case</span>
        <span><i className="dpt-key filled" />Filled</span>
        <span><i className="dpt-key current" />{mode === 'fill' ? 'Your cell (?)' : 'Being filled'}</span>
        <span><i className="dpt-key dep" />Used by the rule (arrows)</span>
      </div>

      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
    </div>
  )
}
