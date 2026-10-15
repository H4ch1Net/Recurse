import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen, ChartColumn, Dumbbell, Flame, House, Keyboard, Route, Settings } from 'lucide-react'
import BrandMark from './BrandMark'
import Toasts from './Toasts'
import ShortcutsDialog from './ShortcutsDialog'
import { useApp } from '../state/context'
import { useHotkeys } from '../hooks/useHotkeys'
import { currentStreak, todayLog } from '../lib/gamification'
import { dueSummary } from '../lib/session'
import { duePractice } from '../lib/practice'
import { Suspense, useEffect, useMemo } from 'react'
import { prefetchLessons } from '../lib/packs'
import { COLLECTIONS, nextTopic } from '../lib/collections'

export function HeaderStatus() {
  const { stats, settings, now } = useApp()
  const streak = currentStreak(stats, now)
  const today = todayLog(stats, now)
  const ratio = Math.min(1, today.reviews / Math.max(1, settings.dailyGoal))
  return (
    <div className="header-meta">
      <Link to="/stats" className="header-stat" title={`${today.reviews} of ${settings.dailyGoal} reviews today`} aria-label={`Daily goal: ${today.reviews} of ${settings.dailyGoal} reviews`}>
        <span className="goal-track" aria-hidden="true"><span style={{ width: `${ratio * 100}%` }} /></span>
        <span className="tabular">{today.reviews}/{settings.dailyGoal}</span>
      </Link>
      <span className="header-divider" aria-hidden="true" />
      <Link to="/stats" className={`header-stat${streak ? ' lit' : ''}`} title={`${streak}-day streak`} aria-label={`${streak} day streak`}>
        <Flame size={15} />
        <span className="tabular">{streak}d</span>
      </Link>
    </div>
  )
}

/** Placeholder while a lazily loaded screen arrives: the shape of a page, gently shimmering. */
function PageLoading() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="page-loading">
        <div className="skeleton title" />
        <div className="skeleton line" />
        <div className="skeleton block" />
      </div>
    </div>
  )
}

export default function Layout() {
  const { packs, progress, settings, stats, now, practice, setShortcutsOpen, shortcutsOpen } = useApp()
  const navigate = useNavigate()
  const due = useMemo(() => dueSummary(packs, progress, settings, stats, now).due, [packs, progress, settings, stats, now])
  const practiceDue = useMemo(() => duePractice(practice, now).length, [practice, now])
  const { summaries, user, packMap } = useApp()

  // Once the app is idle, fetch the lessons you are likely to open next (started topics
  // and the next topic in each of your paths) so they are cached for offline use.
  useEffect(() => {
    const run = () => {
      const goals = new Set(user.goals || [])
      const next = COLLECTIONS.filter((c) => goals.has(c.id)).map((c) => nextTopic(c, packMap, summaries)?.pack).filter(Boolean)
      prefetchLessons([...packs.filter((p) => summaries.get(p.id)?.started), ...next])
    }
    const id = 'requestIdleCallback' in window ? window.requestIdleCallback(run, { timeout: 8000 }) : setTimeout(run, 4000)
    return () => ('cancelIdleCallback' in window ? window.cancelIdleCallback(id) : clearTimeout(id))
    // Once per load is enough; the browser caches what it fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useHotkeys({
    '?': () => setShortcutsOpen(true),
    t: () => navigate('/'),
    l: () => navigate('/library'),
    p: () => navigate('/paths'),
    x: () => navigate('/practice'),
    s: () => navigate('/stats'),
    ',': () => navigate('/settings')
  })

  const nav = [
    { to: '/', label: 'Today', icon: House, end: true, badge: due },
    { to: '/paths', label: 'Paths', icon: Route },
    { to: '/practice', label: 'Practice', icon: Dumbbell, badge: practiceDue },
    { to: '/library', label: 'Library', icon: BookOpen },
    { to: '/stats', label: 'Progress', icon: ChartColumn }
  ]

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand" aria-label="Recurse home">
            <BrandMark />
            <span className="wordmark">Recurse</span>
          </Link>
          <nav className="primary-nav" aria-label="Primary">
            {nav.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <Icon size={16} />
                {label}
                {badge > 0 && <span className="count" aria-label={`${badge} due`}>{badge > 99 ? '99+' : badge}</span>}
              </NavLink>
            ))}
          </nav>
          <HeaderStatus />
          <button type="button" className="icon-btn hide-mobile" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard size={18} />
          </button>
          <NavLink to="/settings" className={({ isActive }) => `icon-btn${isActive ? ' active' : ''}`} aria-label="Settings" title="Settings (,)">
            <Settings size={18} />
          </NavLink>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <nav className="tabbar" aria-label="Primary">
        {nav.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab-link${isActive ? ' active' : ''}`}>
            <Icon size={20} />
            {label}
            {badge > 0 && <span className="dot">{badge > 99 ? '99+' : badge}</span>}
          </NavLink>
        ))}
      </nav>
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      <Toasts />
    </>
  )
}
