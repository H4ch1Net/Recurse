// In-memory Unix-like file system: a flat map from absolute path to node.
// node: { type: 'dir' | 'file', mode (number, e.g. 0o644), owner, mtime (ms), content? }
// Plain data, so a whole shell state can be cloned with structuredClone.

export const USER = 'learner'

export function normalize(path) {
  const parts = []
  for (const part of String(path).split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

export function resolve(cwd, path) {
  if (!path) return normalize(cwd)
  return normalize(path.startsWith('/') ? path : `${cwd}/${path}`)
}

export function parentOf(path) {
  if (path === '/') return '/'
  return normalize(path.slice(0, path.lastIndexOf('/')) || '/')
}

export function basename(path) {
  if (path === '/') return '/'
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Build a file system from a spec: { '/path/file': 'text' | { content, mode, owner } | { dir: true, mode, owner } }.
 * Missing parent directories are created (owned by root above /home/learner, by the learner inside it).
 */
export function createFs(spec = {}, { now = 0 } = {}) {
  const fs = { '/': { type: 'dir', mode: 0o755, owner: 'root', mtime: now } }
  const ensureDir = (path) => {
    if (fs[path]) return
    ensureDir(parentOf(path))
    fs[path] = { type: 'dir', mode: path === '/tmp' ? 0o777 : 0o755, owner: path.startsWith(`/home/${USER}`) ? USER : 'root', mtime: now }
  }
  for (const [rawPath, value] of Object.entries(spec)) {
    const path = normalize(rawPath)
    ensureDir(parentOf(path))
    const owner = path.startsWith(`/home/${USER}`) ? USER : 'root'
    if (value && typeof value === 'object' && value.dir) {
      ensureDir(path)
      fs[path] = { ...fs[path], mode: value.mode ?? fs[path].mode, owner: value.owner ?? fs[path].owner }
    } else if (value && typeof value === 'object') {
      fs[path] = { type: 'file', mode: value.mode ?? 0o644, owner: value.owner ?? owner, mtime: now, content: String(value.content ?? '') }
    } else {
      fs[path] = { type: 'file', mode: 0o644, owner, mtime: now, content: String(value ?? '') }
    }
  }
  return fs
}

export const exists = (fs, path) => Boolean(fs[path])
export const isDir = (fs, path) => fs[path]?.type === 'dir'
export const isFile = (fs, path) => fs[path]?.type === 'file'

/** Names directly inside a directory, sorted like ls (case-insensitive, dots ignored). */
export function children(fs, dir) {
  const prefix = dir === '/' ? '/' : `${dir}/`
  const names = []
  for (const path of Object.keys(fs)) {
    if (path === dir || !path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    if (rest && !rest.includes('/')) names.push(rest)
  }
  return names.sort(lsCompare)
}

export function lsCompare(a, b) {
  const ka = a.replace(/^\.+/, '').toLowerCase()
  const kb = b.replace(/^\.+/, '').toLowerCase()
  return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : a > b ? 1 : 0
}

/** Every path at or below a directory, parents first. */
export function walk(fs, root) {
  const prefix = root === '/' ? '/' : `${root}/`
  return Object.keys(fs)
    .filter((p) => p === root || p.startsWith(prefix))
    .sort()
}

// ---- Permissions (owner bits for the owner, "other" bits for everyone else) ----

function bits(node, user) {
  if (!node) return 0
  if (user === 'root') return 7
  return node.owner === user ? (node.mode >> 6) & 7 : node.mode & 7
}
export const canRead = (node, user = USER) => Boolean(bits(node, user) & 4)
export const canWrite = (node, user = USER) => Boolean(bits(node, user) & 2)
export const canExec = (node, user = USER) => Boolean(bits(node, user) & 1)

export function modeString(node) {
  const m = node.mode
  const rwx = (n) => `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`
  return `${node.type === 'dir' ? 'd' : '-'}${rwx((m >> 6) & 7)}${rwx((m >> 3) & 7)}${rwx(m & 7)}`
}

/**
 * Apply a chmod mode: octal ("755") or symbolic ("u+x", "go-w", "a=r", "+x", "u+x,g-w").
 * Returns the new numeric mode, or null when the mode is invalid.
 */
export function applyChmod(mode, spec) {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8) & 0o777
  let result = mode
  for (const clause of spec.split(',')) {
    const m = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause)
    if (!m) return null
    const who = m[1] || 'a'
    const perm = (m[3].includes('r') ? 4 : 0) | (m[3].includes('w') ? 2 : 0) | (m[3].includes('x') ? 1 : 0)
    const shifts = []
    if (who.includes('u') || who.includes('a')) shifts.push(6)
    if (who.includes('g') || who.includes('a')) shifts.push(3)
    if (who.includes('o') || who.includes('a')) shifts.push(0)
    for (const s of shifts) {
      if (m[2] === '+') result |= perm << s
      else if (m[2] === '-') result &= ~(perm << s)
      else result = (result & ~(7 << s)) | (perm << s)
    }
  }
  return result & 0o777
}

/** Glob pattern (* ? [abc]) to a RegExp that matches a whole name. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else if (c === '[') {
      const end = glob.indexOf(']', i + 1)
      if (end === -1) re += '\\['
      else {
        re += `[${glob.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`
        i = end
      }
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** Expand a glob word against the file system. Returns matches (as typed, relative or absolute) or []. */
export function expandGlob(fs, cwd, word) {
  const absolute = word.startsWith('/')
  const segments = word.split('/').filter((s, i) => s || i === 0)
  let bases = [absolute ? '/' : cwd]
  let shown = [absolute ? '/' : '']
  const parts = absolute ? segments.slice(1) : segments
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]
    const last = i === parts.length - 1
    const nextBases = []
    const nextShown = []
    bases.forEach((base, k) => {
      const join = (name) => (shown[k] === '' ? name : shown[k] === '/' ? `/${name}` : `${shown[k]}/${name}`)
      if (/[*?[]/.test(seg)) {
        const re = globToRegExp(seg)
        for (const name of children(fs, base)) {
          if (name.startsWith('.') && !seg.startsWith('.')) continue
          if (!re.test(name)) continue
          const full = resolve(base, name)
          if (!last && !isDir(fs, full)) continue
          nextBases.push(full)
          nextShown.push(join(name))
        }
      } else {
        const full = resolve(base, seg)
        if (fs[full]) {
          nextBases.push(full)
          nextShown.push(join(seg))
        }
      }
    })
    bases = nextBases
    shown = nextShown
  }
  return shown.sort()
}

/** Format a time like ls -l does: "Oct 14 09:12" (UTC so output is stable). */
export function lsTime(ms) {
  const d = new Date(ms)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n) => String(n).padStart(2, '0')
  return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export function sizeOf(node) {
  if (!node) return 0
  if (node.type === 'dir') return 4096
  return new TextEncoder().encode(node.content).length
}
