// A small bash-like tokenizer and parser shared by the Linux terminal and the git sandbox.
// Supports single and double quotes, backslash escapes, $VAR and ${VAR} expansion, a
// leading ~, and the operators | > >> < && || ;. Globs are flagged, not expanded: the
// shell expands them against its own file system.

const OPERATORS = ['&&', '||', '>>', '2>', '|', '>', '<', ';']

/**
 * Split a command line into tokens.
 * Returns { tokens, error }. A token is { t: 'word', v, glob } or { t: 'op', v }.
 */
export function tokenize(line, env = {}) {
  const tokens = []
  let word = null
  let glob = false
  let i = 0
  const src = String(line ?? '')

  const push = () => {
    if (word !== null) tokens.push({ t: 'word', v: word, glob })
    word = null
    glob = false
  }
  const add = (s) => {
    word = (word ?? '') + s
  }
  const expandVar = (from) => {
    // from points just after '$'. Returns [value, nextIndex] or null when not a variable.
    if (src[from] === '{') {
      const end = src.indexOf('}', from)
      if (end === -1) return null
      const name = src.slice(from + 1, end)
      return [env[name] ?? '', end + 1]
    }
    if (src[from] === '?') return [String(env['?'] ?? '0'), from + 1]
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(from))
    if (!m) return null
    return [env[m[0]] ?? '', from + m[0].length]
  }

  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t') {
      push()
      i++
      continue
    }
    let op = OPERATORS.find((o) => src.startsWith(o, i))
    if (op === '2>' && word !== null) op = null // "a2>b" is the word a2 then a redirect
    if (op) {
      push()
      tokens.push({ t: 'op', v: op })
      i += op.length
      continue
    }
    if (c === '\\') {
      if (i + 1 < src.length) add(src[i + 1])
      i += 2
      continue
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1)
      if (end === -1) return { tokens, error: "unexpected EOF while looking for matching `''" }
      add(src.slice(i + 1, end))
      i = end + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      let chunk = ''
      let closed = false
      while (j < src.length) {
        const d = src[j]
        if (d === '"') {
          closed = true
          break
        }
        if (d === '\\' && ['"', '\\', '$', '`'].includes(src[j + 1])) {
          chunk += src[j + 1]
          j += 2
          continue
        }
        if (d === '$') {
          const v = expandVar(j + 1)
          if (v) {
            chunk += v[0]
            j = v[1]
            continue
          }
        }
        chunk += d
        j++
      }
      if (!closed) return { tokens, error: 'unexpected EOF while looking for matching `"\'' }
      add(chunk)
      i = j + 1
      continue
    }
    if (c === '$') {
      const v = expandVar(i + 1)
      if (v) {
        add(v[0])
        i = v[1]
        continue
      }
    }
    if (c === '~' && word === null && (i + 1 === src.length || src[i + 1] === '/' || src[i + 1] === ' ') && env.HOME) {
      add(env.HOME)
      i++
      continue
    }
    if (c === '*' || c === '?') glob = true
    if (c === '#' && word === null) break // a comment runs to the end of the line
    add(c)
    i++
  }
  push()
  return { tokens, error: null }
}

/** Just the words of a line, for simple command parsers like the git sandbox. */
export function words(line, env) {
  const { tokens, error } = tokenize(line, env)
  return { words: tokens.map((t) => t.v), error }
}

/**
 * Parse tokens into a list of pipelines joined by ; && ||.
 * Returns { list: [{ join: null|';'|'&&'|'||', pipeline: [{ argv, globs, redirects }] }], error }.
 */
export function parse(tokens) {
  const list = []
  let pipeline = []
  let cmd = { argv: [], globs: [], redirects: [] }
  let join = null

  const endCommand = () => {
    if (!cmd.argv.length && !cmd.redirects.length) return false
    pipeline.push(cmd)
    cmd = { argv: [], globs: [], redirects: [] }
    return true
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.t === 'word') {
      cmd.argv.push(tok.v)
      cmd.globs.push(Boolean(tok.glob))
      continue
    }
    if (tok.v === '>' || tok.v === '>>' || tok.v === '<' || tok.v === '2>') {
      const target = tokens[i + 1]
      if (!target || target.t !== 'word') return { list, error: `syntax error near unexpected token \`${target ? target.v : 'newline'}'` }
      cmd.redirects.push({ op: tok.v, target: target.v })
      i++
      continue
    }
    if (tok.v === '|') {
      if (!endCommand()) return { list, error: "syntax error near unexpected token `|'" }
      if (!tokens[i + 1]) return { list, error: 'syntax error: unexpected end of file' }
      continue
    }
    // ; && ||
    if (!endCommand() && !pipeline.length) return { list, error: `syntax error near unexpected token \`${tok.v}'` }
    list.push({ join, pipeline })
    pipeline = []
    join = tok.v
  }
  endCommand()
  if (pipeline.length) list.push({ join, pipeline })
  else if (join === '&&' || join === '||') return { list, error: 'syntax error: unexpected end of file' }
  return { list, error: null }
}

/** Longest common prefix of a list of strings. */
export function commonPrefix(list) {
  if (!list.length) return ''
  let prefix = list[0]
  for (const s of list) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1)
  }
  return prefix
}

/** Edit distance where swapping two neighbors counts as one edit, for "did you mean" suggestions. */
export function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
    }
  }
  return dp[a.length][b.length]
}

/** The closest candidate within maxDistance, preferring earlier candidates on ties. */
export function suggest(word, candidates, maxDistance = 2) {
  let best = null
  for (const c of candidates) {
    const d = editDistance(word, c)
    if (d <= maxDistance && (!best || d < best.d)) best = { c, d }
  }
  return best?.c ?? null
}

/** Move through command history. dir is -1 (older, Up) or +1 (newer, Down). */
export function historyStep(history, index, dir) {
  if (!history.length) return { index: -1, value: '' }
  let next = index === -1 ? (dir < 0 ? history.length - 1 : -1) : index + dir
  if (next < 0) next = 0
  if (next >= history.length) return { index: -1, value: '' }
  return { index: next, value: history[next] }
}

/**
 * Grade a checklist. tasks: [{ id, check(state) }]. done: Set of finished ids.
 * ordered: a task can only finish after every task before it.
 * Returns the ids that just finished.
 */
export function gradeTasks(tasks, state, done, { ordered = true } = {}) {
  const fresh = []
  for (const task of tasks) {
    if (done.has(task.id)) continue
    let ok
    try {
      ok = Boolean(task.check(state))
    } catch {
      ok = false
    }
    if (ok) {
      done.add(task.id)
      fresh.push(task.id)
    } else if (ordered) break
  }
  return fresh
}
