import { useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Eye, Shuffle } from 'lucide-react'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { TYPES, classify, compress, compressSteps, diagnose, drillSet, eui64, expand, parseIpv6, parseMac, withPrefix } from '../lib/ipv6-tool'
import './ipv6-tool.css'

const GOAL = 5

/** The two shortening rules, shown on the eight groups. */
function Steps({ hextets }) {
  const s = compressSteps(hextets)
  const inBest = (i) => s.best && i >= s.best.start && i < s.best.start + s.best.len
  const runOf = (i) => s.runs.find((r) => i >= r.start && i < r.start + r.len)
  return (
    <div className="v6-steps">
      <div className="v6-step" style={{ '--i': 0 }}>
        <span className="v6-step-label">Full form</span>
        <div className="v6-groups">
          {s.groups.map((g, i) => (
            <span key={i} className="v6-chip">
              {g.dropped > 0 && <span className="v6-lz">{g.full.slice(0, g.dropped)}</span>}
              {g.full.slice(g.dropped)}
            </span>
          ))}
        </div>
      </div>
      <div className="v6-step" style={{ '--i': 1 }}>
        <span className="v6-step-label">Rule 1: drop leading zeros in each group</span>
        <div className="v6-groups">
          {s.groups.map((g, i) => (
            <span key={i} className={`v6-chip${g.dropped ? ' trimmed' : ''}`}>{g.short}</span>
          ))}
        </div>
      </div>
      <div className="v6-step" style={{ '--i': 2 }}>
        <span className="v6-step-label">
          Rule 2: {s.best ? `replace the longest run of zero groups (${s.best.len} groups) with ::` : 'no run of two or more zero groups, so no ::'}
          {s.tie ? '. Two runs tie, so the first one wins.' : ''}
        </span>
        <div className="v6-groups">
          {s.groups.map((g, i) => {
            const run = runOf(i)
            const cls = inBest(i) ? ' best' : run && run.len >= 2 ? ' runner' : run ? ' lone' : ''
            return (
              <span key={i} className={`v6-chip${cls}`}>
                {inBest(i) ? (i === s.best.start ? '::' : '') : g.short}
              </span>
            )
          })}
        </div>
      </div>
      <div className="v6-result" style={{ '--i': 3 }}>
        <span className="v6-step-label">Shortest form</span>
        <strong className="mono">{s.result}</strong>
      </div>
    </div>
  )
}

