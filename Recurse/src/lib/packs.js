import { subjectFor } from './packSchema'
import { SUBJECTS } from './subjects'

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

const modules = import.meta.glob('../data/packs/*.json', { eager: true, import: 'default' })

export const BUILT_IN_PACKS = sortPacks(Object.values(modules).map((pack) => normalizePack(pack)))
export const BUILT_IN_IDS = new Set(BUILT_IN_PACKS.map((p) => p.id))

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
