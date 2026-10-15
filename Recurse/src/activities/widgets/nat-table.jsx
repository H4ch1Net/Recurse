import { useRef, useState } from 'react'
import { Check, Eraser, Send } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import {
  HOSTS,
  INSIDE_IF,
  MODES,
  MODE_HELP,
  MODE_LABEL,
  OUTSIDE_IF,
  POOL,
  QUIZ,
  SERVER,
  TERMS,
  TERM_KEYS,
  checkQuiz,
  clearTranslations,
  configFor,
  initialNat,
  poolUsage,
  sendFlow
} from '../lib/nat-table'
import { useNarrow } from '../lib/use-width'
import './nat-table.css'

// Diagram (viewBox 0 0 400 214).
const PC = HOSTS.map((h, i) => ({ id: h.id, x: 56, y: 30 + i * 51 }))
const SW = { x: 128, y: 107 }
const R1 = { x: 206, y: 107 }
const NET = { x: 290, y: 107 }
const SRV = { x: 364, y: 107 }
const DESKTOP = { PC, SW, R1, NET, SRV }
// Phone diagram (viewBox 0 0 300 362): inside on top, outside below, labels big enough to read.
const PHONE = {
  PC: HOSTS.map((h, i) => ({ id: h.id, x: 45 + i * 70, y: 62 })),
  SW: { x: 150, y: 134 },
  R1: { x: 150, y: 206 },
  NET: { x: 150, y: 266 },
  SRV: { x: 150, y: 332 }
}
const SPEEDS = [0.5, 1, 2]

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const pause = (ms, speed) => new Promise((r) => setTimeout(r, reducedMotion() ? 60 : ms / speed))

function fly(node, pts, speed) {
  if (!node?.animate || pts.length < 2) return Promise.resolve()
  node.getAnimations().forEach((a) => a.cancel())
  const d = [0]
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = d[d.length - 1] || 1
  const frames = pts.map((p, i) => ({ transform: `translate(${p.x}px, ${p.y}px)`, opacity: 1, offset: d[i] / total }))
  return node.animate(frames, { duration: reducedMotion() ? 120 : Math.max(420, (total * 5.5) / speed), easing: 'cubic-bezier(0.4, 0, 0.3, 1)', fill: 'forwards' }).finished.catch(() => {})
}

function drop(node, p) {
  if (!node?.animate) return Promise.resolve()
  node.getAnimations().forEach((a) => a.cancel())
  return node
    .animate(
      [
        { transform: `translate(${p.x}px, ${p.y}px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${p.x}px, ${p.y + 34}px) rotate(24deg)`, opacity: 0 }
      ],
      { duration: reducedMotion() ? 120 : 650, easing: 'ease-in', fill: 'forwards' }
    )
    .finished.catch(() => {})
}

function PcGlyph({ x, y, active, label, sub, onSend, phone }) {
  return (
    <g
      className={`nat-dev nat-pc${active ? ' active' : ''}`}
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={`Send a flow from ${label}`}
      onClick={onSend}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSend()
        }
      }}
    >
      {phone ? <rect x="-33" y="-50" width="66" height="72" className="nat-hit" /> : <rect x="-26" y="-22" width="52" height="44" className="nat-hit" />}
      <rect x="-14" y="-13" width="28" height="19" rx="3" className="nat-dev-body" />
      <path d="M0 6 V11 M-7 12 H7" className="nat-dev-mark" />
      {phone ? (
        <>
          <text y="-34" className="nat-dev-name" textAnchor="middle">{label}</text>
          <text y="-19" className="nat-dev-sub" textAnchor="middle">{sub}</text>
        </>
      ) : (
        <>
          <text x="-22" y="-2" className="nat-dev-name" textAnchor="end">{label}</text>
          <text x="-22" y="10" className="nat-dev-sub" textAnchor="end">{sub}</text>
        </>
      )}
    </g>
  )
}

