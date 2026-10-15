import { useRef, useState } from 'react'
import { Check, Clock, Eraser, Send } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong, floatText } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { BROADCAST_MAC } from '../lib/net'
import { useTokens } from '../lib/net-anim'
import { Device, Label, LinkLine, SpeedControl, Token } from '../lib/net-svg'
import { AGING_CHOICES, BROADCAST, DEFAULT_AGING, HOSTS, advanceTime, createSwitch, framePhases, hostById, macOf, sendFrame, setAging, tableComplete } from '../lib/mac-learning'
import './mac-learning.css'

const GOAL_PREDICTIONS = 4

// Diagram geometry (viewBox 440 x 292).
const POS = {
  SW: { x: 210, y: 56 },
  A: { x: 70, y: 178 },
  B: { x: 205, y: 178 },
  HUB: { x: 330, y: 150 },
  C: { x: 285, y: 236 },
  D: { x: 380, y: 236 }
}
const PORT_POINT = { 'Fa0/1': { x: 180, y: 70 }, 'Fa0/2': { x: 210, y: 70 }, 'Fa0/3': { x: 240, y: 70 } }
const PORT_OF = { A: 'Fa0/1', B: 'Fa0/2', HUB: 'Fa0/3' }
const LINKS = [
  ['SW', 'A'],
  ['SW', 'B'],
  ['SW', 'HUB'],
  ['HUB', 'C'],
  ['HUB', 'D']
]
const linkKey = (a, b) => [a, b].sort().join('-')

/** Where a link attaches to a node: the switch uses the port's spot on its edge. */
function anchor(node, other) {
  if (node === 'SW') return PORT_POINT[PORT_OF[other]]
  const p = POS[node]
  if (node === 'HUB') return p
  return { x: p.x, y: p.y - 14 }
}

const ACTION_LABEL = { flood: 'Flood', forward: 'Forward', filter: 'Filter' }
const ACTION_HELP = {
  flood: 'Out every port except the one it came in on',
  forward: 'Out one known port only',
  filter: 'Drop it: the destination is on the incoming port'
}

