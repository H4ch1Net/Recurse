// localStorage persistence. Every read is defensive: storage can be full, blocked
// (private mode) or hold data from an older version of the app.
import { dayKey } from './dates'

export const STORAGE_VERSION = 2

export const KEYS = {
  version: 'recurse_version',
  progress: 'recurse_progress',
  stats: 'recurse_stats',
  user: 'recurse_user',
  ai: 'recurse_ai',
  settings: 'recurse_settings',
  communityPacks: 'recurse_community_packs',
  lastSession: 'recurse_last_session'
}

const LEGACY_PREFIX = 'syntaxiq_'

export const DEFAULTS = {
  progress: {},
  stats: {
    xp: 0,
    totalReviews: 0,
    totalCorrect: 0,
    totalSeconds: 0,
    byType: {},
    days: {},
    streak: 0,
    longestStreak: 0,
    lastStudyDay: null,
    sessions: [],
    achievements: [],
    feynmanCount: 0
  },
  user: { name: '', interests: [], onboardingComplete: false, createdAt: null },
  ai: { provider: 'anthropic', apiKey: '', model: '' },
  settings: {
    theme: 'system',
    dailyGoal: 20,
    newPerDay: 15,
    sessionSize: 12,
    desiredRetention: 0.9,
    showTimer: true,
    focusTimer: false,
    focusMinutes: 25,
    breakMinutes: 5
  },
  communityPacks: [],
  lastSession: null
}

