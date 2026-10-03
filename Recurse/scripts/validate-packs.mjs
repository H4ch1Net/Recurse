// Validates every built-in pack in src/data/packs against the strict schema.
// Usage: npm run validate:packs [-- path/to/pack.json ...]
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePack } from '../src/lib/packSchema.js'

const packsDir = fileURLToPath(new URL('../src/data/packs', import.meta.url))
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(packsDir).filter((f) => f.endsWith('.json')).map((f) => join(packsDir, f))

let failed = 0
let totalQuestions = 0
const ids = new Map()

for (const file of files) {
  let pack
  try {
    pack = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.log(`✗ ${basename(file)}: invalid JSON (${error.message})`)
    failed++
    continue
  }
  const { errors, warnings } = validatePack(pack, { strict: true })
  if (pack.id && basename(file, '.json') !== pack.id) errors.push(`file name must match id (${pack.id}.json)`)
  for (const q of pack.questions || []) {
    if (ids.has(q.id)) errors.push(`question id ${q.id} also used in ${ids.get(q.id)}`)
    ids.set(q.id, pack.id)
  }
  totalQuestions += pack.questions?.length || 0
  if (errors.length) {
    failed++
    console.log(`✗ ${basename(file)}`)
    errors.forEach((e) => console.log(`    error: ${e}`))
  } else {
    console.log(`✓ ${basename(file)} (${pack.questions.length} questions, ${pack.lesson.sections.length} sections)`)
  }
  warnings.forEach((w) => console.log(`    warning: ${w}`))
}

const known = new Set([...ids.values()])
for (const file of files) {
  try {
    const pack = JSON.parse(readFileSync(file, 'utf8'))
    for (const prereq of pack.prereqs || []) {
      if (!known.has(prereq)) console.log(`    warning: ${pack.id} lists unknown prereq ${prereq}`)
    }
  } catch {
    // Already reported above.
  }
}

console.log(`\n${files.length - failed}/${files.length} packs valid, ${totalQuestions} questions`)
process.exit(failed ? 1 : 0)
