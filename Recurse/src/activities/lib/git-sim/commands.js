// The git sandbox's command interpreter. runGit(repo, line) returns a new repo plus the
// lines to print. Output and error messages follow real git (2.4x) closely so learners meet
// the same wording at work. A few sandbox-only notes are printed dim and say so.
import { words, suggest } from '../terminal/parse.js'
import * as R from './repo.js'

export const GIT_SUBCOMMANDS = ['add', 'branch', 'checkout', 'commit', 'diff', 'help', 'init', 'log', 'merge', 'rebase', 'reset', 'restore', 'status', 'switch']
export const SHELL_COMMANDS = ['git', 'edit', 'touch', 'cat', 'ls', 'rm', 'pwd', 'clear', 'help']

const NOT_SIMULATED = {
  push: 'there is no remote in this sandbox',
  pull: 'there is no remote in this sandbox',
  fetch: 'there is no remote in this sandbox',
  clone: 'the project is already here',
  remote: 'there is no remote in this sandbox',
  stash: 'commit your work or use git restore instead',
  tag: 'tags are not part of this sandbox yet',
  'cherry-pick': 'try git rebase to replay commits',
  revert: 'try git reset to move a branch back',
  show: 'try git log or git diff',
  reflog: 'faded commits in the graph are the ones only the reflog still knows about',
  rm: 'use rm <file>, then git add',
  mv: 'rename is not part of this sandbox yet',
  config: 'the sandbox is already configured as Learner <learner@example.com>'
}

const L = (text, tone = 'out') => ({ text, tone })
const P = (...parts) => ({ parts })

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

