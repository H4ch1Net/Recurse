const DAY_MS = 86400000

/** Local calendar day as YYYY-MM-DD. Streaks and daily goals follow the learner's clock, not UTC. */
export function dayKey(date = new Date()) {
  const d = new Date(date)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function startOfDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Whole calendar days from a to b (b later is positive). */
export function calendarDaysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS)
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/** Compact interval label used on rating buttons: 1m, 10m, 3h, 4d, 2mo, 1.5y. */
export function formatInterval(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 31) return `${days}d`
  const months = days / 30.4
  if (months < 12) return `${Math.round(months)}mo`
  const years = days / 365
  return `${years < 10 ? Math.round(years * 10) / 10 : Math.round(years)}y`
}

export function formatRelative(date, now = new Date()) {
  const diff = new Date(date) - now
  if (Math.abs(diff) < 60000) return 'now'
  const label = formatInterval(Math.abs(diff))
  return diff > 0 ? `in ${label}` : `${label} ago`
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function greeting(now = new Date()) {
  const hour = now.getHours()
  if (hour < 5) return 'Up late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Milliseconds since the epoch. Wrapped so event handlers read the clock through one place. */
export function nowMs() {
  return Date.now()
}

export function secondsSince(startMs) {
  return Math.max(0, (Date.now() - startMs) / 1000)
}
