import { useEffect, useRef, useState } from 'react'
import { Check, CircleHelp } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { useTokens, useWidth, wait } from '../lib/net-anim'
import { Device, Label, LinkLine, StepControls, Token } from '../lib/net-svg'
import { DEVICES, LINKS, MASK, ROUTES, TABLE_TITLES, buildJourney, headerRows } from '../lib/packet-journey'
import './packet-journey.css'

const { A, B, C, D, R1 } = DEVICES
const G0 = R1.ifaces['G0/0']
const G1 = R1.ifaces['G0/1']

const LAYOUTS = {
  wide: {
    box: [760, 252],
    font: 12,
    pos: { A: { x: 60, y: 108 }, SW1: { x: 210, y: 108 }, R1: { x: 380, y: 108 }, SW2: { x: 550, y: 108 }, B: { x: 700, y: 108 }, C: { x: 210, y: 205 }, D: { x: 550, y: 205 } },
    zones: [
      { x: 14, y: 30, w: 336, h: 212, label: 'LAN 192.168.1.0/24', lx: 26, ly: 47 },
      { x: 410, y: 30, w: 336, h: 212, label: 'LAN 192.168.2.0/24', lx: 422, ly: 47 }
    ],
    labels: [
      { x: 60, y: 140, lines: [A.name, { text: A.ip, mono: true }, { text: A.mac, mono: true }] },
      { x: 700, y: 140, lines: [B.name, { text: B.ip, mono: true }, { text: B.mac, mono: true }] },
      { x: 238, y: 198, anchor: 'start', lines: [C.name, { text: C.ip, mono: true }, { text: C.mac, mono: true }] },
      { x: 578, y: 198, anchor: 'start', lines: [D.name, { text: D.ip, mono: true }, { text: D.mac, mono: true }] },
      { x: 210, y: 82, lines: ['SW1'] },
      { x: 550, y: 82, lines: ['SW2'] },
      { x: 380, y: 76, lines: ['R1'] },
      { x: 296, y: 134, lines: [{ text: `G0/0 ${G0.ip}`, mono: true, strong: true }, { text: G0.mac, mono: true }], size: 10.5 },
      { x: 464, y: 134, lines: [{ text: `G0/1 ${G1.ip}`, mono: true, strong: true }, { text: G1.mac, mono: true }], size: 10.5 }
    ]
  },
  // Phone layout: 300 wide, so at phone width type renders at about its own size.
  tall: {
    box: [300, 480],
    font: 13.5,
    gap: 15,
    tokenSize: 1.3,
    pos: { A: { x: 60, y: 74 }, SW1: { x: 150, y: 74 }, C: { x: 240, y: 74 }, R1: { x: 150, y: 246 }, B: { x: 60, y: 398 }, SW2: { x: 150, y: 398 }, D: { x: 240, y: 398 } },
    zones: [
      { x: 4, y: 8, w: 292, h: 146, label: 'LAN 192.168.1.0/24', lx: 12, ly: 26 },
      { x: 4, y: 336, w: 292, h: 138, label: 'LAN 192.168.2.0/24', lx: 12, ly: 354 }
    ],
    labels: [
      { x: 60, y: 106, lines: [A.name, { text: A.ip, mono: true }, { text: A.mac, mono: true }] },
      { x: 240, y: 106, lines: [C.name, { text: C.ip, mono: true }, { text: C.mac, mono: true }] },
      { x: 150, y: 52, lines: ['SW1'] },
      { x: 120, y: 251, anchor: 'end', lines: ['R1'] },
      { x: 162, y: 196, anchor: 'start', lines: [{ text: `G0/0 ${G0.ip}`, mono: true, strong: true }, { text: G0.mac, mono: true }] },
      { x: 162, y: 284, anchor: 'start', lines: [{ text: `G0/1 ${G1.ip}`, mono: true, strong: true }, { text: G1.mac, mono: true }] },
      { x: 150, y: 430, lines: ['SW2'] },
      { x: 60, y: 430, lines: [B.name, { text: B.ip, mono: true }, { text: B.mac, mono: true }] },
      { x: 240, y: 430, lines: [D.name, { text: D.ip, mono: true }, { text: D.mac, mono: true }] }
    ]
  }
}

