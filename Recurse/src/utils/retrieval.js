export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export function daysBetween(start, end = new Date()) {
  const startTime = new Date(start).getTime()
  const endTime = new Date(end).getTime()
  return Math.max(0, (endTime - startTime) / (1000 * 60 * 60 * 24))
}

export function calculateRetrievability(card, now = new Date()) {
  if (!card || !card.stability || !card.last_review) return 0
  const elapsed = daysBetween(card.last_review, now)
  const stability = Math.max(Number(card.stability) || 0.01, 0.01)
  const retrievability = 1 / (1 + elapsed / (9 * stability))
  return clamp(retrievability)
}

export function retrievabilityLabel(card, now = new Date()) {
  return `${Math.round(calculateRetrievability(card, now) * 100)}%`
}

export function retrievabilityTone(r) {
  if (r >= 0.8) return 'good'
  if (r >= 0.5) return 'warn'
  return 'bad'
}

export function averageRetrievability(cards = {}, now = new Date()) {
  const list = Object.values(cards)
  if (!list.length) return 0
  const studied = list.filter((card) => Number(card.reps) > 0 || card.last_review)
  if (!studied.length) return 0
  return studied.reduce((sum, card) => sum + calculateRetrievability(card, now), 0) / studied.length
}

export function getCardsDue(cards = {}, now = new Date()) {
  return Object.entries(cards)
    .filter(([, card]) => card?.due && new Date(card.due).getTime() <= now.getTime())
    .map(([questionId, card]) => ({ questionId, card }))
}

export function topicForgettingWarning(topic, avgR) {
  if (avgR < 0.5) return `⚠ ${topic} knowledge is fading — review soon`
  if (avgR < 0.7) return `⚠ ${topic} is starting to fade`
  return ''
}
