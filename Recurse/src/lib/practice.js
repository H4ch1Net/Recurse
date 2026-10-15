// Hands-on practice joined up: console labs, coding challenges and projects, with
// what is due for a redo and how far along each path is.
import { CONSOLE_LABS } from '../activities/lib/ios/labs'
import { ALL_CHALLENGES } from './challenges'
import { isDue } from './memory'
import { availableTopics, stageProgress, topicStep } from './collections'
import { interviewReadiness } from './interview'

const projectModules = import.meta.glob('../data/projects/*.json', { eager: true, import: 'default' })
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 }

export const PROJECTS = Object.values(projectModules)
  .filter((p) => p && p.id && p.title)
  .sort((a, b) => (a.track || '').localeCompare(b.track || '') || (LEVEL_RANK[a.level] ?? 1) - (LEVEL_RANK[b.level] ?? 1) || a.title.localeCompare(b.title))

const PROJECT_MAP = new Map(PROJECTS.map((p) => [p.id, p]))
const LAB_MAP = new Map(CONSOLE_LABS.map((l) => [l.id, l]))
const CHALLENGE_MAP = new Map(ALL_CHALLENGES.map((c) => [c.id, c]))

export { CONSOLE_LABS, ALL_CHALLENGES }

export const getProject = (id) => PROJECT_MAP.get(id) || null
export const getLab = (id) => LAB_MAP.get(id) || null
export const getChallengeMeta = (id) => CHALLENGE_MAP.get(id) || null

export const labsForTopic = (packId) => CONSOLE_LABS.filter((l) => l.topic === packId)
export const challengesForTopic = (packId) => ALL_CHALLENGES.filter((c) => c.topic === packId)
export const projectsForTopic = (packId) => PROJECTS.filter((p) => (p.topics || []).includes(packId))

/** Challenge ids for a path stage: listed ones plus every challenge in its sets. */
export function stageChallengeIds(stage) {
  const ids = new Set(stage.challenges || [])
  for (const set of stage.challengeSets || []) for (const c of ALL_CHALLENGES) if (c.set === set) ids.add(c.id)
  return [...ids].filter((id) => CHALLENGE_MAP.has(id))
}

export function solvedSets(practice) {
  return {
    labsDone: new Set(Object.keys(practice?.labs || {})),
    challengesSolved: new Set(Object.keys(practice?.challenges || {}))
  }
}

/** Labs and challenges whose redo is due, most overdue first. */
export function duePractice(practice, now = new Date()) {
  const out = []
  for (const [id, entry] of Object.entries(practice?.labs || {})) {
    const lab = LAB_MAP.get(id)
    if (lab && entry.card && isDue(entry.card, now)) out.push({ kind: 'lab', id, title: lab.title, due: entry.card.due, to: `/practice/lab/${id}` })
  }
  for (const [id, entry] of Object.entries(practice?.challenges || {})) {
    const challenge = CHALLENGE_MAP.get(id)
    if (challenge && entry.card && isDue(entry.card, now)) out.push({ kind: 'challenge', id, title: challenge.title, due: entry.card.due, to: `/practice/challenge/${id}` })
  }
  return out.sort((a, b) => new Date(a.due) - new Date(b.due))
}

/** Everything a path page needs about one stage. */
export function stageReport(stage, { packMap, summaries, practice }) {
  const sets = solvedSets(practice)
  const challengeIds = stageChallengeIds(stage)
  const topics = availableTopics(stage, packMap).map((id) => ({ pack: packMap.get(id), summary: summaries.get(id), step: topicStep(summaries.get(id)) }))
  const labs = stage.labs.map((id) => LAB_MAP.get(id)).filter(Boolean)
  return {
    stage,
    topics,
    labs,
    challengeIds,
    projects: stage.projects.map((id) => PROJECT_MAP.get(id)).filter(Boolean),
    labsDone: labs.filter((l) => sets.labsDone.has(l.id)).length,
    challengesSolved: challengeIds.filter((id) => sets.challengesSolved.has(id)).length,
    progress: stageProgress(stage, { packMap, summaries, ...sets, stageChallengeIds: challengeIds })
  }
}

/** Recent full exams for a path, newest first. */
export function pathExams(practice, pathId) {
  return (practice?.exams || []).filter((e) => e.pathId === pathId && e.mode === 'exam')
}

/**
 * Readiness for a path's goal, 0..100, with the parts that make it up. For a certification
 * path the practice exam average dominates; without exam scores the estimate is capped,
 * because topic progress alone cannot show you would pass under time pressure.
 */
export function readiness(collection, { packMap, summaries, practice }) {
  const reports = collection.stages.map((stage) => stageReport(stage, { packMap, summaries, practice }))
  const weightOf = (r) => r.stage.weight || 1
  const totalWeight = reports.reduce((sum, r) => sum + weightOf(r), 0) || 1
  const coverage = reports.reduce((sum, r) => sum + r.progress * weightOf(r), 0) / totalWeight
  const labTotal = reports.reduce((sum, r) => sum + r.labs.length, 0)
  const labsDone = reports.reduce((sum, r) => sum + r.labsDone, 0)
  const challengeTotal = reports.reduce((sum, r) => sum + r.challengeIds.length, 0)
  const challengesSolved = reports.reduce((sum, r) => sum + r.challengesSolved, 0)
  const exams = pathExams(practice, collection.id).slice(0, 3)
  const examAverage = exams.length ? exams.reduce((sum, e) => sum + e.score, 0) / exams.length / 100 : null
  const projectsDone = collection.projectIds.filter((id) => practice?.projects?.[id]?.status === 'done').length

  const parts = [{ id: 'coverage', label: 'Topics practiced', value: coverage, weight: collection.exam ? 0.3 : 0.5 }]
  if (labTotal) parts.push({ id: 'labs', label: 'Console labs passed', value: labsDone / labTotal, weight: 0.2, detail: `${labsDone} of ${labTotal}` })
  if (challengeTotal) parts.push({ id: 'challenges', label: 'Coding challenges solved', value: challengesSolved / challengeTotal, weight: 0.3, detail: `${challengesSolved} of ${challengeTotal}` })
  if (collection.projectIds.length) parts.push({ id: 'projects', label: 'Projects finished', value: Math.min(1, projectsDone / Math.min(3, collection.projectIds.length)), weight: 0.2, detail: `${projectsDone} of ${collection.projectIds.length}` })
  if (collection.exam) parts.push({ id: 'exam', label: 'Practice exam average', value: examAverage ?? 0, weight: 0.5, detail: exams.length ? `last ${exams.length}` : 'no exam yet' })
  // Interviews test talking through a problem under time pressure, which solving alone does not.
  if (collection.id === 'swe-internship') {
    const mock = interviewReadiness(practice?.interviews)
    parts.push({ id: 'interviews', label: 'Mock interviews', value: mock.value, weight: 0.2, detail: mock.detail })
  }

  const totalPartWeight = parts.reduce((sum, p) => sum + p.weight, 0)
  let score = parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalPartWeight
  if (collection.exam && examAverage === null) score = Math.min(score, 0.6)
  return { score: Math.round(score * 100), parts, reports, coverage, examAverage, exams }
}
