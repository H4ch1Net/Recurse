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

/**
 * `virtual:pack-index`: every built-in pack with slim lessons, so the app starts fast.
 * Full lessons load on demand from src/data/packs/<id>.json (see src/lib/packs.js).
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
        return { ...pack, lesson: slimLesson(pack.lesson) }
      })
      // JSON.parse of a string literal is faster to evaluate than a large object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(packs))})`
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
  plugins: [react(), packIndex(), challengeIndex()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  build: {
    // The library chunk holds every pack's metadata and questions (about 760 kB gzipped), which
    // scheduling needs up front; lessons and challenge statements load per topic.
    chunkSizeWarningLimit: 3200,
    // Content, framework and app code change at different rates; separate chunks cache independently.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
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
