import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Code, FileCheck2, FlaskConical, MessagesSquare, MousePointerClick, Repeat, Shuffle, Terminal, Timer, Wrench } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { ACTIVITY_GROUPS } from '../activities/catalog'
import { AVAILABLE_ACTIVITIES } from '../activities/available'
import { COLLECTIONS, getCollection } from '../lib/collections'
import { ALL_CHALLENGES, CONSOLE_LABS, duePractice, stageChallengeIds } from '../lib/practice'
import { formatRelative } from '../lib/dates'
import { dueSummary } from '../lib/session'

const TABS = [
  { id: 'labs', label: 'Console labs', icon: Terminal },
  { id: 'challenges', label: 'Coding challenges', icon: Code },
  { id: 'activities', label: 'Simulators', icon: MousePointerClick },
  { id: 'quizzes', label: 'Quizzes and recall', icon: FileCheck2 }
]

const DIFFICULTY_ORDER = { starter: 0, easy: 0, core: 1, medium: 1, challenge: 2, hard: 2 }

function Due({ list, now }) {
  if (!list.length) return null
  return (
    <section className="card roomy due-practice" aria-labelledby="redo-title">
      <div className="catalog-head"><span className="callno" id="redo-title"><Repeat size={13} /> Due for a redo</span><span className="stamp">{list.length} due</span></div>
      <p className="small muted">Skills fade like facts do. These come back on the same spaced schedule as your cards, so a lab you passed last month gets one more run before it slips.</p>
      <div className="row wrap" style={{ gap: 8 }}>
        {list.slice(0, 8).map((item) => (
          <Link key={`${item.kind}:${item.id}`} to={item.to} className="lab-chip due">
            {item.kind === 'lab' ? <Terminal size={12} /> : <Code size={12} />} {item.title} <span className="xsmall subtle">{formatRelative(item.due, now)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Labs({ practice, pathFilter }) {
  const ccna = getCollection('ccna')
  const groups = (ccna?.stages || []).map((stage) => ({ stage, labs: stage.labs.map((id) => CONSOLE_LABS.find((l) => l.id === id)).filter(Boolean) }))
  const listed = new Set(groups.flatMap((g) => g.labs.map((l) => l.id)))
  const other = CONSOLE_LABS.filter((l) => !listed.has(l.id))
  if (other.length) groups.push({ stage: { id: 'more', title: 'More labs' }, labs: other })
  const shown = pathFilter && pathFilter !== 'ccna' ? [] : groups
  return (
    <div className="stack-lg">
      <div className="callout info small">
        <Terminal size={16} />
        <span>A simulated Cisco router or switch. Type real IOS commands (abbreviations, <code>?</code> help and Tab completion work) and each task is checked live. Troubleshooting labs start broken: find the fault and fix it. <Link to="/practice/lab/sandbox">Open a free sandbox</Link>.</span>
      </div>
      {shown.map(({ stage, labs }) => labs.length > 0 && (
        <section key={stage.id}>
          <div className="section-head"><h2 className="section-title">{stage.title}</h2><span className="callno">{labs.filter((l) => practice.labs?.[l.id]).length} / {labs.length} passed</span></div>
          <div className="practice-grid">
            {labs.map((lab) => {
              const done = practice.labs?.[lab.id]
              return (
                <Link key={lab.id} to={`/practice/lab/${lab.id}`} className={`card card-link practice-card${done ? ' done' : ''}`}>
                  <div className="row between">
                    <span className={`chip ${lab.kind === 'troubleshoot' ? 'warn' : 'outline'}`}>{lab.kind === 'troubleshoot' ? <><Wrench size={11} /> Troubleshoot</> : <><FlaskConical size={11} /> Build</>}</span>
                    {done ? <span className="stamp good">Passed</span> : <span className="xsmall subtle">{lab.difficulty}{lab.minutes ? ` · ${lab.minutes} min` : ''}</span>}
                  </div>
                  <h3 className="list-title">{lab.title}</h3>
                  <p className="small muted clamp-2">{lab.objective}</p>
                  <div className="xsmall subtle mono">{lab.hostname} · {lab.deviceKind}</div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
      {!shown.length && <p className="muted">Console labs belong to the CCNA path.</p>}
    </div>
  )
}

function Challenges({ practice, pathFilter, stageFilter }) {
  const path = getCollection(pathFilter)
  const allowed = useMemo(() => {
    if (!path) return null
    const stages = stageFilter ? path.stages.filter((s) => s.id === stageFilter) : path.stages
    return new Set(stages.flatMap(stageChallengeIds))
  }, [path, stageFilter])
  const list = ALL_CHALLENGES.filter((c) => !allowed || allowed.has(c.id))
  const sets = new Map()
  for (const c of list) {
    if (!sets.has(c.set)) sets.set(c.set, { id: c.set, title: c.setTitle || c.set, items: [] })
    sets.get(c.set).items.push(c)
  }
  const solved = list.filter((c) => practice.challenges?.[c.id]).length
  const lastMock = (practice.interviews || [])[0]
  return (
    <div className="stack-lg">
      <Link to="/practice/interview" className="card card-link practice-card mock-entry">
        <div className="row between">
          <span className="mode-icon"><MessagesSquare size={18} /></span>
          {lastMock ? <span className={`stamp${lastMock.passed ? ' good' : ''}`}>Last: {typeof lastMock.score === 'number' ? `${lastMock.score}%` : 'saved'}</span> : <span className="chip outline">New</span>}
        </div>
        <h3 className="list-title">Mock interview</h3>
        <p className="small muted">Rehearse the real thing: a coding interview, an online assessment or behavioral questions, on a clock with no hints. Then score yourself on the rubric interviewers use.</p>
      </Link>
      <div className="row between wrap">
        <p className="small muted" style={{ maxWidth: '62ch' }}>Real problems, solved in JavaScript or Python and checked against hidden tests, the way online assessments work. Hints come in stages; the reference solution and its complexity unlock when you are done.</p>
        <span className="chip good"><Check size={12} /> {solved} / {list.length} solved</span>
      </div>
      {path && (
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="xsmall subtle">Showing {path.name}{stageFilter ? `: ${path.stages.find((s) => s.id === stageFilter)?.title}` : ''}.</span>
          <Link to="/practice?tab=challenges" className="xsmall">Show all</Link>
        </div>
      )}
      {[...sets.values()].map((set) => (
        <section key={set.id}>
          <div className="section-head"><h2 className="section-title">{set.title}</h2><span className="callno">{set.items.filter((c) => practice.challenges?.[c.id]).length} / {set.items.length}</span></div>
          <div className="list">
            {[...set.items].sort((a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 1) - (DIFFICULTY_ORDER[b.difficulty] ?? 1)).map((c) => {
              const done = practice.challenges?.[c.id]
              return (
                <Link key={c.id} to={`/practice/challenge/${c.id}`} className="list-row challenge-row">
                  <span className={`diff-dot ${c.difficulty}`} title={c.difficulty} aria-hidden="true" />
                  <div className="grow">
                    <div className="list-title">{c.title}</div>
                    <div className="xsmall subtle">{c.pattern || (c.tags || []).join(', ')}</div>
                  </div>
                  <span className={`chip ${c.difficulty === 'hard' ? 'warn' : c.difficulty === 'easy' ? 'good' : 'outline'}`}>{c.difficulty}</span>
                  {done ? <span className="stamp good">Solved</span> : <span className="xsmall subtle hide-mobile">Not solved</span>}
                </Link>
              )
            })}
          </div>
        </section>
      ))}
      {!list.length && <p className="muted">No challenges here yet.</p>}
    </div>
  )
}

function Activities({ practice }) {
  const groups = Object.entries(ACTIVITY_GROUPS).map(([id, label]) => ({ id, label, items: AVAILABLE_ACTIVITIES.filter((a) => a.group === id && a.type !== 'challenge') })).filter((g) => g.items.length)
  return (
    <div className="stack-lg">
      <p className="small muted" style={{ maxWidth: '62ch' }}>Every interactive simulator from the lessons, as a sandbox. Each has a goal; reaching it counts toward your progress.</p>
      {groups.map((g) => (
        <section key={g.id}>
          <div className="section-head"><h2 className="section-title">{g.label}</h2><span className="callno">{g.items.length}</span></div>
          <div className="practice-grid">
            {g.items.map((a) => (
              <Link key={a.type} to={a.type === 'ios-console' ? '/practice/lab/sandbox' : `/practice/activity/${a.type}`} className={`card card-link practice-card${practice.activities?.[a.type] ? ' done' : ''}`}>
                <div className="row between">
                  <span className="mode-icon sm"><MousePointerClick size={16} /></span>
                  {practice.activities?.[a.type] && <span className="stamp good">Done</span>}
                </div>
                <h3 className="list-title">{a.title}</h3>
                <p className="small muted clamp-3">{a.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Quizzes() {
  const { packs, progress, settings, stats, now, practice } = useApp()
  const due = dueSummary(packs, progress, settings, stats, now)
  const recent = practice.exams.slice(0, 5)
  return (
    <div className="stack-lg">
      <div className="practice-grid">
        <Link to="/quiz" className="card card-link practice-card">
          <span className="mode-icon"><FileCheck2 size={18} /></span>
          <h3 className="list-title">Quiz or exam</h3>
          <p className="small muted">Pick a path, a stage or a topic. Quizzes give feedback as you go; exams are timed and mixed like the real thing.</p>
        </Link>
        <Link to="/study/roulette" className="card card-link practice-card">
          <span className="mode-icon"><Shuffle size={18} /></span>
          <h3 className="list-title">Recall roulette</h3>
          <p className="small muted">A random spin through cards you have already seen, from every topic, weakest first. Great for keeping old topics alive.</p>
        </Link>
        <Link to="/study/review" className="card card-link practice-card">
          <span className="mode-icon"><Repeat size={18} /></span>
          <h3 className="list-title">Daily review</h3>
          <p className="small muted">{due.due ? `${due.due} cards are due.` : 'Nothing due right now.'} Spaced repetition decides what comes back and when.</p>
        </Link>
        {COLLECTIONS.filter((c) => c.exam).map((c) => (
          <Link key={c.id} to={`/quiz/run?path=${c.id}&mode=exam&n=${c.exam.questions}&minutes=${c.exam.minutes}`} className="card card-link practice-card">
            <span className="mode-icon"><Timer size={18} /></span>
            <h3 className="list-title">{c.exam.title}</h3>
            <p className="small muted">{c.exam.questions} questions, {c.exam.minutes} minutes, weighted by exam domain.</p>
          </Link>
        ))}
      </div>
      {recent.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title">Recent results</h2></div>
          <div className="list">
            {recent.map((e) => (
              <Link key={e.id} to={`/quiz/result/${e.id}`} className="list-row">
                <span className={`exam-pill${e.pass && e.score >= e.pass ? ' pass' : ''}`}><strong className="tabular">{e.score}%</strong></span>
                <div className="grow">
                  <div className="list-title">{e.title}</div>
                  <div className="xsmall subtle">{e.mode === 'exam' ? 'Exam' : 'Quiz'} · {e.correct}/{e.total} · {formatRelative(e.date, now)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default function Practice() {
  useDocumentTitle('Practice')
  const { practice, now } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'labs'
  const due = duePractice(practice, now)
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Practice</h1>
          <p className="page-sub">Hands-on work that proves you can do it, not just recognize it: Cisco console labs, coding challenges, simulators and timed exams.</p>
        </div>
      </div>
      <Due list={due} now={now} />
      <div className="tabs" role="tablist" aria-label="Practice types" style={{ marginTop: due.length ? 'var(--s-6)' : 0 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setParams({ tab: id }, { replace: true })}>
            <Icon size={14} style={{ verticalAlign: '-2px' }} /> {label}
          </button>
        ))}
      </div>
      {tab === 'labs' && <Labs practice={practice} pathFilter={params.get('path')} />}
      {tab === 'challenges' && <Challenges practice={practice} pathFilter={params.get('path')} stageFilter={params.get('stage')} />}
      {tab === 'activities' && <Activities practice={practice} />}
      {tab === 'quizzes' && <Quizzes />}
    </div>
  )
}
