// Pack schema shared by the app (imports, pack builder) and the CLI validator.
// Keep this file free of browser and Vite APIs so Node can import it directly.

export const SUBJECT_IDS = ['programming', 'cs', 'tools', 'web', 'security', 'math', 'science', 'humanities', 'languages']
export const LEVELS = ['beginner', 'intermediate', 'advanced']
export const DIFFICULTIES = ['easy', 'medium', 'hard']
export const CHOICE_TYPES = ['mcq', 'code-fill', 'debug']
export const QUESTION_TYPES = [...CHOICE_TYPES, 'typed', 'recall']
export const CODE_LANGUAGES = ['python', 'javascript', 'typescript', 'sql', 'bash', 'html', 'css', 'json', 'dockerfile', 'yaml', 'plaintext']
export const BLANK = '_____'

// Category names used by v1 packs, mapped onto subjects.
const LEGACY_CATEGORIES = {
  language: 'programming',
  'cs-theory': 'cs',
  interview: 'cs',
  tools: 'tools',
  security: 'security',
  web: 'web'
}

export function subjectFor(pack) {
  if (SUBJECT_IDS.includes(pack?.subject)) return pack.subject
  if (SUBJECT_IDS.includes(pack?.category)) return pack.category
  return LEGACY_CATEGORIES[pack?.category] || 'cs'
}

export function isChoiceType(type) {
  return CHOICE_TYPES.includes(type)
}

const isText = (value) => typeof value === 'string' && value.trim().length > 0

function checkChoices(where, item, errors) {
  if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 6) {
    errors.push(`${where}: needs 2 to 6 choices`)
    return
  }
  if (!item.choices.every(isText)) errors.push(`${where}: every choice must be non-empty text`)
  const normalized = item.choices.map((c) => String(c).trim().toLowerCase())
  if (new Set(normalized).size !== normalized.length) errors.push(`${where}: choices must be unique`)
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.choices.length) {
    errors.push(`${where}: answer must be the index of a choice`)
  }
}

/**
 * Validate a pack.
 * strict: the bar for built-in packs (lesson required, at least 12 questions, ids namespaced).
 * Non-strict is used for imported and user-created packs (lesson optional, 1+ questions).
 * Returns { errors, warnings }. A pack is valid when errors is empty.
 */
