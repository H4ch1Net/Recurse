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
const Paths = lazy(() => import('./pages/Paths'))
const PathDetail = lazy(() => import('./pages/PathDetail'))
const Practice = lazy(() => import('./pages/Practice'))
const LabPage = lazy(() => import('./pages/LabPage'))
const ChallengePage = lazy(() => import('./pages/ChallengePage'))
const MockInterview = lazy(() => import('./pages/MockInterview'))
const MockInterviewRun = lazy(() => import('./pages/MockInterview').then((m) => ({ default: m.InterviewRun })))
const MockInterviewResult = lazy(() => import('./pages/MockInterviewResult'))
const ActivityPage = lazy(() => import('./pages/ActivityPage'))
const QuizSetup = lazy(() => import('./pages/QuizSetup'))
const QuizRunner = lazy(() => import('./pages/QuizRunner'))
const QuizResult = lazy(() => import('./pages/QuizResult'))
const Approach = lazy(() => import('./pages/Approach'))
const ApproachQuiz = lazy(() => import('./pages/ApproachQuiz'))
const Experiment = lazy(() => import('./pages/Experiment'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const ProjectPage = lazy(() => import('./pages/ProjectPage'))
const Glossary = lazy(() => import('./pages/Glossary'))

/** Remount the study screen for every navigation so "study again" builds a fresh queue. */
function StudyRoute() {
  const location = useLocation()
  return <Study key={location.key} />
}

/** A fresh quiz for every navigation, like the study screen. */
function QuizRun() {
  const location = useLocation()
  return <QuizRunner key={location.key} />
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
        <Route path="/quiz/run" element={<Suspense fallback={null}><QuizRun /><Toasts placement="top" /></Suspense>} />
        <Route path="/practice/interview/run" element={<Suspense fallback={null}><MockInterviewRun /><Toasts placement="top" /></Suspense>} />
        <Route element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="library" element={<Library />} />
          <Route path="glossary" element={<Glossary />} />
          <Route path="topic/:topicId" element={<Topic />} />
          <Route path="topic/:topicId/lesson" element={<Lesson />} />
          <Route path="topic/:topicId/explain" element={<Explain />} />
          <Route path="complete" element={<Complete />} />
          <Route path="stats" element={<Stats />} />
          <Route path="settings" element={<Settings />} />
          <Route path="create" element={<Create />} />
          <Route path="create/:packId" element={<Create />} />
          <Route path="paths" element={<Paths />} />
          <Route path="path/:pathId" element={<PathDetail />} />
          <Route path="practice" element={<Practice />} />
          <Route path="practice/lab/:labId" element={<LabPage />} />
          <Route path="practice/challenge/:challengeId" element={<ChallengePage />} />
          <Route path="practice/interview" element={<MockInterview />} />
          <Route path="practice/interview/result/:interviewId" element={<MockInterviewResult />} />
          <Route path="practice/activity/:type" element={<ActivityPage />} />
          <Route path="quiz" element={<QuizSetup />} />
          <Route path="quiz/result/:examId" element={<QuizResult />} />
          <Route path="approach" element={<Approach />} />
          <Route path="approach/quiz" element={<ApproachQuiz />} />
          <Route path="approach/experiment" element={<Experiment />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="project/:projectId" element={<ProjectPage />} />
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
