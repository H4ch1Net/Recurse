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
  { id: 'Creator', title: 'Creator', description: 'Create or import a pack of your own.', check: ({ packs }) => packs.some((p) => p.community) }
]

export function newlyUnlocked(context) {
  const have = new Set(context.stats.achievements || [])
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.check(context)).map((a) => a.id)
}

export function achievementTitle(id) {
  return ACHIEVEMENTS.find((a) => a.id === id)?.title || id
}
