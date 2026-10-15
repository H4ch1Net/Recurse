import { BookOpen, ExternalLink, FileText, GraduationCap, Newspaper, PlayCircle, Target, Wrench } from 'lucide-react'

const KINDS = {
  docs: { icon: FileText, label: 'Docs' },
  book: { icon: BookOpen, label: 'Book' },
  course: { icon: GraduationCap, label: 'Course' },
  video: { icon: PlayCircle, label: 'Video' },
  practice: { icon: Target, label: 'Practice' },
  tool: { icon: Wrench, label: 'Tool' },
  article: { icon: Newspaper, label: 'Article' }
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Outside resources (books, courses, docs, practice sites), each opening in a new tab. */
export default function ResourceList({ resources, why = false }) {
  if (!resources?.length) return null
  return (
    <ul className="resource-list">
      {resources.map((r) => {
        const kind = KINDS[r.kind] || KINDS.docs
        const Icon = kind.icon
        const host = hostOf(r.url)
        return (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="resource">
              <span className="resource-icon" aria-hidden="true"><Icon size={16} /></span>
              <span className="grow">
                <span className="resource-title">{r.title} <ExternalLink size={12} aria-label="opens in a new tab" /></span>
                {r.note && <span className="resource-note">{why && <strong>Why: </strong>}{r.note}</span>}
                <span className="resource-meta">{kind.label}{host ? ` · ${host}` : ''}</span>
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}
