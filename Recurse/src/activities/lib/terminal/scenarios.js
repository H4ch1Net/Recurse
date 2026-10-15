// Starting file system and graded tasks for each terminal scenario.
// A task's check(state) looks at the file system or at the event log (one event per
// typed line: { line, names, code, output, cwd, facts }).
import { HOME } from './shell.js'

const APP_LOG = [
  '2026-10-14 09:00:01 INFO  server: starting on port 8080',
  '2026-10-14 09:00:02 INFO  db: connected to postgres://db:5432/app',
  '2026-10-14 09:01:15 INFO  http: GET /api/tasks 200 12ms',
  '2026-10-14 09:01:16 WARN  http: GET /api/tasks/99 404 3ms',
  '2026-10-14 09:02:40 ERROR db: query timeout after 5000ms',
  '2026-10-14 09:02:41 INFO  worker: retrying job 17 after error',
  '2026-10-14 09:03:05 INFO  http: POST /api/tasks 201 25ms',
  '2026-10-14 09:04:12 ERROR auth: invalid token for user 42',
  '2026-10-14 09:05:00 INFO  cron: nightly cleanup scheduled',
  '2026-10-14 09:06:33 WARN  cache: hit rate below 50%',
  '2026-10-14 09:07:01 ERROR db: connection refused',
  '2026-10-14 09:07:02 INFO  db: reconnecting in 5s',
  '2026-10-14 09:07:07 INFO  db: connected to postgres://db:5432/app',
  '2026-10-14 09:08:45 INFO  http: GET /api/me 200 8ms',
  '2026-10-14 09:09:10 ERROR http: GET /api/report 500 1203ms',
  '2026-10-14 09:10:00 INFO  worker: job 17 finished',
  '2026-10-14 09:11:30 WARN  disk: /var at 85% capacity',
  '2026-10-14 09:12:02 ERROR mail: SMTP server did not answer',
  '2026-10-14 09:13:15 INFO  http: DELETE /api/tasks/3 204 6ms',
  '2026-10-14 09:14:40 ERROR auth: invalid token for user 42',
  '2026-10-14 09:15:00 INFO  server: health check ok'
]
export const ERROR_LINES = APP_LOG.filter((l) => l.includes('ERROR'))

const VISITORS = ['ana', 'bo', 'ana', 'chen', 'dev', 'bo', 'ana', 'eli', 'chen']
export const UNIQUE_VISITORS = [...new Set(VISITORS)].sort()

const text = (lines) => `${lines.join('\n')}\n`

export const BASE_FILES = {
  [`${HOME}/.bashrc`]: text(['# ~/.bashrc: runs for every new shell', "alias ll='ls -l'", 'export EDITOR=nano']),
  [`${HOME}/.profile`]: text(['# ~/.profile', 'PATH="$HOME/bin:$PATH"']),
  [`${HOME}/notes.txt`]: text(['Things to remember:', '- ls -l shows permissions', '- man <command> explains a command', '- Tab completes file names']),
  [`${HOME}/projects/website/index.html`]: text(['<!doctype html>', '<html>', '  <head><title>My site</title></head>', '  <body><h1>Hello!</h1></body>', '</html>']),
  [`${HOME}/projects/website/style.css`]: text(['body { font-family: sans-serif; }', 'h1 { color: rebeccapurple; }']),
  [`${HOME}/projects/website/todo.txt`]: text(['- fix the header on phones', '- add a contact page', '- compress the images']),
  [`${HOME}/projects/api/server.js`]: text(["const http = require('http')", "http.createServer((req, res) => res.end('ok')).listen(8080)"]),
  [`${HOME}/projects/api/README.md`]: text(['# API', 'Run with: node server.js']),
  [`${HOME}/scripts/deploy.sh`]: { content: text(['#!/bin/bash', '# Deploy the website', 'echo "Building website..."', 'echo "Copying 3 files to /var/www/html"', 'echo "Deploy finished"']), mode: 0o644 },
  [`${HOME}/scripts/backup.sh`]: { content: text(['#!/bin/bash', 'echo "Backing up ~/projects"', 'echo "Backup saved"']), mode: 0o755 },
  [`${HOME}/scripts/secret.txt`]: { content: text(['API_KEY=demo-1234-not-a-real-key']), mode: 0o644 },
  [`${HOME}/data/visitors.txt`]: text(VISITORS),
  [`${HOME}/data/scores.csv`]: text(['name,score', 'ana,91', 'bo,78', 'chen,85', 'dev,64', 'eli,99']),
  [`${HOME}/drafts/old-idea.txt`]: text(['An app that waters plants. Maybe later.']),
  [`${HOME}/drafts/draft-2.txt`]: text(['Second draft, never finished.']),
  '/etc/hostname': text(['recurse']),
  '/etc/hosts': text(['127.0.0.1   localhost', '127.0.1.1   recurse', '192.168.10.20   fileserver']),
  '/etc/passwd': text(['root:x:0:0:root:/root:/bin/bash', 'learner:x:1000:1000:Learner:/home/learner:/bin/bash', 'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin']),
  '/etc/shadow': { content: text(['root:*:19000:0:99999:7:::']), mode: 0o640 },
  '/etc/os-release': text(['NAME="Ubuntu"', 'VERSION="24.04 LTS (Noble Numbat)"', 'ID=ubuntu']),
  '/var/log/app.log': text(APP_LOG),
  '/var/log/auth.log': { content: text(['Oct 14 09:00:00 recurse sshd[812]: Accepted publickey for learner']), mode: 0o640 },
  '/var/www/html/index.html': text(['<h1>It works!</h1>']),
  '/tmp': { dir: true, mode: 0o777 }
}

