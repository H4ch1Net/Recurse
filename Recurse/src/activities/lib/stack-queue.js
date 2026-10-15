// Stack and queue helpers: the bracket-matching walkthrough and the queue serving check.

export const PAIRS = { '(': ')', '[': ']', '{': '}' }
export const OPENER_OF = { ')': '(', ']': '[', '}': '{' }

export const BRACKET_PUZZLES = ['( [ { } ] )', '{ ( ) [ ] }', '( [ ) ]', '( ( )']

export const isOpener = (ch) => Boolean(PAIRS[ch])
export const isCloser = (ch) => Boolean(OPENER_OF[ch])

/** The bracket characters of a string, ignoring everything else. */
export function tokenize(text) {
  return [...String(text)].filter((ch) => isOpener(ch) || isCloser(ch))
}

export function isBalanced(text) {
  const stack = []
  for (const ch of tokenize(text)) {
    if (isOpener(ch)) stack.push(ch)
    else if (stack.pop() !== OPENER_OF[ch]) return false
  }
  return stack.length === 0
}

/** The operation a stack-based checker uses for this character. */
export function expectedAction(ch) {
  return isOpener(ch) ? 'push' : 'pop'
}

export function startBrackets(text) {
  return { chars: tokenize(text), pos: 0, stack: [], status: 'running', reason: '' }
}

function settle(state) {
  if (state.status !== 'running' || state.pos < state.chars.length) return state
  if (state.stack.length === 0) return { ...state, status: 'balanced', reason: 'Every closer matched the most recent unmatched opener and the stack is empty.' }
  const top = state.stack[state.stack.length - 1]
  return { ...state, status: 'unbalanced', reason: `The string ended with ${top} still on the stack, so it was never closed.` }
}

/**
 * Apply the learner's choice ('push' or 'pop') to the current character.
 * Returns { state, ok, outcome, message }. ok is false when the choice was the wrong operation;
 * the state does not change then. outcome: 'pushed' | 'matched' | 'mismatch' | 'empty' | 'wrong'.
 */
export function bracketStep(state, action) {
  if (state.status !== 'running') return { state, ok: false, outcome: 'done', message: '' }
  const ch = state.chars[state.pos]
  const want = expectedAction(ch)
  if (action !== want) {
    const message = want === 'push'
      ? `${ch} is an opening bracket. Openers get pushed so a later closer can match them.`
      : `${ch} is a closing bracket. Closers pop the top of the stack to see if it matches.`
    return { state, ok: false, outcome: 'wrong', message }
  }
  if (want === 'push') {
    const next = settle({ ...state, stack: [...state.stack, ch], pos: state.pos + 1 })
    return { state: next, ok: true, outcome: 'pushed', message: `Push ${ch}. It waits on the stack for its ${PAIRS[ch]}.` }
  }
  if (state.stack.length === 0) {
    const next = { ...state, pos: state.pos + 1, status: 'unbalanced', reason: `${ch} has nothing to match: the stack is empty.` }
    return { state: next, ok: true, outcome: 'empty', message: `Pop for ${ch}, but the stack is empty.` }
  }
  const top = state.stack[state.stack.length - 1]
  if (top !== OPENER_OF[ch]) {
    const next = { ...state, stack: state.stack.slice(0, -1), pos: state.pos + 1, status: 'unbalanced', reason: `${ch} does not match ${top}, the most recent opener.` }
    return { state: next, ok: true, outcome: 'mismatch', message: `Pop ${top} for ${ch}: they do not match.` }
  }
  const next = settle({ ...state, stack: state.stack.slice(0, -1), pos: state.pos + 1 })
  return { state: next, ok: true, outcome: 'matched', message: `Pop ${top}: it matches ${ch}.` }
}

/** True when `served` contains `order` as a consecutive run (for example A, B, C). */
export function servedInOrder(served, order) {
  if (!order.length) return true
  for (let k = 0; k + order.length <= served.length; k++) {
    if (order.every((v, j) => served[k + j] === v)) return true
  }
  return false
}

