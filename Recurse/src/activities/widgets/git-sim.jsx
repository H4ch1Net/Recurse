import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, FilePlus2, Lightbulb, Minus, Pencil, Plus } from 'lucide-react'
import { feedbackSuccess } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { runGit, completeGit } from '../lib/git-sim/commands.js'
import { fileStates, headTree, headHash, short, PROJECT_DIR } from '../lib/git-sim/repo.js'
import { layoutGraph } from '../lib/git-sim/layout.js'
import { SCENARIOS, SCENARIO_IDS, scenarioFor, explainEvent } from '../lib/git-sim/scenarios.js'
import { gradeTasks, historyStep, commonPrefix } from '../lib/terminal/parse.js'
import { TouchKeys } from '../lib/touch-keys'
import './git-sim.css'

const TONE_CLASS = { out: 'terminal-out', err: 'terminal-err', ok: 'terminal-ok', dim: 'terminal-dim', hash: 'gitsim-hash', ref: 'gitsim-ref', strong: 'gitsim-strong' }

let lineId = 0
const withIds = (lines) => lines.map((l) => ({ ...l, id: ++lineId }))

function promptFor(repo) {
  const dir = `~${PROJECT_DIR.replace('/home/learner', '')}`
  if (!repo.initialized) return `learner@recurse:${dir}$ `
  const where = repo.head.detached ? short(repo.head.detached) : repo.head.branch
  return `learner@recurse:${dir} (${where})$ `
}

function ConsoleLine({ line }) {
  if (line.kind === 'cmd') {
    return (
      <div className="terminal-line">
        <span className="terminal-prompt">{line.prompt}</span>
        <span>{line.text}</span>
      </div>
    )
  }
  if (line.parts) {
    return (
      <div className="terminal-line">
        {line.parts.map((p, i) => (
          <span key={i} className={TONE_CLASS[p.tone] || 'terminal-out'}>
            {p.text}
          </span>
        ))}
        {!line.parts.some((p) => p.text) && ' '}
      </div>
    )
  }
  return <div className={`terminal-line ${TONE_CLASS[line.tone] || 'terminal-out'}`}>{line.text || ' '}</div>
}

/** Git sandbox: a terminal, a live commit graph and the three places files live. */
export default function GitSim({ props, onComplete, standalone }) {
  const [scenario, setScenario] = useState(() => scenarioFor(props.scenario))
  return (
    <div className="gitsim">
      {standalone && (
        <div className="w-toolbar">
          <span className="small subtle">Scenario</span>
          <div className="w-pill-group" role="group" aria-label="Scenario">
            {SCENARIO_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={scenario === id} onClick={() => setScenario(id)}>
                {SCENARIOS[id].title}
              </button>
            ))}
          </div>
        </div>
      )}
      <GitScenario key={scenario} scenario={scenario} onComplete={onComplete} />
    </div>
  )
}

