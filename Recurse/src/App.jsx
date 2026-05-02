import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Bar, Line } from 'react-chartjs-2'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import {
  Rating,
  previewReview,
  scheduleNext,
  createNewCard,
  gradeForIndex,
  gradeLabel
} from './utils/fsrs'
import {
  loadAllPacks,
  initializePackCards,
  importPackFromURL,
  validatePackSchema,
  validateGeneratedPack
} from './utils/packLoader'
import {
  loadProgress,
  saveProgress,
  loadStats,
  saveStats,
  loadUser,
  saveUser,
  loadAIConfig,
  saveAIConfig,
  loadSettings,
  saveSettings,
  saveLastSession,
  loadLastSession,
  exportAllData,
  importAllData,
  resetAllData,
  loadCommunityPacks,
  migrateLegacyStorage
} from './utils/storage'
import {
  calculateRetrievability,
  averageRetrievability,
  getCardsDue,
  topicForgettingWarning,
  retrievabilityTone
} from './utils/retrieval'
import {
  calculateMastery,
  awardXp,
  updateStreak,
  xpForCorrectQuestion,
  streakMultiplier,
  xpToNextLevel
} from './utils/mastery'
import { callAI } from './utils/api'
import { computeUnlockedAchievements, mergeAchievements } from './utils/achievements'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler)

const QUESTION_TYPE_LABELS = {
  mcq: 'Multiple choice',
  'code-fill': 'Code completion',
  debug: 'Debug'
}

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'language', label: 'Languages' },
  { id: 'tools', label: 'Tools' },
  { id: 'cs-theory', label: 'CS Theory' },
  { id: 'security', label: 'Security' },
  { id: 'web', label: 'Web' },
  { id: 'interview', label: 'Interview' }
]

const TOPIC_ORDER = [
  'python-basics',
  'variables-types',
  'loops-functions',
  'oop',
  'data-structures',
  'algorithms',
  'git-basics',
  'linux-cli',
  'networking-basics',
  'cybersecurity-101',
  'javascript-basics',
  'sql-basics',
  'docker-basics',
  'react-basics',
  'system-design-101'
]

function ensureProgressStructure(packs, progress, retention) {
  let changed = false
  const next = { ...progress }
  for (const pack of packs) {
    const initialized = initializePackCards(pack, next)
    if (!next[pack.id] || JSON.stringify(next[pack.id]) !== JSON.stringify(initialized)) {
      next[pack.id] = initialized
      changed = true
    }
    const topic = next[pack.id]
    topic.cards = topic.cards || {}
    topic.mistakeLog = topic.mistakeLog || []
    topic.lessonRead = Boolean(topic.lessonRead)
    topic.mastery = calculateMastery(topic.cards)
    for (const [questionId, card] of Object.entries(topic.cards)) {
      const r = calculateRetrievability(card)
      if (card.retrievability !== r) {
        topic.cards[questionId] = { ...card, retrievability: r }
        changed = true
      }
    }
  }
  return { progress: next, changed }
}

function formatRelativeDate(date) {
  const target = new Date(date)
  const now = new Date()
  const diff = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return `in ${diff} days`
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getStatusBadge(topic) {
  if ((topic?.locked && !topic.unlocked) || topic?.status === 'locked') return 'locked'
  if ((topic?.mastery || 0) >= 90) return 'mastered'
  if ((topic?.mastery || 0) > 0) return 'learning'
  return 'new'
}

function getDifficultyClass(value) {
  return value || 'easy'
}

function safeParseJSON(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function useAppData() {
  const [packs, setPacks] = useState([])
  const [progress, setProgress] = useState(() => loadProgress())
  const [stats, setStats] = useState(() => loadStats())
  const [user, setUser] = useState(() => loadUser())
  const [ai, setAI] = useState(() => loadAIConfig())
  const [settings, setSettings] = useState(() => loadSettings())
  const [session, setSession] = useState(() => loadLastSession())
  const [communityPacks, setCommunityPacks] = useState(() => loadCommunityPacks())
  const [toasts, setToasts] = useState([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [masteredTopic, setMasteredTopic] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [onboardingStep, setOnboardingStep] = useState(() => (!user.onboardingComplete ? 0 : -1))
  const [packImportText, setPackImportText] = useState('')
  const [packImportUrl, setPackImportUrl] = useState('')
  const [packMode, setPackMode] = useState('url')

  useEffect(() => {
    migrateLegacyStorage()
  }, [])

  useEffect(() => {
    loadAllPacks().then((loaded) => setPacks([...loaded, ...communityPacks]))
  }, [communityPacks])

  useEffect(() => {
    if (!packs.length) return
    const { progress: nextProgress, changed } = ensureProgressStructure(packs, progress, settings.desiredRetention)
    if (changed || JSON.stringify(nextProgress) !== JSON.stringify(progress)) {
      setProgress(nextProgress)
      saveProgress(nextProgress)
    }
  }, [packs])

  useEffect(() => saveProgress(progress), [progress])
  useEffect(() => saveStats(stats), [stats])
  useEffect(() => saveUser(user), [user])
  useEffect(() => saveAIConfig(ai), [ai])
  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => {
    saveLastSession(session)
  }, [session])
  useEffect(() => {
    setCommunityPacks(loadCommunityPacks())
  }, [importOpen])

  const addToast = (message) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, message }])
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2800)
  }

  const updateTopic = (topicId, updater) => {
    setProgress((current) => {
      const topic = current[topicId] || { mastery: 0, lessonRead: false, cards: {}, mistakeLog: [] }
      const nextTopic = updater({ ...topic, cards: { ...(topic.cards || {}) }, mistakeLog: [...(topic.mistakeLog || [])] })
      const mastery = calculateMastery(nextTopic.cards)
      const finalTopic = { ...nextTopic, mastery }
      if (mastery >= 90 && (topic.mastery || 0) < 90) {
        setMasteredTopic(topicId)
        addToast(`Achievement unlocked: ${topicId.replace(/-/g, ' ')}`)
      }
      return { ...current, [topicId]: finalTopic }
    })
  }

  const updateStats = (updater) => {
    setStats((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater
      return { ...next, level: Math.floor((next.xp || 0) / 500) + 1 }
    })
  }

  const saveSessionRecord = (record) => {
    setSession(record)
  }

  const completeOnboarding = () => {
    setUser((current) => ({ ...current, onboardingComplete: true }))
    setOnboardingStep(-1)
  }

  const visiblePacks = useMemo(() => {
    const ordered = [...packs].sort((a, b) => TOPIC_ORDER.indexOf(a.id) - TOPIC_ORDER.indexOf(b.id))
    return ordered.filter((pack) => activeFilter === 'all' || pack.category === activeFilter)
  }, [packs, activeFilter])

  const progressWithDerived = useMemo(() => {
    const result = {}
    for (const pack of packs) {
      const topicProgress = progress[pack.id] || { mastery: 0, lessonRead: false, cards: {}, mistakeLog: [] }
      result[pack.id] = {
        ...topicProgress,
        mastery: calculateMastery(topicProgress.cards)
      }
    }
    return result
  }, [packs, progress])

  const summaries = useMemo(() => {
    return packs.map((pack) => {
      const topic = progressWithDerived[pack.id] || { mastery: 0, cards: {}, lessonRead: false }
      const cards = topic.cards || {}
      const averageR = averageRetrievability(cards)
      const studied = Object.values(cards).filter((card) => Number(card.reps) > 0)
      const dueCount = getCardsDue(cards).length
      const unlocked = !pack.prereqs?.length || pack.prereqs.every((prereq) => (progressWithDerived[prereq]?.mastery || 0) >= 40)
      return {
        ...pack,
        mastery: topic.mastery || 0,
        cards,
        studiedCount: studied.length,
        cardCount: pack.questions.length,
        averageR,
        dueCount,
        unlocked,
        warning: topicForgettingWarning(pack.name, averageR)
      }
    })
  }, [packs, progressWithDerived])

  const overallMemory = useMemo(() => {
    const allCards = packs.flatMap((pack) => Object.values((progressWithDerived[pack.id] || {}).cards || {}))
    if (!allCards.length) return 0
    const studied = allCards.filter((card) => Number(card.reps) > 0)
    if (!studied.length) return 0
    return studied.reduce((sum, card) => sum + calculateRetrievability(card), 0) / studied.length
  }, [packs, progressWithDerived])

  useEffect(() => {
    if (!packs.length) return
    const unlocked = computeUnlockedAchievements(stats, progressWithDerived)
    if (unlocked.length) {
      updateStats((current) => mergeAchievements(current, progressWithDerived))
      unlocked.forEach((achievement) => addToast(`Achievement unlocked: ${achievement}`))
    }
  }, [packs, progressWithDerived])

  // When a session finishes, append it to sessionHistory (avoid duplicates)
  useEffect(() => {
    if (!session) return
    if ((stats.sessionHistory || [])[0]?.date === session.date) return
    updateStats((current) => ({
      ...current,
      sessionHistory: [
        session,
        ...(current.sessionHistory || [])
      ],
      lastStudied: session.date
    }))
  }, [session])

  return {
    packs,
    progress,
    setProgress,
    updateTopic,
    progressWithDerived,
    stats,
    updateStats,
    user,
    setUser,
    ai,
    setAI,
    settings,
    setSettings,
    session,
    saveSessionRecord,
    toasts,
    addToast,
    settingsOpen,
    setSettingsOpen,
    onboardingStep,
    setOnboardingStep,
    completeOnboarding,
    importOpen,
    setImportOpen,
    masteredTopic,
    setMasteredTopic,
    activeFilter,
    setActiveFilter,
    visiblePacks,
    summaries,
    overallMemory,
    packImportText,
    setPackImportText,
    packImportUrl,
    setPackImportUrl,
    packMode,
    setPackMode,
    communityPacks,
    setCommunityPacks
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('Unhandled error in App:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="page container">
          <section className="panel">
            <h2>Something went wrong. Your progress is safe.</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="button primary" onClick={() => window.location.reload()}>Reload app</button>
              <button className="button" onClick={() => {
                try { exportAllData() } catch (e) { console.error('Export failed', e) }
              }}>Export my data</button>
            </div>
          </section>
        </div>
      )
    }
    return this.props.children
  }
}

