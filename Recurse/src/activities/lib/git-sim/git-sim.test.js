import { describe, expect, it } from 'vitest'
import { createRepo, merge3, diffLines, resolveRev, status, headHash, isAncestor, mergeBase, hasConflictMarkers, keepBoth, fileStates } from './repo.js'
import { runGit, asciiGraph, completeGit } from './commands.js'
import { SCENARIOS } from './scenarios.js'
import { layoutGraph } from './layout.js'
import { commonPrefix, gradeTasks } from '../terminal/parse.js'

const NOW = Date.UTC(2026, 9, 14, 9, 0)
const text = (out) => out.map((l) => (l.parts ? l.parts.map((p) => p.text).join('') : l.text)).join('\n')

function git(lines, repo = createRepo({ files: { 'README.md': '# Demo\n' }, now: NOW })) {
  let r = repo
  let last = null
  for (const line of [].concat(lines)) {
    if (typeof line === 'function') {
      r = structuredClone(r)
      line(r)
      continue
    }
    last = runGit(r, line)
    r = last.repo
  }
  return { repo: r, out: last?.out ?? [], txt: text(last?.out ?? []), failed: last?.failed ?? false }
}
const setFile = (path, content) => (r) => {
  r.work[path] = content
}
const started = ['git init', 'git add README.md', 'git commit -m "First"']

describe('three-way merge and diffs', () => {
  it('diffs lines', () => {
    expect(diffLines('a\nb\n', 'a\nc\n').map((o) => o.type + o.line)).toEqual(['=a', '-b', '+c'])
  })
  it('merges changes to different lines cleanly', () => {
    const r = merge3('1\n2\n3\n4\n5\n', 'one\n2\n3\n4\n5\n', '1\n2\n3\n4\nfive\n')
    expect(r).toEqual({ text: 'one\n2\n3\n4\nfive\n', conflict: false })
  })
  it('marks overlapping changes as a conflict', () => {
    const r = merge3('Hello, world!\n', 'Hello, everyone!\n', 'Hola, mundo!\n', { ours: 'HEAD', theirs: 'spanish' })
    expect(r.conflict).toBe(true)
    expect(r.text).toBe('<<<<<<< HEAD\nHello, everyone!\n=======\nHola, mundo!\n>>>>>>> spanish\n')
    expect(hasConflictMarkers(r.text)).toBe(true)
    expect(keepBoth(r.text)).toBe('Hello, everyone!\nHola, mundo!\n')
  })
  it('treats identical changes as agreement', () => {
    expect(merge3('a\n', 'a\nb\n', 'a\nb\n')).toEqual({ text: 'a\nb\n', conflict: false })
  })
  it('conflicts when both sides append different lines', () => {
    expect(merge3('a\n', 'a\nb\n', 'a\nc\n').conflict).toBe(true)
  })
})

