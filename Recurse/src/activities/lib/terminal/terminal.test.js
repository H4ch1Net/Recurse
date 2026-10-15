import { describe, expect, it } from 'vitest'
import { tokenize, parse, historyStep, commonPrefix, gradeTasks } from './parse.js'
import { applyChmod, modeString, normalize, resolve, expandGlob, createFs, globToRegExp } from './fs.js'
import { createShell, runShell, complete, prompt, HOME } from './shell.js'
import { BASE_FILES, SCENARIOS, ERROR_LINES, UNIQUE_VISITORS } from './scenarios.js'

const NOW = Date.UTC(2026, 9, 14, 9, 0)
const fresh = () => createShell({ files: BASE_FILES, now: NOW })
const text = (out) => out.map((l) => (l.parts ? l.parts.map((p) => p.text).join('') : l.text)).join('\n')

/** Run several lines, returning the final state and the output of the last line. */
function run(lines, state = fresh()) {
  let s = state
  let out = []
  let clear = false
  for (const l of [].concat(lines)) {
    const r = runShell(s, l)
    s = r.state
    out = r.out
    clear = r.clear
  }
  return { s, out, txt: text(out), errs: out.filter((l) => l.tone === 'err').map((l) => l.text), clear }
}

describe('tokenize and parse', () => {
  it('handles quotes, escapes and variables', () => {
    const { tokens } = tokenize(`echo "hi $USER" 'no $USER' a\\ b ~/x`, { USER: 'learner', HOME: '/home/learner' })
    expect(tokens.map((t) => t.v)).toEqual(['echo', 'hi learner', 'no $USER', 'a b', '/home/learner/x'])
  })
  it('reports an unterminated quote', () => {
    expect(tokenize('echo "oops').error).toMatch(/unexpected EOF/)
  })
  it('splits pipelines, redirects and lists', () => {
    const { list } = parse(tokenize('grep a f.txt | wc -l > out.txt && echo done; ls').tokens)
    expect(list).toHaveLength(3)
    expect(list[0].pipeline.map((c) => c.argv[0])).toEqual(['grep', 'wc'])
    expect(list[0].pipeline[1].redirects).toEqual([{ op: '>', target: 'out.txt' }])
    expect(list[1].join).toBe('&&')
    expect(list[2].join).toBe(';')
  })
  it('flags globs and rejects a dangling pipe', () => {
    expect(tokenize('ls *.txt').tokens[1].glob).toBe(true)
    expect(tokenize('ls "*.txt"').tokens[1].glob).toBe(false)
    expect(parse(tokenize('| wc').tokens).error).toMatch(/syntax error/)
  })
  it('walks history and finds common prefixes', () => {
    const h = ['ls', 'pwd', 'cd ..']
    expect(historyStep(h, -1, -1)).toEqual({ index: 2, value: 'cd ..' })
    expect(historyStep(h, 0, -1)).toEqual({ index: 0, value: 'ls' })
    expect(historyStep(h, 2, 1)).toEqual({ index: -1, value: '' })
    expect(commonPrefix(['projects/', 'profile'])).toBe('pro')
  })
  it('grades ordered and unordered task lists', () => {
    const tasks = [{ id: 'a', check: (s) => s.a }, { id: 'b', check: (s) => s.b }]
    const done = new Set()
    expect(gradeTasks(tasks, { a: false, b: true }, done)).toEqual([])
    expect(gradeTasks(tasks, { a: false, b: true }, new Set(), { ordered: false })).toEqual(['b'])
    expect(gradeTasks(tasks, { a: true, b: true }, done)).toEqual(['a', 'b'])
  })
})

describe('file system helpers', () => {
  it('normalizes and resolves paths', () => {
    expect(normalize('/home//learner/./x/../y/')).toBe('/home/learner/y')
    expect(resolve('/home/learner', '../..')).toBe('/')
    expect(resolve('/home/learner', '/etc/hosts')).toBe('/etc/hosts')
  })
  it('applies numeric and symbolic chmod modes', () => {
    expect(applyChmod(0o644, '755')).toBe(0o755)
    expect(applyChmod(0o644, 'u+x')).toBe(0o744)
    expect(applyChmod(0o755, 'go-rx')).toBe(0o700)
    expect(applyChmod(0o644, '+x')).toBe(0o755)
    expect(applyChmod(0o777, 'a=r')).toBe(0o444)
    expect(applyChmod(0o600, 'u+x,g+r')).toBe(0o740)
    expect(applyChmod(0o644, 'z+q')).toBeNull()
    expect(modeString({ type: 'dir', mode: 0o750 })).toBe('drwxr-x---')
  })
  it('expands globs', () => {
    const fs = createFs({ '/w/a.txt': '', '/w/b.txt': '', '/w/c.md': '', '/w/.h.txt': '' })
    expect(expandGlob(fs, '/w', '*.txt')).toEqual(['a.txt', 'b.txt'])
    expect(expandGlob(fs, '/', '/w/?.md')).toEqual(['/w/c.md'])
    expect(globToRegExp('[ab]*.txt').test('apple.txt')).toBe(true)
  })
})

