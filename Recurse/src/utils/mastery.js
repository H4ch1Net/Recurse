export function calculateMastery(cards) {
  if (!cards || Object.keys(cards).length === 0) return 0
  const cardList = Object.values(cards)
  const reviewed = cardList.filter((c) => c.reps > 0)
  if (reviewed.length === 0) return 0

  const coverage = reviewed.length / cardList.length
  const avgStability = reviewed.reduce((s, c) => s + Math.min(c.stability, 30), 0) / reviewed.length
  const stabilityScore = Math.min(avgStability / 30, 1)
  const avgLapseRate = reviewed.reduce((s, c) => s + c.lapses / Math.max(c.reps, 1), 0) / reviewed.length
  const lapseScore = Math.max(0, 1 - avgLapseRate * 2)

  return Math.round((coverage * 0.4 + stabilityScore * 0.4 + lapseScore * 0.2) * 100)
}

export function xpForCorrectQuestion(type) {
  if (type === 'code-fill') return 15
  if (type === 'debug') return 20
  return 10
}

export function levelFromXp(xp) {
  return Math.floor(xp / 500) + 1
}

export function xpToNextLevel(xp) {
  const nextThreshold = levelFromXp(xp) * 500
  return nextThreshold - xp
}

export function streakMultiplier(streak) {
  if (streak >= 14) return 1.5
  if (streak >= 7) return 1.2
  if (streak >= 3) return 1.1
  return 1
}

export function updateStreak(stats, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const last = stats.lastStudied ? new Date(stats.lastStudied).toISOString().slice(0, 10) : null
  let streak = stats.streak || 0
  if (!last) {
    streak = 1
  } else {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = yesterday.toISOString().slice(0, 10)
    if (last === today) {
      streak = Math.max(streak, 1)
    } else if (last === yesterdayKey) {
      streak += 1
    } else {
      streak = 1
    }
  }
  return {
    streak,
    longestStreak: Math.max(stats.longestStreak || 0, streak),
    lastStudied: now.toISOString()
  }
}

export function awardXp(stats, amount) {
  const xp = (stats.xp || 0) + Math.max(0, amount)
  const level = levelFromXp(xp)
  return { ...stats, xp, level }
}
