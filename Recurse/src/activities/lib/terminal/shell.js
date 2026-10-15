// A simulated bash shell over the in-memory file system in ./fs.js.
// runShell(state, line) returns a new state plus the lines to print. Output lines are
// { text, tone } or { parts: [{ text, tone }] } where tone is one of out, err, ok, dim,
// dir, exe, match, path. Error messages copy GNU coreutils and bash so learners meet the
// same wording they will see on a real machine.
import { tokenize, parse, suggest, commonPrefix } from './parse.js'
import * as F from './fs.js'

export const HOME = `/home/${F.USER}`
export const HOST = 'recurse'

export function createShell({ files = {}, cwd = HOME, now = Date.now() } = {}) {
  return { fs: F.createFs(files, { now }), cwd, oldpwd: null, history: [], events: [], clock: now, lastCode: 0 }
}

export function promptPath(state) {
  if (state.cwd === HOME) return '~'
  if (state.cwd.startsWith(`${HOME}/`)) return `~${state.cwd.slice(HOME.length)}`
  return state.cwd
}

export const prompt = (state) => `${F.USER}@${HOST}:${promptPath(state)}$ `

const line = (text, tone = 'out') => ({ text, tone })

// ---- Manual pages ---------------------------------------------------------------

export const MAN = {
  pwd: ['pwd - print name of current/working directory', 'Usage: pwd', 'Prints the full path of the folder you are in.'],
  ls: ['ls - list directory contents', 'Usage: ls [-l] [-a] [FILE]...', '  -l   long listing: permissions, owner, size, date', '  -a   include hidden entries (names starting with .)', 'Example: ls -la ~/projects'],
  cd: ['cd - change the working directory', 'Usage: cd [DIR]', '  cd        go to your home folder (~)', '  cd ..     go up one level', '  cd -      go back to the previous folder', 'Paths can be absolute (/etc) or relative (projects/website).'],
  mkdir: ['mkdir - make directories', 'Usage: mkdir [-p] DIRECTORY...', '  -p   create missing parent folders too, no error if it exists'],
  rmdir: ['rmdir - remove empty directories', 'Usage: rmdir DIRECTORY...'],
  touch: ['touch - change file timestamps', 'Usage: touch FILE...', 'Creates an empty file if it does not exist.'],
  cat: ['cat - concatenate files and print on the standard output', 'Usage: cat [-n] [FILE]...', '  -n   number the output lines'],
  echo: ['echo - display a line of text', 'Usage: echo [-n] [STRING]...', '  -n   do not print the trailing newline', 'Redirect with > to overwrite a file or >> to append to it.'],
  cp: ['cp - copy files and directories', 'Usage: cp [-r] SOURCE... DEST', '  -r   copy directories recursively'],
  mv: ['mv - move (rename) files', 'Usage: mv SOURCE... DEST'],
  rm: ['rm - remove files or directories', 'Usage: rm [-r] [-f] FILE...', '  -r   remove directories and their contents', '  -f   ignore missing files, never ask', 'There is no trash can: removed files are gone.'],
  head: ['head - output the first part of files', 'Usage: head [-n NUM] [FILE]...', 'Prints the first 10 lines unless -n says otherwise.'],
  tail: ['tail - output the last part of files', 'Usage: tail [-n NUM] [FILE]...', 'Prints the last 10 lines unless -n says otherwise.'],
  wc: ['wc - print newline, word, and byte counts', 'Usage: wc [-l] [-w] [-c] [FILE]...', '  -l   lines only   -w   words only   -c   bytes only'],
  grep: ['grep - print lines that match patterns', 'Usage: grep [OPTION]... PATTERN [FILE]...', '  -i   ignore case          -n   show line numbers', '  -v   lines that do NOT match   -c   count matching lines', '  -r   search folders recursively   -l   only list file names', 'Example: grep -n ERROR /var/log/app.log'],
  find: ['find - search for files in a directory hierarchy', 'Usage: find [PATH...] [-name PATTERN] [-type f|d]', 'Quote patterns so the shell does not expand them: find . -name "*.txt"'],
  chmod: ['chmod - change file mode bits', 'Usage: chmod MODE FILE...', '  Numeric: 7=rwx 6=rw- 5=r-x 4=r-- for user, group, other (chmod 755 file)', '  Symbolic: u/g/o/a then +, - or = then r, w, x (chmod u+x file)'],
  sort: ['sort - sort lines of text files', 'Usage: sort [-r] [-n] [-u] [FILE]...', '  -r   reverse   -n   compare as numbers   -u   drop duplicates'],
  uniq: ['uniq - report or omit repeated lines', 'Usage: uniq [-c] [-d] [FILE]', 'Only ADJACENT duplicates are merged, so sort first: sort file | uniq', '  -c   prefix lines by the number of occurrences', '  -d   only print duplicated lines'],
  clear: ['clear - clear the terminal screen', 'Usage: clear'],
  history: ['history - show the command history', 'Usage: history', 'Press the Up and Down arrows to reuse earlier commands.'],
  man: ['man - an interface to the system reference manuals', 'Usage: man COMMAND'],
  whoami: ['whoami - print effective user name', 'Usage: whoami'],
  date: ['date - print the system date and time', 'Usage: date'],
  bash: ['bash - run a shell script', 'Usage: bash FILE', 'Runs the script even without the execute bit, because bash only needs to read it.'],
  help: ['help - list the commands this sandbox knows', 'Usage: help']
}

