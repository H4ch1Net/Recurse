import { describe, expect, it } from 'vitest'
import { GATE_NAMES, builtXor, circuitTable, evalGate, expression, gradeTable, normalizeGates, truthTable, xorCircuit } from './logic-gates'

const outs = (name) => truthTable(name).map((r) => r.out)

describe('gates', () => {
  it('produce the standard truth tables (rows 00, 01, 10, 11)', () => {
    expect(outs('AND')).toEqual([0, 0, 0, 1])
    expect(outs('OR')).toEqual([0, 1, 1, 1])
    expect(outs('XOR')).toEqual([0, 1, 1, 0])
    expect(outs('NAND')).toEqual([1, 1, 1, 0])
    expect(outs('NOR')).toEqual([1, 0, 0, 0])
    expect(outs('NOT')).toEqual([1, 0])
  })

  it('NAND and NOR are the inverses of AND and OR', () => {
    for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      expect(evalGate('NAND', a, b)).toBe(1 - evalGate('AND', a, b))
      expect(evalGate('NOR', a, b)).toBe(1 - evalGate('OR', a, b))
    }
  })

  it('writes readable expressions', () => {
    expect(expression('AND', 1, 0)).toBe('1 AND 0 = 0')
    expect(expression('NOT', 1)).toBe('NOT 1 = 0')
  })

  it('normalizes gate lists from content', () => {
    expect(normalizeGates(['and', 'xor', 'bogus', 'AND'])).toEqual(['AND', 'XOR'])
    expect(normalizeGates(undefined)).toEqual(GATE_NAMES)
    expect(normalizeGates([])).toEqual(GATE_NAMES)
  })
})

describe('gradeTable', () => {
  it('marks each row', () => {
    expect(gradeTable('AND', [0, 0, 0, 1])).toEqual({ correct: [true, true, true, true], allRight: true, wrong: 0 })
    const g = gradeTable('OR', [0, 1, 0, null])
    expect(g.correct).toEqual([true, true, false, false])
    expect(g.allRight).toBe(false)
    expect(g.wrong).toBe(2)
  })
})

describe('build XOR', () => {
  it('only AND completes (A OR B) AND NOT (A AND B)', () => {
    expect(builtXor('AND')).toBe(true)
    expect(builtXor('OR')).toBe(false)
    expect(builtXor('NAND')).toBe(false)
    expect(builtXor('NOR')).toBe(false)
  })

  it('reports every wire', () => {
    expect(xorCircuit('AND', 1, 1)).toEqual({ a: 1, b: 1, or: 1, and: 1, not: 0, out: 0 })
    expect(xorCircuit(null, 1, 0).out).toBeNull()
  })

  it('shows which rows a wrong gate gets wrong', () => {
    expect(circuitTable('OR').map((r) => r.match)).toEqual([false, true, true, false])
  })
})