describe('shell commands', () => {
  it('shows a prompt with ~ for home', () => {
    expect(prompt(fresh())).toBe('learner@recurse:~$ ')
  })
  it('navigates with cd and pwd', () => {
    expect(run(['cd projects/website', 'pwd']).txt).toBe(`${HOME}/projects/website`)
    expect(run(['cd /etc', 'cd', 'pwd']).txt).toBe(HOME)
    expect(run(['cd /etc', 'cd -']).txt).toBe(HOME)
    expect(run(['cd projects', 'cd ..', 'pwd']).txt).toBe(HOME)
    expect(run('cd nowhere').errs).toEqual(['bash: cd: nowhere: No such file or directory'])
    expect(run('cd notes.txt').errs).toEqual(['bash: cd: notes.txt: Not a directory'])
  })
  it('lists files, hidden files and long format', () => {
    expect(run('ls').txt).toBe('data  drafts  notes.txt  projects  scripts')
    expect(run('ls -a').txt.startsWith('.  ..  .bashrc  data')).toBe(true)
    const long = run('ls -l scripts').txt.split('\n')
    expect(long[0]).toMatch(/^total \d+$/)
    expect(long.find((l) => l.endsWith('deploy.sh'))).toMatch(/^-rw-r--r-- 1 learner learner +\d+ Oct 14 09:00 deploy\.sh$/)
    expect(long.find((l) => l.endsWith('backup.sh'))).toMatch(/^-rwxr-xr-x/)
    expect(run('ls missing').errs).toEqual(["ls: cannot access 'missing': No such file or directory"])
    expect(run('ls -z').errs[0]).toBe("ls: invalid option -- 'z'")
  })
  it('colors directories and executables in ls output', () => {
    const { out } = run('ls scripts')
    const parts = out[0].parts
    expect(parts.find((p) => p.text === 'backup.sh').tone).toBe('exe')
    expect(run('ls').out[0].parts.find((p) => p.text === 'data').tone).toBe('dir')
  })
  it('creates, writes, appends and reads files', () => {
    const { s, txt } = run(['echo "buy milk" > todo.txt', 'echo "call mom" >> todo.txt', 'cat todo.txt'])
    expect(txt).toBe('buy milk\ncall mom')
    expect(s.fs[`${HOME}/todo.txt`].content).toBe('buy milk\ncall mom\n')
    expect(run(['echo one > f', 'echo two > f', 'cat f']).txt).toBe('two')
    expect(run('cat nope.txt').errs).toEqual(['cat: nope.txt: No such file or directory'])
    expect(run('cat projects').errs).toEqual(['cat: projects: Is a directory'])
    expect(run(['touch a.txt', 'ls']).txt).toContain('a.txt')
  })
  it('makes folders, with -p for parents', () => {
    expect(run('mkdir a/b').errs).toEqual(["mkdir: cannot create directory 'a/b': No such file or directory"])
    const { s } = run('mkdir -p a/b/c')
    expect(s.fs[`${HOME}/a/b/c`].type).toBe('dir')
    expect(run('mkdir data').errs).toEqual(["mkdir: cannot create directory 'data': File exists"])
    expect(run('mkdir /etc/new').errs).toEqual(["mkdir: cannot create directory '/etc/new': Permission denied"])
  })
  it('copies, moves and removes', () => {
    let r = run(['mkdir backup', 'cp notes.txt backup/', 'ls backup'])
    expect(r.txt).toBe('notes.txt')
    r = run('cp projects /tmp')
    expect(r.errs).toEqual(["cp: -r not specified; omitting directory 'projects'"])
    r = run(['cp -r projects /tmp/p', 'ls /tmp/p'])
    expect(r.txt).toBe('api  website')
    r = run(['mv notes.txt n.txt', 'ls'])
    expect(r.txt).toContain('n.txt')
    expect(r.txt).not.toContain('notes.txt')
    expect(run('rm drafts').errs).toEqual(["rm: cannot remove 'drafts': Is a directory"])
    r = run(['rm -r drafts', 'ls'])
    expect(r.txt).not.toContain('drafts')
    expect(run('rm ghost').errs).toEqual(["rm: cannot remove 'ghost': No such file or directory"])
    expect(run('rm -f ghost').errs).toEqual([])
    expect(run('rm -rf /').errs[0]).toMatch(/dangerous/)
    expect(run('mv nothing x').errs).toEqual(["mv: cannot stat 'nothing': No such file or directory"])
  })
  it('respects permissions', () => {
    expect(run('cat /etc/shadow').errs).toEqual(['cat: /etc/shadow: Permission denied'])
    expect(run('touch /etc/x').errs).toEqual(["touch: cannot touch '/etc/x': Permission denied"])
    expect(run('chmod 777 /etc/hosts').errs).toEqual(["chmod: changing permissions of '/etc/hosts': Operation not permitted"])
    expect(run('echo hi > /etc/hosts').errs).toEqual(['bash: /etc/hosts: Permission denied'])
    expect(run('chmod abc notes.txt').errs[0]).toBe("chmod: invalid mode: 'abc'")
  })
  it('runs scripts only with the execute bit', () => {
    let r = run('./scripts/deploy.sh')
    expect(r.errs).toEqual(['bash: ./scripts/deploy.sh: Permission denied'])
    r = run(['chmod u+x scripts/deploy.sh', './scripts/deploy.sh'])
    expect(r.txt).toBe('Building website...\nCopying 3 files to /var/www/html\nDeploy finished')
    expect(run('bash scripts/deploy.sh').txt).toContain('Deploy finished')
    expect(run(['chmod u+x scripts/deploy.sh', 'ls -l scripts']).txt).toMatch(/-rwxr--r-- .* deploy\.sh/)
  })
  it('heads, tails and counts', () => {
    expect(run('head -n 2 /var/log/app.log').txt.split('\n')).toHaveLength(2)
    expect(run('head -3 /var/log/app.log').txt.split('\n')).toHaveLength(3)
    expect(run('tail -n 1 /var/log/app.log').txt).toContain('health check ok')
    expect(run('wc -l /var/log/app.log').txt).toBe('21 /var/log/app.log')
    expect(run('cat /var/log/app.log | wc -l').txt).toBe('21')
    expect(run('echo one two three | wc -w').txt).toBe('3')
    expect(run('head nope').errs).toEqual(["head: cannot open 'nope' for reading: No such file or directory"])
  })
  it('greps with flags and highlights matches', () => {
    const r = run('grep ERROR /var/log/app.log')
    expect(r.txt.split('\n')).toEqual(ERROR_LINES)
    expect(r.out[0].parts.some((p) => p.tone === 'match' && p.text === 'ERROR')).toBe(true)
    expect(run('grep -c ERROR /var/log/app.log').txt).toBe(String(ERROR_LINES.length))
    expect(run('grep -i error /var/log/app.log | wc -l').txt).toBe(String(ERROR_LINES.length + 1))
    expect(run('grep -n WARN /var/log/app.log').txt.split('\n')[0]).toMatch(/^4:/)
    expect(run('grep -v INFO /var/log/app.log | grep -c WARN').txt).toBe('3')
    expect(run('grep -r Hello projects').txt).toBe('projects/website/index.html:  <body><h1>Hello!</h1></body>')
    expect(run('grep nothing-here notes.txt').s.lastCode).toBe(1)
    expect(run('grep x missing.txt').errs).toEqual(['grep: missing.txt: No such file or directory'])
  })
  it('finds files by name and type', () => {
    expect(run('find /var -name "*.log"').txt).toBe('/var/log/app.log\n/var/log/auth.log')
    expect(run('find . -name todo.txt').txt).toBe('./projects/website/todo.txt')
    expect(run('find projects -type d').txt).toBe('projects\nprojects/api\nprojects/website')
    expect(run('find . -bogus').errs[0]).toMatch(/unknown predicate/)
  })
  it('sorts and dedupes in a pipeline', () => {
    expect(run('sort data/visitors.txt | uniq').txt.split('\n')).toEqual(UNIQUE_VISITORS)
    expect(run('uniq data/visitors.txt').txt.split('\n').length).toBeGreaterThan(UNIQUE_VISITORS.length)
    const top = run('sort data/visitors.txt | uniq -c | sort -rn').txt.split('\n')
    expect(top[0]).toBe('      3 ana')
    expect(run('sort -u data/visitors.txt').txt.split('\n')).toEqual(UNIQUE_VISITORS)
  })
  it('expands globs in arguments', () => {
    expect(run('ls projects/website/*.html').txt).toBe('projects/website/index.html')
    expect(run(['cd projects/website', 'cat *.txt']).txt).toContain('contact page')
  })
  it('supports && and ; and $?', () => {
    expect(run('cd nowhere && echo moved').txt).not.toContain('moved')
    expect(run('cd nowhere; echo still').out.at(-1).text).toBe('still')
    expect(run(['false-command', 'echo $?']).txt).toBe('127')
  })
  it('handles clear, history, man and unknown commands', () => {
    expect(run('clear').clear).toBe(true)
    expect(run(['pwd', 'ls', 'history']).txt).toBe('    1  pwd\n    2  ls\n    3  history')
    expect(run('man ls').txt).toContain('list directory contents')
    expect(run('man nope').errs).toEqual(['No manual entry for nope'])
    const r = run('sl')
    expect(r.errs).toEqual(['sl: command not found'])
    expect(r.txt).toContain("Did you mean 'ls'?")
  })
  it('never mutates the previous state', () => {
    const s = fresh()
    runShell(s, 'rm -r drafts')
    expect(s.fs[`${HOME}/drafts`]).toBeTruthy()
  })
})