function TypeCard({ hextets }) {
  const t = classify(hextets)
  return (
    <div className="v6-types">
      <div className="v6-type-now">
        <span className="v6-step-label">Address type</span>
        <strong>{t.name}</strong> {t.prefix && <code>{t.prefix}</code>}
        <p className="small">{t.note} {t.extra}</p>
      </div>
      <ul className="v6-type-list" aria-label="IPv6 address types">
        {TYPES.filter((x) => x.id !== 'other').map((x) => (
          <li key={x.id} className={x.id === t.id ? 'on' : ''}>
            <code>{x.prefix}</code>
            <span>{x.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Drill({ onComplete, standalone }) {
  const [set, setSet] = useState(() => drillSet())
  const [round, setRound] = useState(0)
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState({ status: 'asking', issues: [] })
  const [solved, setSolved] = useState(0)
  const [combo, setCombo] = useState(0)
  const [misses, setMisses] = useState(0)
  const cardRef = useRef(null)
  const inputRef = useRef(null)
  const doneRef = useRef(false)
  const item = set[round % set.length]

  const check = (e) => {
    e?.preventDefault()
    if (state.status !== 'asking' || !answer.trim()) return
    const d = diagnose(answer, item.hextets)
    if (d.correct) {
      const next = solved + 1
      setSolved(next)
      setCombo((c) => c + 1)
      feedbackCorrect(cardRef.current, { combo })
      setState({ status: 'right', issues: [] })
      if (next >= GOAL && !doneRef.current) {
        doneRef.current = true
        onComplete?.({ score: GOAL / (GOAL + misses) })
      }
    } else {
      setCombo(0)
      setMisses((m) => m + 1)
      feedbackWrong(cardRef.current)
      setState({ status: 'asking', issues: d.issues, same: d.same })
    }
  }

  const reveal = () => {
    sfx.flip()
    setCombo(0)
    setState({ status: 'revealed', issues: [] })
  }

  const next = () => {
    sfx.tap()
    setAnswer('')
    setState({ status: 'asking', issues: [] })
    if (round + 1 >= set.length) {
      setSet(drillSet())
      setRound(0)
    } else setRound((r) => r + 1)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const showSteps = state.status !== 'asking'
  return (
    <div className="v6-drill">
      <div className="w-toolbar">
        <span className="small">Compress this address</span>
        <span className="grow" />
        <span className="chip outline tabular">{Math.min(solved, GOAL)} / {GOAL}</span>
        {combo >= 2 && <span className="chip accent">{combo} in a row</span>}
        {standalone && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setSet(drillSet()); setRound(0); setAnswer(''); setState({ status: 'asking', issues: [] }) }}>
            <Shuffle size={14} /> New set
          </button>
        )}
      </div>
      <div className="w-stage v6-card" ref={cardRef}>
        <div className="v6-full" aria-label={`Full address ${expand(item.hextets)}`}>
          {expand(item.hextets).split(':').map((g, i) => (
            <span key={`${round}-${i}`} className={`v6-full-group${g === '0000' ? ' zero' : ''}`} style={{ '--i': i }}>{g}</span>
          ))}
        </div>
        <form className="v6-answer" onSubmit={check}>
          <label className="sr-only" htmlFor="v6-answer-input">Your compressed address</label>
          <input
            id="v6-answer-input"
            ref={inputRef}
            className={`input lg mono${state.status === 'right' ? ' is-correct' : state.issues.length ? ' is-wrong' : ''}`}
            value={answer}
            onChange={(e) => { setAnswer(e.target.value); sfx.key() }}
            placeholder="Shortest form, like 2001:DB8::1"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            readOnly={state.status !== 'asking'}
          />
          {state.status === 'asking' ? (
            <button type="submit" className="btn btn-primary"><Check size={16} /> Check</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={next}>Next <ArrowRight size={16} /></button>
          )}
        </form>
      </div>
      <div aria-live="polite">
        {state.status === 'right' && <p className="w-feedback good">Right: {compress(item.hextets)}. Here is the working.</p>}
        {state.status === 'revealed' && <p className="w-feedback">The answer is <strong className="mono">{compress(item.hextets)}</strong>. Read the steps, then try the next one.</p>}
        {state.status === 'asking' && state.issues.length > 0 && (
          <div className="w-feedback bad">
            <p className="v6-issue-head">{state.same ? 'Same address, but not the shortest form yet.' : 'Not quite.'}</p>
            <ul className="v6-issues">
              {state.issues.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        )}
      </div>
      {state.status === 'asking' && state.issues.length > 0 && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={reveal}><Eye size={14} /> Show me</button>
      )}
      {showSteps && <Steps key={round} hextets={item.hextets} />}
    </div>
  )
}

function Explore() {
  const [text, setText] = useState('2001:0db8:0000:0000:0000:ff00:0042:8329')
  const parsed = useMemo(() => parseIpv6(text), [text])
  const samples = ['2001:0db8:0000:0000:0000:ff00:0042:8329', 'FE00:0000:0000:0001:0000:0000:0000:0056', '2001:db8:0:0:1:0:0:1', 'fe80::1', 'ff02::1:ff00:1', 'fd00::abcd', '::1']
  return (
    <div className="v6-explore">
      <label className="v6-field">
        <span className="xsmall subtle">IPv6 address, full or shortened</span>
        <input className={`input mono${parsed.ok ? '' : ' is-wrong'}`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off" />
      </label>
      <div className="v6-samples" role="group" aria-label="Examples">
        {samples.map((s) => (
          <button key={s} type="button" className="chip outline v6-sample" onClick={() => { sfx.tap(); setText(s) }}>{s}</button>
        ))}
      </div>
      <div aria-live="polite">
        {parsed.ok ? (
          <div className="v6-explore-out">
            <div className="v6-full-line"><span className="v6-step-label">Expanded</span><code>{expand(parsed.hextets)}</code></div>
            <Steps key={expand(parsed.hextets)} hextets={parsed.hextets} />
            <TypeCard hextets={parsed.hextets} />
          </div>
        ) : (
          <p className="w-feedback bad">{parsed.error}</p>
        )}
      </div>
    </div>
  )
}

function Eui64() {
  const [mac, setMac] = useState('0013.1234.ABCD')
  const [prefix, setPrefix] = useState('2001:DB8:1:1::')
  const bytes = parseMac(mac)
  const pre = parseIpv6(prefix.replace(/\/\d+$/, ''))
  const r = bytes ? eui64(bytes) : null
  const full = r && pre.ok ? withPrefix(pre.hextets, r.hextets) : null
  const ll = r ? withPrefix([0xfe80, 0, 0, 0], r.hextets) : null
  return (
    <div className="v6-eui">
      <div className="v6-eui-inputs">
        <label className="v6-field">
          <span className="xsmall subtle">MAC address</span>
          <input className={`input mono${bytes ? '' : ' is-wrong'}`} value={mac} onChange={(e) => setMac(e.target.value)} spellCheck={false} autoComplete="off" />
        </label>
        <label className="v6-field">
          <span className="xsmall subtle">/64 prefix</span>
          <input className={`input mono${pre.ok ? '' : ' is-wrong'}`} value={prefix} onChange={(e) => setPrefix(e.target.value)} spellCheck={false} autoComplete="off" />
        </label>
      </div>
      {!bytes && <p className="w-feedback bad" aria-live="polite">Type a MAC like 0013.1234.ABCD or 00:13:12:34:ab:cd.</p>}
      {r && (
        <ol className="v6-eui-steps" key={r.text} aria-live="polite">
          <li style={{ '--i': 0 }}>
            <span className="v6-step-label">1. Split the MAC in half</span>
            <div className="v6-bytes">
              {r.oui.map((b, i) => <span key={`o${i}`} className="v6-byte">{b}</span>)}
              <span className="v6-split" aria-hidden="true">|</span>
              {r.nic.map((b, i) => <span key={`n${i}`} className="v6-byte">{b}</span>)}
            </div>
          </li>
          <li style={{ '--i': 1 }}>
            <span className="v6-step-label">2. Insert FFFE in the middle</span>
            <div className="v6-bytes">
              {r.oui.map((b, i) => <span key={`o${i}`} className={`v6-byte${i === 0 ? ' first' : ''}`}>{b}</span>)}
              <span className="v6-byte fffe">FF</span>
              <span className="v6-byte fffe">FE</span>
              {r.nic.map((b, i) => <span key={`n${i}`} className="v6-byte">{b}</span>)}
            </div>
          </li>
          <li style={{ '--i': 2 }}>
            <span className="v6-step-label">3. Flip the 7th bit of the first byte (the universal/local bit)</span>
            <div className="v6-bits-row">
              <span className="mono">{r.firstByteBefore}</span>
              <span className="v6-bits" aria-label={`${r.firstBefore} becomes ${r.firstAfter}`}>
                {[...r.firstBefore].map((b, i) => <span key={i} className={i === 6 ? 'flip' : ''}>{b}</span>)}
              </span>
              <ArrowRight size={14} aria-hidden="true" />
              <span className="v6-bits">
                {[...r.firstAfter].map((b, i) => <span key={i} className={i === 6 ? 'flip on' : ''}>{b}</span>)}
              </span>
              <span className="mono v6-strong">{r.firstByteAfter}</span>
            </div>
            <p className="xsmall subtle">Bit 7 counts from the left. Flipping it adds or subtracts 2 in the first byte: {r.firstByteBefore} becomes {r.firstByteAfter}.</p>
          </li>
          <li style={{ '--i': 3 }}>
            <span className="v6-step-label">4. Interface ID (64 bits)</span>
            <code className="v6-strong">{r.text}</code>
          </li>
          <li style={{ '--i': 4 }}>
            <span className="v6-step-label">5. Add the prefix</span>
            {full ? <code className="v6-strong">{compress(full)}</code> : <span className="small subtle">Type a valid prefix, like 2001:DB8:1:1::</span>}
            <span className="xsmall subtle">Link-local from the same ID: <code>{compress(ll)}</code></span>
            {pre.ok && <span className="xsmall subtle">Configured with <code>ipv6 address {compress(withPrefix(pre.hextets, [0, 0, 0, 0]))}/64 eui-64</code></span>}
          </li>
        </ol>
      )}
    </div>
  )
}

/** IPv6 compression drill, explorer and EUI-64 builder. */
export default function Ipv6Tool({ onComplete, standalone }) {
  const [tab, setTab] = useState('drill')
  const tabs = [
    ['drill', 'Compress drill'],
    ['explore', 'Explore'],
    ['eui', 'EUI-64']
  ]
  return (
    <div className="v6">
      <div className="w-pill-group v6-tabs" role="tablist" aria-label="IPv6 tool sections">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => { sfx.tap(); setTab(id) }}>
            {label}
          </button>
        ))}
      </div>
      <div hidden={tab !== 'drill'}><Drill onComplete={onComplete} standalone={standalone} /></div>
      {tab === 'explore' && <Explore />}
      {tab === 'eui' && <Eui64 />}
    </div>
  )
}
