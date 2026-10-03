import { retrievability, isDue, isMature, isLearning } from './memory'

export const LEECH_LAPSES = 4

export function emptyTopic() {
  return { cards: {}, mistakes: {}, lessonRead: false, checks: {}, feynman: [], lastStudied: null }
}

export function topicOf(progress, id) {
  return { ...emptyTopic(), ...(progress?.[id] || {}) }
}

export const MATURE_DAYS = 21

/**
 * How well one card is learned (0..1): memory stability on a log scale, where three weeks
 * counts as fully learned. 1 day ≈ 0.22, 1 week ≈ 0.67. Each lapse costs 10%, down to half.
 */
export function cardMastery(card) {
  if (!card || !(card.reps > 0)) return 0
  const stability = Math.log1p(Math.max(0, card.stability || 0)) / Math.log1p(MATURE_DAYS)
  const penalty = Math.max(0.5, 1 - 0.1 * (card.lapses || 0))
  return Math.min(1, stability) * penalty
}

/** Topic mastery (0..100): the average card mastery across every question, new ones count as 0. */
export function topicMastery(cards, questionCount) {
  if (!questionCount) return 0
  const total = Object.values(cards || {}).reduce((sum, card) => sum + cardMastery(card), 0)
  return Math.round((Math.min(total, questionCount) / questionCount) * 100)
}

export function averageMemory(cards, now = new Date()) {
  const studied = cards.filter((c) => c.reps > 0)
  if (!studied.length) return null
  return studied.reduce((sum, c) => sum + retrievability(c, now), 0) / studied.length
}

export function memoryTone(value) {
  if (value === null || value === undefined) return 'none'
  if (value >= 0.85) return 'strong'
  if (value >= 0.7) return 'steady'
  if (value >= 0.5) return 'fading'
  return 'weak'
}

export const MEMORY_TONE_LABELS = { strong: 'Strong', steady: 'Steady', fading: 'Fading', weak: 'Weak', none: 'Not started' }

/** Everything the UI needs to know about one topic, derived from its progress. */
export function summarizeTopic(pack, topic, now = new Date()) {
  const questionIds = new Set(pack.questions.map((q) => q.id))
  const cards = Object.entries(topic.cards || {}).filter(([id, card]) => questionIds.has(id) && card.reps > 0)
  const list = cards.map(([, card]) => card)
  const dueCount = list.filter((c) => isDue(c, now)).length
  const memory = averageMemory(list, now)
  const mastery = topicMastery(Object.fromEntries(cards), pack.questions.length)
  const nextDue = list.reduce((min, c) => (!min || new Date(c.due) < min ? new Date(c.due) : min), null)
  const sections = pack.lesson?.sections?.length || 0
  const checksDone = Object.keys(topic.checks || {}).filter((k) => Number(k) < sections).length
  const mistakes = Object.keys(topic.mistakes || {}).filter((id) => questionIds.has(id)).length
  let status = 'new'
  if (list.length) {
    if (mastery >= 90 && (memory ?? 0) >= 0.85) status = 'mastered'
    else if ((memory ?? 0) < 0.7) status = 'fading'
    else status = 'learning'
  }
  return {
    id: pack.id,
    studied: list.length,
    total: pack.questions.length,
    newCount: pack.questions.length - list.length,
    dueCount,
    learningCount: list.filter(isLearning).length,
    matureCount: list.filter(isMature).length,
    leechCount: list.filter((c) => (c.lapses || 0) >= LEECH_LAPSES).length,
    lapses: list.reduce((sum, c) => sum + (c.lapses || 0), 0),
    memory,
    mastery,
    nextDue,
    status,
    started: list.length > 0 || topic.lessonRead,
    lessonRead: Boolean(topic.lessonRead),
    sections,
    checksDone,
    mistakes,
    lastStudied: topic.lastStudied
  }
}

/** Reviews falling due on each of the next `days` days. Day 0 includes everything overdue. */
export function reviewForecast(packs, progress, days = 14, now = new Date()) {
  const counts = Array.from({ length: days }, () => 0)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  for (const pack of packs) {
    const ids = new Set(pack.questions.map((q) => q.id))
    for (const [id, card] of Object.entries(progress[pack.id]?.cards || {})) {
      if (!ids.has(id) || !(card.reps > 0)) continue
      const offset = Math.floor((new Date(card.due) - start) / 86400000)
      if (offset < days) counts[Math.max(0, offset)]++
    }
  }
  return counts
}
