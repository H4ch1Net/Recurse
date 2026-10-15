import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardCopy, Code, Download, ExternalLink, FolderGit2, Hammer, Terminal, Trophy } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PROJECTS } from '../lib/practice'
import { portfolioMarkdown, skillsSummary } from '../lib/portfolio'
import { sfx } from '../lib/sfx'

const STATUS = { planned: 'Planned', active: 'In progress', done: 'Finished' }

export default function Portfolio() {
  useDocumentTitle('Portfolio')
  const { packs, summaries, practice, user, toast } = useApp()
  const summary = useMemo(() => skillsSummary({ packs, summaries, practice }), [packs, summaries, practice])
  const markdown = useMemo(() => portfolioMarkdown(summary, { name: user.name }), [summary, user.name])
  const [preview, setPreview] = useState(false)
  const tracks = [
    { id: 'swe', title: 'Software engineering projects', icon: Code },
    { id: 'ccna', title: 'Networking projects', icon: Terminal }
  ]

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      sfx.success()
      toast('Copied as Markdown', { tone: 'good' })
    } catch {
      setPreview(true)
      toast('Copy blocked by the browser. Select the text below instead.')
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'skills.md'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Show what you can do</div>
          <h1 className="page-title">Portfolio</h1>
          <p className="page-sub">Employers hire on evidence. Build the projects below, keep their repositories public, and use this page to turn what you learned into a profile README and resume bullets.</p>
        </div>
        <div className="row wrap">
          <button type="button" className="btn" onClick={() => setPreview((v) => !v)}>{preview ? 'Hide' : 'Preview'} Markdown</button>
          <button type="button" className="btn" onClick={download}><Download size={16} /> Download</button>
          <button type="button" className="btn btn-primary" onClick={copy}><ClipboardCopy size={16} /> Copy for GitHub</button>
        </div>
      </div>

      <div className="grid-stats portfolio-stats">
        <div className="stat"><div className="stat-label">Projects finished</div><div className="stat-value">{summary.projects.filter((p) => p.entry.status === 'done').length}</div><div className="stat-note">{summary.projects.filter((p) => p.entry.status === 'active').length} in progress</div></div>
        <div className="stat"><div className="stat-label">Challenges solved</div><div className="stat-value">{summary.solved.length}</div><div className="stat-note">{summary.byDifficulty.easy} easy · {summary.byDifficulty.medium} medium · {summary.byDifficulty.hard} hard</div></div>
        <div className="stat"><div className="stat-label">Console labs</div><div className="stat-value">{summary.labs.length}</div><div className="stat-note">Cisco IOS, graded</div></div>
        <div className="stat"><div className="stat-label">Topics mastered</div><div className="stat-value">{summary.mastered.length}</div><div className="stat-note">{summary.practiced.length} more practiced</div></div>
      </div>

      {preview && <pre className="markdown-preview rise">{markdown}</pre>}

      {summary.paths.length > 0 && (
        <section style={{ marginTop: 'var(--s-8)' }}>
          <div className="section-head"><h2 className="section-title">Paths</h2></div>
          <div className="list">
            {summary.paths.map((p) => (
              <Link key={p.collection.id} to={`/path/${p.collection.id}`} className="list-row">
                <Trophy size={16} className="subtle" />
                <div className="grow">
                  <div className="list-title">{p.collection.name}</div>
                  <div className="xsmall subtle">{p.practiced} of {p.total} topics practiced · {p.mastered} mastered{p.bestExam !== null ? ` · best exam ${p.bestExam}%` : ''}</div>
                </div>
                <span className="bar" style={{ width: 120 }}><span style={{ width: `${(p.practiced / Math.max(1, p.total)) * 100}%` }} /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {tracks.map(({ id, title, icon: Icon }) => {
        const list = PROJECTS.filter((p) => p.track === id)
        if (!list.length) return null
        return (
          <section key={id} style={{ marginTop: 'var(--s-8)' }}>
            <div className="section-head"><h2 className="section-title"><Icon size={18} style={{ verticalAlign: '-3px' }} /> {title}</h2><span className="callno">{list.length} projects</span></div>
            <div className="practice-grid">
              {list.map((p) => {
                const entry = practice.projects?.[p.id]
                const milestones = p.milestones?.length || 0
                const doneCount = Object.values(entry?.milestones || {}).filter(Boolean).length
                return (
                  <Link key={p.id} to={`/project/${p.id}`} className={`card card-link practice-card project-card${entry?.status === 'done' ? ' done' : ''}`}>
                    <div className="row between">
                      <span className={`chip ${p.level === 'advanced' ? 'warn' : p.level === 'beginner' ? 'good' : 'outline'}`}>{p.level}</span>
                      {entry ? <span className={`stamp${entry.status === 'done' ? ' good' : ' ink'}`}>{STATUS[entry.status]}</span> : <span className="xsmall subtle">about {p.hours} h</span>}
                    </div>
                    <h3 className="list-title">{p.title}</h3>
                    <p className="small muted clamp-3">{p.summary}</p>
                    <div className="row wrap" style={{ gap: 4 }}>{(p.skills || []).slice(0, 4).map((s) => <span key={s} className="chip outline xsmall">{s}</span>)}</div>
                    {entry && milestones > 0 && (
                      <div className="stack-sm">
                        <div className="bar"><span style={{ width: `${(doneCount / milestones) * 100}%` }} /></div>
                        <div className="xsmall subtle">{doneCount} of {milestones} milestones{entry.repo ? <> · <FolderGit2 size={11} /> repo linked</> : ''}</div>
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
      {!PROJECTS.length && <p className="muted" style={{ marginTop: 'var(--s-6)' }}>Project briefs are on their way.</p>}
      <p className="xsmall subtle" style={{ marginTop: 'var(--s-6)' }}>
        <Hammer size={12} /> Projects are yours: Recurse gives the brief, milestones and a rubric, you build them in your own editor and repository. <Check size={12} /> Links you add stay in this browser. <ExternalLink size={12} /> Nothing is published unless you paste it somewhere.
      </p>
    </div>
  )
}
