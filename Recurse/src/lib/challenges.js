// Coding challenges. Lists use a build-time index (titles, difficulty, topics); the full
// challenge (statement, tests, solutions) loads with its set when it is opened.
// The format is documented in docs/challenges.md.
import INDEX from 'virtual:challenge-index'

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 }
const fullSets = import.meta.glob('../data/challenges/*.json', { import: 'default' })

/** Every set, warm-ups and other low `order` values first, then by title. */
export const CHALLENGE_SETS = [...INDEX].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

/** Every challenge (metadata only), flattened, each tagged with its set id and title. */
export const ALL_CHALLENGES = CHALLENGE_SETS.flatMap((set) =>
  set.challenges.map((challenge) => ({ ...challenge, set: set.id, setTitle: set.title, file: set.file }))
)

const BY_ID = new Map(ALL_CHALLENGES.map((c) => [c.id, c]))
const loaded = new Map()

/** Metadata for a challenge, or null. */
export function getChallenge(id) {
  return BY_ID.get(id) || null
}

/** The full challenge (statement, tests, starter code, solutions). */
export function loadChallenge(id) {
  const meta = BY_ID.get(id)
  if (!meta) return Promise.resolve(null)
  if (!loaded.has(id)) {
    const load = fullSets[`../data/challenges/${meta.file}.json`]
    const promise = (load ? load() : Promise.resolve({ challenges: [] })).then((set) => {
      const full = set.challenges.find((c) => c.id === id)
      return full ? { ...full, set: meta.set, setTitle: meta.setTitle } : null
    })
    promise.catch(() => loaded.delete(id))
    loaded.set(id, promise)
  }
  return loaded.get(id)
}

/** Challenges that practice a pack (topic), easiest first. */
export function challengesForTopic(packId) {
  return ALL_CHALLENGES.filter((c) => c.topic === packId).sort(
    (a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 1) - (DIFFICULTY_ORDER[b.difficulty] ?? 1)
  )
}
