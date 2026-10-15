// Logic gates, truth tables and the "build XOR" circuit for the logic-gates widget.
// Bits are the numbers 0 and 1.

export const GATES = {
  AND: { inputs: 2, fn: (a, b) => a & b, rule: 'AND outputs 1 only when both inputs are 1.' },
  OR: { inputs: 2, fn: (a, b) => a | b, rule: 'OR outputs 1 when at least one input is 1.' },
  NOT: { inputs: 1, fn: (a) => 1 - a, rule: 'NOT flips its input: 0 becomes 1 and 1 becomes 0.' },
  XOR: { inputs: 2, fn: (a, b) => a ^ b, rule: 'XOR outputs 1 when the inputs are different.' },
  NAND: { inputs: 2, fn: (a, b) => 1 - (a & b), rule: 'NAND is AND then NOT: it outputs 0 only when both inputs are 1.' },
  NOR: { inputs: 2, fn: (a, b) => 1 - (a | b), rule: 'NOR is OR then NOT: it outputs 1 only when both inputs are 0.' }
}

export const GATE_NAMES = Object.keys(GATES)

/** Valid, upper-cased gate names from content, or all of them. */
export function normalizeGates(list) {
  const valid = Array.isArray(list) ? list.map((g) => String(g).toUpperCase()).filter((g) => GATES[g]) : []
  return valid.length ? [...new Set(valid)] : GATE_NAMES
}

export function evalGate(name, a, b = 0) {
  const gate = GATES[name]
  if (!gate) throw new Error(`Unknown gate ${name}`)
  return gate.fn(a ? 1 : 0, b ? 1 : 0)
}

/** Rows in counting order: 00, 01, 10, 11 (or 0, 1 for NOT). */
export function truthTable(name) {
  if (GATES[name].inputs === 1) return [0, 1].map((a) => ({ a, out: evalGate(name, a) }))
  return [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1]
  ].map(([a, b]) => ({ a, b, out: evalGate(name, a, b) }))
}

/** answers: array of 0, 1 or null per row. Returns per-row correctness and whether all are right. */
export function gradeTable(name, answers) {
  const rows = truthTable(name)
  const correct = rows.map((row, k) => answers[k] === row.out)
  return { correct, allRight: correct.every(Boolean), wrong: correct.filter((c) => !c).length }
}

/** Plain expression for the current inputs, for example "1 AND 0 = 0". */
export function expression(name, a, b = 0) {
  const out = evalGate(name, a, b)
  if (GATES[name].inputs === 1) return `NOT ${a} = ${out}`
  return `${a} ${name} ${b} = ${out}`
}

// ---- Build XOR from AND, OR and NOT ------------------------------------------------
// (A OR B) and NOT (A AND B) feed a final gate the learner chooses.

export const XOR_OPTIONS = ['AND', 'OR', 'NAND', 'NOR']

/** Every wire value in the circuit, with `missing` as the final gate (or null if not chosen). */
export function xorCircuit(missing, a, b) {
  const or = a | b
  const and = a & b
  const not = 1 - and
  const out = missing ? evalGate(missing, or, not) : null
  return { a, b, or, and, not, out }
}

export function circuitTable(missing) {
  return truthTable('XOR').map(({ a, b, out: want }) => {
    const { out } = xorCircuit(missing, a, b)
    return { a, b, out, want, match: out === want }
  })
}

export const builtXor = (missing) => circuitTable(missing).every((row) => row.match)
