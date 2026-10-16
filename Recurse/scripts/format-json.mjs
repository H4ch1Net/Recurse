// Formats content JSON the way the repository keeps it: two-space indent, with arrays of
// plain values (strings, numbers, booleans) on one line.
// Usage: node scripts/format-json.mjs file.json [...]
import { readFileSync, writeFileSync } from 'node:fs'

const plain = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)

// Plain arrays up to this many characters stay on one line; small flat objects up to SHORT.
const LONG = 160
const SHORT = 100

export function formatJson(value, indent = '') {
  if (plain(value)) return JSON.stringify(value)
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    if (value.every(plain)) {
      const line = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
      if (line.length <= LONG) return line
    }
    return `[\n${value.map((v) => inner + formatJson(v, inner)).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  if (!entries.length) return '{}'
  if (entries.every(([, v]) => plain(v))) {
    const line = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`
    if (line.length <= SHORT) return line
  }
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, inner)}`).join(',\n')}\n${indent}}`
}

for (const file of process.argv.slice(2)) {
  writeFileSync(file, `${formatJson(JSON.parse(readFileSync(file, 'utf8')))}\n`)
}
