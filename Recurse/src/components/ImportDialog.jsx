import { useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FileJson, Link2, Sparkles, ClipboardPaste, Loader2 } from 'lucide-react'
import Modal from './Modal'
import { useApp } from '../state/context'
import { sanitizePack } from '../lib/packSchema'
import { BUILT_IN_IDS } from '../lib/packs'
import { generatePack, isAIConfigured, PROVIDERS } from '../lib/ai'
import { QUESTION_TYPE_LABELS, subjectLabel } from '../lib/subjects'

const MODES = [
  { id: 'ai', label: 'Generate', icon: Sparkles },
  { id: 'url', label: 'From URL', icon: Link2 },
  { id: 'file', label: 'File', icon: FileJson },
  { id: 'paste', label: 'Paste', icon: ClipboardPaste }
]

function typeCounts(pack) {
  const counts = {}
  for (const q of pack.questions) counts[q.type] = (counts[q.type] || 0) + 1
  return Object.entries(counts).map(([type, n]) => `${n} ${QUESTION_TYPE_LABELS[type]?.toLowerCase() || type}`).join(', ')
}

export default function ImportDialog({ onClose, initialMode }) {
  const { ai, packs, savePack, toast } = useApp()
  const navigate = useNavigate()
  const configured = isAIConfigured(ai)
  const [mode, setMode] = useState(initialMode || (configured ? 'ai' : 'url'))
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState('beginner')
  const [count, setCount] = useState(12)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)
  const abortRef = useRef(null)

  const load = async () => {
    setError('')
    setBusy(true)
    try {
      let raw
      if (mode === 'url') {
        if (!/^https:\/\//i.test(url.trim())) throw new Error('Use an https:// link to a raw JSON file.')
        const response = await fetch(url.trim())
        if (!response.ok) throw new Error(`Could not download the pack (status ${response.status}).`)
        raw = await response.json().catch(() => {
          throw new Error('That link did not return JSON. For GitHub, use the Raw file link.')
        })
      } else if (mode === 'file') {
        const file = fileRef.current?.files?.[0]
        if (!file) throw new Error('Choose a .json file first.')
        if (file.size > 2_000_000) throw new Error('That file is larger than 2 MB.')
        raw = JSON.parse(await file.text())
      } else if (mode === 'paste') {
        if (!text.trim()) throw new Error('Paste the pack JSON first.')
        raw = JSON.parse(text)
      } else {
        if (!topic.trim()) throw new Error('Describe the topic you want to learn.')
        abortRef.current = new AbortController()
        const pack = await generatePack(ai, { topic: topic.trim(), level, count, notes: notes.trim() }, abortRef.current.signal)
        setPreview(pack)
        return
      }
      setPreview(sanitizePack(raw))
    } catch (e) {
      setError(e instanceof SyntaxError ? 'That is not valid JSON.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    let pack = preview
    if (BUILT_IN_IDS.has(pack.id) || packs.some((p) => p.id === pack.id && !p.community)) {
      pack = { ...pack, id: `${pack.id.slice(0, 52)}-custom` }
    }
    const replacing = packs.some((p) => p.id === pack.id)
    savePack(pack)
    toast(`${replacing ? 'Updated' : 'Added'} “${pack.name}” with ${pack.questions.length} cards`, { tone: 'good' })
    onClose()
    navigate(`/topic/${pack.id}`)
  }

  if (preview) {
    const replacing = packs.some((p) => p.id === preview.id && p.community)
    return (
      <Modal
        key="preview"
        title="Review the pack"
        description="Check it looks right before adding it to your library."
        onClose={onClose}
        wide
        actions={
          <>
            <button type="button" className="btn" onClick={() => setPreview(null)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={confirm} data-autofocus>{replacing ? 'Replace existing pack' : 'Add to library'}</button>
          </>
        }
      >
        <div className="stack">
          <div>
            <h3 className="section-title">{preview.name}</h3>
            <p className="small muted">{preview.description || 'No description.'}</p>
            <p className="xsmall subtle" style={{ marginTop: 4 }}>
              {subjectLabel(preview.subject)} · {preview.questions.length} cards ({typeCounts(preview)}) · {preview.lesson ? `${preview.lesson.sections.length}-section lesson` : 'no lesson'}
            </p>
          </div>
          {replacing && <div className="callout warn">A pack with this id is already in your library. Adding replaces it; progress on matching cards is kept.</div>}
          <div className="card flat tight preview-list">
            <ol>
              {preview.questions.slice(0, 8).map((q) => <li key={q.id} className="small">{q.question}</li>)}
            </ol>
            {preview.questions.length > 8 && <p className="xsmall subtle">and {preview.questions.length - 8} more</p>}
          </div>
          {preview.author === 'AI generated' && (
            <p className="xsmall subtle">AI-written content can contain mistakes. You can edit any card after adding the pack.</p>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal key="form" title="Add a pack" description="Bring in a pack someone shared, or generate one for any topic." onClose={onClose} wide>
      <div className="stack">
        <div className="segmented" role="tablist" aria-label="Import method">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setError('') }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {mode === 'ai' && (
          configured ? (
            <div className="stack">
              <div className="field">
                <label className="label" htmlFor="gen-topic">What do you want to learn?</label>
                <input id="gen-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. The Krebs cycle, Rust ownership, Baroque music" data-autofocus />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="label" htmlFor="gen-level">Level</label>
                  <select id="gen-level" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="gen-count">Questions</label>
                  <select id="gen-count" className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                    {[8, 12, 16, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="gen-notes">Focus <span className="subtle">(optional)</span></label>
                <input id="gen-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. for my biology exam, skip the history" />
              </div>
              <p className="xsmall subtle">Uses your {PROVIDERS[ai.provider]?.label} key. Generation can take up to a minute.</p>
            </div>
          ) : (
            <div className="callout info">
              <span>AI generation needs an API key from Anthropic, OpenAI or OpenRouter. <Link to="/settings#ai" onClick={onClose}>Add one in Settings</Link>, or <Link to="/create" onClick={onClose}>write a pack by hand</Link>.</span>
            </div>
          )
        )}
        {mode === 'url' && (
          <div className="field">
            <label className="label" htmlFor="imp-url">Link to a pack JSON file</label>
            <input id="imp-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://raw.githubusercontent.com/user/repo/main/pack.json" data-autofocus />
            <span className="hint">The file must follow the Recurse pack format. On GitHub, open the file and use the Raw link.</span>
          </div>
        )}
        {mode === 'file' && (
          <div className="field">
            <label className="label" htmlFor="imp-file">Pack file</label>
            <input id="imp-file" ref={fileRef} className="input" type="file" accept="application/json,.json" />
            <span className="hint">A .json pack exported from Recurse or written by hand.</span>
          </div>
        )}
        {mode === 'paste' && (
          <div className="field">
            <label className="label" htmlFor="imp-text">Pack JSON</label>
            <textarea id="imp-text" className="textarea mono small" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"id": "my-pack", "name": "My pack", "questions": [...]}' />
          </div>
        )}

        {error && <div className="callout bad" role="alert">{error}</div>}

        <div className="modal-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn" onClick={() => { abortRef.current?.abort(); onClose() }}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={load} disabled={busy || (mode === 'ai' && !configured)}>
            {busy ? <><Loader2 size={16} className="spin" /> {mode === 'ai' ? 'Generating' : 'Loading'}</> : mode === 'ai' ? 'Generate pack' : 'Continue'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
