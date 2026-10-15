// Git sandbox scenarios: a starting repository plus a checklist graded from repo state
// and the event log (one event per command: { cmd, ok, line, at, ...details }).
import { createRepo, headHash, isAncestor, hasConflictMarkers, ancestors } from './repo.js'
import { runGit } from './commands.js'

/** Run setup commands, then forget them so grading only sees the learner's work. */
function build(files, lines, { now, edits = {} } = {}) {
  let repo = createRepo({ files, now })
  for (const line of lines) {
    if (typeof line === 'function') {
      repo = structuredClone(repo)
      line(repo)
      continue
    }
    const r = runGit(repo, line)
    if (r.failed) throw new Error(`Scenario setup failed at "${line}": ${r.out.map((l) => l.text).join(' ')}`)
    repo = r.repo
  }
  repo.events = []
  Object.assign(repo, edits)
  return repo
}

const write = (path, text) => (repo) => {
  repo.work[path] = text
}

const ev = (repo, pred) => repo.events.some((e) => e.ok && pred(e))
const lastAt = (repo, pred) => {
  const list = repo.events.filter((e) => e.ok && pred(e))
  return list.length ? list[list.length - 1].at : -1
}
const headCommit = (repo) => repo.commits[headHash(repo)]

export const SCENARIOS = {
  basics: {
    title: 'Your first commits',
    intro: 'This folder has a README.md but no repository yet. Turn it into one and save two snapshots.',
    setup: (now) => build({ 'README.md': '# Pocket Planner\nA tiny to-do app.\n' }, [], { now }),
    tasks: [
      { id: 'init', text: 'Create a repository here', hint: 'git init', check: (r) => r.initialized },
      { id: 'status', text: 'Ask git what it sees', hint: 'git status lists README.md as untracked', check: (r) => ev(r, (e) => e.cmd === 'status' && e.untracked.includes('README.md')) },
      { id: 'add', text: 'Stage README.md', hint: 'git add README.md', check: (r) => 'README.md' in r.index },
      { id: 'commit1', text: 'Commit it with a message', hint: 'git commit -m "Add README"', check: (r) => r.order.length >= 1 },
      { id: 'commit2', text: 'Edit README.md, then stage and commit again', hint: 'edit README.md (or the Edit button), git add README.md, git commit -m "Describe the app"', check: (r) => ancestors(r, headHash(r)).size >= 2 },
      { id: 'log', text: 'See both commits in the history', hint: 'git log --oneline', check: (r) => ev(r, (e) => e.cmd === 'log' && e.count >= 2) }
    ]
  },
  branching: {
    title: 'Branch, commit, merge',
    intro: 'main has two commits. Build a feature on its own branch, then bring it back into main.',
    setup: (now) =>
      build({ 'README.md': '# Pocket Planner\n', 'app.js': "console.log('Pocket Planner')\n" }, ['git init', 'git add README.md', 'git commit -m "Add README"', 'git add app.js', 'git commit -m "Add app.js"'], { now }),
    tasks: [
      { id: 'create', text: 'Create a branch called feature', hint: 'git branch feature (it starts where you are now)', check: (r) => Object.keys(r.branches).some((b) => b !== 'main') },
      { id: 'switch', text: 'Switch to it', hint: 'git switch feature (or git checkout feature)', check: (r) => Boolean(r.head.branch) && r.head.branch !== 'main' },
      { id: 'commit', text: 'Commit a change on the feature branch', hint: 'edit app.js, then git commit -am "Add a greeting"', check: (r) => ev(r, (e) => e.cmd === 'commit' && e.branch && e.branch !== 'main') },
      { id: 'back', text: 'Switch back to main', hint: 'git switch main. Notice app.js goes back to the old version.', check: (r) => r.head.branch === 'main' },
      { id: 'merge', text: 'Merge the feature branch into main', hint: 'git merge feature. main had no new commits, so git just slides it forward: a fast-forward.', check: (r) => ev(r, (e) => e.cmd === 'merge' && ['fast-forward', 'merge'].includes(e.mode) && e.into === 'main') },
      { id: 'delete', text: 'Delete the merged branch', hint: 'git branch -d feature (safe: git refuses if it is not merged)', check: (r) => ev(r, (e) => e.cmd === 'branch' && e.action === 'delete') }
    ]
  },
  'merge-conflict': {
    title: 'Resolve a merge conflict',
    intro: 'main and the spanish branch both changed the same line of greeting.txt. Git cannot pick a winner, so you will.',
    setup: (now) =>
      build({ 'greeting.txt': 'Hello, world!\n', 'README.md': '# Greeter\nPrints a friendly greeting.\n' }, [
        'git init',
        'git add .',
        'git commit -m "Initial commit"',
        'git switch -c spanish',
        write('greeting.txt', 'Hola, mundo!\n'),
        'git commit -am "Greet in Spanish"',
        'git switch main',
        write('greeting.txt', 'Hello, everyone!\n'),
        'git commit -am "Greet everyone"'
      ], { now }),
    tasks: [
      { id: 'merge', text: 'Merge spanish into main', hint: 'git merge spanish', check: (r) => r.events.some((e) => e.cmd === 'merge' && e.mode === 'conflict') },
      { id: 'status', text: 'Find the conflicted file', hint: 'git status lists it under "Unmerged paths". cat greeting.txt shows the markers.', check: (r) => ev(r, (e) => (e.cmd === 'status' && e.conflicts.length > 0) || (e.cmd === 'cat' && e.files.includes('greeting.txt'))) },
      { id: 'fix', text: 'Fix greeting.txt so no conflict markers are left', hint: 'Use a Resolve button: keep main, keep spanish, or keep both. Same as git checkout --ours / --theirs, or editing by hand.', check: (r) => !hasConflictMarkers(r.work['greeting.txt']) && (Boolean(r.merge) || headCommit(r)?.parents.length === 2) },
      { id: 'add', text: 'Mark it resolved', hint: 'git add greeting.txt', check: (r) => (r.merge && r.merge.conflicts.length === 0) || headCommit(r)?.parents.length === 2 },
      { id: 'commit', text: 'Finish the merge with a commit', hint: 'git commit (git already wrote the message: Merge branch \'spanish\')', check: (r) => headCommit(r)?.parents.length === 2 && !hasConflictMarkers(headCommit(r).tree['greeting.txt']) }
    ]
  },
  rebase: {
    title: 'Rebase onto main',
    intro: 'You built a login page on feature while someone added a footer on main. Replay your work on top of main for a straight-line history.',
    setup: (now) =>
      build({ 'index.html': '<h1>Pocket Planner</h1>\n' }, [
        'git init',
        'git add .',
        'git commit -m "Initial commit"',
        'git switch -c feature',
        write('login.html', '<form>Log in</form>\n'),
        'git add login.html',
        'git commit -m "Add login page"',
        write('login.css', 'form { margin: 2rem; }\n'),
        'git add login.css',
        'git commit -m "Style login page"',
        'git switch main',
        write('index.html', '<h1>Pocket Planner</h1>\n<footer>Made with care</footer>\n'),
        'git commit -am "Add footer"',
        'git switch feature'
      ], { now }),
    tasks: [
      { id: 'look', text: 'Look at both branches in the history', hint: 'git log --oneline --graph --all', check: (r) => ev(r, (e) => e.cmd === 'log' && e.graph && e.all) },
      { id: 'rebase', text: 'Rebase feature onto main', hint: 'You are on feature: git rebase main', check: (r) => ev(r, (e) => e.cmd === 'rebase' && e.mode === 'replay') && 'feature' in r.branches && isAncestor(r, r.branches.main, r.branches.feature) },
      { id: 'hashes', text: 'Check the log: your two commits have new hashes', hint: 'git log --oneline. Same messages, new ids, because their parent changed.', check: (r) => lastAt(r, (e) => e.cmd === 'log') > lastAt(r, (e) => e.cmd === 'rebase' && e.mode === 'replay') && lastAt(r, (e) => e.cmd === 'rebase' && e.mode === 'replay') >= 0 },
      { id: 'ff', text: 'Bring main up to feature with a fast-forward merge', hint: 'git switch main, then git merge feature', check: (r) => ev(r, (e) => e.cmd === 'merge' && e.mode === 'fast-forward' && e.into === 'main') }
    ]
  }
}

export const SCENARIO_IDS = Object.keys(SCENARIOS)
export const scenarioFor = (id) => (SCENARIOS[id] ? id : 'basics')
