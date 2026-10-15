import { useRef, useState } from 'react'
import { Crosshair, RefreshCw } from 'lucide-react'
import { burstFrom, feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { halvingChain, linearChecks, makeSortedValues, maxProbes, middle, pickTarget, probe, startSearch } from '../lib/binary-search'
import './binary-search.css'

const clampSize = (n) => Math.max(8, Math.min(64, Math.round(Number(n)) || 16))

function newRound(n, previousTarget) {
  const values = makeSortedValues(n)
  let target = pickTarget(values)
  for (let tries = 0; target === previousTarget && tries < 5; tries++) target = pickTarget(values)
  return { search: startSearch(values, target), last: null }
}

/** Find a target in a sorted row of boxes by probing; low, mid and high move as the range halves. */
export default function BinarySearch({ props, onComplete, standalone }) {
  const [size, setSize] = useState(() => clampSize(props.size ?? (standalone ? 32 : 16)))
  const [round, setRound] = useState(() => newRound(clampSize(props.size ?? (standalone ? 32 : 16))))
  const [combo, setCombo] = useState(0)
  const [wins, setWins] = useState(0)
  const [message, setMessage] = useState({ text: 'Click the box you want to check first. Hint: which box splits the row in half?', tone: '' })
  const stageRef = useRef(null)
  const boxRefs = useRef([])

  const { search, last } = round
  const { values, target, low, high, found } = search
  const limit = maxProbes(values.length)
  const used = search.probes.length
  const left = found ? 1 : Math.max(0, high - low + 1)
  const linear = linearChecks(values, target)
  const chain = halvingChain(values.length)
  const over = used > limit

  const restart = (n = size) => {
    sfx.flip()
    setRound(newRound(n, target))
    setMessage({ text: 'New target. Where do you check first?', tone: '' })
  }

  const doProbe = (index, auto = false) => {
    const before = search
    const r = probe(before, index)
    const el = boxRefs.current[index]
    if (r.outcome === 'done') return
    if (r.outcome === 'eliminated') {
      feedbackWrong(el)
      const side = index < before.low ? `${values[before.low - 1]} was already too small, so everything left of it is too.` : `${values[before.high + 1]} was already too big, so everything right of it is too.`
      setMessage({ text: `Box ${index} is already ruled out. ${side}`, tone: 'bad' })
      return
    }
    const nextCombo = r.even ? combo + 1 : 0
    setCombo(nextCombo)
    const mid = middle(before.low, before.high)
    const arithmetic = auto ? `mid = ⌊(${before.low} + ${before.high}) ÷ 2⌋ = ${mid}. ` : ''
    const probesNow = r.state.probes.length
    setRound({ search: r.state, last: index })

    if (r.outcome === 'found') {
      const within = probesNow <= limit
      if (within) {
        feedbackCorrect(el, { combo: nextCombo })
        burstFrom(stageRef.current, { kind: 'confetti', count: 30 })
        setWins((w) => w + 1)
        setMessage({
          text: `${arithmetic}Found ${target} at index ${index} in ${probesNow} ${probesNow === 1 ? 'probe' : 'probes'} (limit ${limit}). A left-to-right scan would need ${linear} ${linear === 1 ? 'check' : 'checks'}.`,
          tone: 'good'
        })
        onComplete({ score: 1, detail: `${probesNow} of ${limit} probes` })
      } else {
        feedbackWrong(stageRef.current)
        setMessage({ text: `Found ${target}, but it took ${probesNow} probes and the limit is ${limit}. See why the exact middle guarantees the limit below, then try a new target.`, tone: 'bad' })
      }
      return
    }

    const dir = r.outcome === 'go-right' ? 'right' : 'left'
    const cmp = r.outcome === 'go-right' ? 'smaller' : 'bigger'
    const moved = r.outcome === 'go-right' ? `low moves to ${r.state.low}` : `high moves to ${r.state.high}`
    const remaining = r.state.high - r.state.low + 1
    if (r.even) {
      sfx.pop()
      setMessage({ text: `${arithmetic}${r.value} is ${cmp} than ${target}, so the target is to the ${dir}: ${moved}. That ruled out ${r.ruledOut} boxes, ${remaining} left.`, tone: 'good' })
    } else {
      sfx.tap()
      setMessage({ text: `${r.value} is ${cmp} than ${target}, so ${moved}. That only ruled out ${r.ruledOut} of ${before.high - before.low + 1} boxes. The middle would have ruled out about half.`, tone: 'warn' })
    }
    if (probesNow === limit && remaining > 0) {
      setMessage((m) => ({ ...m, text: `${m.text} That was your last probe within the limit.` }))
    }
  }

  const probeMid = () => {
    if (found) return
    doProbe(middle(low, high), true)
  }

  const changeSize = (n) => {
    setSize(n)
    restart(n)
  }

  const binaryRuled = values.length - left
  return (
    <div className="bs">
      <div className="w-toolbar">
        <span className="small">Find <strong className="bs-target">{target}</strong></span>
        <span className="grow" />
        <span className={`chip tabular ${over ? 'bad' : used === limit && !found ? 'warn' : 'outline'}`}>Probes {used} / {limit} max</span>
        {combo >= 2 && <span className="chip accent">{combo} perfect splits</span>}
        {wins > 0 && <span className="chip good">{wins} found</span>}
      </div>

      {standalone && (
        <div className="w-toolbar">
          <span className="xsmall subtle">Boxes</span>
          <div className="w-pill-group" role="group" aria-label="Number of boxes">
            {[8, 16, 32, 64].map((n) => (
              <button key={n} type="button" aria-pressed={n === size} onClick={() => changeSize(n)}>{n}</button>
            ))}
          </div>
        </div>
      )}

      <div className="w-stage grid-bg bs-stage" ref={stageRef}>
        <div className="bs-row" role="group" aria-label="Sorted boxes">
          {values.map((v, k) => {
            const out = !found && (k < low || k > high)
            const isFound = found && k === last
            const probed = search.probes.includes(k)
            const tags = []
            if (!found && k === low) tags.push('L')
            if (!found && k === high) tags.push('H')
            if (k === last && !found) tags.push('M')
            const delay = out && last !== null ? Math.min(260, Math.abs(k - last) * 14) : 0
            const label = `Index ${k}, value ${v}${out ? ', ruled out' : ''}${tags.length ? `, ${tags.map((t) => ({ L: 'low', H: 'high', M: 'last probe' })[t]).join(' and ')}` : ''}${isFound ? ', the target' : ''}`
            return (
              <button
                key={`${k}-${v}`}
                ref={(el) => { boxRefs.current[k] = el }}
                type="button"
                className={`bs-box${out ? ' out' : ''}${probed ? ' probed' : ''}${isFound ? ' found' : ''}${k === last ? ' last' : ''}`}
                style={{ transitionDelay: `${delay}ms` }}
                onClick={() => doProbe(k)}
                disabled={found}
                aria-label={label}
              >
                <span className="bs-tags" aria-hidden="true">
                  {tags.map((t) => <span key={`${t}-${k}-${used}`} className={`bs-tag ${t}`}>{t}</span>)}
                </span>
                <span className="bs-val">{v}</span>
                <span className="bs-idx">{k}</span>
              </button>
            )
          })}
        </div>
        {!found && (
          <p className="xsmall bs-range mono">
            low = {low}, high = {high}, {left} {left === 1 ? 'box' : 'boxes'} left. Binary search checks ⌊(low + high) ÷ 2⌋.
          </p>
        )}
      </div>

      <p className={`w-feedback ${message.tone === 'warn' ? 'bs-warn' : message.tone}`} aria-live="polite">{message.text}</p>

      <div className="row wrap bs-actions">
        <button type="button" className="btn btn-primary" onClick={probeMid} disabled={found}><Crosshair size={16} /> Probe mid</button>
        <button type="button" className={`btn${found ? ' btn-primary' : ' btn-ghost'}`} onClick={() => restart()}><RefreshCw size={15} /> New target</button>
      </div>

      <div className="bs-compare" aria-label="Binary search compared with a linear scan">
        <div className="bs-meter">
          <span className="xsmall">Your probes ruled out</span>
          <div className="bs-track"><span className="bs-fill binary" style={{ width: `${(binaryRuled / values.length) * 100}%` }} /></div>
          <strong className="tabular small">{binaryRuled}</strong>
        </div>
        <div className="bs-meter">
          <span className="xsmall">A linear scan with {used} {used === 1 ? 'check' : 'checks'} rules out</span>
          <div className="bs-track"><span className="bs-fill linear" style={{ width: `${(Math.min(used, values.length) / values.length) * 100}%` }} /></div>
          <strong className="tabular small">{Math.min(used, values.length)}</strong>
        </div>
        <p className="xsmall subtle">Linear search needs {linear} {linear === 1 ? 'check' : 'checks'} for this target and up to {values.length} in the worst case. Binary search never needs more than {limit}.</p>
      </div>

      <div className="w-legend">
        <span><i className="bs-key range" />Still possible</span>
        <span><i className="bs-key out" />Ruled out</span>
        <span><span className="bs-tag L">L</span> low</span>
        <span><span className="bs-tag M">M</span> last probe</span>
        <span><span className="bs-tag H">H</span> high</span>
        <span><i className="bs-key found" />Target</span>
      </div>

      {over && (
        <div className="callout warn bs-why">
          <span>
            <strong>Why the exact middle guarantees {limit} probes.</strong> A middle probe leaves at most half of the boxes, so the worst case shrinks like this:{' '}
            <span className="mono">{chain.join(' → ')}</span>. That is {chain.length} probes at most. An off-center probe can leave you with the bigger side, so the range shrinks more slowly and you can run past the limit.
          </span>
        </div>
      )}
    </div>
  )
}
