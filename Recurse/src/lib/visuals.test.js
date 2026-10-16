import { describe, expect, it } from 'vitest'
import { VISUAL_FIXTURES } from '../components/visuals/fixtures'
import { VISUAL_TYPES, bodyText, checkSectionVisuals, checkVisual, isIpv4, splitBody, visualList } from './visuals'

const errorsOf = (spec) => {
  const errors = []
  checkVisual('v', spec, errors)
  return errors
}

describe('splitBody', () => {
  it('keeps text without markers as one run', () => {
    expect(splitBody('One.\n\nTwo.')).toEqual([{ kind: 'text', text: 'One.\n\nTwo.' }])
  })
  it('splits around visual and code markers', () => {
    expect(splitBody('Intro.\n\n[[visual]]\n\nMiddle.\n\n[[visual 2]]\n\n[[code]]\n\nEnd.')).toEqual([
      { kind: 'text', text: 'Intro.' },
      { kind: 'visual', index: 0 },
      { kind: 'text', text: 'Middle.' },
      { kind: 'visual', index: 1 },
      { kind: 'code' },
      { kind: 'text', text: 'End.' }
    ])
  })
  it('only treats a whole paragraph as a marker', () => {
    expect(splitBody('See [[visual]] below.')).toEqual([{ kind: 'text', text: 'See [[visual]] below.' }])
  })
  it('strips markers for plain text', () => {
    expect(bodyText('A.\n\n[[visual]]\n\nB.')).toBe('A.\n\nB.')
  })
})

describe('checkVisual', () => {
  it('accepts every fixture without errors', () => {
    for (const f of VISUAL_FIXTURES) expect(errorsOf(f.spec), f.name).toEqual([])
  })
  it('has a fixture for every type', () => {
    const covered = new Set(VISUAL_FIXTURES.map((f) => f.spec.type))
    for (const type of VISUAL_TYPES) expect(covered.has(type), type).toBe(true)
  })
  it('rejects unknown types and bad shapes', () => {
    expect(errorsOf({ type: 'pie' })[0]).toMatch(/unknown visual type/)
    expect(errorsOf({ type: 'table', columns: ['A', 'B'], rows: [['1']] }).join()).toMatch(/needs 2 text cells/)
    expect(errorsOf({ type: 'bits', rows: [{ label: 'x', value: '300.1.1.1' }] }).join()).toMatch(/dotted IPv4/)
    expect(errorsOf({ type: 'fields', unit: 'bits', width: 32, rows: [[{ label: 'a', size: 8 }]] }).join()).toMatch(/add up to 8/)
    expect(errorsOf({ type: 'sequence', actors: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], messages: [{ from: 'a', to: 'c', label: 'x' }] }).join()).toMatch(/actor ids/)
    expect(errorsOf({ type: 'topology', nodes: [{ id: 'a', kind: 'router', label: 'A', x: 0, y: 0 }, { id: 'b', kind: 'pc', label: 'B', x: 0, y: 0 }] }).join()).toMatch(/share cell/)
  })
  it('knows a dotted IPv4 value', () => {
    expect(isIpv4('10.0.0.255')).toBe(true)
    expect(isIpv4('10.0.0.256')).toBe(false)
    expect(isIpv4('10.0.0')).toBe(false)
  })
})

describe('checkSectionVisuals', () => {
  const table = { type: 'table', columns: ['A', 'B'], rows: [['1', '2']] }
  it('accepts one visual or a list', () => {
    expect(visualList({ visual: table })).toHaveLength(1)
    expect(visualList({ visual: [table, table] })).toHaveLength(2)
    expect(visualList({})).toEqual([])
  })
  it('catches markers without a visual or code', () => {
    const errors = []
    checkSectionVisuals('s', { body: 'A\n\n[[visual 2]]\n\n[[code]]', visual: table }, errors)
    expect(errors.join()).toMatch(/visual 2\]\] has no matching visual/)
    expect(errors.join()).toMatch(/no code/)
  })
  it('catches a visual placed twice', () => {
    const errors = []
    checkSectionVisuals('s', { body: '[[visual]]\n\n[[visual]]', visual: table }, errors)
    expect(errors.join()).toMatch(/placed twice/)
  })
})
