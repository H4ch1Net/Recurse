const STORAGE_KEYS = {
  progress: 'recurse_progress',
  stats: 'recurse_stats',
  user: 'recurse_user',
  ai: 'recurse_ai',
  settings: 'recurse_settings',
  communityPacks: 'recurse_community_packs',
  lastSession: 'recurse_last_session'
}

const LEGACY_STORAGE_KEYS = {
  progress: 'syntaxiq_progress',
  stats: 'syntaxiq_stats',
  user: 'syntaxiq_user',
  ai: 'syntaxiq_ai',
  settings: 'syntaxiq_settings',
  communityPacks: 'syntaxiq_community_packs',
  lastSession: 'syntaxiq_last_session'
}

const defaults = {
  progress: {},
  stats: {
    xp: 0,
    level: 1,
    streak: 0,
    lastStudied: null,
    longestStreak: 0,
    totalTimeStudied: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    sessionHistory: [],
    activityLog: {},
    achievements: []
  },
  user: {
    name: '',
    goal: '',
    onboardingComplete: false
  },
  ai: {
    provider: 'anthropic',
    apiKey: '',
    model: import.meta.env.VITE_DEFAULT_MODEL || 'claude-haiku-4-5-20251001'
  },
  settings: {
    pomodoroEnabled: true,
    workMinutes: 25,
    breakMinutes: 5,
    desiredRetention: 0.9
  },
  lastSession: null
}

function readRaw(key) {
  if (typeof localStorage === 'undefined') return null
  const value = localStorage.getItem(key)
  if (value !== null) return value
  const legacyKey = Object.entries(STORAGE_KEYS).find(([, currentKey]) => currentKey === key)?.[0]
  if (!legacyKey) return null
  return localStorage.getItem(LEGACY_STORAGE_KEYS[legacyKey])
}

function writeRaw(key, value) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, value)
}

function readJSON(key, fallback) {
  try {
    const raw = readRaw(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  writeRaw(key, JSON.stringify(value))
}

export function loadProgress() {
  return readJSON(STORAGE_KEYS.progress, defaults.progress)
}

export function saveProgress(progress) {
  writeJSON(STORAGE_KEYS.progress, progress)
}

export function loadStats() {
  const stats = readJSON(STORAGE_KEYS.stats, defaults.stats)
  return {
    ...defaults.stats,
    ...stats,
    sessionHistory: Array.isArray(stats.sessionHistory) ? stats.sessionHistory : [],
    activityLog: stats.activityLog || {},
    achievements: Array.isArray(stats.achievements) ? stats.achievements : []
  }
}

export function saveStats(stats) {
  writeJSON(STORAGE_KEYS.stats, stats)
}

export function loadUser() {
  const user = readJSON(STORAGE_KEYS.user, defaults.user)
  return { ...defaults.user, ...user }
}

export function saveUser(user) {
  writeJSON(STORAGE_KEYS.user, user)
}

export function loadAIConfig() {
  const ai = readJSON(STORAGE_KEYS.ai, defaults.ai)
  return { ...defaults.ai, ...ai }
}

export function saveAIConfig(ai) {
  writeJSON(STORAGE_KEYS.ai, ai)
}

export function loadSettings() {
  const settings = readJSON(STORAGE_KEYS.settings, defaults.settings)
  return { ...defaults.settings, ...settings }
}

export function saveSettings(settings) {
  writeJSON(STORAGE_KEYS.settings, settings)
}

export function loadLastSession() {
  return readJSON(STORAGE_KEYS.lastSession, defaults.lastSession)
}

export function saveLastSession(session) {
  writeJSON(STORAGE_KEYS.lastSession, session)
}

export function loadCommunityPacks() {
  return readJSON(STORAGE_KEYS.communityPacks, [])
}

export function saveCommunityPacks(packs) {
  writeJSON(STORAGE_KEYS.communityPacks, packs)
}

export function exportAllData() {
  return {
    [STORAGE_KEYS.progress]: loadProgress(),
    [STORAGE_KEYS.stats]: loadStats(),
    [STORAGE_KEYS.user]: loadUser(),
    [STORAGE_KEYS.ai]: loadAIConfig(),
    [STORAGE_KEYS.settings]: loadSettings(),
    [STORAGE_KEYS.communityPacks]: loadCommunityPacks(),
    [STORAGE_KEYS.lastSession]: loadLastSession()
  }
}

export function importAllData(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid import payload')
  }
  if (snapshot[STORAGE_KEYS.progress]) saveProgress(snapshot[STORAGE_KEYS.progress])
  if (snapshot[STORAGE_KEYS.stats]) saveStats(snapshot[STORAGE_KEYS.stats])
  if (snapshot[STORAGE_KEYS.user]) saveUser(snapshot[STORAGE_KEYS.user])
  if (snapshot[STORAGE_KEYS.ai]) saveAIConfig(snapshot[STORAGE_KEYS.ai])
  if (snapshot[STORAGE_KEYS.settings]) saveSettings(snapshot[STORAGE_KEYS.settings])
  if (snapshot[STORAGE_KEYS.communityPacks]) saveCommunityPacks(snapshot[STORAGE_KEYS.communityPacks])
  if (snapshot[STORAGE_KEYS.lastSession]) saveLastSession(snapshot[STORAGE_KEYS.lastSession])
}

export function resetAllData() {
  saveProgress(defaults.progress)
  saveStats(defaults.stats)
  saveUser(defaults.user)
  saveAIConfig(defaults.ai)
  saveSettings(defaults.settings)
  saveCommunityPacks([])
  saveLastSession(null)
}

export function getDefaults() {
  return structuredClone(defaults)
}

export function storageKeys() {
  return { ...STORAGE_KEYS }
}

export function migrateLegacyStorage() {
  if (typeof localStorage === 'undefined') return
  for (const [name, legacyKey] of Object.entries(LEGACY_STORAGE_KEYS)) {
    const modernKey = STORAGE_KEYS[name]
    const modernValue = localStorage.getItem(modernKey)
    const legacyValue = localStorage.getItem(legacyKey)
    if (modernValue === null && legacyValue !== null) {
      localStorage.setItem(modernKey, legacyValue)
    }
  }
}
