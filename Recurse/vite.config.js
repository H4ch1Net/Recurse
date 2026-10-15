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

export default defineConfig({
  plugins: [react(), packIndex()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  build: {
    // The library chunk holds every pack's metadata and questions; lessons load per topic.
    chunkSizeWarningLimit: 2600,
    // Content, framework and app code change at different rates; separate chunks cache independently.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'library', test: /virtual:pack-index|src[\\/]data[\\/](collections|challenges|projects)[\\/]/ },
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