// ---- Event helpers ----

const events = (s) => s.events || []
const facts = (s, kind) => events(s).flatMap((e) => e.facts.filter((f) => f.kind === kind).map((f) => ({ ...f, event: e })))
const ran = (s, name) => events(s).some((e) => e.names.includes(name) && e.code === 0)
const lastEvent = (s) => events(s)[events(s).length - 1]
const outLines = (e) => (e?.output || '').split('\n').map((l) => l.trim()).filter(Boolean)
const fileText = (s, path) => (s.fs[path]?.type === 'file' ? s.fs[path].content : null)
const lineCount = (t) => (t ? t.split('\n').filter((l) => l.trim()).length : 0)

export const SCENARIOS = {
  navigation: {
    title: 'Finding your way around',
    intro: 'You are logged in as learner. Every command runs in your current folder, shown in the prompt (~ means your home folder).',
    tasks: [
      { id: 'pwd', text: 'Print the folder you are in', hint: 'pwd prints the working directory', check: (s) => ran(s, 'pwd') },
      { id: 'ls-a', text: 'List everything in your home folder, hidden files included', hint: 'ls -a shows names that start with a dot', check: (s) => facts(s, 'ls').some((f) => f.all && f.path === HOME) },
      { id: 'cd-website', text: 'Move into projects/website', hint: 'cd projects/website (try Tab to complete names)', check: (s) => s.cwd === `${HOME}/projects/website` },
      { id: 'cat-todo', text: 'Read todo.txt there', hint: 'cat todo.txt', check: (s) => facts(s, 'read').some((f) => f.path === `${HOME}/projects/website/todo.txt`) },
      { id: 'cd-home', text: 'Jump straight back home', hint: 'cd on its own, or cd ~', check: (s) => s.cwd === HOME },
      { id: 'find-log', text: 'Find every .log file under /var', hint: 'find /var -name "*.log" (quotes stop the shell expanding the *)', check: (s) => facts(s, 'find').some((f) => f.results.some((r) => r.endsWith('app.log')) && f.results.every((r) => r.endsWith('.log'))) }
    ]
  },
  files: {
    title: 'Creating, copying and deleting',
    intro: 'Make a backup folder, write a file from the shell, copy it, rename it and clean up old drafts.',
    tasks: [
      { id: 'mkdir', text: 'Make a folder called backup in your home folder', hint: 'mkdir backup', check: (s) => s.fs[`${HOME}/backup`]?.type === 'dir' },
      { id: 'write', text: 'Create todo.txt containing one line of text', hint: 'echo "buy milk" > todo.txt', check: (s) => lineCount(fileText(s, `${HOME}/todo.txt`)) >= 1 },
      { id: 'append', text: 'Add a second line to todo.txt without erasing the first', hint: '>> appends, > overwrites: echo "call mom" >> todo.txt', check: (s) => lineCount(fileText(s, `${HOME}/todo.txt`)) >= 2 },
      { id: 'copy', text: 'Copy todo.txt into the backup folder', hint: 'cp todo.txt backup/', check: (s) => lineCount(fileText(s, `${HOME}/backup/todo.txt`)) >= 2 },
      { id: 'rename', text: 'Rename todo.txt to done.txt', hint: 'mv renames: mv todo.txt done.txt', check: (s) => fileText(s, `${HOME}/done.txt`) !== null && !s.fs[`${HOME}/todo.txt`] },
      { id: 'rm-drafts', text: 'Delete the drafts folder and everything in it', hint: 'rm -r drafts (rm alone refuses folders)', check: (s) => !s.fs[`${HOME}/drafts`] }
    ]
  },
  permissions: {
    title: 'Permissions',
    intro: 'Each file has read (r), write (w) and execute (x) bits for its owner, its group and everyone else. ls -l shows them.',
    tasks: [
      { id: 'ls-l', text: 'Look at the permissions in the scripts folder', hint: 'ls -l scripts', check: (s) => facts(s, 'ls').some((f) => f.long && f.path.startsWith(`${HOME}/scripts`)) },
      { id: 'denied', text: 'Try to run scripts/deploy.sh directly', hint: './scripts/deploy.sh (or cd scripts, then ./deploy.sh). Expect "Permission denied".', check: (s) => facts(s, 'exec').some((f) => f.path === `${HOME}/scripts/deploy.sh` && !f.ok) },
      { id: 'chmod-x', text: 'Make deploy.sh executable for you', hint: 'chmod u+x scripts/deploy.sh (or chmod 755)', check: (s) => Boolean((s.fs[`${HOME}/scripts/deploy.sh`]?.mode ?? 0) & 0o100) },
      { id: 'run', text: 'Run deploy.sh again', hint: 'Same command as before. Up arrow brings it back.', check: (s) => facts(s, 'exec').some((f) => f.path === `${HOME}/scripts/deploy.sh` && f.ok && f.via === 'path') },
      { id: 'secret', text: 'Lock secret.txt so only you can read and write it', hint: 'chmod 600 scripts/secret.txt: 6 (rw-) for you, 0 for group and others', check: (s) => s.fs[`${HOME}/scripts/secret.txt`]?.mode === 0o600 }
    ]
  },
  pipes: {
    title: 'Pipes and filters',
    intro: 'A pipe (|) sends one command\'s output into the next. Small tools chained together answer real questions about logs and data.',
    tasks: [
      { id: 'head', text: 'Show the first 5 lines of /var/log/app.log', hint: 'head -n 5 /var/log/app.log', check: (s) => facts(s, 'head').some((f) => f.n === 5 && (f.files.includes('/var/log/app.log') || f.event.line.includes('app.log'))) },
      { id: 'grep', text: 'Show only the ERROR lines', hint: 'grep ERROR /var/log/app.log', check: (s) => events(s).some((e) => e.names.includes('grep') && outLines(e).length === ERROR_LINES.length && outLines(e).every((l) => l.includes('ERROR'))) },
      { id: 'count', text: 'Count the ERROR lines by piping grep into wc -l', hint: 'grep ERROR /var/log/app.log | wc -l', check: (s) => events(s).some((e) => e.names.includes('grep') && outLines(e).join('') === String(ERROR_LINES.length)) },
      { id: 'unique', text: 'List each visitor in data/visitors.txt once, in order', hint: 'uniq only merges neighbors, so sort first: sort data/visitors.txt | uniq', check: (s) => { const e = lastEvent(s); return Boolean(e) && outLines(e).join(',') === UNIQUE_VISITORS.join(',') } },
      { id: 'top', text: 'Count visits per name, busiest first', hint: 'sort data/visitors.txt | uniq -c | sort -rn', check: (s) => { const e = lastEvent(s); const first = outLines(e)[0] || ''; return /^3\s+ana$/.test(first) && outLines(e).length === UNIQUE_VISITORS.length } },
      { id: 'save', text: 'Save the ERROR lines into errors.txt in your home folder', hint: 'grep ERROR /var/log/app.log > ~/errors.txt', check: (s) => fileText(s, `${HOME}/errors.txt`)?.trim() === ERROR_LINES.join('\n') }
    ]
  }
}

