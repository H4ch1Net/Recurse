// `code` is the subject's call-number prefix; `hue` drives its catalog tab color.
export const SUBJECTS = [
  { id: 'programming', code: 'PRG', label: 'Programming', hue: 152, blurb: 'Languages, syntax and writing working code.' },
  { id: 'cs', code: 'CSC', label: 'Computer Science', hue: 222, blurb: 'Data structures, algorithms and how systems work.' },
  { id: 'tools', code: 'TLS', label: 'Developer Tools', hue: 22, blurb: 'Git, the shell, containers and everyday tooling.' },
  { id: 'web', code: 'WEB', label: 'Web', hue: 192, blurb: 'HTTP, browsers, HTML and CSS.' },
  { id: 'security', code: 'SEC', label: 'Networks & Security', hue: 354, blurb: 'How networks work and how to defend them.' },
  { id: 'math', code: 'MTH', label: 'Mathematics', hue: 262, blurb: 'Algebra, probability, logic and calculus.' },
  { id: 'science', code: 'SCI', label: 'Science', hue: 78, blurb: 'Physics, chemistry, biology and Earth science.' },
  { id: 'humanities', code: 'HUM', label: 'Humanities', hue: 40, blurb: 'History, geography, economics and how learning works.' },
  { id: 'languages', code: 'LNG', label: 'Languages', hue: 322, blurb: 'Vocabulary and grammar for new languages.' }
]

export const SUBJECT_MAP = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]))

export function subjectLabel(id) {
  return SUBJECT_MAP[id]?.label || 'Other'
}

export function subjectHue(id) {
  return SUBJECT_MAP[id]?.hue ?? 210
}

export const LEVEL_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

export const QUESTION_TYPE_LABELS = {
  mcq: 'Multiple choice',
  'code-fill': 'Fill the blank',
  debug: 'Find the bug',
  typed: 'Type the answer',
  recall: 'Recall'
}

const LEVEL_BASE = { beginner: 100, intermediate: 200, advanced: 300 }

/**
 * Library-style call numbers ("PRG 101") for the given packs, in their sorted order:
 * subject prefix, then the level's hundred plus the pack's place within it.
 */
export function callNumbers(packs) {
  const counters = new Map()
  const out = new Map()
  for (const pack of packs) {
    const code = SUBJECT_MAP[pack.subject]?.code || 'GEN'
    const base = LEVEL_BASE[pack.level] ?? 100
    const key = `${code}:${base}`
    const n = (counters.get(key) || 0) + 1
    counters.set(key, n)
    out.set(pack.id, `${code} ${base + n}`)
  }
  return out
}
