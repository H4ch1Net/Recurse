import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Search } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { COLLECTIONS } from '../lib/collections'
import { buildGlossary, groupByLetter, limitToTopics, searchGlossary } from '../lib/glossary'
import { Inline } from '../components/RichText'
import PathIcon from '../components/PathIcon'
import EmptyState from '../components/EmptyState'

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']
const pathTopics = (collection) => collection.stages.flatMap((s) => s.topics)

/** Every key term from every topic, searchable, filterable by path, with a self-quiz mode. */
export default function Glossary() {
  useDocumentTitle('Glossary')
  const { packs } = useApp()
  const [query, setQuery] = useState('')
  const [pathId, setPathId] = useState('all')
  const [hide, setHide] = useState(false)
  const [revealed, setRevealed] = useState({})
  const deferredQuery = useDeferredValue(query)

  const all = useMemo(() => buildGlossary(packs), [packs])
  const path = COLLECTIONS.find((c) => c.id === pathId)
  const scoped = useMemo(() => (path ? limitToTopics(all, pathTopics(path)) : all), [all, path])
  const shown = useMemo(() => searchGlossary(scoped, deferredQuery), [scoped, deferredQuery])
  const groups = useMemo(() => groupByLetter(shown), [shown])
  const letters = new Set(groups.map(([letter]) => letter))

  const jump = (letter) => document.getElementById(`letter-${letter === '#' ? 'num' : letter}`)?.scrollIntoView({ block: 'start' })
  const toggleHide = () => {
    setHide((v) => !v)
    setRevealed({})
  }

  return (
    <div className="page glossary-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Reference</div>
          <h1 className="page-title">Glossary</h1>
          <p className="page-sub">Every key term from every lesson in one place: {all.length.toLocaleString()} terms. Search it, narrow it to a path, or hide the definitions and quiz yourself.</p>
        </div>
      </div>

      <div className="glossary-controls">
        <div className="search grow">
          <Search size={16} />
          <input className="input" type="search" placeholder="Search terms and definitions" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the glossary" />
        </div>
        <button type="button" className="btn" onClick={toggleHide} aria-pressed={hide}>
          {hide ? <Eye size={16} /> : <EyeOff size={16} />} {hide ? 'Show definitions' : 'Quiz me'}
        </button>
      </div>

      <div className="glossary-paths" role="group" aria-label="Limit to a path">
        <button type="button" className="path-badge" aria-pressed={pathId === 'all'} onClick={() => setPathId('all')}>All topics</button>
        {COLLECTIONS.map((c) => (
          <button key={c.id} type="button" className="path-badge" style={{ '--hue': c.hue }} aria-pressed={pathId === c.id} onClick={() => setPathId(c.id)}>
            <PathIcon collection={c} size="sm" /> {c.short}
          </button>
        ))}
      </div>

      <nav className="glossary-letters" aria-label="Jump to a letter">
        {ALPHABET.map((letter) => (
          <button key={letter} type="button" disabled={!letters.has(letter)} onClick={() => jump(letter)} aria-label={letter === '#' ? 'Numbers and symbols' : `Letter ${letter}`}>
            {letter}
          </button>
        ))}
      </nav>

      <p className="xsmall subtle glossary-count" aria-live="polite">
        {shown.length === scoped.length ? `${scoped.length.toLocaleString()} terms` : `${shown.length.toLocaleString()} of ${scoped.length.toLocaleString()} terms`}
        {path ? ` in ${path.name}` : ''}
      </p>

      {groups.length === 0 ? (
        <EmptyState title="No terms match">Try a shorter search or a different path.</EmptyState>
      ) : (
        groups.map(([letter, entries]) => (
          <section key={letter} id={`letter-${letter === '#' ? 'num' : letter}`} className="glossary-group">
            <h2 className="glossary-letter">{letter}</h2>
            <dl className="terms glossary-terms">
              {entries.map((entry) => {
                const [first, ...others] = entry.sources
                const hidden = hide && !revealed[entry.key]
                return (
                  <div key={entry.key}>
                    <dt>{entry.term}</dt>
                    {hidden ? (
                      <dd>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevealed((r) => ({ ...r, [entry.key]: true }))}>Say it, then reveal</button>
                      </dd>
                    ) : (
                      <dd className={hide ? 'rise' : ''}>
                        <Inline text={first.definition} />
                        <span className="glossary-sources xsmall">
                          <Link to={`/topic/${first.packId}/lesson#key-terms`}>{first.packName}</Link>
                          {others.map((s) => (
                            <span key={s.packId}> · <Link to={`/topic/${s.packId}/lesson#key-terms`} title={s.definition}>{s.packName}</Link></span>
                          ))}
                        </span>
                      </dd>
                    )}
                  </div>
                )
              })}
            </dl>
          </section>
        ))
      )}
    </div>
  )
}