function Topology({ packetRef, activeHost, onSend, flash, phone }) {
  const { PC, SW, R1, NET, SRV } = phone ? PHONE : DESKTOP
  return (
    <svg className={`nat-topo${phone ? ' phone' : ''}`} viewBox={phone ? '0 0 300 362' : '0 0 400 214'} role="group" aria-label="Four inside PCs on a switch, router R1 with its inside interface Gi0/0 and outside interface Gi0/1, the internet, and a web server at 198.51.100.80.">
      {phone ? (
        <>
          <rect x="0" y="0" width="300" height={R1.y} className="nat-zone inside" />
          <rect x="0" y={R1.y} width="300" height={362 - R1.y} className="nat-zone outside" />
          <line x1="4" y1={R1.y} x2="296" y2={R1.y} className="nat-boundary" />
          <text x="292" y={R1.y - 8} className="nat-zone-label" textAnchor="end">INSIDE</text>
          <text x="292" y={R1.y + 18} className="nat-zone-label" textAnchor="end">OUTSIDE</text>
        </>
      ) : (
        <>
          <rect x="0" y="0" width={R1.x} height="214" className="nat-zone inside" />
          <rect x={R1.x} y="0" width={400 - R1.x} height="214" className="nat-zone outside" />
          <line x1={R1.x} y1="4" x2={R1.x} y2="210" className="nat-boundary" />
          <text x={R1.x - 8} y="14" className="nat-zone-label" textAnchor="end">INSIDE</text>
          <text x={R1.x + 8} y="14" className="nat-zone-label" textAnchor="start">OUTSIDE</text>
        </>
      )}
      {PC.map((p) => (
        <line key={p.id} x1={p.x} y1={p.y} x2={SW.x} y2={SW.y} className="nat-link" />
      ))}
      <line x1={SW.x} y1={SW.y} x2={R1.x} y2={R1.y} className="nat-link" />
      <line x1={R1.x} y1={R1.y} x2={NET.x} y2={NET.y} className="nat-link" />
      <line x1={NET.x} y1={NET.y} x2={SRV.x} y2={SRV.y} className="nat-link" />
      <g className="nat-dev" transform={`translate(${SW.x} ${SW.y})`} aria-hidden="true">
        <rect x="-22" y="-12" width="44" height="24" rx="5" className="nat-dev-body" />
        <path d="M-12 -4.5 H12 M8 -8 L12 -4.5 L8 -1 M12 4.5 H-12 M-8 1 L-12 4.5 L-8 8" className="nat-dev-mark" />
      </g>
      <g className={`nat-dev${flash ? ' active' : ''}`} transform={`translate(${R1.x} ${R1.y})`} aria-hidden="true">
        <circle r="20" className="nat-dev-body" />
        <path d="M0 -4 V-13 M-3.5 -9.5 L0 -13 L3.5 -9.5 M0 4 V13 M-3.5 9.5 L0 13 L3.5 9.5 M-13 0 H-4 M-7.5 -3.5 L-4 0 L-7.5 3.5 M13 0 H4 M7.5 -3.5 L4 0 L7.5 3.5" className="nat-dev-mark" />
        {phone ? (
          <>
            <text x="28" y="5" className="nat-dev-name">R1</text>
            <text x="-26" y="-12" className="nat-if" textAnchor="end">{INSIDE_IF.short} inside</text>
            <text x="-26" y="25" className="nat-if" textAnchor="end">{OUTSIDE_IF.short} outside</text>
          </>
        ) : (
          <>
            <text y="36" className="nat-dev-name" textAnchor="middle">R1</text>
            <text x="-24" y="-26" className="nat-if" textAnchor="end">{INSIDE_IF.short} inside</text>
            <text x="24" y="-26" className="nat-if" textAnchor="start">{OUTSIDE_IF.short} outside</text>
          </>
        )}
      </g>
      <g className="nat-dev" transform={`translate(${NET.x} ${NET.y})`} aria-hidden="true">
        <path d="M-20 11 C-32 11 -32 -5 -19 -4 C-18 -15 -2 -17 2 -9 C9 -17 23 -12 21 -2 C32 -2 32 11 20 11 Z" className="nat-dev-body" />
        {phone ? <text x="38" y="6" className="nat-dev-sub">internet</text> : <text y="30" className="nat-dev-sub" textAnchor="middle">internet</text>}
      </g>
      <g className="nat-dev" transform={`translate(${SRV.x} ${SRV.y})`} aria-hidden="true">
        <rect x="-12" y="-18" width="24" height="36" rx="3" className="nat-dev-body" />
        <path d="M-7 -9 H7 M-7 -2 H7 M-7 5 H7" className="nat-dev-mark" />
        {phone ? (
          <>
            <text x="22" y="-2" className="nat-dev-name">Web</text>
            <text x="22" y="14" className="nat-dev-sub">{SERVER.ip}</text>
          </>
        ) : (
          <>
            <text y="32" className="nat-dev-name" textAnchor="middle">Web</text>
            <text y="44" className="nat-dev-sub" textAnchor="middle">{SERVER.ip}</text>
          </>
        )}
      </g>
      {HOSTS.map((h, i) => (
        <PcGlyph key={h.id} x={PC[i].x} y={PC[i].y} label={h.name} sub={`.${h.ip.split('.')[3]}`} active={activeHost === h.id} onSend={() => onSend(h.id)} phone={phone} />
      ))}
      <g ref={packetRef} className="nat-packet" style={{ opacity: 0 }} aria-hidden="true">
        <rect x="-10" y="-7" width="20" height="14" rx="3" />
        <path d="M-9 -5.5 L0 1 L9 -5.5" />
      </g>
    </svg>
  )
}

