import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search, Upload } from 'lucide-react'
import { useApp } from '../state/context'
import { useHotkeys } from '../hooks/useHotkeys'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { SUBJECTS, subjectLabel } from '../lib/subjects'
import { missingPrereqs } from '../lib/recommend'
import TopicCard from '../components/TopicCard'
import EmptyState from '../components/EmptyState'
import ImportDialog from '../components/ImportDialog'

const STATUSES = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'Not started' },
  { id: 'started', label: 'In progress' },
  { id: 'due', label: 'Due' },
  { id: 'mastered', label: 'Mastered' }
]

const SORTS = [
  { id: 'path', label: 'Learning path' },
  { id: 'name', label: 'Name' },
  { id: 'memory', label: 'Weakest memory' },
  { id: 'due', label: 'Most due' },
  { id: 'recent', label: 'Recently studied' }
]

function matchesStatus(summary, status) {
  if (status === 'new') return !summary.started
  if (status === 'started') return summary.started
  if (status === 'due') return summary.dueCount > 0
  if (status === 'mastered') return summary.status === 'mastered'
  return true
}

export default function Library() {
  useDocumentTitle('Library')
  const { packs, packMap, summaries } = useApp()
  const [params, setParams] = useSearchParams()
  const [importOpen, setImportOpen] = useState(false)
  const searchRef = useRef(null)
  const query = params.get('q') || ''
  const subject = params.get('subject') || 'all'
  const status = params.get('status') || 'all'
  const sort = params.get('sort') || 'path'

  useHotkeys({ '/': () => searchRef.current?.focus() })

  const setParam = (key, value, fallback) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (!value || value === fallback) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  // The input is driven by local state so fast typing never lags behind URL updates.
  const [text, setText] = useState(query)
  useEffect(() => {
    const id = setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (text.trim()) next.set('q', text)
        else next.delete('q')
        return next
      }, { replace: true })
    }, 250)
    return () => clearTimeout(id)
  }, [text, setParams])

  const filtered = useMemo(() => {
    const terms = text.toLowerCase().split(/\s+/).filter(Boolean)
    const list = packs.filter((pack) => {
      const summary = summaries.get(pack.id)
      if (subject !== 'all' && pack.subject !== subject) return false
      if (!matchesStatus(summary, status)) return false
      if (!terms.length) return true
      const haystack = [pack.name, pack.description, subjectLabel(pack.subject), ...(pack.tags || []), ...(pack.lesson?.keyTerms || []).map((t) => t.term)]
        .join(' ')
        .toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
    const s = (pack) => summaries.get(pack.id)
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'memory') list.sort((a, b) => (s(a).memory ?? 2) - (s(b).memory ?? 2))
    if (sort === 'due') list.sort((a, b) => s(b).dueCount - s(a).dueCount)
    if (sort === 'recent') list.sort((a, b) => new Date(s(b).lastStudied || 0) - new Date(s(a).lastStudied || 0))
    return list
  }, [packs, summaries, text, subject, status, sort])

  const counts = useMemo(() => {
    const map = { all: packs.length }
    for (const pack of packs) map[pack.subject] = (map[pack.subject] || 0) + 1
    return map
  }, [packs])

  const grouped = sort === 'path' && subject === 'all' && !text.trim()
  const groups = grouped
    ? SUBJECTS.map((s) => ({ subject: s, packs: filtered.filter((p) => p.subject === s.id) })).filter((g) => g.packs.length)
    : [{ subject: null, packs: filtered }]
  const totalCards = packs.reduce((sum, p) => sum + p.questions.length, 0)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="page-sub">{packs.length} topics and {totalCards} cards across {Object.keys(counts).length - 1} subjects. Every topic has a short lesson and a question bank.</p>
        </div>
        <div className="row wrap">
          <button type="button" className="btn" onClick={() => setImportOpen(true)}><Upload size={16} /> Import</button>
          <Link to="/create" className="btn btn-primary"><Plus size={16} /> Create a pack</Link>
        </div>
      </div>

      <div className="library-controls">
        <div className="search grow">
          <Search size={16} />
          <input
            ref={searchRef}
            className="input"
            type="search"
            placeholder="Search topics, terms, tags"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setText(''), e.currentTarget.blur())}
            aria-label="Search topics"
          />
          {!text && <span className="kbd hide-mobile">/</span>}
        </div>
        <div className="row wrap library-selects">
          <div className="segmented" role="group" aria-label="Filter by status">
            {STATUSES.map((s) => (
              <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => setParam('status', s.id, 'all')}>{s.label}</button>
            ))}
          </div>
          <label className="row" style={{ gap: 8 }}>
            <span className="small subtle">Sort</span>
            <select className="select" style={{ width: 'auto', minHeight: 36 }} value={sort} onChange={(e) => setParam('sort', e.target.value, 'path')}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="chip-scroller" role="group" aria-label="Filter by subject">
        <button type="button" className="filter-chip" aria-pressed={subject === 'all'} onClick={() => setParam('subject', 'all', 'all')}>
          All <span className="n">{counts.all}</span>
        </button>
        {SUBJECTS.filter((s) => counts[s.id]).map((s) => (
          <button key={s.id} type="button" className="filter-chip" style={{ '--hue': s.hue }} aria-pressed={subject === s.id} onClick={() => setParam('subject', s.id, 'all')}>
            <span className="swatch" aria-hidden="true" /> {s.label} <span className="n">{counts[s.id]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            art="search"
            title="No topics match"
            action={<button type="button" className="btn" onClick={() => { setText(''); setParams({}, { replace: true }) }}>Clear filters</button>}
          >
            Try a different search, or create a pack for this topic yourself.
          </EmptyState>
        </div>
      ) : (
        <div className="stack-lg">
          {groups.map(({ subject: s, packs: list }) => (
            <section key={s?.id || 'results'} aria-label={s?.label || 'Results'}>
              {s ? (
                <div className="subject-head" style={{ '--hue': s.hue }}>
                  <span className="code">{s.code}</span>
                  <h2>{s.label}</h2>
                  <span className="callno">{list.length} {list.length === 1 ? 'topic' : 'topics'}</span>
                  <p>{s.blurb}</p>
                </div>
              ) : (
                <div className="section-head light" role="status">
                  <span className="callno">{list.length} {list.length === 1 ? 'topic' : 'topics'}</span>
                </div>
              )}
              <div className="grid-cards">
                {list.map((pack) => (
                  <TopicCard key={pack.id} pack={pack} summary={summaries.get(pack.id)} missing={missingPrereqs(pack, packMap, summaries)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  )
}
