import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, Eye, EyeOff, Keyboard, Loader2, Monitor, Moon, Sun, Upload, ExternalLink } from 'lucide-react'
import { useApp } from '../state/context'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { SUBJECTS } from '../lib/subjects'
import { PROVIDERS, callAI } from '../lib/ai'
import { exportSnapshot } from '../lib/storage'
import { downloadJSON } from '../lib/share'
import Modal from '../components/Modal'

function Row({ label, hint, children, htmlFor }) {
  return (
    <div className="setting-row">
      <div className="copy">
        {htmlFor ? <label className="label" htmlFor={htmlFor}>{label}</label> : <div className="label">{label}</div>}
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div className="control">{children}</div>
    </div>
  )
}

function NumberInput({ id, value, min, max, onChange, suffix }) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n)) return setDraft(String(value))
    const clamped = Math.min(max, Math.max(min, n))
    setDraft(String(clamped))
    if (clamped !== value) onChange(clamped)
  }
  return (
    <div className="row" style={{ gap: 8 }}>
      <input id={id} className="input" style={{ width: 96 }} type="number" inputMode="numeric" min={min} max={max} value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      {suffix && <span className="small subtle" style={{ minWidth: 52 }}>{suffix}</span>}
    </div>
  )
}

function Switch({ id, checked, onChange, label }) {
  return (
    <span className="switch">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </span>
  )
}

