import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen, ChartColumn, Flame, House, Keyboard, Settings } from 'lucide-react'
import BrandMark from './BrandMark'
import Toasts from './Toasts'
import ShortcutsDialog from './ShortcutsDialog'
import { useApp } from '../state/context'
import { useHotkeys } from '../hooks/useHotkeys'
import { currentStreak, todayLog } from '../lib/gamification'
import { dueSummary } from '../lib/session'
import { Suspense, useMemo } from 'react'

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
  const { packs, progress, settings, stats, now, setShortcutsOpen, shortcutsOpen } = useApp()
  const navigate = useNavigate()
  const due = useMemo(() => dueSummary(packs, progress, settings, stats, now).due, [packs, progress, settings, stats, now])

  useHotkeys({
    '?': () => setShortcutsOpen(true),
    t: () => navigate('/'),
    l: () => navigate('/library'),
    s: () => navigate('/stats'),
    ',': () => navigate('/settings')
  })

  const nav = [
    { to: '/', label: 'Today', icon: House, end: true, badge: due },
    { to: '/library', label: 'Library', icon: BookOpen },
    { to: '/stats', label: 'Progress', icon: ChartColumn },
    { to: '/settings', label: 'Settings', icon: Settings }
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
            {nav.slice(0, 3).map(({ to, label, icon: Icon, end, badge }) => (
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
          <NavLink to="/settings" className={({ isActive }) => `icon-btn hide-mobile${isActive ? ' active' : ''}`} aria-label="Settings" title="Settings (,)">
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
