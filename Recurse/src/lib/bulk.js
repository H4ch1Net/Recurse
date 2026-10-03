// Bulk card entry for the pack builder.

/** Parse "front<TAB>back", "front | back" or "front ; back" lines (Quizlet and Anki exports use tabs). */
export function parseBulk(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.split(/\t| \| | ;\s*|\s+::\s+/)
      if (match.length < 2) return null
      const [front, ...rest] = match
      return { question: front.trim(), answer: rest.join(' ').trim() }
    })
    .filter((row) => row && row.question && row.answer)
}
