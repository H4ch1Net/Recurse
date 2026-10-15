import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AppContext } from './context'
import { BUILT_IN_IDS, BUILT_IN_PACKS, normalizePack, sortPacks } from '../lib/packs'
import { loadAll, migrateStorage, save, importSnapshot, resetStorage } from '../lib/storage'
import { schedule, Rating } from '../lib/memory'
import { emptyTopic, pruneOrphans, summarizeTopic, topicOf } from '../lib/progress'
import { sanitizePack } from '../lib/packSchema'
import { applyStudyDay, currentStreak, xpForReview } from '../lib/gamification'
import { achievementTitle, newlyUnlocked } from '../lib/achievements'
import { HISTORY_LIMIT, interviewXP } from '../lib/interview'
import { dayKey } from '../lib/dates'
import { uid } from '../lib/random'
import { callNumbers } from '../lib/subjects'
import { ACCENT_VAR_NAMES, THEME_MAP, accentHue, accentVars, chromeColor, resolveTheme } from '../lib/themes'
import { configureSound } from '../lib/sfx'
import { configureEffects } from '../lib/juice'
import { sfx } from '../lib/sfx'


/** Whether the device prefers a dark color scheme, kept current. */
function useSystemDark() {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null
  const [dark, setDark] = useState(() => Boolean(query?.matches))
  useEffect(() => {
    if (!query) return
    const onChange = () => setDark(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [query])
  return dark
}

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
  const [practice, setPractice] = useState(boot.practice)
  const [toasts, setToasts] = useState([])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const now = useNow()

  // Latest committed values. Actions read from here so back-to-back calls never work on stale state.
  const latest = useRef({ progress, stats, settings, communityPacks, practice })
  useLayoutEffect(() => {
    latest.current = { progress, stats, settings, communityPacks, practice }
  }, [progress, stats, settings, communityPacks, practice])

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
  useEffect(() => persist(save.practice(practice)), [practice, persist])

  // Theme and accent. "system" defers to prefers-color-scheme in CSS; a custom accent is
  // computed for the active theme's light or dark mode. The resolved variables are cached
  // so index.html can apply them before first paint.
  const systemDark = useSystemDark()
  useEffect(() => {
    const root = document.documentElement
    if (THEME_MAP[settings.theme]) root.dataset.theme = settings.theme
    else delete root.dataset.theme
    const theme = resolveTheme(settings.theme, systemDark)
    const vars = accentVars(accentHue(settings.accent), theme.mode)
    for (const name of ACCENT_VAR_NAMES) root.style.removeProperty(name)
    if (vars) {
      root.dataset.accent = String(settings.accent)
      for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
    } else delete root.dataset.accent
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chromeColor(theme))
    try {
      localStorage.setItem('recurse_theme_boot', JSON.stringify({ accent: vars ? String(settings.accent) : null, vars }))
    } catch {
      // Only a paint optimization.
    }
  }, [settings.theme, settings.accent, systemDark])

  // Sound and visual effects are module-level so any component can trigger them.
  useEffect(() => {
    configureSound({ on: settings.sound, level: settings.soundVolume })
    configureEffects(settings.effects)
  }, [settings.sound, settings.soundVolume, settings.effects])

  const packs = useMemo(() => allPacks(communityPacks), [communityPacks])
  const packMap = useMemo(() => new Map(packs.map((p) => [p.id, p])), [packs])
  const callNos = useMemo(() => callNumbers(packs), [packs])
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
    const unlocked = newlyUnlocked({ stats: next.stats, progress: next.progress, packs: allPacks(next.communityPacks), practice: next.practice })
    if (unlocked.length) next.stats = { ...next.stats, achievements: [...(next.stats.achievements || []), ...unlocked] }
    latest.current = next
    if (next.progress !== current.progress) setProgress(next.progress)
    if (next.stats !== current.stats) setStats(next.stats)
    if (next.communityPacks !== current.communityPacks) setCommunityPacks(next.communityPacks)
    if (next.practice !== current.practice) setPractice(next.practice)
    if (unlocked.length) setTimeout(() => sfx.achievement(), 350)
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
      const prior = topic.cards[question.id]
      const card = schedule(prior, rating, { retention: se.desiredRetention, now: at })
      // Remember which learning approach a card was first learned in, for "Your data".
      const learnedIn = prior?.learnedIn || (prior?.reps > 0 ? null : se.learningMode || 'balanced')
      if (learnedIn) card.learnedIn = learnedIn
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

  /** Add XP and a study day without a card review (activities, labs, challenges). */
  const creditDay = (st, at, xp) => {
    const key = dayKey(at)
    const day = { reviews: 0, correct: 0, newCards: 0, seconds: 0, xp: 0, ...(st.days?.[key] || {}) }
    return { ...st, ...applyStudyDay(st, at), xp: (st.xp || 0) + xp, days: { ...st.days, [key]: { ...day, xp: day.xp + xp } } }
  }

  /** A lesson activity's goal was reached. First completion per section earns XP. */
  const recordActivity = useCallback((packId, sectionIndex, result = {}) => {
    const at = new Date()
    let xp = 0
    apply(({ progress: p, stats: st }) => {
      const topic = topicOf(p, packId)
      const first = !topic.activities?.[sectionIndex]
      xp = first ? 15 : 3
      return {
        progress: { ...p, [packId]: { ...topic, activities: { ...topic.activities, [sectionIndex]: { date: at.toISOString(), score: result.score ?? null } } } },
        stats: { ...creditDay(st, at, xp), activitiesDone: (st.activitiesDone || 0) + (first ? 1 : 0) }
      }
    })
    return xp
  }, [apply])

  /** A sandbox activity on the Practice page reached its goal. */
  const recordSandbox = useCallback((type) => {
    const at = new Date()
    apply(({ practice: pr, stats: st }) => ({
      practice: { ...pr, activities: { ...pr.activities, [type]: { date: at.toISOString(), count: (pr.activities?.[type]?.count || 0) + 1 } } },
      stats: creditDay(st, at, pr.activities?.[type] ? 2 : 10)
    }))
  }, [apply])

  /**
   * A console lab or coding challenge was completed. Each gets its own FSRS card, rated
   * from how much help was needed, so it comes back for a redo before the skill fades.
   */
  const recordPractice = useCallback((kind, id, { hintsUsed = 0, solutionUsed = false, score = null, language = null, seconds = 0, difficulty = 'medium' } = {}) => {
    const at = new Date()
    const rating = solutionUsed ? Rating.Again : hintsUsed > 1 ? Rating.Hard : hintsUsed === 1 ? Rating.Good : Rating.Easy
    let xp = 0
    apply(({ practice: pr, stats: st, settings: se }) => {
      const bucket = kind === 'lab' ? 'labs' : 'challenges'
      const prior = pr[bucket]?.[id]
      const base = kind === 'lab' ? 40 : { easy: 30, medium: 50, hard: 80 }[difficulty] ?? 40
      xp = prior?.solved ? Math.round(base / 4) : base
      if (solutionUsed) xp = Math.round(xp / 3)
      const entry = {
        ...prior,
        solved: prior?.solved || at.toISOString(),
        last: at.toISOString(),
        count: (prior?.count || 0) + 1,
        best: Math.max(prior?.best ?? 0, score ?? (solutionUsed ? 0.3 : 1 - Math.min(hintsUsed, 3) * 0.15)),
        hintsUsed,
        solutionUsed: Boolean(prior?.solutionUsed && solutionUsed) || solutionUsed,
        languages: language ? [...new Set([...(prior?.languages || []), language])] : prior?.languages || [],
        card: schedule(prior?.card, rating, { retention: se.desiredRetention, now: at })
      }
      const counter = kind === 'lab' ? 'labsDone' : 'challengesSolved'
      return {
        practice: { ...pr, [bucket]: { ...pr[bucket], [id]: entry } },
        stats: { ...creditDay(st, at, xp), [counter]: (st[counter] || 0) + (prior?.solved ? 0 : 1), totalSeconds: (st.totalSeconds || 0) + Math.min(Math.max(0, seconds), 3600) }
      }
    })
    return xp
  }, [apply])

  /** Save a finished mock interview (see lib/interview) and award its XP. Returns the record. */
  const recordInterview = useCallback((interview) => {
    const at = new Date()
    const record = { id: uid(), date: at.toISOString(), ...interview }
    record.xp = interviewXP(record)
    apply(({ practice: pr, stats: st }) => ({
      practice: { ...pr, interviews: [record, ...(pr.interviews || [])].slice(0, HISTORY_LIMIT) },
      stats: {
        ...creditDay(st, at, record.xp),
        interviewsDone: (st.interviewsDone || 0) + 1,
        totalSeconds: (st.totalSeconds || 0) + Math.min(Math.max(0, interview.seconds || 0), 3 * 3600)
      }
    }))
    return record
  }, [apply])

  const updateProject = useCallback((id, patch) => {
    const at = new Date()
    apply(({ practice: pr, stats: st }) => {
      const prior = pr.projects?.[id] || { status: 'planned', milestones: {}, started: at.toISOString() }
      const next = { ...prior, ...patch, updated: at.toISOString() }
      const finishing = patch.status === 'done' && prior.status !== 'done'
      if (finishing) next.finished = at.toISOString()
      return {
        practice: { ...pr, projects: { ...pr.projects, [id]: next } },
        stats: finishing ? { ...creditDay(st, at, 250), projectsDone: (st.projectsDone || 0) + 1 } : st
      }
    })
  }, [apply])

  /**
   * Save a quiz or exam and feed every answer into the schedule: right answers count as
   * Good reviews, misses as Again, so exam mistakes come back soon.
   */
  const recordExam = useCallback((exam) => {
    const at = new Date()
    const record = { id: uid(), date: at.toISOString(), ...exam }
    apply(({ practice: pr, progress: p, stats: st, settings: se }) => {
      const nextProgress = { ...p }
      let correctCount = 0
      for (const answer of exam.answers || []) {
        const topic = topicOf(nextProgress, answer.packId)
        const card = schedule(topic.cards[answer.questionId], answer.correct ? Rating.Good : Rating.Again, { retention: se.desiredRetention, now: at })
        const mistakes = { ...topic.mistakes }
        if (answer.correct) {
          delete mistakes[answer.questionId]
          correctCount++
        } else mistakes[answer.questionId] = { date: at.toISOString(), given: String(answer.given || '').slice(0, 300), count: (mistakes[answer.questionId]?.count || 0) + 1 }
        nextProgress[answer.packId] = { ...topic, cards: { ...topic.cards, [answer.questionId]: card }, mistakes, lastStudied: at.toISOString() }
      }
      const answered = (exam.answers || []).length
      const xp = Math.round(correctCount * 8 + (exam.mode === 'exam' ? 50 : 10))
      record.xp = xp
      const key = dayKey(at)
      const day = { reviews: 0, correct: 0, newCards: 0, seconds: 0, xp: 0, ...(st.days?.[key] || {}) }
      return {
        progress: nextProgress,
        practice: { ...pr, exams: [{ ...record, answers: (exam.answers || []).map(({ packId, questionId, correct }) => ({ packId, questionId, correct })) }, ...pr.exams].slice(0, 60) },
        stats: {
          ...st,
          ...applyStudyDay(st, at),
          xp: (st.xp || 0) + xp,
          totalReviews: (st.totalReviews || 0) + answered,
          totalCorrect: (st.totalCorrect || 0) + correctCount,
          examsTaken: (st.examsTaken || 0) + (exam.mode === 'exam' ? 1 : 0),
          quizzesTaken: (st.quizzesTaken || 0) + (exam.mode === 'exam' ? 0 : 1),
          days: { ...st.days, [key]: { ...day, reviews: day.reviews + answered, correct: day.correct + correctCount, xp: day.xp + xp, seconds: day.seconds + Math.min(exam.seconds || 0, 4 * 3600) } }
        }
      }
    })
    return record
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
    latest.current = { progress: data.progress, stats: data.stats, settings: data.settings, communityPacks: data.communityPacks, practice: data.practice }
    setProgress(data.progress)
    setStats(data.stats)
    setUser(data.user)
    setAI(data.ai)
    setSettings(data.settings)
    setCommunityPacks(data.communityPacks)
    setLastSession(data.lastSession)
    setPractice(data.practice)
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
    callNos,
    summaries,
    progress,
    stats,
    user,
    ai,
    settings,
    lastSession,
    practice,
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
    recordActivity,
    recordSandbox,
    recordPractice,
    recordInterview,
    updateProject,
    recordExam,
    resetTopic,
    clearMistakes,
    savePack,
    removePack,
    importData,
    resetAll
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