export function validatePack(pack, { strict = false } = {}) {
  const errors = []
  const warnings = []
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    return { errors: ['Pack must be a JSON object'], warnings }
  }

  if (!isText(pack.id) || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(pack.id)) {
    errors.push('id must be 2-60 characters of a-z, 0-9 and -')
  }
  if (!isText(pack.name)) errors.push('name is required')
  if (strict) {
    if (!SUBJECT_IDS.includes(pack.subject)) errors.push(`subject must be one of: ${SUBJECT_IDS.join(', ')}`)
    if (!LEVELS.includes(pack.level)) errors.push(`level must be one of: ${LEVELS.join(', ')}`)
    if (!isText(pack.description)) errors.push('description is required')
    else if (pack.description.length > 140) warnings.push('description is longer than 140 characters')
    if (!isText(pack.icon) || pack.icon.length > 3) errors.push('icon must be 1-3 characters')
    if (pack.language && !CODE_LANGUAGES.includes(pack.language)) errors.push(`language must be one of: ${CODE_LANGUAGES.join(', ')}`)
    if (!Array.isArray(pack.prereqs)) errors.push('prereqs must be an array (may be empty)')
  }

  const lesson = pack.lesson
  const sectionCount = Array.isArray(lesson?.sections) ? lesson.sections.length : 0
  if (lesson !== undefined && lesson !== null) {
    if (typeof lesson !== 'object') errors.push('lesson must be an object')
    else {
      if (!Array.isArray(lesson.sections) || lesson.sections.length === 0) errors.push('lesson.sections must be a non-empty array')
      ;(lesson.sections || []).forEach((section, i) => {
        const where = `lesson.sections[${i}]`
        if (!isText(section?.title)) errors.push(`${where}: title is required`)
        if (!isText(section?.body)) errors.push(`${where}: body is required`)
        if (section?.language && !CODE_LANGUAGES.includes(section.language)) errors.push(`${where}: unknown language ${section.language}`)
        if (section?.check) {
          if (!isText(section.check.question)) errors.push(`${where}.check: question is required`)
          checkChoices(`${where}.check`, section.check, errors)
          if (strict && !isText(section.check.explanation)) errors.push(`${where}.check: explanation is required`)
        } else if (strict) {
          errors.push(`${where}: check question is required`)
        }
      })
      if (lesson.keyTerms && !Array.isArray(lesson.keyTerms)) errors.push('lesson.keyTerms must be an array')
      ;(lesson.keyTerms || []).forEach((term, i) => {
        if (!isText(term?.term) || !isText(term?.definition)) errors.push(`lesson.keyTerms[${i}]: term and definition are required`)
      })
      if (strict) {
        if (!Number.isFinite(lesson.estimatedMinutes)) errors.push('lesson.estimatedMinutes must be a number')
        if (!isText(lesson.intro)) errors.push('lesson.intro is required')
        if (sectionCount < 3) errors.push('lesson needs at least 3 sections')
        if ((lesson.keyTerms || []).length < 4) errors.push('lesson needs at least 4 key terms')
        if (!Array.isArray(lesson.summary) || lesson.summary.length < 3 || !lesson.summary.every(isText)) errors.push('lesson.summary needs at least 3 takeaways')
        if (!isText(lesson.feynmanPrompt)) errors.push('lesson.feynmanPrompt is required')
      }
    }
  } else if (strict) {
    errors.push('lesson is required')
  }

  if (!Array.isArray(pack.questions) || pack.questions.length === 0) {
    errors.push('questions must be a non-empty array')
    return { errors, warnings }
  }
  if (strict && pack.questions.length < 12) errors.push(`needs at least 12 questions (has ${pack.questions.length})`)

  const ids = new Set()
  const prompts = new Set()
  const types = new Set()
  pack.questions.forEach((q, i) => {
    const where = `questions[${i}]${q?.id ? ` (${q.id})` : ''}`
    if (!q || typeof q !== 'object') {
      errors.push(`${where}: must be an object`)
      return
    }
    if (!isText(q.id)) errors.push(`${where}: id is required`)
    else {
      if (ids.has(q.id)) errors.push(`${where}: duplicate id`)
      ids.add(q.id)
      if (strict && !new RegExp(`^${pack.id}-q\\d{2,3}$`).test(q.id)) errors.push(`${where}: id must look like ${pack.id}-q01`)
    }
    if (!QUESTION_TYPES.includes(q.type)) {
      errors.push(`${where}: type must be one of ${QUESTION_TYPES.join(', ')}`)
      return
    }
    types.add(q.type)
    const prompt = q.question || q.prompt
    if (!isText(prompt)) errors.push(`${where}: question text is required`)
    else {
      const key = `${prompt.trim().toLowerCase()}|${q.code || ''}`
      if (prompts.has(key)) errors.push(`${where}: duplicate question text`)
      prompts.add(key)
      if (/\(variant \d+\)/i.test(prompt)) errors.push(`${where}: placeholder variant text`)
    }
    if (q.difficulty !== undefined && !DIFFICULTIES.includes(q.difficulty)) errors.push(`${where}: difficulty must be easy, medium or hard`)
    if (q.language && !CODE_LANGUAGES.includes(q.language)) errors.push(`${where}: unknown language ${q.language}`)

    if (isChoiceType(q.type)) {
      checkChoices(where, q, errors)
      if (strict && q.choices?.length !== 4) errors.push(`${where}: built-in questions use exactly 4 choices`)
    } else {
      if (!isText(q.answer)) errors.push(`${where}: answer must be text for ${q.type} questions`)
      if (q.accept !== undefined && (!Array.isArray(q.accept) || !q.accept.every(isText))) errors.push(`${where}: accept must be an array of strings`)
      if (q.type === 'typed' && isText(q.answer) && q.answer.length > 60) warnings.push(`${where}: typed answers should be short`)
    }
    if (q.type === 'code-fill' && !(q.code || '').includes(BLANK)) errors.push(`${where}: code-fill code must contain the blank ${BLANK}`)
    if (q.type === 'debug' && !isText(q.code)) errors.push(`${where}: debug questions need code`)

    if (strict) {
      if (!DIFFICULTIES.includes(q.difficulty)) errors.push(`${where}: difficulty is required`)
      if (!isText(q.explanation)) errors.push(`${where}: explanation is required`)
      if (!isText(q.concept)) errors.push(`${where}: concept is required`)
      if (!Number.isInteger(q.section) || q.section < 0 || q.section >= sectionCount) errors.push(`${where}: section must index a lesson section`)
    }
  })
  if (strict && types.size < 2) errors.push('use at least two question types')

  if (strict) {
    const choiceQs = pack.questions.filter((q) => isChoiceType(q.type))
    const zeroes = choiceQs.filter((q) => q.answer === 0).length
    if (choiceQs.length >= 6 && zeroes / choiceQs.length > 0.5) warnings.push('over half of the choice questions use the first option as the answer')
  }
  return { errors, warnings }
}

