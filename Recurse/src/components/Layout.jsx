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

function GoalRing({ value, goal }) {
  const ratio = Math.min(1, goal ? value / goal : 0)
  const r = 8
  const c = 2 * Math.PI * r
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3" />
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform="rotate(-90 11 11)" />
    </svg>
  )
}

export function HeaderStatus() {
  const { stats, settings, now } = useApp()
  const streak = currentStreak(stats, now)
  const today = todayLog(stats, now)
  return (
    <div className="header-meta">
      <Link to="/stats" className="chip outline" title={`${today.reviews} of ${settings.dailyGoal} reviews today`} aria-label={`Daily goal: ${today.reviews} of ${settings.dailyGoal} reviews`}>
        <GoalRing value={today.reviews} goal={settings.dailyGoal} />
        <span className="tabular">{today.reviews}/{settings.dailyGoal}</span>
      </Link>
      <Link to="/stats" className={`chip ${streak ? 'warn' : 'outline'}`} title={`${streak}-day streak`} aria-label={`${streak} day streak`}>
        <Flame size={14} />
        <span className="tabular">{streak}</span>
      </Link>
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
            <span>recurse</span>
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
        <Suspense fallback={<div className="page" aria-busy="true" />}>
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