const clone = (value) => JSON.parse(JSON.stringify(value))

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function read(key) {
  try {
    const raw = storage()?.getItem(key)
    return raw == null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Returns false when the write failed (quota exceeded, storage disabled). */
function write(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

export function loadProgress() {
  const value = read(KEYS.progress)
  return isObject(value) ? value : {}
}

export function loadStats() {
  const value = read(KEYS.stats)
  const stats = { ...clone(DEFAULTS.stats), ...(isObject(value) ? value : {}) }
  if (!Array.isArray(stats.sessions)) stats.sessions = []
  if (!Array.isArray(stats.achievements)) stats.achievements = []
  if (!isObject(stats.days)) stats.days = {}
  if (!isObject(stats.byType)) stats.byType = {}
  return stats
}

export function loadUser() {
  const value = read(KEYS.user)
  const user = { ...DEFAULTS.user, ...(isObject(value) ? value : {}) }
  if (!Array.isArray(user.interests)) user.interests = []
  return user
}

export function loadAI() {
  const value = read(KEYS.ai)
  return { ...DEFAULTS.ai, ...(isObject(value) ? value : {}) }
}

export function loadSettings() {
  const value = read(KEYS.settings)
  return { ...DEFAULTS.settings, ...(isObject(value) ? value : {}) }
}

/**
 * Packs are returned as stored. Ones that fail validation are hidden from the library
 * (see state/AppState) but kept here, so they are never silently deleted on save.
 */
export function loadCommunityPacks() {
  const value = read(KEYS.communityPacks)
  return Array.isArray(value) ? value.filter((p) => p && typeof p === 'object') : []
}

export function loadLastSession() {
  const value = read(KEYS.lastSession)
  return isObject(value) ? value : null
}

export const save = {
  progress: (v) => write(KEYS.progress, v),
  stats: (v) => write(KEYS.stats, v),
  user: (v) => write(KEYS.user, v),
  ai: (v) => write(KEYS.ai, v),
  settings: (v) => write(KEYS.settings, v),
  communityPacks: (v) => write(KEYS.communityPacks, v),
  lastSession: (v) => write(KEYS.lastSession, v)
}

export function loadAll() {
  return {
    progress: loadProgress(),
    stats: loadStats(),
    user: loadUser(),
    ai: loadAI(),
    settings: loadSettings(),
    communityPacks: loadCommunityPacks(),
    lastSession: loadLastSession()
  }
}

// ---- Migration ---------------------------------------------------------------

/** v1 stored every card up front (reps 0), a mistake log array and flat stat counters. */
export function migrateV1(data) {
  const progress = {}
  for (const [topicId, topic] of Object.entries(data.progress || {})) {
    if (!isObject(topic)) continue
    const cards = {}
    for (const [id, card] of Object.entries(topic.cards || {})) {
      if (isObject(card) && card.reps > 0) cards[id] = card
    }
    const mistakes = {}
    for (const entry of Array.isArray(topic.mistakeLog) ? topic.mistakeLog : []) {
      if (!entry?.questionId || mistakes[entry.questionId]) continue
      mistakes[entry.questionId] = { date: entry.date || new Date().toISOString(), given: entry.yourAnswer || '', count: 1 }
    }
    progress[topicId] = { cards, mistakes, lessonRead: Boolean(topic.lessonRead), checks: {}, feynman: [], lastStudied: null }
  }

  const old = isObject(data.stats) ? data.stats : {}
  const days = {}
  for (const [day, count] of Object.entries(old.activityLog || {})) {
    if (Number(count) > 0) days[day] = { reviews: Number(count), correct: 0, newCards: 0, seconds: 0, xp: 0 }
  }
  const byType = {}
  const typeKeys = { mcq: 'mcq', 'code-fill': 'codeFill', debug: 'debug' }
  for (const [type, key] of Object.entries(typeKeys)) {
    if (old[`${key}Total`]) byType[type] = { total: old[`${key}Total`] || 0, correct: old[`${key}Correct`] || 0 }
  }
  const sessions = (Array.isArray(old.sessionHistory) ? old.sessionHistory : []).slice(0, 100).map((s) => ({
    date: s.date,
    kind: s.mode === 'quick5' ? 'review' : s.mode === 'feynman' ? 'feynman' : 'topic',
    topicId: s.topicId === 'quick5' ? null : s.topicId,
    accuracy: s.score || 0,
    xp: s.xpEarned || 0,
    seconds: (s.durationMinutes || 0) * 60
  }))
  const stats = {
    ...clone(DEFAULTS.stats),
    xp: old.xp || 0,
    totalReviews: old.totalQuestions || 0,
    totalCorrect: old.totalCorrect || 0,
    byType,
    days,
    streak: old.streak || 0,
    longestStreak: old.longestStreak || 0,
    lastStudyDay: old.lastStudied ? dayKey(old.lastStudied) : null,
    sessions,
    achievements: Array.isArray(old.achievements) ? old.achievements : [],
    feynmanCount: sessions.filter((s) => s.kind === 'feynman').length
  }

  const oldSettings = isObject(data.settings) ? data.settings : {}
  const settings = {
    ...DEFAULTS.settings,
    desiredRetention: oldSettings.desiredRetention || DEFAULTS.settings.desiredRetention,
    focusTimer: false,
    focusMinutes: oldSettings.workMinutes || DEFAULTS.settings.focusMinutes,
    breakMinutes: oldSettings.breakMinutes || DEFAULTS.settings.breakMinutes
  }
  const oldUser = isObject(data.user) ? data.user : {}
  const user = { ...DEFAULTS.user, name: oldUser.name || '', onboardingComplete: Boolean(oldUser.onboardingComplete) }
  const oldAI = isObject(data.ai) ? data.ai : {}
  const ai = { ...DEFAULTS.ai, provider: oldAI.provider || 'anthropic', apiKey: oldAI.apiKey || '', model: oldAI.model === 'claude-haiku-4-5-20251001' ? '' : oldAI.model || '' }

  return { progress, stats, settings, user, ai }
}

/** Bring stored data up to the current version. Safe to call on every start. */
export function migrateStorage() {
  const store = storage()
  if (!store) return
  try {
    // Copy keys from the app's previous name if this browser only has those.
    for (const key of Object.values(KEYS)) {
      const legacy = key.replace('recurse_', LEGACY_PREFIX)
      if (store.getItem(key) === null && store.getItem(legacy) !== null) store.setItem(key, store.getItem(legacy))
    }
    const version = Number(read(KEYS.version) || 0)
    if (version >= STORAGE_VERSION) return
    const hasData = [KEYS.progress, KEYS.stats, KEYS.user].some((k) => store.getItem(k) !== null)
    if (hasData && version < 2) {
      const migrated = migrateV1({
        progress: read(KEYS.progress),
        stats: read(KEYS.stats),
        settings: read(KEYS.settings),
        user: read(KEYS.user),
        ai: read(KEYS.ai)
      })
      for (const [name, value] of Object.entries(migrated)) save[name](value)
    }
    write(KEYS.version, STORAGE_VERSION)
  } catch {
    // Never block startup on migration problems.
  }
}

// ---- Backup ------------------------------------------------------------------

export function exportSnapshot({ includeKey = false } = {}) {
  const data = loadAll()
  if (!includeKey) data.ai = { ...data.ai, apiKey: '' }
  return { app: 'recurse', version: STORAGE_VERSION, exportedAt: new Date().toISOString(), data }
}

/** Accepts a v2 snapshot or a v1 export (flat recurse_* keys). Returns the normalized data. */
export function parseSnapshot(snapshot) {
  if (!isObject(snapshot)) throw new Error('That file is not a Recurse backup.')
  if (snapshot.app === 'recurse' && isObject(snapshot.data)) return snapshot.data
  if (KEYS.progress in snapshot || KEYS.stats in snapshot) {
    const migrated = migrateV1({
      progress: snapshot[KEYS.progress],
      stats: snapshot[KEYS.stats],
      settings: snapshot[KEYS.settings],
      user: snapshot[KEYS.user],
      ai: snapshot[KEYS.ai]
    })
    return { ...migrated, communityPacks: snapshot[KEYS.communityPacks] || [], lastSession: null }
  }
  throw new Error('That file is not a Recurse backup.')
}

export function importSnapshot(snapshot) {
  const data = parseSnapshot(snapshot)
  const current = loadAI()
  for (const name of Object.keys(save)) {
    if (data[name] === undefined) continue
    let value = data[name]
    // Keep the existing key if the backup was exported without one.
    if (name === 'ai' && isObject(value) && !value.apiKey) value = { ...value, apiKey: current.apiKey }
    save[name](value)
  }
  write(KEYS.version, STORAGE_VERSION)
}

export function resetStorage() {
  const store = storage()
  if (!store) return
  for (const key of Object.values(KEYS)) store.removeItem(key)
  write(KEYS.version, STORAGE_VERSION)
}
