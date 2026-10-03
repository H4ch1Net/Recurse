/** Suggest topics to start: matches interests, prerequisites already started, beginner first. */
export function recommendTopics(packs, summaries, interests = [], limit = 3) {
  const started = (id) => summaries.get(id)?.started
  return packs
    .map((pack, order) => {
      if (started(pack.id)) return null
      let score = 0
      if (interests.includes(pack.subject)) score += 4
      if (pack.prereqs.every(started)) score += 2
      if (pack.level === 'beginner') score += 1
      if (pack.community) score -= 1
      return { pack, score, order }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.pack)
}

/** Prerequisites the learner has not started yet. */
export function missingPrereqs(pack, packMap, summaries) {
  return pack.prereqs.filter((id) => packMap.has(id) && !summaries.get(id)?.started).map((id) => packMap.get(id))
}
