import { useEffect, useRef, useState } from 'react'
import { Check, CircleHelp, Clock } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { useTokens, wait } from '../lib/net-anim'
import { StepControls, Token } from '../lib/net-svg'
import { CLIENT, buildTcpScript, buildUdpScript, checkAnswer, headerFields, segmentLabel } from '../lib/tcp-handshake'
import './tcp-handshake.css'

const W = 340
const CX = 50
const SX = 290
const ROW = 50
const TOP = 14
const laneX = (who) => (who === CLIENT ? CX : SX)
const pick = (list) => list[Math.floor(Math.random() * list.length)]

function geometry(ev, index) {
  const y1 = TOP + index * ROW
  const y2 = y1 + ROW - 16
  const x1 = laneX(ev.from)
  const x2 = ev.from === CLIENT ? SX : CX
  return { x1, y1, x2, y2 }
}

function arrowTone(ev) {
  if (ev.lost) return 'bad'
  if (ev.retransmit) return 'warn'
  return ev.from === CLIENT ? 'accent' : 'good'
}
const STROKE = { accent: 'var(--accent)', good: 'var(--good)', bad: 'var(--bad)', warn: 'var(--warn)' }

/** One arrow on the sequence diagram, with its label pill. */
function Arrow({ ev, index, hide, ghost, latest }) {
  if (ev.kind === 'timeout') {
    const y = TOP + index * ROW + ROW / 2 - 6
    return (
      <g className={latest ? 'tcp-fresh' : ''}>
        <line x1={CX} y1={y - ROW - 4} x2={CX} y2={y} style={{ stroke: 'var(--warn)', strokeWidth: 3, strokeDasharray: '2 3' }} />
        <circle cx={CX} cy={y} r="11" style={{ fill: 'var(--card)', stroke: 'var(--warn)', strokeWidth: 2 }} />
        <path d={`M${CX} ${y - 6} V${y} L${CX + 4} ${y + 3}`} style={{ stroke: 'var(--warn)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }} />
        <text x={CX + 18} y={y + 4} className="tcp-note" style={{ fill: 'var(--warn)' }}>Retransmission timer expires</text>
      </g>
    )
  }
  if (ev.kind === 'note') {
    const y = TOP + index * ROW + ROW / 2 - 4
    return <text x={W / 2} y={y} textAnchor="middle" className="tcp-note">No teardown: there was no connection</text>
  }
  const g = geometry(ev, index)
  const tone = arrowTone(ev)
  const stroke = STROKE[tone]
  const end = ev.lost ? { x: g.x1 + (g.x2 - g.x1) * 0.55, y: g.y1 + (g.y2 - g.y1) * 0.55 } : { x: g.x2, y: g.y2 }
  const lines = segmentLabel(ev, hide)
  const width = Math.max(...lines.map((l) => l.length)) * 6.1 + 14
  const mid = { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 }
  return (
    <g className={`${ghost ? 'tcp-ghost' : ''}${latest ? ' tcp-fresh' : ''}`}>
      <line x1={g.x1} y1={g.y1} x2={end.x} y2={end.y} markerEnd={ev.lost ? undefined : `url(#tcp-head-${tone})`}
        style={{ stroke, strokeWidth: latest ? 2.6 : 1.8, strokeDasharray: ev.lost || ghost ? '5 4' : undefined, opacity: ghost ? 0.6 : 1 }} />
      {ev.lost && (
        <path d={`M${end.x - 6} ${end.y - 6} L${end.x + 6} ${end.y + 6} M${end.x + 6} ${end.y - 6} L${end.x - 6} ${end.y + 6}`} style={{ stroke: 'var(--bad)', strokeWidth: 2.6, strokeLinecap: 'round' }} />
      )}
      <g transform={`translate(${mid.x} ${mid.y - 2})`}>
        <rect x={-width / 2} y="-15" width={width} height="28" rx="6" style={{ fill: 'var(--card)', stroke: latest || ghost ? stroke : 'var(--rule)', strokeWidth: 1 }} />
        <text textAnchor="middle" y="-3" className="tcp-label-a" style={{ fill: stroke }}>{lines[0]}</text>
        <text textAnchor="middle" y="9" className="tcp-label-b">{lines[1]}</text>
      </g>
    </g>
  )
}

/** Step through a TCP connection (handshake, data, loss, teardown) and compare UDP. */
export default function TcpHandshake({ onComplete }) {
  const [scripts] = useState(() => ({
    tcp: buildTcpScript({ clientIsn: pick([100, 200, 300, 400, 600, 800]), serverIsn: pick([3000, 4000, 5000, 7000, 9000]), bytes: pick([100, 200, 500]) }),
    udp: buildUdpScript()
  }))
  const [proto, setProto] = useState('tcp')
  const [shown, setShownState] = useState({ tcp: 0, udp: 0 })
  const [asking, setAsking] = useState(null)
  const [picked, setPicked] = useState(null)
  const [qResult, setQResult] = useState(null)
  const [done, setDone] = useState(() => new Set())
  const [combo, setCombo] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const { tokens, play, stop, busy } = useTokens()

  const shownRef = useRef({ tcp: 0, udp: 0 })
  const answeredRef = useRef(new Set())
  const missedRef = useRef(new Set())
  const doneRef = useRef(new Set())
  const protoRef = useRef('tcp')
  const playingRef = useRef(false)
  const speedRef = useRef(1)
  const scrollRef = useRef(null)
  const qRef = useRef(null)
  const diagramRef = useRef(null)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const setShown = (pr, n) => {
    shownRef.current = { ...shownRef.current, [pr]: n }
    setShownState(shownRef.current)
  }
  const keyOf = (pr, id) => `${pr}:${id}`

  const events = scripts[proto]
  const count = shown[proto]
  const latest = count > 0 ? events[count - 1] : null
  const pending = asking && asking.proto === proto ? events[asking.id] : null
  const focus = pending || latest
  const height = TOP + Math.max(events.length, 4) * ROW + 6

  const scrollTo = (index) => {
    const el = scrollRef.current
    if (!el) return
    const svgH = el.scrollHeight
    const y = ((TOP + index * ROW) / height) * svgH
    el.scrollTo?.({ top: Math.max(0, y - el.clientHeight / 2), behavior: 'smooth' })
  }

  const finish = (pr) => {
    if (doneRef.current.has(pr)) return
    doneRef.current = new Set([...doneRef.current, pr])
    setDone(doneRef.current)
    feedbackSuccess(diagramRef.current, pr === 'tcp' ? 'TCP done' : 'UDP done')
    if (doneRef.current.size === 2) {
      const asked = Object.values(scripts).flat().filter((e) => e.question).length
      onComplete({ score: (asked - missedRef.current.size) / asked, detail: 'Stepped through TCP and UDP' })
    }
  }

  const animateEvent = async (ev, index) => {
    if (ev.kind === 'timeout') {
      sfx.tick()
      await wait(500 / speedRef.current)
      return true
    }
    if (ev.kind === 'note') return true
    const g = geometry(ev, index)
    sfx.tap()
    const ok = await play([[{ from: { x: g.x1, y: g.y1 }, to: { x: g.x2, y: g.y2 }, tone: arrowTone(ev), drop: ev.lost ? 0.55 : null }]], { duration: 900 / speedRef.current })
    if (ok && ev.lost) sfx.error()
    else if (ok) sfx.pop()
    return ok
  }

  /** Advance one event. Returns 'ok', 'question', 'done' or 'cancel'. */
  const stepOnce = async () => {
    const pr = protoRef.current
    const list = scripts[pr]
    const n = shownRef.current[pr]
    if (n >= list.length) return 'done'
    const ev = list[n]
    if (ev.question && !answeredRef.current.has(keyOf(pr, ev.id))) {
      setAsking({ proto: pr, id: ev.id })
      setPicked(null)
      setQResult(null)
      scrollTo(n)
      requestAnimationFrame(() => qRef.current?.querySelector('button')?.focus())
      return 'question'
    }
    scrollTo(n)
    const ok = await animateEvent(ev, n)
    if (!ok || protoRef.current !== pr) return 'cancel'
    setShown(pr, n + 1)
    if (n + 1 >= list.length) {
      finish(pr)
      return 'done'
    }
    return 'ok'
  }

  const runPlay = async () => {
    if (playingRef.current) return
    playingRef.current = true
    setPlaying(true)
    while (playingRef.current) {
      const result = await stepOnce()
      if (result !== 'ok') break
      await wait(650 / speedRef.current)
    }
    playingRef.current = false
    setPlaying(false)
  }

  const pause = () => {
    playingRef.current = false
    setPlaying(false)
  }

  const stepClick = () => {
    if (busy || asking) return
    stepOnce()
  }

  const back = () => {
    if (busy) return
    pause()
    setAsking(null)
    setQResult(null)
    const n = shownRef.current[proto]
    if (n > 0) setShown(proto, n - 1)
  }

  const restart = () => {
    pause()
    stop()
    setAsking(null)
    setQResult(null)
    setShown(proto, 0)
    answeredRef.current = new Set([...answeredRef.current].filter((k) => !k.startsWith(`${proto}:`)))
    scrollRef.current?.scrollTo?.({ top: 0 })
  }

  const switchProto = (pr) => {
    if (pr === proto) return
    sfx.tap()
    pause()
    stop()
    protoRef.current = pr
    setProto(pr)
    setAsking(null)
    setQResult(null)
    scrollRef.current?.scrollTo?.({ top: 0 })
  }

  const answer = async (choice) => {
    if (!pending) return
    const q = pending.question
    setPicked(choice)
    if (checkAnswer(q, choice)) {
      feedbackCorrect(qRef.current, { combo })
      setCombo((c) => c + 1)
      answeredRef.current = new Set([...answeredRef.current, keyOf(proto, pending.id)])
      setQResult({ ok: true, text: q.explain })
      setAsking(null)
      await stepOnce()
    } else {
      feedbackWrong(qRef.current)
      setCombo(0)
      missedRef.current = new Set([...missedRef.current, keyOf(proto, pending.id)])
      setQResult({ ok: false, text: `Not quite. ${q.hint || ''}` })
    }
  }

  const fields = focus ? headerFields(focus, pending ? pending.question.field : null) : []
  const states = latest ? latest.states : proto === 'tcp' ? { client: 'CLOSED', server: 'LISTEN' } : { client: 'no connection', server: 'no connection' }
  const atEnd = count >= events.length
  const moving = busy && tokens.length > 0 && events[count] && events[count].kind === 'segment' ? events[count] : null
  const trail = moving ? { g: geometry(moving, count), t: tokens[0], tone: arrowTone(moving) } : null

  return (
    <div className="tcp">
      <div className="w-toolbar">
        <div className="w-pill-group" role="group" aria-label="Protocol">
          {['tcp', 'udp'].map((pr) => (
            <button key={pr} type="button" aria-pressed={proto === pr} onClick={() => switchProto(pr)}>
              {done.has(pr) && <Check size={12} />} {pr.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="grow" />
        <span className="chip outline tabular">Step {count} / {events.length}</span>
      </div>

      <StepControls
        playing={playing}
        onPlay={runPlay}
        onPause={pause}
        onStep={stepClick}
        onBack={back}
        onRestart={restart}
        canStep={!atEnd && !busy && !asking}
        canBack={count > 0 && !busy}
        speed={speed}
        onSpeed={setSpeed}
      />

      <div className="tcp-layout">
        <div className="tcp-diagram" ref={diagramRef}>
          <div className="tcp-lanes-head">
            <div><strong>Client</strong><span className="chip outline tcp-state" key={states.client}>{states.client}</span></div>
            <div><strong>Server</strong><span className="chip outline tcp-state" key={states.server}>{states.server}</span></div>
          </div>
          <div className="tcp-scroll" ref={scrollRef}>
            <svg viewBox={`0 0 ${W} ${height}`} className="tcp-svg" role="img" aria-label={`${proto.toUpperCase()} sequence diagram, ${count} of ${events.length} steps shown`}>
              <defs>
                {Object.entries(STROKE).map(([tone, color]) => (
                  <marker key={tone} id={`tcp-head-${tone}`} markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" style={{ fill: color }} />
                  </marker>
                ))}
              </defs>
              <line x1={CX} y1="0" x2={CX} y2={height} className="tcp-lane" />
              <line x1={SX} y1="0" x2={SX} y2={height} className="tcp-lane" />
              {events.slice(0, count).map((ev, i) => (
                <Arrow key={`${proto}-${ev.id}`} ev={ev} index={i} latest={i === count - 1} />
              ))}
              {pending && <Arrow ev={pending} index={count} hide={pending.question.field} ghost />}
              {trail && (
                <line x1={trail.g.x1} y1={trail.g.y1} x2={trail.t.dropped ? trail.g.x1 + (trail.g.x2 - trail.g.x1) * 0.55 : trail.t.x} y2={trail.t.dropped ? trail.g.y1 + (trail.g.y2 - trail.g.y1) * 0.55 : trail.t.y}
                  style={{ stroke: STROKE[trail.tone], strokeWidth: 2, opacity: 0.5 }} />
              )}
              {tokens.map((t) => <Token key={t.id} token={t} />)}
            </svg>
          </div>
        </div>

        <div className="tcp-side">
          {pending ? (
            <div className="tcp-question" ref={qRef}>
              <p className="tcp-q"><CircleHelp size={16} /> {pending.question.prompt}</p>
              <div className="tcp-choices">
                {pending.question.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={`btn tcp-choice${picked === choice && qResult && !qResult.ok ? ' wrong' : ''}`}
                    onClick={() => answer(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="tcp-caption" aria-live="polite">
              <p className="tcp-step-title">{latest ? latest.title : 'Ready'}</p>
              <p>{latest ? latest.caption : proto === 'tcp' ? 'The client wants to talk to a web server on port 80. TCP has to set up a connection first. Press Step or Play.' : 'Same two hosts, but now with UDP. Press Step or Play and notice what is missing.'}</p>
            </div>
          )}
          {qResult && (
            <p className={`w-feedback ${qResult.ok ? 'good' : 'bad'}`} aria-live="polite">{qResult.text}</p>
          )}
          {fields.length > 0 && (
            <dl className="tcp-fields">
              <dt className="tcp-fields-title">{focus.kind === 'datagram' ? 'UDP header' : 'TCP header'}{pending ? ' (about to send)' : ''}</dt>
              {fields.map(([k, v]) => (
                <div key={k} className={v === '?' ? 'asked' : ''}>
                  <dt>{k}</dt>
                  <dd className="mono">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {focus?.kind === 'timeout' && (
            <p className="tcp-timer"><Clock size={15} /> The RTO adapts to the measured round-trip time, and doubles after each timeout.</p>
          )}
        </div>
      </div>

      <ul className="w-tasks">
        <li className={`w-task${done.has('tcp') ? ' done' : ''}`}>
          <span className="w-task-mark">{done.has('tcp') && <Check size={13} />}</span>
          <span>Step through TCP: handshake, data, a lost segment and the close, answering 3 questions</span>
        </li>
        <li className={`w-task${done.has('udp') ? ' done' : ''}`}>
          <span className="w-task-mark">{done.has('udp') && <Check size={13} />}</span>
          <span>Step through UDP and see what it leaves out</span>
        </li>
      </ul>
    </div>
  )
}