describe('init, status, add, commit', () => {
  it('refuses git commands before init', () => {
    const r = git('git status')
    expect(r.failed).toBe(true)
    expect(r.txt).toBe('fatal: not a git repository (or any of the parent directories): .git')
  })
  it('initializes and reports untracked files', () => {
    const r = git(['git init', 'git status'])
    expect(r.repo.initialized).toBe(true)
    expect(r.txt).toContain('On branch main')
    expect(r.txt).toContain('No commits yet')
    expect(r.txt).toContain('Untracked files:')
    expect(r.txt).toContain('nothing added to commit but untracked files present (use "git add" to track)')
    expect(git(['git init', 'git init']).txt).toMatch(/^Reinitialized existing Git repository/)
  })
  it('stages and makes a root commit', () => {
    const r = git(started)
    expect(r.txt).toMatch(/^\[main \(root-commit\) [0-9a-f]{7}\] First\n 1 file changed, 1 insertion\(\+\)\n create mode 100644 README\.md$/)
    expect(r.repo.order).toHaveLength(1)
    expect(git([...started, 'git status']).txt).toContain('nothing to commit, working tree clean')
  })
  it('shows staged, modified and untracked files', () => {
    const r = git([...started, setFile('README.md', '# Demo\nMore\n'), 'touch notes.txt', 'git status'])
    expect(r.txt).toContain('Changes not staged for commit:')
    expect(r.txt).toContain('modified:   README.md')
    expect(r.txt).toContain('notes.txt')
    const staged = git([...started, setFile('README.md', '# Demo\nMore\n'), 'git add .', 'git status'])
    expect(staged.txt).toContain('Changes to be committed:')
    expect(staged.txt).toContain('(use "git restore --staged <file>..." to unstage)')
  })
  it('gives real errors for bad add and empty commits', () => {
    expect(git(['git init', 'git add nope.txt']).txt).toBe("fatal: pathspec 'nope.txt' did not match any files")
    const empty = git([...started, 'git commit -m "again"'])
    expect(empty.failed).toBe(true)
    expect(empty.txt).toContain('nothing to commit, working tree clean')
    const noMsg = git(['git init', 'git add .', 'git commit'])
    expect(noMsg.txt).toContain('Aborting commit due to empty commit message.')
    expect(git(['git init', 'git add .', 'git commit -m Add readme']).txt).toContain("error: pathspec 'readme' did not match")
  })
  it('commits tracked changes with -am and counts lines', () => {
    const r = git([...started, 'edit README.md', 'git commit -am "Second"'])
    expect(r.txt).toMatch(/^\[main [0-9a-f]{7}\] Second\n 1 file changed, 1 insertion\(\+\)$/)
  })
  it('amends the last commit with a new hash', () => {
    const r = git([...started, 'git commit --amend -m "First, better"'])
    expect(r.repo.order).toHaveLength(2)
    expect(r.repo.commits[headHash(r.repo)].message).toBe('First, better')
    expect(r.repo.commits[headHash(r.repo)].parents).toEqual([])
  })
  it('restores and unstages files', () => {
    let r = git([...started, 'edit README.md', 'git restore README.md'])
    expect(r.repo.work['README.md']).toBe('# Demo\n')
    r = git([...started, 'edit README.md', 'git add README.md', 'git restore --staged README.md'])
    expect(status(r.repo).unstaged).toEqual([{ path: 'README.md', kind: 'modified' }])
    expect(status(r.repo).staged).toEqual([])
  })
  it('shows a diff of unstaged and staged changes', () => {
    const r = git([...started, 'edit README.md', 'git diff'])
    expect(r.txt).toContain('diff --git a/README.md b/README.md')
    expect(r.txt).toContain('+Change 1 made on main')
    const staged = git([...started, 'edit README.md', 'git add .', 'git diff --staged'])
    expect(staged.txt).toContain('+Change 1 made on main')
    expect(git([...started, 'edit README.md', 'git add .', 'git diff']).txt).toContain('git diff --staged')
  })
  it('suggests similar commands', () => {
    const r = git(['git init', 'git comit -m x'])
    expect(r.txt).toContain("git: 'comit' is not a git command. See 'git --help'.")
    expect(r.txt).toContain('\tcommit')
    expect(git('gti status').txt).toContain("Did you mean 'git'?")
    expect(git(['git init', 'git push']).txt).toContain('not simulated')
  })
})

describe('log and revisions', () => {
  const three = [...started, 'edit README.md', 'git commit -am "Second"', 'edit README.md', 'git commit -am "Third"']
  it('prints oneline history with decorations', () => {
    const r = git([...three, 'git log --oneline'])
    const lines = r.txt.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) Third$/)
    expect(lines[2]).toMatch(/ First$/)
  })
  it('prints the full format', () => {
    const r = git([...started, 'git log'])
    expect(r.txt).toMatch(/^commit [0-9a-f]{40} \(HEAD -> main\)\nAuthor: Learner <learner@example\.com>\nDate: {3}\w{3} Oct 14 09:01:37 2026 \+0000\n\n {4}First$/)
  })
  it('resolves HEAD~n, branch names and short hashes', () => {
    const { repo } = git(three)
    const first = repo.order[0]
    expect(resolveRev(repo, 'HEAD~2')).toBe(first)
    expect(resolveRev(repo, 'main^^')).toBe(first)
    expect(resolveRev(repo, first.slice(0, 7))).toBe(first)
    expect(resolveRev(repo, 'HEAD~5')).toBeNull()
  })
  it('errors on an empty history', () => {
    expect(git(['git init', 'git log']).txt).toBe("fatal: your current branch 'main' does not have any commits yet")
  })
})

