// Quizzes and practice exams: pick questions from a scope (a topic, a path stage, a
// whole path or everything studied), weighted the way the real exam is.
import { createRandom, shuffle } from './random'
import { isChoiceType } from './packSchema'
import { interleave } from './session'

// Self-graded recall cards cannot be scored fairly under exam conditions.
export const SCORABLE = (q) => q.type !== 'recall'

export function quizScope({ path, stageId, topicId, packs, packMap, progress }) {
  if (topicId) {
    const pack = packMap.get(topicId)
    return pack ? { title: pack.name, groups: [{ id: pack.id, title: pack.name, weight: 1, packs: [pack] }] } : null
  }
  if (path) {
    const stages = stageId ? path.stages.filter((s) => s.id === stageId) : path.stages
    const groups = stages
      .map((s) => ({ id: s.id, title: s.title, weight: s.weight || 1, packs: s.topics.map((id) => packMap.get(id)).filter(Boolean) }))
      .filter((g) => g.packs.length)
    const stage = stageId ? path.stages.find((s) => s.id === stageId) : null
    return groups.length ? { title: stage ? `${path.name}: ${stage.title}` : path.name, groups } : null
  }
  const studied = packs.filter((p) => Object.values(progress[p.id]?.cards || {}).some((c) => c.reps > 0))
  return studied.length ? { title: 'Everything you have studied', groups: [{ id: 'all', title: 'All topics', weight: 1, packs: studied }] } : null
}

/** Split n across groups in proportion to weight (largest remainder), capped by supply. */
export function allocate(n, groups) {
  const total = groups.reduce((sum, g) => sum + g.weight, 0) || 1
  const raw = groups.map((g) => (n * g.weight) / total)
  const counts = raw.map((r, i) => Math.min(Math.floor(r), groups[i].supply))
  let left = n - counts.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem)
  while (left > 0) {
    let placed = false
    for (const { i } of order) {
      if (left > 0 && counts[i] < groups[i].supply) {
        counts[i]++
        left--
        placed = true
      }
    }
    if (!placed) break
  }
  return counts
}

/**
 * Build a quiz: a list of { packId, questionId, groupId, order } items.
 * `preferStudied` favors topics the learner has started (for quizzes); exams draw from
 * everything in scope, since a readiness check should not skip what you have not studied.
 */
export function buildQuiz(scope, { n = 20, progress = {}, preferStudied = false, seed = Date.now() } = {}) {
  const random = createRandom(seed)
  const groups = scope.groups.map((g) => {
    let packs = g.packs
    if (preferStudied) {
      const studied = packs.filter((p) => Object.values(progress[p.id]?.cards || {}).some((c) => c.reps > 0) || progress[p.id]?.lessonRead)
      if (studied.length) packs = studied
    }
    const pool = shuffle(packs.flatMap((pack) => pack.questions.filter(SCORABLE).map((question) => ({ pack, question }))), random)
    return { ...g, pool, supply: pool.length }
  })
  const counts = allocate(n, groups)
  const items = []
  groups.forEach((g, gi) => {
    // Round-robin across packs inside a group so one big topic cannot crowd the rest out.
    const byPack = new Map()
    for (const entry of g.pool) {
      if (!byPack.has(entry.pack.id)) byPack.set(entry.pack.id, [])
      byPack.get(entry.pack.id).push(entry)
    }
    const queues = shuffle([...byPack.values()], random)
    let taken = 0
    while (taken < counts[gi] && queues.some((q) => q.length)) {
      for (const q of queues) {
        if (taken >= counts[gi] || !q.length) continue
        const { pack, question } = q.shift()
        const item = { packId: pack.id, questionId: question.id, groupId: g.id, key: `${pack.id}:${question.id}` }
        if (isChoiceType(question.type) || question.type === 'multi') item.order = shuffle(question.choices.map((_, i) => i), random)
        if (question.type === 'match') item.order = shuffle(question.pairs.map((_, i) => i), random)
        if (question.type === 'order') {
          let order = shuffle(question.items.map((_, i) => i), random)
          if (order.every((v, i) => v === i)) order = [...order.slice(1), order[0]]
          item.order = order
        }
        items.push(item)
        taken++
      }
    }
  })
  return interleave(shuffle(items, random))
}

/** Score answered items: overall and per group. */
export function scoreQuiz(items, answers, groups) {
  const byGroup = Object.fromEntries(groups.map((g) => [g.id, { id: g.id, title: g.title, total: 0, correct: 0 }]))
  let correct = 0
  for (const item of items) {
    const ok = answers[item.key]?.correct === true
    if (ok) correct++
    const g = byGroup[item.groupId]
    if (g) {
      g.total++
      if (ok) g.correct++
    }
  }
  return {
    total: items.length,
    correct,
    score: items.length ? Math.round((correct / items.length) * 100) : 0,
    byGroup: Object.values(byGroup).filter((g) => g.total)
  }
}