function fmtDate(ms) {
  const d = new Date(ms)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n) => String(n).padStart(2, '0')
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()} +0000`
}

const blobId = (text) => (text === undefined ? '0000000' : R.makeHash(`blob|${text}`).slice(0, 7))

/** Lines like " README.md | 2 +-" plus the summary, for merges and commits. */
function diffstat(before, after, { modes = true } = {}) {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter((p) => before[p] !== after[p])
  const out = []
  if (!paths.length) return out
  const width = Math.max(...paths.map((p) => p.length))
  let ins = 0
  let del = 0
  for (const p of paths) {
    const c = R.countChanges(before[p], after[p])
    ins += c.insertions
    del += c.deletions
    const total = c.insertions + c.deletions
    out.push(P({ text: ` ${p.padEnd(width)} | ${String(total).padStart(2)} `, tone: 'out' }, { text: '+'.repeat(Math.min(c.insertions, 20)), tone: 'ok' }, { text: '-'.repeat(Math.min(c.deletions, 20)), tone: 'err' }))
  }
  out.push(L(summaryLine(paths.length, ins, del)))
  if (modes) {
    for (const p of paths) {
      if (!(p in before)) out.push(L(` create mode 100644 ${p}`))
      else if (!(p in after)) out.push(L(` delete mode 100644 ${p}`))
    }
  }
  return out
}

function summaryLine(files, ins, del) {
  let s = ` ${plural(files, 'file', 'files')} changed`
  if (ins || !del) s += `, ${plural(ins, 'insertion(+)', 'insertions(+)')}`
  if (del) s += `, ${plural(del, 'deletion(-)', 'deletions(-)')}`
  return s
}

/** Decoration like "(HEAD -> main, feature)" for a commit, or ''. */
function decoration(repo, hash) {
  const names = []
  const branches = R.branchesAt(repo, hash)
  if (repo.head.detached === hash) names.push('HEAD')
  for (const b of branches) names.push(repo.head.branch === b ? `HEAD -> ${b}` : b)
  return names.length ? `(${names.join(', ')})` : ''
}

// ---- ASCII graph for git log --graph -------------------------------------------------------

/**
 * Rows for git log --graph. Commit rows: { type: 'commit', hash, prefix, open, cont } where
 * open is the "|\" row a merge starts and cont prefixes the commit's extra lines.
 * Edge rows: { type: 'edge', text } for lanes joining back together ("|/").
 */
export function asciiGraph(repo, hashes) {
  const shown = new Set(hashes)
  const rows = []
  let lanes = []
  for (const h of hashes) {
    let col = lanes.indexOf(h)
    if (col === -1) {
      lanes.push(h)
      col = lanes.length - 1
    }
    const parents = repo.commits[h].parents.filter((p) => shown.has(p))
    const prefix = lanes.map((_, k) => (k === col ? '*' : '|')).join(' ')
    const next = [...lanes]
    let open = null
    if (!parents.length) next.splice(col, 1)
    else {
      next[col] = parents[0]
      for (const p of parents.slice(1)) {
        if (next.includes(p)) continue
        next.splice(col + 1, 0, p)
        let t = ''
        for (let k = 0; k < col; k++) t += '| '
        t += '|\\'
        for (let k = col + 1; k < lanes.length; k++) t += ' \\'
        open = t
      }
    }
    rows.push({ type: 'commit', hash: h, prefix, open, cont: next.length ? next.map(() => '|').join(' ') : '' })
    // Lanes that now expect the same commit join up: draw "|/".
    for (;;) {
      const dup = next.findIndex((x, i) => next.indexOf(x) !== i)
      if (dup === -1) break
      const chars = []
      for (let k = 0; k < next.length; k++) {
        if (k < dup) chars.push('|', ' ')
        else if (k === dup) chars[chars.length - 1] = '/'
        else chars.push(' ', '/')
      }
      rows.push({ type: 'edge', text: chars.join('').trimEnd() })
      next.splice(dup, 1)
    }
    lanes = next
  }
  return rows
}

// ---- The interpreter -------------------------------------------------------------------------

function createCtx(repo) {
  return { repo, out: [], failed: false, clear: false, event: null }
}

const err = (ctx, text) => {
  ctx.failed = true
  for (const t of [].concat(text)) ctx.out.push(L(t, 'err'))
}
const out = (ctx, text, tone) => {
  for (const t of [].concat(text)) ctx.out.push(typeof t === 'string' ? L(t, tone) : t)
}
const note = (ctx, text) => ctx.out.push(L(text, 'dim'))

/**
 * Run one command line. Returns { repo, out, failed, clear }.
 * The input repo is never mutated.
 */
export function runGit(prev, raw) {
  const repo = structuredClone(prev)
  const ctx = createCtx(repo)
  const text = String(raw ?? '').trim()
  if (!text) return { repo, out: [], failed: false, clear: false, event: null }
  const { words: argv, error } = words(text, { HOME: '/home/learner', USER: 'learner', PWD: R.PROJECT_DIR })
  if (error) {
    err(ctx, `bash: ${error}`)
    return finish(ctx, text)
  }
  const [cmd, ...args] = argv
  try {
    if (cmd === 'git') runGitSub(ctx, args)
    else runShellCommand(ctx, cmd, args)
  } catch (e) {
    err(ctx, `error: the sandbox hit a problem running that command (${e.message})`)
  }
  return finish(ctx, text)
}

function finish(ctx, text) {
  const { repo } = ctx
  let event = null
  if (ctx.event) {
    repo.eventSeq = (repo.eventSeq ?? 0) + 1
    event = { ...ctx.event, line: text, ok: !ctx.failed, at: repo.eventSeq }
    repo.events.push(event)
    if (repo.events.length > 80) repo.events.shift()
  }
  return { repo, out: ctx.out, failed: ctx.failed, clear: ctx.clear, event }
}

// ---- Shell commands around the repo -------------------------------------------------------------

function runShellCommand(ctx, cmd, args) {
  const { repo } = ctx
  switch (cmd) {
    case 'help':
      return help(ctx)
    case 'clear':
      ctx.clear = true
      return
    case 'pwd':
      return out(ctx, R.PROJECT_DIR)
    case 'ls': {
      const names = Object.keys(repo.work).sort()
      if (args.includes('-a') || args.includes('-la') || args.includes('-al')) names.unshift('.', '..', ...(repo.initialized ? ['.git'] : []))
      if (names.length) out(ctx, names.join('  '))
      return
    }
    case 'cat': {
      if (!args.length) return note(ctx, 'Usage: cat <file>')
      for (const f of args) {
        if (!(f in repo.work)) err(ctx, `cat: ${f}: No such file or directory`)
        else
          for (const l of R.toLines(repo.work[f])) {
            const tone = /^(<<<<<<<|=======|>>>>>>>)/.test(l) ? 'err' : 'out'
            out(ctx, l, tone)
          }
      }
      ctx.event = { cmd: 'cat', files: args }
      return
    }
    case 'touch': {
      if (!args.length) return err(ctx, ['touch: missing file operand', "Try 'touch --help' for more information."])
      for (const f of args) if (!(f in repo.work)) repo.work[f] = ''
      ctx.event = { cmd: 'touch', files: args }
      return
    }
    case 'rm': {
      const files = args.filter((a) => !a.startsWith('-'))
      if (!files.length) return err(ctx, ['rm: missing operand', "Try 'rm --help' for more information."])
      for (const f of files) {
        if (!(f in repo.work)) err(ctx, `rm: cannot remove '${f}': No such file or directory`)
        else delete repo.work[f]
      }
      ctx.event = { cmd: 'rm', files }
      return
    }
    case 'edit':
      return edit(ctx, args)
    default: {
      err(ctx, `bash: ${cmd}: command not found`)
      const guess = suggest(cmd, ['git', ...SHELL_COMMANDS])
      if (guess) note(ctx, `Did you mean '${guess}'?`)
    }
  }
}

/** Simulated text editing: append a line, or resolve conflict markers by keeping both sides. */
function edit(ctx, args) {
  const { repo } = ctx
  const file = args.find((a) => !a.startsWith('-'))
  if (!file) return note(ctx, 'Usage: edit <file>   (adds a line to the file, or creates it)')
  ctx.event = { cmd: 'edit', file }
  if (!(file in repo.work)) {
    repo.work[file] = `Notes in ${file}\n`
    return note(ctx, `Created ${file} with one line of text.`)
  }
  if (R.hasConflictMarkers(repo.work[file])) {
    repo.work[file] = R.keepBoth(repo.work[file])
    ctx.event.resolved = true
    return note(ctx, `Edited ${file}: removed the conflict markers and kept both versions. Next: git add ${file}`)
  }
  repo.edits += 1
  const where = repo.head.branch ?? 'detached HEAD'
  repo.work[file] = `${repo.work[file]}Change ${repo.edits} made on ${where}\n`
  note(ctx, `Edited ${file}: added the line "Change ${repo.edits} made on ${where}".`)
}

function help(ctx) {
  out(ctx, [
    'usage: git <command> [<args>]',
    '',
    'Start a repository     init',
    'Work on changes        status, add <file>|., restore [--staged] <file>, diff [--staged]',
    'Save history           commit -m "message", log [--oneline] [--graph] [--all]',
    'Branches               branch [name], branch -d <name>, switch [-c] <name>, checkout [-b] <name>',
    'Combine work           merge <branch>, rebase <branch>',
    'Undo                   reset [--soft|--mixed|--hard] HEAD~1',
    ''
  ])
  note(ctx, 'Sandbox commands: edit <file> (change a file), touch <file>, cat <file>, ls, rm <file>, clear.')
  note(ctx, 'Tab completes commands, branches and files. Up and Down recall earlier commands.')
}

// ---- git subcommands ---------------------------------------------------------------------------

function runGitSub(ctx, args) {
  const [sub, ...rest] = args
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') return help(ctx)
  if (sub === '--version' || sub === 'version') return out(ctx, 'git version 2.47.0')
  if (!GIT_SUBCOMMANDS.includes(sub)) {
    if (NOT_SIMULATED[sub]) {
      err(ctx, `git ${sub} is not simulated here: ${NOT_SIMULATED[sub]}.`)
      return
    }
    err(ctx, `git: '${sub}' is not a git command. See 'git --help'.`)
    const guess = suggest(sub, GIT_SUBCOMMANDS)
    if (guess) out(ctx, ['', 'The most similar command is', `\t${guess}`])
    return
  }
  if (sub !== 'init' && !ctx.repo.initialized) return err(ctx, 'fatal: not a git repository (or any of the parent directories): .git')
  const handlers = { init, status, add, commit, log, branch, switch: switchCmd, checkout, merge, rebase, reset, restore, diff }
  handlers[sub](ctx, rest)
}

function init(ctx) {
  const { repo } = ctx
  ctx.event = { cmd: 'init' }
  if (repo.initialized) return out(ctx, `Reinitialized existing Git repository in ${R.PROJECT_DIR}/.git/`)
  repo.initialized = true
  out(ctx, `Initialized empty Git repository in ${R.PROJECT_DIR}/.git/`)
}

function statusLines(repo) {
  const s = R.status(repo)
  const lines = []
  const head = R.headHash(repo)
  if (repo.head.detached) lines.push(P({ text: 'HEAD detached at ', tone: 'err' }, { text: R.short(repo.head.detached), tone: 'err' }))
  else lines.push(L(`On branch ${repo.head.branch}`))
  if (!head) lines.push(L(''), L('No commits yet'))
  if (repo.merge) {
    if (s.conflicts.length) lines.push(L('You have unmerged paths.'), L('  (fix conflicts and run "git commit")'), L('  (use "git merge --abort" to abort the merge)'))
    else lines.push(L('All conflicts fixed but you are still merging.'), L('  (use "git commit" to conclude merge)'))
  }
  const section = (...ls) => {
    if (lines.length > 1 && lines[lines.length - 1].text !== '') lines.push(L(''))
    lines.push(...ls)
  }
  const item = (label, path, tone) => P({ text: '\t', tone: 'out' }, { text: `${`${label}:`.padEnd(12)}${path}`, tone })
  if (s.staged.length) {
    section(L('Changes to be committed:'), L(head ? '  (use "git restore --staged <file>..." to unstage)' : '  (use "git rm --cached <file>..." to unstage)'))
    for (const x of s.staged) lines.push(item(x.kind, x.path, 'ok'))
  }
  if (s.conflicts.length) {
    section(L('Unmerged paths:'), L('  (use "git add <file>..." to mark resolution)'))
    for (const p of s.conflicts) lines.push(P({ text: '\t', tone: 'out' }, { text: `both modified:   ${p}`, tone: 'err' }))
  }
  if (s.unstaged.length) {
    section(L('Changes not staged for commit:'), L('  (use "git add <file>..." to update what will be committed)'), L('  (use "git restore <file>..." to discard changes in working directory)'))
    for (const x of s.unstaged) lines.push(item(x.kind, x.path, 'err'))
  }
  if (s.untracked.length) {
    section(L('Untracked files:'), L('  (use "git add <file>..." to include in what will be committed)'))
    for (const p of s.untracked) lines.push(P({ text: '\t', tone: 'out' }, { text: p, tone: 'err' }))
  }
  lines.push(L(''))
  if (!s.staged.length) {
    if (s.unstaged.length || s.conflicts.length) lines.push(L('no changes added to commit (use "git add" and/or "git commit -a")'))
    else if (s.untracked.length) lines.push(L('nothing added to commit but untracked files present (use "git add" to track)'))
    else if (!repo.merge) lines.push(L(head ? 'nothing to commit, working tree clean' : 'nothing to commit (create/copy files and use "git add" to track)'))
  }
  if (lines[lines.length - 1].text === '') lines.pop()
  return lines
}

function status(ctx) {
  const s = R.status(ctx.repo)
  out(ctx, statusLines(ctx.repo))
  ctx.event = { cmd: 'status', untracked: s.untracked, staged: s.staged.map((x) => x.path), conflicts: s.conflicts, merging: Boolean(ctx.repo.merge) }
}

function add(ctx, args) {
  const { repo } = ctx
  const specs = args.filter((a) => a !== '--')
  if (!specs.length) return out(ctx, ['Nothing specified, nothing added.', "hint: Maybe you wanted to say 'git add .'?"])
  const all = specs.some((a) => ['.', '-A', '--all', '*', ':/'].includes(a))
  const paths = new Set()
  if (all) {
    for (const p of Object.keys(repo.work)) paths.add(p)
    for (const p of Object.keys(repo.index)) paths.add(p)
  }
  for (const spec of specs) {
    if (spec.startsWith('-') || ['.', '*', ':/'].includes(spec)) continue
    if (!(spec in repo.work) && !(spec in repo.index)) return err(ctx, `fatal: pathspec '${spec}' did not match any files`)
    paths.add(spec)
  }
  const added = []
  for (const p of paths) {
    if (p in repo.work) repo.index[p] = repo.work[p]
    else delete repo.index[p]
    added.push(p)
    if (repo.merge) repo.merge.conflicts = repo.merge.conflicts.filter((c) => c !== p)
    if (R.hasConflictMarkers(repo.work[p])) note(ctx, `Heads up: ${p} still has conflict markers (<<<<<<<). Git will not stop you, so fix the file first.`)
  }
  ctx.event = { cmd: 'add', paths: added }
}

function parseCommitArgs(args) {
  const opts = { messages: [], all: false, amend: false, error: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--amend') opts.amend = true
    else if (a === '--all') opts.all = true
    else if (a.startsWith('--message=')) opts.messages.push(a.slice(10))
    else if (a === '--message' || /^-[a-z]*m$/.test(a)) {
      if (a.includes('a')) opts.all = true
      const v = args[++i]
      if (v === undefined) {
        opts.error = "error: switch `m' requires a value"
        break
      }
      opts.messages.push(v)
    } else if (/^-[a-z]*m.+/.test(a)) {
      // -m"message" stuck together
      if (a.slice(1, a.indexOf('m')).includes('a')) opts.all = true
      opts.messages.push(a.slice(a.indexOf('m') + 1))
    } else if (a === '-a') opts.all = true
    else if (a.startsWith('-')) {
      opts.error = `error: unknown option \`${a.replace(/^-+/, '')}'`
      break
    } else {
      opts.error = `error: pathspec '${a}' did not match any file(s) known to git`
      opts.hint = 'Put the message in quotes: git commit -m "your message here"'
      break
    }
  }
  return opts
}

