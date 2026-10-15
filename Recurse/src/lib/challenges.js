// Coding challenges: every set in src/data/challenges, bundled at build time.
// The format is documented in docs/challenges.md.

const modules = import.meta.glob('../data/challenges/*.json', { eager: true, import: 'default' })

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 }

function fileId(path) {
  return path.split('/').pop().replace(/\.json$/, '')
}

/** Every set, warm-ups and other low `order` values first, then by title. */
export const CHALLENGE_SETS = Object.entries(modules)
  .filter(([, set]) => set && Array.isArray(set.challenges))
  .map(([path, set]) => ({
    id: set.set || fileId(path),
    title: set.title || set.set || fileId(path),
    description: set.description || '',
    order: Number.isFinite(set.order) ? set.order : 100,
    challenges: set.challenges.filter((c) => c && typeof c.id === 'string')
  }))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

/** Every challenge, flattened, each tagged with its set id and title. */
export const ALL_CHALLENGES = CHALLENGE_SETS.flatMap((set) =>
  set.challenges.map((challenge) => ({ ...challenge, set: set.id, setTitle: set.title }))
)

const BY_ID = new Map(ALL_CHALLENGES.map((c) => [c.id, c]))

export function getChallenge(id) {
  return BY_ID.get(id) || null
}

/** Challenges that practice a pack (topic), easiest first. */
export function challengesForTopic(packId) {
  return ALL_CHALLENGES.filter((c) => c.topic === packId).sort(
    (a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 1) - (DIFFICULTY_ORDER[b.difficulty] ?? 1)
  )
}
