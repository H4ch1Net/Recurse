// Learning paths ("collections"): ordered stages of topics, labs, challenges and projects
// toward one goal such as the CCNA or a software engineering internship. Definitions live
// in src/data/collections/*.json; this module adds derived lists and progress math.

const modules = import.meta.glob('../data/collections/*.json', { eager: true, import: 'default' })

const ORDER = ['ccna', 'swe-internship', 'cs-fundamentals', 'web-development', 'security-foundations', 'math-for-cs']

function normalize(raw) {
  const stages = (raw.stages || []).map((stage) => ({
    labs: [],
    challenges: [],
    challengeSets: [],
    projects: [],
    ...stage,
    topics: stage.topics || []
  }))
  return {
    ...raw,
    stages,
    packIds: [...new Set(stages.flatMap((s) => s.topics))],
    labIds: [...new Set(stages.flatMap((s) => s.labs))],
    projectIds: [...new Set([...(raw.projects || []), ...stages.flatMap((s) => s.projects)])]
  }
}

export const COLLECTIONS = Object.values(modules)
  .map(normalize)
  .sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99) || a.name.localeCompare(b.name))

const BY_ID = new Map(COLLECTIONS.map((c) => [c.id, c]))

export function getCollection(id) {
  return BY_ID.get(id) || null
}

/** Paths that include a topic, for "part of the CCNA path" badges. */
export function collectionsForPack(packId) {
  return COLLECTIONS.filter((c) => c.packIds.includes(packId))
}

/** Drop topic ids for packs that do not exist in this build (content can lag behind paths). */
export function availableTopics(stage, packMap) {
  return stage.topics.filter((id) => packMap.has(id))
}

// Four steps, from the topic summary: not started, learning, practiced, mastered.
export const TOPIC_STEPS = ['new', 'learning', 'practiced', 'mastered']
export const TOPIC_STEP_LABELS = { new: 'Not started', learning: 'Learning', practiced: 'Practiced', mastered: 'Mastered' }

export function topicStep(summary) {
  if (!summary?.started) return 'new'
  if (summary.status === 'mastered') return 'mastered'
  if (summary.mastery >= 45 && summary.studied >= summary.total * 0.6) return 'practiced'
  return 'learning'
}

const STEP_VALUE = { new: 0, learning: 0.33, practiced: 0.7, mastered: 1 }

/**
 * Progress through one stage, 0..1. Topics carry most of the weight; labs and
 * challenges count as well when the stage has them.
 */
export function stageProgress(stage, { packMap, summaries, labsDone = new Set(), challengesSolved = new Set(), stageChallengeIds = [] }) {
  const topics = availableTopics(stage, packMap)
  const parts = []
  if (topics.length) parts.push({ weight: 3, value: topics.reduce((sum, id) => sum + STEP_VALUE[topicStep(summaries.get(id))], 0) / topics.length })
  if (stage.labs.length) parts.push({ weight: 1, value: stage.labs.filter((id) => labsDone.has(id)).length / stage.labs.length })
  if (stageChallengeIds.length) parts.push({ weight: 1, value: stageChallengeIds.filter((id) => challengesSolved.has(id)).length / stageChallengeIds.length })
  const total = parts.reduce((sum, p) => sum + p.weight, 0)
  return total ? parts.reduce((sum, p) => sum + p.weight * p.value, 0) / total : 0
}

/** The first topic in path order that is not yet practiced: the "next up" suggestion. */
export function nextTopic(collection, packMap, summaries) {
  for (const stage of collection.stages) {
    for (const id of availableTopics(stage, packMap)) {
      const step = topicStep(summaries.get(id))
      if (step === 'new' || step === 'learning') return { stage, pack: packMap.get(id), step }
    }
  }
  return null
}
