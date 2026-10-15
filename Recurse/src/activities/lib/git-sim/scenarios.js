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

const shortHash = (h) => (h ? h.slice(0, 7) : '')
const list = (items) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/**
 * A short caption explaining what the last command did, for the "aha" moments.
 * result: the { failed, out } from runGit. Returns text or null.
 */
export function explainEvent(event, repo, result) {
  const conflictNote = 'Both branches changed the same lines. Git marked the spot in the file with <<<<<<<, ======= and >>>>>>>. Fix the file, then git add it.'
  if (event?.cmd === 'merge' && event.mode === 'conflict') return conflictNote
  if (result?.failed) {
    const text = result.out.map((l) => (l.parts ? l.parts.map((p) => p.text).join('') : l.text)).join('\n')
    if (/not a git repository/.test(text)) return 'There is no repository here yet. Run git init first.'
    if (/would be overwritten/.test(text)) return 'Git refuses to throw away uncommitted edits. Commit them first, or undo them with git restore <file>.'
    if (/not fully merged/.test(text)) return 'Git protects commits that are not merged anywhere. Merge the branch first, or use -D if you really want it gone.'
    if (/unmerged files|resolve your current index/.test(text)) return 'A merge is still in progress. Fix the conflicted file, git add it, then git commit.'
    if (/empty commit message/.test(text)) return 'Every commit needs a message. Add one with -m "..." in quotes.'
    if (/nothing to commit|no changes added|nothing added/.test(text)) return 'Nothing is staged, so there is nothing to commit. Stage changes with git add first.'
    if (/pathspec .* did not match/.test(text)) return 'Git cannot find that file or branch. ls lists files, git branch lists branches.'
    if (/is not a git command/.test(text)) return 'Typo? Git suggests the closest real command.'
    if (/invalid reference|not something we can merge|invalid upstream/.test(text)) return 'There is no branch or commit by that name. git branch lists the branches.'
    if (/could not apply/.test(text)) return 'Both branches changed the same lines, so replaying the commit conflicts. A merge handles this more gently.'
    return null
  }
  if (!event) return null
  const head = repo.head.branch ?? 'HEAD'
  switch (event.cmd) {
    case 'init':
      return 'Git created a hidden .git folder. That folder is the repository: every commit you make is stored inside it.'
    case 'status':
      return event.conflicts.length ? 'Unmerged paths are files git could not combine on its own. They need you.' : 'Status compares three places: your files, the staging area and the last commit.'
    case 'add':
      return event.paths.length ? `Staged ${list(event.paths)}. The staging area holds exactly what your next commit will contain.` : null
    case 'commit':
      if (event.amend) return 'Amend made a brand new commit (new hash) to replace the last one. The faded original is no longer on any branch.'
      if (event.merge) return 'This merge commit has two parents, which joins the two lines of history back together.'
      return `New commit ${shortHash(event.hash)}: a snapshot of the staging area. ${event.branch ? `${event.branch} now points to it.` : 'No branch points to it: HEAD is detached.'}`
    case 'log':
      return event.graph ? 'Each * is a commit and the lines connect commits to their parents. Newest is at the top.' : 'Newest first. Each commit stores a pointer to its parent, which is what makes this a history.'
    case 'branch':
      if (event.action === 'create') return `Branch ${event.name} is just a name pointing at a commit. Nothing was copied. You are still on ${head}.`
      if (event.action === 'delete') return 'Deleting a branch removes the name. The commits stay as long as another branch can reach them.'
      return event.action === 'list' ? 'The * marks the branch HEAD is on.' : null
    case 'switch':
      if (event.detached) return 'HEAD now points at a commit instead of a branch: "detached HEAD". Commits made here belong to no branch unless you create one.'
      return event.created ? `Created ${event.branch} and moved HEAD onto it in one step.` : `HEAD now points at ${event.branch}, and your files changed to match its latest commit.`
    case 'merge':
      if (event.mode === 'fast-forward') return `Fast-forward: ${event.into ?? 'HEAD'} had no commits of its own, so git just slid the label forward. No merge commit needed.`
      if (event.mode === 'merge') return 'Both branches had new commits, so git made a merge commit with two parents.'
      if (event.mode === 'abort') return 'Merge aborted. Everything is back the way it was before git merge.'
      return 'Nothing to do: that branch is already part of this history.'
    case 'rebase':
      if (event.mode === 'replay') return `Rebase copied your ${event.replayed === 1 ? 'commit' : `${event.replayed} commits`} onto the new base: same changes, new parents, so new hashes. The faded originals are no longer on any branch.`
      if (event.mode === 'fast-forward') return 'Your branch had no commits of its own, so rebase just moved it forward.'
      return null
    case 'reset':
      if (event.mode === 'paths') return `Unstaged ${list(event.paths)}. Your edits are still in the file.`
      if (event.mode === 'soft') return `${head} moved back to ${shortHash(event.to)}. --soft kept the undone changes staged, ready to commit again.`
      if (event.mode === 'mixed') return `${head} moved back to ${shortHash(event.to)}. The undone changes are still in your files, just not staged.`
      return `${head} moved back to ${shortHash(event.to)} and --hard reset your files too. Uncommitted work is gone; the faded commit is no longer on a branch.`
    case 'restore':
      return event.staged ? 'Unstaged: the staging area is back to the last commit. Your edits are still in the file.' : 'Discarded your edits: the file matches the staging area again.'
    case 'diff':
      return event.staged ? '--staged compares the staging area with the last commit: what the next commit will change.' : 'git diff compares your files with the staging area. + lines are new, - lines are gone.'
    case 'edit':
      return event.resolved ? 'Conflict markers removed. Now run git add to tell git the conflict is resolved.' : `You changed ${event.file} in the working tree. Git sees it as modified until you stage it.`
    case 'checkout-side':
      return `Took the ${event.side === '--ours' ? 'current branch' : 'incoming branch'} version of ${list(event.paths)}. Next: git add to mark it resolved.`
    default:
      return null
  }
}