/** Four hosts, one switch, a hub: watch the MAC table fill and predict each decision. */
export default function MacLearning({ onComplete }) {
  const [sw, setSw] = useState(() => createSwitch(DEFAULT_AGING))
  const [src, setSrc] = useState('A')
  const [dst, setDst] = useState('B')
  const [speed, setSpeed] = useState(1)
  const [lit, setLit] = useState(() => new Set())
  const [last, setLast] = useState(null)
  const [message, setMessage] = useState({ text: 'Pick a source and destination, then predict what the switch will do.', tone: '' })
  const [correct, setCorrect] = useState(0)
  const [combo, setCombo] = useState(0)
  const [flash, setFlash] = useState(null)
  const stageRef = useRef(null)
  const tableRef = useRef(null)
  const { tokens, play, busy } = useTokens()

  const pickSrc = (id) => {
    sfx.tap()
    setSrc(id)
    if (dst === id) setDst(HOSTS.find((h) => h.id !== id).id)
  }

  const predict = async (choice) => {
    if (busy) return
    sfx.tap()
    const result = sendFrame(sw, src, dst)
    const { phases, atSwitch } = framePhases(src, result.decision)
    const flooded = result.decision.action === 'flood'
    setLast(null)
    setFlash(null)
    setLit(new Set(phases.flat().map(([a, b]) => linkKey(a, b))))
    setMessage({ text: `Sending a frame from ${hostById(src).name} to ${dst === BROADCAST ? 'the broadcast address' : hostById(dst).name}...`, tone: '' })
    const segments = phases.map((phase, i) =>
      phase.map(([a, b]) => ({ from: anchor(a, b), to: anchor(b, a), tone: i > atSwitch && flooded ? 'warn' : 'accent' }))
    )
    const ok = await play(segments, {
      duration: 640 / speed,
      onPhase: (i) => {
        sfx.pop()
        if (i === atSwitch) {
          setSw(result.sw)
          setFlash(hostById(src).mac)
        }
      }
    })
    if (!ok) return
    setLit(new Set())
    const right = choice === result.decision.action
    const nextCorrect = right ? correct + 1 : correct
    setLast({ result, choice, right, src, dst })
    if (right) {
      setCorrect(nextCorrect)
      setCombo((c) => c + 1)
      feedbackCorrect(stageRef.current, { combo })
      if (nextCorrect === GOAL_PREDICTIONS) floatText(stageRef.current, `${GOAL_PREDICTIONS} predictions right`, { tone: 'good' })
    } else {
      setCombo(0)
      feedbackWrong(stageRef.current)
    }
    const verdict = right ? `Right, the switch will ${result.decision.action} it.` : `Not this time: you said ${choice}, the switch will ${result.decision.action} it.`
    setMessage({ text: verdict, tone: right ? 'good' : 'bad' })
    const wasComplete = tableComplete(sw)
    if (!wasComplete && tableComplete(result.sw)) feedbackSuccess(tableRef.current, 'Table full')
    if (tableComplete(result.sw) && nextCorrect >= GOAL_PREDICTIONS) onComplete?.({ score: 1 })
  }

  const wait = (seconds) => {
    if (busy) return
    sfx.tick()
    const r = advanceTime(sw, seconds)
    setSw(r.sw)
    setLast(null)
    setMessage(
      r.expired.length
        ? { text: `${seconds} seconds later: ${r.expired.map((e) => e.mac).join(' and ')} aged out. The next frame to ${r.expired.length > 1 ? 'those hosts' : 'that host'} will be flooded again.`, tone: '' }
        : { text: `${seconds} seconds pass. Every entry gets older; nothing reached the ${sw.agingTime} s aging time yet.`, tone: '' }
    )
  }

  const changeAging = (value) => {
    const r = setAging(sw, Number(value))
    setSw(r.sw)
    setMessage({ text: `Aging time is now ${value} seconds${r.expired.length ? `, which removed ${r.expired.length} stale ${r.expired.length > 1 ? 'entries' : 'entry'}` : ''}. The Cisco default is 300.`, tone: '' })
  }

  const clear = () => {
    if (busy) return
    sfx.flip()
    setSw((s) => ({ ...s, table: [] }))
    setLast(null)
    setMessage({ text: 'Table cleared, as if you typed clear mac address-table dynamic. Everything floods until the switch learns again.', tone: '' })
  }

  const badges = {}
  if (last) for (const r of last.result.receivers) badges[r.id] = r.accepted ? 'kept' : 'ignored'
  const filtered = last?.result.decision.action === 'filter'
  const full = tableComplete(sw)
  const deviceState = (id) => {
    if (busy && id === src) return 'active'
    if (badges[id] === 'kept') return 'good'
    if (badges[id] === 'ignored') return 'dim'
    return 'idle'
  }

  return (
    <div className="mac">
      <div className="mac-controls">
        <div className="mac-pick">
          <span className="mac-pick-label">From</span>
          <div className="w-pill-group" role="group" aria-label="Source host">
            {HOSTS.map((h) => (
              <button key={h.id} type="button" aria-pressed={src === h.id} onClick={() => pickSrc(h.id)} disabled={busy}>
                {h.id}
              </button>
            ))}
          </div>
        </div>
        <div className="mac-pick">
          <span className="mac-pick-label">To</span>
          <div className="w-pill-group" role="group" aria-label="Destination">
            {HOSTS.map((h) => (
              <button key={h.id} type="button" aria-pressed={dst === h.id} onClick={() => { sfx.tap(); setDst(h.id) }} disabled={busy || h.id === src}>
                {h.id}
              </button>
            ))}
            <button type="button" aria-pressed={dst === BROADCAST} onClick={() => { sfx.tap(); setDst(BROADCAST) }} disabled={busy}>
              All
            </button>
          </div>
        </div>
        <span className="grow" />
        <SpeedControl speed={speed} onChange={setSpeed} />
      </div>

      <div className="mac-frame mono" aria-label="Frame to send">
        <span className="mac-frame-tag">Ethernet frame</span>
        <span>dst <strong className={dst === BROADCAST ? 'mac-bcast' : ''}>{macOf(dst)}</strong></span>
        <span>src <strong>{hostById(src).mac}</strong></span>
      </div>

      <div className="mac-layout">
        <div className="w-stage grid-bg mac-stage" ref={stageRef}>
          <svg viewBox="0 0 440 292" className="mac-svg" role="img" aria-label="PC A on Fa0/1, PC B on Fa0/2, and PC C and PC D on a hub connected to Fa0/3 of the switch">
            {LINKS.map(([a, b]) => (
              <LinkLine key={linkKey(a, b)} a={anchor(a, b)} b={anchor(b, a)} state={lit.has(linkKey(a, b)) ? 'active' : 'idle'} />
            ))}
            <Device kind="switch" x={POS.SW.x} y={POS.SW.y} w={100} h={30} state={filtered ? 'bad' : busy ? 'active' : 'idle'} />
            <Label x={POS.SW.x - 60} y={POS.SW.y + 4} anchor="end" lines={['SW1']} size={12} />
            {Object.entries(PORT_POINT).map(([port, p]) => (
              <text key={port} x={p.x} y={p.y + 14} textAnchor="middle" className="mac-port">{port.replace('Fa', '')}</text>
            ))}
            <Device kind="hub" x={POS.HUB.x} y={POS.HUB.y} />
            <Label x={POS.HUB.x + 28} y={POS.HUB.y + 4} anchor="start" lines={[{ text: 'Hub', strong: true }]} size={11} />
            {HOSTS.map((h) => (
              <g key={h.id}>
                <Device kind="pc" x={POS[h.id].x} y={POS[h.id].y} state={deviceState(h.id)} />
                <Label x={POS[h.id].x} y={POS[h.id].y + 30} lines={[h.name, { text: h.mac, mono: true }]} size={11.5} />
                {badges[h.id] && (
                  <g transform={`translate(${POS[h.id].x + 20} ${POS[h.id].y - 18})`} className="mac-badge">
                    <circle r="8" style={{ fill: badges[h.id] === 'kept' ? 'var(--good)' : 'var(--ink-3)' }} />
                    <path d={badges[h.id] === 'kept' ? 'M-3.5 0 L-1 2.8 L3.8 -2.6' : 'M-3 -3 L3 3 M3 -3 L-3 3'} style={{ stroke: 'var(--card)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }} />
                  </g>
                )}
              </g>
            ))}
            {filtered && (
              <g className="mac-badge" transform={`translate(${POS.SW.x + 62} ${POS.SW.y - 12})`}>
                <rect x="-4" y="-10" width="56" height="18" rx="9" style={{ fill: 'var(--bad)' }} />
                <text x="24" y="3" textAnchor="middle" style={{ fill: 'var(--card)', fontSize: 10, fontWeight: 700 }}>Filtered</text>
              </g>
            )}
            {tokens.map((t) => <Token key={t.id} token={t} />)}
          </svg>
        </div>

        <div className="mac-side">
          <div className="terminal mac-table" ref={tableRef}>
            <div className="terminal-bar"><span className="dot" /><span className="dot" /><span className="dot" />SW1# show mac address-table dynamic</div>
            <table>
              <caption className="mac-sr">MAC address table of SW1</caption>
              <thead>
                <tr><th scope="col">Vlan</th><th scope="col">Mac Address</th><th scope="col">Port</th><th scope="col">Age</th></tr>
              </thead>
              <tbody>
                {sw.table.length === 0 && (
                  <tr><td colSpan={4} className="terminal-dim">(empty: nothing learned yet)</td></tr>
                )}
                {sw.table.map((e) => (
                  <tr key={e.mac} className={flash === e.mac ? 'mac-row-new' : ''}>
                    <td>1</td>
                    <td>{e.mac}</td>
                    <td>{e.port}</td>
                    <td className={e.age >= sw.agingTime * 0.8 ? 'terminal-err' : ''}>{e.age}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mac-table-foot terminal-dim">Total Mac Addresses: {sw.table.length} of 4{full ? '  (complete)' : ''}</p>
          </div>
          <div className="mac-aging">
            <label className="mac-pick-label" htmlFor="mac-aging">Aging time</label>
            <select id="mac-aging" className="select" value={sw.agingTime} onChange={(e) => changeAging(e.target.value)} disabled={busy}>
              {AGING_CHOICES.map((s) => <option key={s} value={s}>{s} s{s === DEFAULT_AGING ? ' (default)' : ''}</option>)}
            </select>
            <button type="button" className="btn btn-sm" onClick={() => wait(30)} disabled={busy}><Clock size={14} /> +30 s</button>
            <button type="button" className="btn btn-sm" onClick={() => wait(300)} disabled={busy}><Clock size={14} /> +5 min</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={clear} disabled={busy} title="clear mac address-table dynamic"><Eraser size={14} /> Clear</button>
          </div>
        </div>
      </div>

      <div className="mac-predict" role="group" aria-label="Predict and send">
        <p className="mac-predict-q"><Send size={15} /> What will the switch do with this frame? Your answer sends it.</p>
        <div className="mac-predict-buttons">
          {['flood', 'forward', 'filter'].map((a) => (
            <button key={a} type="button" className={`btn mac-choice${last?.choice === a ? (last.right ? ' good' : ' bad') : ''}`} onClick={() => predict(a)} disabled={busy}>
              <strong>{ACTION_LABEL[a]}</strong>
              <span>{ACTION_HELP[a]}</span>
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite">
        <p className={`w-feedback ${message.tone}`}>{message.text}</p>
        {last && (
          <ol className="mac-lines">
            {last.result.lines.map((line, i) => <li key={i} style={{ animationDelay: `${i * 90}ms` }}>{line}</li>)}
          </ol>
        )}
      </div>

      <ul className="w-tasks">
        <li className={`w-task${full ? ' done' : ''}`}>
          <span className="w-task-mark">{full && <Check size={13} />}</span>
          <span>Get all four hosts into the MAC table ({sw.table.length}/4)<span className="w-task-hint">A switch learns from the source address of every frame it receives. Entries age out, so keep them fresh.</span></span>
        </li>
        <li className={`w-task${correct >= GOAL_PREDICTIONS ? ' done' : ''}`}>
          <span className="w-task-mark">{correct >= GOAL_PREDICTIONS && <Check size={13} />}</span>
          <span>Predict {GOAL_PREDICTIONS} decisions correctly ({Math.min(correct, GOAL_PREDICTIONS)}/{GOAL_PREDICTIONS})<span className="w-task-hint">Try a broadcast ({BROADCAST_MAC}), and try C to D once the switch knows where D is.</span></span>
        </li>
      </ul>
    </div>
  )
}
