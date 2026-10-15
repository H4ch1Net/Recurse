import { useRef, useState } from 'react'
import { Check, Lightbulb, Undo2 } from 'lucide-react'
import { feedbackCorrect, feedbackWrong, floatText, shake } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { MNEMONICS, OSI_CARDS, OSI_LAYERS, TCPIP_LAYERS, cardById, grade, hintFor, shuffled } from '../lib/osi-layers'
import './osi-layers.css'

const MNEMONIC_ORDER = ['off', 'down', 'up']
// Row 1 holds the column headings; OSI layers 7 to 1 fill rows 2 to 8.
const TCPIP_ROWS = { Application: '2 / span 3', Transport: '5', Network: '6', 'Data Link': '7', Physical: '8' }

/** Drag protocols, devices, PDUs and addresses onto the OSI layer where they belong. */
export default function OsiLayers({ onComplete }) {
  const [order] = useState(() => shuffled(OSI_CARDS.map((c) => c.id)))
  const [placements, setPlacements] = useState({})
  const [status, setStatus] = useState({})
  const [selected, setSelected] = useState(null)
  const [drag, setDrag] = useState(null)
  const [hover, setHover] = useState(null)
  const [landed, setLanded] = useState(null)
  const [mnemonic, setMnemonic] = useState('off')
  const [streak, setStreak] = useState(0)
  const [missed, setMissed] = useState(() => new Set())
  const [message, setMessage] = useState({ text: 'Drag a card onto a layer, or tap a card and then tap its layer. Press Check when you are ready.', tone: '' })
  const [hints, setHints] = useState([])
  const zones = useRef({})
  const cardEls = useRef({})
  const boardRef = useRef(null)
  const pointer = useRef(null)
  const suppressClick = useRef(false)

  const locked = (id) => status[id] === 'correct'
  const total = OSI_CARDS.length
  const correctCount = Object.values(status).filter((s) => s === 'correct').length

  const place = (id, layer) => {
    if (!id || locked(id)) return
    sfx.pop()
    setPlacements((p) => {
      const next = { ...p }
      if (layer === 'tray') delete next[id]
      else next[id] = layer
      return next
    })
    setStatus((s) => {
      const next = { ...s }
      delete next[id]
      return next
    })
    setSelected(null)
    setLanded(id)
    setHints((h) => h.filter((x) => x.id !== id))
  }

  const zoneAt = (x, y) => {
    for (const [key, el] of Object.entries(zones.current)) {
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key === 'tray' ? 'tray' : Number(key)
    }
    return null
  }

  // ---- Pointer drag (mouse, pen and touch) ----
  const onPointerDown = (e, id) => {
    if (locked(id) || e.button > 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointer.current = { id, x: e.clientX, y: e.clientY, moved: false }
  }
  const onPointerMove = (e) => {
    const p = pointer.current
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (!p.moved && Math.hypot(dx, dy) < 6) return
    if (!p.moved) sfx.tap()
    p.moved = true
    setDrag({ id: p.id, dx, dy })
    setHover(zoneAt(e.clientX, e.clientY))
  }
  const onPointerUp = (e) => {
    const p = pointer.current
    pointer.current = null
    if (!p || !p.moved) return
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 0)
    const zone = zoneAt(e.clientX, e.clientY)
    setDrag(null)
    setHover(null)
    if (zone != null) place(p.id, zone)
  }
  const onPointerCancel = () => {
    pointer.current = null
    setDrag(null)
    setHover(null)
  }

  // ---- Click and keyboard ----
  const clickCard = (id) => {
    if (suppressClick.current) return
    const card = cardById(id)
    if (locked(id)) {
      setMessage({ text: card.why, tone: 'good' })
      return
    }
    sfx.tap()
    setSelected((s) => (s === id ? null : id))
  }
  const clickLayer = (layer) => {
    if (!selected) {
      setMessage({ text: 'Pick a card first, then choose its layer.', tone: '' })
      return
    }
    place(selected, layer)
  }

  const check = () => {
    const pending = Object.keys(placements).filter((id) => !locked(id))
    if (!pending.length) {
      setMessage({ text: 'Place a few cards on layers first.', tone: '' })
      return
    }
    const r = grade(placements)
    const right = pending.filter((id) => r.results[id] === 'correct')
    const wrong = pending.filter((id) => r.results[id] === 'wrong')
    setStatus((s) => {
      const next = { ...s }
      for (const id of pending) next[id] = r.results[id]
      return next
    })
    if (wrong.length) setMissed((m) => new Set([...m, ...wrong]))
    setHints(wrong.map((id) => ({ id, text: hintFor(id, placements[id]) })))
    if (right.length) {
      feedbackCorrect(boardRef.current, { combo: streak + right.length - 1 })
      floatText(boardRef.current, `+${right.length}`, { tone: 'good' })
    }
    if (wrong.length) {
      if (!right.length) feedbackWrong(boardRef.current)
      else wrong.forEach((id) => shake(cardEls.current[id]))
    }
    setStreak((s) => (wrong.length ? 0 : s + right.length))
    const nowCorrect = correctCount + right.length
    if (r.allCorrect) {
      setMessage({ text: `All ${total} cards are on the right layer. Tap any card to read why it lives there.`, tone: 'good' })
      const firstTry = total - new Set([...missed, ...wrong]).size
      onComplete({ score: firstTry / total, detail: `${firstTry} of ${total} right the first time` })
    } else if (!wrong.length) {
      setMessage({ text: `${right.length} right, ${total - nowCorrect} to go.`, tone: 'good' })
    } else {
      setMessage({ text: `${right.length} right and ${wrong.length} to rethink. The hints below point the way; move the red cards to try again.`, tone: right.length ? '' : 'bad' })
    }
  }

  const resetWrong = () => {
    sfx.flip()
    setPlacements((p) => Object.fromEntries(Object.entries(p).filter(([id]) => locked(id))))
    setStatus((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v === 'correct')))
    setHints([])
  }

  const cycleMnemonic = () => {
    sfx.flip()
    setMnemonic((m) => MNEMONIC_ORDER[(MNEMONIC_ORDER.indexOf(m) + 1) % MNEMONIC_ORDER.length])
  }

  const renderCard = (id) => {
    const card = cardById(id)
    const st = status[id] || ''
    const dragging = drag?.id === id
    return (
      <button
        key={id}
        ref={(el) => { cardEls.current[id] = el }}
        type="button"
        className={`osi-card ${st}${selected === id ? ' selected' : ''}${dragging ? ' dragging' : ''}${landed === id ? ' landed' : ''}`}
        style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(2deg)` } : undefined}
        aria-pressed={locked(id) ? undefined : selected === id}
        aria-label={`${card.label}, ${card.kind}${st === 'correct' ? ', correct' : st === 'wrong' ? ', wrong layer' : ''}`}
        onPointerDown={(e) => onPointerDown(e, id)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={() => clickCard(id)}
        onAnimationEnd={() => landed === id && setLanded(null)}
      >
        <span className="osi-card-label">{card.label}</span>
        <span className="osi-card-kind">{card.kind}</span>
        {st === 'correct' && <Check size={13} className="osi-card-tick" aria-hidden="true" />}
      </button>
    )
  }

  const tray = order.filter((id) => placements[id] == null)
  const anyWrong = Object.values(status).includes('wrong')

  return (
    <div className="osi" onKeyDown={(e) => e.key === 'Escape' && setSelected(null)}>
      <div className="w-toolbar">
        <button type="button" className={`btn btn-sm ${mnemonic === 'off' ? 'btn-ghost' : ''}`} onClick={cycleMnemonic} aria-pressed={mnemonic !== 'off'}>
          <Lightbulb size={14} /> {mnemonic === 'off' ? 'Mnemonic' : MNEMONICS[mnemonic].label}
        </button>
        <span className="grow" />
        <span className="chip outline tabular">{correctCount} / {total}</span>
        {streak >= 3 && <span className="chip accent">{streak} in a row</span>}
        {anyWrong && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={resetWrong}>
            <Undo2 size={14} /> Return red cards
          </button>
        )}
        <button type="button" className="btn btn-sm btn-primary" onClick={check}>
          <Check size={14} /> Check
        </button>
      </div>

      {mnemonic !== 'off' && (
        <p className="osi-phrase">
          <strong>{MNEMONICS[mnemonic].label}:</strong> {MNEMONICS[mnemonic].phrase}
        </p>
      )}

      <div
        className={`osi-tray${hover === 'tray' ? ' hover' : ''}${selected && placements[selected] != null ? ' target' : ''}`}
        ref={(el) => { zones.current.tray = el }}
        onClick={(e) => e.target === e.currentTarget && selected && placements[selected] != null && place(selected, 'tray')}
      >
        {tray.length ? tray.map(renderCard) : <span className="small subtle">Every card is on a layer. Press Check.</span>}
        {selected && placements[selected] != null && (
          <button type="button" className="btn btn-sm btn-ghost osi-back" onClick={() => place(selected, 'tray')}>
            <Undo2 size={13} /> Back to the tray
          </button>
        )}
      </div>

      <div className="osi-board" ref={boardRef}>
        <div className="osi-col-head" style={{ gridColumn: 1 }}>OSI model</div>
        <div className="osi-col-head" style={{ gridColumn: 2 }}>TCP/IP</div>
        {OSI_LAYERS.map((layer, i) => {
          const here = order.filter((id) => placements[id] === layer.n)
          return (
            <div
              key={layer.n}
              ref={(el) => { zones.current[layer.n] = el }}
              className={`osi-row${hover === layer.n ? ' hover' : ''}${selected ? ' target' : ''}`}
              style={{ gridRow: i + 2 }}
              onClick={(e) => (e.target === e.currentTarget || e.target.classList.contains('osi-slot')) && clickLayer(layer.n)}
            >
              <button type="button" className="osi-layer" onClick={() => clickLayer(layer.n)} aria-label={`Layer ${layer.n}, ${layer.name}${selected ? `: place ${cardById(selected).label} here` : ''}`}>
                <span className="osi-num">{layer.n}</span>
                <span className="osi-name">
                  {mnemonic !== 'off' && <em className="osi-mnemonic">{layer[mnemonic]}</em>}
                  <strong>{layer.name}</strong>
                  <small>{layer.job}</small>
                </span>
              </button>
              <div className="osi-slot">{here.map(renderCard)}</div>
            </div>
          )
        })}
        {TCPIP_LAYERS.map((t) => (
          <div key={t.name} className={`osi-tcpip${t.covers.length > 1 ? ' tall' : ''}`} style={{ gridColumn: 2, gridRow: TCPIP_ROWS[t.name] }}>
            <strong>{t.name}</strong>
            {t.note && <small>{t.note}</small>}
          </div>
        ))}
      </div>

      <div aria-live="polite">
        <p className={`w-feedback ${message.tone}`}>{message.text}</p>
        {hints.length > 0 && (
          <ul className="osi-hints">
            {hints.map((h) => <li key={h.id}>{h.text}</li>)}
          </ul>
        )}
      </div>
    </div>
  )
}
