import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AppContext } from './context'
import { BUILT_IN_IDS, BUILT_IN_PACKS, normalizePack, sortPacks } from '../lib/packs'
import { loadAll, migrateStorage, save, importSnapshot, resetStorage } from '../lib/storage'
import { schedule, Rating } from '../lib/memory'
import { emptyTopic, pruneOrphans, summarizeTopic, topicOf } from '../lib/progress'
import { sanitizePack } from '../lib/packSchema'
import { applyStudyDay, currentStreak, xpForReview } from '../lib/gamification'
import { achievementTitle, newlyUnlocked } from '../lib/achievements'
import { dayKey } from '../lib/dates'
import { uid } from '../lib/random'


/** Re-render on an interval so due counts and relative times stay current. */
function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    const onFocus = () => setNow(new Date())
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [intervalMs])
  return now
}

/** Built-in packs plus the learner's own. Own packs that fail validation are hidden, not deleted. */
function allPacks(communityPacks) {
  const own = []
  for (const raw of communityPacks) {
    if (BUILT_IN_IDS.has(raw?.id)) continue
    try {
      own.push(normalizePack(sanitizePack(raw), { community: true }))
    } catch {
      // Kept in storage; skipped here.
    }
  }
  return sortPacks([...BUILT_IN_PACKS, ...own])
}

const initial = () => {
  migrateStorage()
  const data = loadAll()
  return { ...data, progress: pruneOrphans(data.progress, allPacks(data.communityPacks)) }
}