const tokenLabel = (step) => (step.pdu.arp ? `ARP ${step.pdu.arp.op.toLowerCase()}` : step.pdu.icmp?.type === 0 ? 'echo reply' : 'ping')

/** One header field. */
function Field({ row }) {
  return (
    <div className={`journey-field${row.changed ? ' changed' : ''}`}>
      <span>{row.label}</span>
      <strong className="mono">{row.value}</strong>
    </div>
  )
}

/** The nested encapsulation view: Ethernet around IP (or ARP) around ICMP. */
function Encapsulation({ step }) {
  const rows = headerRows(step.pdu, step.changed)
  const ipBox = rows.ip && (
    <div className="journey-layer ip">
      <span className="journey-layer-name">IP packet (Layer 3)</span>
      <div className="journey-fields">{rows.ip.map((r) => <Field key={r.key} row={r} />)}</div>
      {rows.icmp && (
        <div className="journey-layer icmp">
          <span className="journey-layer-name">ICMP message</span>
          <div className="journey-fields">{rows.icmp.map((r) => <Field key={r.key} row={r} />)}</div>
        </div>
      )}
    </div>
  )
  const arpBox = rows.arp && (
    <div className="journey-layer arp">
      <span className="journey-layer-name">ARP {step.pdu.arp.op.toLowerCase()}</span>
      <div className="journey-fields">{rows.arp.map((r) => <Field key={r.key} row={r} />)}</div>
    </div>
  )
  return (
    <div className="journey-pdu" key={step.id}>
      {rows.eth ? (
        <div className="journey-layer eth">
          <span className="journey-layer-name">Ethernet frame (Layer 2)</span>
          <div className="journey-fields">{rows.eth.map((r) => <Field key={r.key} row={r} />)}</div>
          {arpBox || ipBox}
          <span className="journey-fcs">FCS trailer</span>
        </div>
      ) : (
        <>
          {step.pdu.stripped && <div className="journey-ghost">Ethernet header and trailer removed</div>}
          {ipBox}
        </>
      )}
    </div>
  )
}

