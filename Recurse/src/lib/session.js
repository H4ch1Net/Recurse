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
  mistakes: 'Mistake review',
  roulette: 'Recall roulette',
  path: 'Path review'
}

// Share of a topic session given to pop quizzes: earlier cards from other topics.
export const POP_RATES = { off: 0, sometimes: 1 / 6, often: 1 / 3 }

export const MAX_RETRIES = 2

function makeItem(pack, question, card, random, isNew) {
  const item = {
    key: `${pack.id}:${question.id}`,
    packId: pack.id,
    questionId: question.id,
    isNew,
    retry: 0
  }
  if (isChoiceType(question.type) || question.type === 'multi') item.order = shuffle(question.choices.map((_, i) => i), random)
  if (question.type === 'match') item.order = shuffle(question.pairs.map((_, i) => i), random)
  if (question.type === 'order') item.order = scrambled(question.items.length, random)
  return item
}

/** A shuffled 0..n-1 that is never already in order (an order question must need work). */
function scrambled(n, random) {
  const identity = Array.from({ length: n }, (_, i) => i)
  if (n < 2) return identity
  for (let tries = 0; tries < 8; tries++) {
    const order = shuffle(identity, random)
    if (order.some((v, i) => v !== i)) return order
  }
  return [...identity.slice(1), identity[0]]
}

/**
 * Previously seen cards from packs other than `excludeIds`, weakest memory first with a
 * little randomness, for pop quizzes and recall roulette.
 */
export function seenPool(packs, progress, { excludeIds = [], now = new Date(), random = Math.random } = {}) {
  const skip = new Set(excludeIds)
  const pool = []
  for (const pack of packs) {
    if (skip.has(pack.id)) continue
    for (const { question, card } of existingCards(pack, progress[pack.id])) {
      pool.push({ pack, question, card, weight: (1 - retrievability(card, now)) + random() * 0.35 })
    }
  }
  return pool.sort((a, b) => b.weight - a.weight)
}

/** Spread `extra` items evenly through `items`, never as the very first card. */
function sprinkle(items, extra) {
  if (!extra.length) return items
  const out = [...items]
  const gap = Math.max(2, Math.floor(out.length / (extra.length + 1)))
  extra.forEach((item, i) => out.splice(Math.min(out.length, gap * (i + 1) + i), 0, item))
  return out
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
export function buildSession({ kind, topicId, topicIds, packs, progress, settings = {}, stats = {}, now = new Date(), seed = Date.now() }) {
  const random = createRandom(seed)
  const size = Math.max(1, settings.sessionSize ?? 12)
  const scope = topicIds?.length ? new Set(topicIds) : null
  const packList = topicId ? packs.filter((p) => p.id === topicId) : scope ? packs.filter((p) => scope.has(p.id)) : packs
  const result = { kind, topicId: topicId || null, title: SESSION_KINDS[kind] || 'Study', items: [], ahead: false }

  if (kind === 'roulette') {
    // Recall roulette: anything you have seen before, weakest first, ignoring the schedule.
    const pool = seenPool(packList, progress, { now, random })
    result.items = interleave(shuffle(pool.slice(0, size * 2), random).slice(0, size).map(({ pack, question, card }) => makeItem(pack, question, card, random, false)))
    return result
  }

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
    result.items = withPops(
      shuffle(pack.questions, random)
        .slice(0, size)
        .map((q) => makeItem(pack, q, topic?.cards?.[q.id], random, !(topic?.cards?.[q.id]?.reps > 0))),
      { packs, progress, settings, now, random, excludeIds: [pack.id] }
    )
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
  if (kind === 'review' || kind === 'path') reviews = interleave(reviews)

  // New cards in teaching order. The daily limit applies to the mixed daily review;
  // choosing a topic explicitly lets you keep learning it.
  const room = size - reviews.length
  const mixed = kind === 'review' || kind === 'path'
  const newLimit = mixed ? Math.min(room, newCardsRemaining(settings, stats, now)) : room
  const fresh = []
  if (newLimit > 0) {
    const sources = mixed
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
  // Studying one topic still pulls a few older cards from elsewhere, so earlier topics
  // keep getting recalled while you learn new ones.
  if (kind === 'topic' && result.items.length) {
    result.items = withPops(result.items, { packs, progress, settings, now, random, excludeIds: [topicId] })
  }

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

/** Add pop-quiz cards (seen before, from other topics) at the learner's chosen rate. */
function withPops(items, { packs, progress, settings, now, random, excludeIds }) {
  const rate = POP_RATES[settings.popQuiz ?? 'sometimes'] ?? 0
  const count = Math.floor(items.length * rate)
  if (!count) return items
  const pops = seenPool(packs, progress, { excludeIds, now, random })
    .slice(0, count * 3)
  const picked = shuffle(pops, random).slice(0, count)
    .map(({ pack, question, card }) => ({ ...makeItem(pack, question, card, random, false), pop: true }))
  return sprinkle(items, picked)
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
