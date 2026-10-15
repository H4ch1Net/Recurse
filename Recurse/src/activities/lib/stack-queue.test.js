import { describe, expect, it } from 'vitest'
import { BRACKET_PUZZLES, bracketStep, expectedAction, isBalanced, servedInOrder, startBrackets, tokenize } from './stack-queue'

function walk(text) {
  let state = startBrackets(text)
  while (state.status === 'running') state = bracketStep(state, expectedAction(state.chars[state.pos])).state
  return state
}

describe('stack-queue', () => {
  it('tokenizes and checks balance', () => {
    expect(tokenize('( [ { } ] )')).toEqual(['(', '[', '{', '}', ']', ')'])
    expect(isBalanced('( [ { } ] )')).toBe(true)
    expect(isBalanced('{ ( ) [ ] }')).toBe(true)
    expect(isBalanced('( [ ) ]')).toBe(false)
    expect(isBalanced('( ( )')).toBe(false)
    expect(isBalanced(')')).toBe(false)
  })

  it('walks a balanced string to an empty stack', () => {
    const end = walk('( [ { } ] )')
    expect(end.status).toBe('balanced')
    expect(end.stack).toEqual([])
  })

  it('agrees with isBalanced on every puzzle', () => {
    for (const p of BRACKET_PUZZLES) expect(walk(p).status === 'balanced').toBe(isBalanced(p))
  })

  it('explains mismatches, leftovers and empty pops', () => {
    expect(walk('( [ ) ]').reason).toMatch(/does not match \[/)
    expect(walk('( ( )').reason).toMatch(/never closed/)
    expect(walk(') (').reason).toMatch(/stack is empty/)
  })

  it('rejects the wrong operation without changing the state', () => {
    const start = startBrackets('( )')
    const r = bracketStep(start, 'pop')
    expect(r.ok).toBe(false)
    expect(r.state).toBe(start)
    const pushed = bracketStep(start, 'push')
    expect(pushed.ok).toBe(true)
    expect(bracketStep(pushed.state, 'push').ok).toBe(false)
  })

  it('checks serving order', () => {
    expect(servedInOrder(['A', 'B', 'C'], ['A', 'B', 'C'])).toBe(true)
    expect(servedInOrder(['X', 'A', 'B', 'C'], ['A', 'B', 'C'])).toBe(true)
    expect(servedInOrder(['C', 'B', 'A'], ['A', 'B', 'C'])).toBe(false)
    expect(servedInOrder(['A', 'C', 'B'], ['A', 'B', 'C'])).toBe(false)
  })
})