function defaultMergeMessage(repo, name, theirs) {
  const into = repo.head.branch && !['main', 'master'].includes(repo.head.branch) ? ` into ${repo.head.branch}` : ''
  return name in repo.branches ? `Merge branch '${name}'${into}` : `Merge commit '${R.short(theirs)}'${into}`
}

function commit(ctx, args) {
  const { repo } = ctx
  const opts = parseCommitArgs(args)
  if (opts.error) {
    err(ctx, opts.error)
    if (opts.hint) note(ctx, opts.hint)
    return
  }
  if (repo.merge?.conflicts.length) {
    return err(ctx, ['error: Committing is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'hint: as appropriate to mark resolution and make a commit.', 'fatal: Exiting because of an unresolved conflict.'])
  }
  const head = R.headHash(repo)
  if (opts.amend && !head) return err(ctx, 'fatal: You have nothing to amend.')
  if (opts.amend && repo.merge) return err(ctx, 'fatal: You are in the middle of a merge -- cannot amend.')
  if (opts.all) {
    for (const p of Object.keys(repo.index)) {
      if (p in repo.work) repo.index[p] = repo.work[p]
      else delete repo.index[p]
    }
  }
  let message = opts.messages.join('\n\n').trim()
  if (!message && repo.merge) message = repo.merge.message
  if (!message && opts.amend) message = repo.commits[head].message
  if (!message) {
    note(ctx, 'This sandbox has no text editor, so give the message inline: git commit -m "Describe the change"')
    return err(ctx, 'Aborting commit due to empty commit message.')
  }
  const parentTree = opts.amend ? R.treeOf(repo, repo.commits[head].parents[0]) : R.headTree(repo)
  const changed = JSON.stringify(sortKeys(repo.index)) !== JSON.stringify(sortKeys(R.headTree(repo)))
  if (!changed && !repo.merge && !opts.amend) {
    const s = R.status(repo)
    ctx.failed = true
    out(ctx, repo.head.detached ? `HEAD detached at ${R.short(head)}` : `On branch ${repo.head.branch}`)
    if (!head) out(ctx, ['', 'Initial commit'])
    if (s.unstaged.length) {
      out(ctx, ['Changes not staged for commit:'])
      for (const x of s.unstaged) out(ctx, P({ text: '\t', tone: 'out' }, { text: `${`${x.kind}:`.padEnd(12)}${x.path}`, tone: 'err' }))
      out(ctx, ['', 'no changes added to commit (use "git add" and/or "git commit -a")'])
    } else if (s.untracked.length) {
      out(ctx, ['Untracked files:'])
      for (const p of s.untracked) out(ctx, P({ text: '\t', tone: 'out' }, { text: p, tone: 'err' }))
      out(ctx, ['', 'nothing added to commit but untracked files present (use "git add" to track)'])
    } else out(ctx, head ? 'nothing to commit, working tree clean' : 'nothing to commit (create/copy files and use "git add" to track)')
    return
  }
  const parents = opts.amend ? repo.commits[head].parents : repo.merge ? [head, repo.merge.theirs] : head ? [head] : []
  if (opts.amend) repo.orig = head
  const wasMerge = Boolean(repo.merge)
  const c = R.writeCommit(repo, message, parents)
  repo.merge = null
  const where = repo.head.detached ? 'detached HEAD' : repo.head.branch
  out(ctx, `[${where}${parents.length ? '' : ' (root-commit)'} ${R.short(c.hash)}] ${message.split('\n')[0]}`)
  if (opts.amend) out(ctx, ` Date: ${fmtDate(c.time)}`)
  if (!wasMerge) out(ctx, diffstat(parentTree, c.tree).filter((l) => !l.parts))
  ctx.event = { cmd: 'commit', hash: c.hash, branch: repo.head.branch ?? null, merge: wasMerge, amend: opts.amend, parents: parents.length }
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1)))
}

