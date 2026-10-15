import { describe, expect, it } from 'vitest'
import { PRESETS, PRESET_NAMES, curveDistance, curvePath, defaults, features, fmtNum, formatEquation, isMatch, randomTarget, snap } from './function-plot'

const seeded = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647)

describe('formulas', () => {
  it('evaluate the fixed families', () => {
    expect(PRESETS.linear.f(2, { a: 3, b: -1 })).toBe(5)
    expect(PRESETS.quadratic.f(-1, { a: 1, b: 2, c: 3 })).toBe(2)
    expect(PRESETS.exponential.f(3, { a: 2, b: 2 })).toBe(16)
    expect(PRESETS.sine.f(Math.PI / 2, { a: 2, b: 1, c: 0 })).toBeCloseTo(2)
  })

  it('derivatives agree with a numeric slope', () => {
    const samples = {
      linear: { a: -1.5, b: 2 },
      quadratic: { a: 0.75, b: -2, c: 1 },
      exponential: { a: 1.5, b: 1.7 },
      sine: { a: 2, b: 1.5, c: 0.4 }
    }
    for (const name of PRESET_NAMES) {
      const { f, df } = PRESETS[name]
      for (const x of [-3, -0.5, 0, 1.25, 4]) {
        const h = 1e-5
        const numeric = (f(x + h, samples[name]) - f(x - h, samples[name])) / (2 * h)
        expect(df(x, samples[name])).toBeCloseTo(numeric, 4)
      }
    }
  })
})

describe('formatEquation', () => {
  it('writes clean equations', () => {
    expect(formatEquation('linear', { a: 2, b: -1 })).toBe('y = 2x − 1')
    expect(formatEquation('linear', { a: -1, b: 0 })).toBe('y = −x')
    expect(formatEquation('linear', { a: 0, b: 0 })).toBe('y = 0')
    expect(formatEquation('quadratic', { a: -0.5, b: 1, c: 3 })).toBe('y = −0.5x² + x + 3')
    expect(formatEquation('exponential', { a: 0.5, b: 1.5 })).toBe('y = 0.5 · 1.5^x')
    expect(formatEquation('exponential', { a: 1, b: 2 })).toBe('y = 2^x')
    expect(formatEquation('sine', { a: 2, b: 0.5, c: 1 })).toBe('y = 2 sin(0.5x + 1)')
    expect(formatEquation('sine', { a: -1, b: 1, c: -0.3 })).toBe('y = −sin(x − 0.3)')
  })

  it('formats numbers', () => {
    expect(fmtNum(1.005)).toBe('1')
    expect(fmtNum(-2.5)).toBe('−2.5')
    expect(fmtNum(0.333333)).toBe('0.33')
  })
})

describe('features', () => {
  it('finds intercepts, vertices and roots', () => {
    expect(features('linear', { a: 2, b: -4 }).find((f) => f.label === 'x-intercept').value).toBe('2')
    const q = features('quadratic', { a: 1, b: -2, c: -3 })
    expect(q.find((f) => f.label === 'Vertex').value).toBe('(1, −4)')
    expect(q.find((f) => f.label === 'Roots').value).toBe('x = −1 and x = 3')
    expect(features('quadratic', { a: 1, b: 0, c: 1 }).find((f) => f.label === 'Roots').value).toMatch(/none/)
    expect(features('sine', { a: -2, b: 2, c: 1 }).find((f) => f.label === 'Amplitude').value).toBe('2')
    expect(features('sine', { a: 1, b: 2, c: 1 }).find((f) => f.label === 'Phase shift').value).toBe('−0.5')
    expect(features('exponential', { a: 1, b: 0.5 })[1].value).toMatch(/decays/)
  })
})

describe('matching', () => {
  it('matches identical curves and rejects one slider step off', () => {
    expect(isMatch('linear', { a: 1, b: 0 }, { a: 1, b: 0 })).toBe(true)
    expect(isMatch('linear', { a: 1, b: 0 }, { a: 1, b: 0.5 })).toBe(false)
    expect(isMatch('quadratic', { a: 0.5, b: 1, c: 0 }, { a: 0.75, b: 1, c: 0 })).toBe(false)
    expect(isMatch('sine', { a: 2, b: 1, c: 0 }, { a: 2, b: 1.25, c: 0 })).toBe(false)
  })

  it('accepts a different but identical-looking sine', () => {
    // a sin(x) equals -a sin(x + pi); pi is about 3.1 on the slider.
    expect(isMatch('sine', { a: 2, b: 1, c: 0 }, { a: -2, b: 1, c: 3.1 })).toBe(true)
  })

  it('random targets sit on the slider grid, are visible and differ from the start', () => {
    const rng = seeded(11)
    for (const name of PRESET_NAMES) {
      for (let k = 0; k < 20; k++) {
        const start = defaults(name)
        const t = randomTarget(name, rng, start)
        for (const param of PRESETS[name].params) {
          expect(t[param.key]).toBeGreaterThanOrEqual(param.min - 1e-9)
          expect(t[param.key]).toBeLessThanOrEqual(param.max + 1e-9)
          expect(snap(t[param.key], param.step)).toBe(t[param.key])
        }
        expect(curveDistance(name, t, start)).toBeGreaterThan(0.2)
      }
    }
  })

  it('the built-in first targets are not already matched by the defaults', () => {
    for (const name of PRESET_NAMES) expect(isMatch(name, defaults(name), PRESETS[name].target)).toBe(false)
  })
})

describe('helpers', () => {
  it('snaps to the step', () => {
    expect(snap(0.1 + 0.2, 0.1)).toBe(0.3)
    expect(snap(1.13, 0.25)).toBe(1.25)
  })

  it('builds a path with one point per sample', () => {
    const d = curvePath('linear', { a: 1, b: 0 }, 480, 360, undefined, 10)
    expect(d.startsWith('M0.0 ')).toBe(true)
    expect(d.split('L')).toHaveLength(11)
  })
})