export const SCENARIO_IDS = Object.keys(SCENARIOS)

export function scenarioFor(id) {
  return SCENARIOS[id] ? id : 'navigation'
}

/** A one-line teaching note for common shell errors, or null. */
export function explainOutput(lines) {
  const text = lines.filter((l) => l.tone === 'err').map((l) => l.text).join('\n')
  if (!text) return null
  if (/command not found/.test(text)) return 'The shell does not know that command. Check the spelling, or type help for the list.'
  if (/Permission denied/.test(text)) return 'Permission denied: the file\'s mode bits do not allow that. ls -l shows them, chmod changes them on files you own.'
  if (/Operation not permitted/.test(text)) return 'Only the owner (or root) can change permissions. ls -l shows who owns a file.'
  if (/No such file or directory|cannot stat|cannot access/.test(text)) return 'That path does not exist from here. pwd shows where you are, ls shows what is around, Tab completes names.'
  if (/Is a directory/.test(text)) return 'That is a folder, not a file. Use ls to look inside, or -r for commands that work on whole folders.'
  if (/Not a directory/.test(text)) return 'Part of that path is a file, not a folder.'
  if (/File exists/.test(text)) return 'Something with that name is already there. Pick another name, or use mkdir -p to skip the error.'
  if (/missing (file )?operand|Usage:/.test(text)) return 'This command needs more arguments. man <command> shows how to use it.'
  if (/invalid option|unknown predicate/.test(text)) return 'One of the options is not valid for this command. man <command> lists the ones that are.'
  if (/syntax error|unexpected EOF/.test(text)) return 'The shell could not parse that line. Check quotes and pipes.'
  return null
}