function log(ctx, args) {
  const { repo } = ctx
  const opts = { oneline: false, graph: false, all: false, n: Infinity, revs: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--oneline') opts.oneline = true
    else if (a === '--graph') opts.graph = true
    else if (a === '--all') opts.all = true
    else if (a === '--decorate' || a === '--pretty=oneline') opts.oneline ||= a === '--pretty=oneline'
    else if (a === '-n') opts.n = Number(args[++i])
    else if (/^-\d+$/.test(a)) opts.n = Number(a.slice(1))
    else if (/^--max-count=\d+$/.test(a)) opts.n = Number(a.split('=')[1])
    else if (a.startsWith('-')) return err(ctx, `fatal: unrecognized argument: ${a}`)
    else opts.revs.push(a)
  }
  const head = R.headHash(repo)
  let tips = []
  if (opts.revs.length) {
    for (const r of opts.revs) {
      const h = R.resolveRev(repo, r)
      if (!h) return err(ctx, [`fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.`, "Use '--' to separate paths from revisions, like this:", "'git <command> [<revision>...] -- [<file>...]'"])
      tips.push(h)
    }
  } else if (opts.all) tips = [...Object.values(repo.branches), head].filter(Boolean)
  else tips = head ? [head] : []
  if (!tips.length) return err(ctx, `fatal: your current branch '${repo.head.branch}' does not have any commits yet`)
  const set = new Set()
  for (const t of tips) for (const h of R.ancestors(repo, t)) set.add(h)
  const hashes = [...set].sort((a, b) => repo.commits[b].seq - repo.commits[a].seq).slice(0, opts.n)
  const graphRows = opts.graph ? asciiGraph(repo, hashes) : hashes.map((hash) => ({ type: 'commit', hash, prefix: '', open: null, cont: '' }))

  for (const row of graphRows) {
    if (row.type === 'edge') {
      out(ctx, L(row.text, 'dim'))
      continue
    }
    const c = repo.commits[row.hash]
    const pre = row.prefix ? `${row.prefix} ` : ''
    const cont = row.cont ? `${row.cont} ` : ''
    const dec = decoration(repo, c.hash)
    if (opts.oneline) {
      out(ctx, P({ text: pre, tone: 'dim' }, { text: R.short(c.hash), tone: 'hash' }, { text: dec ? ` ${dec}` : '', tone: 'ref' }, { text: ` ${c.message.split('\n')[0]}`, tone: 'out' }))
      if (row.open) out(ctx, L(row.open, 'dim'))
      continue
    }
    out(ctx, P({ text: pre, tone: 'dim' }, { text: `commit ${c.hash}`, tone: 'hash' }, { text: dec ? ` ${dec}` : '', tone: 'ref' }))
    if (row.open) out(ctx, L(row.open, 'dim'))
    if (c.parents.length > 1) out(ctx, P({ text: cont, tone: 'dim' }, { text: `Merge: ${c.parents.map(R.short).join(' ')}`, tone: 'out' }))
    out(ctx, P({ text: cont, tone: 'dim' }, { text: `Author: ${R.AUTHOR}`, tone: 'out' }))
    out(ctx, P({ text: cont, tone: 'dim' }, { text: `Date:   ${fmtDate(c.time)}`, tone: 'out' }))
    out(ctx, P({ text: cont, tone: 'dim' }))
    for (const m of c.message.split('\n')) out(ctx, P({ text: cont, tone: 'dim' }, { text: `    ${m}`, tone: 'out' }))
    out(ctx, P({ text: cont, tone: 'dim' }))
  }
  if (!opts.oneline && ctx.out.length && ctx.out[ctx.out.length - 1].parts?.length === 1) ctx.out.pop()
  ctx.event = { cmd: 'log', oneline: opts.oneline, graph: opts.graph, all: opts.all, count: hashes.length }
}

function validBranchName(name) {
  return /^[A-Za-z0-9._/-]+$/.test(name) && !name.startsWith('-') && !name.includes('..') && !name.endsWith('/') && !name.endsWith('.') && name !== 'HEAD'
}

function createBranch(ctx, name, startRev) {
  const { repo } = ctx
  if (!validBranchName(name)) {
    err(ctx, `fatal: '${name}' is not a valid branch name`)
    return null
  }
  if (name in repo.branches) {
    err(ctx, `fatal: a branch named '${name}' already exists`)
    return null
  }
  const start = startRev ? R.resolveRev(repo, startRev) : R.headHash(repo)
  if (!start) {
    err(ctx, `fatal: not a valid object name: '${startRev || repo.head.branch || 'HEAD'}'`)
    return null
  }
  repo.branches[name] = start
  return start
}

function branch(ctx, args) {
  const { repo } = ctx
  const flags = args.filter((a) => a.startsWith('-'))
  const names = args.filter((a) => !a.startsWith('-'))
  const del = flags.find((f) => ['-d', '-D', '--delete'].includes(f))
  if (del) {
    if (!names.length) return err(ctx, 'fatal: branch name required')
    for (const name of names) {
      if (!(name in repo.branches)) {
        err(ctx, `error: branch '${name}' not found`)
        continue
      }
      if (repo.head.branch === name) {
        err(ctx, `error: cannot delete branch '${name}' used by worktree at '${R.PROJECT_DIR}'`)
        continue
      }
      const tip = repo.branches[name]
      if (del !== '-D' && !R.isAncestor(repo, tip, R.headHash(repo))) {
        err(ctx, [`error: the branch '${name}' is not fully merged.`, `hint: If you are sure you want to delete it, run 'git branch -D ${name}'`])
        continue
      }
      R.deleteBranch(repo, name)
      out(ctx, `Deleted branch ${name} (was ${R.short(tip)}).`)
      ctx.event = { cmd: 'branch', action: 'delete', name }
    }
    return
  }
  if (flags.some((f) => f === '-m' || f === '-M')) {
    const [a, b] = names.length === 1 ? [repo.head.branch, names[0]] : names
    if (!a || !(a in repo.branches)) return err(ctx, `error: refname refs/heads/${a} not found`)
    if (!b || !validBranchName(b)) return err(ctx, `fatal: '${b}' is not a valid branch name`)
    if (b in repo.branches) return err(ctx, `fatal: a branch named '${b}' already exists`)
    repo.branches[b] = repo.branches[a]
    if (a in repo.lanes) repo.lanes[b] = repo.lanes[a]
    R.deleteBranch(repo, a)
    if (repo.head.branch === a) repo.head = { branch: b }
    ctx.event = { cmd: 'branch', action: 'rename', name: b }
    return
  }
  if (!names.length) {
    const list = []
    if (repo.head.detached) list.push(P({ text: `* (HEAD detached at ${R.short(repo.head.detached)})`, tone: 'ok' }))
    for (const b of Object.keys(repo.branches).sort()) list.push(b === repo.head.branch ? P({ text: '* ', tone: 'out' }, { text: b, tone: 'ok' }) : L(`  ${b}`))
    out(ctx, list)
    ctx.event = { cmd: 'branch', action: 'list' }
    return
  }
  if (createBranch(ctx, names[0], names[1])) ctx.event = { cmd: 'branch', action: 'create', name: names[0] }
}