function AppContent() {
  const data = useAppData()
  const location = useLocation()
  const navigate = useNavigate()

  const context = {
    ...data,
    navigate,
    location,
    addToast: data.addToast
  }

  if (data.onboardingStep >= 0) {
    return <OnboardingFlow {...context} />
  }

  return (
    <div className="app-shell">
      <Nav {...context} />
      <Routes>
        <Route path="/" element={<Dashboard {...context} />} />
        <Route path="/onboarding" element={<OnboardingFlow {...context} />} />
        <Route path="/lesson/:topicId" element={<Lesson {...context} />} />
        <Route path="/quiz/:topicId" element={<Quiz {...context} />} />
        <Route path="/debug-quiz/:topicId" element={<DebugQuiz {...context} />} />
        <Route path="/feynman/:topicId" element={<Feynman {...context} />} />
        <Route path="/complete" element={<Complete {...context} />} />
        <Route path="/stats" element={<Stats {...context} />} />
        {import.meta.env.DEV && <Route path="/debug" element={<DebugPanel {...context} />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {data.settingsOpen && <SettingsModal {...context} />}
      {data.importOpen && <PackImportModal {...context} />}
      {data.masteredTopic && <MasteryModal {...context} />}
      <div className="toast-stack">
        {data.toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}

function DebugPanel({ progress, setProgress, packs, updateStats, setMasteredTopic, addToast, stats }) {
  const [dump, setDump] = useState(null)
  const [swRegistered, setSwRegistered] = useState(false)
  const [cacheKeys, setCacheKeys] = useState([])
  const [isStandalone, setIsStandalone] = useState(false)
  const [manifestPresent, setManifestPresent] = useState(false)
  const setStreak = (days) => updateStats((s) => ({ ...s, streak: days, longestStreak: Math.max(days, s.longestStreak || 0) }))
  const setTopicMastery = () => {
    const topicId = packs[0]?.id
    if (!topicId) return
    setProgress((p) => ({ ...p, [topicId]: { ...(p[topicId] || {}), mastery: 90 } }))
    setMasteredTopic(topicId)
    addToast('Set topic mastery to 90%')
  }
  const setCardDueToday = () => {
    const topicId = packs[0]?.id
    if (!topicId) return
    setProgress((p) => {
      const topic = p[topicId] || { cards: {} }
      const firstCardId = Object.keys(topic.cards || {})[0]
      if (!firstCardId) return p
      const next = { ...p }
      next[topicId] = { ...topic, cards: { ...topic.cards, [firstCardId]: { ...topic.cards[firstCardId], due: new Date().toISOString() } } }
      return next
    })
    addToast('Set one card due today')
  }
  const clearAll = () => {
    try { resetAllData(); window.location.reload() } catch (e) { console.error(e) }
  }
  const dumpAll = () => {
    const out = {}
    for (const k in localStorage) {
      try { out[k] = JSON.parse(localStorage.getItem(k)) } catch { out[k] = localStorage.getItem(k) }
    }
    setDump(JSON.stringify(out, null, 2))
  }
  const simulate30 = () => {
    const activity = {}
    for (let i = 0; i < 30; i++) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      activity[day] = Math.floor(Math.random() * 10)
    }
    updateStats((s) => ({ ...s, activityLog: activity }))
    addToast('Simulated 30 days of activity')
  }

  useEffect(() => {
    // service worker registered?
    (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          setSwRegistered(regs && regs.length > 0)
        } else setSwRegistered(false)
      } catch (e) {
        setSwRegistered(false)
      }
      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          setCacheKeys(keys)
        }
      } catch (e) {
        setCacheKeys([])
      }
      try {
        setIsStandalone(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      } catch (e) {
        setIsStandalone(false)
      }
      try {
        setManifestPresent(Boolean(document.querySelector('link[rel="manifest"]')))
      } catch (e) {
        setManifestPresent(false)
      }
    })()
  }, [])

  return (
    <main className="page container">
      <section className="panel">
        <h2>Debug Panel (DEV only)</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="button" onClick={() => setStreak(7)}>Set streak 7</button>
          <button className="button" onClick={() => setStreak(14)}>Set streak 14</button>
          <button className="button" onClick={() => setStreak(30)}>Set streak 30</button>
          <button className="button" onClick={setTopicMastery}>Set topic mastery 90%</button>
          <button className="button" onClick={setCardDueToday}>Set a card due today</button>
          <button className="button" onClick={clearAll}>Clear all localStorage (no confirm)</button>
          <button className="button" onClick={dumpAll}>Dump localStorage</button>
          <button className="button" onClick={simulate30}>Simulate 30 days activity</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <h3>PWA status</h3>
          <div className="grid two">
            <div className="card pad">
              <div>Service worker registered: <strong>{swRegistered ? 'Yes' : 'No'}</strong></div>
              <div>Manifest present: <strong>{manifestPresent ? 'Yes' : 'No'}</strong></div>
              <div>Standalone mode: <strong>{isStandalone ? 'Yes' : 'No'}</strong></div>
            </div>
            <div className="card pad">
              <div>Cache keys:</div>
              <pre style={{ marginTop: 8, maxHeight: 120, overflow: 'auto' }}>{cacheKeys.join('\n') || 'No caches'}</pre>
            </div>
          </div>
        </div>
        {dump && (<pre style={{ marginTop: 12, maxHeight: 400, overflow: 'auto', background: '#071017', padding: 12, color: '#e6f6f0' }}>{dump}</pre>)}
      </section>
    </main>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

function Nav({ navigate, stats, settingsOpen, setSettingsOpen }) {
  const location = useLocation()
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <button className="brand button ghost" onClick={() => navigate('/')}>Recurse</button>
        <div className="nav-links">
          <button className={`nav-link ${location.pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>Learn it. Keep it.</button>
          <button className={`nav-link ${location.pathname === '/stats' ? 'active' : ''}`} onClick={() => navigate('/stats')}>Stats</button>
        </div>
        <div className="topic-topline">
          <span className="badge learning">Lv.{stats.level || 1}</span>
          <span className="space-mono">🔥 {stats.streak || 0}d</span>
          <button className="nav-link" onClick={() => setSettingsOpen(!settingsOpen)}>⚙</button>
        </div>
      </div>
    </header>
  )
}

function MemoryGauge({ value }) {
  const size = 180
  const stroke = 12
  const radius = (size - stroke) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const dash = circumference - (value / 100) * circumference
  const strokeColor = value >= 80 ? 'var(--accent)' : value >= 50 ? 'var(--amber)' : 'var(--red)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={center}
        cy={center}
        r={radius}
        stroke={strokeColor}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={dash}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x="50%" y="52%" textAnchor="middle" className="space-mono" fontSize="28" fill="var(--text-primary)">
        {Math.round(value)}%
      </text>
      <text x="50%" y="66%" textAnchor="middle" fontSize="12" fill="var(--text-secondary)">
        memory health
      </text>
    </svg>
  )
}

function Dashboard({ summaries, overallMemory, navigate, activeFilter, setActiveFilter, setImportOpen, stats, progressWithDerived }) {
  const sorted = [...summaries].sort((a, b) => a.averageR - b.averageR)
  const dueTopics = summaries.filter((topic) => topic.dueCount > 0)
  const mastered = summaries.filter((topic) => topic.mastery >= 90)
  const fadingTopics = sorted.filter((topic) => topic.averageR < 0.5)
  const totalStudied = summaries.reduce((s, t) => s + (t.studiedCount || 0), 0)

  return (
    <main className="page container">
      {fadingTopics.length > 0 && (
        <section className="panel warning-banner" style={{ marginBottom: 16 }}>
          {fadingTopics.slice(0, 3).map((topic) => (
            <div key={topic.id}>{`⚠ ${topic.name} is fading — last reviewed soon`}</div>
          ))}
        </section>
      )}
      <section className="hero">
        <div className="panel">
          <div className="card-heading">
            <div>
              <div className="kicker">Memory Health Panel</div>
              <h1>Your memory health</h1>
              <p className="muted">See what is fading before it slips away.</p>
            </div>
            <MemoryGauge value={overallMemory * 100} />
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {sorted.slice(0, 5).map((topic) => (
              <div key={topic.id} className="session-row">
                <div>
                  <div className="space-mono">{topic.name}</div>
                  <div className="small muted">Memory: {Math.round(topic.averageR * 100)}%</div>
                </div>
                <span className={`badge ${topic.averageR < 0.6 ? 'hard' : topic.averageR < 0.8 ? 'medium' : 'mastered'}`}>
                  {topic.averageR < 0.6 ? 'Fading' : topic.averageR < 0.8 ? 'Review soon' : 'Stable'}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <div className="card-heading">
              <div>
                <div className="kicker">Quick 5</div>
                <h2>Daily mix · 5 questions · ~8 min</h2>
                <p className="muted">Interleaved — mixes topics to fight forgetting.</p>
              </div>
            </div>
            {totalStudied > 0 ? <button className="button primary" onClick={() => navigate('/quiz/quick5')}>Start</button> : <div className="muted">Complete a topic first to unlock the daily mix</div>}
          </div>
          <div className="panel">
            <div className="card-heading">
              <div>
                <div className="kicker">Due for review</div>
                <h2>{dueTopics.length} topics due</h2>
              </div>
            </div>
            <div className="grid" style={{ gap: 10 }}>
              {dueTopics.length === 0 && <p className="muted">Nothing is due right now.</p>}
              {dueTopics.map((topic) => (
                <div key={topic.id} className="session-row">
                  <div>
                    <div>{topic.name}</div>
                    <div className="small muted">{topic.dueCount} cards due</div>
                  </div>
                  <button className="button" onClick={() => navigate(`/quiz/${topic.id}`)}>Study</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="card-heading">
          <div>
            <div className="kicker">Filters</div>
            <h2>All topics</h2>
          </div>
          <div className="topic-actions">
            {CATEGORY_FILTERS.map((filter) => (
              <button key={filter.id} className={`filter-button ${activeFilter === filter.id ? 'active' : ''}`} onClick={() => setActiveFilter(filter.id)}>
                {filter.label}
              </button>
            ))}
            <button className="button" onClick={() => setImportOpen(true)}>+ Import pack</button>
          </div>
        </div>
        <div className="grid two">
          {summaries.map((topic) => (
            <TopicCard key={topic.id} topic={topic} navigate={navigate} progress={progressWithDerived[topic.id]} />
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="card-heading">
          <div>
            <div className="kicker">Learning methods</div>
            <h2>How Recurse teaches you</h2>
          </div>
        </div>
        <div className="grid two">
          {[
            ['Spaced repetition', 'The app schedules the right question right before you forget it again.'],
            ['Active recall', 'Trying to remember is the workout, not re-reading the answer.'],
            ['Feynman technique', 'Explaining it simply exposes vague understanding instantly.'],
            ['Interleaving', 'Mixing topics makes your brain choose the right idea under pressure.']
          ].map(([title, body]) => (
            <div key={title} className="card pad">
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function TopicCard({ topic, navigate, progress }) {
  const badge = getStatusBadge(topic)
  const locked = !topic.unlocked
  const lapseCount = Object.values(topic.cards || {}).reduce((sum, card) => sum + (card.lapses || 0), 0)
  const masteredButFading = topic.mastery >= 90 && topic.averageR < 0.7
  return (
    <article className="card pad topic-card">
      <div className="topic-topline">
        <div>
          <div className="space-mono">{topic.name}</div>
          <div className="small muted">{topic.category}</div>
        </div>
        <span className={`badge ${locked ? 'locked' : masteredButFading ? 'hard' : badge}`}>{locked ? 'Locked' : masteredButFading ? 'Needs refresh' : badge.charAt(0).toUpperCase() + badge.slice(1)}</span>
      </div>
      <div>
        <div className="metric-row"><span>Mastery</span><span className="space-mono">{Math.round(topic.mastery)}%</span></div>
        <div className="progress"><div className="progress-bar" style={{ width: `${topic.mastery}%` }} /></div>
      </div>
      <div>
        <div className="metric-row"><span>Memory</span><span className="space-mono" style={{ color: topic.averageR >= 0.8 ? 'var(--accent)' : topic.averageR >= 0.5 ? 'var(--amber)' : 'var(--red)' }}>{Math.round(topic.averageR * 100)}%</span></div>
        <div className="small muted">{topic.warning || `${topic.studiedCount}/${topic.cardCount} cards studied`}</div>
        {lapseCount > 0 && <div className="small muted">⚡ {lapseCount} lapses</div>}
        {lapseCount >= 3 && <div className="badge hard" style={{ marginTop: 8 }}>Troublesome</div>}
      </div>
      <div className="topic-actions">
        <button className="button" onClick={() => navigate(`/lesson/${topic.id}`)} disabled={locked}>Lesson</button>
        <button className="button primary" onClick={() => navigate(`/quiz/${topic.id}`)} disabled={locked}>Study</button>
      </div>
    </article>
  )
}

function Lesson({ packs, progressWithDerived, updateTopic, navigate }) {
  const { topicId } = useParams()
  const topic = packs.find((pack) => pack.id === topicId)
  const lesson = topic?.lesson
  const topicProgress = progressWithDerived[topicId]
  const [openTerm, setOpenTerm] = useState(null)
  const [readingProgress, setReadingProgress] = useState(0)
  const [copiedCode, setCopiedCode] = useState(null)
  const [completedSections, setCompletedSections] = useState(new Set())
  const containerRef = useRef(null)

  useEffect(() => {
    if (!topic || !lesson) return
    if (typeof window !== 'undefined' && window.hljs) {
      window.hljs.highlightAll()
    }
  }, [topicId, lesson])

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const scrollTop = window.scrollY
        const docHeight = document.documentElement.scrollHeight - window.innerHeight
        const scrolled = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
        setReadingProgress(Math.min(scrolled, 100))
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 1500)
  }

  const handleCompleteSection = (index) => {
    setCompletedSections((prev) => new Set(prev).add(index))
  }

  const scrollToSection = (index) => {
    const element = document.querySelector(`[data-section="${index}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      element.focus()
    }
  }

  if (!topic) return <Navigate to="/" replace />

  const totalSections = lesson?.sections?.length || 1

  return (
    <main className="page container" ref={containerRef}>
      <div style={{ position: 'fixed', top: 0, left: 0, width: `${readingProgress}%`, height: 3, background: 'var(--accent)', zIndex: 101, transition: 'width 0.1s ease' }} />
      
      <div className="sticky-step">
        <div className="panel">
          <div className="card-heading">
            <div>
              <h1>{topic.name}</h1>
              <p className="muted">~{lesson.estimatedMinutes} min read</p>
            </div>
            <span className="badge mastered">Section {Math.min(completedSections.size + 1, totalSections)} of {totalSections}</span>
          </div>
          <div className="progress"><div className="progress-bar" style={{ width: `${(completedSections.size / totalSections) * 100}%` }} /></div>
        </div>
      </div>
      
      <div className="grid" style={{ gap: 16 }}>
        {lesson.sections.map((section, index) => (
          <section key={section.title} className="panel" data-section={index}>
            <h2>{section.title}</h2>
            <p className="muted">{section.body}</p>
            
            <div className="code-block-wrapper">
              <button 
                className="code-copy-button" 
                onClick={() => handleCopyCode(section.code)}
              >
                {copiedCode === section.code ? '✓ Copied!' : 'Copy'}
              </button>
              <pre className="code-block"><code className="language-python">{section.code}</code></pre>
            </div>
            
            <p className="small subtle">💡 Tip: {section.tip}</p>
            
            {!completedSections.has(index) && (
              <div className="section-check">
                <strong>Quick check: Did you understand this section?</strong>
                <div className="topic-actions" style={{ marginTop: 10 }}>
                  <button className="button primary" onClick={() => handleCompleteSection(index)}>
                    ✓ Yes, continue
                  </button>
                  <button className="button" onClick={() => scrollToSection(index)}>
                    ← Review again
                  </button>
                </div>
              </div>
            )}
          </section>
        ))}
        
        <section className="panel">
          <h2>Key terms</h2>
          <div className="grid" style={{ gap: 10 }}>
            {lesson.keyTerms.map((term, idx) => (
              <div key={term.term} className={`term-accordion ${openTerm === term.term ? 'open' : ''}`}>
                <button 
                  className="button ghost" 
                  onClick={() => setOpenTerm(openTerm === term.term ? null : term.term)}
                  style={{ width: '100%' }}
                >
                  <div className="session-row">
                    <strong>{term.term}</strong>
                    <span>{openTerm === term.term ? '−' : '+'}</span>
                  </div>
                </button>
                <div className="term-accordion-content">
                  <div className="small muted" style={{ paddingLeft: 12, paddingTop: 8 }}>{term.definition}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
        
        <div className="footer-actions">
          <button className="button primary" onClick={() => {
            updateTopic(topicId, (current) => ({ ...current, lessonRead: true }))
            navigate(`/quiz/${topicId}`)
          }}>Start Quiz →</button>
        </div>
      </div>
    </main>
  )
}

function pickQuestionsForSession(packs, progressWithDerived, topicId) {
  const pack = packs.find((entry) => entry.id === topicId)
  if (!pack) return []

  if (topicId === 'quick5') {
    const byTopic = packs.map((entry) => ({
      pack: entry,
      topic: progressWithDerived[entry.id] || { cards: {}, mastery: 0 }
    }))
    const candidates = []

    for (const { pack: topicPack, topic } of byTopic) {
      const relearning = Object.entries(topic.cards || {})
        .filter(([, card]) => card?.state === 'Relearning')
        .map(([questionId, card]) => ({ pack: topicPack, question: topicPack.questions.find((entry) => entry.id === questionId), priority: 0, retrievability: calculateRetrievability(card) }))
      const dueCards = getCardsDue(topic.cards || {})
        .map(({ questionId, card }) => ({ pack: topicPack, question: topicPack.questions.find((entry) => entry.id === questionId), priority: 1, retrievability: calculateRetrievability(card) }))
      const staleTopics = Object.entries(topic.cards || {})
        .filter(([, card]) => Number(card?.reps) > 0)
        .map(([questionId, card]) => ({ pack: topicPack, question: topicPack.questions.find((entry) => entry.id === questionId), priority: 2, retrievability: calculateRetrievability(card) }))
      const newCards = topicPack.questions
        .filter((question) => !topic.cards?.[question.id])
        .map((question) => ({ pack: topicPack, question, priority: 3, retrievability: 0 }))
      candidates.push(...relearning, ...dueCards, ...staleTopics, ...newCards)
    }

    const seenIds = new Set()
    const selected = []
    const topicSpread = new Set()

    for (const entry of candidates.sort((a, b) => a.priority - b.priority || a.retrievability - b.retrievability)) {
      if (!entry.question || seenIds.has(entry.question.id)) continue
      seenIds.add(entry.question.id)
      topicSpread.add(entry.pack.id)
      selected.push(entry)
      if (selected.length === 5 && topicSpread.size >= 2) break
    }

    if (selected.length < 5) {
      for (const { pack: topicPack, topic } of byTopic.sort((a, b) => a.topic.mastery - b.topic.mastery)) {
        const nextQuestion = topicPack.questions.find((question) => !seenIds.has(question.id))
        if (nextQuestion) {
          seenIds.add(nextQuestion.id)
          topicSpread.add(topicPack.id)
          selected.push({ pack: topicPack, question: nextQuestion, priority: 4, retrievability: 0 })
        }
        if (selected.length === 5 && topicSpread.size >= 2) break
      }
    }

    return selected.slice(0, 5).map((entry) => ({ ...entry.question, topicId: entry.pack.id, topicName: entry.pack.name, topicPack: entry.pack }))
  }

  if (topicId === 'mistakes') {
    // Collect recent mistakes across topics
    const mistakes = []
    for (const pack of packs) {
      const topic = progressWithDerived[pack.id] || { mistakeLog: [] }
      for (const m of (topic.mistakeLog || []).slice(0, 50)) {
        const question = pack.questions.find((q) => q.id === m.questionId)
        if (question) mistakes.push({ ...question, topicId: pack.id, topicName: pack.name, meta: m })
      }
    }
    // return up to 10 recent mistakes
    return mistakes.slice(0, 10).map((q) => ({ ...q, topicPack: packs.find((p) => p.id === q.topicId) }))
  }

  return (pack.questions || []).slice(0, 5).map((question) => ({ ...question, topicId: pack.id, topicName: pack.name, topicPack: pack }))
}

function QuizBase({ packs, progressWithDerived, updateTopic, updateStats, saveSessionRecord, settings, navigate, mode = 'quiz' }) {
  const { topicId } = useParams()
  const sessionQuestions = useMemo(() => pickQuestionsForSession(packs, progressWithDerived, mode === 'debug' ? topicId : topicId), [packs, progressWithDerived, topicId, mode])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [rated, setRated] = useState(false)
  const [rating, setRating] = useState(null)
  const [answers, setAnswers] = useState([])
  const [sessionXp, setSessionXp] = useState(0)
  const [startedAt] = useState(Date.now())
  const [seconds, setSeconds] = useState(0)
  const [timerMinimized, setTimerMinimized] = useState(false)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.hljs) window.hljs.highlightAll()
  }, [index, selected])

  useEffect(() => {
    setSelected(null)
    setRated(false)
    setRating(null)
    setAnswers([])
    setSessionXp(0)
    setIndex(0)
    setSeconds(0)
  }, [topicId, mode])

  useEffect(() => {
    if (topicId !== 'quick5' && (progressWithDerived[topicId]?.mastery || 0) === 0 && !progressWithDerived[topicId]?.lessonRead && mode === 'quiz') {
      navigate(`/lesson/${topicId}`, { replace: true })
    }
  }, [topicId, mode, progressWithDerived, navigate])

  useEffect(() => {
    const handler = (event) => {
      const key = event.key.toLowerCase()
      if (selected === null && ['a', 'b', 'c', 'd'].includes(key)) {
        const value = 'abcd'.indexOf(key)
        setSelected(value)
      }
      if (selected !== null && !rated && ['1', '2', '3', '4'].includes(key)) {
        rateCard(Number(key) - 1)
      }
      if (key === 'escape') {
        setExitConfirmOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rated, selected])

  // Auto-advance after rating
  useEffect(() => {
    if (rated) {
      const timer = setTimeout(() => {
        if (index === sessionQuestions.length - 1) {
          navigate('/complete')
        } else {
          setIndex((value) => value + 1)
          setSelected(null)
          setRated(false)
          setRating(null)
        }
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [rated, index, sessionQuestions.length, navigate])

  const current = sessionQuestions[index]
  const preview = current ? previewReview(progressWithDerived[current.topicId]?.cards?.[current.id] || createNewCard(new Date()), settings.desiredRetention) : null

  if (!current) {
    return <Navigate to="/complete" replace state={{ fromQuiz: true }} />
  }

  const isCorrect = selected !== null && current.answer === selected

  function rateCard(choiceIndex) {
    const grade = gradeForIndex(choiceIndex)
    const topicIdForQuestion = current.topicId
    const prevTopic = progressWithDerived[topicIdForQuestion] || { cards: {}, mistakeLog: [], mastery: 0 }
    const prevCard = prevTopic.cards[current.id] || createNewCard(new Date())
    const nextCard = scheduleNext(prevCard, settings.desiredRetention, grade, new Date())
    const answeredCorrectly = current.answer === selected
    const wasFirstStudy = !(prevCard?.reps > 0)
    const nextTopicSnapshot = {
      ...prevTopic,
      cards: {
        ...prevTopic.cards,
        [current.id]: { ...nextCard, retrievability: calculateRetrievability(nextCard) }
      }
    }
    const masteryAfter = calculateMastery(nextTopicSnapshot.cards)
    const earnedXp = (answeredCorrectly ? Math.round(xpForCorrectQuestion(current.type) * streakMultiplier(stats.streak || 0)) : 0) + (wasFirstStudy ? 50 : 0) + (!answeredCorrectly ? 0 : masteryAfter >= 90 && prevTopic.mastery < 90 ? 100 : 0)
    const nextSessionXp = sessionXp + earnedXp
    setSessionXp(nextSessionXp)
    updateTopic(topicIdForQuestion, (topic) => ({
      ...topic,
      cards: {
        ...topic.cards,
        [current.id]: { ...nextCard, retrievability: calculateRetrievability(nextCard) }
      },
      mistakeLog: answeredCorrectly
        ? topic.mistakeLog
        : [
            {
              questionId: current.id,
              yourAnswer: current.choices[selected] || '',
              correctAnswer: current.choices[current.answer],
              concept: current.concept,
              topic: current.topicName,
              type: current.type,
              date: new Date().toISOString()
            },
            ...(topic.mistakeLog || [])
          ]
    }))
    const todayKey = new Date().toISOString().slice(0, 10)
    updateStats((currentStats) => {
      const streakUpdated = updateStreak(currentStats, new Date())
      const typeMap = {
        mcq: 'mcq',
        'code-fill': 'codeFill',
        debug: 'debug'
      }
      const typeKey = typeMap[current.type] || 'mcq'
      const totalKey = `${typeKey}Total`
      const correctKey = `${typeKey}Correct`
      return {
        ...currentStats,
        xp: currentStats.xp + earnedXp,
        totalQuestions: (currentStats.totalQuestions || 0) + 1,
        totalCorrect: (currentStats.totalCorrect || 0) + (answeredCorrectly ? 1 : 0),
        totalTimeStudied: (currentStats.totalTimeStudied || 0) + 1,
        [totalKey]: (currentStats[totalKey] || 0) + 1,
        [correctKey]: answeredCorrectly ? (currentStats[correctKey] || 0) + 1 : (currentStats[correctKey] || 0),
        debugCorrect: current.type === 'debug' && answeredCorrectly ? (currentStats.debugCorrect || 0) + 1 : currentStats.debugCorrect || 0,
        activityLog: {
          ...(currentStats.activityLog || {}),
          [todayKey]: (currentStats.activityLog?.[todayKey] || 0) + 1
        },
        ...streakUpdated
      }
    })
    const answeredQuestion = { ...current, selected, correct: current.answer, isCorrect: answeredCorrectly }
    const nextAnswers = [...answers, answeredQuestion]
    setAnswers(nextAnswers)
    if (index === sessionQuestions.length - 1) {
      const correctCount = nextAnswers.filter((item) => item.isCorrect).length
      const score = Math.round((correctCount / sessionQuestions.length) * 100)
      const sessionSummary = {
        date: new Date().toISOString(),
        topicId: topicId === 'quick5' ? 'quick5' : topicId,
        mode: mode === 'debug' ? 'debug' : topicId === 'quick5' ? 'quick5' : 'quiz',
        score,
        xpEarned: nextSessionXp,
        durationMinutes: Math.max(1, Math.round((Date.now() - startedAt) / 60000))
      }
      saveSessionRecord(sessionSummary)
    }
    setRated(true)
    setRating(['Again', 'Hard', 'Good', 'Easy'][choiceIndex])
  }

  return (
    <>
      {exitConfirmOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Exit quiz?</h2>
            <p className="muted">Your progress for questions you already answered will be saved, but this session won't be recorded.</p>
            <div className="modal-actions">
              <button className="button" onClick={() => setExitConfirmOpen(false)}>Continue quiz</button>
              <button className="button danger" onClick={() => navigate('/')}>Exit anyway</button>
            </div>
          </div>
        </div>
      )}
      <main className="page container">
        {settings.pomodoroEnabled && <PomodoroTimer minimized={timerMinimized} setMinimized={setTimerMinimized} workMinutes={settings.workMinutes} breakMinutes={settings.breakMinutes} active />}
        <div className="sticky-step">
          <div className="panel">
            <div className="quiz-header">
              <button 
                className="button" 
                onClick={() => setExitConfirmOpen(true)}
                title="Exit quiz (Esc)"
                style={{ padding: '6px 10px' }}
              >
                ✕ Exit
              </button>
              <div>
                <div className="kicker">{mode === 'debug' ? 'Debug Mode — find the bug' : current.topicName}</div>
                <div className="small muted">Question {index + 1} of {sessionQuestions.length}</div>
              </div>
              <div className="space-mono">{formatTime(seconds)}</div>
            </div>
            <div className="progress"><div className="progress-bar" style={{ width: `${((index + 1) / sessionQuestions.length) * 100}%` }} /></div>
          </div>
        </div>
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="topic-topline">
            <span className="badge">{QUESTION_TYPE_LABELS[current.type]}</span>
            <span className={`badge ${getDifficultyClass(current.difficulty)}`}>{current.difficulty}</span>
          </div>
          <h2>{current.question || current.prompt}</h2>
          {current.code && <pre className="code-block"><code className={`language-${current.type === 'debug' ? 'python' : 'python'}`}>{current.code}</code></pre>}
          <div className="choice-grid">
            {current.choices.map((choice, choiceIndex) => {
              const selectedState = selected === choiceIndex
              const correctState = selected !== null && current.answer === choiceIndex
              const wrongState = selected !== null && selected === choiceIndex && current.answer !== choiceIndex
              return (
                <button
                  key={choice}
                  className={`choice-button ${selectedState ? 'selected' : ''} ${correctState ? 'correct' : ''} ${wrongState ? 'wrong' : ''}`}
                  onClick={() => {
                    if (selected === null) setSelected(choiceIndex)
                  }}
                  disabled={selected !== null}
                >
                  <span className="choice-letter">{selectedState && current.answer === choiceIndex ? '✓' : String.fromCharCode(65 + choiceIndex)}</span>
                  {choice}
                </button>
              )
            })}
          </div>
          {selected !== null && (
            <div className="panel slide-in" style={{ marginTop: 16 }}>
              <div className={isCorrect ? 'good-text' : 'bad-text'}>{isCorrect ? 'Correct' : 'Incorrect'}</div>
              <p className="muted"><strong>Concept:</strong> {current.concept}</p>
              <p className="muted">{current.explanation}</p>
              {current.type === 'debug' && <p className="muted">The bug: one line is subtly wrong; trace the indexing, keyword, or function signature carefully.</p>}
              <div className="rating-grid" style={{ marginTop: 12 }}>
                {[
                  { label: 'Again', subtitle: `Review: ${formatRelativeDate(preview?.[Rating.Again]?.card?.due || new Date())}` },
                  { label: 'Hard', subtitle: `Review: ${formatRelativeDate(preview?.[Rating.Hard]?.card?.due || new Date())}` },
                  { label: 'Good', subtitle: `Review: ${formatRelativeDate(preview?.[Rating.Good]?.card?.due || new Date())}` },
                  { label: 'Easy', subtitle: `Review: ${formatRelativeDate(preview?.[Rating.Easy]?.card?.due || new Date())}` }
                ].map((entry, choiceIndex) => (
                  <button
                    key={entry.label}
                    className={`choice-button ${!rated ? 'pulsing-highlight' : ''}`}
                    disabled={rated}
                    onClick={() => rateCard(choiceIndex)}
                  >
                    <div className="space-mono">{entry.label}</div>
                    <div className="small muted">{entry.subtitle}</div>
                  </button>
                ))}
              </div>
              {!rated && (
                <button 
                  className="button" 
                  onClick={() => rateCard(1)}
                  style={{ marginTop: 12, width: '100%' }}
                >
                  Next → (auto-advance in 2 seconds)
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  )
}

function Quiz(props) {
  return <QuizBase {...props} mode="quiz" />
}

function DebugQuiz(props) {
  return <QuizBase {...props} mode="debug" />
}

function Feynman({ packs, progressWithDerived, updateStats, updateTopic, navigate, addToast }) {
  const { topicId } = useParams()
  const topic = packs.find((pack) => pack.id === topicId)
  const topicProgress = progressWithDerived[topicId]
  const lesson = topic?.lesson
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    if (topicProgress && topicProgress.mastery < 40) {
      navigate('/')
    }
  }, [topicId, topicProgress])

  if (!topic) return <Navigate to="/" replace />

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length

  async function submit() {
    setLoading(true)
    try {
      const response = await callAI(
        `You are a CS tutor evaluating a student's explanation.\nThe student must explain the concept simply and accurately.\nReturn ONLY a JSON object with these exact keys:\n{\n  "score": number 0-100,\n  "correct": "what they explained well (2-3 sentences)",\n  "gaps": "key things they missed (2-3 sentences)",\n  "misconceptions": "anything factually wrong (or 'None')",\n  "suggestion": "a model simple explanation in 3-4 sentences"\n}\nBe encouraging. Focus on understanding, not memorization.`,
        `Topic: ${topic.name}\n\nStudent explanation:\n${text}`
      )
      const parsed = safeParseJSON(response.match(/\{[\s\S]*\}/)?.[0] || response, {
        score: 0,
        correct: '',
        gaps: '',
        misconceptions: 'None',
        suggestion: ''
      })
      setFeedback(parsed)
      updateStats((current) => ({
        ...current,
        xp: current.xp + 30 + Math.max(0, (parsed.score || 0) - 50) * 5,
        sessionHistory: [
          {
            date: new Date().toISOString(),
            topicId,
            mode: 'feynman',
            score: parsed.score || 0,
            xpEarned: 30 + Math.max(0, (parsed.score || 0) - 50) * 5,
            durationMinutes: 0
          },
          ...(current.sessionHistory || [])
        ]
      }))
      if (typeof updateTopic === 'function') {
        updateTopic(topicId, (current) => ({ ...current, lastFeynmanDate: new Date().toISOString() }))
      }
      addToast('Feynman attempt saved')
    } catch (error) {
      setFeedback({ score: 0, correct: '', gaps: String(error.message || error), misconceptions: 'None', suggestion: '' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page container">
      <section className="panel">
        <div className="kicker">Feynman Mode</div>
        <h1>Feynman Mode — {topic.name}</h1>
        <p className="muted">Writing it out exposes exactly what you do not know yet.</p>
        <p className="small subtle">{lesson?.feynmanPrompt}</p>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={lesson?.feynmanPrompt} />
        <div className="session-row" style={{ marginTop: 10 }}>
          <span className={wordCount >= 60 ? 'good-text' : 'bad-text'}>{wordCount} / 60 words minimum</span>
          <button className="button primary" onClick={submit} disabled={wordCount < 60 || loading}>
            {loading ? 'Analyzing your explanation...' : 'Submit for AI feedback'}
          </button>
        </div>
      </section>
      {feedback && (
        <section className="grid two" style={{ marginTop: 16 }}>
          <div className="card pad"><h3 className="good-text">What you got right</h3><p>{feedback.correct}</p></div>
          <div className="card pad"><h3 className="warn-text">Gaps in your explanation</h3><p>{feedback.gaps}</p></div>
          {feedback.misconceptions !== 'None' && <div className="card pad"><h3 className="bad-text">Misconceptions to fix</h3><p>{feedback.misconceptions}</p></div>}
          <div className="card pad"><h3 className="purple-text">A clearer way to put it</h3><p>{feedback.suggestion}</p></div>
        </section>
      )}
    </main>
  )
}

function Complete({ session, progressWithDerived, navigate, stats }) {
  const currentSession = session || { topicId: 'quick5', mode: 'quiz', score: 0, xpEarned: 0, durationMinutes: 0 }
  const topic = Object.values(progressWithDerived).find((_topic, key) => key === currentSession.topicId)
  const topTopics = Object.entries(progressWithDerived)
    .map(([topicId, topicProgress]) => ({ topicId, mastery: topicProgress.mastery || 0 }))
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 3)
  const masteryBefore = 45
  const masteryAfter = 58

  return (
    <main className="page container">
      <section className="panel">
        <div className="kicker">Session complete</div>
        <h1 className="space-mono">{currentSession.score || 0}%</h1>
        <div className="grid two">
          <div className="card pad">
            <h3>XP breakdown</h3>
            <p className="muted">Base: {currentSession.xpEarned || 0} XP</p>
            <p className="muted">Perfect bonus: +20 XP</p>
            <p className="muted">Streak bonus: +0 XP</p>
            <p className="space-mono">Total: {currentSession.xpEarned || 0} XP</p>
          </div>
          <div className="card pad">
            <h3>Memory health change</h3>
            <p className="space-mono">Average memory strength: 71% → 79%</p>
          </div>
        </div>
        <div className="card pad" style={{ marginTop: 16 }}>
          <h3>Next recommended</h3>
          <p className="muted">Start with the lowest mastery unlocked topic from your dashboard.</p>
        </div>
        <div className="footer-actions" style={{ marginTop: 16 }}>
          <button className="button" onClick={() => navigate('/')}>Back to learn</button>
          <button className="button primary" onClick={() => navigate(`/quiz/${currentSession.topicId || 'quick5'}`)}>Study again</button>
          {(progressWithDerived[currentSession.topicId]?.mastery || 0) >= 40 && (typeof window !== 'undefined' && window.localStorage && JSON.parse(localStorage.getItem('recurse_ai') || '{}')?.apiKey) && (
            <button className="button" onClick={() => navigate(`/feynman/${currentSession.topicId || 'python-basics'}`)}>Try Feynman →</button>
          )}
        </div>
      </section>
      {topTopics.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Top topics</h2>
          <div className="grid two">
            {topTopics.map((topic) => (
              <div key={topic.topicId} className="card pad">
                <div className="space-mono">{topic.topicId.replace(/-/g, ' ')}</div>
                <div className="progress" style={{ marginTop: 8 }}><div className="progress-bar" style={{ width: `${topic.mastery}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function Stats({ packs, progressWithDerived, stats, navigate, user }) {
  const [activeTab, setActiveTab] = useState('overview')
  const topicStats = packs.map((pack) => ({
    ...pack,
    mastery: progressWithDerived[pack.id]?.mastery || 0,
    cards: progressWithDerived[pack.id]?.cards || {},
    lapses: Object.values(progressWithDerived[pack.id]?.cards || {}).reduce((sum, card) => sum + (card.lapses || 0), 0)
  }))

  const accuracy = stats.totalQuestions ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100) : 0
  const sessions = stats.sessionHistory?.length || 0

  const hasData = (stats.totalQuestions || 0) > 0 || (stats.sessionHistory || []).length > 0
  if (!hasData) {
    return (
      <main className="page container">
        <section className="panel">
          <h2>No data yet</h2>
          <p className="muted">No data yet. Start studying to see your progress and charts.</p>
          <div style={{ marginTop: 12 }}>
            <button className="button primary" onClick={() => navigate('/')}>Start learning →</button>
          </div>
        </section>
      </main>
    )
  }

  // Heatmap values (28 days)
  const heatValues = Array.from({ length: 28 }, (_, index) => stats.activityLog?.[new Date(Date.now() - (27 - index) * 86400000).toISOString().slice(0, 10)] || 0)
  const heatLevels = heatValues.map((value) => (value > 20 ? 4 : value > 12 ? 3 : value > 5 ? 2 : value > 0 ? 1 : 0))

  // XP over last 30 days from sessionHistory
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10)
    const total = (stats.sessionHistory || []).filter((s) => s.date?.startsWith(day)).reduce((sum, s) => sum + (s.xpEarned || 0), 0)
    return { day, total }
  })
  const xpData = {
    labels: last30.map((d) => d.day.slice(5)),
    datasets: [{ label: 'XP', data: last30.map((d) => d.total), borderColor: '#388bfd', backgroundColor: 'rgba(56,139,253,0.12)', fill: true, tension: 0.3 }]
  }

  // Accuracy by question type (computed from tracked stats)
  const mcqTotal = stats.mcqTotal || 0
  const mcqCorrect = stats.mcqCorrect || 0
  const codeFillTotal = stats.codeFillTotal || 0
  const codeFillCorrect = stats.codeFillCorrect || 0
  const debugTotal = stats.debugTotal || 0
  const debugCorrect = stats.debugCorrect || 0
  const typeAccuracy = {
    labels: ['MCQ', 'Code-fill', 'Debug'],
    datasets: [{
      label: 'Accuracy',
      data: [mcqTotal ? Math.round((mcqCorrect / mcqTotal) * 100) : 0, codeFillTotal ? Math.round((codeFillCorrect / codeFillTotal) * 100) : 0, debugTotal ? Math.round((debugCorrect / debugTotal) * 100) : 0],
      backgroundColor: ['#00e38c', '#f0a500', '#e05c5c']
    }]
  }

  function createProgressImage() {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 300
    const ctx = canvas.getContext('2d')
    // background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // user
    const name = (user?.name || 'Learner')
    ctx.fillStyle = '#fff'
    ctx.font = '24px sans-serif'
    ctx.fillText(name, 24, 48)
    // XP, level, streak
    ctx.fillStyle = '#00e38c'
    ctx.font = '18px monospace'
    ctx.fillText(`XP: ${stats.xp || 0}`, 24, 84)
    ctx.fillStyle = '#388bfd'
    ctx.fillText(`Level: ${stats.level || 1}`, 160, 84)
    ctx.fillStyle = '#f0a500'
    ctx.fillText(`Streak: ${stats.streak || 0}d`, 260, 84)
    // top 3 mastery bars
    const top = Object.entries(progressWithDerived).map(([id, p]) => ({ id, mastery: p.mastery || 0 })).sort((a, b) => b.mastery - a.mastery).slice(0, 3)
    top.forEach((t, i) => {
      const y = 120 + i * 40
      ctx.fillStyle = '#fff'
      ctx.font = '16px sans-serif'
      ctx.fillText(t.id.replace(/-/g, ' '), 24, y + 12)
      ctx.fillStyle = '#222'
      ctx.fillRect(160, y, 380, 18)
      ctx.fillStyle = '#00e38c'
      ctx.fillRect(160, y, Math.max(6, (t.mastery || 0) / 100 * 380), 18)
      ctx.fillStyle = '#fff'
      ctx.font = '12px monospace'
      ctx.fillText(`${Math.round(t.mastery)}%`, 552, y + 12)
    })
    // export
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'recurse-progress.png'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <main className="page container">
      <section className="grid three">
        <MetricCard label="Total questions" value={stats.totalQuestions || 0} />
        <MetricCard label="Sessions" value={sessions} />
        <MetricCard label="Best streak" value={stats.longestStreak || 0} />
        <MetricCard label="Avg accuracy" value={`${accuracy}%`} />
        <MetricCard label="Hours studied" value={((stats.totalTimeStudied || 0) / 60).toFixed(1)} />
      </section>
      <section className="grid two" style={{ marginTop: 16 }}>
        <div className="panel"><h2>Memory health</h2><Line data={lineData} /></div>
        <div className="panel"><h2>XP + level</h2><Line data={xpData} /></div>
      </section>
      <section className="grid two" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2>Mastery bars</h2>
          {topicStats.map((topic) => (
            <div key={topic.id} style={{ marginBottom: 10 }}>
              <div className="session-row"><span>{topic.name}</span><span className="space-mono">{Math.round(topic.mastery)}%</span></div>
              <div className="progress"><div className="progress-bar" style={{ width: `${topic.mastery}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="card-heading">
            <div>
              <h2>Accuracy by type</h2>
              <div className="small muted">Breakdown of correct answers by question type</div>
            </div>
            <div className="topic-actions">
              <button className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
              <button className={`tab-button ${activeTab === 'mistakes' ? 'active' : ''}`} onClick={() => setActiveTab('mistakes')}>Mistake Journal</button>
            </div>
          </div>
          {activeTab === 'overview' && (
            <div>
              <Bar data={typeAccuracy} />
              <div style={{ marginTop: 12 }}>
                <h3>Achievements</h3>
                <div className="grid three" style={{ gap: 8 }}>
                  {['First Blood','Streak Week','Debugger','Memory Palace','Feynman','Mastered','Polyglot','Iron Mind','Relearner'].map((name) => {
                    const unlocked = (stats.achievements || []).includes(name)
                    return (
                      <div key={name} className={`card pad ${unlocked ? '' : 'muted'}`} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20 }}>{unlocked ? '🏆' : '🔒'}</div>
                        <div className="space-mono">{unlocked ? name : '???'}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'mistakes' && (
            <div>
              <h3>Recent mistakes</h3>
              <div className="grid" style={{ gap: 8 }}>
                {packs.flatMap((pack) => (progressWithDerived[pack.id]?.mistakeLog || []).slice(0, 20).map((m) => ({ pack, m }))).map(({ pack, m }) => (
                  <div key={`${pack.id}-${m.questionId}-${m.date}`} className="card pad">
                    <div className="session-row"><strong>{pack.name}</strong><span className="small muted">{new Date(m.date).toLocaleDateString()}</span></div>
                    <div className="small muted">{m.concept} · {m.type}</div>
                    <div style={{ marginTop: 8 }}>{m.yourAnswer ? <><div className="bad-text">You: {m.yourAnswer}</div><div className="good-text">Correct: {m.correctAnswer}</div></> : <div className="muted">No recorded answer</div>}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <button className="button primary" onClick={() => navigate('/quiz/mistakes')}>Study mistakes →</button>
              </div>
            </div>
          )}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Activity heatmap</h2>
        <div className="heatmap">{heatLevels.map((level, index) => <div key={index} className={`heat-dot l${level}`} title={`${heatValues[index]} questions`} />)}</div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="card-heading"><h2>Session history</h2><button className="button" onClick={() => createProgressImage()}>Share my progress</button></div>
        <div className="grid" style={{ gap: 10 }}>
          {(stats.sessionHistory || []).slice(0, 10).map((entry) => (
            <div key={entry.date} className="session-row">
              <span className="small">{new Date(entry.date).toLocaleDateString()}</span>
              <span>{entry.topicId}</span>
              <span>{entry.mode}</span>
              <span className="space-mono">{entry.score}%</span>
              <span className="space-mono">{entry.xpEarned} XP</span>
              <span className="space-mono">{entry.durationMinutes}m</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="panel">
      <div className="kicker">{label}</div>
      <div className="space-mono" style={{ fontSize: 30 }}>{value}</div>
    </div>
  )
}

function PomodoroTimer({ active, minimized, setMinimized, workMinutes, breakMinutes }) {
  const [remaining, setRemaining] = useState(workMinutes * 60)
  const [phase, setPhase] = useState('work')

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      setRemaining((seconds) => {
        if (seconds <= 1) {
          if (phase === 'work') {
            setPhase('break')
            return breakMinutes * 60
          }
          setPhase('work')
          return workMinutes * 60
        }
        return seconds - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [active, phase, workMinutes, breakMinutes])

  if (!active) return null
  return (
    <button 
      className="pomodoro-timer" 
      style={{ position: 'fixed', right: 18, bottom: 18, width: minimized ? 180 : 220 }} 
      onClick={() => setMinimized(!minimized)}
    >
      <div className="pomodoro-time">{formatTime(remaining)}</div>
      <div className="pomodoro-label">{phase === 'work' ? 'Stay on task' : 'Take a break'}</div>
      {!minimized && <div className="small muted" style={{ marginTop: 4 }}>{phase === 'work' ? 'Focus session' : `Break — ${breakMinutes} min`}</div>}
    </button>
  )
}

function SettingsModal({ ai, setAI, settings, setSettings, setSettingsOpen, addToast }) {
  const fileInputRef = useRef(null)
  const [showKey, setShowKey] = useState(false)
  const [resetValue, setResetValue] = useState('')

  async function handleExport() {
    const blob = new Blob([JSON.stringify(exportAllData(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'recurse-export.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        importAllData(JSON.parse(String(reader.result)))
        addToast('Progress imported')
      } catch (error) {
        addToast(String(error.message || error))
      }
    }
    reader.readAsText(file)
  }

  async function testConnection() {
    try {
      const start = Date.now()
      await callAI('Say hi', 'hi')
      const ms = Date.now() - start
      addToast(`✓ Connected — ${ms}ms`)
    } catch (e) {
      addToast(`Connection failed: ${String(e.message || e)}`)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="card-heading"><h2>Settings</h2><button className="button" onClick={() => setSettingsOpen(false)}>Close</button></div>
        <section className="panel" style={{ marginBottom: 16 }}>
          <h3>AI Provider</h3>
          <div className="grid two">
            <label><input type="radio" checked={ai.provider === 'anthropic'} onChange={() => setAI((current) => ({ ...current, provider: 'anthropic' }))} /> Anthropic</label>
            <label><input type="radio" checked={ai.provider === 'openai'} onChange={() => setAI((current) => ({ ...current, provider: 'openai' }))} /> OpenAI</label>
            <label><input type="radio" checked={ai.provider === 'openrouter'} onChange={() => setAI((current) => ({ ...current, provider: 'openrouter' }))} /> OpenRouter</label>
          </div>
          <input type={showKey ? 'text' : 'password'} value={ai.apiKey} onChange={(event) => setAI((current) => ({ ...current, apiKey: event.target.value }))} placeholder="API key" />
          <button className="button" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'} key</button>
          <input value={ai.model} onChange={(event) => setAI((current) => ({ ...current, model: event.target.value }))} placeholder="Model" />
          <button className="button" onClick={testConnection}>Test connection</button>
        </section>
        <section className="panel" style={{ marginBottom: 16 }}>
          <h3>Study settings</h3>
          <label>Desired retention: {Math.round(settings.desiredRetention * 100)}%</label>
          <input type="range" min="0.8" max="0.95" step="0.01" value={settings.desiredRetention} onChange={(event) => setSettings((current) => ({ ...current, desiredRetention: Number(event.target.value) }))} />
          <label><input type="checkbox" checked={settings.pomodoroEnabled} onChange={(event) => setSettings((current) => ({ ...current, pomodoroEnabled: event.target.checked }))} /> Pomodoro enabled</label>
          <div className="grid two">
            <input type="number" value={settings.workMinutes} onChange={(event) => setSettings((current) => ({ ...current, workMinutes: Number(event.target.value) }))} />
            <input type="number" value={settings.breakMinutes} onChange={(event) => setSettings((current) => ({ ...current, breakMinutes: Number(event.target.value) }))} />
          </div>
        </section>
        <section className="panel">
          <h3>Data</h3>
          <div className="import-actions">
            <button className="button" onClick={handleExport}>Export progress as JSON</button>
            <button className="button" onClick={() => fileInputRef.current?.click()}>Import progress</button>
            <button className="button danger" onClick={() => {
              if (resetValue === 'RESET') {
                resetAllData()
                addToast('All progress reset')
              }
            }}>Reset all progress</button>
          </div>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImport} hidden />
          <input value={resetValue} onChange={(event) => setResetValue(event.target.value)} placeholder='Type RESET to confirm' />
        </section>
      </div>
    </div>
  )
}

function PackImportModal({ setImportOpen, addToast, packMode, setPackMode, packImportUrl, setPackImportUrl, packImportText, setPackImportText, communityPacks, setCommunityPacks, ai, setAI }) {
  const [loading, setLoading] = useState(false)
  const fileRef = useRef(null)
  const [aiError, setAiError] = useState(null)
  const [conflictPack, setConflictPack] = useState(null)

  async function handleImport() {
    setLoading(true)
    try {
      let pack = null
      if (packMode === 'url') {
        pack = await importPackFromURL(packImportUrl)
      } else if (packMode === 'json') {
        const parsed = JSON.parse(packImportText)
        validatePackSchema(parsed)
        pack = parsed
      } else if (packMode === 'file') {
        const file = fileRef.current?.files?.[0]
        if (!file) throw new Error('No file selected')
        const text = await file.text()
        const parsed = JSON.parse(text)
        validatePackSchema(parsed)
        pack = parsed
      } else if (packMode === 'ai') {
        setAiError(null)
        // Improved AI prompt with constraints
        const prompt = `You are a content generator that outputs a single JSON object for the Recurse learning app. Return ONLY valid JSON. The object must include: id (slug), name (string), version, category, lesson (object), and questions (array). Questions must be at least 5 items. Each question must have: id, type (one of mcq, code-fill, debug), difficulty (easy|medium|hard), question (or prompt), choices (array of exactly 4 strings), answer (integer 0-3), and concept. Do not duplicate questions. Include real code blocks where code is needed. Ensure a mix of types: ~40% easy, ~40% medium, ~20% hard. No commentary outside the JSON.`
        const response = await callAI('Generate a Recurse pack JSON.', prompt)
        const jsonText = response.match(/\{[\s\S]*\}/)?.[0] || response
        let parsed
        try {
          parsed = JSON.parse(jsonText)
        } catch (e) {
          throw new Error('AI returned invalid JSON')
        }
        // validate generated pack with stricter rules
        try {
          validatePackSchema(parsed)
          // validateGeneratedPack sanitizes and returns the sanitized pack
          parsed = validateGeneratedPack(parsed)
        } catch (e) {
          throw new Error('AI generated an invalid pack — try again')
        }
        pack = parsed
      }
      // Built-in conflict
      if (TOPIC_ORDER.includes(pack.id)) {
        addToast('This pack ID conflicts with a built-in pack and cannot be imported.')
        setLoading(false)
        return
      }

      // Existing community conflict -> prompt user
      const exists = (communityPacks || []).find((p) => p.id === pack.id)
      if (exists) {
        setConflictPack({ existing: exists, incoming: pack })
        setLoading(false)
        return
      }

      // No conflicts -> add
      setCommunityPacks((current) => [...current, pack])
      addToast(`Pack ${pack.name} imported — ${pack.questions?.length || 0} questions added`)
      setImportOpen(false)
    } catch (error) {
      const msg = String(error.message || error)
      // expose AI validation error with retry
      if (packMode === 'ai') setAiError(msg)
      addToast(msg)
    } finally {
      setLoading(false)
    }
  }

  function resolveConflict(action) {
    if (!conflictPack) return
    const { existing, incoming } = conflictPack
    if (action === 'replace') {
      setCommunityPacks((current) => current.map((p) => (p.id === existing.id ? incoming : p)))
      addToast(`Replaced pack ${incoming.name} — ${incoming.questions?.length || 0} questions`) 
      setImportOpen(false)
    } else if (action === 'keep') {
      addToast(`Kept existing pack ${existing.name}`)
      setImportOpen(false)
    }
    setConflictPack(null)
  }

  return (
    <div className="modal-backdrop" onClick={() => setImportOpen(false)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="card-heading"><h2>Import pack</h2><button className="button" onClick={() => setImportOpen(false)}>Close</button></div>
        <div className="topic-actions">
          <button className={`tab-button ${packMode === 'url' ? 'active' : ''}`} onClick={() => setPackMode('url')}>GitHub raw URL</button>
          <button className={`tab-button ${packMode === 'json' ? 'active' : ''}`} onClick={() => setPackMode('json')}>Paste JSON</button>
          <button className={`tab-button ${packMode === 'file' ? 'active' : ''}`} onClick={() => setPackMode('file')}>Upload .json</button>
          <button className={`tab-button ${packMode === 'ai' ? 'active' : ''}`} onClick={() => setPackMode('ai')}>Generate with AI</button>
        </div>
        {packMode === 'url' && <input value={packImportUrl} onChange={(event) => setPackImportUrl(event.target.value)} placeholder="https://raw.githubusercontent.com/.../pack.json" />}
        {packMode === 'json' && <textarea value={packImportText} onChange={(event) => setPackImportText(event.target.value)} placeholder="Paste pack JSON" />}
        {packMode === 'file' && <input ref={fileRef} type="file" accept="application/json" />}
        {packMode === 'ai' && <div>
          <p className="muted">AI will generate a pack JSON. Make sure your API key is configured in Settings.</p>
          {aiError && <div className="card pad" style={{ marginTop: 8 }}>
            <div className="bad-text">{aiError}</div>
            <div style={{ marginTop: 8 }}>
              <button className="button" onClick={() => { setAiError(null); handleImport() }}>Retry</button>
            </div>
          </div>}
        </div>}
        {conflictPack && (
          <div className="card pad" style={{ marginTop: 12 }}>
            <h3>Pack conflict</h3>
            <p className="muted">A pack called {conflictPack.existing.name} already exists. Replace it or keep both?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button primary" onClick={() => resolveConflict('replace')}>Replace</button>
              <button className="button" onClick={() => resolveConflict('keep')}>Keep existing</button>
              <button className="button" onClick={() => setConflictPack(null)}>Cancel</button>
            </div>
          </div>
        )}
        <button className="button primary" onClick={handleImport} disabled={loading}>{loading ? 'Importing...' : 'Import'}</button>
      </div>
    </div>
  )
}

function OnboardingFlow({ setOnboardingStep, onboardingStep, user, setUser, ai, setAI, completeOnboarding, navigate }) {
  const [name, setName] = useState(user.name || '')
  const [goal, setGoal] = useState(user.goal || '')
  const [provider, setProvider] = useState(ai.provider)
  const [apiKey, setApiKey] = useState(ai.apiKey)
  const [model, setModel] = useState(ai.model)
  const goals = [
    "I'm a CS student filling gaps",
    "I'm learning to code from scratch",
    "I work in tech and want to level up",
    "I'm prepping for technical interviews"
  ]

  const screens = [
    <div key="welcome"><h1>Recurse</h1><p>Learn it. Keep it.</p><p>Short sessions. Smart scheduling. Nothing forgotten.</p><button className="button primary" onClick={() => setOnboardingStep(1)}>Get started →</button></div>,
    <div key="name"><h2>What should we call you?</h2><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /><button className="button primary" onClick={() => { setUser((current) => ({ ...current, name })); setOnboardingStep(2) }}>Continue</button></div>,
    <div key="goal"><h2>What brings you here?</h2><div className="grid" style={{ gap: 10 }}>{goals.map((item) => <button key={item} className="button" onClick={() => { setGoal(item); setUser((current) => ({ ...current, goal: item })); setOnboardingStep(3) }}>{item}</button>)}</div></div>,
    <div key="how"><h2>How it works</h2><div className="grid two"><div className="card pad"><strong>Answer questions, don't just read</strong><p className="muted">Forcing yourself to recall information is what makes memories stick.</p></div><div className="card pad"><strong>The app tracks your forgetting curve</strong><p className="muted">Recurse shows you what is fading and reviews it before you lose it.</p></div><div className="card pad"><strong>15 minutes a day beats weekends</strong><p className="muted">The Quick 5 daily mix takes under 10 minutes and covers what you risk forgetting.</p></div></div><button className="button primary" onClick={() => setOnboardingStep(4)}>Start learning →</button></div>,
    <div key="ai"><h2>Unlock Feynman Mode</h2><p className="muted">You can skip this and add keys later.</p><div className="grid two"><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select><input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key" /><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model" /></div><div className="footer-actions"><button className="button primary" onClick={() => { setAI({ provider, apiKey, model }); completeOnboarding(); navigate('/') }}>Save and continue</button><button className="button" onClick={() => { completeOnboarding(); navigate('/') }}>Skip for now</button></div></div>
  ]

  return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 760 }}>{screens[onboardingStep] || screens[0]}</div></div>
}

function MasteryModal({ masteredTopic, setMasteredTopic, addToast }) {
  useEffect(() => {
    addToast(`${masteredTopic} mastered`)
  }, [masteredTopic])

  return (
    <div className="modal-backdrop" onClick={() => setMasteredTopic(null)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="confetti">{Array.from({ length: 24 }, (_, index) => <span key={index} style={{ left: `${index * 4}%`, background: ['#00e38c', '#388bfd', '#f0a500', '#e05c5c', '#a78bfa'][index % 5], animationDelay: `${index * 0.05}s` }} />)}</div>
        <h2>🏆 {masteredTopic} Mastered</h2>
        <p className="muted">Mastery reached 90% or higher.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="button primary" onClick={() => setMasteredTopic(null)}>Close</button>
          <button className="button" onClick={() => {
            // generate certificate canvas and download using user name
            const canvas = document.createElement('canvas')
            canvas.width = 1200
            canvas.height = 850
            const ctx = canvas.getContext('2d')
            // subtle grid background
            ctx.fillStyle = '#0a0a0a'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.strokeStyle = 'rgba(255,255,255,0.03)'
            ctx.lineWidth = 1
            for (let x = 0; x < canvas.width; x += 40) {
              ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 40) {
              ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }
            // accent inset border
            ctx.strokeStyle = '#00e38c'
            ctx.lineWidth = 4
            const inset = 20
            ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2)

            // Wordmark top-left
            ctx.fillStyle = '#fff'
            ctx.font = '28px "Space Mono", monospace'
            ctx.fillText('Recurse', 40, 70)
            ctx.font = '14px sans-serif'
            ctx.fillStyle = '#cfeee6'
            ctx.fillText('Learn it. Keep it.', 40, 96)

            // Heading center
            ctx.fillStyle = '#fff'
            ctx.font = '48px serif'
            ctx.textAlign = 'center'
            ctx.fillText('Certificate of Mastery', canvas.width / 2, 200)

            // Topic name large
            ctx.font = '36px sans-serif'
            const topicName = masteredTopic.replace(/-/g, ' ')
            ctx.fillText(topicName, canvas.width / 2, 270)

            // Body
            ctx.font = '20px sans-serif'
            ctx.textAlign = 'center'
            const raw = safeParseJSON(localStorage.getItem('recurse_user'), {})
            const name = raw.name || 'A Dedicated Learner'
            ctx.fillStyle = '#ddd'
            ctx.fillText(`${name} has demonstrated mastery of ${topicName}.`, canvas.width / 2, 340)

            // Date bottom-left and mastery bottom-right
            ctx.textAlign = 'left'
            ctx.font = '16px monospace'
            ctx.fillStyle = '#aaa'
            ctx.fillText(`Date: ${new Date().toLocaleDateString()}`, 40, canvas.height - 60)
            ctx.textAlign = 'right'
            ctx.fillStyle = '#00e38c'
            ctx.fillText('Mastery: 90%', canvas.width - 40, canvas.height - 60)

            // export
            canvas.toBlob((blob) => {
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              const safeTopic = (masteredTopic || 'topic').replace(/\s+/g, '-').toLowerCase()
              a.download = `recurse-${safeTopic}-certificate.png`
              a.click()
              URL.revokeObjectURL(url)
            })
          }}>Download certificate</button>
        </div>
      </div>
    </div>
  )
}
