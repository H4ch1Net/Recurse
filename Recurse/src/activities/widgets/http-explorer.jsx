import { useEffect, useId, useRef, useState } from 'react'
import { Check, KeyRound, Lightbulb, Plus, Send, Trash2, Wand2, X } from 'lucide-react'
import { effectsLevel, feedbackSuccess } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { createServer, handleRequest, formatRequest, formatResponseHead, statusClass, STATUS_HELP, METHODS, BODY_METHODS, HOST, PRESETS, SCENARIOS, SCENARIO_IDS, scenarioFor } from '../lib/http-explorer.js'
import { parseJson } from '../lib/json-explorer.js'
import { gradeTasks } from '../lib/terminal/parse.js'
import './http-explorer.css'

let rowId = 0
const row = (name = '', value = '') => ({ id: ++rowId, name, value })

/** Color JSON text: keys, strings, numbers, booleans and null. */
function JsonText({ text }) {
  const out = []
  const re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const cls = t.startsWith('"') ? (m[2] ? 'http-j-key' : 'http-j-str') : /true|false/.test(t) ? 'http-j-bool' : t === 'null' ? 'http-j-null' : 'http-j-num'
    out.push(
      <span key={m.index} className={cls}>
        {t}
      </span>
    )
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const EXTRA_NOTES = {
  401: '401 vs 403: 401 means "who are you?", so credentials can fix it. 403 means "I know you, and no".',
  403: '401 vs 403: 401 means "who are you?", 403 means "I know who you are, and you still cannot do this".',
  201: 'POST created something new, so the answer is 201 rather than 200, with a Location header pointing at it.',
  204: 'No body at all: check the Content-Length of 0.',
  405: 'Read the Allow header: the server tells you which methods this path supports.',
  415: 'The body might be perfect JSON, but without Content-Type the server cannot know that.'
}

/** Build HTTP requests against a mock REST API and read the raw exchange. */
export default function HttpExplorer({ props, onComplete, standalone }) {
  const [scenario, setScenario] = useState(() => scenarioFor(props.scenario))
  return (
    <div className="http">
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
      <HttpScenario key={scenario} scenario={scenario} onComplete={onComplete} />
    </div>
  )
}

function HttpScenario({ scenario, onComplete }) {
  const spec = SCENARIOS[scenario]
  const [server, setServer] = useState(() => createServer())
  const [method, setMethod] = useState('GET')
  const [path, setPath] = useState('/api/tasks')
  const [headers, setHeaders] = useState(() => [row('Accept', 'application/json')])
  const [body, setBody] = useState('')
  const [phase, setPhase] = useState('idle')
  const [exchange, setExchange] = useState(null)
  const [history, setHistory] = useState([])
  const [done, setDone] = useState(() => new Set())
  const [caption, setCaption] = useState({ text: spec.intro, tone: '' })
  const timer = useRef(null)
  const taskRefs = useRef({})
  const finished = useRef(false)
  const ids = { method: useId(), path: useId(), body: useId() }

  useEffect(() => () => clearTimeout(timer.current), [])

  const total = spec.tasks.length
  const current = spec.ordered ? spec.tasks.find((t) => !done.has(t.id)) : null
  const takesBody = BODY_METHODS.includes(method)
  const bodyCheck = takesBody && body.trim() ? parseJson(body) : null
  const token = [...server.log].reverse().find((e) => e.token)?.token ?? null
  const authRow = headers.find((h) => h.name.trim().toLowerCase() === 'authorization')
  const hasJsonType = headers.some((h) => h.name.trim().toLowerCase() === 'content-type')

  const load = (req) => {
    sfx.tap()
    setMethod(req.method)
    setPath(req.path)
    setHeaders(req.headers.length ? req.headers.map((h) => row(h.name, h.value)) : [row('Accept', 'application/json')])
    setBody(req.body)
  }

  const send = () => {
    if (phase === 'sending') return
    const req = { method, path, headers: headers.map(({ name, value }) => ({ name, value })), body: takesBody ? body : '' }
    const raw = formatRequest(req)
    const r = handleRequest(server, req)
    sfx.tap()
    setPhase('sending')
    setExchange({ raw, response: null, entry: null })
    clearTimeout(timer.current)
    const delay = effectsLevel() === 'full' ? 380 : 60
    timer.current = setTimeout(() => {
      setServer(r.server)
      setPhase('done')
      setExchange({ raw, response: r.response, entry: r.entry })
      setHistory((h) => [{ id: r.entry.seq, status: r.response.status, req }, ...h].slice(0, 30))
      const cls = statusClass(r.response.status).id
      if (cls === '2xx' || cls === '3xx') sfx.pop()
      else sfx.error()

      const nextDone = new Set(done)
      const fresh = gradeTasks(spec.tasks, r.server, nextDone, { ordered: spec.ordered })
      if (fresh.length) {
        setDone(nextDone)
        fresh.forEach((id, i) => setTimeout(() => feedbackSuccess(taskRefs.current[id], i === fresh.length - 1 ? 'Step done' : null), i * 180))
        if (nextDone.size === total && !finished.current) {
          finished.current = true
          setCaption({ text: 'All done. Every web and mobile app talks to its server with requests exactly like these.', tone: 'good' })
          onComplete({ score: 1 })
          return
        }
        const last = spec.tasks.find((t) => t.id === fresh[fresh.length - 1])
        setCaption({ text: `Done: ${last.text}.`, tone: 'good' })
      } else setCaption({ text: '', tone: '' })
    }, delay)
  }

  const setHeader = (id, patch) => setHeaders((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)))
  const addToken = () => {
    sfx.tap()
    if (authRow) setHeader(authRow.id, { value: `Bearer ${token}` })
    else setHeaders((hs) => [...hs, row('Authorization', `Bearer ${token}`)])
  }
  const formatBody = () => {
    if (!bodyCheck?.ok) return
    sfx.tap()
    setBody(JSON.stringify(bodyCheck.value, null, 2))
  }

  const res = exchange?.response
  const cls = res ? statusClass(res.status) : null
  const createdId = exchange?.entry?.createdId

  return (
    <div className="http-body">
      <div className="http-head">
        <span className="chip accent">{spec.title}</span>
        <span className="grow" />
        <span className="chip outline tabular" aria-label={`${done.size} of ${total} tasks done`}>
          {done.size} / {total}
        </span>
      </div>
      <p className={`w-feedback http-caption ${caption.tone}`} aria-live="polite">
        {caption.text}
      </p>

      <div className="http-presets">
        <span className="xsmall subtle">Start from</span>
        {spec.presets.map((k) => (
          <button key={k} type="button" className="http-preset" onClick={() => load(PRESETS[k])}>
            <span className={`http-m http-m-${PRESETS[k].method.toLowerCase()}`}>{PRESETS[k].method}</span> {PRESETS[k].label}
          </button>
        ))}
      </div>

      <form
        className="http-builder"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <div className="http-line">
          <label htmlFor={ids.method} className="sr-only">
            Method
          </label>
          <select id={ids.method} className={`select http-method http-m-${method.toLowerCase()}`} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <div className="http-url">
            <span className="http-host" aria-hidden="true">
              https://{HOST}
            </span>
            <label htmlFor={ids.path} className="sr-only">
              Path
            </label>
            <input id={ids.path} className="http-path" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="off" />
          </div>
          <button type="submit" className="btn btn-primary http-send" disabled={phase === 'sending'}>
            <Send size={15} /> Send
          </button>
        </div>

        <fieldset className="http-section">
          <legend>Headers</legend>
          <div className="http-headers">
            {headers.map((h) => (
              <div key={h.id} className="http-header-row">
                <input className="input http-hname" value={h.name} placeholder="Name" aria-label="Header name" onChange={(e) => setHeader(h.id, { name: e.target.value })} spellCheck={false} />
                <input className="input http-hvalue" value={h.value} placeholder="Value" aria-label={`Value for ${h.name || 'header'}`} onChange={(e) => setHeader(h.id, { value: e.target.value })} spellCheck={false} />
                <button type="button" className="http-icon-btn" aria-label={`Remove ${h.name || 'header'}`} onClick={() => setHeaders((hs) => hs.filter((x) => x.id !== h.id))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="row wrap http-header-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHeaders((hs) => [...hs, row()])}>
              <Plus size={14} /> Add header
            </button>
            {takesBody && !hasJsonType && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHeaders((hs) => [...hs, row('Content-Type', 'application/json')])}>
                <Plus size={14} /> Content-Type: application/json
              </button>
            )}
            {token && authRow?.value !== `Bearer ${token}` && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={addToken}>
                <KeyRound size={14} /> Add Authorization: Bearer token
              </button>
            )}
          </div>
        </fieldset>

        <fieldset className="http-section">
          <legend>Body</legend>
          {takesBody ? (
            <>
              <label htmlFor={ids.body} className="sr-only">
                JSON body
              </label>
              <textarea
                id={ids.body}
                className="textarea mono http-bodytext"
                value={body}
                rows={4}
                placeholder={'{\n  "title": "..."\n}'}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    send()
                  }
                }}
                spellCheck={false}
              />
              <div className="row wrap http-body-status">
                {!body.trim() ? (
                  <span className="xsmall subtle">Empty body.</span>
                ) : bodyCheck?.ok ? (
                  <span className="xsmall http-ok">
                    <Check size={12} /> Valid JSON
                  </span>
                ) : (
                  <span className="xsmall http-bad">
                    <X size={12} /> Line {bodyCheck.error.line}, column {bodyCheck.error.column}: {bodyCheck.error.message}
                  </span>
                )}
                <span className="grow" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={formatBody} disabled={!bodyCheck?.ok}>
                  <Wand2 size={14} /> Format
                </button>
              </div>
            </>
          ) : (
            <p className="xsmall subtle http-nobody">{method} requests do not carry a body. Switch to POST, PUT or PATCH to send one.</p>
          )}
        </fieldset>
      </form>

      {exchange && (
        <div className={`http-exchange${phase === 'sending' ? ' sending' : ''}`}>
          <section className="http-wire" aria-label="Request as sent">
            <div className="http-panel-title">Request on the wire</div>
            <pre className="http-pre">{exchange.raw}</pre>
            <div className="http-travel" aria-hidden="true">
              <span />
            </div>
          </section>
          <section className="http-response" aria-label="Response" aria-busy={phase === 'sending'}>
            <div className="http-panel-title">Response</div>
            {phase === 'sending' || !res ? (
              <p className="small subtle http-waiting">Waiting for {HOST}...</p>
            ) : (
              <>
                <div className={`http-status s${cls.id}`} aria-live="polite">
                  <span className="http-code">{res.status}</span>
                  <span className="http-status-text">{res.statusText}</span>
                  <span className="http-class">{cls.label}</span>
                </div>
                <p className="small http-explain">
                  {STATUS_HELP[res.status]} {EXTRA_NOTES[res.status] ?? ''}
                  {createdId ? ` Your new task has id ${createdId}.` : ''}
                </p>
                <pre className="http-pre http-headers-out">{formatResponseHead(res)}</pre>
                {res.body ? (
                  <pre className="http-pre http-json">
                    <JsonText text={res.body} />
                  </pre>
                ) : (
                  <p className="xsmall subtle">(no body)</p>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <div className="http-lower">
        <ol className="w-tasks http-tasks" aria-label="Tasks">
          {spec.tasks.map((t) => {
            const isDone = done.has(t.id)
            const showHint = spec.ordered ? current?.id === t.id : !isDone
            return (
              <li key={t.id} ref={(el) => (taskRefs.current[t.id] = el)} className={`w-task${isDone ? ' done' : ''}${spec.ordered && current?.id === t.id ? ' http-current' : ''}`}>
                <span className="w-task-mark" aria-hidden="true">
                  {isDone && <Check size={13} strokeWidth={3} />}
                </span>
                <span>
                  {t.text}
                  <span className="sr-only">{isDone ? ' (done)' : ''}</span>
                  {showHint && (
                    <span className="w-task-hint">
                      <Lightbulb size={12} aria-hidden="true" /> {t.hint}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
        {history.length > 0 && (
          <section className="http-history" aria-label="Request history">
            <div className="http-panel-title">History (tap to reuse)</div>
            <ul>
              {history.map((h) => (
                <li key={h.id}>
                  <button type="button" className="http-history-item" onClick={() => load(h.req)}>
                    <span className={`http-badge s${statusClass(h.status).id}`}>{h.status}</span>
                    <span className={`http-m http-m-${h.req.method.toLowerCase()}`}>{h.req.method}</span>
                    <span className="mono http-history-path">{h.req.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
