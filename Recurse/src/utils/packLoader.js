import { createNewCard } from './fsrs'
import { loadCommunityPacks, saveCommunityPacks } from './storage'

const CORE_PACK_IDS = [
  'python-basics',
  'variables-types',
  'loops-functions',
  'oop',
  'data-structures',
  'algorithms',
  'git-basics',
  'linux-cli',
  'networking-basics',
  'cybersecurity-101'
]

export async function loadAllPacks() {
  const modules = import.meta.glob('../data/packs/*.json')
  const packs = []
  for (const path in modules) {
    const mod = await modules[path]()
    if (CORE_PACK_IDS.includes(mod.default.id)) {
      packs.push(mod.default)
    }
  }
  return packs.sort((a, b) => CORE_PACK_IDS.indexOf(a.id) - CORE_PACK_IDS.indexOf(b.id))
}

export function validatePackSchema(pack) {
  const required = ['id', 'name', 'version', 'category', 'questions', 'lesson']
  required.forEach((key) => {
    if (!pack[key]) throw new Error(`Pack missing required field: ${key}`)
  })
  if (!Array.isArray(pack.questions) || pack.questions.length < 5) {
    throw new Error('Pack must have at least 5 questions')
  }
  pack.questions.forEach((q, i) => {
    if (!q.id || !q.type || (!q.question && !q.prompt) || !q.choices || q.answer === undefined) {
      throw new Error(`Question ${i} is missing required fields`)
    }
  })
}

export function initializePackCards(pack, existingProgress = {}) {
  const progress = existingProgress[pack.id] || {
    mastery: 0,
    lessonRead: false,
    cards: {},
    mistakeLog: []
  }
  const nextProgress = { ...progress, cards: { ...(progress.cards || {}) } }
  pack.questions.forEach((question) => {
    if (!nextProgress.cards[question.id]) {
      nextProgress.cards[question.id] = createNewCard(new Date())
    }
  })
  return nextProgress
}

export async function importPackFromURL(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not fetch pack')
  const pack = await res.json()
  validatePackSchema(pack)
  // do not auto-save here; caller should handle conflicts and persistence
  // but reject built-in pack IDs
  if (CORE_PACK_IDS.includes(pack.id)) {
    throw new Error('This pack ID conflicts with a built-in pack and cannot be imported.')
  }
  return pack
}

export function validateGeneratedPack(pack) {
  // Treat AI output as untrusted: sanitize then validate
  try {
    validatePackSchema(pack)
  } catch (err) {
    console.error('validateGeneratedPack: schema validation failed', err.message)
    throw err
  }

  function stripHTML(s) {
    if (typeof s !== 'string') return ''
    return s.replace(/<[^>]*>?/gm, '')
  }

  function truncate(s, len) {
    if (typeof s !== 'string') return ''
    if (s.length <= len) return s
    return s.slice(0, len)
  }

  // basic id rules
  if (typeof pack.id !== 'string' || !/^[a-z0-9\-]+$/.test(pack.id)) {
    console.error('validateGeneratedPack: invalid pack id', pack.id)
    throw new Error('Pack id contains invalid characters; only a-z, 0-9 and - allowed')
  }


  // sanitize top-level fields
  pack.id = truncate(stripHTML(pack.id), 50)
  pack.name = truncate(stripHTML(pack.name || ''), 100)
  pack.description = truncate(stripHTML(pack.description || ''), 300)

  // questions validation and sanitization
  if (!Array.isArray(pack.questions) || pack.questions.length < 5) {
    console.error('validateGeneratedPack: insufficient questions', (pack.questions || []).length)
    throw new Error('Pack must have at least 5 questions')
  }
  const seenIds = new Set()
  const types = new Set()
  const difficultyCounts = { easy: 0, medium: 0, hard: 0 }
  for (let i = 0; i < pack.questions.length; i++) {
    const q = pack.questions[i]
    // sanitize strings
    q.id = truncate(stripHTML(q.id || ''), 50)
    q.question = truncate(stripHTML(q.question || q.prompt || ''), 500)
    q.explanation = truncate(stripHTML(q.explanation || ''), 500)
    q.difficulty = stripHTML((q.difficulty || 'medium'))

    if (!q.id) {
      console.error('validateGeneratedPack: question missing id at index', i)
      throw new Error(`Question ${i} missing id`)
    }
    if (seenIds.has(q.id)) {
      console.error('validateGeneratedPack: duplicate question id', q.id)
      throw new Error(`Duplicate question id: ${q.id}`)
    }
    seenIds.add(q.id)

    if (!Array.isArray(q.choices)) {
      console.error('validateGeneratedPack: question choices missing or not an array for', q.id)
      throw new Error(`Question ${q.id} missing choices array`)
    }
    if (q.choices.length !== 4) {
      console.error('validateGeneratedPack: question does not have 4 choices', q.id, q.choices && q.choices.length)
      throw new Error(`Question ${q.id} must have exactly 4 choices`)
    }
    // sanitize choices
    q.choices = q.choices.map((c, idx) => truncate(stripHTML(String(c || '')), 200))

    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > q.choices.length - 1) {
      console.error('validateGeneratedPack: invalid answer index for', q.id, 'answer:', q.answer)
      throw new Error(`Question ${q.id} has invalid answer index`)
    }

    // accumulate types/difficulty
    if (q.type) types.add(q.type)
    const d = (q.difficulty || 'medium')
    if (difficultyCounts[d] !== undefined) difficultyCounts[d]++
  }

  // ensure mix of types
  const requiredTypes = ['mcq', 'code-fill', 'debug']
  for (const t of requiredTypes) {
    if (!types.has(t)) {
      console.error('validateGeneratedPack: missing question type', t)
      throw new Error('AI pack must include all question types: mcq, code-fill, debug')
    }
  }

  const total = pack.questions.length
  const easyOk = difficultyCounts.easy >= Math.max(1, Math.floor(total * 0.25))
  const mediumOk = difficultyCounts.medium >= Math.max(1, Math.floor(total * 0.25))
  const hardOk = difficultyCounts.hard >= Math.max(1, Math.floor(total * 0.1))
  if (!easyOk || !mediumOk || !hardOk) {
    console.error('validateGeneratedPack: difficulty distribution invalid', difficultyCounts)
    throw new Error('Difficulty distribution must be approx 40% easy, 40% medium, 20% hard')
  }

  return pack
}