/**
 * Move HEAD to a commit, carrying local changes like git does. Returns false (after
 * printing git's error) when local changes would be overwritten.
 */
function moveHead(ctx, targetHash, newHead, verb = 'checkout') {
  const { repo } = ctx
  if (repo.merge) {
    err(ctx, repo.merge.conflicts.length ? ['error: you need to resolve your current index first', ...repo.merge.conflicts.map((p) => `${p}: needs merge`)] : ['fatal: cannot switch branch while merging', 'Consider "git merge --quit" or "git worktree add".'])
    return false
  }
  const head = R.headTree(repo)
  const target = R.treeOf(repo, targetHash)
  const paths = [...new Set([...Object.keys(head), ...Object.keys(target), ...Object.keys(repo.index), ...Object.keys(repo.work)])].sort()
  const blocked = []
  const untrackedBlocked = []
  for (const p of paths) {
    const local = repo.index[p] !== head[p] || repo.work[p] !== head[p]
    if (!local || target[p] === head[p]) continue
    if (!(p in head) && !(p in repo.index) && p in repo.work) {
      if (target[p] !== repo.work[p]) untrackedBlocked.push(p)
    } else if (target[p] !== repo.work[p] || target[p] !== repo.index[p]) blocked.push(p)
  }
  if (blocked.length) {
    err(ctx, [`error: Your local changes to the following files would be overwritten by ${verb}:`, ...blocked.map((p) => `\t${p}`), `Please commit your changes or stash them before you ${verb === 'checkout' ? 'switch branches' : verb}.`, 'Aborting'])
    return false
  }
  if (untrackedBlocked.length) {
    err(ctx, [`error: The following untracked working tree files would be overwritten by ${verb}:`, ...untrackedBlocked.map((p) => `\t${p}`), `Please move or remove them before you ${verb === 'checkout' ? 'switch branches' : verb}.`, 'Aborting'])
    return false
  }
  const index = {}
  const work = {}
  const modified = []
  for (const p of paths) {
    const idx = repo.index[p] !== head[p] ? repo.index[p] : target[p]
    const wk = repo.work[p] !== head[p] ? repo.work[p] : target[p]
    if (idx !== undefined) index[p] = idx
    if (wk !== undefined) work[p] = wk
    if (p in head && (repo.work[p] !== head[p] || repo.index[p] !== head[p])) modified.push(`${repo.work[p] === undefined ? 'D' : 'M'}\t${p}`)
  }
  repo.index = index
  repo.work = work
  if (newHead) repo.head = newHead
  if (verb === 'checkout') for (const m of modified) out(ctx, m)
  return true
}

function switchTo(ctx, name, { create = false, start = null, detach = false, cmd = 'switch' } = {}) {
  const { repo } = ctx
  if (create) {
    if (!validBranchName(name)) return err(ctx, `fatal: '${name}' is not a valid branch name`)
    if (name in repo.branches) return err(ctx, `fatal: a branch named '${name}' already exists`)
    const head = R.headHash(repo)
    const target = start ? R.resolveRev(repo, start) : head
    if (start && !target) return err(ctx, `fatal: invalid reference: ${start}`)
    if (!target) {
      // Unborn branch: just rename the branch HEAD points at.
      repo.head = { branch: name }
      out(ctx, `Switched to a new branch '${name}'`)
      ctx.event = { cmd: 'switch', branch: name, created: true }
      return
    }
    if (!moveHead(ctx, target, null)) return
    repo.branches[name] = target
    repo.head = { branch: name }
    out(ctx, `Switched to a new branch '${name}'`)
    ctx.event = { cmd: 'switch', branch: name, created: true }
    return
  }
  if (!detach && name in repo.branches) {
    if (repo.head.branch === name) {
      out(ctx, `Already on '${name}'`)
      ctx.event = { cmd: 'switch', branch: name }
      return
    }
    if (!moveHead(ctx, repo.branches[name], { branch: name })) return
    out(ctx, `Switched to branch '${name}'`)
    ctx.event = { cmd: 'switch', branch: name }
    return
  }
  const hash = R.resolveRev(repo, name)
  if (!hash) return err(ctx, cmd === 'switch' ? `fatal: invalid reference: ${name}` : `error: pathspec '${name}' did not match any file(s) known to git`)
  if (cmd === 'switch' && !detach) return err(ctx, [`fatal: a branch is expected, got commit '${name}'`, 'hint: If you want to detach HEAD at the commit, try again with the --detach option.'])
  if (!moveHead(ctx, hash, { detached: hash })) return
  if (cmd === 'checkout') {
    out(ctx, [
      `Note: switching to '${name}'.`,
      '',
      "You are in 'detached HEAD' state. You can look around, make experimental",
      'changes and commit them, and you can discard any commits you make in this',
      'state without impacting any branches by switching back to a branch.',
      '',
      'If you want to create a new branch to retain commits you create, you may',
      'do so (now or later) by using -c with the switch command. Example:',
      '',
      '  git switch -c <new-branch-name>',
      ''
    ])
  }
  out(ctx, `HEAD is now at ${R.short(hash)} ${repo.commits[hash].message.split('\n')[0]}`)
  ctx.event = { cmd: 'switch', branch: null, detached: hash }
}

function switchCmd(ctx, args) {
  const create = args.find((a) => ['-c', '--create', '-C'].includes(a))
  const detach = args.includes('--detach') || args.includes('-d')
  const names = args.filter((a) => !a.startsWith('-'))
  if (!names.length) return err(ctx, create ? `error: switch \`${create.replace(/^-+/, '')}' requires a value` : 'fatal: missing branch or commit argument')
  switchTo(ctx, names[0], { create: Boolean(create), start: names[1], detach })
}

function checkout(ctx, args) {
  const { repo } = ctx
  const dd = args.indexOf('--')
  const before = dd === -1 ? args : args.slice(0, dd)
  const files = dd === -1 ? [] : args.slice(dd + 1)
  const create = before.find((a) => a === '-b' || a === '-B')
  const side = before.find((a) => a === '--ours' || a === '--theirs')
  const names = before.filter((a) => !a.startsWith('-'))
  if (create) {
    if (!names.length) return err(ctx, "error: switch `b' requires a value")
    return switchTo(ctx, names[0], { create: true, start: names[1], cmd: 'checkout' })
  }
  if (side) {
    const targets = [...names, ...files]
    if (!repo.merge) return err(ctx, `error: path '${targets[0] ?? ''}' does not have ${side === '--ours' ? 'our' : 'their'} version`)
    for (const p of targets) {
      const stage = repo.merge.stages?.[p]
      if (!stage) {
        err(ctx, `error: path '${p}' does not have ${side === '--ours' ? 'our' : 'their'} version`)
        continue
      }
      const v = side === '--ours' ? stage.ours : stage.theirs
      if (v === undefined) delete repo.work[p]
      else repo.work[p] = v
    }
    if (!ctx.failed) out(ctx, `Updated ${plural(targets.length, 'path', 'paths')} from the index`)
    ctx.event = { cmd: 'checkout-side', side, paths: targets }
    return
  }
  // A single name: branch or commit first, then file.
  if (!files.length && names.length === 1 && (names[0] in repo.branches || R.resolveRev(repo, names[0]))) {
    return switchTo(ctx, names[0], { cmd: 'checkout', detach: !(names[0] in repo.branches) })
  }
  const paths = files.length ? files : names
  if (!paths.length) return err(ctx, 'fatal: you must specify path(s) to restore')
  return restoreWork(ctx, paths, 'checkout')
}

