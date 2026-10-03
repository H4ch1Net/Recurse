import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronLeft, ClipboardList, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { SUBJECTS } from '../lib/subjects'
import { isChoiceType, sanitizePack, slugify } from '../lib/packSchema'
import { BUILT_IN_IDS } from '../lib/packs'
import { uid } from '../lib/random'
import { parseBulk } from '../lib/bulk'
import ImportDialog from '../components/ImportDialog'
import Modal from '../components/Modal'

const CARD_TYPES = [
  { id: 'recall', label: 'Flashcard', hint: 'Recall the answer, then grade yourself' },
  { id: 'typed', label: 'Type the answer', hint: 'Checked automatically' },
  { id: 'mcq', label: 'Multiple choice', hint: 'Pick one of several options' }
]

const blankCard = (type = 'recall') => ({ key: uid(), type, question: '', answer: '', accept: '', choices: ['', '', '', ''], correct: 0, explanation: '' })

function fromQuestion(q) {
  return {
    key: uid(),
    id: q.id,
    type: ['recall', 'typed', 'mcq'].includes(q.type) ? q.type : 'mcq',
    question: q.question,
    answer: typeof q.answer === 'string' ? q.answer : '',
    accept: (q.accept || []).join(', '),
    choices: Array.isArray(q.choices) ? [...q.choices, '', '', '', ''].slice(0, Math.max(4, q.choices.length)) : ['', '', '', ''],
    correct: typeof q.answer === 'number' ? q.answer : 0,
    explanation: q.explanation || '',
    original: q
  }
}


