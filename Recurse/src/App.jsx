import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { AppProvider } from './state/AppState'
import { useApp } from './state/context'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Toasts from './components/Toasts'
import Today from './pages/Today'
import Library from './pages/Library'
import Topic from './pages/Topic'
import Lesson from './pages/Lesson'
import Study from './pages/Study'
import Complete from './pages/Complete'
import NotFound from './pages/NotFound'

// Less frequently visited screens load on demand.
const Explain = lazy(() => import('./pages/Explain'))
const Stats = lazy(() => import('./pages/Stats'))
const Settings = lazy(() => import('./pages/Settings'))
const Create = lazy(() => import('./pages/Create'))
const Onboarding = lazy(() => import('./pages/Onboarding'))

/** Remount the study screen for every navigation so "study again" builds a fresh queue. */
function StudyRoute() {
  const location = useLocation()
  return <Study key={location.key} />
}

/** Old v1 URLs. */
function LegacyRedirect({ to }) {
  const { topicId } = useParams()
  if (topicId === 'quick5') return <Navigate to="/study/review" replace />
  if (topicId === 'mistakes') return <Navigate to="/study/mistakes" replace />
  return <Navigate to={to.replace(':topicId', topicId)} replace />
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Routed() {
  const { user } = useApp()
  const location = useLocation()
  if (!user.onboardingComplete && location.pathname !== '/welcome') return <Navigate to="/welcome" replace />
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/welcome" element={<Suspense fallback={null}><Onboarding /><Toasts /></Suspense>} />
        <Route path="/study/:kind" element={<><StudyRoute /><Toasts placement="top" /></>} />
        <Route path="/study/:kind/:topicId" element={<><StudyRoute /><Toasts placement="top" /></>} />
        <Route element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="library" element={<Library />} />
          <Route path="topic/:topicId" element={<Topic />} />
          <Route path="topic/:topicId/lesson" element={<Lesson />} />
          <Route path="topic/:topicId/explain" element={<Explain />} />
          <Route path="complete" element={<Complete />} />
          <Route path="stats" element={<Stats />} />
          <Route path="settings" element={<Settings />} />
          <Route path="create" element={<Create />} />
          <Route path="create/:packId" element={<Create />} />
          <Route path="lesson/:topicId" element={<LegacyRedirect to="/topic/:topicId/lesson" />} />
          <Route path="quiz/:topicId" element={<LegacyRedirect to="/study/topic/:topicId" />} />
          <Route path="feynman/:topicId" element={<LegacyRedirect to="/topic/:topicId/explain" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Routed />
      </AppProvider>
    </ErrorBoundary>
  )
}
