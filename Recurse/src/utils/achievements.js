const achievementRules = [
  { id: 'First Blood', check: (stats) => stats.totalCorrect > 0 },
  { id: 'Streak Week', check: (stats) => stats.streak >= 7 },
  { id: 'Debugger', check: (stats) => (stats.debugCorrect || 0) >= 10 },
  { id: 'Memory Palace', check: (_stats, progress) => Object.values(progress).flatMap((topic) => Object.values(topic.cards || {})).filter((card) => (card.stability || 0) > 21).length >= 5 },
  { id: 'Feynman', check: (stats) => (stats.sessionHistory || []).some((item) => item.mode === 'feynman') },
  { id: 'Mastered', check: (_stats, progress) => Object.values(progress).some((topic) => (topic.mastery || 0) >= 90) },
  { id: 'Polyglot', check: (_stats, progress) => Object.values(progress).filter((topic) => (topic.lessonRead || topic.mastery > 0)).length >= 5 },
  { id: 'Iron Mind', check: (stats) => stats.streak >= 30 },
  { id: 'Relearner', check: (_stats, progress) => Object.values(progress).flatMap((topic) => Object.values(topic.cards || {})).some((card) => (card.lapses || 0) >= 1 && (card.reps || 0) >= 4) }
]

export function computeUnlockedAchievements(stats, progress) {
  const current = new Set(stats.achievements || [])
  const unlocked = []
  for (const rule of achievementRules) {
    if (!current.has(rule.id) && rule.check(stats, progress)) {
      unlocked.push(rule.id)
    }
  }
  return unlocked
}

export function mergeAchievements(stats, progress) {
  const unlocked = computeUnlockedAchievements(stats, progress)
  if (!unlocked.length) return stats
  const achievements = Array.from(new Set([...(stats.achievements || []), ...unlocked]))
  return { ...stats, achievements }
}

export function achievementDisplayName(name, unlocked = true) {
  return unlocked ? name : '???'
}
