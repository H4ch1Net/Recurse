export const SUBJECTS = [
  { id: 'programming', label: 'Programming', hue: 152, blurb: 'Languages, syntax and writing working code.' },
  { id: 'cs', label: 'Computer Science', hue: 215, blurb: 'Data structures, algorithms and how systems work.' },
  { id: 'tools', label: 'Developer Tools', hue: 24, blurb: 'Git, the shell, containers and everyday tooling.' },
  { id: 'web', label: 'Web', hue: 190, blurb: 'HTTP, browsers, HTML and CSS.' },
  { id: 'security', label: 'Networks & Security', hue: 356, blurb: 'How networks work and how to defend them.' },
  { id: 'math', label: 'Mathematics', hue: 265, blurb: 'Algebra, probability, logic and calculus.' },
  { id: 'science', label: 'Science', hue: 88, blurb: 'Physics, chemistry, biology and Earth science.' },
  { id: 'humanities', label: 'Humanities', hue: 42, blurb: 'History, geography, economics and how learning works.' },
  { id: 'languages', label: 'Languages', hue: 318, blurb: 'Vocabulary and grammar for new languages.' }
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
