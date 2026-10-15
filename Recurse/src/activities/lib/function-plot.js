// Fixed function families for the function-plot widget. No expression parsing and no eval:
// every preset is a plain JavaScript formula with sliders for its parameters.

export const VIEW = { xmin: -8, xmax: 8, ymin: -6, ymax: 6 }

export const PRESETS = {
  linear: {
    label: 'Linear',
    form: 'y = a·x + b',
    params: [
      { key: 'a', name: 'a', hint: 'slope', min: -3, max: 3, step: 0.5, value: 1 },
      { key: 'b', name: 'b', hint: 'intercept', min: -5, max: 5, step: 0.5, value: 0 }
    ],
    f: (x, p) => p.a * x + p.b,
    df: (x, p) => p.a,
    target: { a: -0.5, b: 2 }
  },
  quadratic: {
    label: 'Quadratic',
    form: 'y = a·x² + b·x + c',
    params: [
      { key: 'a', name: 'a', hint: 'width and direction', min: -2, max: 2, step: 0.25, value: 1 },
      { key: 'b', name: 'b', hint: 'shifts the vertex', min: -4, max: 4, step: 0.5, value: 0 },
      { key: 'c', name: 'c', hint: 'y-intercept', min: -5, max: 5, step: 0.5, value: 0 }
    ],
    f: (x, p) => p.a * x * x + p.b * x + p.c,
    df: (x, p) => 2 * p.a * x + p.b,
    target: { a: -0.5, b: 1, c: 3 }
  },
  exponential: {
    label: 'Exponential',
    form: 'y = a·bˣ',
    params: [
      { key: 'a', name: 'a', hint: 'starting value', min: -3, max: 3, step: 0.25, value: 1 },
      { key: 'b', name: 'b', hint: 'growth factor', min: 0.2, max: 3, step: 0.1, value: 2 }
    ],
    f: (x, p) => p.a * p.b ** x,
    df: (x, p) => p.a * p.b ** x * Math.log(p.b),
    target: { a: 0.5, b: 1.5 }
  },
  sine: {
    label: 'Sine',
    form: 'y = a·sin(b·x + c)',
    params: [
      { key: 'a', name: 'a', hint: 'amplitude', min: -3, max: 3, step: 0.25, value: 1 },
      { key: 'b', name: 'b', hint: 'frequency', min: 0.25, max: 3, step: 0.25, value: 1 },
      { key: 'c', name: 'c', hint: 'phase', min: -3.2, max: 3.2, step: 0.1, value: 0 }
    ],
    f: (x, p) => p.a * Math.sin(p.b * x + p.c),
    df: (x, p) => p.a * p.b * Math.cos(p.b * x + p.c),
    target: { a: 2, b: 0.5, c: 1 }
  }
}

export const PRESET_NAMES = Object.keys(PRESETS)

const decimals = (step) => (String(step).split('.')[1] || '').length

/** Rounds a slider value to its step so 0.1 + 0.2 shows as 0.3. */
export function snap(value, step) {
  return Number((Math.round(value / step) * step).toFixed(decimals(step)))
}

export function defaults(preset) {
  return Object.fromEntries(PRESETS[preset].params.map((p) => [p.key, p.value]))
}

/** Short number: at most two decimals, trailing zeros trimmed, real minus sign. */
export function fmtNum(v) {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞'
  const r = Math.round(v * 100) / 100
  const s = String(Math.abs(r))
  return r < 0 ? `−${s}` : s
}

function terms(list) {
  let out = ''
  for (const [coef, body] of list) {
    if (coef === 0) continue
    const first = out === ''
    const sign = coef < 0 ? (first ? '−' : ' − ') : first ? '' : ' + '
    const mag = Math.abs(coef)
    out += sign + (body && mag === 1 ? '' : fmtNum(mag)) + body
  }
  return out || '0'
}

/** The equation with numbers filled in. Exponents are written with ^ (the widget raises them). */
export function formatEquation(preset, p) {
  if (preset === 'linear') return `y = ${terms([[p.a, 'x'], [p.b, '']])}`
  if (preset === 'quadratic') return `y = ${terms([[p.a, 'x²'], [p.b, 'x'], [p.c, '']])}`
  if (preset === 'exponential') {
    if (p.a === 0) return 'y = 0'
    const lead = p.a === 1 ? '' : p.a === -1 ? '−' : `${fmtNum(p.a)} · `
    return `y = ${lead}${fmtNum(p.b)}^x`
  }
  if (p.a === 0) return 'y = 0'
  const lead = p.a === 1 ? '' : p.a === -1 ? '−' : `${fmtNum(p.a)} `
  const inner = terms([[p.b, 'x'], [p.c, '']])
  return `y = ${lead}sin(${inner})`
}