describe('branches, switching and merging', () => {
  const featureWork = [...started, 'git branch feature', 'git switch feature', setFile('app.js', 'run()\n'), 'git add app.js', 'git commit -m "Add app"']
  it('creates, lists and switches branches', () => {
    const r = git([...started, 'git branch feature', 'git branch'])
    expect(r.txt).toBe('  feature\n* main')
    expect(git([...started, 'git branch feature', 'git branch feature']).txt).toBe("fatal: a branch named 'feature' already exists")
    expect(git([...started, 'git switch nope']).txt).toBe('fatal: invalid reference: nope')
    expect(git([...started, 'git switch -c topic']).txt).toBe("Switched to a new branch 'topic'")
    expect(git([...started, 'git checkout -b topic']).repo.head).toEqual({ branch: 'topic' })
    expect(git([...started, 'git switch main']).txt).toBe("Already on 'main'")
  })
  it('swaps files when switching', () => {
    const r = git([...featureWork, 'git switch main'])
    expect(r.repo.work['app.js']).toBeUndefined()
    expect(git([...featureWork, 'git switch main', 'git switch feature']).repo.work['app.js']).toBe('run()\n')
  })
  it('refuses to switch when local changes would be lost', () => {
    const r = git([...featureWork, 'edit app.js', 'git switch main'])
    expect(r.failed).toBe(true)
    expect(r.txt).toContain('error: Your local changes to the following files would be overwritten by checkout:')
    expect(r.txt).toContain('\tapp.js')
  })
  it('carries harmless local changes across a switch', () => {
    const r = git([...featureWork, 'edit README.md', 'git switch main'])
    expect(r.txt).toBe("M\tREADME.md\nSwitched to branch 'main'")
    expect(r.repo.work['README.md']).toContain('Change 1')
  })
  it('fast-forwards a merge', () => {
    const r = git([...featureWork, 'git switch main', 'git merge feature'])
    expect(r.txt).toMatch(/^Updating [0-9a-f]{7}\.\.[0-9a-f]{7}\nFast-forward\n app\.js \| {2}1 \+\n 1 file changed, 1 insertion\(\+\)\n create mode 100644 app\.js$/)
    expect(r.repo.branches.main).toBe(r.repo.branches.feature)
    expect(git([...featureWork, 'git switch main', 'git merge feature', 'git merge feature']).txt).toBe('Already up to date.')
  })
  it('makes a merge commit when both sides moved', () => {
    const r = git([...featureWork, 'git switch main', 'edit README.md', 'git commit -am "Docs"', 'git merge feature'])
    expect(r.txt).toContain("Merge made by the 'ort' strategy.")
    const head = r.repo.commits[headHash(r.repo)]
    expect(head.parents).toHaveLength(2)
    expect(head.message).toBe("Merge branch 'feature'")
    expect(r.repo.work['app.js']).toBe('run()\n')
  })
  it('creates a merge commit with --no-ff', () => {
    const r = git([...featureWork, 'git switch main', 'git merge --no-ff feature'])
    expect(r.repo.commits[headHash(r.repo)].parents).toHaveLength(2)
  })
  it('protects unmerged branches from -d', () => {
    const r = git([...featureWork, 'git switch main', 'git branch -d feature'])
    expect(r.txt).toBe("error: the branch 'feature' is not fully merged.\nhint: If you are sure you want to delete it, run 'git branch -D feature'")
    expect(git([...featureWork, 'git switch main', 'git branch -D feature']).repo.branches.feature).toBeUndefined()
    expect(git([...featureWork, 'git branch -d feature']).txt).toContain("cannot delete branch 'feature' used by worktree")
    const ok = git([...featureWork, 'git switch main', 'git merge feature', 'git branch -d feature'])
    expect(ok.txt).toMatch(/^Deleted branch feature \(was [0-9a-f]{7}\)\.$/)
  })
  it('detaches HEAD when checking out a commit', () => {
    const r = git([...started, 'edit README.md', 'git commit -am "Two"', 'git checkout HEAD~1'])
    expect(r.repo.head.detached).toBe(r.repo.order[0])
    expect(r.txt).toContain("You are in 'detached HEAD' state.")
    expect(git([...started, 'git switch HEAD']).txt).toContain('fatal: a branch is expected')
  })
})

