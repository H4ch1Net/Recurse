// A summary of what a learner has shown they can do, built from their progress, and a
// Markdown export they can paste into a GitHub profile README or adapt for a resume.
import { COLLECTIONS, topicStep } from './collections'
import { ALL_CHALLENGES, CONSOLE_LABS, PROJECTS, pathExams } from './practice'

export function skillsSummary({ packs, summaries, practice }) {
  const mastered = packs.filter((p) => topicStep(summaries.get(p.id)) === 'mastered')
  const practiced = packs.filter((p) => topicStep(summaries.get(p.id)) === 'practiced')
  const solved = ALL_CHALLENGES.filter((c) => practice.challenges?.[c.id])
  const byDifficulty = { easy: 0, medium: 0, hard: 0 }
  for (const c of solved) byDifficulty[c.difficulty] = (byDifficulty[c.difficulty] || 0) + 1
  const languages = new Set(Object.values(practice.challenges || {}).flatMap((e) => e.languages || []))
  const labs = CONSOLE_LABS.filter((l) => practice.labs?.[l.id])
  const projects = PROJECTS.map((p) => ({ project: p, entry: practice.projects?.[p.id] })).filter((x) => x.entry)
  const paths = COLLECTIONS.map((c) => {
    const exams = pathExams(practice, c.id)
    return {
      collection: c,
      mastered: c.packIds.filter((id) => topicStep(summaries.get(id)) === 'mastered').length,
      practiced: c.packIds.filter((id) => ['practiced', 'mastered'].includes(topicStep(summaries.get(id)))).length,
      total: c.packIds.filter((id) => summaries.has(id)).length,
      bestExam: exams.length ? Math.max(...exams.map((e) => e.score)) : null
    }
  }).filter((p) => p.practiced > 0 || p.bestExam !== null)
  return { mastered, practiced, solved, byDifficulty, languages: [...languages], labs, projects, paths }
}

const LANGUAGE_NAMES = { javascript: 'JavaScript', python: 'Python' }

/** Markdown for a profile README or a portfolio page. */
export function portfolioMarkdown(summary, { name = '' } = {}) {
  const lines = []
  lines.push(`# ${name ? `${name}'s ` : ''}skills and projects`, '')
  const done = summary.projects.filter((p) => p.entry.status === 'done')
  if (done.length) {
    lines.push('## Projects', '')
    for (const { project, entry } of done) {
      const links = [entry.repo && `[code](${entry.repo})`, entry.demo && `[demo](${entry.demo})`].filter(Boolean).join(' · ')
      lines.push(`- **${project.title}**${links ? ` (${links})` : ''}: ${project.summary} Skills: ${(project.skills || []).join(', ')}.`)
    }
    lines.push('')
  }
  if (summary.solved.length) {
    const langs = summary.languages.map((l) => LANGUAGE_NAMES[l] || l).join(' and ')
    lines.push('## Problem solving', '')
    lines.push(`- Solved ${summary.solved.length} coding problems${langs ? ` in ${langs}` : ''}: ${summary.byDifficulty.easy} easy, ${summary.byDifficulty.medium} medium, ${summary.byDifficulty.hard} hard.`)
    const patterns = [...new Set(summary.solved.map((c) => c.pattern).filter(Boolean))].slice(0, 12)
    if (patterns.length) lines.push(`- Patterns practiced: ${patterns.join(', ')}.`)
    lines.push('')
  }
  if (summary.labs.length) {
    lines.push('## Networking labs', '')
    lines.push(`- Passed ${summary.labs.length} Cisco IOS configuration and troubleshooting labs, including ${summary.labs.slice(0, 6).map((l) => l.title.toLowerCase()).join('; ')}.`)
    lines.push('')
  }
  if (summary.paths.length) {
    lines.push('## Study', '')
    for (const p of summary.paths) {
      const exam = p.bestExam !== null ? `, best practice exam ${p.bestExam}%` : ''
      lines.push(`- ${p.collection.name}: ${p.practiced} of ${p.total} topics practiced, ${p.mastered} mastered${exam}.`)
    }
    lines.push('')
  }
  if (summary.mastered.length) {
    lines.push(`Topics mastered with spaced repetition: ${summary.mastered.map((p) => p.name).join(', ')}.`, '')
  }
  lines.push('_Tracked with Recurse._')
  return lines.join('\n')
}
