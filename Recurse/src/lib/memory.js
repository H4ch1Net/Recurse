// Thin wrapper around ts-fsrs. Cards are stored as plain JSON (dates as ISO strings)
// and revived here, so the rest of the app never touches the scheduler directly.
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'

export { Rating, State }

export const GRADES = [
  { rating: Rating.Again, label: 'Again', key: '1', hint: 'Forgot it' },
  { rating: Rating.Hard, label: 'Hard', key: '2', hint: 'Recalled with effort' },
  { rating: Rating.Good, label: 'Good', key: '3', hint: 'Recalled after a moment' },
  { rating: Rating.Easy, label: 'Easy', key: '4', hint: 'Instant recall' }
]

const schedulers = new Map()

function scheduler(retention = 0.9, fuzz = true) {
  const key = `${retention}:${fuzz}`
  if (!schedulers.has(key)) {
    schedulers.set(key, fsrs(generatorParameters({ request_retention: retention, enable_fuzz: fuzz, maximum_interval: 3650 })))
  }
  return schedulers.get(key)
}

export function newCard(now = new Date()) {
  return serializeCard(createEmptyCard(now))
}

export function reviveCard(card) {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined
  }
}

export function serializeCard(card) {
  const out = { ...card, due: new Date(card.due).toISOString() }
  if (card.last_review) out.last_review = new Date(card.last_review).toISOString()
  else delete out.last_review
  return out
}

/** Apply a grade and return the next stored card. */
export function schedule(card, rating, { retention = 0.9, now = new Date(), fuzz = true } = {}) {
  const result = scheduler(retention, fuzz).next(reviveCard(card || newCard(now)), now, rating)
  return serializeCard(result.card)
}

/** Next due date for each grade, for the labels on rating buttons. */
export function previewDue(card, { retention = 0.9, now = new Date() } = {}) {
  const preview = scheduler(retention, false).repeat(reviveCard(card || newCard(now)), now)
  const out = {}
  for (const { rating } of GRADES) out[rating] = preview[rating].card.due
  return out
}

/**
 * Probability of recall right now (0..1). Never-reviewed cards return 0.
 * Uses fractional days: ts-fsrs's get_retrievability floors to whole days, which would
 * report 100% for a full day after a miss.
 */
export function retrievability(card, now = new Date()) {
  if (!card || !card.last_review || !(card.reps > 0) || !(card.stability > 0)) return 0
  const elapsed = Math.max(0, (new Date(now) - new Date(card.last_review)) / 86400000)
  return Math.max(0, Math.min(1, scheduler().forgetting_curve(elapsed, card.stability)))
}

export function isDue(card, now = new Date()) {
  return Boolean(card && card.reps > 0 && new Date(card.due) <= now)
}

export function isLearning(card) {
  return card?.state === State.Learning || card?.state === State.Relearning
}

/** Cards with a stability of three weeks or more are considered mature, as in Anki. */
export function isMature(card) {
  return (card?.stability || 0) >= 21
}

export function stateLabel(card) {
  if (!card || !(card.reps > 0)) return 'New'
  if (card.state === State.Relearning) return 'Relearning'
  if (card.state === State.Learning) return 'Learning'
  return isMature(card) ? 'Mature' : 'Review'
}