describe('merge conflicts', () => {
  const setup = () => SCENARIOS['merge-conflict'].setup(NOW)
  it('stops with conflict markers and an unmerged status', () => {
    const r = git(['git merge spanish'], setup())
    expect(r.txt).toBe('Auto-merging greeting.txt\nCONFLICT (content): Merge conflict in greeting.txt\nAutomatic merge failed; fix conflicts and then commit the result.')
    expect(r.repo.work['greeting.txt']).toBe('<<<<<<< HEAD\nHello, everyone!\n=======\nHola, mundo!\n>>>>>>> spanish\n')
    const st = git(['git merge spanish', 'git status'], setup())
    expect(st.txt).toContain('You have unmerged paths.')
    expect(st.txt).toContain('both modified:   greeting.txt')
    expect(fileStates(st.repo).find((f) => f.path === 'greeting.txt').conflict).toBe(true)
  })
  it('refuses to commit until resolved', () => {
    const r = git(['git merge spanish', 'git commit -m x'], setup())
    expect(r.txt).toContain('Committing is not possible because you have unmerged files.')
    expect(git(['git merge spanish', 'git switch spanish'], setup()).txt).toContain('error: you need to resolve your current index first')
  })
  it('resolves with checkout --theirs, add and commit', () => {
    const r = git(['git merge spanish', 'git checkout --theirs greeting.txt', 'git add greeting.txt', 'git status'], setup())
    expect(r.txt).toContain('All conflicts fixed but you are still merging.')
    const done = git(['git merge spanish', 'git checkout --theirs greeting.txt', 'git add greeting.txt', 'git commit'], setup())
    expect(done.txt).toMatch(/^\[main [0-9a-f]{7}\] Merge branch 'spanish'$/)
    const head = done.repo.commits[headHash(done.repo)]
    expect(head.parents).toHaveLength(2)
    expect(head.tree['greeting.txt']).toBe('Hola, mundo!\n')
  })
  it('keeps both versions with edit, and can abort', () => {
    const r = git(['git merge spanish', 'edit greeting.txt'], setup())
    expect(r.repo.work['greeting.txt']).toBe('Hello, everyone!\nHola, mundo!\n')
    const ab = git(['git merge spanish', 'git merge --abort'], setup())
    expect(ab.repo.merge).toBeNull()
    expect(ab.repo.work['greeting.txt']).toBe('Hello, everyone!\n')
  })
  it('grades the whole scenario', () => {
    const tasks = SCENARIOS['merge-conflict'].tasks
    let repo = setup()
    const done = new Set()
    for (const line of ['git merge spanish', 'git status', 'git checkout --ours greeting.txt', 'git add greeting.txt', 'git commit']) {
      repo = runGit(repo, line).repo
      gradeTasks(tasks, repo, done)
    }
    expect([...done]).toEqual(tasks.map((t) => t.id))
  })
})

describe('rebase and reset', () => {
  const setup = () => SCENARIOS.rebase.setup(NOW)
  it('replays commits with new hashes on top of main', () => {
    const before = setup()
    const oldTip = before.branches.feature
    const r = git(['git rebase main'], before)
    expect(r.txt).toBe('Successfully rebased and updated refs/heads/feature.')
    const tip = r.repo.branches.feature
    expect(tip).not.toBe(oldTip)
    expect(isAncestor(r.repo, r.repo.branches.main, tip)).toBe(true)
    expect(r.repo.commits[tip].message).toBe('Style login page')
    expect(r.repo.work['index.html']).toContain('footer')
    expect(r.repo.work['login.css']).toBeTruthy()
    expect(r.repo.orig).toBe(oldTip)
    // the old commits still exist but nothing points at them
    expect(r.repo.commits[oldTip]).toBeTruthy()
    const layout = layoutGraph(r.repo)
    expect(layout.nodes.find((n) => n.hash === oldTip).live).toBe(false)
  })
  it('reports up to date and refuses with local changes', () => {
    expect(git(['git switch main', 'git rebase main'], setup()).txt).toBe('Current branch main is up to date.')
    expect(git(['edit login.html', 'git rebase main'], setup()).txt).toBe('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.')
    expect(git(['git rebase nowhere'], setup()).txt).toBe("fatal: invalid upstream 'nowhere'")
  })
  it('aborts a conflicting rebase and leaves the branch alone', () => {
    const repo = SCENARIOS['merge-conflict'].setup(NOW)
    const tip = repo.branches.spanish
    const r = git(['git switch spanish', 'git rebase main'], repo)
    expect(r.failed).toBe(true)
    expect(r.txt).toContain('CONFLICT (content): Merge conflict in greeting.txt')
    expect(r.repo.branches.spanish).toBe(tip)
  })
  it('grades the rebase scenario', () => {
    const tasks = SCENARIOS.rebase.tasks
    let repo = setup()
    const done = new Set()
    for (const line of ['git log --oneline --graph --all', 'git rebase main', 'git log --oneline', 'git switch main', 'git merge feature']) {
      repo = runGit(repo, line).repo
      gradeTasks(tasks, repo, done)
    }
    expect([...done]).toEqual(tasks.map((t) => t.id))
  })
  it('resets soft, mixed and hard', () => {
    const base = [...started, 'edit README.md', 'git commit -am "Two"']
    const soft = git([...base, 'git reset --soft HEAD~1'])
    expect(soft.repo.order.length).toBe(2)
    expect(headHash(soft.repo)).toBe(soft.repo.order[0])
    expect(status(soft.repo).staged.map((s) => s.path)).toEqual(['README.md'])
    const mixed = git([...base, 'git reset HEAD~1'])
    expect(mixed.txt).toBe('Unstaged changes after reset:\nM\tREADME.md')
    expect(status(mixed.repo).unstaged.map((s) => s.path)).toEqual(['README.md'])
    const hard = git([...base, 'git reset --hard HEAD~1'])
    expect(hard.txt).toMatch(/^HEAD is now at [0-9a-f]{7} First$/)
    expect(hard.repo.work['README.md']).toBe('# Demo\n')
    expect(git([...base, 'git reset --hard HEAD~9']).txt).toContain("fatal: ambiguous argument 'HEAD~9'")
  })
})

