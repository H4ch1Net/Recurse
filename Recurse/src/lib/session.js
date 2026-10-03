// Builds study queues. This is where "what should I study now" is decided:
// overdue cards first (most forgotten first), then new material in teaching order.
import { retrievability, isDue } from './memory'
import { isChoiceType } from './packSchema'
import { teachingOrder } from './packs'
import { createRandom, shuffle } from './random'
import { dayKey } from './dates'

export const SESSION_KINDS = {
  review: 'Daily review',
  topic: 'Study',
  practice: 'Practice',
  mistakes: 'Mistake review'
}

export const MAX_RETRIES = 2

function makeItem(pack, question, card, random, isNew) {
  const item = {
    key: `${pack.id}:${question.id}`,
    packId: pack.id,
    questionId: question.id,
    isNew,
    retry: 0
  }
  if (isChoiceType(question.type)) item.order = shuffle(question.choices.map((_, i) => i), random)
  return item
}

function existingCards(pack, topic) {
  const out = []
  for (const question of pack.questions) {
    const card = topic?.cards?.[question.id]
    if (card && card.reps > 0) out.push({ question, card })
  }
  return out
}

/** Round-robin across topics so consecutive cards come from different packs (interleaving). */
export function interleave(items) {
  const groups = new Map()
  for (const item of items) {
    if (!groups.has(item.packId)) groups.set(item.packId, [])
    groups.get(item.packId).push(item)
  }
  const queues = [...groups.values()]
  const out = []
  while (out.length < items.length) {
    for (const queue of queues) if (queue.length) out.push(queue.shift())
  }
  return out
}

/** Spread new cards evenly through a list of reviews. */
function mixIn(reviews, fresh) {
  if (!reviews.length) return fresh
  if (!fresh.length) return reviews
  const out = []
  const step = (reviews.length + fresh.length) / fresh.length
  let next = step / 2
  let r = 0
  let f = 0
  for (let i = 0; i < reviews.length + fresh.length; i++) {
    if (f < fresh.length && (i >= next || r >= reviews.length)) {
      out.push(fresh[f++])
      next += step
    } else {
      out.push(reviews[r++])
    }
  }
  return out
}

export function newCardsRemaining(settings, stats, now = new Date()) {
  const usedToday = stats?.days?.[dayKey(now)]?.newCards || 0
  return Math.max(0, (settings?.newPerDay ?? 15) - usedToday)
}

/**
 * Build a session.
 * kind: 'review' (all due cards plus a few new ones), 'topic' (one pack), 'practice'
 * (shuffled cram of one pack, ignores the schedule), 'mistakes' (unresolved misses).
 * Returns { kind, topicId, title, items, ahead } where ahead marks a review-ahead session.
 */
export function buildSession({ kind, topicId, packs, progress, settings = {}, stats = {}, now = new Date(), seed = Date.now() }) {
  const random = createRandom(seed)
  const size = Math.max(1, settings.sessionSize ?? 12)
  const packList = topicId ? packs.filter((p) => p.id === topicId) : packs
  const result = { kind, topicId: topicId || null, title: SESSION_KINDS[kind] || 'Study', items: [], ahead: false }

  if (kind === 'mistakes') {
    const entries = []
    for (const pack of packList) {
      const byId = new Map(pack.questions.map((q) => [q.id, q]))
      for (const [qid, entry] of Object.entries(progress[pack.id]?.mistakes || {})) {
        const question = byId.get(qid)
        if (question) entries.push({ pack, question, date: entry.date })
      }
    }
    entries.sort((a, b) => new Date(b.date) - new Date(a.date))
    result.items = interleave(entries.slice(0, size).map(({ pack, question }) => makeItem(pack, question, progress[pack.id]?.cards?.[question.id], random, false)))
    return result
  }

  if (kind === 'practice') {
    const pack = packList[0]
    if (!pack) return result
    const topic = progress[pack.id]
    result.items = shuffle(pack.questions, random)
      .slice(0, size)
      .map((q) => makeItem(pack, q, topic?.cards?.[q.id], random, !(topic?.cards?.[q.id]?.reps > 0)))
    return result
  }

  // Due reviews, most forgotten first.
  const due = []
  for (const pack of packList) {
    for (const { question, card } of existingCards(pack, progress[pack.id])) {
      if (isDue(card, now)) due.push({ pack, question, card, r: retrievability(card, now) })
    }
  }
  due.sort((a, b) => a.r - b.r)
  let reviews = due.slice(0, size).map(({ pack, question, card }) => makeItem(pack, question, card, random, false))
  if (kind === 'review') reviews = interleave(reviews)

  // New cards in teaching order. The daily limit applies to the mixed daily review;
  // choosing a topic explicitly lets you keep learning it.
  const room = size - reviews.length
  const newLimit = kind === 'review' ? Math.min(room, newCardsRemaining(settings, stats, now)) : room
  const fresh = []
  if (newLimit > 0) {
    const sources = kind === 'review'
      ? packList
          .filter((pack) => {
            const topic = progress[pack.id]
            return topic?.lessonRead || existingCards(pack, topic).length > 0
          })
          .sort((a, b) => new Date(progress[b.id]?.lastStudied || 0) - new Date(progress[a.id]?.lastStudied || 0))
      : packList
    for (const pack of sources) {
      const topic = progress[pack.id]
      for (const question of teachingOrder(pack)) {
        if (fresh.length >= newLimit) break
        if (!(topic?.cards?.[question.id]?.reps > 0)) fresh.push(makeItem(pack, question, null, random, true))
      }
      if (fresh.length >= newLimit) break
    }
  }
  result.items = mixIn(reviews, fresh)

  // Nothing scheduled: offer to review ahead, weakest memories first.
  if (!result.items.length && kind === 'topic') {
    const ahead = existingCards(packList[0] || { questions: [] }, progress[topicId])
      .map(({ question, card }) => ({ question, card, r: retrievability(card, now) }))
      .sort((a, b) => a.r - b.r)
      .slice(0, size)
    result.items = ahead.map(({ question, card }) => makeItem(packList[0], question, card, random, false))
    result.ahead = result.items.length > 0
  }
  return result
}

/** Requeue a missed card a few positions later so it is retried before the session ends. */
export function requeue(items, index, gap = 3) {
  const item = items[index]
  if (!item || item.retry >= MAX_RETRIES) return items
  const copy = [...items]
  const position = Math.min(copy.length, index + 1 + gap)
  copy.splice(position, 0, { ...item, retry: item.retry + 1, isNew: false })
  return copy
}

/** Summary counts for the session launcher without building a full queue. */
export function dueSummary(packs, progress, settings, stats, now = new Date()) {
  let due = 0
  let nextDue = null
  for (const pack of packs) {
    for (const { card } of existingCards(pack, progress[pack.id])) {
      if (isDue(card, now)) due++
      else if (!nextDue || new Date(card.due) < nextDue) nextDue = new Date(card.due)
    }
  }
  const started = packs.filter((pack) => progress[pack.id]?.lessonRead || existingCards(pack, progress[pack.id]).length)
  const newAvailable = started.reduce((sum, pack) => sum + pack.questions.filter((q) => !(progress[pack.id]?.cards?.[q.id]?.reps > 0)).length, 0)
  const newToday = Math.min(newAvailable, newCardsRemaining(settings, stats, now))
  return { due, newToday, nextDue, startedCount: started.length }
}