/** The packet's address fields, each tagged with its NAT term. */
function Header({ header }) {
  if (!header) return null
  return (
    <div className={`nat-header ${header.side}`} aria-live="polite">
      <span className="nat-header-side">{header.side === 'inside' ? 'On the inside LAN' : 'On the internet'}</span>
      {['src', 'dst'].map((k) => (
        <span key={`${k}-${header[k].value}`} className={`nat-field ${header[k].term}`}>
          <span className="nat-field-key">{k === 'src' ? 'Source' : 'Destination'}</span>
          <strong className="nat-field-value">{header[k].value}</strong>
          <span className="nat-field-term">{TERMS[header[k].term].name}</span>
        </span>
      ))}
    </div>
  )
}

/** NAT and PAT: send flows, watch the translation table, learn the four terms. */
export default function NatTable({ onComplete }) {
  const [mode, setMode] = useState('pat')
  const [nat, setNat] = useState(() => Object.fromEntries(MODES.map((m) => [m, initialNat(m)])))
  const [header, setHeader] = useState(null)
  const [caption, setCaption] = useState({ text: 'Pick a PC in the diagram (or a Send button) to start a web flow to the server.', tone: '' })
  const [busy, setBusy] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [activeHost, setActiveHost] = useState(null)
  const [flash, setFlash] = useState(false)
  const [lastRow, setLastRow] = useState(null)
  const [term, setTerm] = useState('insideGlobal')
  const [tasks, setTasks] = useState({ static: false, exhaust: false, pat: false, quiz: false })
  const [quizStep, setQuizStep] = useState(0)
  const [quizMsg, setQuizMsg] = useState({ text: '', tone: '' })
  const packetRef = useRef(null)
  const stageRef = useRef(null)
  const phone = useNarrow(stageRef)
  const { PC: pcs, SW: sw, R1: r1, NET: net, SRV: srv } = phone ? PHONE : DESKTOP
  const quizRef = useRef(null)
  const runRef = useRef(0)
  const doneRef = useRef(false)
  const tasksRef = useRef(tasks)

  const state = nat[mode]
  const hostIndex = (id) => HOSTS.findIndex((h) => h.id === id)

  const markTask = (key) => {
    if (tasksRef.current[key]) return
    const next = { ...tasksRef.current, [key]: true }
    tasksRef.current = next
    setTasks(next)
    feedbackSuccess(key === 'quiz' ? quizRef.current : stageRef.current, key === 'quiz' ? 'Quiz done' : 'Task done')
    if (Object.values(next).every(Boolean) && !doneRef.current) {
      doneRef.current = true
      onComplete?.({ score: 1 })
    }
  }

  const stop = () => {
    runRef.current += 1
    setBusy(false)
    setActiveHost(null)
    setFlash(false)
    packetRef.current?.getAnimations?.().forEach((a) => a.cancel())
  }

  const changeMode = (m) => {
    if (m === mode) return
    sfx.flip()
    stop()
    setMode(m)
    setHeader(null)
    setLastRow(null)
    setCaption({ text: MODE_HELP[m], tone: '' })
  }

  const send = async (hostId) => {
    if (busy) return
    const { state: nextState, result } = sendFlow(state, hostId)
    const id = ++runRef.current
    const live = () => id === runRef.current
    const node = packetRef.current
    const pcPos = pcs[hostIndex(hostId)]
    const h = result.host
    setBusy(true)
    setActiveHost(hostId)
    setLastRow(null)
    sfx.tap()
    setHeader({ side: 'inside', src: { value: result.before.src, term: 'insideLocal' }, dst: { value: result.before.dst, term: 'outsideLocal' } })
    setCaption({ text: `${h.name} sends to the web server from its own address, ${result.before.src}.`, tone: '' })
    await fly(node, [pcPos, sw, r1], speed)
    if (!live()) return
    setFlash(true)

    if (result.kind === 'exhausted') {
      setNat((n) => ({ ...n, [mode]: nextState }))
      sfx.error()
      setCaption({ text: result.text, tone: 'bad' })
      await drop(node, r1)
      if (!live()) return
      setFlash(false)
      markTask('exhaust')
      setBusy(false)
      setActiveHost(null)
      return
    }

    if (result.kind === 'untranslated') {
      setCaption({ text: `${h.ip} has no static entry, so R1 forwards it with the private source unchanged.`, tone: '' })
      await pause(500, speed)
      setFlash(false)
      setHeader({ side: 'outside', src: { value: result.before.src, term: 'insideLocal' }, dst: { value: result.before.dst, term: 'outsideGlobal' } })
      await fly(node, [r1, net], speed)
      if (!live()) return
      sfx.error()
      await drop(node, net)
      if (!live()) return
      setNat((n) => ({ ...n, [mode]: nextState }))
      setCaption({ text: result.text, tone: 'bad' })
      setBusy(false)
      setActiveHost(null)
      return
    }

    // Translate the source at R1 and record it.
    setNat((n) => ({ ...n, [mode]: nextState }))
    setLastRow(result.rowKey)
    sfx.flip()
    setHeader({ side: 'outside', src: { value: result.after.src, term: 'insideGlobal' }, dst: { value: result.after.dst, term: 'outsideGlobal' } })
    setCaption({ text: `R1 translates the source: ${result.before.src} becomes ${result.after.src}. ${result.text}`, tone: '' })
    await pause(1100, speed)
    if (!live()) return
    setFlash(false)
    await fly(node, [r1, net, srv], speed)
    if (!live()) return
    sfx.pop()
    setCaption({ text: `The server only ever sees ${result.after.src}. It replies to that address.`, tone: '' })
    setHeader({ side: 'outside', src: { value: result.after.dst, term: 'outsideGlobal' }, dst: { value: result.after.src, term: 'insideGlobal' } })
    await pause(700, speed)
    if (!live()) return
    await fly(node, [srv, net, r1], speed)
    if (!live()) return
    setFlash(true)
    sfx.flip()
    setHeader({ side: 'inside', src: { value: result.before.dst, term: 'outsideLocal' }, dst: { value: result.before.src, term: 'insideLocal' } })
    setCaption({ text: `R1 finds ${result.after.src} in its table and changes the destination back to ${result.before.src}.`, tone: '' })
    await pause(900, speed)
    if (!live()) return
    setFlash(false)
    await fly(node, [r1, sw, pcPos], speed)
    if (!live()) return
    sfx.pop()
    setCaption({ text: result.kind === 'pat' ? `Reply delivered to ${h.name}. Send from another PC to see them share one address.` : `Reply delivered to ${h.name}.`, tone: 'good' })
    if (result.kind === 'static') markTask('static')
    if (result.kind === 'pat') {
      const hostsInPat = new Set(nextState.rows.map((r) => r.insideLocal.split(':')[0]))
      if (hostsInPat.size >= 2) markTask('pat')
    }
    setBusy(false)
    setActiveHost(null)
  }

  const clear = () => {
    sfx.tap()
    stop()
    setNat((n) => ({ ...n, [mode]: clearTranslations(n[mode]) }))
    setHeader(null)
    setLastRow(null)
    setCaption({ text: mode === 'static' ? 'clear ip nat translation * removes dynamic entries only. Static entries stay because they come from the configuration.' : 'clear ip nat translation * emptied the table. Dynamic entries are gone, and pool addresses are free again.', tone: '' })
  }

  const answer = (key) => {
    const q = QUIZ[quizStep]
    if (!q) return
    const graded = checkQuiz(q.id, key)
    if (graded.correct) {
      feedbackCorrect(quizRef.current, { combo: quizStep })
      setQuizMsg({ text: `Right. ${graded.why}`, tone: 'good' })
      const next = quizStep + 1
      setQuizStep(next)
      if (next >= QUIZ.length) markTask('quiz')
    } else {
      feedbackWrong(quizRef.current)
      setQuizMsg({ text: `Not quite. ${graded.why}`, tone: 'bad' })
    }
  }

  const doneCount = Object.values(tasks).filter(Boolean).length
  const pool = mode === 'dynamic' ? poolUsage(state) : null

  return (
    <div className="nat">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="NAT mode">
          {MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => changeMode(m)}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        <span className="grow" />
        <span className="chip outline tabular">{doneCount} / 4 tasks</span>
      </div>
      <p className="small nat-help">{MODE_HELP[mode]}</p>

      <div className="w-stage nat-stage" ref={stageRef}>
        <Topology packetRef={packetRef} activeHost={activeHost} onSend={send} flash={flash} phone={phone} />
        <Header header={header} />
      </div>

      <div className="row wrap nat-actions">
        {HOSTS.map((h) => (
          <button key={h.id} type="button" className="btn btn-sm" onClick={() => send(h.id)} disabled={busy}>
            <Send size={13} /> {h.name}
          </button>
        ))}
        <button type="button" className="btn btn-sm btn-ghost" onClick={clear}>
          <Eraser size={14} /> Clear table
        </button>
        <div className="w-pill-group" role="group" aria-label="Animation speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</button>
          ))}
        </div>
      </div>
      <p className={`w-feedback nat-caption ${caption.tone}`} aria-live="polite">{caption.text}</p>

      {pool && (
        <div className="nat-pool" aria-label="Pool usage">
          <span className="xsmall subtle">Pool {POOL.name}</span>
          {pool.map((p) => (
            <span key={p.address} className={`nat-slot${p.used ? ' used' : ''}`}>
              <span className="mono">{p.address}</span>
              <span className="xsmall">{p.host || 'free'}</span>
            </span>
          ))}
        </div>
      )}

      <div className="terminal nat-term">
        <div className="terminal-bar"><span className="dot" /><span className="dot" /><span className="dot" />R1 console</div>
        <div className="terminal-screen nat-screen">
          <p className="terminal-line"><span className="terminal-prompt">R1#</span> show ip nat translations</p>
          <table className="nat-table">
            <thead>
              <tr>
                <th scope="col">Pro</th>
                {TERM_KEYS.map((k) => (
                  <th key={k} scope="col">
                    <button
                      type="button"
                      className={`nat-term-btn${term === k ? ' on' : ''}`}
                      onClick={() => { sfx.tap(); setTerm(k) }}
                      onMouseEnter={() => setTerm(k)}
                      onFocus={() => setTerm(k)}
                      aria-pressed={term === k}
                    >
                      {TERMS[k].name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.key} className={`${r.key === lastRow ? 'fresh' : ''}`}>
                  <td data-label="Pro">{r.pro}</td>
                  {TERM_KEYS.map((k) => (
                    <td key={k} data-label={TERMS[k].name} className={term === k ? 'on' : ''}>{r[k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!state.rows.length && <p className="terminal-line terminal-dim">(empty: no translations yet)</p>}
          <p className="terminal-line terminal-dim nat-stats">Hits: {state.hits}  Misses: {state.misses}</p>
        </div>
      </div>

      <div className={`nat-gloss ${term}`} aria-live="polite">
        <strong>{TERMS[term].name}:</strong> {TERMS[term].short}
        <span className="nat-gloss-rule">Inside or outside says whose address it is. Local or global says which side of the router is looking at it.</span>
      </div>

      <details className="nat-config">
        <summary>R1 configuration for {MODE_LABEL[mode]}</summary>
        <pre className="nat-config-lines">{configFor(mode).join('\n')}</pre>
      </details>

      <section className="nat-quiz" ref={quizRef} aria-label="Which term is it">
        <div className="row between wrap">
          <strong className="nat-quiz-title">Which term is it?</strong>
          <span className="nat-dots" aria-label={`${Math.min(quizStep, QUIZ.length)} of ${QUIZ.length} answered`}>
            {QUIZ.map((q, i) => <span key={q.id} className={`nat-dot${i < quizStep ? ' done' : i === quizStep ? ' now' : ''}`} />)}
          </span>
        </div>
        {quizStep < QUIZ.length ? (
          <>
            <p className="nat-quiz-q">{QUIZ[quizStep].prompt}</p>
            <div className="nat-quiz-options">
              {TERM_KEYS.map((k) => (
                <button key={k} type="button" className="btn btn-sm" onClick={() => answer(k)}>{TERMS[k].name}</button>
              ))}
            </div>
          </>
        ) : (
          <p className="nat-quiz-q">All four terms nailed. Inside local, inside global, outside local, outside global.</p>
        )}
        <p className={`w-feedback ${quizMsg.tone}`} aria-live="polite">{quizMsg.text}</p>
      </section>

      <ul className="w-tasks">
        {[
          ['static', 'Static NAT: send a flow from PC1, PC2 or PC3', 'Notice the entry was already in the table.'],
          ['exhaust', 'Dynamic NAT: run the pool dry', 'Three pool addresses, four PCs.'],
          ['pat', 'PAT: send from two PCs', 'Both share 203.0.113.1, told apart by port.'],
          ['quiz', 'Answer the four-term quiz', 'Whose address, and seen from which side?']
        ].map(([key, title, hint]) => (
          <li key={key} className={`w-task${tasks[key] ? ' done' : ''}`}>
            <span className="w-task-mark">{tasks[key] && <Check size={13} />}</span>
            <span>{title}<span className="w-task-hint">{hint}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