// Most used first, so "did you mean" prefers the likely command.
const COMMON = ['ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'head', 'tail', 'wc', 'find', 'chmod', 'sort', 'uniq', 'man', 'clear', 'history', 'rmdir', 'whoami', 'date', 'bash', 'help', 'exit', 'hostname', 'uname', 'sh']

export const COMMANDS = ['bash', 'cat', 'cd', 'chmod', 'clear', 'cp', 'date', 'echo', 'exit', 'find', 'grep', 'head', 'help', 'history', 'hostname', 'ls', 'man', 'mkdir', 'mv', 'pwd', 'rm', 'rmdir', 'sh', 'sort', 'tail', 'touch', 'uname', 'uniq', 'wc', 'whoami']

// ---- Helpers ---------------------------------------------------------------------

/** Split command flags like -la or -n 5 from operands. `withValue` lists flags that take a value. */
function parseFlags(args, withValue = []) {
  const flags = new Set()
  const values = {}
  const rest = []
  let only = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (only || a === '-' || !a.startsWith('-')) {
      rest.push(a)
      continue
    }
    if (a === '--') {
      only = true
      continue
    }
    if (a.startsWith('--')) {
      flags.add(a)
      continue
    }
    if (/^-\d+$/.test(a)) {
      values.n = a.slice(1)
      continue
    }
    for (let k = 1; k < a.length; k++) {
      const f = a[k]
      if (withValue.includes(f)) {
        const inline = a.slice(k + 1)
        values[f] = inline || args[++i]
        break
      }
      flags.add(f)
    }
  }
  return { flags, values, rest }
}

const textLines = (text) => {
  if (!text) return []
  const parts = text.split('\n')
  if (parts[parts.length - 1] === '') parts.pop()
  return parts
}
const joinLines = (lines) => (lines.length ? `${lines.join('\n')}\n` : '')

/** How find and grep -r print a path below the folder the learner typed. */
function displayPath(raw, root, path) {
  if (path === root) return raw
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw
  return base + (root === '/' ? path : path.slice(root.length))
}

function lsSort(a, b) {
  return F.lsCompare(a, b)
}

