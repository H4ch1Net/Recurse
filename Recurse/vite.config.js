import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  build: {
    // The content chunk holds every built-in pack so the whole library works offline.
    chunkSizeWarningLimit: 900,
    // Content, framework and app code change at different rates; separate chunks cache independently.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'content', test: /src[\\/]data[\\/]packs/ },
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
