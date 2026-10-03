import { calendarDaysBetween, dayKey } from './dates'

export const XP_PER_LEVEL = 500

export function levelFromXp(xp = 0) {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1
}

export function levelProgress(xp = 0) {
  const level = levelFromXp(xp)
  const into = Math.max(0, xp) - (level - 1) * XP_PER_LEVEL
  return { level, into, needed: XP_PER_LEVEL, ratio: into / XP_PER_LEVEL }
}

export function streakMultiplier(streak = 0) {
  if (streak >= 14) return 1.5
  if (streak >= 7) return 1.25
  if (streak >= 3) return 1.1
  return 1
}

const BASE_XP = { mcq: 10, 'code-fill': 12, debug: 15, typed: 12, recall: 10 }

/** XP for a single review. Effort counts too: a miss still earns a little. */
export function xpForReview({ type, correct, isNew, streak = 0 }) {
  const base = correct ? BASE_XP[type] ?? 10 : 2
  return Math.round(base * streakMultiplier(streak)) + (isNew ? 5 : 0)
}

/** Streak after studying on `now`. Missing a whole calendar day resets it. */
export function applyStudyDay(stats, now = new Date()) {
  const today = dayKey(now)
  const last = stats.lastStudyDay
  let streak = stats.streak || 0
  if (!last) streak = 1
  else if (last !== today) {
    const gap = calendarDaysBetween(new Date(`${last}T12:00:00`), now)
    streak = gap === 1 ? streak + 1 : 1
  } else streak = Math.max(streak, 1)
  return { streak, longestStreak: Math.max(stats.longestStreak || 0, streak), lastStudyDay: today }
}

/** The streak as it stands right now (0 if yesterday was skipped). */
export function currentStreak(stats, now = new Date()) {
  if (!stats.lastStudyDay) return 0
  const gap = calendarDaysBetween(new Date(`${stats.lastStudyDay}T12:00:00`), now)
  return gap <= 1 ? stats.streak || 0 : 0
}

export function todayLog(stats, now = new Date()) {
  return { reviews: 0, correct: 0, newCards: 0, seconds: 0, xp: 0, ...(stats.days?.[dayKey(now)] || {}) }
}
