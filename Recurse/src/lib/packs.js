import { subjectFor } from './packSchema'
import { SUBJECTS } from './subjects'
import PACK_INDEX from 'virtual:pack-index'

const SUBJECT_ORDER = SUBJECTS.map((s) => s.id)
const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced']

export function normalizePack(pack, { community = false } = {}) {
  return {
    ...pack,
    subject: subjectFor(pack),
    level: pack.level || 'beginner',
    language: pack.language || 'plaintext',
    prereqs: Array.isArray(pack.prereqs) ? pack.prereqs : [],
    icon: pack.icon || pack.name?.slice(0, 2) || '?',
    description: pack.description || '',
    community: community || Boolean(pack.community),
    questions: pack.questions || []
  }
}

/** Order packs by subject, then prerequisite depth, then level, then name. */
export function sortPacks(packs) {
  const byId = new Map(packs.map((p) => [p.id, p]))
  const depthCache = new Map()
  const depth = (pack, seen = new Set()) => {
    if (depthCache.has(pack.id)) return depthCache.get(pack.id)
    if (seen.has(pack.id)) return 0
    seen.add(pack.id)
    const parents = pack.prereqs.map((id) => byId.get(id)).filter((p) => p && p.subject === pack.subject)
    const value = parents.length ? 1 + Math.max(...parents.map((p) => depth(p, seen))) : 0
    depthCache.set(pack.id, value)
    return value
  }
  return [...packs].sort((a, b) =>
    SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject) ||
    Number(a.community) - Number(b.community) ||
    depth(a) - depth(b) ||
    LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
    a.name.localeCompare(b.name)
  )
}

// Built-in packs come from a build-time index with slim lessons (titles, terms, summary);
// the full lesson text of each pack is its own chunk, fetched when a lesson is opened.
export const BUILT_IN_PACKS = sortPacks(PACK_INDEX.map((pack) => normalizePack(pack)))
export const BUILT_IN_IDS = new Set(BUILT_IN_PACKS.map((p) => p.id))

// Questions in the index carry only id, type, section and difficulty so the app starts fast.
// Their text, choices, answers and explanations arrive in one chunk right after startup.
let bankReady = !PACK_INDEX.some((p) => p.questionsPartial)
let bankPromise = null

/** True once every built-in question has its full text. */
export const questionsLoaded = () => bankReady

/** Fill in the text of every built-in question, in place, once. */
export function loadQuestionBank() {
  if (bankReady) return Promise.resolve()
  if (!bankPromise) {
    bankPromise = import('virtual:question-bank').then(({ default: bank }) => {
      for (const pack of BUILT_IN_PACKS) {
        const full = new Map((bank[pack.id] || []).map((q) => [q.id, q]))
        for (const q of pack.questions) Object.assign(q, full.get(q.id))
        delete pack.questionsPartial
      }
      bankReady = true
    })
    bankPromise.catch(() => {
      bankPromise = null
    })
  }
  return bankPromise
}

const fullPacks = import.meta.glob('../data/packs/*.json', { import: 'default' })
const lessonCache = new Map()

/** The full lesson for a pack: immediately for user packs, after a fetch for built-ins. */
export function loadLesson(pack) {
  if (!pack?.lesson) return Promise.resolve(null)
  if (!pack.lesson.partial) return Promise.resolve(pack.lesson)
  if (lessonCache.has(pack.id)) return lessonCache.get(pack.id)
  const loader = fullPacks[`../data/packs/${pack.id}.json`]
  const promise = loader
    ? loader().then((full) => full.lesson)
    : Promise.resolve(pack.lesson)
  promise.catch(() => lessonCache.delete(pack.id))
  lessonCache.set(pack.id, promise)
  return promise
}

const resolved = new Map()

/** Synchronous access when the lesson has already arrived (or is not partial). */
export function cachedLesson(pack) {
  if (!pack?.lesson?.partial) return pack?.lesson || null
  return resolved.get(pack.id) || null
}

export function rememberLesson(id, lesson) {
  if (lesson) resolved.set(id, lesson)
}

/** Fetch lessons in the background so they work offline later. */
export function prefetchLessons(packs) {
  for (const pack of packs) {
    if (pack.lesson?.partial && !lessonCache.has(pack.id)) {
      loadLesson(pack).then((lesson) => rememberLesson(pack.id, lesson)).catch(() => {})
    }
  }
}

/** Code language for a question or lesson section, falling back to the pack default. */
export function codeLanguage(pack, item) {
  return item?.language || pack?.language || 'plaintext'
}

/** Questions in teaching order: lesson section first, then difficulty, then authoring order. */
export function teachingOrder(pack) {
  const rank = { easy: 0, medium: 1, hard: 2 }
  return pack.questions
    .map((q, index) => ({ q, index }))
    .sort((a, b) =>
      (a.q.section ?? 99) - (b.q.section ?? 99) ||
      (rank[a.q.difficulty] ?? 1) - (rank[b.q.difficulty] ?? 1) ||
      a.index - b.index
    )
    .map(({ q }) => q)
}
