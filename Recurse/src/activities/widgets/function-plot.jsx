import { Fragment, useId, useMemo, useRef, useState } from 'react'
import { Shuffle, Target } from 'lucide-react'
import { feedbackCorrect } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { MATCH_TOLERANCE, PRESETS, PRESET_NAMES, VIEW, curveDistance, curvePath, defaults, features, fmtNum, formatEquation, randomTarget, snap } from '../lib/function-plot'
import './function-plot.css'

const W = 480
const H = 360
const SPAN_X = VIEW.xmax - VIEW.xmin
const SPAN_Y = VIEW.ymax - VIEW.ymin
const sx = (x) => ((x - VIEW.xmin) / SPAN_X) * W
const sy = (y) => ((VIEW.ymax - y) / SPAN_Y) * H
const clampX = (x) => Math.max(VIEW.xmin, Math.min(VIEW.xmax, x))

/** Writes "1.5^x" with a real superscript. */
function Equation({ text }) {
  const parts = text.split('^')
  return (
    <>
      {parts.map((part, k) => (k === 0 ? <Fragment key={k}>{part}</Fragment> : <Fragment key={k}><sup>{part[0]}</sup>{part.slice(1)}</Fragment>))}
    </>
  )
}

function warmth(dist) {
  if (dist < MATCH_TOLERANCE) return { label: 'Matched', tone: 'good' }
  if (dist < 0.6) return { label: 'So close', tone: 'good' }
  if (dist < 1.5) return { label: 'Getting warmer', tone: 'warn' }
  return { label: 'Far off', tone: 'cold' }
}