describe('tab completion', () => {
  it('completes commands and paths', () => {
    const s = fresh()
    expect(complete(s, 'hist').line).toBe('history ')
    expect(complete(s, 'cd proj').line).toBe('cd projects/')
    expect(complete(s, 'cat projects/website/to').line).toBe('cat projects/website/todo.txt ')
    expect(complete(s, 'ls d').options).toEqual(['data/', 'drafts/'])
    expect(complete(s, 'cat ~/no').line).toBe('cat ~/notes.txt ')
  })
})

describe('scenarios', () => {
  // The widget grades after every command, so do the same here.
  const grade = (id, lines) => {
    let s = fresh()
    const done = new Set()
    for (const l of lines) {
      s = runShell(s, l).state
      gradeTasks(SCENARIOS[id].tasks, s, done)
    }
    return done
  }
  it('navigation passes with the expected commands', () => {
    const done = grade('navigation', ['pwd', 'ls -a', 'cd projects/website', 'cat todo.txt', 'cd', 'find /var -name "*.log"'])
    expect(done.size).toBe(SCENARIOS.navigation.tasks.length)
  })
  it('files passes with the expected commands', () => {
    const done = grade('files', ['mkdir backup', 'echo "buy milk" > todo.txt', 'echo "call mom" >> todo.txt', 'cp todo.txt backup/', 'mv todo.txt done.txt', 'rm -r drafts'])
    expect(done.size).toBe(SCENARIOS.files.tasks.length)
  })
  it('permissions passes with the expected commands', () => {
    const done = grade('permissions', ['ls -l scripts', './scripts/deploy.sh', 'chmod u+x scripts/deploy.sh', './scripts/deploy.sh', 'chmod 600 scripts/secret.txt'])
    expect(done.size).toBe(SCENARIOS.permissions.tasks.length)
  })
  it('pipes passes with the expected commands', () => {
    const lines = ['head -n 5 /var/log/app.log', 'grep ERROR /var/log/app.log', 'grep ERROR /var/log/app.log | wc -l', 'sort data/visitors.txt | uniq', 'sort data/visitors.txt | uniq -c | sort -rn', 'grep ERROR /var/log/app.log > ~/errors.txt']
    expect(grade('pipes', lines).size).toBe(SCENARIOS.pipes.tasks.length)
  })
  it('does not pass uniq without sort', () => {
    const done = grade('pipes', ['head -n 5 /var/log/app.log', 'grep ERROR /var/log/app.log', 'grep -c ERROR /var/log/app.log', 'uniq data/visitors.txt'])
    expect(done.has('count')).toBe(true)
    expect(done.has('unique')).toBe(false)
  })
})
