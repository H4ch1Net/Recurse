// Readability check for lessons: flags walls of text, missing key ideas, and code blocks
// that hold diagrams or tables instead of real code (those belong in visuals, see
// docs/visuals.md).
// Usage: node scripts/lesson-lint.mjs [--strict] [pack-id ...]
//   no ids: summary of every pack. --strict: exit 1 when any listed pack has a problem.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bodyText, visualList } from '../src/lib/visuals.js'

export const LIMITS = {
  sectionWords: 170, // key idea plus body text, not counting visuals, code or deeper
  paragraphWords: 60,
  keyWords: 30,
  deeperWords: 220
}
// Languages that hold real code or command output. plaintext and a missing language do not.
const CODE = new Set(['python', 'javascript', 'typescript', 'java', 'cpp', 'go', 'sql', 'bash', 'html', 'css', 'json', 'dockerfile', 'yaml', 'cisco'])

const words = (text) => (String(text || '').match(/[\w'’./:-]+/g) || []).length

/** Problems and numbers for one pack's lesson. */
export function lintLesson(pack) {
  const problems = []
  const sections = pack.lesson?.sections || []
  let main = 0
  let visuals = 0
  sections.forEach((s, i) => {
    const at = `§${i + 1} ${s.title}`
    const text = bodyText(s.body)
    const count = words(s.key) + words(text)
    main += count
    visuals += visualList(s).length
    if (!s.key) problems.push(`${at}: no key idea`)
    else if (words(s.key) > LIMITS.keyWords) problems.push(`${at}: key idea is ${words(s.key)} words (max ${LIMITS.keyWords})`)
    if (count > LIMITS.sectionWords) problems.push(`${at}: ${count} words to read (max ${LIMITS.sectionWords}); move detail to visuals or deeper`)
    for (const para of text.split(/\n\s*\n/)) {
      const lines = para.split('\n')
      if (lines.every((l) => /^\s*[-*] /.test(l))) continue
      const n = words(para)
      if (n > LIMITS.paragraphWords) problems.push(`${at}: a ${n}-word paragraph (max ${LIMITS.paragraphWords}): "${para.slice(0, 50)}..."`)
    }
    if (s.code && !CODE.has(s.language)) problems.push(`${at}: code block with language ${s.language || 'unset'}; give real code or IOS output an explicit language (cisco for IOS), and turn a diagram, table or calculation into a visual`)
    if (words(s.deeper) > LIMITS.deeperWords) problems.push(`${at}: deeper is ${words(s.deeper)} words (max ${LIMITS.deeperWords})`)
    const all = JSON.stringify(s)
    if (all.includes('\u2014')) problems.push(`${at}: contains an em dash`)
  })
  return { id: pack.id, sections: sections.length, mainWords: main, visuals, minutes: Math.round(main / 200), problems }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const args = process.argv.slice(2)
  const strict = args.includes('--strict')
  const ids = args.filter((a) => !a.startsWith('--'))
  const dir = fileURLToPath(new URL('../src/data/packs', import.meta.url))
  const files = ids.length ? ids.map((id) => join(dir, `${id}.json`)) : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f))
  let bad = 0
  for (const file of files) {
    const r = lintLesson(JSON.parse(readFileSync(file, 'utf8')))
    if (r.problems.length) bad++
    const head = `${r.problems.length ? '✗' : '✓'} ${r.id}: ${r.mainWords} words to read (~${r.minutes} min), ${r.visuals} visuals, ${r.problems.length} problems`
    console.log(head)
    if (ids.length) r.problems.forEach((p) => console.log(`    ${p}`))
  }
  console.log(`\n${files.length - bad}/${files.length} lessons clean`)
  if (strict && bad) process.exit(1)
}