function plainSort(a, b) {
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  if (la !== lb) return la < lb ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

// ---- Command implementations ------------------------------------------------------
// Each gets (args, ctx) and returns { stdout, stderr: [], code, rich?, clear? }.
// ctx: { state, stdin (string|null), tty, facts, depth }

function readInput(ctx, raw, errFmt) {
  const { fs } = ctx.state
  const path = F.resolve(ctx.state.cwd, raw)
  const node = fs[path]
  if (!node) return { error: errFmt(raw, 'No such file or directory') }
  if (node.type === 'dir') return { error: errFmt(raw, 'Is a directory') }
  if (!F.canRead(node)) return { error: errFmt(raw, 'Permission denied') }
  ctx.facts.push({ kind: 'read', path })
  return { content: node.content, path }
}

/** Read every operand (or stdin when there are none). Returns { inputs: [{ name, content }], stderr }. */
function gatherInputs(ctx, operands, errFmt) {
  const stderr = []
  const inputs = []
  if (!operands.length) {
    inputs.push({ name: null, content: ctx.stdin ?? '' })
    return { inputs, stderr }
  }
  for (const raw of operands) {
    if (raw === '-') {
      inputs.push({ name: '-', content: ctx.stdin ?? '' })
      continue
    }
    const r = readInput(ctx, raw, errFmt)
    if (r.error) stderr.push(r.error)
    else inputs.push({ name: raw, content: r.content })
  }
  return { inputs, stderr }
}

const ok = (stdout = '', extra = {}) => ({ stdout, stderr: [], code: 0, ...extra })
const fail = (stderr, code = 1, stdout = '') => ({ stdout, stderr: Array.isArray(stderr) ? stderr : [stderr], code })

function touchNode(ctx, path) {
  if (ctx.state.fs[path]) ctx.state.fs[path].mtime = ctx.state.clock
}

/** Create or overwrite a file, checking the parent folder like the kernel would. Returns an error reason or null. */
function writeFile(ctx, path, content, append = false) {
  const { fs } = ctx.state
  if (path === '/dev/null') return null
  const node = fs[path]
  if (node?.type === 'dir') return 'Is a directory'
  const parent = fs[F.parentOf(path)]
  if (!parent) return 'No such file or directory'
  if (parent.type !== 'dir') return 'Not a directory'
  if (node) {
    if (!F.canWrite(node)) return 'Permission denied'
    node.content = append ? node.content + content : content
    node.mtime = ctx.state.clock
    return null
  }
  if (!F.canWrite(parent)) return 'Permission denied'
  fs[path] = { type: 'file', mode: 0o644, owner: F.USER, mtime: ctx.state.clock, content }
  parent.mtime = ctx.state.clock
  return null
}

const builtins = {
  pwd: (args, ctx) => ok(`${ctx.state.cwd}\n`),

  ls(args, ctx) {
    const { fs } = ctx.state
    const { flags, rest } = parseFlags(args)
    for (const f of flags) {
      if (!['l', 'a', 'A', '1', 'h', '--all'].includes(f)) return fail([`ls: invalid option -- '${f.replace(/^--/, '')}'`, "Try 'ls --help' for more information."], 2)
    }
    const long = flags.has('l')
    const all = flags.has('a') || flags.has('--all')
    const almost = flags.has('A')
    const targets = rest.length ? rest : ['.']
    const stderr = []
    const fileEntries = []
    const dirEntries = []
    let code = 0
    for (const raw of targets) {
      const path = F.resolve(ctx.state.cwd, raw)
      const node = fs[path]
      if (!node) {
        stderr.push(`ls: cannot access '${raw}': No such file or directory`)
        code = 2
      } else if (node.type === 'file') fileEntries.push({ raw, path })
      else dirEntries.push({ raw, path })
      if (node) ctx.facts.push({ kind: 'ls', path, long, all: all || almost })
    }

    const entryLine = (name, path) => {
      const node = fs[path]
      const tone = node.type === 'dir' ? 'dir' : node.mode & 0o111 ? 'exe' : 'out'
      return { name, path, node, tone }
    }
    const blocks = [] // { header, entries }
    if (fileEntries.length) blocks.push({ header: null, entries: fileEntries.sort((a, b) => lsSort(a.raw, b.raw)).map((e) => entryLine(e.raw, e.path)) })
    for (const d of dirEntries.sort((a, b) => lsSort(a.raw, b.raw))) {
      const dirNode = fs[d.path]
      if (!F.canRead(dirNode)) {
        stderr.push(`ls: cannot open directory '${d.raw}': Permission denied`)
        code = 2
        continue
      }
      let names = F.children(fs, d.path)
      if (!all && !almost) names = names.filter((n) => !n.startsWith('.'))
      const entries = names.map((n) => entryLine(n, F.resolve(d.path, n)))
      if (all) entries.unshift(entryLine('.', d.path), entryLine('..', F.parentOf(d.path)))
      blocks.push({ header: targets.length > 1 ? `${d.raw}:` : null, entries, total: true })
    }

    const textOut = []
    const rich = []
    blocks.forEach((block, bi) => {
      if (bi > 0) {
        textOut.push('')
        rich.push(line(''))
      }
      if (block.header) {
        textOut.push(block.header)
        rich.push(line(block.header))
      }
      if (long) {
        if (block.total) {
          const total = block.entries.reduce((sum, e) => sum + (e.node.type === 'dir' ? 4 : e.node.content ? Math.max(4, Math.ceil(F.sizeOf(e.node) / 4096) * 4) : 0), 0)
          textOut.push(`total ${total}`)
          rich.push(line(`total ${total}`))
        }
        const sizeW = Math.max(...block.entries.map((e) => String(F.sizeOf(e.node)).length), 1)
        for (const e of block.entries) {
          const links = e.node.type === 'dir' ? 2 + F.children(fs, e.path).filter((n) => fs[F.resolve(e.path, n)].type === 'dir').length : 1
          const size = flags.has('h') && e.node.type === 'file' && F.sizeOf(e.node) >= 1024 ? `${(F.sizeOf(e.node) / 1024).toFixed(1)}K` : String(F.sizeOf(e.node))
          const prefix = `${F.modeString(e.node)} ${links} ${e.node.owner} ${e.node.owner} ${size.padStart(sizeW)} ${F.lsTime(e.node.mtime)} `
          textOut.push(prefix + e.name)
          rich.push({ parts: [{ text: prefix, tone: 'out' }, { text: e.name, tone: e.tone }] })
        }
      } else if (ctx.tty && !flags.has('1')) {
        if (block.entries.length) {
          textOut.push(block.entries.map((e) => e.name).join('  '))
          const parts = []
          block.entries.forEach((e, i) => {
            if (i) parts.push({ text: '  ', tone: 'out' })
            parts.push({ text: e.name, tone: e.tone })
          })
          rich.push({ parts })
        }
      } else {
        for (const e of block.entries) {
          textOut.push(e.name)
          rich.push({ parts: [{ text: e.name, tone: e.tone }] })
        }
      }
    })
    return { stdout: joinLines(textOut), stderr, code, rich }
  },

  cd(args, ctx) {
    const s = ctx.state
    if (args.length > 1) return fail('bash: cd: too many arguments')
    let target = args[0]
    let print = false
    if (target === undefined || target === '~') target = HOME
    if (target === '-') {
      if (!s.oldpwd) return fail('bash: cd: OLDPWD not set')
      target = s.oldpwd
      print = true
    }
    const path = F.resolve(s.cwd, target)
    const node = s.fs[path]
    if (!node) return fail(`bash: cd: ${args[0]}: No such file or directory`)
    if (node.type !== 'dir') return fail(`bash: cd: ${args[0]}: Not a directory`)
    if (!F.canExec(node)) return fail(`bash: cd: ${args[0]}: Permission denied`)
    s.oldpwd = s.cwd
    s.cwd = path
    ctx.facts.push({ kind: 'cd', path })
    return ok(print ? `${path}\n` : '')
  },

  mkdir(args, ctx) {
    const { fs } = ctx.state
    const { flags, rest } = parseFlags(args)
    if (!rest.length) return fail(['mkdir: missing operand', "Try 'mkdir --help' for more information."])
    const stderr = []
    for (const raw of rest) {
      const path = F.resolve(ctx.state.cwd, raw)
      if (fs[path]) {
        if (!(flags.has('p') && fs[path].type === 'dir')) stderr.push(`mkdir: cannot create directory '${raw}': File exists`)
        continue
      }
      const chain = []
      let p = path
      while (!fs[p]) {
        chain.unshift(p)
        p = F.parentOf(p)
      }
      if (fs[p].type !== 'dir') {
        stderr.push(`mkdir: cannot create directory '${raw}': Not a directory`)
        continue
      }
      if (chain.length > 1 && !flags.has('p')) {
        stderr.push(`mkdir: cannot create directory '${raw}': No such file or directory`)
        continue
      }
      if (!F.canWrite(fs[p])) {
        stderr.push(`mkdir: cannot create directory '${raw}': Permission denied`)
        continue
      }
      for (const c of chain) fs[c] = { type: 'dir', mode: 0o755, owner: F.USER, mtime: ctx.state.clock }
      ctx.facts.push({ kind: 'mkdir', path })
    }
    return { stdout: '', stderr, code: stderr.length ? 1 : 0 }
  },

  rmdir(args, ctx) {
    const { fs } = ctx.state
    if (!args.length) return fail(['rmdir: missing operand', "Try 'rmdir --help' for more information."])
    const stderr = []
    for (const raw of args) {
      const path = F.resolve(ctx.state.cwd, raw)
      const node = fs[path]
      if (!node) stderr.push(`rmdir: failed to remove '${raw}': No such file or directory`)
      else if (node.type !== 'dir') stderr.push(`rmdir: failed to remove '${raw}': Not a directory`)
      else if (F.children(fs, path).length) stderr.push(`rmdir: failed to remove '${raw}': Directory not empty`)
      else if (!F.canWrite(fs[F.parentOf(path)])) stderr.push(`rmdir: failed to remove '${raw}': Permission denied`)
      else delete fs[path]
    }
    return { stdout: '', stderr, code: stderr.length ? 1 : 0 }
  },

  touch(args, ctx) {
    const { fs } = ctx.state
    if (!args.length) return fail(['touch: missing file operand', "Try 'touch --help' for more information."])
    const stderr = []
    for (const raw of args) {
      const path = F.resolve(ctx.state.cwd, raw)
      if (fs[path]) {
        if (fs[path].type === 'file' && !F.canWrite(fs[path])) stderr.push(`touch: cannot touch '${raw}': Permission denied`)
        else touchNode(ctx, path)
        continue
      }
      const err = writeFile(ctx, path, '')
      if (err) stderr.push(`touch: cannot touch '${raw}': ${err}`)
      else ctx.facts.push({ kind: 'create', path })
    }
    return { stdout: '', stderr, code: stderr.length ? 1 : 0 }
  },

  cat(args, ctx) {
    const { flags, rest } = parseFlags(args)
    const { inputs, stderr } = gatherInputs(ctx, rest, (raw, why) => `cat: ${raw}: ${why}`)
    let text = inputs.map((i) => i.content).join('')
    if (flags.has('n')) text = joinLines(textLines(text).map((l, i) => `${String(i + 1).padStart(6)}\t${l}`))
    return { stdout: text, stderr, code: stderr.length ? 1 : 0 }
  },

  echo(args) {
    let newline = true
    let rest = args
    if (rest[0] === '-n') {
      newline = false
      rest = rest.slice(1)
    }
    return ok(rest.join(' ') + (newline ? '\n' : ''))
  },

  cp(args, ctx) {
    const { fs } = ctx.state
    const { flags, rest } = parseFlags(args)
    const recursive = flags.has('r') || flags.has('R') || flags.has('a')
    if (!rest.length) return fail(['cp: missing file operand', "Try 'cp --help' for more information."])
    if (rest.length === 1) return fail([`cp: missing destination file operand after '${rest[0]}'`, "Try 'cp --help' for more information."])
    const destRaw = rest[rest.length - 1]
    const dest = F.resolve(ctx.state.cwd, destRaw)
    const sources = rest.slice(0, -1)
    if (sources.length > 1 && !F.isDir(fs, dest)) return fail(`cp: target '${destRaw}' is not a directory`)
    const stderr = []
    for (const raw of sources) {
      const src = F.resolve(ctx.state.cwd, raw)
      const node = fs[src]
      if (!node) {
        stderr.push(`cp: cannot stat '${raw}': No such file or directory`)
        continue
      }
      if (node.type === 'dir' && !recursive) {
        stderr.push(`cp: -r not specified; omitting directory '${raw}'`)
        continue
      }
      const target = F.isDir(fs, dest) ? F.resolve(dest, F.basename(src)) : dest
      if (target === src || target.startsWith(`${src}/`)) {
        stderr.push(node.type === 'dir' ? `cp: cannot copy a directory, '${raw}', into itself, '${destRaw}'` : `cp: '${raw}' and '${destRaw}' are the same file`)
        continue
      }
      if (node.type === 'file') {
        if (!F.canRead(node)) {
          stderr.push(`cp: cannot open '${raw}' for reading: Permission denied`)
          continue
        }
        const err = writeFile(ctx, target, node.content)
        if (err) stderr.push(`cp: cannot create regular file '${destRaw}': ${err}`)
        else ctx.facts.push({ kind: 'copy', from: src, to: target })
        continue
      }
      const parent = fs[F.parentOf(target)]
      if (!parent || parent.type !== 'dir') {
        stderr.push(`cp: cannot create directory '${destRaw}': No such file or directory`)
        continue
      }
      if (!F.canWrite(parent)) {
        stderr.push(`cp: cannot create directory '${destRaw}': Permission denied`)
        continue
      }
      for (const p of F.walk(fs, src)) {
        const to = target + p.slice(src.length)
        fs[to] = { ...fs[p], owner: F.USER, mtime: ctx.state.clock }
      }
      ctx.facts.push({ kind: 'copy', from: src, to: target })
    }
    return { stdout: '', stderr, code: stderr.length ? 1 : 0 }
  },

  mv(args, ctx) {
    const { fs } = ctx.state
    const { rest } = parseFlags(args)
    if (!rest.length) return fail(['mv: missing file operand', "Try 'mv --help' for more information."])
    if (rest.length === 1) return fail([`mv: missing destination file operand after '${rest[0]}'`, "Try 'mv --help' for more information."])
    const destRaw = rest[rest.length - 1]
    const dest = F.resolve(ctx.state.cwd, destRaw)
    const sources = rest.slice(0, -1)
    if (sources.length > 1 && !F.isDir(fs, dest)) return fail(`mv: target '${destRaw}' is not a directory`)
    const stderr = []
    for (const raw of sources) {
      const src = F.resolve(ctx.state.cwd, raw)
      const node = fs[src]
      if (!node) {
        stderr.push(`mv: cannot stat '${raw}': No such file or directory`)
        continue
      }
      const target = F.isDir(fs, dest) ? F.resolve(dest, F.basename(src)) : dest
      if (target === src) {
        stderr.push(`mv: '${raw}' and '${destRaw}' are the same file`)
        continue
      }
      if (target.startsWith(`${src}/`)) {
        stderr.push(`mv: cannot move '${raw}' to a subdirectory of itself, '${destRaw}'`)
        continue
      }
      const parent = fs[F.parentOf(target)]
      if (!parent || parent.type !== 'dir') {
        stderr.push(`mv: cannot move '${raw}' to '${destRaw}': No such file or directory`)
        continue
      }
      if (!F.canWrite(fs[F.parentOf(src)]) || !F.canWrite(parent)) {
        stderr.push(`mv: cannot move '${raw}' to '${destRaw}': Permission denied`)
        continue
      }
      if (fs[target]?.type === 'dir' && node.type === 'file') {
        stderr.push(`mv: cannot overwrite directory '${destRaw}' with non-directory`)
        continue
      }
      for (const p of F.walk(fs, src)) {
        fs[target + p.slice(src.length)] = fs[p]
        delete fs[p]
      }
      ctx.facts.push({ kind: 'move', from: src, to: target })
    }
    return { stdout: '', stderr, code: stderr.length ? 1 : 0 }
  },

  rm(args, ctx) {
    const { fs } = ctx.state
    const { flags, rest } = parseFlags(args)
    const recursive = flags.has('r') || flags.has('R') || flags.has('--recursive')
    const force = flags.has('f') || flags.has('--force')
    if (!rest.length) return force ? ok() : fail(['rm: missing operand', "Try 'rm --help' for more information."])
    const stderr = []
    for (const raw of rest) {
      const path = F.resolve(ctx.state.cwd, raw)
      const node = fs[path]
      if (path === '/' && recursive) {
        stderr.push("rm: it is dangerous to operate recursively on '/'", 'rm: use --no-preserve-root to override this failsafe')
        continue
      }
      if (!node) {
        if (!force) stderr.push(`rm: cannot remove '${raw}': No such file or directory`)
        continue
      }
      if (node.type === 'dir' && !recursive) {
        stderr.push(`rm: cannot remove '${raw}': Is a directory`)
        continue
      }
      if (!F.canWrite(fs[F.parentOf(path)])) {
        stderr.push(`rm: cannot remove '${raw}': Permission denied`)
        continue
      }
      for (const p of F.walk(fs, path)) delete fs[p]
      ctx.facts.push({ kind: 'remove', path })
    }
    return { stdout: '', stderr, code: stderr.length ? 1 : 0 }
  },

  head: (args, ctx) => headTail('head', args, ctx),
  tail: (args, ctx) => headTail('tail', args, ctx),

  wc(args, ctx) {
    const { flags, rest } = parseFlags(args)
    const { inputs, stderr } = gatherInputs(ctx, rest, (raw, why) => `wc: ${raw}: ${why}`)
    let want = ['l', 'w', 'c'].filter((f) => flags.has(f))
    if (!want.length) want = ['l', 'w', 'c']
    const count = (text) => ({ l: (text.match(/\n/g) || []).length, w: text.split(/\s+/).filter(Boolean).length, c: new TextEncoder().encode(text).length })
    const rows = inputs.map((i) => ({ name: i.name, n: count(i.content) }))
    if (rows.length > 1) rows.push({ name: 'total', n: rows.reduce((t, r) => ({ l: t.l + r.n.l, w: t.w + r.n.w, c: t.c + r.n.c }), { l: 0, w: 0, c: 0 }) })
    const fromStdin = rows.length === 1 && rows[0].name === null
    const width = want.length === 1 ? 0 : fromStdin ? 7 : Math.max(...rows.flatMap((r) => want.map((k) => String(r.n[k]).length)))
    const out = rows.map((r) => {
      const nums = want.map((k) => String(r.n[k]).padStart(width)).join(' ')
      return r.name === null ? nums : `${nums} ${r.name}`
    })
    return { stdout: joinLines(out), stderr, code: stderr.length ? 1 : 0 }
  },

  grep(args, ctx) {
    const { fs } = ctx.state
    const { flags, values, rest } = parseFlags(args, ['e'])
    const known = ['i', 'n', 'v', 'c', 'r', 'R', 'l', 'w', 'E', 'F', 'H', 'h', 'o', 's']
    for (const f of flags) {
      if (!known.includes(f)) return fail([`grep: invalid option -- '${f.replace(/^--/, '')}'`, 'Usage: grep [OPTION]... PATTERNS [FILE]...', "Try 'grep --help' for more information."], 2)
    }
    const operands = [...rest]
    const pattern = values.e ?? operands.shift()
    if (pattern === undefined) return fail(['Usage: grep [OPTION]... PATTERNS [FILE]...', "Try 'grep --help' for more information."], 2)
    let source = flags.has('F') ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern
    if (flags.has('w')) source = `\\b(?:${source})\\b`
    let re
    try {
      re = new RegExp(source, flags.has('i') ? 'gi' : 'g')
    } catch {
      return fail('grep: Invalid regular expression', 2)
    }
    const recursive = flags.has('r') || flags.has('R')
    const stderr = []
    const sources = []
    if (!operands.length) {
      if (recursive) operands.push('.')
      else sources.push({ name: null, content: ctx.stdin ?? '' })
    }
    for (const raw of operands) {
      const path = F.resolve(ctx.state.cwd, raw)
      const node = fs[path]
      if (!node) {
        if (!flags.has('s')) stderr.push(`grep: ${raw}: No such file or directory`)
        continue
      }
      if (node.type === 'dir') {
        if (!recursive) {
          stderr.push(`grep: ${raw}: Is a directory`)
          continue
        }
        for (const p of F.walk(fs, path)) {
          const n = fs[p]
          if (n.type !== 'file') continue
          const shown = displayPath(raw, path, p)
          if (!F.canRead(n)) {
            stderr.push(`grep: ${shown}: Permission denied`)
            continue
          }
          ctx.facts.push({ kind: 'read', path: p })
          sources.push({ name: shown, content: n.content })
        }
        continue
      }
      if (!F.canRead(node)) {
        stderr.push(`grep: ${raw}: Permission denied`)
        continue
      }
      ctx.facts.push({ kind: 'read', path })
      sources.push({ name: raw, content: node.content })
    }
    const showName = (sources.length > 1 || recursive) && !flags.has('h') ? true : flags.has('H')
    const textOut = []
    const rich = []
    let matched = 0
    for (const src of sources) {
      let count = 0
      textLines(src.content).forEach((text, idx) => {
        re.lastIndex = 0
        const hit = re.test(text)
        if (hit === flags.has('v')) return
        count++
        matched++
        if (flags.has('c') || flags.has('l')) return
        const prefixParts = []
        if (showName && src.name) prefixParts.push({ text: src.name, tone: 'path' }, { text: ':', tone: 'dim' })
        if (flags.has('n')) prefixParts.push({ text: String(idx + 1), tone: 'ok' }, { text: ':', tone: 'dim' })
        const prefix = prefixParts.map((p) => p.text).join('')
        if (flags.has('o') && !flags.has('v')) {
          re.lastIndex = 0
          for (const m of text.matchAll(re)) {
            if (!m[0]) continue
            textOut.push(prefix + m[0])
            rich.push({ parts: [...prefixParts, { text: m[0], tone: 'match' }] })
          }
          return
        }
        textOut.push(prefix + text)
        const parts = [...prefixParts]
        if (flags.has('v')) parts.push({ text, tone: 'out' })
        else {
          let last = 0
          re.lastIndex = 0
          for (const m of text.matchAll(re)) {
            if (!m[0]) continue
            if (m.index > last) parts.push({ text: text.slice(last, m.index), tone: 'out' })
            parts.push({ text: m[0], tone: 'match' })
            last = m.index + m[0].length
          }
          if (last < text.length) parts.push({ text: text.slice(last), tone: 'out' })
        }
        rich.push({ parts })
      })
      if (flags.has('c')) {
        const t = showName && src.name ? `${src.name}:${count}` : String(count)
        textOut.push(t)
        rich.push(line(t))
      }
      if (flags.has('l') && count) {
        textOut.push(src.name ?? '(standard input)')
        rich.push({ parts: [{ text: src.name ?? '(standard input)', tone: 'path' }] })
      }
    }
    const code = stderr.length && !matched ? 2 : matched ? 0 : 1
    ctx.facts.push({ kind: 'grep', pattern, matched })
    return { stdout: joinLines(textOut), stderr, code, rich }
  },

  find(args, ctx) {
    const { fs } = ctx.state
    const starts = []
    let i = 0
    while (i < args.length && !args[i].startsWith('-')) starts.push(args[i++])
    if (!starts.length) starts.push('.')
    let name = null
    let iname = null
    let type = null
    for (; i < args.length; i++) {
      const a = args[i]
      if (a === '-name' || a === '-iname' || a === '-type') {
        const v = args[++i]
        if (v === undefined) return fail(`find: missing argument to \`${a}'`)
        if (a === '-name') name = F.globToRegExp(v)
        else if (a === '-iname') iname = new RegExp(F.globToRegExp(v).source, 'i')
        else {
          if (!['f', 'd'].includes(v)) return fail(`find: Unknown argument to -type: ${v}`)
          type = v
        }
      } else if (a.startsWith('-')) return fail(`find: unknown predicate \`${a}'`)
      else return fail(`find: paths must precede expression: \`${a}'`)
    }
    const out = []
    const stderr = []
    for (const raw of starts) {
      const root = F.resolve(ctx.state.cwd, raw)
      if (!fs[root]) {
        stderr.push(`find: '${raw}': No such file or directory`)
        continue
      }
      for (const p of F.walk(fs, root)) {
        const node = fs[p]
        const base = F.basename(p)
        const shown = displayPath(raw, root, p)
        if (name && !name.test(base)) continue
        if (iname && !iname.test(base)) continue
        if (type === 'f' && node.type !== 'file') continue
        if (type === 'd' && node.type !== 'dir') continue
        out.push(shown)
      }
    }
    ctx.facts.push({ kind: 'find', results: out })
    return { stdout: joinLines(out), stderr, code: stderr.length ? 1 : 0 }
  },

  chmod(args, ctx) {
    const { fs } = ctx.state
    let rest = args
    let recursive = false
    if (rest[0] === '-R') {
      recursive = true
      rest = rest.slice(1)
    }
    if (rest.length < 2) return fail([rest.length ? `chmod: missing operand after '${rest[0]}'` : 'chmod: missing operand', "Try 'chmod --help' for more information."])
    const [spec, ...files] = rest
    if (F.applyChmod(0, spec) === null) return fail([`chmod: invalid mode: '${spec}'`, "Try 'chmod --help' for more information."])
    const stderr = []
    for (const raw of files) {
      const path = F.resolve(ctx.state.cwd, raw)
      if (!fs[path]) {
        stderr.push(`chmod: cannot access '${raw}': No such file or directory`)
        continue
      }
      const targets = recursive ? F.walk(fs, path) : [path]
      for (const p of targets) {
        const node = fs[p]
        if (node.owner !== F.USER) {
          stderr.push(`chmod: changing permissions of '${p === path ? raw : p}': Operation not permitted`)
          continue
        }
        node.mode = F.applyChmod(node.mode, spec)
        ctx.facts.push({ kind: 'chmod', path: p, mode: node.mode })
      }
    }
    return { stdout: '', stderr, code: stderr.length ? 1 : 0 }
  },

  sort(args, ctx) {
    const { flags, rest } = parseFlags(args)
    const { inputs, stderr } = gatherInputs(ctx, rest, (raw, why) => `sort: cannot read: ${raw}: ${why}`)
    if (stderr.length) return fail(stderr, 2)
    let lines = inputs.flatMap((i) => textLines(i.content))
    if (flags.has('n')) {
      const num = (s) => {
        const m = /^\s*(-?\d+(\.\d+)?)/.exec(s)
        return m ? parseFloat(m[1]) : 0
      }
      lines.sort((a, b) => num(a) - num(b) || plainSort(a, b))
    } else lines.sort(plainSort)
    if (flags.has('r')) lines.reverse()
    if (flags.has('u')) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1])
    return ok(joinLines(lines))
  },

  uniq(args, ctx) {
    const { flags, rest } = parseFlags(args)
    const { inputs, stderr } = gatherInputs(ctx, rest.slice(0, 1), (raw, why) => `uniq: ${raw}: ${why}`)
    if (stderr.length) return fail(stderr)
    const groups = []
    for (const l of textLines(inputs[0]?.content ?? '')) {
      const last = groups[groups.length - 1]
      if (last && last.text === l) last.count++
      else groups.push({ text: l, count: 1 })
    }
    const out = groups
      .filter((g) => (flags.has('d') ? g.count > 1 : flags.has('u') ? g.count === 1 : true))
      .map((g) => (flags.has('c') ? `${String(g.count).padStart(7)} ${g.text}` : g.text))
    return ok(joinLines(out))
  },

  clear: () => ok('', { clear: true }),

  history(args, ctx) {
    return ok(joinLines(ctx.state.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`)))
  },

  man(args) {
    if (!args.length) return fail(['What manual page do you want?', "For example, try 'man man'."])
    const page = MAN[args[0] === 'sh' ? 'bash' : args[0]]
    if (!page) return fail(`No manual entry for ${args[0]}`, 16)
    const [title, usage, ...body] = page
    return ok(joinLines([`NAME`, `    ${title}`, '', 'SYNOPSIS', `    ${usage.replace(/^Usage: /, '')}`, ...(body.length ? ['', 'DESCRIPTION', ...body.map((b) => `    ${b}`)] : [])]))
  },

  help() {
    return ok(
      joinLines([
        'Commands in this sandbox:',
        '  Moving around   pwd  ls  cd',
        '  Files           mkdir  touch  cat  echo  cp  mv  rm  rmdir',
        '  Reading text    head  tail  wc  grep  sort  uniq  find',
        '  Permissions     chmod  ./script.sh  bash script.sh',
        '  Shell           clear  history  man <command>  whoami  date',
        'Operators: cmd | cmd (pipe), > file (overwrite), >> file (append), && and ;',
        'Tab completes commands and paths. Up and Down recall earlier commands.'
      ])
    )
  },

  whoami: () => ok(`${F.USER}\n`),
  hostname: () => ok(`${HOST}\n`),
  uname: (args) => ok(args.includes('-a') ? `Linux ${HOST} 6.8.0-recurse #1 SMP x86_64 GNU/Linux\n` : 'Linux\n'),
  date(args, ctx) {
    const d = new Date(ctx.state.clock)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const pad = (n) => String(n).padStart(2, '0')
    return ok(`${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC ${d.getUTCFullYear()}\n`)
  },
  exit: () => ({ stdout: 'logout\n', stderr: [], code: 0, note: 'This sandbox stays open. Use Reset to start over.' }),
  bash: (args, ctx) => runScript(args[0], ctx, false, args[0] === undefined ? 'bash' : null),
  sh: (args, ctx) => runScript(args[0], ctx, false, args[0] === undefined ? 'sh' : null)
}

function headTail(cmd, args, ctx) {
  const { values, flags, rest } = parseFlags(args, ['n'])
  for (const f of flags) {
    if (!['q', 'v'].includes(f)) return fail([`${cmd}: invalid option -- '${f}'`, `Try '${cmd} --help' for more information.`])
  }
  let fromStart = false
  let n = 10
  if (values.n !== undefined) {
    const raw = String(values.n)
    if (cmd === 'tail' && raw.startsWith('+')) fromStart = true
    n = parseInt(raw.replace(/^\+/, ''), 10)
    if (!Number.isFinite(n) || n < 0) return fail(`${cmd}: invalid number of lines: '${raw}'`)
  }
  const { inputs, stderr } = gatherInputs(ctx, rest, (raw, why) => `${cmd}: cannot open '${raw}' for reading: ${why}`)
  const out = []
  inputs.forEach((input, i) => {
    const lines = textLines(input.content)
    if (inputs.length > 1) {
      if (i) out.push('')
      out.push(`==> ${input.name} <==`)
    }
    if (cmd === 'head') out.push(...lines.slice(0, n))
    else out.push(...(fromStart ? lines.slice(Math.max(0, n - 1)) : n === 0 ? [] : lines.slice(-n)))
  })
  ctx.facts.push({ kind: cmd, n, files: rest.map((r) => F.resolve(ctx.state.cwd, r)) })
  return { stdout: joinLines(out), stderr, code: stderr.length ? 1 : 0 }
}

/** Run a script file. viaPath: started as ./script (needs the execute bit). */
function runScript(raw, ctx, viaPath, usageFor) {
  if (usageFor) return ok('', { note: `Interactive ${usageFor} is not available here. Try: ${usageFor} script.sh` })
  const { fs } = ctx.state
  const path = F.resolve(ctx.state.cwd, raw)
  const node = fs[path]
  if (!node) return fail(`bash: ${raw}: No such file or directory`, 127)
  if (node.type === 'dir') return fail(`bash: ${raw}: Is a directory`, 126)
  if (viaPath && !F.canExec(node)) {
    ctx.facts.push({ kind: 'exec', path, ok: false })
    return fail(`bash: ${raw}: Permission denied`, 126)
  }
  if (!F.canRead(node)) return fail(`bash: ${raw}: Permission denied`, 126)
  if (ctx.depth > 3) return fail('bash: maximum script depth reached', 1)
  let stdout = ''
  const stderr = []
  let code = 0
  for (const scriptLine of textLines(node.content)) {
    const trimmed = scriptLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const r = execLine(ctx.state, trimmed, ctx.depth + 1, ctx.facts)
    stdout += r.stdout
    stderr.push(...r.stderr)
    code = r.code
  }
  ctx.facts.push({ kind: 'exec', path, ok: true, via: viaPath ? 'path' : 'bash' })
  return { stdout, stderr, code }
}

// ---- Execution ------------------------------------------------------------------------

function envOf(state) {
  return { HOME, USER: F.USER, PWD: state.cwd, SHELL: '/bin/bash', HOSTNAME: HOST, '?': String(state.lastCode ?? 0), PATH: '/usr/local/bin:/usr/bin:/bin' }
}

function runCommand(argv, ctx) {
  const [name, ...args] = argv
  if (name.includes('/')) return runScript(name, ctx, true)
  const fn = Object.hasOwn(builtins, name) ? builtins[name] : null
  if (fn && args.includes('--help') && MAN[name]) return builtins.man([name], ctx)
  if (fn) return fn(args, ctx)
  const guess = name.length > 1 ? suggest(name, COMMON) : null
  const res = fail(`${name}: command not found`, 127)
  if (guess) res.note = `Did you mean '${guess}'?`
  return res
}

/**
 * Execute one line against a (mutable) state. Used for typed lines and script lines.
 * Returns { stdout (text of the last pipeline when it reached the terminal), display: lines, stderr, code, clear }.
 */
function execLine(state, text, depth, facts) {
  const { tokens, error } = tokenize(text, envOf(state))
  if (error) return { stdout: '', display: [], stderr: [`bash: ${error}`], code: 2, clear: false, notes: [] }
  const parsed = parse(tokens)
  if (parsed.error) return { stdout: '', display: [], stderr: [`bash: ${parsed.error}`], code: 2, clear: false, notes: [] }

  let stdoutAll = ''
  const display = []
  const stderr = []
  const notes = []
  let code = state.lastCode ?? 0
  let clear = false

  for (const { join, pipeline } of parsed.list) {
    if (join === '&&' && code !== 0) continue
    if (join === '||' && code === 0) continue
    let stdin = null
    for (let k = 0; k < pipeline.length; k++) {
      const cmd = pipeline[k]
      const isLast = k === pipeline.length - 1
      const argv = []
      cmd.argv.forEach((word, i) => {
        if (cmd.globs[i]) {
          const matches = F.expandGlob(state.fs, state.cwd, word)
          if (matches.length) {
            argv.push(...matches)
            return
          }
        }
        argv.push(word)
      })
      let redirectErr = null
      let outTarget = null
      let errToNull = false
      for (const r of cmd.redirects) {
        if (r.op === '<') {
          const path = F.resolve(state.cwd, r.target)
          const node = state.fs[path]
          if (!node) redirectErr = `bash: ${r.target}: No such file or directory`
          else if (node.type === 'dir') redirectErr = `bash: ${r.target}: Is a directory`
          else if (!F.canRead(node)) redirectErr = `bash: ${r.target}: Permission denied`
          else {
            stdin = node.content
            facts.push({ kind: 'read', path })
          }
        } else if (r.op === '2>') errToNull = true
        else outTarget = r
      }
      if (redirectErr) {
        stderr.push(redirectErr)
        code = 1
        stdin = ''
        continue
      }
      if (!argv.length) {
        // A bare redirect such as "> file" creates or empties the file.
        if (outTarget) {
          const err = writeFile({ state }, F.resolve(state.cwd, outTarget.target), '', outTarget.op === '>>')
          if (err) stderr.push(`bash: ${outTarget.target}: ${err}`)
        }
        continue
      }
      const tty = isLast && !outTarget
      const ctx = { state, stdin, tty, facts, depth }
      const result = runCommand(argv, ctx)
      if (!errToNull) stderr.push(...result.stderr)
      if (result.note) notes.push(result.note)
      if (result.clear) clear = true
      code = result.code
      if (outTarget) {
        const path = F.resolve(state.cwd, outTarget.target)
        const err = writeFile(ctx, path, result.stdout, outTarget.op === '>>')
        if (err) {
          stderr.push(`bash: ${outTarget.target}: ${err}`)
          code = 1
        } else facts.push({ kind: 'write', path, append: outTarget.op === '>>' })
        stdin = ''
        continue
      }
      stdin = result.stdout
      if (isLast) {
        stdoutAll += result.stdout
        if (result.rich && tty) display.push(...result.rich)
        else display.push(...textLines(result.stdout).map((t) => line(t)))
      }
    }
  }
  state.lastCode = code
  return { stdout: stdoutAll, display, stderr, code, clear, notes }
}

/**
 * Run a typed command line. Returns { state, out, clear }.
 * The returned state is a fresh copy; the input state is never mutated.
 */
export function runShell(prev, text) {
  const state = structuredClone(prev)
  const typed = String(text ?? '')
  if (!typed.trim()) return { state, out: [], clear: false }
  state.history.push(typed)
  state.clock += 20000
  const facts = []
  const r = execLine(state, typed, 0, facts)
  const out = [...r.stderr.map((t) => line(t, 'err')), ...r.display, ...r.notes.map((t) => line(t, 'dim'))]
  // Errors from a later pipeline stage print after earlier output in real shells, but for
  // a sandbox it reads better to put the stage errors first, then the result.
  const names = []
  try {
    for (const item of parse(tokenize(typed, envOf(prev)).tokens).list) for (const c of item.pipeline) names.push(c.argv[0])
  } catch {
    // names are only used for grading
  }
  state.events.push({ line: typed, names, code: r.code, output: r.stdout, cwd: state.cwd, facts })
  if (state.events.length > 60) state.events.shift()
  return { state, out, clear: r.clear }
}

// ---- Tab completion -------------------------------------------------------------------

/** Complete the word under the cursor (at the end of the line). Returns { line, options }. */
export function complete(state, text) {
  const lastSpace = Math.max(text.lastIndexOf(' '), text.lastIndexOf('|'))
  const before = text.slice(0, lastSpace + 1)
  const partial = text.slice(lastSpace + 1)
  const firstWord = !before.trim() || /[|;&]\s*$/.test(before)
  if (firstWord && !partial.includes('/')) {
    const options = COMMANDS.filter((c) => c.startsWith(partial))
    if (options.length === 1) return { line: `${before}${options[0]} `, options: [] }
    const prefix = commonPrefix(options)
    if (prefix.length > partial.length) return { line: before + prefix, options: [] }
    return { line: text, options }
  }
  const slash = partial.lastIndexOf('/')
  const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : ''
  const namePart = slash >= 0 ? partial.slice(slash + 1) : partial
  const expanded = dirPart.startsWith('~') ? HOME + dirPart.slice(1) : dirPart
  const dir = F.resolve(state.cwd, expanded || '.')
  if (!F.isDir(state.fs, dir)) return { line: text, options: [] }
  const names = F.children(state.fs, dir).filter((n) => n.startsWith(namePart) && (namePart.startsWith('.') || !n.startsWith('.')))
  const decorate = (n) => (F.isDir(state.fs, F.resolve(dir, n)) ? `${n}/` : n)
  if (names.length === 1) {
    const full = decorate(names[0])
    return { line: before + dirPart + full + (full.endsWith('/') ? '' : ' '), options: [] }
  }
  const prefix = commonPrefix(names)
  if (prefix.length > namePart.length) return { line: before + dirPart + prefix, options: [] }
  return { line: text, options: names.map(decorate) }
}