function GitScenario({ scenario, onComplete }) {
  const spec = SCENARIOS[scenario]
  const [repo, setRepo] = useState(() => spec.setup(Date.now()))
  const [lines, setLines] = useState(() =>
    withIds([
      { tone: 'dim', text: 'Git sandbox. Type git commands below, or help for the list.' },
      { tone: 'dim', text: 'edit <file> changes a file for you. Tab completes, Up and Down recall commands.' }
    ])
  )
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [histIndex, setHistIndex] = useState(-1)
  const [done, setDone] = useState(() => new Set())
  const [caption, setCaption] = useState({ text: spec.intro, tone: '' })
  const screenRef = useRef(null)
  const inputRef = useRef(null)
  const taskRefs = useRef({})
  const finished = useRef(false)
  const inputId = useId()

  useEffect(() => {
    const el = screenRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const total = spec.tasks.length
  const current = spec.tasks.find((t) => !done.has(t.id))

  const run = (text) => {
    const echo = { kind: 'cmd', prompt: promptFor(repo), text }
    if (!text.trim()) {
      setLines((ls) => [...ls, ...withIds([echo])])
      return
    }
    setHistory((h) => (h[h.length - 1] === text ? h : [...h, text]))
    const r = runGit(repo, text)
    setRepo(r.repo)
    setLines((ls) => (r.clear ? [] : [...ls, ...withIds([echo, ...r.out])].slice(-400)))
    const event = r.event
    if (r.failed && event?.mode !== 'conflict') sfx.error()
    else sfx.key()

    const nextDone = new Set(done)
    const fresh = gradeTasks(spec.tasks, r.repo, nextDone)
    const why = explainEvent(event, r.repo, r)
    if (fresh.length) {
      setDone(nextDone)
      fresh.forEach((id, i) => setTimeout(() => feedbackSuccess(taskRefs.current[id], i === fresh.length - 1 ? 'Step done' : null), i * 180))
      if (nextDone.size === total && !finished.current) {
        finished.current = true
        setCaption({ text: `${why ? `${why} ` : ''}That is the whole scenario. These are the moves you will use on every real project.`, tone: 'good' })
        onComplete({ score: 1 })
        return
      }
    }
    setCaption(why ? { text: why, tone: r.failed && event?.mode !== 'conflict' ? 'bad' : fresh.length ? 'good' : '' } : { text: '', tone: '' })
  }

  const submit = () => {
    const text = input
    setInput('')
    setHistIndex(-1)
    run(text)
  }

  const recall = (dir) => {
    const step = historyStep(history, histIndex, dir)
    setHistIndex(step.index)
    setInput(step.value)
  }

  const tabComplete = () => {
    const c = completeGit(repo, input, commonPrefix)
    if (c.line !== input) {
      setInput(c.line)
      sfx.tick()
    } else if (c.options.length) setLines((ls) => [...ls, ...withIds([{ kind: 'cmd', prompt: promptFor(repo), text: input }, { tone: 'out', text: c.options.join('  ') }])])
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      recall(e.key === 'ArrowUp' ? -1 : 1)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      tabComplete()
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([])
    }
  }

  const focusInput = () => {
    if (!window.getSelection()?.toString()) inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className="gitsim-body">
      <div className="gitsim-head">
        <span className="chip accent">{spec.title}</span>
        <span className="grow" />
        <span className="chip outline tabular" aria-label={`${done.size} of ${total} steps done`}>
          {done.size} / {total}
        </span>
      </div>
      <div className="gitsim-main">
        <div className="gitsim-term-col">
          <div className="terminal gitsim-console">
            <div className="terminal-bar" aria-hidden="true">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              ~/project
            </div>
            <div className="terminal-screen" ref={screenRef} onClick={focusInput} role="log" aria-live="polite" aria-label="Terminal output">
              {lines.map((l) => (
                <ConsoleLine key={l.id} line={l} />
              ))}
              <div className="terminal-input-row">
                <label htmlFor={inputId} className="terminal-prompt">
                  {promptFor(repo)}
                </label>
                <input
                  id={inputId}
                  ref={inputRef}
                  className="terminal-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  aria-label="Command"
                />
              </div>
            </div>
          </div>
          <TouchKeys
            label="Console keys"
            keys={[
              { label: 'Tab', title: 'Complete the command (Tab)', onPress: tabComplete },
              { label: '↑', title: 'Previous command (Up)', onPress: () => recall(-1) },
              { label: '↓', title: 'Next command (Down)', onPress: () => recall(1) },
              { label: 'clear', title: 'Clear the screen (Ctrl+L)', onPress: () => setLines([]) }
            ]}
          />
        </div>
        <CommitGraph repo={repo} />
      </div>
      <FilePanels repo={repo} run={run} />
      <p className={`w-feedback ${caption.tone}`} aria-live="polite">
        {caption.text}
      </p>
      <ol className="w-tasks" aria-label="Steps">
        {spec.tasks.map((t) => {
          const isDone = done.has(t.id)
          const isCurrent = current?.id === t.id
          return (
            <li key={t.id} ref={(el) => (taskRefs.current[t.id] = el)} className={`w-task${isDone ? ' done' : ''}${isCurrent ? ' gitsim-current' : ''}`}>
              <span className="w-task-mark" aria-hidden="true">
                {isDone && <Check size={13} strokeWidth={3} />}
              </span>
              <span>
                {t.text}
                <span className="sr-only">{isDone ? ' (done)' : isCurrent ? ' (current step)' : ''}</span>
                {isCurrent && (
                  <span className="w-task-hint">
                    <Lightbulb size={12} aria-hidden="true" /> {t.hint}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** The commit graph: oldest at the top, branch labels and HEAD slide when they move. */
function CommitGraph({ repo }) {
  const g = useMemo(() => layoutGraph(repo), [repo])
  const scrollRef = useRef(null)
  const count = g.nodes.length
  useEffect(() => {
    const el = scrollRef.current
    if (el?.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [count])
  const head = headHash(repo)
  const ghosts = g.nodes.some((n) => !n.live)
  const summary = count ? `Commit graph with ${count} commits. ${Object.entries(repo.branches).map(([b, h]) => `${b} at ${short(h)}`).join(', ')}. HEAD ${repo.head.detached ? `detached at ${short(head)}` : `on ${repo.head.branch}`}.` : 'No commits yet.'

  return (
    <section className="gitsim-graph" aria-label="Commit graph">
      <div className="gitsim-panel-title">
        <span>Commit graph</span>
        <span className="xsmall subtle">{repo.head.detached ? 'HEAD is detached' : `HEAD on ${repo.head.branch}`}</span>
      </div>
      <div className="gitsim-graph-scroll" ref={scrollRef}>
        {count === 0 ? (
          <p className="gitsim-empty small subtle">{repo.initialized ? 'No commits yet. Your first commit will appear here.' : 'No repository yet. git init creates one.'}</p>
        ) : (
          <svg className="gitsim-svg" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label={summary}>
            <g>
              {g.edges.map((e) => (
                <path key={e.id} d={e.d} className={`gitsim-edge lane-${e.lane % 5}${e.live ? '' : ' ghost'}`} pathLength="1" />
              ))}
            </g>
            {g.nodes.map((n) => (
              <g key={n.hash} className={`gitsim-node lane-${n.lane % 5}${n.live ? '' : ' ghost'}${n.head ? ' is-head' : ''}`}>
                <title>{`${n.short} ${n.fullMessage}${n.merge ? ' (merge commit)' : ''}${n.live ? '' : ' (not on any branch)'}`}</title>
                <g className="gitsim-dot" style={{ transformOrigin: `${n.x}px ${n.y}px` }}>
                  <circle cx={n.x} cy={n.y} r="10" />
                  {n.merge && <circle cx={n.x} cy={n.y} r="4.5" className="gitsim-merge-core" />}
                </g>
                <text x={n.textX} y={n.y + 4} className="gitsim-svg-hash">
                  {n.short}
                </text>
                <text x={n.messageX} y={n.y + 4} className="gitsim-svg-msg">
                  {n.message}
                </text>
              </g>
            ))}
            {g.labels.map((l) => (
              <g key={l.id} className={`gitsim-label ${l.kind}`} style={{ transform: `translate(${l.x}px, ${l.y - 9}px)` }}>
                <rect width={l.width} height="18" rx="9" />
                <text x={l.width / 2} y="12.5" textAnchor="middle">
                  {l.text}
                </text>
                {l.kind === 'head' && !repo.head.detached && <path d={`M ${l.width + 2} 9 h 8 m -3 -3 l 3 3 l -3 3`} className="gitsim-head-arrow" />}
              </g>
            ))}
          </svg>
        )}
      </div>
      <div className="w-legend">
        <span>Circles are commits, lines point to parents.</span>
        {ghosts && <span>Faded commits are on no branch.</span>}
      </div>
      <span className="sr-only" aria-live="polite">
        {summary}
      </span>
    </section>
  )
}

/** Working tree, staging area and last commit, with buttons that type the matching command. */
function FilePanels({ repo, run }) {
  const files = fileStates(repo)
  const head = headTree(repo)
  const work = files.filter((f) => f.inWork || f.unstaged === 'deleted' || f.conflict)
  const staged = files.filter((f) => f.staged)
  const committed = Object.keys(head).sort()
  const nextFile = () => {
    let n = 1
    while (`notes${n === 1 ? '' : `-${n}`}.txt` in repo.work) n++
    return `notes${n === 1 ? '' : `-${n}`}.txt`
  }

  const badge = (f) => {
    if (f.conflict) return <span className="gitsim-badge conflict">conflict</span>
    if (f.untracked) return <span className="gitsim-badge untracked">untracked</span>
    if (f.unstaged === 'deleted') return <span className="gitsim-badge deleted">deleted</span>
    if (f.unstaged === 'modified') return <span className="gitsim-badge modified">modified</span>
    return <span className="gitsim-badge clean">{repo.initialized ? 'unchanged' : 'file'}</span>
  }

  return (
    <div className="gitsim-areas">
      <section className="gitsim-area" aria-label="Working tree">
        <div className="gitsim-panel-title">
          <span>Working tree</span>
          <span className="xsmall subtle">your files</span>
        </div>
        <ul className="gitsim-files">
          {work.map((f) => (
            <li key={f.path} className={`gitsim-file${f.conflict ? ' is-conflict' : ''}`}>
              <div className="gitsim-file-row">
                <span className="gitsim-file-name mono">{f.path}</span>
                {badge(f)}
                <span className="grow" />
                {f.inWork && !f.conflict && (
                  <button type="button" className="gitsim-icon-btn" onClick={() => run(`edit ${f.path}`)} title={`Edit ${f.path} (runs: edit ${f.path})`} aria-label={`Edit ${f.path}`}>
                    <Pencil size={14} />
                  </button>
                )}
                {repo.initialized && !f.conflict && (f.untracked || f.unstaged) && (
                  <button type="button" className="gitsim-icon-btn" onClick={() => run(`git add ${f.path}`)} title={`Stage ${f.path} (runs: git add ${f.path})`} aria-label={`Stage ${f.path}`}>
                    <Plus size={14} />
                  </button>
                )}
              </div>
              {f.conflict && (
                <div className="gitsim-resolve" role="group" aria-label={`Resolve ${f.path}`}>
                  {f.markers ? (
                    <>
                      <button type="button" className="btn btn-sm" onClick={() => run(`git checkout --ours ${f.path}`)}>
                        Keep {repo.head.branch ?? 'ours'}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => run(`git checkout --theirs ${f.path}`)}>
                        Keep {repo.merge?.name ?? 'theirs'}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => run(`edit ${f.path}`)}>
                        Keep both
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => run(`git add ${f.path}`)}>
                      Mark resolved: git add {f.path}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(`edit ${nextFile()}`)}>
          <FilePlus2 size={14} /> New file
        </button>
      </section>
      <div className="gitsim-arrow" aria-hidden="true">
        <span className="mono">git add</span>
      </div>
      <section className="gitsim-area" aria-label="Staging area">
        <div className="gitsim-panel-title">
          <span>Staging area</span>
          <span className="xsmall subtle">next commit</span>
        </div>
        {!repo.initialized ? (
          <p className="xsmall subtle">Needs a repository: git init</p>
        ) : staged.length ? (
          <ul className="gitsim-files">
            {staged.map((f) => (
              <li key={f.path} className="gitsim-file">
                <div className="gitsim-file-row">
                  <span className="gitsim-file-name mono">{f.path}</span>
                  <span className={`gitsim-badge staged ${f.staged === 'deleted' ? 'deleted' : ''}`}>{f.staged === 'new file' ? 'new' : f.staged}</span>
                  <span className="grow" />
                  <button type="button" className="gitsim-icon-btn" onClick={() => run(`git restore --staged ${f.path}`)} title={`Unstage ${f.path} (runs: git restore --staged ${f.path})`} aria-label={`Unstage ${f.path}`}>
                    <Minus size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="xsmall subtle">{repo.merge && !repo.merge.conflicts.length ? 'Conflicts resolved. git commit finishes the merge.' : 'Nothing staged. git add puts changes here.'}</p>
        )}
      </section>
      <div className="gitsim-arrow" aria-hidden="true">
        <span className="mono">git commit</span>
      </div>
      <section className="gitsim-area" aria-label="Last commit">
        <div className="gitsim-panel-title">
          <span>Last commit</span>
          <span className="xsmall subtle mono">{headHash(repo) ? short(headHash(repo)) : 'none'}</span>
        </div>
        {committed.length ? (
          <ul className="gitsim-files">
            {committed.map((p) => (
              <li key={p} className="gitsim-file">
                <div className="gitsim-file-row">
                  <span className="gitsim-file-name mono">{p}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="xsmall subtle">{repo.initialized ? 'No commits yet.' : 'No repository yet.'}</p>
        )}
      </section>
    </div>
  )
}