export default function Create() {
  const { packId } = useParams()
  const { packMap, savePack, toast, user } = useApp()
  const navigate = useNavigate()
  const existing = packId ? packMap.get(packId) : null
  useDocumentTitle(existing ? `Edit ${existing.name}` : 'Create a pack')

  const [name, setName] = useState(existing?.name || '')
  const [subject, setSubject] = useState(existing?.subject || user.interests[0] || 'humanities')
  const [level, setLevel] = useState(existing?.level || 'beginner')
  const [description, setDescription] = useState(existing?.description || '')
  const [icon, setIcon] = useState(existing?.icon || '')
  const [cards, setCards] = useState(() => (existing ? existing.questions.map(fromQuestion) : [blankCard(), blankCard()]))
  const [errors, setErrors] = useState([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkType, setBulkType] = useState('recall')
  const [importOpen, setImportOpen] = useState(false)
  const bulkRows = useMemo(() => parseBulk(bulkText), [bulkText])

  if (packId && (!existing || !existing.community)) return <Navigate to={packId && existing ? `/topic/${packId}` : '/create'} replace />

  const update = (key, patch) => setCards((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  const move = (index, delta) => setCards((list) => {
    const next = [...list]
    const target = index + delta
    if (target < 0 || target >= next.length) return list
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })

  const build = () => {
    const problems = []
    if (!name.trim()) problems.push('Give the pack a name.')
    const filled = cards.filter((c) => c.question.trim())
    if (!filled.length) problems.push('Add at least one card with a question.')
    filled.forEach((c, i) => {
      const n = cards.indexOf(c) + 1
      if (c.type === 'mcq') {
        const options = c.choices.map((x) => x.trim()).filter(Boolean)
        if (options.length < 2) problems.push(`Card ${n}: add at least two options.`)
        if (!c.choices[c.correct]?.trim()) problems.push(`Card ${n}: the option marked correct is empty.`)
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) problems.push(`Card ${n}: options must be different.`)
      } else if (!c.answer.trim()) problems.push(`Card ${n}: add an answer.`)
      void i
    })
    if (problems.length) return { problems }

    let id = existing?.id || slugify(name).slice(0, 48)
    if (!existing && (BUILT_IN_IDS.has(id) || packMap.has(id))) id = `${id}-${Date.now().toString(36).slice(-4)}`
    const used = new Set(filled.map((c) => c.id).filter(Boolean))
    let counter = 1
    const nextId = () => {
      let candidate
      do candidate = `${id}-c${String(counter++).padStart(2, '0')}`
      while (used.has(candidate))
      used.add(candidate)
      return candidate
    }
    const questions = filled.map((c) => {
      // Start from the original so fields the editor does not show (section, concept, code,
      // difficulty, fill-the-blank or find-the-bug type) survive an edit.
      const original = c.original || {}
      const keepChoiceType = c.type === 'mcq' && isChoiceType(original.type)
      const base = {
        ...original,
        id: c.id || nextId(),
        type: keepChoiceType ? original.type : c.type,
        difficulty: original.difficulty || 'medium',
        question: c.question.trim(),
        explanation: c.explanation.trim()
      }
      delete base.choices
      delete base.accept
      if (c.type === 'mcq') {
        const options = c.choices.map((x, i) => ({ text: x.trim(), i })).filter((o) => o.text)
        base.choices = options.map((o) => o.text)
        base.answer = options.findIndex((o) => o.i === c.correct)
      } else {
        base.answer = c.answer.trim()
        const accept = c.accept.split(',').map((s) => s.trim()).filter(Boolean)
        if (c.type === 'typed' && accept.length) base.accept = accept
      }
      return base
    })
    try {
      const pack = sanitizePack({
        ...(existing || {}),
        id,
        name: name.trim(),
        subject,
        level,
        description: description.trim(),
        icon: icon.trim() || name.trim().slice(0, 2),
        author: existing?.author || 'You',
        version: existing?.version || '1.0.0',
        questions
      })
      return { pack }
    } catch (e) {
      return { problems: [e.message] }
    }
  }

  const save = () => {
    const { pack, problems } = build()
    if (problems) {
      setErrors(problems)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    savePack(pack)
    toast(`${existing ? 'Saved' : 'Created'} “${pack.name}” with ${pack.questions.length} cards`, { tone: 'good' })
    navigate(`/topic/${pack.id}`)
  }

  const addBulk = () => {
    const rows = bulkRows.map((r) => ({ ...blankCard(bulkType), question: r.question, answer: r.answer }))
    setCards((list) => [...list.filter((c) => c.question.trim() || c.answer.trim()), ...rows])
    toast(`Added ${rows.length} cards`)
    setBulkOpen(false)
    setBulkText('')
  }

  return (
    <div className="page narrow">
      <Link to={existing ? `/topic/${existing.id}` : '/library'} className="back-link small"><ChevronLeft size={16} /> {existing ? existing.name : 'Library'}</Link>
      <div className="page-head">
        <div>
          <h1 className="page-title">{existing ? 'Edit pack' : 'Create a pack'}</h1>
          <p className="page-sub">Turn anything you need to remember into cards: vocabulary, formulas, exam notes, commands. Recurse schedules them like every other topic.</p>
        </div>
        {!existing && (
          <button type="button" className="btn" onClick={() => setImportOpen(true)}><Sparkles size={16} /> Generate or import</button>
        )}
      </div>

      {errors.length > 0 && (
        <div className="callout bad" role="alert" style={{ marginBottom: 'var(--s-5)' }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <section className="card stack" aria-labelledby="details-title">
        <h2 className="section-title" id="details-title">Details</h2>
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="p-name">Name</label>
            <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Organic chemistry reactions" maxLength={80} />
          </div>
          <div className="field">
            <label className="label" htmlFor="p-icon">Icon <span className="subtle">(1-3 characters)</span></label>
            <input id="p-icon" className="input" value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 3))} placeholder={name.slice(0, 2) || 'Oc'} />
          </div>
          <div className="field">
            <label className="label" htmlFor="p-subject">Subject</label>
            <select id="p-subject" className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="p-level">Level</label>
            <select id="p-level" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="p-desc">Description <span className="subtle">(optional)</span></label>
          <input id="p-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One sentence about what this covers" maxLength={200} />
        </div>
      </section>

      <section style={{ marginTop: 'var(--s-6)' }} aria-labelledby="cards-title">
        <div className="section-head">
          <h2 className="section-title" id="cards-title">Cards <span className="subtle">({cards.filter((c) => c.question.trim()).length})</span></h2>
          <button type="button" className="btn btn-sm" onClick={() => setBulkOpen(true)}><ClipboardList size={14} /> Paste a list</button>
        </div>
        <div className="stack">
          {cards.map((card, index) => (
            <article key={card.key} className="card editor-card" aria-label={`Card ${index + 1}`}>
              <div className="catalog-head wrap" style={{ marginBottom: 'var(--s-4)', flexWrap: 'wrap' }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="editor-num">{String(index + 1).padStart(2, '0')}</span>
                  <select className="select" style={{ width: 'auto', minHeight: 32 }} value={card.type} onChange={(e) => update(card.key, { type: e.target.value })} aria-label="Card type">
                    {CARD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <span className="xsmall subtle hide-mobile">{CARD_TYPES.find((t) => t.id === card.type)?.hint}</span>
                </div>
                <div className="row" style={{ gap: 2 }}>
                  <button type="button" className="icon-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={16} /></button>
                  <button type="button" className="icon-btn" onClick={() => move(index, 1)} disabled={index === cards.length - 1} aria-label="Move down"><ArrowDown size={16} /></button>
                  <button type="button" className="icon-btn" onClick={() => setCards((list) => list.filter((c) => c.key !== card.key))} aria-label="Delete card"><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="stack-sm">
                <textarea className="textarea" rows={2} style={{ minHeight: 64 }} value={card.question} onChange={(e) => update(card.key, { question: e.target.value })} placeholder="Question or prompt (front)" aria-label="Question" />
                {card.type === 'mcq' ? (
                  <div className="stack-sm">
                    {card.choices.map((choice, i) => (
                      <label key={i} className="row option-row">
                        <input type="radio" name={`correct-${card.key}`} checked={card.correct === i} onChange={() => update(card.key, { correct: i })} aria-label={`Option ${i + 1} is correct`} />
                        <input className="input" value={choice} onChange={(e) => update(card.key, { choices: card.choices.map((c, j) => (j === i ? e.target.value : c)) })} placeholder={i === card.correct ? 'Correct answer' : `Wrong option ${i + (i < card.correct ? 1 : 0)}`} />
                      </label>
                    ))}
                    <span className="hint">Select the correct option. Options are shuffled when you study.</span>
                  </div>
                ) : (
                  <>
                    <textarea className="textarea" rows={2} style={{ minHeight: 64 }} value={card.answer} onChange={(e) => update(card.key, { answer: e.target.value })} placeholder={card.type === 'typed' ? 'Exact answer, kept short' : 'Answer (back)'} aria-label="Answer" />
                    {card.type === 'typed' && (
                      <input className="input" value={card.accept} onChange={(e) => update(card.key, { accept: e.target.value })} placeholder="Other accepted answers, separated by commas (optional)" aria-label="Other accepted answers" />
                    )}
                  </>
                )}
                <input className="input" value={card.explanation} onChange={(e) => update(card.key, { explanation: e.target.value })} placeholder="Explanation shown after answering (optional, but it helps you learn)" aria-label="Explanation" />
              </div>
            </article>
          ))}
          <button type="button" className="btn btn-block add-card" onClick={() => setCards((list) => [...list, blankCard(list[list.length - 1]?.type)])}><Plus size={16} /> Add card</button>
        </div>
      </section>

      <div className="save-bar">
        <span className="small subtle">{cards.filter((c) => c.question.trim()).length} cards</span>
        <div className="row">
          <Link to={existing ? `/topic/${existing.id}` : '/library'} className="btn btn-ghost">Cancel</Link>
          <button type="button" className="btn btn-primary" onClick={save}>{existing ? 'Save changes' : 'Create pack'}</button>
        </div>
      </div>

      {bulkOpen && (
        <Modal
          title="Paste a list"
          description="One card per line. Separate front and back with a tab, ' | ' or ' ; '. Exports from Quizlet and Anki use tabs."
          onClose={() => setBulkOpen(false)}
          wide
          actions={
            <>
              <button type="button" className="btn" onClick={() => setBulkOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={addBulk} disabled={!bulkRows.length}>Add {bulkRows.length || ''} cards</button>
            </>
          }
        >
          <div className="stack">
            <textarea className="textarea mono small" rows={8} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'el perro | the dog\nla casa | the house\nCapital of Peru | Lima'} data-autofocus aria-label="Cards to add" />
            <div className="row wrap">
              <span className="small">Add as</span>
              <div className="segmented" role="group" aria-label="Card type for pasted cards">
                <button type="button" aria-pressed={bulkType === 'recall'} onClick={() => setBulkType('recall')}>Flashcards</button>
                <button type="button" aria-pressed={bulkType === 'typed'} onClick={() => setBulkType('typed')}>Type the answer</button>
              </div>
              <span className="xsmall subtle">{bulkRows.length} cards recognized</span>
            </div>
          </div>
        </Modal>
      )}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  )
}
