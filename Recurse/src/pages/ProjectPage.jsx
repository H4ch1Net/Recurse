import { useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BookOpen, Check, ChevronLeft, ClipboardCopy, Clock, ExternalLink, Flag, FolderGit2, MessageSquareText, Play, Sparkles, Star, Trophy } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getProject } from '../lib/practice'
import { feedbackComplete, feedbackSuccess } from '../lib/juice'
import { sfx } from '../lib/sfx'
import RichText from '../components/RichText'
import Tile from '../components/Tile'

const isUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || '').trim())

export default function ProjectPage() {
  const { projectId } = useParams()
  const project = getProject(projectId)
  const { practice, updateProject, packMap, toast } = useApp()
  useDocumentTitle(project?.title || 'Project')
  const entry = practice.projects?.[projectId]
  const [repo, setRepo] = useState(entry?.repo || '')
  const [demo, setDemo] = useState(entry?.demo || '')
  const [notes, setNotes] = useState(entry?.notes || '')
  const [rubric, setRubric] = useState(entry?.rubric || {})
  const milestoneRefs = useRef([])
  if (!project) return <Navigate to="/portfolio" replace />

  const milestones = project.milestones || []
  const checked = entry?.milestones || {}
  const doneCount = milestones.filter((_, i) => checked[i]).length
  const allDone = milestones.length > 0 && doneCount === milestones.length
  const topics = (project.topics || []).map((id) => packMap.get(id)).filter(Boolean)

  const toggle = (i) => {
    const next = { ...checked, [i]: !checked[i] }
    updateProject(project.id, { status: entry?.status === 'done' ? 'done' : 'active', milestones: next })
    if (next[i]) feedbackSuccess(milestoneRefs.current[i], 'Milestone')
    else sfx.tap()
  }
  const saveLinks = () => {
    updateProject(project.id, { repo: repo.trim(), demo: demo.trim(), notes, status: entry?.status || 'active' })
    toast('Saved', { tone: 'good' })
  }
  const finish = () => {
    updateProject(project.id, { status: 'done', repo: repo.trim(), demo: demo.trim(), notes, rubric })
    feedbackComplete({ big: true })
    toast('Project finished · +250 XP', { tone: 'good', duration: 5000 })
  }
  const copyBullet = async () => {
    try {
      await navigator.clipboard.writeText(project.resumeBullet)
      sfx.success()
      toast('Resume bullet copied', { tone: 'good' })
    } catch {
      toast('Copy blocked by the browser. Select the text instead.')
    }
  }

  return (
    <div className="page">
      <Link to="/portfolio" className="back-link small"><ChevronLeft size={16} /> Portfolio</Link>
      <header className="path-hero">
        <span className="path-icon lg" style={{ '--hue': project.track === 'ccna' ? 200 : 268 }} aria-hidden="true"><FolderGit2 size={30} /></span>
        <div className="grow stack-sm">
          <div className="eyebrow">{project.track === 'ccna' ? 'Networking project' : 'Software project'} · {project.level} · <Clock size={11} style={{ verticalAlign: '-1px' }} /> about {project.hours} hours</div>
          <h1 className="page-title">{project.title}</h1>
          <p className="page-sub">{project.summary}</p>
          <div className="row wrap" style={{ gap: 6 }}>{(project.skills || []).map((s) => <span key={s} className="chip outline">{s}</span>)}</div>
        </div>
      </header>

      <div className="topic-actions">
        {!entry ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={() => { updateProject(project.id, { status: 'active' }); sfx.success() }}><Play size={18} /> Start this project</button>
        ) : entry.status === 'done' ? (
          <span className="stamp good press">Finished</span>
        ) : (
          <span className="chip accent"><Flag size={13} /> In progress · {doneCount} of {milestones.length} milestones</span>
        )}
      </div>

      <div className="project-layout">
        <div className="stack-lg">
          <section className="card roomy stack-sm">
            <h2 className="section-title">Why build it</h2>
            <p className="muted">{project.why}</p>
            <h2 className="section-title" style={{ marginTop: 'var(--s-3)' }}>The brief</h2>
            <RichText text={project.brief} />
          </section>

          <section className="card roomy" aria-labelledby="ms-title">
            <div className="row between"><h2 className="section-title" id="ms-title">Milestones</h2><span className="chip">{doneCount} / {milestones.length}</span></div>
            <div className="bar" style={{ margin: 'var(--s-3) 0' }}><span style={{ width: `${milestones.length ? (doneCount / milestones.length) * 100 : 0}%` }} /></div>
            <ol className="milestones">
              {milestones.map((m, i) => (
                <li key={i} ref={(el) => (milestoneRefs.current[i] = el)} className={`milestone${checked[i] ? ' done' : ''}`}>
                  <button type="button" className="milestone-check" onClick={() => toggle(i)} aria-pressed={Boolean(checked[i])} aria-label={`Mark "${m.title}" ${checked[i] ? 'not done' : 'done'}`}>
                    {checked[i] ? <Check size={16} /> : i + 1}
                  </button>
                  <div className="grow">
                    <h3 className="list-title">{m.title}</h3>
                    <ul className="milestone-tasks">{(m.tasks || []).map((t, j) => <li key={j}>{t}</li>)}</ul>
                    {m.doneWhen && <p className="xsmall subtle"><Check size={11} /> Done when: {m.doneWhen}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {project.stretch?.length > 0 && (
            <section className="card roomy stack-sm">
              <h2 className="section-title"><Sparkles size={16} style={{ verticalAlign: '-2px' }} /> Stretch goals</h2>
              <ul className="summary-list">{project.stretch.map((s) => <li key={s}>{s}</li>)}</ul>
            </section>
          )}
        </div>

        <aside className="stack-lg">
          <section className="card roomy stack-sm">
            <h2 className="section-title">Your links</h2>
            <label className="label" htmlFor="repo">Repository URL</label>
            <input id="repo" className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/you/project" inputMode="url" />
            <label className="label" htmlFor="demo">Demo URL <span className="subtle">(optional)</span></label>
            <input id="demo" className="input" value={demo} onChange={(e) => setDemo(e.target.value)} placeholder="https://..." inputMode="url" />
            <label className="label" htmlFor="notes">Notes and decisions</label>
            <textarea id="notes" className="textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you chose and why. This is your interview prep." />
            <div className="row wrap">
              <button type="button" className="btn" onClick={saveLinks}>Save</button>
              {isUrl(entry?.repo) && <a className="btn btn-ghost" href={entry.repo} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open repo</a>}
            </div>
          </section>

          {project.rubric?.length > 0 && (
            <section className="card roomy stack-sm">
              <h2 className="section-title"><Star size={16} style={{ verticalAlign: '-2px' }} /> Self-review</h2>
              <p className="xsmall subtle">Check each one honestly before you call it finished. This is what a reviewer looks for.</p>
              {project.rubric.map((r, i) => (
                <label key={i} className="check-row">
                  <input type="checkbox" checked={Boolean(rubric[i])} onChange={(e) => { setRubric((x) => ({ ...x, [i]: e.target.checked })); sfx.tap() }} />
                  <span className="small">{r}</span>
                </label>
              ))}
              {entry?.status !== 'done' && (
                <button type="button" className="btn btn-primary" onClick={finish} disabled={!allDone}>
                  <Trophy size={16} /> {allDone ? 'Mark as finished' : 'Finish every milestone first'}
                </button>
              )}
            </section>
          )}

          {project.resumeBullet && (
            <section className="card roomy stack-sm">
              <h2 className="section-title">Resume bullet</h2>
              <blockquote className="resume-bullet">{project.resumeBullet}</blockquote>
              <div><button type="button" className="btn btn-sm" onClick={copyBullet}><ClipboardCopy size={14} /> Copy</button></div>
              <p className="xsmall subtle">Adapt it to what you actually built, with your own numbers.</p>
            </section>
          )}

          {project.interviewTalkingPoints?.length > 0 && (
            <section className="card roomy stack-sm">
              <h2 className="section-title"><MessageSquareText size={16} style={{ verticalAlign: '-2px' }} /> Talking points</h2>
              <ul className="summary-list">{project.interviewTalkingPoints.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
          )}

          {project.showcase?.length > 0 && (
            <section className="card roomy stack-sm">
              <h2 className="section-title">Show it off</h2>
              <ul className="summary-list">{project.showcase.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
          )}

          {topics.length > 0 && (
            <section className="card roomy stack-sm">
              <h2 className="section-title"><BookOpen size={16} style={{ verticalAlign: '-2px' }} /> Learn first</h2>
              {topics.map((p) => (
                <Link key={p.id} to={`/topic/${p.id}`} className="row" style={{ gap: 10 }}><Tile pack={p} size="sm" /> <span className="small">{p.name}</span></Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