export default function Settings() {
  useDocumentTitle('Settings')
  const { settings, updateSettings, user, updateUser, ai, updateAI, importData, resetAll, toast, setShortcutsOpen } = useApp()
  const location = useLocation()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetText, setResetText] = useState('')
  const [pendingImport, setPendingImport] = useState(null)
  const fileRef = useRef(null)
  const provider = PROVIDERS[ai.provider] || PROVIDERS.anthropic

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    const started = Date.now()
    try {
      await callAI(ai, 'Reply with the single word: ok', 'ping', { maxTokens: 16, timeoutMs: 20000 })
      setTestResult({ ok: true, text: `Connected in ${Date.now() - started} ms.` })
    } catch (e) {
      setTestResult({ ok: false, text: e.message })
    } finally {
      setTesting(false)
    }
  }

  const onFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setPendingImport(JSON.parse(await file.text()))
    } catch {
      toast('That file is not valid JSON.', { tone: 'bad' })
    }
  }

  const toggleInterest = (id) => {
    const set = new Set(user.interests)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    updateUser({ interests: [...set] })
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Everything is stored in this browser. Nothing is sent anywhere unless you add an AI key.</p>
        </div>
      </div>

      <div className="stack-lg">
        <section className="settings-section" aria-labelledby="s-appearance">
          <h2 className="section-title" id="s-appearance">Appearance</h2>
          <Row label="Theme" hint="System follows your device setting.">
            <div className="segmented" role="group" aria-label="Theme">
              {[['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]].map(([id, label, Icon]) => (
                <button key={id} type="button" aria-pressed={settings.theme === id} onClick={() => updateSettings({ theme: id })}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Keyboard shortcuts" hint="Press ? anywhere to see them.">
            <button type="button" className="btn" onClick={() => setShortcutsOpen(true)}><Keyboard size={16} /> View shortcuts</button>
          </Row>
        </section>

        <section className="settings-section" aria-labelledby="s-study">
          <h2 className="section-title" id="s-study">Study</h2>
          <Row label="Daily goal" hint="Reviews per day. Shown in the header and on Today." htmlFor="goal">
            <NumberInput key={settings.dailyGoal} id="goal" value={settings.dailyGoal} min={5} max={500} onChange={(v) => updateSettings({ dailyGoal: v })} suffix="reviews" />
          </Row>
          <Row label="New cards per day" hint="How many unseen cards the daily review introduces. Studying a topic directly is not limited." htmlFor="newPerDay">
            <NumberInput key={settings.newPerDay} id="newPerDay" value={settings.newPerDay} min={0} max={200} onChange={(v) => updateSettings({ newPerDay: v })} suffix="cards" />
          </Row>
          <Row label="Session length" hint="Cards per session. Missed cards are retried on top of this." htmlFor="sessionSize">
            <NumberInput key={settings.sessionSize} id="sessionSize" value={settings.sessionSize} min={3} max={100} onChange={(v) => updateSettings({ sessionSize: v })} suffix="cards" />
          </Row>
          <Row label={`Target retention: ${Math.round(settings.desiredRetention * 100)}%`} hint="The chance of remembering a card when it comes due. Higher means more frequent reviews. 90% is a good balance." htmlFor="retention">
            <input id="retention" type="range" min="0.8" max="0.97" step="0.01" value={settings.desiredRetention} onChange={(e) => updateSettings({ desiredRetention: Number(e.target.value) })} />
          </Row>
          <Row label="Show session timer" htmlFor="showTimer">
            <Switch id="showTimer" checked={settings.showTimer} onChange={(v) => updateSettings({ showTimer: v })} label="Show session timer" />
          </Row>
          <Row label="Focus timer" hint={`Counts down ${settings.focusMinutes} minutes while you study, then suggests a ${settings.breakMinutes}-minute break.`} htmlFor="focusTimer">
            <Switch id="focusTimer" checked={settings.focusTimer} onChange={(v) => updateSettings({ focusTimer: v })} label="Focus timer" />
          </Row>
          {settings.focusTimer && (
            <Row label="Focus and break length">
              <div className="row wrap">
                <NumberInput key={settings.focusMinutes} id="focusMinutes" value={settings.focusMinutes} min={5} max={120} onChange={(v) => updateSettings({ focusMinutes: v })} suffix="min focus" />
                <NumberInput key={settings.breakMinutes} id="breakMinutes" value={settings.breakMinutes} min={1} max={60} onChange={(v) => updateSettings({ breakMinutes: v })} suffix="min break" />
              </div>
            </Row>
          )}
        </section>

        <section className="settings-section" aria-labelledby="s-profile">
          <h2 className="section-title" id="s-profile">Profile</h2>
          <Row label="Name" hint="Used for greetings, certificates and the share image." htmlFor="name">
            <input id="name" className="input" value={user.name} maxLength={40} onChange={(e) => updateUser({ name: e.target.value })} placeholder="Your name" />
          </Row>
          <div className="setting-row" style={{ alignItems: 'flex-start' }}>
            <div className="copy">
              <div className="label">Interests</div>
              <div className="hint">Topics from these subjects are suggested first.</div>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {SUBJECTS.map((s) => (
              <button key={s.id} type="button" className="filter-chip" aria-pressed={user.interests.includes(s.id)} onClick={() => toggleInterest(s.id)}>{s.label}</button>
            ))}
          </div>
        </section>

        <section className="settings-section" id="ai" aria-labelledby="s-ai">
          <h2 className="section-title" id="s-ai">AI features <span className="chip outline" style={{ verticalAlign: 'middle' }}>optional</span></h2>
          <p className="small muted" style={{ marginTop: 6 }}>
            Adds written feedback on your explanations and generates packs for any topic. Your key stays in this browser and requests go directly to the provider you choose. Everything else works without it.
          </p>
          <Row label="Provider" htmlFor="provider">
            <select id="provider" className="select" value={ai.provider} onChange={(e) => { updateAI({ provider: e.target.value, model: '' }); setTestResult(null) }}>
              {Object.entries(PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
          </Row>
          <Row label="API key" hint={<a href={provider.keyUrl} target="_blank" rel="noreferrer">Get a key from {provider.label} <ExternalLink size={11} style={{ verticalAlign: '-1px' }} /></a>} htmlFor="apiKey">
            <div className="row" style={{ width: '100%', gap: 6 }}>
              <input id="apiKey" className="input" type={showKey ? 'text' : 'password'} value={ai.apiKey} onChange={(e) => { updateAI({ apiKey: e.target.value.trim() }); setTestResult(null) }} placeholder={provider.keyPlaceholder} autoComplete="off" spellCheck={false} />
              <button type="button" className="icon-btn" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Hide key' : 'Show key'}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Row>
          <Row label="Model" hint={`Leave empty for the default (${provider.defaultModel}).`} htmlFor="model">
            <input id="model" className="input" value={ai.model} onChange={(e) => updateAI({ model: e.target.value })} placeholder={provider.defaultModel} spellCheck={false} />
          </Row>
          <Row label="Connection">
            <div className="stack-sm" style={{ alignItems: 'flex-end', width: '100%' }}>
              <button type="button" className="btn" onClick={test} disabled={!ai.apiKey || testing}>
                {testing ? <><Loader2 size={16} className="spin" /> Testing</> : 'Test connection'}
              </button>
              {testResult && <span className={`xsmall ${testResult.ok ? 'good-text' : 'bad-text'}`} role="status">{testResult.text}</span>}
            </div>
          </Row>
        </section>

        <section className="settings-section" aria-labelledby="s-data">
          <h2 className="section-title" id="s-data">Your data</h2>
          <Row label="Back up" hint="Download progress, stats, settings and your packs as a JSON file. Your API key is left out.">
            <button type="button" className="btn" onClick={() => downloadJSON(`recurse-backup-${new Date().toISOString().slice(0, 10)}.json`, exportSnapshot())}><Download size={16} /> Download backup</button>
          </Row>
          <Row label="Restore" hint="Replace everything here with a backup file. Works with backups from older versions too.">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Restore backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} hidden />
          </Row>
          <Row label="Reset everything" hint="Delete all progress, stats, settings and your packs from this browser.">
            <button type="button" className="btn btn-danger" onClick={() => setResetOpen(true)}>Reset</button>
          </Row>
        </section>

        <p className="xsmall subtle" style={{ textAlign: 'center' }}>
          Recurse {__APP_VERSION__} · <a href="https://github.com/H4ch1Net/Recurse" target="_blank" rel="noreferrer">Source on GitHub</a>
        </p>
      </div>

      {pendingImport && (
        <Modal
          title="Restore this backup?"
          description="Everything currently in this browser will be replaced by the backup."
          onClose={() => setPendingImport(null)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setPendingImport(null)} data-autofocus>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => {
                try {
                  importData(pendingImport)
                  toast('Backup restored', { tone: 'good' })
                } catch (e) {
                  toast(e.message, { tone: 'bad' })
                }
                setPendingImport(null)
              }}>Restore</button>
            </>
          }
        >
          {pendingImport.exportedAt && <p className="small muted">Backup from {new Date(pendingImport.exportedAt).toLocaleString()}.</p>}
        </Modal>
      )}

      {resetOpen && (
        <Modal
          title="Reset everything?"
          description="This permanently deletes all progress, stats, settings and packs you created. Download a backup first if you might want them back."
          onClose={() => { setResetOpen(false); setResetText('') }}
          actions={
            <>
              <button type="button" className="btn" onClick={() => { setResetOpen(false); setResetText('') }}>Cancel</button>
              <button type="button" className="btn btn-danger-solid" disabled={resetText.trim().toUpperCase() !== 'RESET'} onClick={() => {
                resetAll()
                setResetOpen(false)
                setResetText('')
              }}>Delete everything</button>
            </>
          }
        >
          <div className="field">
            <label className="label" htmlFor="reset-confirm">Type RESET to confirm</label>
            <input id="reset-confirm" className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" data-autofocus />
          </div>
        </Modal>
      )}
    </div>
  )
}
