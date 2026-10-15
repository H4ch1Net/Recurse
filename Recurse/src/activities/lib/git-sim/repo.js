// The git sandbox's repository model: plain data, so a whole repo can be cloned with
// structuredClone. Files are { path: text }. The index is a full snapshot (like git's),
// commits store full trees, and hashes are deterministic so tests stay stable.

export const DEFAULT_BRANCH = 'main'
export const AUTHOR = 'Learner <learner@example.com>'
export const PROJECT_DIR = '/home/learner/project'

export function createRepo({ files = {}, now = Date.now() } = {}) {
  return {
    initialized: false,
    work: { ...files },
    index: {},
    commits: {},
    order: [],
    branches: {},
    head: { branch: DEFAULT_BRANCH },
    merge: null,
    lanes: {},
    seq: 0,
    now,
    orig: null,
    events: [],
    edits: 0
  }
}

// ---- Hashing ----------------------------------------------------------------------

function fnv(str, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** A 40 character hex id derived from the input (not SHA-1, but it looks and acts like one). */
export function makeHash(input) {
  return [0x9e3779b1, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1].map((seed) => fnv(input, seed)).join('')
}

export const short = (hash) => (hash ? hash.slice(0, 7) : '')

// ---- Text and diffs ------------------------------------------------------------------

export function toLines(text) {
  if (text == null || text === '') return []
  const parts = text.split('\n')
  if (parts[parts.length - 1] === '') parts.pop()
  return parts
}

export const fromLines = (lines) => (lines.length ? `${lines.join('\n')}\n` : '')

/** Line diff by longest common subsequence. Ops: { type: '=' | '-' | '+', line }. */
export function diffLines(aText, bText) {
  const a = toLines(aText)
  const b = toLines(bText)
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: '=', line: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ type: '-', line: a[i++] })
    else ops.push({ type: '+', line: b[j++] })
  }
  while (i < n) ops.push({ type: '-', line: a[i++] })
  while (j < m) ops.push({ type: '+', line: b[j++] })
  return ops
}

export function countChanges(aText, bText) {
  let insertions = 0
  let deletions = 0
  for (const op of diffLines(aText ?? '', bText ?? '')) {
    if (op.type === '+') insertions++
    else if (op.type === '-') deletions++
  }
  return { insertions, deletions }
}