/** Slider-driven function families with a draggable tangent and a match-the-curve challenge. */
export default function FunctionPlot({ props, onComplete, standalone }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const fixed = PRESETS[props.preset] ? props.preset : null
  const [preset, setPreset] = useState(fixed || 'linear')
  const [params, setParams] = useState(() => defaults(fixed || 'linear'))
  const [x0, setX0] = useState(1)
  const [showTangent, setShowTangent] = useState(true)
  const [showSlope, setShowSlope] = useState(false)
  const [target, setTarget] = useState(() => ({ ...PRESETS[fixed || 'linear'].target }))
  const [matched, setMatched] = useState(false)
  const [combo, setCombo] = useState(0)
  const [message, setMessage] = useState({ text: '', tone: '' })
  const svgRef = useRef(null)
  const stageRef = useRef(null)
  const dragRef = useRef(false)

  const spec = PRESETS[preset]
  const y0 = spec.f(x0, params)
  const m = spec.df(x0, params)
  const dist = curveDistance(preset, params, target)
  const heat = warmth(dist)
  const closeness = Math.max(0, Math.min(1, 1 - dist / 4))
  const curve = useMemo(() => curvePath(preset, params, W, H), [preset, params])
  const targetCurve = useMemo(() => curvePath(preset, target, W, H), [preset, target])
  const slopeCurve = useMemo(() => (showSlope ? curvePath(preset, params, W, H, VIEW, 240, 'df') : ''), [preset, params, showSlope])
  const facts = features(preset, params)
  const pointVisible = y0 >= VIEW.ymin && y0 <= VIEW.ymax

  const win = (next) => {
    const nextCombo = combo + 1
    setMatched(true)
    setCombo(nextCombo)
    feedbackCorrect(stageRef.current, { combo: nextCombo })
    setMessage({ text: `Matched! The target was ${formatEquation(preset, target)}. Your curve: ${formatEquation(preset, next)}.`, tone: 'good' })
    onComplete({ score: 1, detail: formatEquation(preset, target) })
  }

  const setParam = (key, raw) => {
    const param = spec.params.find((p) => p.key === key)
    const value = snap(Number(raw), param.step)
    if (value === params[key]) return
    const next = { ...params, [key]: value }
    setParams(next)
    sfx.tick()
    if (!matched && curveDistance(preset, next, target) < MATCH_TOLERANCE) win(next)
  }

  const choosePreset = (name) => {
    if (name === preset) return
    sfx.tap()
    setPreset(name)
    setParams(defaults(name))
    setTarget({ ...PRESETS[name].target })
    setMatched(false)
    setMessage({ text: '', tone: '' })
  }

  const newTarget = () => {
    sfx.flip()
    setTarget(randomTarget(preset, Math.random, params))
    setMatched(false)
    setMessage({ text: 'New target. Watch the closeness meter as you move the sliders.', tone: '' })
  }

  const resetSliders = () => {
    sfx.tap()
    setParams(defaults(preset))
  }

  // ---- Tangent point: drag anywhere on the plot, or use the keyboard -------------

  const xFromEvent = (e) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!ctm) return x0
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return snap(clampX(VIEW.xmin + (pt.x / W) * SPAN_X), 0.05)
  }

  const onPointerDown = (e) => {
    if (!showTangent || e.button > 0) return
    dragRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setX0(xFromEvent(e))
    sfx.tap()
  }
  const onPointerMove = (e) => {
    if (dragRef.current) setX0(xFromEvent(e))
  }
  const endDrag = () => {
    dragRef.current = false
  }

  const onHandleKey = (e) => {
    const big = e.shiftKey ? 1 : 0.1
    const moves = { ArrowLeft: -big, ArrowDown: -big, ArrowRight: big, ArrowUp: big }
    if (moves[e.key] !== undefined) {
      e.preventDefault()
      setX0((x) => snap(clampX(x + moves[e.key]), 0.05))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setX0(VIEW.xmin)
    } else if (e.key === 'End') {
      e.preventDefault()
      setX0(VIEW.xmax)
    }
  }

  // ---- Grid --------------------------------------------------------------------------

  const gridX = []
  for (let x = VIEW.xmin; x <= VIEW.xmax; x++) gridX.push(x)
  const gridY = []
  for (let y = VIEW.ymin; y <= VIEW.ymax; y++) gridY.push(y)

  const tangentD = `M${sx(VIEW.xmin)} ${sy(y0 + m * (VIEW.xmin - x0))} L${sx(VIEW.xmax)} ${sy(y0 + m * (VIEW.xmax - x0))}`
  const showTriangle = showTangent && pointVisible && Math.abs(m) <= 8 && x0 + 1 <= VIEW.xmax

  return (
    <div className="fplot">
      <div className="w-toolbar">
        {(standalone || !fixed) && (
          <div className="w-pill-group fplot-presets" role="group" aria-label="Function family">
            {PRESET_NAMES.map((name) => (
              <button key={name} type="button" aria-pressed={name === preset} onClick={() => choosePreset(name)}>{PRESETS[name].label}</button>
            ))}
          </div>
        )}
        <span className="grow" />
        <button type="button" className={`btn btn-sm${showTangent ? ' fplot-on' : ''}`} aria-pressed={showTangent} onClick={() => { sfx.tap(); setShowTangent((v) => !v) }}>Tangent</button>
        {standalone && (
          <button type="button" className={`btn btn-sm${showSlope ? ' fplot-on' : ''}`} aria-pressed={showSlope} onClick={() => { sfx.tap(); setShowSlope((v) => !v) }}>Slope graph</button>
        )}
      </div>

      <div className="fplot-eq-row">
        <span className="fplot-form mono">{spec.form}</span>
        <output className="fplot-eq" aria-live="polite"><Equation text={formatEquation(preset, params)} /></output>
      </div>

      <div className="fplot-main">
        <div className="w-stage fplot-stage" ref={stageRef}>
          <svg
            ref={svgRef}
            className={`fplot-svg${showTangent ? ' can-drag' : ''}`}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Graph of ${formatEquation(preset, params)}${showTangent ? `, tangent at x = ${fmtNum(x0)} with slope ${fmtNum(m)}` : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <defs>
              <clipPath id={`${uid}-clip`}><rect x="0" y="0" width={W} height={H} /></clipPath>
            </defs>
            <g className="fplot-grid">
              {gridX.map((x) => <line key={`x${x}`} x1={sx(x)} x2={sx(x)} y1="0" y2={H} className={x === 0 ? 'axis' : x % 2 ? 'minor' : ''} />)}
              {gridY.map((y) => <line key={`y${y}`} y1={sy(y)} y2={sy(y)} x1="0" x2={W} className={y === 0 ? 'axis' : y % 2 ? 'minor' : ''} />)}
            </g>
            <g className="fplot-ticks" aria-hidden="true">
              {gridX.filter((x) => x % 2 === 0 && x !== 0 && x !== VIEW.xmin && x !== VIEW.xmax).map((x) => <text key={`tx${x}`} x={sx(x)} y={sy(0) + 14}>{fmtNum(x)}</text>)}
              {gridY.filter((y) => y % 2 === 0 && y !== 0 && y !== VIEW.ymin && y !== VIEW.ymax).map((y) => <text key={`ty${y}`} x={sx(0) - 6} y={sy(y) + 4} className="y">{fmtNum(y)}</text>)}
              <text x={W - 8} y={sy(0) - 6} className="axis-name">x</text>
              <text x={sx(0) + 8} y="14" className="axis-name start">y</text>
            </g>
            <g clipPath={`url(#${uid}-clip)`}>
              <path d={targetCurve} className={`fplot-target${matched ? ' matched' : ''}`} />
              {showSlope && <path d={slopeCurve} className="fplot-slope" />}
              <path d={curve} className="fplot-curve" />
              {showTangent && <path d={tangentD} className="fplot-tangent" />}
              {showTriangle && (
                <g className="fplot-triangle">
                  <path d={`M${sx(x0)} ${sy(y0)} H${sx(x0 + 1)} V${sy(y0 + m)}`} />
                  <text x={sx(x0 + 0.5)} y={sy(y0) + (m >= 0 ? 14 : -6)}>1</text>
                  <text x={sx(x0 + 1) + 5} y={sy(y0 + m / 2) + 4} className="start">{fmtNum(m)}</text>
                </g>
              )}
            </g>
            {showTangent && pointVisible && (
              <circle
                className="fplot-handle"
                cx={sx(x0)}
                cy={sy(y0)}
                r="8"
                role="slider"
                tabIndex={0}
                aria-label="Tangent point x"
                aria-valuemin={VIEW.xmin}
                aria-valuemax={VIEW.xmax}
                aria-valuenow={x0}
                aria-valuetext={`x = ${fmtNum(x0)}, slope ${fmtNum(m)}`}
                onKeyDown={onHandleKey}
              />
            )}
          </svg>
        </div>

        <div className="fplot-side">
          {spec.params.map((param) => (
            <label key={param.key} className="fplot-param">
              <span className="fplot-param-head">
                <strong className="mono">{param.name}</strong>
                <span className="xsmall subtle">{param.hint}</span>
                <output className="mono tabular">{fmtNum(params[param.key])}</output>
              </span>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={params[param.key]}
                onChange={(e) => setParam(param.key, e.target.value)}
                aria-label={`${param.name}, ${param.hint}`}
              />
            </label>
          ))}
          <button type="button" className="btn btn-sm btn-ghost fplot-reset" onClick={resetSliders}>Reset sliders</button>

          <div className={`fplot-meter ${heat.tone}`}>
            <div className="fplot-meter-head">
              <span><Target size={13} /> Match the dashed curve</span>
              <strong>{heat.label}</strong>
            </div>
            <div className="fplot-meter-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(closeness * 100)} aria-label="Closeness to the target">
              <span style={{ width: `${closeness * 100}%` }} />
            </div>
            {matched && <button type="button" className="btn btn-sm" onClick={newTarget}><Shuffle size={14} /> New target</button>}
          </div>
        </div>
      </div>

      <div className="w-readout">
        {showTangent && <div className="w-stat"><span>Point</span><strong>({fmtNum(x0)}, {fmtNum(y0)})</strong></div>}
        {showTangent && <div className="w-stat"><span>Slope there</span><strong>{fmtNum(m)}</strong></div>}
        {facts.map((f) => (
          <div key={f.label} className="w-stat fplot-fact"><span>{f.label}</span><strong>{f.value}</strong></div>
        ))}
        {combo > 0 && <div className="w-stat"><span>Matched</span><strong>{combo}</strong></div>}
      </div>

      {showTangent && (
        <p className="fplot-caption">
          The tangent line touches the curve at one point and has the same slope there. At x = {fmtNum(x0)} the curve {Math.abs(m) < 0.005 ? 'is flat for an instant (slope 0)' : m > 0 ? `rises ${fmtNum(m)} for every 1 step right` : `falls ${fmtNum(-m)} for every 1 step right`}. Drag the dot, or focus it and use the arrow keys.
        </p>
      )}

      <div className="w-legend">
        <span><i className="fplot-key curve" />Your curve</span>
        <span><i className="fplot-key target" />Target (dashed)</span>
        {showTangent && <span><i className="fplot-key tangent" />Tangent line</span>}
        {showSlope && <span><i className="fplot-key slope" />Slope graph f′(x)</span>}
      </div>

      <p className={`w-feedback ${message.tone}`} aria-live="polite">{message.text}</p>
    </div>
  )
}
