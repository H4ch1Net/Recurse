import { useLayoutEffect, useRef, useState } from 'react'
import { Dice5, Expand, Plus, Search } from 'lucide-react'
import { burstFrom, feedbackSuccess, feedbackWrong, floatText } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { RESIZE_AT, SAMPLE_KEYS, countKeys, emptyTable, hashOf, insert, letters, loadFactor, longestChain, lookup, needsResize, resize } from '../lib/hash-table'
import './hash-table.css'

const clampBuckets = (n) => Math.max(4, Math.min(16, Math.round(Number(n)) || 4))
const cleanKey = (text) => String(text).trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Hash keys into buckets with the arithmetic on show, chain collisions, and resize when it gets crowded. */
export default function HashTable({ props, onComplete, standalone }) {
  const startBuckets = clampBuckets(props.buckets)
  const maxKeys = standalone ? 32 : 20
  const maxBuckets = standalone ? 64 : 32
  const [table, setTable] = useState(() => emptyTable(startBuckets))
  const [mode, setMode] = useState('insert')
  const [input, setInput] = useState('')
  const [last, setLast] = useState(null)
  const [moves, setMoves] = useState(null)
  const [resizes, setResizes] = useState(0)
  const [message, setMessage] = useState({ text: 'Type a key such as cat and press Insert, or try a random one.', tone: '' })
  const bucketsRef = useRef(null)
  const meterRef = useRef(null)
  const flip = useRef(null)
  const seq = useRef(0)

  // Animate keys from their old bucket to their new one after a resize (FLIP).
  useLayoutEffect(() => {
    const before = flip.current
    flip.current = null
    if (!before || !bucketsRef.current || reducedMotion()) return
    let k = 0
    for (const el of bucketsRef.current.querySelectorAll('[data-key]')) {
      const old = before.get(el.dataset.key)
      if (!old || !el.animate) continue
      const now = el.getBoundingClientRect()
      const dx = old.left - now.left
      const dy = old.top - now.top
      if (Math.abs(dx) + Math.abs(dy) < 2) continue
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)`, zIndex: 2 }, { transform: 'none', zIndex: 2 }],
        { duration: 560, delay: k++ * 70, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)', fill: 'backwards' }
      )
    }
  }, [table])

  const keys = countKeys(table)
  const lf = loadFactor(table)
  const crowded = needsResize(table)

  const doInsert = (raw) => {
    const key = cleanKey(raw)
    if (!key) {
      setMessage({ text: 'Type a key made of letters or digits.', tone: 'bad' })
      return
    }
    if (keys >= maxKeys) {
      feedbackWrong(bucketsRef.current)
      setMessage({ text: `That is plenty of keys for one table (${maxKeys}). Look some up instead.`, tone: 'bad' })
      return
    }
    const r = insert(table, key)
    const h = hashOf(key, table.length)
    seq.current += 1
    setLast({ kind: r.duplicate ? 'dup' : 'insert', key, hash: h, index: r.index, n: seq.current, collision: r.collision, comparisons: r.comparisons })
    setInput('')
    setMoves(null)
    if (r.duplicate) {
      sfx.error()
      setMessage({ text: `${key} is already in bucket ${r.index}. A hash table stores each key once, so nothing changes.`, tone: 'bad' })
      return
    }
    setTable(r.table)
    const nextLf = countKeys(r.table) / r.table.length
    const passed = nextLf > RESIZE_AT && lf <= RESIZE_AT
    if (r.collision) {
      sfx.tap()
      const twin = r.chainBefore.find((k) => letters(k) === letters(key))
      const anagram = twin ? ` ${key} and ${twin} use the same letters, so this simple hash always sends them to the same bucket. Real hash functions also mix in letter positions.` : ''
      setMessage({ text: `Collision! Bucket ${r.index} already holds ${r.chainBefore.join(', ')}, so ${key} joins the end of its chain.${anagram}`, tone: 'warn' })
    } else {
      sfx.pop()
      setMessage({ text: `${key} hashes to bucket ${r.index}, which was empty. Inserting is O(1) on average.`, tone: '' })
    }
    if (passed) {
      setMessage((m) => ({ text: `${m.text} The load factor just passed ${RESIZE_AT}: chains will start getting long. Time to resize.`, tone: 'warn' }))
      floatText(meterRef.current, `Load ${nextLf.toFixed(2)}`, { tone: 'warn' })
    }
  }

  const doLookup = (raw) => {
    const key = cleanKey(raw)
    if (!key) {
      setMessage({ text: 'Type the key you want to find.', tone: 'bad' })
      return
    }
    const r = lookup(table, key)
    seq.current += 1
    setLast({ kind: 'lookup', key, hash: hashOf(key, table.length), index: r.index, n: seq.current, path: r.path, found: r.found, comparisons: r.comparisons })
    setMoves(null)
    if (r.found) {
      sfx.pop()
      setMessage({ text: `The hash points straight to bucket ${r.index}. Found ${key} after ${r.comparisons} ${r.comparisons === 1 ? 'comparison' : 'comparisons'}${r.path.length > 1 ? `, checking ${r.path.slice(0, -1).join(', ')} first` : ''}. A plain list could need up to ${keys}.`, tone: 'good' })
    } else {
      sfx.tap()
      setMessage({ text: `Bucket ${r.index} ${r.path.length ? `holds ${r.path.join(', ')} but not ${key}` : 'is empty'}, so ${key} is not in the table. That took ${r.comparisons} ${r.comparisons === 1 ? 'comparison' : 'comparisons'}, without looking at any other bucket.`, tone: '' })
    }
  }

  const submit = () => (mode === 'insert' ? doInsert(input) : doLookup(input))

  const randomKey = () => {
    const present = new Set(table.flat())
    const pool = SAMPLE_KEYS.filter((k) => !present.has(k))
    if (!pool.length) return
    doInsert(pool[Math.floor(Math.random() * pool.length)])
  }

  const doResize = () => {
    if (table.length * 2 > maxBuckets) {
      setMessage({ text: `This table is already at ${table.length} buckets, as big as it gets here.`, tone: 'bad' })
      return
    }
    if (bucketsRef.current) {
      flip.current = new Map([...bucketsRef.current.querySelectorAll('[data-key]')].map((el) => [el.dataset.key, el.getBoundingClientRect()]))
    }
    const before = table.length
    const longestBefore = longestChain(table)
    const r = resize(table)
    setTable(r.table)
    setMoves(r.moves)
    setLast(null)
    setResizes(resizes + 1)
    sfx.flip()
    const moved = r.moves.filter((m) => m.from !== m.to).length
    setMessage({
      text: `Doubled from ${before} to ${r.table.length} buckets and rehashed all ${r.moves.length} keys. ${moved} moved to a new bucket. Load factor is now ${loadFactor(r.table).toFixed(2)} and the longest chain went from ${longestBefore} to ${longestChain(r.table)}.`,
      tone: 'good'
    })
    if (resizes === 0) {
      feedbackSuccess(meterRef.current, 'Resized!')
      burstFrom(bucketsRef.current, { kind: 'stars', count: 24 })
      onComplete({ score: 1 })
    }
  }

  const changeStart = (n) => {
    sfx.flip()
    setTable(emptyTable(n))
    setLast(null)
    setMoves(null)
    setMessage({ text: `Fresh table with ${n} buckets.`, tone: '' })
  }

  const meterMax = Math.max(1.5, lf)
  const target = last && last.kind !== 'dup' ? last.index : null

  return (
    <div className="ht">
      <div className="w-toolbar ht-tools">
        <div className="w-pill-group" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'insert'} onClick={() => setMode('insert')}>Insert</button>
          <button type="button" aria-pressed={mode === 'lookup'} onClick={() => setMode('lookup')}>Look up</button>
        </div>
        <input
          className="input ht-input"
          value={input}
          maxLength={8}
          placeholder={mode === 'insert' ? 'cat' : 'key to find'}
          aria-label={mode === 'insert' ? 'Key to insert' : 'Key to look up'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
          {mode === 'insert' ? <><Plus size={14} /> Insert</> : <><Search size={14} /> Find</>}
        </button>
        {mode === 'insert' && <button type="button" className="btn btn-sm btn-ghost" onClick={randomKey}><Dice5 size={14} /> Random key</button>}
        {standalone && (
          <label className="w-slider ht-start">
            <span>Start with</span>
            <select className="select" value={table.length} onChange={(e) => changeStart(Number(e.target.value))} aria-label="Bucket count">
              {[...new Set([4, 5, 7, 8, table.length])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} buckets</option>)}
            </select>
          </label>
        )}
      </div>

      {last && (
        <div key={last.n} className="ht-hash" aria-label={`hash of ${last.key}`}>
          <span className="ht-hash-label xsmall">hash("{last.key}")</span>
          <div className="ht-codes">
            {last.hash.codes.map((c, k) => (
              <span key={k} className="ht-code" style={{ animationDelay: `${k * 60}ms` }}>
                <span className="ht-ch">{c.ch}</span>
                <span className="ht-num">{c.code}</span>
              </span>
            )).reduce((acc, el, k) => (k ? [...acc, <span key={`p${k}`} className="ht-op">+</span>, el] : [el]), [])}
            <span className="ht-op">=</span>
            <span className="ht-sum mono">{last.hash.sum}</span>
          </div>
          <div className="ht-mod mono">
            {last.hash.sum} mod {table.length} = <strong>{last.hash.index}</strong>
            <span className="ht-arrow"> → bucket {last.hash.index}</span>
          </div>
        </div>
      )}

      <div className="w-stage ht-stage" ref={bucketsRef}>
        <ol className="ht-buckets" start="0" aria-label={`${table.length} buckets`}>
          {table.map((chain, b) => {
            const isTarget = target === b
            return (
              <li key={b} className={`ht-bucket${isTarget ? ' target' : ''}`}>
                {isTarget && <span key={last.n} className="ht-flash" aria-hidden="true" />}
                <span className="ht-index mono">{b}</span>
                <span className="ht-chain">
                  {chain.length === 0 && <span className="ht-nil mono">empty</span>}
                  {chain.map((key, k) => {
                    const pathIndex = last?.kind === 'lookup' && isTarget ? last.path.indexOf(key) : -1
                    const isFound = pathIndex !== -1 && last.found && key === last.key
                    const isNew = last?.kind === 'insert' && key === last.key
                    const moved = moves?.find((m) => m.key === key)
                    return (
                      <span key={key} className="ht-link">
                        {k > 0 && <span className="ht-next" aria-hidden="true">→</span>}
                        <span
                          key={pathIndex !== -1 ? `${key}-${last.n}` : key}
                          data-key={key}
                          className={`ht-key mono${isNew ? ' fresh' : ''}${pathIndex !== -1 ? ' compared' : ''}${isFound ? ' found' : ''}${moved && moved.from !== moved.to ? ' moved' : ''}`}
                          style={pathIndex !== -1 ? { animationDelay: `${pathIndex * 260}ms` } : undefined}
                        >
                          {key}
                        </span>
                      </span>
                    )
                  })}
                  {last?.kind === 'lookup' && isTarget && !last.found && <span className="ht-miss mono" style={{ animationDelay: `${last.path.length * 260}ms` }}>not here</span>}
                </span>
                <span className="ht-len xsmall tabular" aria-label={`${chain.length} keys`}>{chain.length || ''}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className={`ht-meter${crowded ? ' crowded' : ''}`} ref={meterRef}>
        <div className="row between xsmall">
          <span>Load factor = {keys} keys ÷ {table.length} buckets = <strong className="tabular">{lf.toFixed(2)}</strong></span>
          <span className="subtle">resize above {RESIZE_AT}</span>
        </div>
        <div className="ht-track" role="meter" aria-valuemin={0} aria-valuemax={meterMax} aria-valuenow={Number(lf.toFixed(2))} aria-label="Load factor">
          <span className="ht-fill" style={{ width: `${(Math.min(lf, meterMax) / meterMax) * 100}%` }} />
          <span className="ht-limit" style={{ left: `${(RESIZE_AT / meterMax) * 100}%` }} />
        </div>
      </div>

      {crowded && (
        <div className="callout warn ht-resize">
          <span className="grow">
            <strong>The table is getting crowded.</strong> With more keys than {RESIZE_AT} per bucket, chains grow and lookups slow down. Doubling the buckets spreads the keys out again.
          </span>
          <button type="button" className="btn btn-primary ht-resize-btn" onClick={doResize}><Expand size={15} /> Resize (double buckets and rehash)</button>
        </div>
      )}

      <p className={`w-feedback ${message.tone === 'warn' ? 'ht-warn' : message.tone}`} aria-live="polite">{message.text}</p>

      <div className="w-readout">
        <div className="w-stat"><span>Keys</span><strong>{keys}</strong></div>
        <div className="w-stat"><span>Buckets</span><strong>{table.length}</strong></div>
        <div className="w-stat"><span>Longest chain</span><strong>{longestChain(table)}</strong></div>
        {last?.kind === 'lookup' && <div className="w-stat"><span>Last lookup</span><strong>{last.comparisons} {last.comparisons === 1 ? 'comparison' : 'comparisons'}</strong></div>}
      </div>

      {moves && moves.length > 0 && (
        <details className="ht-moves" open={!standalone || moves.length <= 8}>
          <summary className="small">Rehash details: every key gets a new bucket number</summary>
          <ul>
            {moves.map((m) => (
              <li key={m.key} className={`mono xsmall${m.from !== m.to ? ' moved' : ''}`}>
                {m.key}: {m.sum} mod {table.length} = {m.to} <span className="subtle">(was {m.from}){m.from !== m.to ? ', moved' : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="w-legend">
        <span><i className="ht-k fresh" />Just inserted</span>
        <span><i className="ht-k compared" />Compared during lookup</span>
        <span><i className="ht-k found" />Found</span>
        <span><i className="ht-k moved" />Moved by the resize</span>
      </div>
    </div>
  )
}
