import { useMemo } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, ChevronLeft, Flag, CircleCheck, Code, FileCheck2, FlaskConical, Hammer, Layers, Play, Repeat, Terminal, Timer, Trophy } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { TOPIC_STEP_LABELS, getCollection, nextTopic, resourcesForTopics } from '../lib/collections'
import { readiness } from '../lib/practice'
import { dueSummary } from '../lib/session'
import { formatRelative } from '../lib/dates'
import PathIcon from '../components/PathIcon'
import MemoryRing from '../components/MemoryRing'
import Tile from '../components/Tile'
import ResourceList from '../components/ResourceList'
import { sfx } from '../lib/sfx'

function StepPill({ step }) {
  return <span className={`step-pill step-${step}`}><span className="step-dots" aria-hidden="true"><i /><i /><i /></span>{TOPIC_STEP_LABELS[step]}</span>
}

export default function PathDetail() {
  const { pathId } = useParams()
  const collection = getCollection(pathId)
  const { packs, packMap, summaries, practice, progress, settings, stats, now, user, updateUser } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'recommended' ? 'recommended' : 'plan'
  useDocumentTitle(collection?.name || 'Path')
  const ready = useMemo(() => (collection ? readiness(collection, { packMap, summaries, practice }) : null), [collection, packMap, summaries, practice])
  const topicResources = useMemo(() => {
    if (!collection) return []
    const own = new Set((collection.resources || []).map((r) => r.url))
    return resourcesForTopics(collection.packIds.map((id) => packMap.get(id)).filter(Boolean)).filter((r) => !own.has(r.url))
  }, [collection, packMap])
  const due = useMemo(() => {
    if (!collection) return null
    const scoped = packs.filter((p) => collection.packIds.includes(p.id))
    return dueSummary(scoped, progress, settings, stats, now)
  }, [collection, packs, progress, settings, stats, now])
  if (!collection) return <Navigate to="/paths" replace />

  const next = nextTopic(collection, packMap, summaries)
  const started = collection.packIds.some((id) => summaries.get(id)?.started)
  const examQuestions = collection.exam?.questions
  const isGoal = (user.goals || []).includes(collection.id)
  const toggleGoal = () => {
    sfx.tap()
    const goals = user.goals || []
    updateUser({ goals: isGoal ? goals.filter((g) => g !== collection.id) : [...goals, collection.id] })
  }
  const setTab = (next) => setParams(next === 'plan' ? {} : { tab: next }, { replace: true })
  const recommendedCount = (collection.resources?.length || 0) + topicResources.length

  return (
    <div className="page path-page" style={{ '--hue': collection.hue }}>
      <Link to="/paths" className="back-link small"><ChevronLeft size={16} /> Paths</Link>

      <header className="path-hero">
        <PathIcon collection={collection} size="lg" />
        <div className="grow stack-sm">
          <div className="eyebrow">{collection.stages.length} stages · about {collection.hours} hours</div>
          <h1 className="page-title">{collection.name}</h1>
          <p className="page-sub">{collection.description}</p>
          <div className="callout good small path-outcome"><Trophy size={16} /><span><strong>By the end:</strong> {collection.outcome}</span></div>
          <div>
            <button type="button" className="btn btn-sm goal-toggle" aria-pressed={isGoal} onClick={toggleGoal}>
              {isGoal ? <><Check size={14} /> Your goal</> : <><Flag size={14} /> Set as my goal</>}
            </button>
          </div>
        </div>
      </header>

      <div className="topic-actions">
        {next ? (
          <Link to={next.pack.lesson && !summaries.get(next.pack.id)?.lessonRead ? `/topic/${next.pack.id}/lesson` : `/topic/${next.pack.id}`} className="btn btn-primary btn-lg">
            <Play size={18} /> {started ? 'Continue' : 'Start'}: {next.pack.name}
          </Link>
        ) : (
          <span className="btn btn-lg" aria-disabled="true"><CircleCheck size={18} /> Every topic practiced</span>
        )}
        {started && (
          <Link to={`/study/path?path=${collection.id}`} className="btn btn-lg" title="Due cards from this path, mixed across its topics">
            <Repeat size={18} /> Path review{due?.due ? ` · ${due.due} due` : ''}
          </Link>
        )}
        <Link to={`/quiz?path=${collection.id}`} className="btn btn-lg"><FileCheck2 size={18} /> Quiz</Link>
        {collection.exam && (
          <Link to={`/quiz/run?path=${collection.id}&mode=exam&n=${examQuestions}&minutes=${collection.exam.minutes}`} className="btn btn-lg btn-ghost"><Timer size={18} /> Practice exam</Link>
        )}
      </div>

      <div className="tabs path-tabs" role="tablist" aria-label="Path sections">
        <button type="button" role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>Plan</button>
        <button type="button" role="tab" aria-selected={tab === 'recommended'} onClick={() => setTab('recommended')}>Recommended{recommendedCount ? ` (${recommendedCount})` : ''}</button>
      </div>

      {tab === 'plan' && (
        <>
          <section className="card roomy readiness-card" aria-labelledby="ready-title">
            <div className="catalog-head"><span className="callno" id="ready-title">{collection.exam ? 'Exam readiness' : 'Readiness'}</span><span className="callno">{collection.short}</span></div>
            <div className="readiness-body">
              <MemoryRing value={ready.score / 100} size={124} stroke={10} label="ready" />
              <div className="readiness-parts">
                {ready.parts.map((part) => (
                  <div key={part.id} className="experiment-mini-row wide">
                    <span className="small">{part.label}</span>
                    <span className="bar"><span style={{ width: `${Math.round(part.value * 100)}%` }} /></span>
                    <span className="xsmall tabular subtle">{part.detail || `${Math.round(part.value * 100)}%`}</span>
                  </div>
                ))}
                {collection.exam && (
                  <p className="xsmall subtle">
                    {ready.examAverage === null
                      ? 'Take a timed practice exam to measure readiness for real. Until then this estimate is capped at 60%.'
                      : collection.exam.note}
                  </p>
                )}
              </div>
            </div>
            {ready.exams.length > 0 && (
              <div className="exam-history">
                {ready.exams.map((exam) => (
                  <Link key={exam.id} to={`/quiz/result/${exam.id}`} className={`exam-pill${exam.score >= (collection.exam?.pass || 85) ? ' pass' : ''}`}>
                    <strong className="tabular">{exam.score}%</strong> <span className="xsmall">{formatRelative(exam.date, now)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <ol className="stage-list">
            {ready.reports.map((report, i) => {
              const { stage, topics, labs, challengeIds, projects } = report
              const done = report.progress >= 0.999
              return (
                <li key={stage.id} className={`stage${done ? ' done' : ''}`}>
                  <div className="stage-rail" aria-hidden="true"><span className="stage-num">{done ? <Check size={16} /> : i + 1}</span></div>
                  <section className="card stage-card" aria-labelledby={`stage-${stage.id}`}>
                    <div className="row between wrap">
                      <h2 className="section-title" id={`stage-${stage.id}`}>{stage.title}</h2>
                      <div className="row" style={{ gap: 6 }}>
                        {stage.weight && <span className="chip outline">{stage.weight}% of exam</span>}
                        <span className="chip">{Math.round(report.progress * 100)}%</span>
                      </div>
                    </div>
                    <div className="bar"><span style={{ width: `${report.progress * 100}%` }} /></div>
                    <p className="small muted">{stage.summary}</p>
                    {stage.milestone && <p className="xsmall stage-milestone"><Trophy size={12} /> Milestone: {stage.milestone}</p>}

                    <div className="stage-topics">
                      {topics.map(({ pack, summary, step }) => (
                        <Link key={pack.id} to={`/topic/${pack.id}`} className="stage-topic">
                          <Tile pack={pack} size="sm" />
                          <span className="grow">
                            <span className="list-title">{pack.name}</span>
                            <span className="xsmall subtle">{pack.lesson?.estimatedMinutes ? `${pack.lesson.estimatedMinutes} min lesson · ` : ''}{pack.questions.length} cards{summary?.dueCount ? ` · ${summary.dueCount} due` : ''}</span>
                          </span>
                          <StepPill step={step} />
                        </Link>
                      ))}
                      {topics.length === 0 && <p className="small subtle">Topics for this stage are on their way.</p>}
                    </div>

                    {(labs.length > 0 || challengeIds.length > 0 || projects.length > 0) && (
                      <div className="stage-practice">
                        {labs.length > 0 && (
                          <div className="stage-chip-group">
                            <span className="eyebrow"><Terminal size={12} /> Console labs · {report.labsDone}/{labs.length}</span>
                            <div className="row wrap" style={{ gap: 6 }}>
                              {labs.map((lab) => (
                                <Link key={lab.id} to={`/practice/lab/${lab.id}`} className={`lab-chip${practice.labs?.[lab.id] ? ' done' : ''}`}>
                                  {practice.labs?.[lab.id] ? <Check size={12} /> : <FlaskConical size={12} />} {lab.title}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                        {challengeIds.length > 0 && (
                          <div className="stage-chip-group">
                            <span className="eyebrow"><Code size={12} /> Coding challenges · {report.challengesSolved}/{challengeIds.length}</span>
                            <Link to={`/practice?tab=challenges&path=${collection.id}&stage=${stage.id}`} className="btn btn-sm">Solve challenges <ArrowRight size={14} /></Link>
                          </div>
                        )}
                        {projects.length > 0 && (
                          <div className="stage-chip-group">
                            <span className="eyebrow"><Hammer size={12} /> Projects</span>
                            <div className="row wrap" style={{ gap: 6 }}>
                              {projects.map((p) => (
                                <Link key={p.id} to={`/project/${p.id}`} className={`lab-chip${practice.projects?.[p.id]?.status === 'done' ? ' done' : ''}`}>{p.title}</Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {topics.some((t) => t.summary?.started) && (
                      <div className="row wrap">
                        <Link to={`/quiz/run?path=${collection.id}&stage=${stage.id}&mode=quiz&n=12`} className="btn btn-sm"><Layers size={14} /> Stage quiz</Link>
                      </div>
                    )}
                  </section>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {tab === 'recommended' && (
        <section className="path-resources" aria-labelledby="path-resources-title">
          <h2 className="section-title" id="path-resources-title">Recommended alongside Recurse</h2>
          <p className="small muted path-resources-intro">Everything this goal needs is already in the path. These outside books, courses, tools and practice sites are optional extras, free ones first, each with the reason it is worth your time.</p>
          {collection.resources?.length > 0 ? <ResourceList resources={collection.resources} why /> : <p className="small subtle">No outside resources are needed for this path.</p>}
          {topicResources.length > 0 && (
            <details className="path-topic-resources">
              <summary className="small">More from the topics in this path ({topicResources.length})</summary>
              <ResourceList resources={topicResources} />
            </details>
          )}
        </section>
      )}
    </div>
  )
}