function restoreWork(ctx, paths, cmd) {
  const { repo } = ctx
  const all = paths.includes('.')
  const targets = all ? Object.keys(repo.index) : paths
  let n = 0
  for (const p of targets) {
    if (repo.merge?.conflicts.includes(p)) {
      err(ctx, `error: path '${p}' is unmerged`)
      continue
    }
    if (!(p in repo.index)) {
      err(ctx, `error: pathspec '${p}' did not match any file(s) known to git`)
      continue
    }
    if (repo.work[p] !== repo.index[p]) n++
    repo.work[p] = repo.index[p]
  }
  if (cmd === 'checkout' && !ctx.failed) out(ctx, `Updated ${plural(n, 'path', 'paths')} from the index`)
  ctx.event = { cmd: 'restore', staged: false, paths: targets }
}

function restore(ctx, args) {
  const { repo } = ctx
  const staged = args.includes('--staged') || args.includes('-S')
  const paths = args.filter((a) => !a.startsWith('-'))
  if (!paths.length) return err(ctx, 'fatal: you must specify path(s) to restore')
  if (!staged) return restoreWork(ctx, paths, 'restore')
  const head = R.headTree(repo)
  const targets = paths.includes('.') ? [...new Set([...Object.keys(repo.index), ...Object.keys(head)])] : paths
  for (const p of targets) {
    if (!(p in repo.index) && !(p in head)) {
      err(ctx, `error: pathspec '${p}' did not match any file(s) known to git`)
      continue
    }
    if (p in head) repo.index[p] = head[p]
    else delete repo.index[p]
    if (repo.merge) repo.merge.conflicts = repo.merge.conflicts.filter((c) => c !== p)
  }
  ctx.event = { cmd: 'restore', staged: true, paths: targets }
}

/** Merge trees path by path. Returns { tree, conflicts: [{ path, kind }], messages, stages }. */
function mergeTrees(base, ours, theirs, theirsLabel) {
  const tree = {}
  const conflicts = []
  const messages = []
  const stages = {}
  const paths = [...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])].sort()
  for (const p of paths) {
    const b = base[p]
    const o = ours[p]
    const t = theirs[p]
    let result
    if (o === t) result = o
    else if (b === o) result = t
    else if (b === t) result = o
    else if (o === undefined || t === undefined) {
      result = o ?? t
      conflicts.push({ path: p, kind: 'modify/delete' })
      messages.push(`CONFLICT (modify/delete): ${p} deleted in ${o === undefined ? 'HEAD' : theirsLabel} and modified in ${o === undefined ? theirsLabel : 'HEAD'}. Version ${o === undefined ? theirsLabel : 'HEAD'} of ${p} left in tree.`)
      stages[p] = { base: b, ours: o, theirs: t }
    } else {
      const m = R.merge3(b ?? '', o, t, { ours: 'HEAD', theirs: theirsLabel })
      messages.push(`Auto-merging ${p}`)
      result = m.text
      if (m.conflict) {
        conflicts.push({ path: p, kind: b === undefined ? 'add/add' : 'content' })
        messages.push(`CONFLICT (${b === undefined ? 'add/add' : 'content'}): Merge conflict in ${p}`)
        stages[p] = { base: b, ours: o, theirs: t }
      }
    }
    if (result !== undefined) tree[p] = result
  }
  return { tree, conflicts, messages, stages }
}