/** Changed regions of side relative to base: { start, end, lines } where base[start:end] becomes lines. */
function hunks(baseText, sideText) {
  const out = []
  let bi = 0
  let cur = null
  for (const op of diffLines(baseText, sideText)) {
    if (op.type === '=') {
      if (cur) out.push(cur)
      cur = null
      bi++
      continue
    }
    if (!cur) cur = { start: bi, end: bi, lines: [] }
    if (op.type === '-') {
      bi++
      cur.end = bi
    } else cur.lines.push(op.line)
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Three-way line merge, like git's: changes from both sides apply when they touch different
 * lines; overlapping (or adjacent) changes that differ become a conflict with markers.
 */
export function merge3(baseText, oursText, theirsText, { ours = 'HEAD', theirs = 'theirs' } = {}) {
  const b = baseText ?? ''
  const o = oursText ?? ''
  const t = theirsText ?? ''
  if (o === t) return { text: o, conflict: false }
  if (b === o) return { text: t, conflict: false }
  if (b === t) return { text: o, conflict: false }
  const base = toLines(b)
  const all = [...hunks(b, o).map((h) => ({ ...h, side: 'ours' })), ...hunks(b, t).map((h) => ({ ...h, side: 'theirs' }))].sort((x, y) => x.start - y.start || x.end - y.end)
  const clusters = []
  for (const h of all) {
    const last = clusters[clusters.length - 1]
    if (last && h.start <= last.end) {
      last.hunks.push(h)
      last.end = Math.max(last.end, h.end)
    } else clusters.push({ start: h.start, end: h.end, hunks: [h] })
  }
  const apply = (hs, s, e) => {
    const r = []
    let q = s
    for (const h of hs) {
      r.push(...base.slice(q, h.start), ...h.lines)
      q = h.end
    }
    r.push(...base.slice(q, e))
    return r
  }
  const out = []
  let p = 0
  let conflict = false
  for (const c of clusters) {
    out.push(...base.slice(p, c.start))
    const oh = c.hunks.filter((h) => h.side === 'ours')
    const th = c.hunks.filter((h) => h.side === 'theirs')
    const oLines = apply(oh, c.start, c.end)
    const tLines = apply(th, c.start, c.end)
    if (!oh.length) out.push(...tLines)
    else if (!th.length) out.push(...oLines)
    else if (oLines.join('\n') === tLines.join('\n')) out.push(...oLines)
    else {
      conflict = true
      out.push(`<<<<<<< ${ours}`, ...oLines, '=======', ...tLines, `>>>>>>> ${theirs}`)
    }
    p = c.end
  }
  out.push(...base.slice(p))
  return { text: fromLines(out), conflict }
}

export const hasConflictMarkers = (text) => /^(<<<<<<< |=======$|>>>>>>> )/m.test(text ?? '')

/** Resolve a conflicted file by keeping both sides (what most people do by hand first). */
export function keepBoth(text) {
  return fromLines(toLines(text).filter((l) => !/^(<<<<<<< |=======$|>>>>>>> )/.test(l)))
}

// ---- Graph queries -------------------------------------------------------------------

export function headHash(repo) {
  if (repo.head.detached) return repo.head.detached
  return repo.branches[repo.head.branch] ?? null
}

export const currentBranch = (repo) => repo.head.branch ?? null

export function treeOf(repo, hash) {
  return hash ? repo.commits[hash]?.tree ?? {} : {}
}

export const headTree = (repo) => treeOf(repo, headHash(repo))

export function ancestors(repo, hash) {
  const seen = new Set()
  const stack = hash ? [hash] : []
  while (stack.length) {
    const h = stack.pop()
    if (seen.has(h) || !repo.commits[h]) continue
    seen.add(h)
    stack.push(...repo.commits[h].parents)
  }
  return seen
}

/** True when a is b or an ancestor of b. */
export const isAncestor = (repo, a, b) => Boolean(a && b && ancestors(repo, b).has(a))

/** Best common ancestor: the newest commit both histories contain. */
export function mergeBase(repo, a, b) {
  const ours = ancestors(repo, a)
  let best = null
  for (const h of ancestors(repo, b)) {
    if (ours.has(h) && (!best || repo.commits[h].seq > repo.commits[best].seq)) best = h
  }
  return best
}

/** Commits reachable from any branch, HEAD or an in-progress merge. */
export function reachable(repo) {
  const set = new Set()
  const tips = [...Object.values(repo.branches), headHash(repo), repo.merge?.theirs].filter(Boolean)
  for (const t of tips) for (const h of ancestors(repo, t)) set.add(h)
  return set
}

/** Branch names pointing at a commit, current branch first. */
export function branchesAt(repo, hash) {
  return Object.keys(repo.branches)
    .filter((b) => repo.branches[b] === hash)
    .sort((a, b) => (a === repo.head.branch ? -1 : b === repo.head.branch ? 1 : a.localeCompare(b)))
}

/**
 * Resolve a revision: HEAD, ORIG_HEAD, MERGE_HEAD, a branch, a hash prefix (4+ chars),
 * followed by any number of ~N or ^ steps. Returns a hash or null.
 */
export function resolveRev(repo, rev) {
  const m = /^([^~^]+)((?:[~^]\d*)*)$/.exec(String(rev ?? ''))
  if (!m) return null
  const [, base, steps] = m
  let hash = null
  if (base === 'HEAD' || base === '@') hash = headHash(repo)
  else if (base === 'ORIG_HEAD') hash = repo.orig
  else if (base === 'MERGE_HEAD') hash = repo.merge?.theirs ?? null
  else if (base in repo.branches) hash = repo.branches[base]
  else if (/^[0-9a-f]{4,40}$/.test(base)) {
    const found = repo.order.filter((h) => h.startsWith(base))
    hash = found.length === 1 ? found[0] : null
  }
  if (!hash) return null
  for (const step of steps.match(/[~^]\d*/g) || []) {
    const n = step.length > 1 ? Number(step.slice(1)) : 1
    if (step[0] === '~') {
      for (let i = 0; i < n && hash; i++) hash = repo.commits[hash]?.parents[0] ?? null
    } else if (n === 0) continue
    else hash = repo.commits[hash]?.parents[n - 1] ?? null
    if (!hash) return null
  }
  return hash
}

// ---- Status --------------------------------------------------------------------------

/**
 * Compare HEAD, index and working tree.
 * Returns { staged: [{ path, kind }], unstaged: [{ path, kind }], untracked: [path], conflicts: [path] }.
 */
export function status(repo) {
  const head = headTree(repo)
  const conflicts = repo.merge?.conflicts ?? []
  const paths = [...new Set([...Object.keys(repo.work), ...Object.keys(repo.index), ...Object.keys(head)])].sort()
  const staged = []
  const unstaged = []
  const untracked = []
  for (const path of paths) {
    if (conflicts.includes(path)) continue
    const inHead = path in head
    const inIndex = path in repo.index
    const inWork = path in repo.work
    if (inIndex && !inHead) staged.push({ path, kind: 'new file' })
    else if (!inIndex && inHead) staged.push({ path, kind: 'deleted' })
    else if (inIndex && inHead && repo.index[path] !== head[path]) staged.push({ path, kind: 'modified' })
    if (inIndex && !inWork) unstaged.push({ path, kind: 'deleted' })
    else if (inIndex && inWork && repo.work[path] !== repo.index[path]) unstaged.push({ path, kind: 'modified' })
    else if (!inIndex && inWork) untracked.push(path)
  }
  return { staged, unstaged, untracked, conflicts: [...conflicts] }
}

export function isClean(repo) {
  const s = status(repo)
  return !s.staged.length && !s.unstaged.length && !s.conflicts.length
}

/** Per file view for the staging panel. */
export function fileStates(repo) {
  const head = headTree(repo)
  const s = status(repo)
  const paths = [...new Set([...Object.keys(repo.work), ...Object.keys(repo.index), ...Object.keys(head)])].sort()
  return paths.map((path) => {
    const staged = s.staged.find((x) => x.path === path)
    const unstaged = s.unstaged.find((x) => x.path === path)
    return {
      path,
      inWork: path in repo.work,
      inIndex: path in repo.index,
      inHead: path in head,
      conflict: s.conflicts.includes(path),
      untracked: s.untracked.includes(path),
      staged: staged?.kind ?? null,
      unstaged: unstaged?.kind ?? null,
      markers: hasConflictMarkers(repo.work[path])
    }
  })
}

// ---- Mutations (operate on a clone) ----------------------------------------------------

function nextFreeLane(repo, afterSeq) {
  const homes = new Set(Object.entries(repo.lanes).filter(([b]) => b in repo.branches).map(([, l]) => l))
  for (let lane = 1; ; lane++) {
    if (homes.has(lane)) continue
    const busy = repo.order.some((h) => repo.commits[h].lane === lane && repo.commits[h].seq > afterSeq)
    if (!busy) return lane
  }
}

function laneFor(repo, parent, branch) {
  if (branch && branch in repo.lanes) return repo.lanes[branch]
  let lane = 0
  if (parent) {
    const p = repo.commits[parent]
    const owned = Object.entries(repo.lanes).some(([b, l]) => b !== branch && b in repo.branches && l === p.lane && repo.branches[b] === parent)
    const hasChild = repo.order.some((h) => repo.commits[h].parents[0] === parent)
    lane = owned || hasChild ? nextFreeLane(repo, p.seq) : p.lane
  }
  if (branch) repo.lanes[branch] = lane
  return lane
}

/** Create a commit from the index and move HEAD (or its branch) to it. Returns the commit. */
export function writeCommit(repo, message, parents, { tree = { ...repo.index } } = {}) {
  repo.seq += 1
  const branch = repo.head.branch ?? null
  const time = repo.now + repo.seq * 97000
  const hash = makeHash(`${parents.join(',')}|${message}|${repo.seq}|${JSON.stringify(tree)}`)
  const lane = laneFor(repo, parents[0] ?? null, branch)
  const commit = { hash, parents: [...parents], message, tree, seq: repo.seq, time, lane, branch }
  repo.commits[hash] = commit
  repo.order.push(hash)
  if (branch) repo.branches[branch] = hash
  else repo.head = { detached: hash }
  return commit
}

export function deleteBranch(repo, name) {
  delete repo.branches[name]
  delete repo.lanes[name]
}
