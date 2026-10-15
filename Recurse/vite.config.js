import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const PACK_DIR = fileURLToPath(new URL('./src/data/packs', import.meta.url))
const INDEX_ID = 'virtual:pack-index'

/** Lesson without its long text: enough for lists, outlines and progress. */
function slimLesson(lesson) {
  if (!lesson) return lesson
  const { sections = [], ...rest } = lesson
  return {
    ...rest,
    partial: true,
    sections: sections.map((s) => ({
      title: s.title,
      ...(s.check ? { check: true } : {}),
      ...(s.activity ? { activity: { type: s.activity.type, ...(s.activity.title ? { title: s.activity.title } : {}) } } : {})
    }))
  }
}

/** A question without its text: enough for scheduling, counts and progress. */
function slimQuestion(q) {
  return { id: q.id, type: q.type, ...(Number.isInteger(q.section) ? { section: q.section } : {}), ...(q.difficulty ? { difficulty: q.difficulty } : {}) }
}

/**
 * `virtual:pack-index`: every built-in pack with slim lessons and slim questions, so the app
 * starts fast. Full lessons load on demand from src/data/packs/<id>.json, and the question text
 * for every pack loads right after startup from `virtual:question-bank` (see src/lib/packs.js).
 */
function packIndex() {
  return {
    name: 'recurse-pack-index',
    resolveId(id) {
      if (id === INDEX_ID) return `\0${INDEX_ID}`
    },
    load(id) {
      if (id !== `\0${INDEX_ID}`) return
      const files = readdirSync(PACK_DIR).filter((f) => f.endsWith('.json')).sort()
      const packs = files.map((file) => {
        const path = join(PACK_DIR, file)
        this.addWatchFile(path)
        const pack = JSON.parse(readFileSync(path, 'utf8'))
        return { ...pack, lesson: slimLesson(pack.lesson), questions: (pack.questions || []).map(slimQuestion), questionsPartial: true }
      })
      // JSON.parse of a string literal is faster to evaluate than a large object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(packs))})`
    }
  }
}

const BANK_ID = 'virtual:question-bank'

/** `virtual:question-bank`: the full questions of every built-in pack, keyed by pack id. */
function questionBank() {
  return {
    name: 'recurse-question-bank',
    resolveId(id) {
      if (id === BANK_ID) return `\0${BANK_ID}`
    },
    load(id) {
      if (id !== `\0${BANK_ID}`) return
      const bank = {}
      for (const file of readdirSync(PACK_DIR).filter((f) => f.endsWith('.json')).sort()) {
        const path = join(PACK_DIR, file)
        this.addWatchFile(path)
        const pack = JSON.parse(readFileSync(path, 'utf8'))
        bank[pack.id] = pack.questions || []
      }
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(bank))})`
    }
  }
}

const CHALLENGE_DIR = fileURLToPath(new URL('./src/data/challenges', import.meta.url))
const CHALLENGE_INDEX_ID = 'virtual:challenge-index'
const CHALLENGE_META = ['id', 'title', 'difficulty', 'pattern', 'topic', 'tags']

/**
 * `virtual:challenge-index`: challenge titles, difficulty and topics for lists. Problem
 * statements, tests and solutions load with their set when a challenge is opened.
 */
function challengeIndex() {
  return {
    name: 'recurse-challenge-index',
    resolveId(id) {
      if (id === CHALLENGE_INDEX_ID) return `\0${CHALLENGE_INDEX_ID}`
    },
    load(id) {
      if (id !== `\0${CHALLENGE_INDEX_ID}`) return
      const sets = readdirSync(CHALLENGE_DIR).filter((f) => f.endsWith('.json')).sort().map((file) => {
        const path = join(CHALLENGE_DIR, file)
        this.addWatchFile(path)
        const set = JSON.parse(readFileSync(path, 'utf8'))
        return {
          file: file.replace(/\.json$/, ''),
          id: set.set || file.replace(/\.json$/, ''),
          title: set.title || set.set,
          description: set.description || '',
          order: Number.isFinite(set.order) ? set.order : 100,
          challenges: (set.challenges || []).filter((c) => c && typeof c.id === 'string').map((c) => Object.fromEntries(CHALLENGE_META.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])))
        }
      })
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(sets))})`
    }
  }
}

export default defineConfig({
  plugins: [react(), packIndex(), questionBank(), challengeIndex()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  build: {
    // The question bank (every question's text) is one large chunk that loads right after the first
    // screen; the startup library chunk holds only metadata, slim lessons and question ids.
    chunkSizeWarningLimit: 3600,
    // Content, framework and app code change at different rates; separate chunks cache independently.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'questions', test: /virtual:question-bank/ },
            { name: 'library', test: /virtual:(pack|challenge)-index|src[\\/]data[\\/](collections|projects)[\\/]/ },
            { name: 'highlight', test: /node_modules[\\/]highlight\.js/ },
            { name: 'vendor', test: /node_modules/ }
          ]
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}']
  }
})