function Tables({ step }) {
  const order = ['A', 'SW1', 'R1', 'SW2', 'B']
  return (
    <div className="journey-tables">
      {order.map((owner) => {
        const rows = step.tables[owner]
        return (
          <div key={owner} className="journey-table">
            <span className="journey-table-title">{TABLE_TITLES[owner]}</span>
            {rows.length === 0 ? (
              <span className="journey-empty">empty</span>
            ) : (
              rows.map(([k, v]) => (
                <div key={k} className={`journey-row mono${step.fresh[`${owner}:${k}`] ? ' fresh' : ''}`}>
                  <span>{k}</span>
                  <span>{v}</span>
                </div>
              ))
            )}
          </div>
        )
      })}
      {step.index >= 7 && (
        <div className="journey-table journey-routes">
          <span className="journey-table-title">R1 routing table</span>
          {ROUTES.map((r, i) => (
            <div key={r.prefix} className={`journey-row mono${step.route === i ? ' match' : ''}`}>
              <span>{r.code} {r.prefix}</span>
              <span>{r.via.replace('is directly connected, GigabitEthernet', 'connected, Gi')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Follow one ping hop by hop: ARP, encapsulation, switching and routing. */
export default function PacketJourney({ onComplete }) {
  const [steps] = useState(buildJourney)
  const [current, setCurrentState] = useState(0)
  const [asking, setAsking] = useState(null)
  const [picked, setPicked] = useState(null)
  const [qResult, setQResult] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [combo, setCombo] = useState(0)
  const [arrived, setArrived] = useState(null)
  const [answered, setAnswered] = useState(() => new Set())
  const wrapRef = useRef(null)
  const stageRef = useRef(null)
  const qRef = useRef(null)
  const currentRef = useRef(0)
  const answeredRef = useRef(new Set())
  const missedRef = useRef(new Set())
  const playingRef = useRef(false)
  const speedRef = useRef(1)
  const doneRef = useRef(false)
  const { tokens, play, stop, busy } = useTokens()
  const width = useWidth(wrapRef, 640)
  const layout = width < 560 ? LAYOUTS.tall : LAYOUTS.wide

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const setCurrent = (n) => {
    currentRef.current = n
    setCurrentState(n)
  }

  const step = steps[current]
  const pending = asking != null ? steps[asking] : null
  const last = steps.length - 1

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    feedbackSuccess(stageRef.current, 'Ping delivered')
    const asked = steps.filter((s) => s.checkpoint).length
    onComplete({ score: (asked - missedRef.current.size) / asked, detail: 'Followed the packet from A to B and back' })
  }

  const animate = async (target) => {
    const pos = layout.pos
    const phases = target.hops.map((phase) =>
      phase.map(([a, b], i) => ({ id: `${a}-${b}-${i}`, from: pos[a], to: pos[b], tone: target.tone || 'accent', label: tokenLabel(target) }))
    )
    if (!phases.length) {
      sfx.flip()
      await wait(220)
      return true
    }
    return play(phases, {
      duration: 760 / speedRef.current,
      onPhase: (i) => {
        sfx.pop()
        setArrived(target.hops[i].map(([, b]) => b))
      }
    })
  }

  /** Advance one step. Returns 'ok', 'question', 'done' or 'cancel'. */
  const stepOnce = async () => {
    const n = currentRef.current
    if (n >= last) return 'done'
    const target = steps[n + 1]
    if (target.checkpoint && !answeredRef.current.has(target.id)) {
      setAsking(n + 1)
      setPicked(null)
      setQResult(null)
      requestAnimationFrame(() => qRef.current?.querySelector('button')?.focus())
      return 'question'
    }
    setArrived(null)
    const ok = await animate(target)
    if (!ok) return 'cancel'
    setCurrent(n + 1)
    if (n + 1 >= last) {
      finish()
      return 'done'
    }
    return 'ok'
  }

  const runPlay = async () => {
    if (playingRef.current) return
    playingRef.current = true
    setPlaying(true)
    while (playingRef.current) {
      const r = await stepOnce()
      if (r !== 'ok') break
      await wait(1100 / speedRef.current)
    }
    playingRef.current = false
    setPlaying(false)
  }
  const pause = () => {
    playingRef.current = false
    setPlaying(false)
  }
  const back = () => {
    if (busy) return
    pause()
    setAsking(null)
    setQResult(null)
    setArrived(null)
    if (currentRef.current > 0) setCurrent(currentRef.current - 1)
  }
  const restart = () => {
    pause()
    stop()
    setAsking(null)
    setQResult(null)
    setArrived(null)
    setCurrent(0)
  }

  const answer = async (index) => {
    if (!pending) return
    const cp = pending.checkpoint
    setPicked(index)
    if (index === cp.answer) {
      feedbackCorrect(qRef.current, { combo })
      setCombo((c) => c + 1)
      answeredRef.current = new Set([...answeredRef.current, pending.id])
      setAnswered(answeredRef.current)
      setQResult({ ok: true, text: cp.explain })
      setAsking(null)
      await stepOnce()
    } else {
      feedbackWrong(qRef.current)
      setCombo(0)
      missedRef.current = new Set([...missedRef.current, pending.id])
      setQResult({ ok: false, text: `Not quite. ${cp.hint}` })
    }
  }

  const [vw, vh] = layout.box
  const activeLinks = new Set(busy ? [] : step.hops.flat().map(([a, b]) => [a, b].sort().join('-')))
  const deviceState = (id) => {
    if (arrived?.includes(id)) return id === 'C' || id === 'D' ? 'dim' : 'good'
    if (!busy && step.where === id) return 'active'
    return 'idle'
  }
  const answeredCount = steps.filter((s) => s.checkpoint && answered.has(s.id)).length

  return (
    <div className="journey" ref={wrapRef}>
      <div className="w-toolbar">
        <StepControls
          playing={playing}
          onPlay={runPlay}
          onPause={pause}
          onStep={() => !busy && !asking && stepOnce()}
          onBack={back}
          onRestart={restart}
          canStep={current < last && !busy && asking == null}
          canBack={current > 0 && !busy}
          speed={speed}
          onSpeed={setSpeed}
        />
        <span className="grow" />
        <span className="chip outline tabular">Step {current + 1} / {steps.length}</span>
        <span className={`chip ${answeredCount === 3 ? 'good' : 'outline'} tabular`}>Checkpoints {answeredCount} / 3</span>
      </div>

      <div className="w-stage journey-stage" ref={stageRef}>
        <svg viewBox={`0 0 ${vw} ${vh}`} className={`journey-svg${layout === LAYOUTS.tall ? ' tall' : ''}`} role="img" aria-label={`Network: PC A and PC C on SW1, router R1, PC B and PC D on SW2. Current step: ${step.title}.`}>
          {layout.zones.map((z) => (
            <g key={z.label}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="12" className="journey-zone" />
              <text x={z.lx} y={z.ly} className="journey-zone-label">{z.label}</text>
            </g>
          ))}
          {LINKS.map(([a, b]) => (
            <LinkLine key={`${a}-${b}`} a={layout.pos[a]} b={layout.pos[b]} state={activeLinks.has([a, b].sort().join('-')) ? 'active' : 'idle'} />
          ))}
          {Object.values(DEVICES).map((d) => (
            <Device key={d.id} kind={d.kind} x={layout.pos[d.id].x} y={layout.pos[d.id].y} state={deviceState(d.id)} />
          ))}
          {layout.labels.map((l, i) => (
            <Label key={i} x={l.x} y={l.y} anchor={l.anchor} lines={l.lines} size={l.size || layout.font} gap={layout.gap} />
          ))}
          {tokens.map((t) => <Token key={t.id} token={t} size={layout.tokenSize} />)}
        </svg>
      </div>

      <div className="journey-layout">
        <div className="journey-main">
          {pending ? (
            <div className="journey-question" ref={qRef}>
              <p className="journey-q"><CircleHelp size={16} /> Checkpoint: {pending.checkpoint.prompt}</p>
              <div className="journey-choices">
                {pending.checkpoint.choices.map((choice, i) => (
                  <button key={choice} type="button" className={`btn journey-choice${picked === i && qResult && !qResult.ok ? ' wrong' : ''}`} onClick={() => answer(i)}>
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="journey-caption" aria-live="polite" key={step.id}>
              <p className="journey-title">{step.title}</p>
              <p>{step.caption}</p>
            </div>
          )}
          {qResult && <p className={`w-feedback ${qResult.ok ? 'good' : 'bad'}`} aria-live="polite">{qResult.text}</p>}
          {step.and && !pending && (
            <table className="journey-and mono">
              <caption>A's subnet check (address AND mask)</caption>
              <thead><tr><th scope="col" /><th scope="col">A itself</th><th scope="col">B</th></tr></thead>
              <tbody>
                <tr><th scope="row">Address</th><td>{step.and.src}</td><td>{step.and.dst}</td></tr>
                <tr><th scope="row">Mask</th><td>{MASK}</td><td>{MASK}</td></tr>
                <tr className="result"><th scope="row">AND</th><td>{step.and.srcNet}</td><td className="diff">{step.and.dstNet}</td></tr>
              </tbody>
            </table>
          )}
          <Encapsulation step={step} />
        </div>
        <Tables step={step} />
      </div>

      <ul className="w-tasks">
        <li className={`w-task${current >= last ? ' done' : ''}`}>
          <span className="w-task-mark">{current >= last && <Check size={13} />}</span>
          <span>Follow the ping all the way to B and back</span>
        </li>
        <li className={`w-task${answeredCount === 3 ? ' done' : ''}`}>
          <span className="w-task-mark">{answeredCount === 3 && <Check size={13} />}</span>
          <span>Answer the three checkpoints<span className="w-task-hint">They appear when you reach the subnet check, the first frame and the router's new frame.</span></span>
        </li>
      </ul>
    </div>
  )
}
