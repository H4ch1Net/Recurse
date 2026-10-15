// The glossary: every key term from every topic's lesson, merged by term and sorted A to Z.

const normalize = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** The letter a term files under: A to Z, or # for digits and symbols. */
export function letterOf(term) {
  const first = String(term || '').trim().charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}

/**
 * Merge key terms across packs. Each entry is one term with every topic that defines it:
 * { key, term, letter, sources: [{ packId, packName, subject, definition }] }.
 */
export function buildGlossary(packs) {
  const byKey = new Map()
  for (const pack of packs || []) {
    for (const item of pack?.lesson?.keyTerms || []) {
      const key = normalize(item?.term)
      const definition = String(item?.definition || '').trim()
      if (!key || !definition) continue
      let entry = byKey.get(key)
      if (!entry) {
        entry = { key, term: item.term.trim(), letter: letterOf(item.term), sources: [] }
        byKey.set(key, entry)
      }
      if (entry.sources.some((s) => s.packId === pack.id)) continue
      entry.sources.push({ packId: pack.id, packName: pack.name, subject: pack.subject, definition })
    }
  }
  return [...byKey.values()].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base', numeric: true }))
}

/** Entries whose term or a definition contains every word of the query. */
export function searchGlossary(entries, query) {
  const words = normalize(query).split(' ').filter(Boolean)
  if (!words.length) return entries
  return entries.filter((entry) => {
    const haystack = `${entry.key} ${entry.sources.map((s) => s.definition.toLowerCase()).join(' ')}`
    return words.every((w) => haystack.includes(w))
  })
}

/** Keep entries defined by at least one of the given topics, listing only those sources. */
export function limitToTopics(entries, topicIds) {
  if (!topicIds) return entries
  const allowed = new Set(topicIds)
  return entries
    .map((entry) => ({ ...entry, sources: entry.sources.filter((s) => allowed.has(s.packId)) }))
    .filter((entry) => entry.sources.length > 0)
}

/** Group sorted entries by letter, in alphabet order with # last. */
export function groupByLetter(entries) {
  const groups = new Map()
  for (const entry of entries) {
    if (!groups.has(entry.letter)) groups.set(entry.letter, [])
    groups.get(entry.letter).push(entry)
  }
  return [...groups.entries()].sort(([a], [b]) => (a === '#') - (b === '#') || a.localeCompare(b))
}