function merge(ctx, args) {
  const { repo } = ctx
  if (args.includes('--abort')) {
    if (!repo.merge) return err(ctx, 'fatal: There is no merge to abort (MERGE_HEAD missing).')
    const head = R.headTree(repo)
    const untracked = Object.fromEntries(Object.entries(repo.work).filter(([p]) => !(p in repo.index) && !(p in head)))
    repo.index = { ...head }
    repo.work = { ...head, ...untracked }
    repo.merge = null
    ctx.event = { cmd: 'merge', mode: 'abort' }
    return
  }
  if (args.includes('--continue')) {
    if (!repo.merge) return err(ctx, 'fatal: There is no merge in progress (MERGE_HEAD missing).')
    return commit(ctx, [])
  }
  if (repo.merge) {
    if (repo.merge.conflicts.length) return err(ctx, ['error: Merging is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'hint: as appropriate to mark resolution and make a commit.', 'fatal: Exiting because of an unresolved conflict.'])
    return err(ctx, ['fatal: You have not concluded your merge (MERGE_HEAD exists).', 'Please, commit your changes before you merge.'])
  }
  const noFF = args.includes('--no-ff')
  const ffOnly = args.includes('--ff-only')
  let message = null
  const names = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-m') message = args[++i]
    else if (!args[i].startsWith('-')) names.push(args[i])
  }
  if (!names.length) return err(ctx, 'fatal: No remote for the current branch.')
  const name = names[0]
  const theirs = R.resolveRev(repo, name)
  if (!theirs) return err(ctx, `merge: ${name} - not something we can merge`)
  const ours = R.headHash(repo)
  const into = repo.head.branch ?? null
  if (ours && R.isAncestor(repo, theirs, ours)) {
    out(ctx, 'Already up to date.')
    ctx.event = { cmd: 'merge', mode: 'up-to-date', name, into }
    return
  }
  if (!ours || (R.isAncestor(repo, ours, theirs) && !noFF)) {
    const before = R.headTree(repo)
    const newHead = repo.head.branch ? null : { detached: theirs }
    if (!moveHead(ctx, theirs, newHead, 'merge')) return
    if (repo.head.branch) repo.branches[repo.head.branch] = theirs
    out(ctx, [`Updating ${R.short(ours) || '0000000'}..${R.short(theirs)}`, 'Fast-forward'])
    out(ctx, diffstat(before, R.treeOf(repo, theirs)))
    ctx.event = { cmd: 'merge', mode: 'fast-forward', name, into, theirs }
    return
  }
  if (ffOnly) return err(ctx, 'fatal: Not possible to fast-forward, aborting.')
  const head = R.headTree(repo)
  const s = R.status(repo)
  if (s.staged.length) return err(ctx, ['error: Your local changes to the following files would be overwritten by merge:', ...s.staged.map((x) => `\t${x.path}`), 'Please commit your changes or stash them before you merge.', 'Aborting'])
  const base = R.treeOf(repo, R.mergeBase(repo, ours, theirs))
  const result = mergeTrees(base, head, R.treeOf(repo, theirs), name)
  const touched = Object.keys({ ...head, ...result.tree }).filter((p) => head[p] !== result.tree[p])
  const dirty = s.unstaged.map((x) => x.path).filter((p) => touched.includes(p))
  if (dirty.length) return err(ctx, ['error: Your local changes to the following files would be overwritten by merge:', ...dirty.map((p) => `\t${p}`), 'Please commit your changes or stash them before you merge.', 'Aborting'])
  out(ctx, result.messages)
  for (const p of touched) {
    if (p in result.tree) repo.work[p] = result.tree[p]
    else delete repo.work[p]
  }
  repo.index = { ...result.tree }
  for (const c of result.conflicts) {
    if (head[c.path] !== undefined) repo.index[c.path] = head[c.path]
    else delete repo.index[c.path]
  }
  const msg = message || defaultMergeMessage(repo, name, theirs)
  if (result.conflicts.length) {
    repo.merge = { theirs, name, message: msg, conflicts: result.conflicts.map((c) => c.path), stages: result.stages }
    err(ctx, 'Automatic merge failed; fix conflicts and then commit the result.')
    ctx.event = { cmd: 'merge', mode: 'conflict', name, into, theirs, conflicts: result.conflicts.map((c) => c.path) }
    return
  }
  R.writeCommit(repo, msg, [ours, theirs])
  out(ctx, "Merge made by the 'ort' strategy.")
  out(ctx, diffstat(head, result.tree))
  ctx.event = { cmd: 'merge', mode: 'merge', name, into, theirs }
}

function rebase(ctx, args) {
  const { repo } = ctx
  if (args.some((a) => ['--abort', '--continue', '--skip'].includes(a))) return err(ctx, 'fatal: No rebase in progress?')
  const names = args.filter((a) => !a.startsWith('-'))
  if (!names.length) return err(ctx, ['fatal: There is no tracking information for the current branch.', 'Please specify which branch you want to rebase against, for example: git rebase main'])
  const upstream = R.resolveRev(repo, names[0])
  if (!upstream) return err(ctx, `fatal: invalid upstream '${names[0]}'`)
  const ours = R.headHash(repo)
  if (!ours) return err(ctx, 'fatal: your current branch does not have any commits yet')
  const s = R.status(repo)
  if (repo.merge || s.conflicts.length) return err(ctx, ['error: cannot rebase: You have unmerged files.', 'error: Please commit or stash them.'])
  if (s.unstaged.length) return err(ctx, ['error: cannot rebase: You have unstaged changes.', 'error: Please commit or stash them.'])
  if (s.staged.length) return err(ctx, ['error: cannot rebase: Your index contains uncommitted changes.', 'error: Please commit or stash them.'])
  const label = repo.head.branch ?? 'HEAD'
  const oldOrig = repo.orig
  const untracked = Object.fromEntries(s.untracked.map((p) => [p, repo.work[p]]))
  if (R.isAncestor(repo, upstream, ours)) {
    out(ctx, `Current branch ${label} is up to date.`)
    ctx.event = { cmd: 'rebase', mode: 'up-to-date', onto: upstream }
    return
  }
  repo.orig = ours
  if (R.isAncestor(repo, ours, upstream)) {
    if (repo.head.branch) repo.branches[repo.head.branch] = upstream
    else repo.head = { detached: upstream }
    repo.index = { ...R.treeOf(repo, upstream) }
    repo.work = { ...untracked, ...repo.index }
    out(ctx, `Successfully rebased and updated ${repo.head.branch ? `refs/heads/${repo.head.branch}` : 'detached HEAD'}.`)
    ctx.event = { cmd: 'rebase', mode: 'fast-forward', onto: upstream, replayed: 0 }
    return
  }
  const theirsSet = R.ancestors(repo, upstream)
  const todo = [...R.ancestors(repo, ours)].filter((h) => !theirsSet.has(h) && repo.commits[h].parents.length <= 1).sort((a, b) => repo.commits[a].seq - repo.commits[b].seq)
  // Dry run first so a conflict leaves everything untouched.
  let tree = R.treeOf(repo, upstream)
  const plan = []
  for (const h of todo) {
    const c = repo.commits[h]
    const r = mergeTrees(R.treeOf(repo, c.parents[0]), tree, c.tree, `${R.short(h)} (${c.message.split('\n')[0]})`)
    if (r.conflicts.length) {
      out(ctx, r.messages)
      err(ctx, `error: could not apply ${R.short(h)}... ${c.message.split('\n')[0]}`)
      note(ctx, 'This sandbox does not walk through rebase conflicts, so it ran git rebase --abort for you and your branch is unchanged.')
      note(ctx, 'Try git merge instead, or make the two branches change different files.')
      repo.orig = oldOrig
      ctx.event = { cmd: 'rebase', mode: 'conflict', onto: upstream }
      return
    }
    if (JSON.stringify(sortKeys(r.tree)) === JSON.stringify(sortKeys(tree))) continue // already upstream
    plan.push({ from: h, message: c.message, tree: r.tree })
    tree = r.tree
  }
  // Replay for real: new commits, new hashes, same messages.
  if (repo.head.branch) repo.branches[repo.head.branch] = upstream
  else repo.head = { detached: upstream }
  const mapping = {}
  for (const step of plan) {
    const c = R.writeCommit(repo, step.message, [R.headHash(repo)], { tree: step.tree })
    mapping[step.from] = c.hash
  }
  repo.index = { ...R.treeOf(repo, R.headHash(repo)) }
  repo.work = { ...untracked, ...repo.index }
  out(ctx, `Successfully rebased and updated ${repo.head.branch ? `refs/heads/${repo.head.branch}` : 'detached HEAD'}.`)
  ctx.event = { cmd: 'rebase', mode: 'replay', onto: upstream, replayed: plan.length, mapping, branch: repo.head.branch ?? null }
}

function reset(ctx, args) {
  const { repo } = ctx
  const modeFlag = args.find((a) => ['--soft', '--mixed', '--hard'].includes(a))
  const unknown = args.find((a) => a.startsWith('-') && a !== '--' && !['--soft', '--mixed', '--hard'].includes(a))
  if (unknown) return err(ctx, `error: unknown option \`${unknown.replace(/^-+/, '')}'`)
  const dd = args.indexOf('--')
  const operands = (dd === -1 ? args : args.slice(0, dd)).filter((a) => !a.startsWith('-'))
  let paths = dd === -1 ? [] : args.slice(dd + 1)
  let rev = null
  if (operands.length) {
    const first = operands[0]
    const hash = R.resolveRev(repo, first)
    if (hash) {
      rev = first
      paths = [...operands.slice(1), ...paths]
    } else if (first in repo.index || first in repo.work || first in R.headTree(repo)) paths = [...operands, ...paths]
    else return err(ctx, [`fatal: ambiguous argument '${first}': unknown revision or path not in the working tree.`, "Use '--' to separate paths from revisions, like this:", "'git <command> [<revision>...] -- [<file>...]'"])
  }
  const head = R.headHash(repo)
  if (paths.length) {
    if (modeFlag && modeFlag !== '--mixed') return err(ctx, `fatal: Cannot do ${modeFlag.slice(2)} reset with paths.`)
    const source = R.treeOf(repo, rev ? R.resolveRev(repo, rev) : head)
    for (const p of paths) {
      if (p in source) repo.index[p] = source[p]
      else delete repo.index[p]
      if (repo.merge) repo.merge.conflicts = repo.merge.conflicts.filter((c) => c !== p)
    }
    unstagedReport(ctx)
    ctx.event = { cmd: 'reset', mode: 'paths', paths }
    return
  }
  const mode = modeFlag ? modeFlag.slice(2) : 'mixed'
  if (!head && !rev) {
    repo.index = {}
    ctx.event = { cmd: 'reset', mode }
    return
  }
  const target = R.resolveRev(repo, rev ?? 'HEAD')
  if (!target) return err(ctx, [`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`, "Use '--' to separate paths from revisions, like this:", "'git <command> [<revision>...] -- [<file>...]'"])
  const oldIndex = { ...repo.index }
  const oldHeadTree = R.headTree(repo)
  repo.orig = head
  if (repo.head.branch) repo.branches[repo.head.branch] = target
  else repo.head = { detached: target }
  const tree = R.treeOf(repo, target)
  if (mode !== 'soft') {
    repo.index = { ...tree }
    repo.merge = null
  }
  if (mode === 'hard') {
    const untracked = Object.fromEntries(Object.entries(repo.work).filter(([p]) => !(p in oldIndex) && !(p in oldHeadTree)))
    repo.work = { ...untracked, ...tree }
    out(ctx, `HEAD is now at ${R.short(target)} ${repo.commits[target].message.split('\n')[0]}`)
  } else if (mode === 'mixed') unstagedReport(ctx)
  ctx.event = { cmd: 'reset', mode, from: head, to: target }
}

function unstagedReport(ctx) {
  const s = R.status(ctx.repo)
  if (!s.unstaged.length) return
  out(ctx, 'Unstaged changes after reset:')
  for (const x of s.unstaged) out(ctx, `${x.kind === 'deleted' ? 'D' : 'M'}\t${x.path}`)
}

function diff(ctx, args) {
  const { repo } = ctx
  const staged = args.includes('--staged') || args.includes('--cached')
  const stat = args.includes('--stat')
  const revs = args.filter((a) => !a.startsWith('-'))
  let before
  let after
  if (revs.length === 1 && revs[0].includes('..')) revs.splice(0, 1, ...revs[0].split('..'))
  if (revs.length >= 2) {
    const a = R.resolveRev(repo, revs[0])
    const b = R.resolveRev(repo, revs[1])
    if (!a || !b) return err(ctx, `fatal: ambiguous argument '${!a ? revs[0] : revs[1]}': unknown revision or path not in the working tree.`)
    before = R.treeOf(repo, a)
    after = R.treeOf(repo, b)
  } else if (revs.length === 1) {
    const a = R.resolveRev(repo, revs[0])
    if (!a) return err(ctx, `fatal: ambiguous argument '${revs[0]}': unknown revision or path not in the working tree.`)
    before = R.treeOf(repo, a)
    after = staged ? repo.index : trackedWork(repo)
  } else if (staged) {
    before = R.headTree(repo)
    after = repo.index
  } else {
    before = repo.index
    after = trackedWork(repo)
  }
  ctx.event = { cmd: 'diff', staged }
  if (stat) return out(ctx, diffstat(before, after, { modes: false }))
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter((p) => before[p] !== after[p])
  if (!paths.length) {
    if (!staged && !revs.length && R.status(repo).staged.length) note(ctx, 'No unstaged changes. Your changes are staged: try git diff --staged')
    return
  }
  for (const p of paths) {
    const a = before[p]
    const b = after[p]
    out(ctx, L(`diff --git a/${p} b/${p}`, 'strong'))
    if (a === undefined) out(ctx, L('new file mode 100644', 'strong'))
    if (b === undefined) out(ctx, L('deleted file mode 100644', 'strong'))
    out(ctx, L(`index ${blobId(a)}..${blobId(b)}${a !== undefined && b !== undefined ? ' 100644' : ''}`, 'strong'))
    out(ctx, L(a === undefined ? '--- /dev/null' : `--- a/${p}`, 'strong'))
    out(ctx, L(b === undefined ? '+++ /dev/null' : `+++ b/${p}`, 'strong'))
    const ops = R.diffLines(a ?? '', b ?? '')
    const aCount = ops.filter((o) => o.type !== '+').length
    const bCount = ops.filter((o) => o.type !== '-').length
    const range = (n) => (n === 1 ? '1' : `${n ? 1 : 0},${n}`)
    out(ctx, L(`@@ -${range(aCount)} +${range(bCount)} @@`, 'ref'))
    for (const op of ops) {
      if (op.type === '=') out(ctx, L(` ${op.line}`))
      else out(ctx, L(`${op.type}${op.line}`, op.type === '+' ? 'ok' : 'err'))
    }
  }
}

function trackedWork(repo) {
  return Object.fromEntries(Object.entries(repo.work).filter(([p]) => p in repo.index || repo.merge?.conflicts.includes(p)))
}

// ---- Tab completion ----------------------------------------------------------------------------

const BRANCH_ARGS = ['switch', 'checkout', 'merge', 'rebase', 'branch', 'log', 'reset', 'diff']
const FILE_ARGS = ['add', 'restore', 'diff', 'checkout', 'reset']

/** Complete the last word. Returns { line, options }. */
export function completeGit(repo, text, commonPrefix) {
  const parts = text.split(' ')
  const partial = parts[parts.length - 1]
  const before = parts.slice(0, -1).join(' ') + (parts.length > 1 ? ' ' : '')
  let candidates = []
  if (parts.length === 1) candidates = SHELL_COMMANDS
  else if (parts[0] === 'git' && parts.length === 2) candidates = GIT_SUBCOMMANDS
  else if (parts[0] === 'git') {
    const sub = parts[1]
    if (BRANCH_ARGS.includes(sub)) candidates.push(...Object.keys(repo.branches))
    if (FILE_ARGS.includes(sub)) candidates.push(...Object.keys(repo.work), ...Object.keys(repo.index))
    if (partial.startsWith('-')) candidates = flagsFor(sub)
  } else if (['edit', 'cat', 'rm', 'touch'].includes(parts[0])) candidates = Object.keys(repo.work)
  const options = [...new Set(candidates)].filter((c) => c.startsWith(partial)).sort()
  if (options.length === 1) return { line: `${before}${options[0]} `, options: [] }
  const prefix = commonPrefix(options)
  if (prefix.length > partial.length) return { line: before + prefix, options: [] }
  return { line: text, options }
}

function flagsFor(sub) {
  return (
    {
      commit: ['-m', '-a', '-am', '--amend'],
      log: ['--oneline', '--graph', '--all'],
      branch: ['-d', '-D', '-m'],
      switch: ['-c', '--detach'],
      checkout: ['-b', '--ours', '--theirs'],
      merge: ['--abort', '--continue', '--no-ff', '--ff-only'],
      reset: ['--soft', '--mixed', '--hard'],
      restore: ['--staged'],
      diff: ['--staged', '--stat'],
      rebase: ['--abort']
    }[sub] ?? []
  )
}