export function assertValidPack(pack, options) {
  const { errors } = validatePack(pack, options)
  if (errors.length) {
    const more = errors.length > 3 ? ` (+${errors.length - 3} more)` : ''
    throw new Error(`Invalid pack: ${errors.slice(0, 3).join('; ')}${more}`)
  }
  return pack
}

// Text is always rendered as React text nodes and code is escaped before highlighting,
// so sanitizing is about shape and size, not markup. Characters like < must survive
// (comparisons, generics, HTML lessons).
const clip = (value, max) => String(value ?? '').slice(0, max)

/**
 * Normalize an untrusted pack (URL import, file upload, AI output) into a clean shape.
 * Throws when the result is not a valid pack.
 */
/** Lowercase a-z, 0-9 and dashes, 2 to 60 characters. */
export function slugify(value, fallback = 'pack') {
  let slug = String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  if (slug.length < 2) slug = `${slug || fallback}-pack`.slice(0, 60)
  return slug
}

export function sanitizePack(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Pack must be a JSON object')
  const id = slugify(raw.id)
  const pack = {
    id,
    name: clip(raw.name, 80).trim(),
    version: clip(raw.version || '1.0.0', 20),
    author: clip(raw.author || 'Community', 60),
    subject: subjectFor(raw),
    level: LEVELS.includes(raw.level) ? raw.level : 'beginner',
    description: clip(raw.description || '', 200),
    icon: clip(raw.icon || raw.name?.slice(0, 2) || '?', 3),
    language: CODE_LANGUAGES.includes(raw.language) ? raw.language : 'plaintext',
    prereqs: Array.isArray(raw.prereqs) ? raw.prereqs.filter(isText).map((p) => clip(p, 60)) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter(isText).slice(0, 10).map((t) => clip(t, 30)) : [],
    community: true,
    questions: (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 500).map((q, i) => {
      const type = QUESTION_TYPES.includes(q?.type) ? q.type : Array.isArray(q?.choices) ? 'mcq' : 'recall'
      const base = {
        id: clip(q?.id || `${id}-q${String(i + 1).padStart(2, '0')}`, 80),
        type,
        difficulty: DIFFICULTIES.includes(q?.difficulty) ? q.difficulty : 'medium',
        question: clip(q?.question || q?.prompt || '', 600),
        explanation: clip(q?.explanation || '', 800),
        concept: clip(q?.concept || '', 80)
      }
      if (q?.code) base.code = String(q.code).slice(0, 2000)
      if (q?.language && CODE_LANGUAGES.includes(q.language)) base.language = q.language
      if (isChoiceType(type)) {
        base.choices = (Array.isArray(q?.choices) ? q.choices : []).slice(0, 6).map((c) => clip(c, 300))
        base.answer = Number(q?.answer)
      } else {
        base.answer = clip(q?.answer ?? '', 600)
        if (Array.isArray(q?.accept)) base.accept = q.accept.filter(isText).slice(0, 10).map((a) => clip(a, 100))
      }
      if (Number.isInteger(q?.section)) base.section = q.section
      return base
    })
  }
  if (raw.lesson && Array.isArray(raw.lesson.sections) && raw.lesson.sections.length) {
    pack.lesson = {
      estimatedMinutes: Number(raw.lesson.estimatedMinutes) || 10,
      intro: clip(raw.lesson.intro || '', 600),
      sections: raw.lesson.sections.slice(0, 12).map((s) => {
        const section = { title: clip(s?.title, 120), body: clip(s?.body, 3000) }
        if (s?.code) section.code = String(s.code).slice(0, 2000)
        if (s?.language && CODE_LANGUAGES.includes(s.language)) section.language = s.language
        if (s?.tip) section.tip = clip(s.tip, 300)
        if (s?.check && Array.isArray(s.check.choices)) {
          section.check = {
            question: clip(s.check.question, 400),
            choices: s.check.choices.slice(0, 6).map((c) => clip(c, 200)),
            answer: Number(s.check.answer),
            explanation: clip(s.check.explanation || '', 600)
          }
        }
        return section
      }),
      keyTerms: (Array.isArray(raw.lesson.keyTerms) ? raw.lesson.keyTerms : [])
        .filter((t) => isText(t?.term) && isText(t?.definition))
        .slice(0, 30)
        .map((t) => ({ term: clip(t.term, 80), definition: clip(t.definition, 400) })),
      summary: (Array.isArray(raw.lesson.summary) ? raw.lesson.summary : []).filter(isText).slice(0, 8).map((s) => clip(s, 300)),
      feynmanPrompt: clip(raw.lesson.feynmanPrompt || '', 400)
    }
  }
  return assertValidPack(pack)
}
