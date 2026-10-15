// Cross-checks built-in content: every path, lab, challenge, project and lesson activity
// must point at things that exist, and no built-in text may use an em dash.
// Usage: npm run validate:content
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONSOLE_LABS } from '../src/activities/lib/ios/labs.js'
import { ACTIVITY_TYPES } from '../src/activities/catalog.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const readDir = (dir) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => f.endsWith('.json')).map((f) => ({ file: `${dir}/${f}`, data: JSON.parse(readFileSync(join(root, dir, f), 'utf8')) })) : [])

const errors = []
const warnings = []
const packs = readDir('src/data/packs')
const collections = readDir('src/data/collections')
const challengeSets = readDir('src/data/challenges')
const projects = readDir('src/data/projects')

const packIds = new Set(packs.map((p) => p.data.id))
const labIds = new Set(CONSOLE_LABS.map((l) => l.id))
const setIds = new Set(challengeSets.map((s) => s.data.set))
const challengeIds = new Set(challengeSets.flatMap((s) => (s.data.challenges || []).map((c) => c.id)))
const projectIds = new Set(projects.map((p) => p.data.id))

for (const { file, data } of collections) {
  const where = file
  for (const key of ['id', 'name', 'tagline', 'description', 'outcome']) if (!data[key]) errors.push(`${where}: missing ${key}`)
  const seenStage = new Set()
  for (const stage of data.stages || []) {
    if (seenStage.has(stage.id)) errors.push(`${where}: duplicate stage id ${stage.id}`)
    seenStage.add(stage.id)
    for (const id of stage.topics || []) if (!packIds.has(id)) errors.push(`${where} stage ${stage.id}: unknown topic ${id}`)
    for (const id of stage.labs || []) if (!labIds.has(id)) errors.push(`${where} stage ${stage.id}: unknown lab ${id}`)
    for (const id of stage.challengeSets || []) if (!setIds.has(id)) errors.push(`${where} stage ${stage.id}: unknown challenge set ${id}`)
    for (const id of stage.challenges || []) if (!challengeIds.has(id)) errors.push(`${where} stage ${stage.id}: unknown challenge ${id}`)
    for (const id of stage.projects || []) if (!projectIds.has(id)) errors.push(`${where} stage ${stage.id}: unknown project ${id}`)
  }
  for (const id of data.projects || []) if (!projectIds.has(id)) errors.push(`${where}: unknown project ${id}`)
}

for (const lab of CONSOLE_LABS) {
  if (lab.topic && !packIds.has(lab.topic)) errors.push(`lab ${lab.id}: unknown topic ${lab.topic}`)
}

for (const { file, data } of challengeSets) {
  for (const c of data.challenges || []) if (c.topic && !packIds.has(c.topic)) errors.push(`${file} ${c.id}: unknown topic ${c.topic}`)
}

for (const { file, data } of projects) {
  for (const key of ['id', 'title', 'track', 'summary', 'brief']) if (!data[key]) errors.push(`${file}: missing ${key}`)
  for (const id of data.topics || []) if (!packIds.has(id)) errors.push(`${file}: unknown topic ${id}`)
  if (!Array.isArray(data.milestones) || !data.milestones.length) errors.push(`${file}: needs milestones`)
}

for (const { file, data } of packs) {
  ;(data.lesson?.sections || []).forEach((section, i) => {
    const activity = section.activity
    if (!activity) return
    if (!ACTIVITY_TYPES.includes(activity.type)) errors.push(`${file} section ${i}: unknown activity ${activity.type}`)
    if (activity.type === 'ios-console' && activity.props?.lab && !labIds.has(activity.props.lab)) errors.push(`${file} section ${i}: unknown lab ${activity.props.lab}`)
    if (activity.type === 'challenge' && !challengeIds.has(activity.props?.id)) errors.push(`${file} section ${i}: unknown challenge ${activity.props?.id}`)
  })
  for (const id of data.prereqs || []) if (!packIds.has(id)) warnings.push(`${file}: unknown prereq ${id}`)
}

// House style: no em dashes in anything learners read.
for (const { file, data } of [...packs, ...collections, ...challengeSets, ...projects]) {
  const text = JSON.stringify(data)
  const count = (text.match(/—/g) || []).length
  if (count) errors.push(`${file}: ${count} em dash${count === 1 ? '' : 'es'} (use commas, colons or parentheses)`)
}

warnings.forEach((w) => console.log(`warning: ${w}`))
errors.forEach((e) => console.log(`error: ${e}`))
console.log(`\n${collections.length} paths, ${CONSOLE_LABS.length} labs, ${challengeIds.size} challenges, ${projects.length} projects, ${packs.length} packs checked. ${errors.length} errors.`)
process.exit(errors.length ? 1 : 0)