export function AppProvider({ children }) {
  const [boot] = useState(initial)
  const [progress, setProgress] = useState(boot.progress)
  const [stats, setStats] = useState(boot.stats)
  const [user, setUser] = useState(boot.user)
  const [ai, setAI] = useState(boot.ai)
  const [settings, setSettings] = useState(boot.settings)
  const [communityPacks, setCommunityPacks] = useState(boot.communityPacks)
  const [lastSession, setLastSession] = useState(boot.lastSession)
  const [toasts, setToasts] = useState([])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const now = useNow()

  // Latest committed values. Actions read from here so back-to-back calls never work on stale state.
  const latest = useRef({ progress, stats, settings, communityPacks })
  useLayoutEffect(() => {
    latest.current = { progress, stats, settings, communityPacks }
  }, [progress, stats, settings, communityPacks])

  const toast = useCallback((message, { tone = 'neutral', duration = 3500 } = {}) => {
    const id = uid()
    setToasts((list) => [...list.slice(-3), { id, message, tone }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), duration)
  }, [])
  const dismissToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  // Persistence. Warn once if the browser refuses to store data.
  const warned = useRef(false)
  const persist = useCallback((ok) => {
    if (!ok && !warned.current) {
      warned.current = true
      toast('Progress could not be saved. Browser storage may be full or disabled.', { tone: 'bad', duration: 8000 })
    }
  }, [toast])
  useEffect(() => persist(save.progress(progress)), [progress, persist])
  useEffect(() => persist(save.stats(stats)), [stats, persist])
  useEffect(() => persist(save.user(user)), [user, persist])
  useEffect(() => persist(save.ai(ai)), [ai, persist])
  useEffect(() => persist(save.settings(settings)), [settings, persist])
  useEffect(() => persist(save.communityPacks(communityPacks)), [communityPacks, persist])
  useEffect(() => persist(save.lastSession(lastSession)), [lastSession, persist])

  // Theme: "system" defers to prefers-color-scheme in CSS.
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme
    else delete root.dataset.theme
    const dark = settings.theme === 'dark' || (settings.theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111214' : '#f7f6f2')
  }, [settings.theme])

  const packs = useMemo(() => allPacks(communityPacks), [communityPacks])
  const packMap = useMemo(() => new Map(packs.map((p) => [p.id, p])), [packs])
  const summaries = useMemo(() => {
    const map = new Map()
    for (const pack of packs) map.set(pack.id, summarizeTopic(pack, topicOf(progress, pack.id), now))
    return map
  }, [packs, progress, now])

  /**
   * Apply a change to progress, stats and/or community packs in one step, then unlock
   * any achievements the new state earns. `change` receives the latest state and returns
   * the slices it replaces.
   */
  const apply = useCallback((change) => {
    const current = latest.current
    const next = { ...current, ...change(current) }
    const unlocked = newlyUnlocked({ stats: next.stats, progress: next.progress, packs: allPacks(next.communityPacks) })
    if (unlocked.length) next.stats = { ...next.stats, achievements: [...(next.stats.achievements || []), ...unlocked] }
    latest.current = next
    if (next.progress !== current.progress) setProgress(next.progress)
    if (next.stats !== current.stats) setStats(next.stats)
    if (next.communityPacks !== current.communityPacks) setCommunityPacks(next.communityPacks)
    unlocked.forEach((id) => toast(`Achievement unlocked: ${achievementTitle(id)}`, { tone: 'good', duration: 5000 }))
    return next
  }, [toast])

  const updateTopic = useCallback((packId, updater) => {
    apply(({ progress: p }) => ({ progress: { ...p, [packId]: updater(topicOf(p, packId)) } }))
  }, [apply])

  /**
   * Record one answered card: reschedule it, update the mistake journal and stats.
   * Returns { card, xp } so the study screen can show the outcome.
   */
  // One-step undo for the last answered card (misclicks happen).
  const undoRef = useRef(null)

  const recordReview = useCallback(({ packId, question, rating, correct, isNew, seconds = 0, given = '' }) => {
    const at = new Date()
    undoRef.current = { progress: latest.current.progress, stats: latest.current.stats }
    let result
    apply(({ progress: p, stats: st, settings: se }) => {
      const topic = topicOf(p, packId)
      const card = schedule(topic.cards[question.id], rating, { retention: se.desiredRetention, now: at })
      const xp = xpForReview({ type: question.type, correct, isNew, streak: currentStreak(st, at) })
      const spent = Math.min(Math.max(0, seconds), 300)
      result = { card, xp }

      const mistakes = { ...topic.mistakes }
      if (!correct || rating === Rating.Again) {
        const prior = mistakes[question.id]
        mistakes[question.id] = { date: at.toISOString(), given: String(given).slice(0, 300), count: (prior?.count || 0) + 1 }
      } else {
        delete mistakes[question.id]
      }

      const key = dayKey(at)
      const day = { reviews: 0, correct: 0, newCards: 0, seconds: 0, xp: 0, ...(st.days?.[key] || {}) }
      const type = st.byType?.[question.type] || { total: 0, correct: 0 }
      return {
        progress: { ...p, [packId]: { ...topic, cards: { ...topic.cards, [question.id]: card }, mistakes, lastStudied: at.toISOString() } },
        stats: {
          ...st,
          ...applyStudyDay(st, at),
          xp: (st.xp || 0) + xp,
          totalReviews: (st.totalReviews || 0) + 1,
          totalCorrect: (st.totalCorrect || 0) + (correct ? 1 : 0),
          totalSeconds: (st.totalSeconds || 0) + spent,
          byType: { ...st.byType, [question.type]: { total: type.total + 1, correct: type.correct + (correct ? 1 : 0) } },
          days: {
            ...st.days,
            [key]: {
              reviews: day.reviews + 1,
              correct: day.correct + (correct ? 1 : 0),
              newCards: day.newCards + (isNew ? 1 : 0),
              seconds: day.seconds + spent,
              xp: day.xp + xp
            }
          }
        }
      }
    })
    return result
  }, [apply])

  const undoReview = useCallback(() => {
    const snapshot = undoRef.current
    if (!snapshot) return false
    undoRef.current = null
    latest.current = { ...latest.current, ...snapshot }
    setProgress(snapshot.progress)
    setStats(snapshot.stats)
    return true
  }, [])

  const finishSession = useCallback((summary) => {
    const record = { id: uid(), date: new Date().toISOString(), ...summary }
    setLastSession(record)
    undoRef.current = null
    apply(({ stats: st }) => ({ stats: { ...st, sessions: [{ ...record, results: undefined }, ...(st.sessions || [])].slice(0, 100) } }))
    return record
  }, [apply])

  const markLessonRead = useCallback((packId) => updateTopic(packId, (t) => ({ ...t, lessonRead: true })), [updateTopic])
  const passCheck = useCallback((packId, index) => updateTopic(packId, (t) => ({ ...t, checks: { ...t.checks, [index]: true } })), [updateTopic])

  const recordFeynman = useCallback((packId, attempt) => {
    const at = new Date()
    const entry = { date: at.toISOString(), ...attempt }
    const xp = 25 + Math.round(Math.max(0, (attempt.score || 0) - 50) / 2)
    apply(({ progress: p, stats: st }) => {
      const topic = topicOf(p, packId)
      const key = dayKey(at)
      const day = { reviews: 0, correct: 0, newCards: 0, seconds: 0, xp: 0, ...(st.days?.[key] || {}) }
      return {
        progress: { ...p, [packId]: { ...topic, feynman: [entry, ...(topic.feynman || [])].slice(0, 20) } },
        stats: {
          ...st,
          ...applyStudyDay(st, at),
          xp: (st.xp || 0) + xp,
          feynmanCount: (st.feynmanCount || 0) + 1,
          days: { ...st.days, [key]: { ...day, xp: day.xp + xp } },
          sessions: [{ id: uid(), date: entry.date, kind: 'feynman', topicId: packId, accuracy: attempt.score ?? null, xp, seconds: attempt.seconds || 0 }, ...(st.sessions || [])].slice(0, 100)
        }
      }
    })
    return xp
  }, [apply])

  const resetTopic = useCallback((packId) => apply(({ progress: p }) => ({ progress: { ...p, [packId]: emptyTopic() } })), [apply])

  const clearMistakes = useCallback((packId) => {
    apply(({ progress: p }) => {
      const next = { ...p }
      for (const id of packId ? [packId] : Object.keys(next)) if (next[id]) next[id] = { ...next[id], mistakes: {} }
      return { progress: next }
    })
  }, [apply])

  const savePack = useCallback((pack) => {
    if (BUILT_IN_IDS.has(pack.id)) throw new Error('That id belongs to a built-in pack. Choose another name.')
    apply(({ communityPacks: list, progress: p }) => {
      const nextList = [...list.filter((x) => x.id !== pack.id), { ...pack, community: true }]
      return { communityPacks: nextList, progress: pruneOrphans(p, allPacks(nextList)) }
    })
  }, [apply])

  const removePack = useCallback((packId) => {
    apply(({ communityPacks: list, progress: p }) => {
      const next = { ...p }
      delete next[packId]
      return { communityPacks: list.filter((x) => x.id !== packId), progress: next }
    })
  }, [apply])

  const reloadFromStorage = useCallback(() => {
    const data = loadAll()
    data.progress = pruneOrphans(data.progress, allPacks(data.communityPacks))
    latest.current = { progress: data.progress, stats: data.stats, settings: data.settings, communityPacks: data.communityPacks }
    setProgress(data.progress)
    setStats(data.stats)
    setUser(data.user)
    setAI(data.ai)
    setSettings(data.settings)
    setCommunityPacks(data.communityPacks)
    setLastSession(data.lastSession)
  }, [])

  // Another tab changed stored data: adopt it so this tab never writes stale state back.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === null || event.key?.startsWith('recurse_')) reloadFromStorage()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reloadFromStorage])

  const importData = useCallback((snapshot) => {
    importSnapshot(snapshot)
    reloadFromStorage()
  }, [reloadFromStorage])

  const resetAll = useCallback(() => {
    resetStorage()
    reloadFromStorage()
  }, [reloadFromStorage])

  const value = {
    now,
    packs,
    packMap,
    summaries,
    progress,
    stats,
    user,
    ai,
    settings,
    lastSession,
    toasts,
    shortcutsOpen,
    setShortcutsOpen,
    toast,
    dismissToast,
    updateSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
    updateUser: (patch) => setUser((u) => ({ ...u, ...patch })),
    updateAI: (patch) => setAI((a) => ({ ...a, ...patch })),
    recordReview,
    undoReview,
    finishSession,
    markLessonRead,
    passCheck,
    recordFeynman,
    resetTopic,
    clearMistakes,
    savePack,
    removePack,
    importData,
    resetAll
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
