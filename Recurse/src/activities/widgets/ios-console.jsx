import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Clock, Eye, Lightbulb, RotateCcw, Router, Server, Stethoscope, Trophy, Wrench, X } from 'lucide-react'
import { feedbackSuccess } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { CONSOLE_LABS, getConsoleLab, labScore } from '../lib/ios/labs.js'
import { bootLines, complete, createLabSim, createSim, gradeLab, helpLines, interrupt, modeLabel, promptFor, runLine } from '../lib/ios/sim.js'
import { explainCommand } from '../lib/ios/help.js'
import './ios-console.css'

const MAX_LINES = 800

// ---------- free sandbox ----------

const SANDBOX = {
  router: {
    env: {
      connected: ['Gi0/0', 'Gi0/1'],
      neighbors: [
        { port: 'Gi0/0', device: 'SW1', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I' },
        { port: 'Gi0/0', kind: 'host', device: 'PC1', ip: '192.168.1.10', mac: '0050.7966.6801' },
        { port: 'Gi0/1', device: 'R2', remotePort: 'GigabitEthernet0/1', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.12.2', behind: ['192.168.2.0/24', '0.0.0.0/0'], ospf: { rid: '2.2.2.2', area: 0, routes: [{ prefix: '192.168.2.0/24', cost: 1 }] } }
      ]
    },
    topology: [
      { device: 'R1', port: 'G0/0', address: 'Try 192.168.1.1 /24', link: 'SW1, PC1 at 192.168.1.10' },
      { device: 'R1', port: 'G0/1', address: 'Try 10.0.12.1 /30', link: 'R2 at 10.0.12.2, OSPF area 0' }
    ],
    chips: ['show ip interface brief', 'show running-config', 'show ip route', 'show cdp neighbors', 'show version']
  },
  switch: {
    env: {
      connected: ['Gi0/1', 'Gi0/2', 'Gi0/24'],
      neighbors: [
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' },
        { port: 'Gi0/2', kind: 'host', device: 'PC2', ip: '10.0.20.12', mac: '0050.7966.6802' },
        { port: 'Gi0/24', device: 'SW2', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I', lldp: true, trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.9a00' } }
      ]
    },
    topology: [
      { device: 'SW1', port: 'G0/1', address: 'Access', link: 'PC1' },
      { device: 'SW1', port: 'G0/2', address: 'Access', link: 'PC2' },
      { device: 'SW1', port: 'G0/24', address: 'Trunk (SW2 side)', link: 'SW2 G0/24' }
    ],
    chips: ['show vlan brief', 'show interfaces status', 'show interfaces trunk', 'show spanning-tree', 'show mac address-table']
  }
}

const SANDBOX_TASKS = [
  { label: 'Enter privileged EXEC with enable', test: (d, s) => s.stats.enable, hint: 'Type enable (en works too) at the > prompt.' },
  { label: 'Ask the CLI for help with ?', test: (d, s) => s.stats.help > 0, hint: 'Press ? on its own, or after part of a word, like sh?' },
  { label: 'Enter global configuration mode', test: (d, s) => s.stats.config, hint: 'From the # prompt: configure terminal (conf t).' },
  { label: 'Give the device a new hostname', test: (d) => d.hostname !== 'Router' && d.hostname !== 'Switch', hint: 'In global config: hostname R1' },
  { label: 'Verify with a show command', test: (d, s) => s.stats.shows > 0, hint: 'show ip interface brief, or do show ip interface brief while in config mode.' }
]

const TIP = { kind: 'dim', text: 'Type commands like on a real Cisco device. ? shows help, Tab completes, Up and Down recall history, Ctrl+Z leaves config mode.' }

function gradeSandbox(sim) {
  return SANDBOX_TASKS.map((t) => ({ label: t.label, hint: t.hint, pass: Boolean(t.test(sim.dev, sim)) }))
}

function makeSim(lab, device) {
  return lab ? createLabSim(lab) : createSim({ kind: device, env: SANDBOX[device].env })
}

let lineId = 0
const tag = (lines) => lines.map((l) => ({ ...l, id: ++lineId }))

/** A simulated Cisco router or switch console with live-graded lab checks. */
export default function IosConsole({ props, onComplete, standalone }) {
  const initial = getConsoleLab(props?.lab)
  const [labId, setLabId] = useState(initial?.id ?? '')
  const [device, setDevice] = useState(props?.device === 'switch' ? 'switch' : 'router')
  const lab = labId ? getConsoleLab(labId) : null
  const builds = CONSOLE_LABS.filter((l) => l.kind === 'build')
  const fixes = CONSOLE_LABS.filter((l) => l.kind === 'troubleshoot')

  return (
    <div className="iosc">
      {(standalone || !lab) && (
        <div className="w-toolbar iosc-toolbar">
          {standalone && (
            <label className="iosc-pick">
              <span className="small subtle">Lab</span>
              <select className="select" value={labId} onChange={(e) => setLabId(e.target.value)}>
                <option value="">Free sandbox</option>
                <optgroup label="Build it">
                  {builds.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Find and fix">
                  {fixes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          )}
          {!lab && (
            <div className="w-pill-group" role="group" aria-label="Device">
              <button type="button" aria-pressed={device === 'router'} onClick={() => setDevice('router')}>
                <Router size={13} /> Router
              </button>
              <button type="button" aria-pressed={device === 'switch'} onClick={() => setDevice('switch')}>
                <Server size={13} /> Switch
              </button>
            </div>
          )}
        </div>
      )}
      <Console key={lab ? lab.id : `sandbox-${device}`} lab={lab} device={device} onComplete={onComplete} />
    </div>
  )
}

function Console({ lab, device, onComplete }) {
  const [sim, setSim] = useState(() => makeSim(lab, device))
  const grade = (s) => (lab ? gradeLab(lab, s) : gradeSandbox(s))

  const [lines, setLines] = useState(() => tag([...bootLines(sim), TIP]))
  const [input, setInput] = useState('')
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const [draft, setDraft] = useState('')
  const [grades, setGrades] = useState(() => grade(sim))
  const [openHints, setOpenHints] = useState(() => new Set())
  const [revealed, setRevealed] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [announce, setAnnounce] = useState('')

  const screenRef = useRef(null)
  const inputRef = useRef(null)
  const rowRefs = useRef([])
  const gradesRef = useRef(grades)
  const doneRef = useRef(false)
  const pendingCaret = useRef(null)

  const prompt = promptFor(sim)
  const masked = Boolean(sim.pending?.secret)
  const solution = lab?.solution ?? []
  const score = labScore({ hints: openHints.size, solutionSteps: revealed })

  useEffect(() => {
    const el = screenRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    // Wide show output scrolls sideways on a phone; new output starts back at the prompt.
    el.scrollLeft = 0
  }, [lines, input])

  useLayoutEffect(() => {
    if (pendingCaret.current == null || !inputRef.current) return
    const at = pendingCaret.current
    pendingCaret.current = null
    inputRef.current.setSelectionRange(at, at)
  })

  const append = (more) => setLines((prev) => [...prev, ...tag(more)].slice(-MAX_LINES))

  const setValue = (value) => {
    setInput(value)
    setCaret(value.length)
    pendingCaret.current = value.length
  }

  const focusInput = () => inputRef.current?.focus({ preventScroll: true })

  /** Re-grade after anything that can change the device, and celebrate new passes. */
  const regrade = () => {
    const next = grade(sim)
    const prev = gradesRef.current
    const notes = []
    next.forEach((r, i) => {
      if (r.pass && !prev[i]?.pass) {
        notes.push({ kind: 'ok', text: `% Lab check passed: ${r.label}` })
        const row = rowRefs.current[i]
        if (row) feedbackSuccess(row, 'Passed')
        setAnnounce(`Check passed: ${r.label}`)
      } else if (!r.pass && prev[i]?.pass) {
        notes.push({ kind: 'dim', text: `% Lab check no longer passing: ${r.label}` })
      }
    })
    gradesRef.current = next
    setGrades(next)
    if (next.length && next.every((r) => r.pass) && !doneRef.current) {
      doneRef.current = true
      setDone(true)
      notes.push({ kind: 'ok', text: lab ? '% All lab checks passed. Nicely done.' : '% Warm-up complete. The console is yours to explore.' })
      const finalScore = labScore({ hints: openHints.size, solutionSteps: revealed })
      onComplete?.({ score: finalScore, detail: lab ? `${lab.title}: ${openHints.size} hint(s), ${revealed} solution step(s)` : 'IOS sandbox warm-up' })
    }
    return notes
  }

  const submit = (text) => {
    const wasPending = Boolean(sim.pending)
    const secret = Boolean(sim.pending?.secret)
    const before = promptFor(sim)
    const res = runLine(sim, text)
    const echo = { kind: 'echo', prompt: before, text: secret ? '' : text }
    if (!wasPending && text.trim()) setHistory((h) => (h[h.length - 1] === text ? h : [...h, text].slice(-50)))
    setHistIdx(-1)
    setDraft('')
    setValue('')
    sfx.key()
    append([echo, ...res.lines, ...regrade()])
  }

  const showHelp = (text) => {
    const out = helpLines(sim, text).map((l) => ({ kind: /^\s*(%|\^|\s+\^)/.test(l) ? 'err' : 'out', text: l }))
    append([{ kind: 'echo', prompt, text: `${text}?` }, ...out, ...regrade()])
  }

  const ctrl = (key) => {
    const res = interrupt(sim, key)
    append([{ kind: 'echo', prompt, text: `${masked ? '' : input}^${key.toUpperCase()}` }, ...res.lines, ...regrade()])
    setValue('')
    setHistIdx(-1)
  }

  const tab = () => {
    const next = complete(sim, input)
    if (next !== input) setValue(next)
  }

  const recall = (dir) => {
    if (!history.length || sim.pending) return
    if (dir < 0) {
      const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1)
      if (histIdx === -1) setDraft(input)
      setHistIdx(idx)
      setValue(history[idx])
    } else {
      if (histIdx === -1) return
      const idx = histIdx + 1
      if (idx >= history.length) {
        setHistIdx(-1)
        setValue(draft)
      } else {
        setHistIdx(idx)
        setValue(history[idx])
      }
    }
  }

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return
    const k = e.key
    if (k === 'Enter') {
      e.preventDefault()
      submit(input)
    } else if (k === 'Tab') {
      e.preventDefault()
      tab()
    } else if (k === '?' && !sim.pending) {
      e.preventDefault()
      showHelp(input.slice(0, caret))
    } else if (k === 'ArrowUp' || (e.ctrlKey && k.toLowerCase() === 'p')) {
      e.preventDefault()
      recall(-1)
    } else if (k === 'ArrowDown' || (e.ctrlKey && k.toLowerCase() === 'n')) {
      e.preventDefault()
      recall(1)
    } else if (e.ctrlKey && !e.metaKey && k.toLowerCase() === 'z') {
      e.preventDefault()
      ctrl('z')
    } else if (e.ctrlKey && !e.metaKey && k.toLowerCase() === 'c') {
      const el = inputRef.current
      if (el && el.selectionStart !== el.selectionEnd) return
      e.preventDefault()
      ctrl('c')
    } else if (e.ctrlKey && k.toLowerCase() === 'a') {
      e.preventDefault()
      setCaret(0)
      pendingCaret.current = 0
    } else if (e.ctrlKey && k.toLowerCase() === 'e') {
      e.preventDefault()
      setCaret(input.length)
      pendingCaret.current = input.length
    } else if (e.ctrlKey && k.toLowerCase() === 'u') {
      e.preventDefault()
      setValue('')
    }
  }

  const onChange = (e) => {
    const value = e.target.value
    // Phones often skip keydown for "?", so catch it here: IOS answers ? without Enter.
    if (!sim.pending && value.includes('?')) {
      const at = value.indexOf('?')
      const clean = value.replace(/\?/g, '')
      setValue(clean)
      showHelp(clean.slice(0, at))
      return
    }
    setInput(value)
    setCaret(e.target.selectionStart ?? value.length)
  }

  const typeCommand = (cmd) => {
    setValue(cmd)
    focusInput()
  }

  const reset = () => {
    const next = makeSim(lab, device)
    setSim(next)
    const fresh = grade(next)
    gradesRef.current = fresh
    doneRef.current = false
    setDone(false)
    setGrades(fresh)
    setLines(tag([...bootLines(next), TIP, { kind: 'dim', text: '% The device was reset to the start of the lab.' }]))
    setValue('')
    setHistIdx(-1)
    setConfirming(false)
    sfx.tap()
  }

  const toggleHint = (i) => {
    setOpenHints((prev) => {
      const next = new Set(prev)
      next.add(i)
      return next
    })
    sfx.tap()
  }

  const revealStep = () => {
    setRevealed((n) => Math.min(solution.length, n + 1))
    setConfirming(false)
    sfx.flip()
  }

  const onScreenUp = () => {
    const sel = window.getSelection?.()
    if (sel && sel.toString()) return
    focusInput()
  }

  const passCount = grades.filter((g) => g.pass).length
  const before = input.slice(0, caret)
  const at = input.slice(caret, caret + 1)
  const after = input.slice(caret + 1)
  const chips = lab ? lab.suggestedShow : SANDBOX[device].chips
  const topology = lab ? lab.topology : SANDBOX[device].topology

  return (
    <div className={`iosc-layout${lab ? '' : ' sandbox'}`}>
      <div className="iosc-term-col">
        <div className="terminal iosc-terminal">
          <div className="terminal-bar">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="iosc-title">{sim.dev.hostname} console</span>
            <span className="iosc-mode" aria-live="polite">{sim.pending ? 'Answering a prompt' : modeLabel(sim)}</span>
            <button type="button" className="iosc-barbtn" onClick={reset} title="Start this console over">
              <RotateCcw size={12} /> Reset
            </button>
          </div>
          <div ref={screenRef} className="terminal-screen iosc-screen" role="log" aria-label={`${sim.dev.hostname} console output`} onClick={onScreenUp}>
            {lines.map((l) =>
              l.kind === 'echo' ? (
                <div key={l.id} className="terminal-line">
                  <span className="terminal-prompt">{l.prompt}</span>
                  {l.text}
                </div>
              ) : (
                <div key={l.id} className={`terminal-line ${l.kind === 'err' ? 'terminal-err' : l.kind === 'ok' ? 'terminal-ok' : l.kind === 'log' ? 'terminal-dim iosc-log' : l.kind === 'dim' ? 'terminal-dim iosc-tip' : 'terminal-out'}`}>
                  {l.text || ' '}
                </div>
              )
            )}
            <div className="terminal-line iosc-inputline">
              <span className="terminal-prompt">{prompt}</span>
              <span className="iosc-typed" aria-hidden="true">
                {masked ? '' : before}
                <span className={`iosc-cursor${focused ? ' on' : ''}`}>{masked ? ' ' : at || ' '}</span>
                {masked ? '' : after}
              </span>
              <input
                ref={inputRef}
                className="iosc-input"
                type={masked ? 'password' : 'text'}
                value={input}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onSelect={(e) => setCaret(e.target.selectionStart ?? 0)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                aria-label={masked ? 'Password' : `IOS command at ${prompt || 'the console'}`}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
              />
            </div>
          </div>
        </div>
        <div className="iosc-keys" aria-label="Console keys">
          <KeyBtn label="Tab" title="Complete the word (Tab)" onPress={tab} />
          <KeyBtn label="?" title="Context help (?)" onPress={() => showHelp(input.slice(0, caret))} />
          <KeyBtn label={<ArrowUp size={13} />} title="Previous command (Up)" onPress={() => recall(-1)} />
          <KeyBtn label={<ArrowDown size={13} />} title="Next command (Down)" onPress={() => recall(1)} />
          <KeyBtn label={<><span className="iosc-key-long">Ctrl+Z</span><span className="iosc-key-short">^Z</span></>} title="Leave configuration mode (Ctrl+Z)" onPress={() => ctrl('z')} />
          <KeyBtn label={<><span className="iosc-key-long">Ctrl+C</span><span className="iosc-key-short">^C</span></>} title="Cancel the line (Ctrl+C)" onPress={() => ctrl('c')} />
        </div>
        <div className="iosc-chips" aria-label="Suggested commands">
          {chips.map((cmd) => (
            <button key={cmd} type="button" className="iosc-cmd" onClick={() => typeCommand(cmd)} title="Type this command">
              {cmd}
            </button>
          ))}
        </div>
      </div>

      <aside className="iosc-panel" aria-label={lab ? 'Lab instructions' : 'Sandbox guide'}>
        {lab ? (
          <>
            <div className="iosc-meta">
              <span className={`chip ${lab.kind === 'troubleshoot' ? 'warn' : 'accent'}`}>
                {lab.kind === 'troubleshoot' ? <Stethoscope size={11} /> : <Wrench size={11} />}
                {lab.kind === 'troubleshoot' ? 'Find and fix' : 'Build'}
              </span>
              <span className="chip outline">{lab.difficulty}</span>
              <span className="chip outline">
                <Clock size={11} /> {lab.minutes} min
              </span>
            </div>
            <h4 className="iosc-h">{lab.title}</h4>
            <p className="iosc-text">{lab.scenario}</p>
            {lab.symptoms?.length > 0 && (
              <div className="callout warn iosc-symptoms">
                <strong>Symptoms</strong>
                <ul>
                  {lab.symptoms.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <h4 className="iosc-h">Free {device}</h4>
            <p className="iosc-text">A factory-fresh {device === 'router' ? 'Cisco 2911 router' : 'Catalyst 2960 switch'}. Try anything. These neighbors are cabled in so show commands and pings have something to find.</p>
          </>
        )}

        {topology?.length > 0 && (
          <div className="iosc-section">
            <h5 className="iosc-sub">Topology</h5>
            <div className="iosc-table-wrap">
              <table className="iosc-table">
                <thead>
                  <tr>
                    <th scope="col">Device</th>
                    <th scope="col">Port</th>
                    <th scope="col">Address</th>
                    <th scope="col">Connects to</th>
                  </tr>
                </thead>
                <tbody>
                  {topology.map((r, i) => (
                    <tr key={i}>
                      <td>{r.device}</td>
                      <td className="mono">{r.port}</td>
                      <td className="mono">{r.address}</td>
                      <td>{r.link}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {lab?.brief?.length > 0 && (
          <div className="iosc-section">
            <h5 className="iosc-sub">Your job</h5>
            <ol className="iosc-brief">
              {lab.brief.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="iosc-section">
          <div className="iosc-checkhead">
            <h5 className="iosc-sub">{lab ? 'Live checks' : 'Warm-up'}</h5>
            <span className="chip outline tabular">
              {passCount} / {grades.length}
            </span>
          </div>
          <ul className="w-tasks iosc-tasks">
            {grades.map((g, i) => (
              <li key={g.label} ref={(el) => (rowRefs.current[i] = el)} className={`w-task${g.pass ? ' done' : ''}`}>
                <span className="w-task-mark" aria-hidden="true">
                  {g.pass && <Check size={13} strokeWidth={3} />}
                </span>
                <span className="iosc-taskbody">
                  <span>
                    {g.label}
                    <span className="sr-only">{g.pass ? ' (passed)' : ' (not yet)'}</span>
                  </span>
                  {!g.pass && !openHints.has(i) && (
                    <button type="button" className="iosc-hintbtn" onClick={() => toggleHint(i)}>
                      <Lightbulb size={12} /> Hint
                    </button>
                  )}
                  {!g.pass && openHints.has(i) && <span className="w-task-hint mono">{g.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {lab && solution.length > 0 && !done && (
          <div className="iosc-section">
            <h5 className="iosc-sub">Stuck?</h5>
            {revealed > 0 && (
              <ol className="iosc-steps">
                {solution.slice(0, revealed).map((cmd, i) => (
                  <li key={i}>
                    <button type="button" className="iosc-cmd" onClick={() => typeCommand(cmd)} title="Type this command">
                      {cmd}
                    </button>
                    {explainCommand(cmd) && <span className="xsmall subtle">{explainCommand(cmd)}</span>}
                  </li>
                ))}
              </ol>
            )}
            {revealed < solution.length &&
              (confirming ? (
                <div className="iosc-confirm" role="group" aria-label="Confirm showing a solution step">
                  <span className="small">
                    Show step {revealed + 1} of {solution.length}? Your score drops a little.
                  </span>
                  <span className="row">
                    <button type="button" className="btn btn-sm btn-primary" onClick={revealStep}>
                      <Eye size={14} /> Show it
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)}>
                      <X size={14} /> Keep trying
                    </button>
                  </span>
                </div>
              ) : (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(true)}>
                  <Eye size={14} /> {revealed ? 'Show the next step' : 'Show the solution step by step'}
                </button>
              ))}
          </div>
        )}

        {done && lab && (
          <div className="callout good iosc-done">
            <Trophy size={18} />
            <div>
              <strong>All checks passed. Score {Math.round(score * 100)}%.</strong>
              {lab.reflection?.length > 0 && (
                <>
                  <p className="small">Before you move on, answer these in your head:</p>
                  <ol className="small">
                    {lab.reflection.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </aside>
    </div>
  )
}

/** A key on the on-screen key row. Pointer and mouse down are swallowed so focus, and the phone keyboard, stay on the console. */
function KeyBtn({ label, title, onPress }) {
  return (
    <button type="button" className="iosc-key" title={title} aria-label={title} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={onPress}>
      {label}
    </button>
  )
}