/** Plain-language facts about the current curve. */
export function features(preset, p) {
  if (preset === 'linear') {
    const xInt = p.a !== 0 ? fmtNum(-p.b / p.a) : p.b === 0 ? 'every x' : 'none'
    return [
      { label: 'Slope', value: `${fmtNum(p.a)} (y changes by ${fmtNum(p.a)} per step right)` },
      { label: 'y-intercept', value: fmtNum(p.b) },
      { label: 'x-intercept', value: xInt }
    ]
  }
  if (preset === 'quadratic') {
    if (p.a === 0) return [{ label: 'Shape', value: 'a straight line, because a = 0' }, { label: 'y-intercept', value: fmtNum(p.c) }]
    const vx = -p.b / (2 * p.a)
    const vy = PRESETS.quadratic.f(vx, p)
    const disc = p.b * p.b - 4 * p.a * p.c
    let roots
    if (disc < -1e-12) roots = 'none (the curve never crosses y = 0)'
    else if (Math.abs(disc) <= 1e-12) roots = `one, at x = ${fmtNum(vx)}`
    else {
      const r1 = (-p.b - Math.sqrt(disc)) / (2 * p.a)
      const r2 = (-p.b + Math.sqrt(disc)) / (2 * p.a)
      roots = `x = ${fmtNum(Math.min(r1, r2))} and x = ${fmtNum(Math.max(r1, r2))}`
    }
    return [
      { label: 'Opens', value: p.a > 0 ? 'upward (a > 0)' : 'downward (a < 0)' },
      { label: 'Vertex', value: `(${fmtNum(vx)}, ${fmtNum(vy)})` },
      { label: 'Roots', value: roots }
    ]
  }
  if (preset === 'exponential') {
    const behavior = p.b > 1 ? `grows: each step right multiplies y by ${fmtNum(p.b)}` : p.b < 1 ? `decays: each step right multiplies y by ${fmtNum(p.b)}` : 'flat: b = 1 never changes y'
    return [
      { label: 'Value at x = 0', value: fmtNum(p.a) },
      { label: 'Behavior', value: p.a === 0 ? 'flat at 0, because a = 0' : behavior }
    ]
  }
  return [
    { label: 'Amplitude', value: fmtNum(Math.abs(p.a)) },
    { label: 'Period', value: `2π / ${fmtNum(p.b)} = ${fmtNum((2 * Math.PI) / p.b)}` },
    { label: 'Phase shift', value: fmtNum(-p.c / p.b) }
  ]
}

const clampY = (y) => Math.max(-12, Math.min(12, y))

/** Root-mean-square gap between two curves of the same family across the view. */
export function curveDistance(preset, p, q, view = VIEW) {
  const f = PRESETS[preset].f
  let sum = 0
  let n = 0
  for (let x = view.xmin; x <= view.xmax + 1e-9; x += 0.25) {
    const d = clampY(f(x, p)) - clampY(f(x, q))
    sum += d * d
    n++
  }
  return Math.sqrt(sum / n)
}

export const MATCH_TOLERANCE = 0.2
export const isMatch = (preset, p, q) => curveDistance(preset, p, q) < MATCH_TOLERANCE

/** A target on the slider grid that is mostly on screen and not already matched. */
export function randomTarget(preset, rng = Math.random, avoid = null) {
  const spec = PRESETS[preset]
  for (let attempt = 0; attempt < 200; attempt++) {
    const p = {}
    for (const param of spec.params) {
      const steps = Math.round((param.max - param.min) / param.step)
      p[param.key] = snap(param.min + Math.floor(rng() * (steps + 1)) * param.step, param.step)
    }
    if (p.a === 0) continue
    if (preset === 'exponential' && Math.abs(p.b - 1) < 0.15) continue
    let visible = 0
    let total = 0
    for (let x = VIEW.xmin; x <= VIEW.xmax; x += 0.5) {
      const y = spec.f(x, p)
      if (y > VIEW.ymin && y < VIEW.ymax) visible++
      total++
    }
    if (visible / total < 0.45) continue
    if (avoid && curveDistance(preset, p, avoid) < 1) continue
    return p
  }
  return { ...spec.target }
}

/** SVG path for the curve (or its slope, with which = 'df') in a width x height box showing the view. */
export function curvePath(preset, p, width, height, view = VIEW, samples = 240, which = 'f') {
  const f = which === 'df' ? PRESETS[preset].df : PRESETS[preset].f
  const span = view.ymax - view.ymin
  const parts = []
  for (let k = 0; k <= samples; k++) {
    const x = view.xmin + ((view.xmax - view.xmin) * k) / samples
    const y = Math.max(view.ymin - span * 3, Math.min(view.ymax + span * 3, f(x, p)))
    const sx = ((x - view.xmin) / (view.xmax - view.xmin)) * width
    const sy = ((view.ymax - y) / span) * height
    parts.push(`${k ? 'L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`)
  }
  return parts.join(' ')
}
