import { isMature, State } from './memory'
import { topicMastery } from './progress'

const allCards = (progress) => Object.values(progress || {}).flatMap((topic) => Object.values(topic.cards || {}))

// Ids are stable storage keys (some date from v1); titles are what learners see.
export const ACHIEVEMENTS = [
  { id: 'First Blood', title: 'First recall', description: 'Answer a question correctly.', check: ({ stats }) => stats.totalCorrect > 0 },
  { id: 'Centurion', title: 'Centurion', description: 'Complete 100 reviews.', check: ({ stats }) => stats.totalReviews >= 100 },
  { id: 'Thousand', title: 'Thousand', description: 'Complete 1,000 reviews.', check: ({ stats }) => stats.totalReviews >= 1000 },
  { id: 'Streak Week', title: 'Week streak', description: 'Study seven days in a row.', check: ({ stats }) => (stats.longestStreak || 0) >= 7 },
  { id: 'Iron Mind', title: 'Iron mind', description: 'Study thirty days in a row.', check: ({ stats }) => (stats.longestStreak || 0) >= 30 },
  { id: 'Perfect', title: 'Flawless', description: 'Finish a session of ten or more cards without a miss.', check: ({ stats }) => (stats.sessions || []).some((s) => s.cards >= 10 && s.correct === s.cards) },
  { id: 'Debugger', title: 'Debugger', description: 'Solve ten find-the-bug questions.', check: ({ stats }) => (stats.byType?.debug?.correct || 0) >= 10 },
  { id: 'Memory Palace', title: 'Memory palace', description: 'Grow ten cards to maturity (three weeks or more of stability).', check: ({ progress }) => allCards(progress).filter(isMature).length >= 10 },
  { id: 'Relearner', title: 'Comeback', description: 'Recover a card you had forgotten.', check: ({ progress }) => allCards(progress).some((c) => c.lapses >= 1 && c.state === State.Review) },
  { id: 'Scholar', title: 'Scholar', description: 'Pass every check in five lessons.', check: ({ progress, packs }) => packs.filter((p) => p.lesson?.sections?.length && p.lesson.sections.every((_, i) => progress[p.id]?.checks?.[i])).length >= 5 },
  { id: 'Polyglot', title: 'Explorer', description: 'Start five different topics.', check: ({ progress }) => Object.values(progress).filter((t) => t.lessonRead || Object.keys(t.cards || {}).length).length >= 5 },
  { id: 'Polymath', title: 'Polymath', description: 'Study topics from four different subjects.', check: ({ progress, packs }) => new Set(packs.filter((p) => Object.keys(progress[p.id]?.cards || {}).length).map((p) => p.subject)).size >= 4 },
  { id: 'Feynman', title: 'Explainer', description: 'Explain a topic in your own words.', check: ({ stats }) => (stats.feynmanCount || 0) > 0 },
  { id: 'Mastered', title: 'Mastery', description: 'Reach 90% mastery in a topic.', check: ({ progress, packs }) => packs.some((p) => topicMastery(progress[p.id]?.cards, p.questions.length) >= 90) },
  { id: 'Creator', title: 'Creator', description: 'Create or import a pack of your own.', check: ({ packs }) => packs.some((p) => p.community) },
  { id: 'Combo', title: 'On fire', description: 'Get ten answers right in a row in one session.', check: ({ stats }) => (stats.sessions || []).some((s) => (s.bestCombo || 0) >= 10) },
  { id: 'Tinkerer', title: 'Tinkerer', description: 'Reach the goal of five interactive activities.', check: ({ stats }) => (stats.activitiesDone || 0) >= 5 },
  { id: 'Console', title: 'Console cowboy', description: 'Pass your first Cisco console lab.', check: ({ practice }) => Object.keys(practice?.labs || {}).length > 0 },
  { id: 'Netadmin', title: 'Network engineer', description: 'Pass fifteen console labs.', check: ({ practice }) => Object.keys(practice?.labs || {}).length >= 15 },
  { id: 'Hello', title: 'Hello, world', description: 'Solve your first coding challenge.', check: ({ practice }) => Object.keys(practice?.challenges || {}).length > 0 },
  { id: 'Solver', title: 'Problem solver', description: 'Solve twenty-five coding challenges.', check: ({ practice }) => Object.keys(practice?.challenges || {}).length >= 25 },
  { id: 'Shipped', title: 'Shipped it', description: 'Finish a portfolio project.', check: ({ practice }) => Object.values(practice?.projects || {}).some((p) => p.status === 'done') },
  { id: 'ExamReady', title: 'Exam ready', description: 'Score 85% or more on a full practice exam.', check: ({ practice }) => (practice?.exams || []).some((e) => e.mode === 'exam' && e.score >= 85) },
  { id: 'PopQuiz', title: 'Sharp memory', description: 'Answer twenty pop quiz cards from older topics.', check: ({ stats }) => (stats.sessions || []).reduce((sum, s) => sum + (s.pops || 0), 0) >= 20 }
]

export function newlyUnlocked(context) {
  const have = new Set(context.stats.achievements || [])
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.check(context)).map((a) => a.id)
}

export function achievementTitle(id) {
  return ACHIEVEMENTS.find((a) => a.id === id)?.title || id
}