describe('graph drawing helpers', () => {
  it('draws an ASCII graph for a merge', () => {
    const r = git([...started, 'git switch -c feature', 'edit app.js', 'git add .', 'git commit -m "Feature"', 'git switch main', 'edit README.md', 'git commit -am "Main"', 'git merge feature', 'git log --oneline --graph'])
    const lines = r.txt.split('\n')
    expect(lines[0]).toMatch(/^\* [0-9a-f]{7} \(HEAD -> main\) Merge branch 'feature'$/)
    expect(lines[1]).toBe('|\\')
    expect(lines[2]).toMatch(/^\* \| [0-9a-f]{7} Main$/)
    expect(lines[3]).toMatch(/^\| \* [0-9a-f]{7} \(feature\) Feature$/)
    expect(lines).toContain('|/')
    expect(lines[lines.length - 1]).toMatch(/^\* [0-9a-f]{7} First$/)
    const rows = asciiGraph(r.repo, [...r.repo.order].reverse())
    expect(rows.filter((x) => x.type === 'commit')).toHaveLength(4)
  })
  it('lays out lanes that stay put and labels HEAD', () => {
    const r = git([...started, 'git switch -c feature', 'edit README.md', 'git commit -am "F"'])
    const g = layoutGraph(r.repo)
    expect(g.nodes.map((n) => n.lane)).toEqual([0, 1])
    expect(g.labels.map((l) => l.id)).toEqual(['branch:main', 'HEAD', 'branch:feature'])
    expect(g.edges).toHaveLength(1)
    expect(g.height).toBeGreaterThan(0)
    expect(mergeBase(r.repo, r.repo.branches.main, r.repo.branches.feature)).toBe(r.repo.order[0])
  })
  it('completes subcommands, branches and files', () => {
    const { repo } = git([...started, 'git branch feature'])
    expect(completeGit(repo, 'git sw', commonPrefix).line).toBe('git switch ')
    expect(completeGit(repo, 'git switch fe', commonPrefix).line).toBe('git switch feature ')
    expect(completeGit(repo, 'git add RE', commonPrefix).line).toBe('git add README.md ')
    expect(completeGit(repo, 'git re', commonPrefix).options).toEqual(['rebase', 'reset', 'restore'])
  })
})

describe('scenarios', () => {
  const play = (id, lines) => {
    const tasks = SCENARIOS[id].tasks
    let repo = SCENARIOS[id].setup(NOW)
    const done = new Set()
    for (const line of lines) {
      repo = runGit(repo, line).repo
      gradeTasks(tasks, repo, done)
    }
    return { done, tasks }
  }
  it('basics', () => {
    const { done, tasks } = play('basics', ['git init', 'git status', 'git add README.md', 'git commit -m "Add README"', 'edit README.md', 'git add README.md', 'git commit -m "Describe"', 'git log --oneline'])
    expect(done.size).toBe(tasks.length)
  })
  it('branching', () => {
    const { done, tasks } = play('branching', ['git branch feature', 'git switch feature', 'edit app.js', 'git commit -am "Greeting"', 'git switch main', 'git merge feature', 'git branch -d feature'])
    expect(done.size).toBe(tasks.length)
  })
  it('every scenario sets up without errors', () => {
    for (const s of Object.values(SCENARIOS)) {
      const repo = s.setup(NOW)
      expect(repo.events).toEqual([])
    }
    expect(hasConflictMarkers(SCENARIOS['merge-conflict'].setup(NOW).work['greeting.txt'])).toBe(false)
  })
})
