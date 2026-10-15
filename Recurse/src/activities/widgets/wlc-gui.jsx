import { useId, useMemo, useRef, useState } from 'react'
import { Check, CircleAlert, CircleCheck, CircleX, Clock, Compass, Eye, EyeOff, Info, Layers, Lightbulb, Lock, Minus, Save, Stethoscope, TriangleAlert, Trophy, Wifi, Wrench, X } from 'lucide-react'
import { feedbackCorrect, feedbackSuccess, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import {
  DEVICES,
  JOIN_STEPS,
  L2_OPTIONS,
  P2P_OPTIONS,
  PMF_OPTIONS,
  QOS_PROFILES,
  RADIO_POLICIES,
  WMM_POLICIES,
  applyInterfaceEdit,
  applyNewInterface,
  applyNewWlan,
  applyWlanEdit,
  connectClient,
  deviceById,
  failedStep,
  freeWlanIds,
  interfaceDraft,
  isDirty,
  qosById,
  radioById,
  removeWlans,
  securityPolicies,
  setWlansEnabled,
  visibleNetworks,
  wlanDraft
} from '../lib/wlc/model.js'
import { SCENARIOS, SCENARIO_IDS, emptyStats, faultNotes, getScenario, gradeScenario, recordApply, recordCreate, recordJoin, recordVisit, scenarioScore } from '../lib/wlc/scenarios.js'
import './wlc-gui.css'

// ---------- menus and pages ----------

const MENU = [
  { id: 'MONITOR', label: 'MONITOR', title: 'Monitor', items: [['summary', 'Summary'], ['clients', 'Clients']] },
  { id: 'WLANS', label: 'WLANs', title: 'WLANs', items: [['wlans', 'WLANs']] },
  { id: 'CONTROLLER', label: 'CONTROLLER', title: 'Controller', items: [['general', 'General'], ['ifaces', 'Interfaces'], ['ports', 'Ports']] },
  { id: 'WIRELESS', label: 'WIRELESS', title: 'Wireless', items: [['aps', 'All APs']] },
  { id: 'SECURITY', label: 'SECURITY', title: 'Security', items: [['radius', 'RADIUS Authentication'], ['exclusion', 'Client Exclusion Policies']] },
  { id: 'MANAGEMENT', label: 'MANAGEMENT', title: 'Management', items: [['mgmt', 'Summary'], ['mgmt-wireless', 'Mgmt Via Wireless']] }
]
const PARENT = { 'wlan-new': 'wlans', 'wlan-edit': 'wlans', 'iface-new': 'ifaces', 'iface-edit': 'ifaces' }
const topOf = (page) => MENU.find((m) => m.items.some(([id]) => id === (PARENT[page] || page)))?.id || 'WLANS'

const WLAN_TABS = [['general', 'General'], ['security', 'Security'], ['qos', 'QoS'], ['advanced', 'Advanced']]
const SEC_TABS = [['l2', 'Layer 2'], ['l3', 'Layer 3'], ['aaa', 'AAA Servers']]
const TAB_FIELDS = { general: ['ssid', 'enabled', 'radio', 'iface', 'broadcast'], security: ['security', 'l3', 'aaa'], qos: ['qos', 'wmm'], advanced: ['advanced'] }
const changedTabs = (a, b) => WLAN_TABS.map(([t]) => t).filter((t) => TAB_FIELDS[t].some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])))

const KIND = {
  build: { label: 'Build', chip: 'accent', Icon: Wrench },
  troubleshoot: { label: 'Find and fix', chip: 'warn', Icon: Stethoscope },
  explore: { label: 'Sandbox', chip: 'outline', Icon: Compass }
}
const PICKER_LABELS = {
  'create-wlan': 'Build: Staff WLAN with WPA2-PSK',
  wpa3: 'Build: move Research to WPA3',
  troubleshoot: 'Fix: the Warehouse WLAN',
  explore: 'Free sandbox'
}

/** The editable state behind a page, or null for read-only pages. */
function draftFor(cfg, nav) {
  if (nav.page === 'wlan-edit') {
    const w = cfg.wlans.find((x) => x.id === nav.id)
    return w ? { kind: 'wlan', data: wlanDraft(w), base: wlanDraft(w), pskEditing: false } : null
  }
  if (nav.page === 'wlan-new') {
    const f = { type: 'WLAN', profile: '', ssid: '', id: String(freeWlanIds(cfg)[0] ?? '') }
    return { kind: 'wlan-new', data: f, base: { ...f } }
  }
  if (nav.page === 'iface-edit') {
    const i = cfg.interfaces.find((x) => x.name === nav.id)
    return i?.editable ? { kind: 'iface', data: interfaceDraft(i), base: interfaceDraft(i) } : null
  }
  if (nav.page === 'iface-new') return { kind: 'iface-new', data: { name: '', vlan: '' }, base: { name: '', vlan: '' } }
  if (nav.page === 'mgmt-wireless') return { kind: 'mgmt', data: { on: cfg.mgmtViaWireless }, base: { on: cfg.mgmtViaWireless } }
  return null
}

/** A simulated Cisco AireOS WLC web GUI with a test client and live-graded scenarios. */
export default function WlcGui({ props, onComplete, standalone }) {
  const initial = SCENARIO_IDS.includes(props?.scenario) ? props.scenario : 'create-wlan'
  const [scenarioId, setScenarioId] = useState(initial)
  const scenario = getScenario(scenarioId)
  return (
    <div className="wlc">
      {standalone && (
        <div className="w-toolbar wlc-toolbar">
          <label className="wlc-pick">
            <span className="small subtle">Scenario</span>
            <select className="select" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {PICKER_LABELS[s.id]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <Lab key={scenario.id} scenario={scenario} onComplete={onComplete} />
    </div>
  )
}

function Lab({ scenario, onComplete }) {
  const [world, setWorld] = useState(() => ({ cfg: scenario.build(Math.random), stats: emptyStats() }))
  const [nav, setNav] = useState(() => ({ page: scenario.startPage, id: null, tab: 'general', sub: 'l2' }))
  const [draft, setDraft] = useState(null)
  const [pending, setPending] = useState(null)
  const [alert, setAlert] = useState(null)
  const [notice, setNotice] = useState(null)
  const [selected, setSelected] = useState([])
  const [listAction, setListAction] = useState('create')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [unsaved, setUnsaved] = useState(false)
  const [hints, setHints] = useState(() => new Set())
  const [done, setDone] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [firstGrades] = useState(() => gradeScenario(scenario, world.cfg, world.stats))

  const gradesRef = useRef(firstGrades)
  const doneRef = useRef(false)
  const rowRefs = useRef([])
  const pageRef = useRef(null)
  const checksRef = useRef(null)

  const { cfg, stats } = world
  const grades = useMemo(() => gradeScenario(scenario, world.cfg, world.stats), [scenario, world])
  const dirty = Boolean(draft) && isDirty(draft.data, draft.base)
  const top = topOf(nav.page)
  const menu = MENU.find((m) => m.id === top)
  const activeItem = PARENT[nav.page] || nav.page
  const kind = KIND[scenario.kind]
  const passCount = grades.filter((g) => g.pass).length
  const score = scenarioScore(scenario, { hints: hints.size })

  /** Commit a new controller and stats, then celebrate checks that just started passing. */
  const commit = (nextCfg, nextStats = stats) => {
    setWorld({ cfg: nextCfg, stats: nextStats })
    const next = gradeScenario(scenario, nextCfg, nextStats)
    const prev = gradesRef.current
    next.forEach((r, i) => {
      if (r.pass && !prev[i]?.pass) {
        const row = rowRefs.current[i]
        if (row) feedbackSuccess(row, 'Passed')
        setAnnounce(`Check passed: ${r.label}`)
      }
    })
    gradesRef.current = next
    if (next.length && next.every((r) => r.pass) && !doneRef.current) {
      doneRef.current = true
      setDone(true)
      const finalScore = scenarioScore(scenario, { hints: hints.size })
      onComplete?.({ score: finalScore, detail: scenario.kind === 'explore' ? 'WLC sandbox warm-up' : `${scenario.title}: ${hints.size} hint(s)` })
    }
  }

  const navigate = (target, fromCfg = cfg, fromStats = stats) => {
    const t = { id: null, tab: 'general', sub: 'l2', ...target }
    setNav(t)
    setDraft(draftFor(fromCfg, t))
    setPending(null)
    setAlert(null)
    setNotice(null)
    setSelected([])
    setConfirmRemove(false)
    const visited = recordVisit(fromStats, t.page)
    if (visited !== fromStats || fromCfg !== cfg) commit(fromCfg, visited)
    const box = pageRef.current?.closest('.wlc-browser')
    if (box && box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  /** Every link goes through here so unapplied edits are never lost silently. */
  const go = (target) => {
    sfx.tap()
    if (dirty) {
      setPending(target)
      return
    }
    navigate(target)
  }

  const fail = (errors, el) => {
    setAlert({ items: errors })
    setNotice(null)
    feedbackWrong(el || pageRef.current)
  }

  const succeed = (text, dropped = [], extra = []) => {
    const lost = dropped.map((d) => `${deviceById(d.device).name} lost its connection to ${d.ssid}: ${failedStep(d.result)?.text || 'it could not rejoin.'}`)
    setNotice({ text, lines: [...extra, ...lost], tone: lost.length ? 'warn' : 'good' })
    setAlert(null)
    setUnsaved(true)
    sfx.pop()
  }

  /** The Apply button. Returns the new { cfg, stats } on success, or null. */
  const apply = (el) => {
    if (!draft) return null
    const refuse = (errors) => {
      fail(errors, el)
      return null
    }
    if (draft.kind === 'wlan') {
      const res = applyWlanEdit(cfg, draft.data)
      if (!res.ok) return refuse(res.errors)
      const tabs = changedTabs(draft.data, draft.base)
      const nextStats = tabs.reduce((s, t) => recordApply(s, t), stats)
      const w = res.cfg.wlans.find((x) => x.id === draft.data.id)
      commit(res.cfg, nextStats)
      setDraft({ kind: 'wlan', data: wlanDraft(w), base: wlanDraft(w), pskEditing: false })
      const extra = tabs.includes('security') && w.enabled ? ['Security changes make clients on this WLAN reconnect.'] : []
      succeed(tabs.length ? `WLAN ${w.id} (${w.profile}) updated.` : 'Nothing changed.', res.dropped, extra)
      return { cfg: res.cfg, stats: nextStats }
    }
    if (draft.kind === 'wlan-new') {
      const res = applyNewWlan(cfg, draft.data)
      if (!res.ok) return refuse(res.errors)
      const nextStats = recordCreate(stats)
      navigate({ page: 'wlan-edit', id: res.id }, res.cfg, nextStats)
      succeed(`WLAN ${res.id} created. Like on a real WLC it starts disabled, on the management interface, with WPA2, AES and 802.1X. Change what you need on each tab, then Apply.`)
      return { cfg: res.cfg, stats: nextStats }
    }
    if (draft.kind === 'iface') {
      const res = applyInterfaceEdit(cfg, nav.id, draft.data)
      if (!res.ok) return refuse(res.errors)
      const i = res.cfg.interfaces.find((x) => x.name === nav.id)
      const nextStats = recordApply(stats, 'interface')
      commit(res.cfg, nextStats)
      setDraft({ kind: 'iface', data: interfaceDraft(i), base: interfaceDraft(i) })
      succeed(`Interface ${i.name} updated.`, res.dropped)
      return { cfg: res.cfg, stats: nextStats }
    }
    if (draft.kind === 'iface-new') {
      const res = applyNewInterface(cfg, draft.data)
      if (!res.ok) return refuse(res.errors)
      const nextStats = recordApply(stats, 'interface')
      navigate({ page: 'iface-edit', id: res.name }, res.cfg, nextStats)
      succeed(`Interface ${res.name} created. Now give it an IP address, netmask, gateway and DHCP server, then Apply.`)
      return { cfg: res.cfg, stats: nextStats }
    }
    if (draft.kind === 'mgmt') {
      const next = structuredClone(cfg)
      next.mgmtViaWireless = draft.data.on
      const nextStats = recordApply(stats, 'management')
      commit(next, nextStats)
      setDraft({ kind: 'mgmt', data: { ...draft.data }, base: { ...draft.data } })
      succeed(draft.data.on ? 'Wireless clients may now manage the controller. Most networks keep this off.' : 'Management from wireless clients is off, the safer default.')
      return { cfg: next, stats: nextStats }
    }
    return null
  }

  const leaveWithApply = (el) => {
    const target = pending
    const next = apply(el)
    if (next && target) navigate(target, next.cfg, next.stats)
  }

  const save = () => {
    sfx.tap()
    setUnsaved(false)
    setAlert(null)
    setNotice({ text: 'Configuration saved. Apply changes the running configuration; Save Configuration keeps it after a reboot.', lines: [], tone: 'good' })
  }

  const runListAction = (el) => {
    if (listAction === 'create') return go({ page: 'wlan-new' })
    if (!selected.length) return fail(['Select one or more WLANs with the check boxes first.'], el)
    if (listAction === 'remove') {
      setConfirmRemove(true)
      return sfx.tap()
    }
    const on = listAction === 'enable'
    const res = setWlansEnabled(cfg, selected, on)
    commit(res.cfg)
    succeed(`${selected.length === 1 ? `WLAN ${selected[0]}` : `${selected.length} WLANs`} ${on ? 'enabled' : 'disabled'}.`, res.dropped)
    setSelected([])
  }

  const confirmRemoveNow = () => {
    const res = removeWlans(cfg, selected)
    commit(res.cfg)
    succeed(`Removed ${selected.length === 1 ? `WLAN ${selected[0]}` : `${selected.length} WLANs`}.`, res.dropped)
    setSelected([])
    setConfirmRemove(false)
  }

  const connect = (attempt) => {
    const res = connectClient(cfg, attempt)
    commit(res.cfg, recordJoin(stats, res.result))
    return res.result
  }

  const openHint = (i) => {
    setHints((prev) => new Set(prev).add(i))
    sfx.flip()
  }

  const updDraft = (fn) =>
    setDraft((d) => {
      const next = structuredClone(d)
      fn(next.data, next)
      return next
    })

  const tabsChanged = draft?.kind === 'wlan' ? changedTabs(draft.data, draft.base) : []

  return (
    <div className="wlc-lab">
      <section className="wlc-brief" aria-label="Scenario">
        <div className="wlc-meta">
          <span className={`chip ${kind.chip}`}>
            <kind.Icon size={11} /> {kind.label}
          </span>
          <span className="chip outline">
            <Clock size={11} /> {scenario.minutes} min
          </span>
          <button type="button" className="chip outline wlc-progress" onClick={() => checksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <Check size={11} /> {passCount} / {grades.length} checks
          </button>
        </div>
        <h4 className="wlc-h">{scenario.title}</h4>
        <p className="wlc-text">{scenario.story}</p>
        {scenario.symptoms?.length > 0 && (
          <div className="callout warn wlc-symptoms">
            <TriangleAlert size={16} />
            <div>
              <strong>Symptoms</strong>
              <ul>
                {scenario.symptoms.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="wlc-brief-cols">
          <div>
            <h5 className="wlc-sub">{scenario.kind === 'explore' ? 'Ideas' : 'Your job'}</h5>
            <ol className="wlc-list">
              {scenario.brief.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ol>
          </div>
          <details className="wlc-facts">
            <summary>Network facts</summary>
            <div className="wlc-scroll">
              <table className="wlc-table">
                <tbody>
                  {scenario.facts.map((f) => (
                    <tr key={f.label}>
                      <th scope="row">{f.label}</th>
                      <td className="mono">{f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>

      <div className="wlc-main">
        <div className="wlc-browser">
          <div className="wlc-chrome" aria-hidden="true">
            <span className="wlc-dot" />
            <span className="wlc-dot" />
            <span className="wlc-dot" />
            <span className="wlc-url">
              <Lock size={11} /> https://{cfg.system.mgmtIp}/screens/frameset.html
            </span>
          </div>
          <div className="wlc-appbar">
            <span className="wlc-brand">
              <Wifi size={15} /> {cfg.system.name}
            </span>
            <button type="button" className={`wlc-savelink${unsaved ? ' unsaved' : ''}`} onClick={save} title="Save the running configuration to NVRAM">
              <Save size={12} /> Save Configuration{unsaved && <span className="sr-only"> (unsaved changes)</span>}
            </button>
            <nav className="wlc-topnav" aria-label="Controller menu">
              {MENU.map((m) => (
                <button key={m.id} type="button" className={`wlc-topitem${m.id === top ? ' on' : ''}`} aria-current={m.id === top ? 'page' : undefined} onClick={() => go({ page: m.items[0][0] })}>
                  {m.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="wlc-body">
            <nav className={`wlc-sidenav${menu.items.length === 1 ? ' single' : ''}`} aria-label={`${menu.title} pages`}>
              <span className="wlc-sidetitle">{menu.title}</span>
              {menu.items.map(([id, label]) => (
                <button key={id} type="button" className={`wlc-sideitem${id === activeItem ? ' on' : ''}`} aria-current={id === activeItem ? 'page' : undefined} onClick={() => go({ page: id })}>
                  {label}
                </button>
              ))}
            </nav>
            <main className="wlc-page" ref={pageRef}>
              {pending && (
                <div className="wlc-confirm" role="alertdialog" aria-label="Unapplied changes">
                  <span>
                    <TriangleAlert size={15} /> This page has changes you have not applied. Leaving loses them.
                  </span>
                  <span className="wlc-confirm-btns">
                    {draft?.kind !== 'wlan-new' && draft?.kind !== 'iface-new' && (
                      <button type="button" className="btn btn-sm btn-primary" onClick={(e) => leaveWithApply(e.currentTarget)}>
                        Apply and go
                      </button>
                    )}
                    <button type="button" className="btn btn-sm" onClick={() => navigate(pending)}>
                      Discard
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPending(null)}>
                      Stay
                    </button>
                  </span>
                </div>
              )}
              <PageHead nav={nav} cfg={cfg} draft={draft} dirty={dirty} go={go} apply={apply} />
              <div aria-live="polite">
                {alert && (
                  <div className="callout bad wlc-alert" role="alert">
                    <CircleAlert size={16} />
                    <div>
                      <strong>Not applied</strong>
                      <ul>
                        {alert.items.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </div>
                    <button type="button" className="wlc-x" onClick={() => setAlert(null)} aria-label="Dismiss">
                      <X size={14} />
                    </button>
                  </div>
                )}
                {notice && (
                  <div className={`callout ${notice.tone} wlc-alert`}>
                    {notice.tone === 'good' ? <CircleCheck size={16} /> : <TriangleAlert size={16} />}
                    <div>
                      <span>{notice.text}</span>
                      {notice.lines.length > 0 && (
                        <ul>
                          {notice.lines.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button type="button" className="wlc-x" onClick={() => setNotice(null)} aria-label="Dismiss">
                      <X size={14} />
                    </button>
                  </div>
                )}
                {confirmRemove && (
                  <div className="wlc-confirm" role="alertdialog" aria-label="Confirm remove">
                    <span>
                      Remove {selected.map((id) => `WLAN ${id}`).join(', ')}? Its clients are disconnected.
                    </span>
                    <span className="wlc-confirm-btns">
                      <button type="button" className="btn btn-sm btn-danger" onClick={confirmRemoveNow}>
                        Remove
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(false)}>
                        Cancel
                      </button>
                    </span>
                  </div>
                )}
              </div>
              <PageBody nav={nav} cfg={cfg} draft={draft} updDraft={updDraft} go={go} setNav={setNav} selected={selected} setSelected={setSelected} listAction={listAction} setListAction={setListAction} runListAction={runListAction} tabsChanged={tabsChanged} />
              {draft && draft.kind !== 'mgmt' && (
                <div className="wlc-footer">
                  {dirty && <span className="wlc-dirty">Unapplied changes</span>}
                  <button type="button" className="btn btn-primary wlc-apply" onClick={(e) => apply(e.currentTarget)}>
                    Apply
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>

        <aside className="wlc-side" aria-label="Test client and checks">
          <TestClient cfg={cfg} defaults={scenario.client} onConnect={connect} />

          <section className="wlc-card" ref={checksRef} aria-labelledby="wlc-checks-h">
            <div className="wlc-checkhead">
              <h5 id="wlc-checks-h" className="wlc-sub">
                {scenario.kind === 'explore' ? 'Warm-up' : 'Live checks'}
              </h5>
              <span className="chip outline tabular">
                {passCount} / {grades.length}
              </span>
            </div>
            <p className="xsmall subtle wlc-checknote">Checks read the applied configuration, so press Apply after each change.</p>
            <ul className="w-tasks wlc-tasks">
              {grades.map((g, i) => (
                <li key={g.label} ref={(el) => (rowRefs.current[i] = el)} className={`w-task${g.pass ? ' done' : ''}`}>
                  <span className="w-task-mark" aria-hidden="true">
                    {g.pass && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="wlc-taskbody">
                    <span>
                      {g.label}
                      <span className="sr-only">{g.pass ? ' (passed)' : ' (not yet)'}</span>
                    </span>
                    {!g.pass && !hints.has(i) && (
                      <button type="button" className="wlc-hintbtn" onClick={() => openHint(i)}>
                        <Lightbulb size={12} /> Hint
                      </button>
                    )}
                    {!g.pass && hints.has(i) && <span className="w-task-hint">{g.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {done && (
              <div className="callout good wlc-done">
                <Trophy size={18} />
                <div>
                  <strong>{scenario.kind === 'explore' ? 'Warm-up done. Keep exploring.' : `All checks passed. Score ${Math.round(score * 100)}%.`}</strong>
                  {scenario.kind === 'troubleshoot' && faultNotes(cfg).length > 0 && (
                    <>
                      <p className="small">What was broken:</p>
                      <ul className="small">
                        {faultNotes(cfg).map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {scenario.reflection?.length > 0 && (
                    <>
                      <p className="small">Before you move on, answer these in your head:</p>
                      <ol className="small">
                        {scenario.reflection.map((q) => (
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
          </section>

          <details className="wlc-card wlc-9800">
            <summary>
              <Layers size={14} /> The same ideas on a Catalyst 9800
            </summary>
            <p className="small">Newer controllers run IOS XE, and exam questions may show either GUI. The 9800 splits one AireOS WLAN into three objects under Configuration, Tags and Profiles:</p>
            <dl className="small">
              <dt>WLAN profile</dt>
              <dd>The SSID, WLAN ID, status, broadcast, radio policy and Layer 2 security: WPA2 or WPA3, PSK, SAE or 802.1X, and PMF.</dd>
              <dt>Policy profile</dt>
              <dd>What happens to the client traffic: the VLAN (in place of an AireOS interface), QoS, session timeout, client exclusion, and central or local switching.</dd>
              <dt>Policy tag</dt>
              <dd>Pairs a WLAN profile with a policy profile. Assign the tag to APs and the SSID goes live on them.</dd>
            </dl>
          </details>
        </aside>
      </div>
    </div>
  )
}

// ---------- page header ----------

function PageHead({ nav, cfg, draft, dirty, go, apply }) {
  let title = MENU.find((m) => m.items.some(([id]) => id === nav.page))?.items.find(([id]) => id === nav.page)?.[1] || ''
  let back = null
  if (nav.page === 'wlan-new') {
    title = 'WLANs > New'
    back = 'wlans'
  } else if (nav.page === 'wlan-edit') {
    const w = cfg.wlans.find((x) => x.id === nav.id)
    title = `WLANs > Edit '${w?.profile ?? nav.id}'`
    back = 'wlans'
  } else if (nav.page === 'iface-new') {
    title = 'Interfaces > New'
    back = 'ifaces'
  } else if (nav.page === 'iface-edit') {
    title = 'Interfaces > Edit'
    back = 'ifaces'
  }
  return (
    <div className="wlc-pagehead">
      <h4 className="wlc-pagetitle">{title}</h4>
      <div className="wlc-pageactions">
        {dirty && (
          <span className="wlc-dirty" title="These edits are not active until you press Apply">
            Unapplied changes
          </span>
        )}
        {back && (
          <button type="button" className="btn btn-sm wlc-btn" onClick={() => go({ page: back })}>
            &lt; Back
          </button>
        )}
        {draft && (
          <button type="button" className="btn btn-sm btn-primary wlc-btn" onClick={(e) => apply(e.currentTarget)}>
            Apply
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- small form pieces ----------

function Field({ label, htmlFor, note, children }) {
  return (
    <div className="wlc-row">
      {htmlFor ? (
        <label className="wlc-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="wlc-label">{label}</span>
      )}
      <div className="wlc-control">
        {children}
        {note && <p className="wlc-note">{note}</p>}
      </div>
    </div>
  )
}

function Tick({ checked, onChange, label, aria, disabled = false }) {
  return (
    <label className={`wlc-tick${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} aria-label={aria} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function Select({ id, value, onChange, options, disabled }) {
  return (
    <select id={id} className="select wlc-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.id} value={o.id} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Tabs({ tabs, value, onChange, changed = [], label, small = false }) {
  return (
    <div className={`wlc-tabs${small ? ' small' : ''}`} role="tablist" aria-label={label}>
      {tabs.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          className={`wlc-tab${value === id ? ' on' : ''}`}
          onClick={() => {
            sfx.tick()
            onChange(id)
          }}
        >
          {text}
          {changed.includes(id) && (
            <span className="wlc-tabdot" title="Unapplied changes on this tab">
              <span className="sr-only"> (unapplied changes)</span>
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function Table({ head, rows, empty }) {
  return (
    <div className="wlc-scroll">
      <table className="wlc-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows
          ) : (
            <tr>
              <td colSpan={head.length} className="wlc-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const Teach = ({ children }) => (
  <p className="wlc-teach">
    <Info size={13} /> <span>{children}</span>
  </p>
)

// ---------- pages ----------

function PageBody(ctx) {
  const { nav, cfg } = ctx
  switch (nav.page) {
    case 'summary':
      return <MonitorSummary cfg={cfg} />
    case 'clients':
      return <MonitorClients cfg={cfg} />
    case 'wlans':
      return <WlanList {...ctx} />
    case 'wlan-new':
      return ctx.draft ? <WlanNew {...ctx} /> : null
    case 'wlan-edit':
      return ctx.draft ? <WlanEdit {...ctx} /> : <p className="small">This WLAN no longer exists.</p>
    case 'general':
      return <ControllerGeneral cfg={cfg} />
    case 'ifaces':
      return <InterfaceList {...ctx} />
    case 'iface-new':
      return <InterfaceNew {...ctx} />
    case 'iface-edit':
      return <InterfaceEdit {...ctx} />
    case 'ports':
      return <Ports cfg={cfg} />
    case 'aps':
      return <AllAps cfg={cfg} />
    case 'radius':
      return <Radius cfg={cfg} />
    case 'exclusion':
      return <Exclusion />
    case 'mgmt':
      return <MgmtSummary cfg={cfg} />
    case 'mgmt-wireless':
      return <MgmtWireless {...ctx} />
    default:
      return null
  }
}

function MonitorSummary({ cfg }) {
  const enabled = cfg.wlans.filter((w) => w.enabled).length
  return (
    <div className="wlc-stack">
      <h5 className="wlc-section">Controller Summary</h5>
      <dl className="wlc-kv">
        <dt>Management IP Address</dt>
        <dd className="mono">{cfg.system.mgmtIp}</dd>
        <dt>Software Version</dt>
        <dd className="mono">{cfg.system.version}</dd>
        <dt>System Name</dt>
        <dd>{cfg.system.name}</dd>
        <dt>Model</dt>
        <dd>{cfg.system.model}</dd>
        <dt>Up Time</dt>
        <dd>{cfg.system.uptime}</dd>
      </dl>
      <h5 className="wlc-section">Access Point Summary</h5>
      <Table
        head={['', 'Total', 'Up', 'Down']}
        rows={[
          ['802.11a/n/ac Radios', cfg.aps.length, cfg.aps.length, 0],
          ['802.11b/g/n Radios', cfg.aps.length, cfg.aps.length, 0],
          ['All APs', cfg.aps.length, cfg.aps.length, 0]
        ].map(([k, ...v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            {v.map((x, i) => (
              <td key={i} className="tabular">
                {x}
              </td>
            ))}
          </tr>
        ))}
      />
      <h5 className="wlc-section">Client Summary</h5>
      <dl className="wlc-kv">
        <dt>Current Clients</dt>
        <dd className="tabular">{cfg.clients.length}</dd>
        <dt>WLANs</dt>
        <dd className="tabular">
          {cfg.wlans.length} configured, {enabled} enabled
        </dd>
      </dl>
    </div>
  )
}

function MonitorClients({ cfg }) {
  return (
    <div className="wlc-stack">
      <Table
        head={['Client MAC Addr', 'IP Address', 'AP Name', 'WLAN Profile', 'WLAN SSID', 'Protocol', 'Status', 'Auth', 'VLAN']}
        empty="No clients. Use the test client to connect one."
        rows={cfg.clients.map((c) => (
          <tr key={c.mac}>
            <td className="mono">{c.mac}</td>
            <td className="mono">{c.ip}</td>
            <td>{c.ap}</td>
            <td>{c.profile}</td>
            <td>{c.ssid}</td>
            <td>{c.protocol}</td>
            <td>Associated</td>
            <td>{c.method === 'Open' ? 'No' : 'Yes'}</td>
            <td className="tabular">{c.vlan}</td>
          </tr>
        ))}
      />
      <Teach>Every time you press Apply, connected clients are checked again. A change that breaks them knocks them off this list.</Teach>
    </div>
  )
}

function WlanList({ cfg, go, selected, setSelected, listAction, setListAction, runListAction }) {
  const toggle = (id, on) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)))
  return (
    <div className="wlc-stack">
      <div className="wlc-listbar">
        <span className="xsmall subtle">
          Entries 1 - {cfg.wlans.length} of {cfg.wlans.length}
        </span>
        <span className="wlc-go">
          <select className="select wlc-select" value={listAction} onChange={(e) => setListAction(e.target.value)} aria-label="WLAN action">
            <option value="create">Create New</option>
            <option value="enable">Enable Selected</option>
            <option value="disable">Disable Selected</option>
            <option value="remove">Remove Selected</option>
          </select>
          <button type="button" className="btn btn-sm wlc-btn" onClick={(e) => runListAction(e.currentTarget)}>
            Go
          </button>
        </span>
      </div>
      <Table
        head={['', 'WLAN ID', 'Type', 'Profile Name', 'WLAN SSID', 'Admin Status', 'Security Policies']}
        empty="No WLANs yet. Choose Create New and click Go."
        rows={cfg.wlans.map((w) => (
          <tr key={w.id}>
            <td className="wlc-cbcell">
              <input type="checkbox" checked={selected.includes(w.id)} onChange={(e) => toggle(w.id, e.target.checked)} aria-label={`Select WLAN ${w.id}`} />
            </td>
            <td>
              <button type="button" className="wlc-link" onClick={() => go({ page: 'wlan-edit', id: w.id })}>
                {w.id}
              </button>
            </td>
            <td>{w.type}</td>
            <td>
              <button type="button" className="wlc-link" onClick={() => go({ page: 'wlan-edit', id: w.id })}>
                {w.profile}
              </button>
            </td>
            <td>{w.ssid}</td>
            <td>
              <span className={`wlc-status ${w.enabled ? 'on' : 'off'}`}>{w.enabled ? 'Enabled' : 'Disabled'}</span>
            </td>
            <td className="mono">{securityPolicies(w)}</td>
          </tr>
        ))}
      />
      <Teach>Each WLAN is one SSID tied to one interface, and so to one VLAN. Every SSID adds beacons on every AP, so keep it to a few WLANs.</Teach>
    </div>
  )
}

function WlanNew({ cfg, draft, updDraft }) {
  const id = useId()
  const f = draft.data
  const free = freeWlanIds(cfg)
  return (
    <div className="wlc-form">
      <Field label="Type" htmlFor={`${id}-type`}>
        <select id={`${id}-type`} className="select wlc-select" value="WLAN" onChange={() => {}}>
          <option value="WLAN">WLAN</option>
          <option value="rlan" disabled>
            Remote LAN (not in this lab)
          </option>
          <option value="glan" disabled>
            Guest LAN (not in this lab)
          </option>
        </select>
      </Field>
      <Field label="Profile Name" htmlFor={`${id}-profile`} note="A name for the controller's own use. It is not sent over the air.">
        <input id={`${id}-profile`} className="input wlc-input" value={f.profile} maxLength={40} autoComplete="off" onChange={(e) => updDraft((d) => (d.profile = e.target.value))} />
      </Field>
      <Field label="SSID" htmlFor={`${id}-ssid`} note="What clients see. Case sensitive, up to 32 characters.">
        <input id={`${id}-ssid`} className="input wlc-input" value={f.ssid} maxLength={40} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => updDraft((d) => (d.ssid = e.target.value))} />
      </Field>
      <Field label="ID" htmlFor={`${id}-wid`} note="An index into the controller's WLAN list, only locally significant.">
        <select id={`${id}-wid`} className="select wlc-select" value={f.id} onChange={(e) => updDraft((d) => (d.id = e.target.value))}>
          {free.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}

function WlanEdit({ cfg, draft, updDraft, nav, setNav, tabsChanged }) {
  const id = useId()
  const w = draft.data
  const sec = w.security
  const mixed = sec.l2 === 'wpa+wpa2'
  const wpaMode = sec.l2 === 'wpa+wpa2' || sec.l2 === 'wpa2+wpa3'
  const set = (fn) => updDraft(fn)
  const [showKey, setShowKey] = useState(false)

  const setL2 = (l2) =>
    set((d) => {
      d.security.l2 = l2
      if (l2 === 'wpa+wpa2') {
        d.security.wpa3 = false
        d.security.cipher.gcmp256 = false
        d.security.akm.sae = false
        if (!d.security.wpa && !d.security.wpa2) d.security.wpa2 = true
      } else if (l2 === 'wpa2+wpa3') {
        d.security.wpa = false
        d.security.cipher.tkip = false
        if (!d.security.wpa2 && !d.security.wpa3) d.security.wpa2 = true
      }
    })

  const ifaces = cfg.interfaces.filter((i) => i.wlanCapable)
  const usesKey = wpaMode && (sec.akm.psk || (!mixed && sec.akm.sae))
  const hasKey = Boolean(draft.base.security.psk)

  return (
    <div className="wlc-stack">
      <Tabs tabs={WLAN_TABS} value={nav.tab} onChange={(t) => setNav((n) => ({ ...n, tab: t }))} changed={tabsChanged} label="WLAN settings" />

      {nav.tab === 'general' && (
        <div className="wlc-form">
          <Field label="Profile Name">
            <span className="wlc-static">{w.profile}</span>
          </Field>
          <Field label="Type">
            <span className="wlc-static">WLAN</span>
          </Field>
          <Field label="SSID" htmlFor={`${id}-ssid`} note="Case sensitive.">
            <input id={`${id}-ssid`} className="input wlc-input" value={w.ssid} maxLength={40} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => set((d) => (d.ssid = e.target.value))} />
          </Field>
          <Field label="Status">
            <Tick checked={w.enabled} label="Enabled" aria="Status Enabled" onChange={(v) => set((d) => (d.enabled = v))} />
          </Field>
          <Field label="Security Policies" note="Changes on the Security tab appear here after you apply them.">
            <span className="wlc-static mono">{securityPolicies(draft.base)}</span>
          </Field>
          <Field label="Radio Policy" htmlFor={`${id}-radio`} note={`Offered on ${radioById(w.radio).bands.map((b) => `${b} GHz`).join(' and ')} radios.`}>
            <Select id={`${id}-radio`} value={w.radio} options={RADIO_POLICIES} onChange={(v) => set((d) => (d.radio = v))} />
          </Field>
          <Field label="Interface/Interface Group(G)" htmlFor={`${id}-iface`} note="The interface decides which VLAN the WLAN's clients land in.">
            <Select id={`${id}-iface`} value={w.iface} options={ifaces.map((i) => ({ id: i.name, label: i.name }))} onChange={(v) => set((d) => (d.iface = v))} />
          </Field>
          <Field label="Broadcast SSID">
            <Tick checked={w.broadcast} label="Enabled" aria="Broadcast SSID Enabled" onChange={(v) => set((d) => (d.broadcast = v))} />
          </Field>
        </div>
      )}

      {nav.tab === 'security' && (
        <>
          <Tabs tabs={SEC_TABS} value={nav.sub} onChange={(t) => setNav((n) => ({ ...n, sub: t }))} label="Security settings" small />
          {nav.sub === 'l2' && (
            <div className="wlc-form">
              <Field label="Layer 2 Security" htmlFor={`${id}-l2`}>
                <Select
                  id={`${id}-l2`}
                  value={sec.l2}
                  options={L2_OPTIONS.map((o) => ({ ...o, label: o.legacy ? `${o.label} (legacy, not in this lab)` : o.label, disabled: o.legacy }))}
                  onChange={(v) => setL2(v)}
                />
              </Field>
              {sec.l2 === 'none' && <Teach>Open authentication: anyone in range can join, and nothing is encrypted at Layer 2.</Teach>}
              {wpaMode && (
                <>
                  <h5 className="wlc-section">Protected Management Frame</h5>
                  <Field label="PMF" htmlFor={`${id}-pmf`} note="PMF (802.11w) protects deauthentication and disassociation frames from spoofing. WPA3 requires it.">
                    <Select id={`${id}-pmf`} value={sec.pmf} options={PMF_OPTIONS} onChange={(v) => set((d) => (d.security.pmf = v))} />
                  </Field>

                  <h5 className="wlc-section">{mixed ? 'WPA+WPA2 Parameters' : 'WPA2+WPA3 Parameters'}</h5>
                  {mixed && (
                    <Field label="WPA Policy">
                      <Tick checked={sec.wpa} label="Enabled" aria="WPA Policy" onChange={(v) => set((d) => (d.security.wpa = v))} />
                    </Field>
                  )}
                  <Field label="WPA2 Policy">
                    <Tick checked={sec.wpa2} label="Enabled" aria="WPA2 Policy" onChange={(v) => set((d) => (d.security.wpa2 = v))} />
                  </Field>
                  {!mixed && (
                    <Field label="WPA3 Policy">
                      <Tick checked={sec.wpa3} label="Enabled" aria="WPA3 Policy" onChange={(v) => set((d) => (d.security.wpa3 = v))} />
                    </Field>
                  )}
                  <Field label={mixed ? 'WPA2 Encryption' : 'Encryption Cipher'}>
                    <span className="wlc-ticks">
                      <Tick checked={sec.cipher.aes} label={mixed ? 'AES' : 'CCMP128 (AES)'} aria="AES encryption" onChange={(v) => set((d) => (d.security.cipher.aes = v))} />
                      {mixed ? (
                        <Tick checked={sec.cipher.tkip} label="TKIP" aria="TKIP encryption" onChange={(v) => set((d) => (d.security.cipher.tkip = v))} />
                      ) : (
                        <Tick checked={sec.cipher.gcmp256} label="GCMP256" aria="GCMP256 encryption" onChange={(v) => set((d) => (d.security.cipher.gcmp256 = v))} />
                      )}
                    </span>
                  </Field>

                  <h5 className="wlc-section">Authentication Key Management</h5>
                  <Field label="802.1X">
                    <Tick checked={sec.akm.dot1x} label="Enable" aria="802.1X key management" onChange={(v) => set((d) => (d.security.akm.dot1x = v))} />
                  </Field>
                  <Field label="PSK">
                    <Tick checked={sec.akm.psk} label="Enable" aria="PSK key management" onChange={(v) => set((d) => (d.security.akm.psk = v))} />
                  </Field>
                  {!mixed && (
                    <Field label="SAE">
                      <Tick checked={sec.akm.sae} label="Enable" aria="SAE key management" onChange={(v) => set((d) => (d.security.akm.sae = v))} />
                    </Field>
                  )}
                  {usesKey && (
                    <>
                      <Field label="PSK Format" htmlFor={`${id}-fmt`}>
                        <Select
                          id={`${id}-fmt`}
                          value={sec.pskFormat}
                          options={[
                            { id: 'ascii', label: 'ASCII' },
                            { id: 'hex', label: 'HEX' }
                          ]}
                          onChange={(v) => set((d) => (d.security.pskFormat = v))}
                        />
                      </Field>
                      <Field
                        label={!mixed && sec.akm.sae && !sec.akm.psk ? 'Password (SAE)' : 'Pre-Shared Key'}
                        htmlFor={`${id}-key`}
                        note={sec.pskFormat === 'hex' ? 'Exactly 64 hexadecimal digits.' : `8 to 63 characters, case sensitive.${draft.pskEditing ? ` You have typed ${sec.psk.length}.` : ''}`}
                      >
                        <span className="wlc-keyrow">
                          <input
                            id={`${id}-key`}
                            className="input wlc-input"
                            type={showKey && draft.pskEditing ? 'text' : 'password'}
                            value={draft.pskEditing ? sec.psk : ''}
                            placeholder={hasKey ? 'Key is set (hidden). Type to replace it.' : 'Type a key'}
                            autoComplete="new-password"
                            autoCapitalize="off"
                            spellCheck={false}
                            onChange={(e) =>
                              updDraft((d, all) => {
                                d.security.psk = e.target.value
                                all.pskEditing = true
                              })
                            }
                          />
                          {draft.pskEditing && (
                            <button type="button" className="btn btn-sm wlc-btn wlc-eye" onClick={() => setShowKey((s) => !s)} aria-label={showKey ? 'Hide the key' : 'Show the key'} aria-pressed={showKey}>
                              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                        </span>
                      </Field>
                    </>
                  )}
                  <Teach>
                    {mixed
                      ? 'WPA2-Personal is WPA2 Policy, AES and PSK. WPA and TKIP are deprecated; 802.1X means Enterprise mode with a RADIUS server.'
                      : 'WPA3-Personal uses SAE in place of PSK and needs PMF. Ticking both policies with PSK and SAE is transition mode, for a mix of WPA2 and WPA3 clients.'}
                  </Teach>
                </>
              )}
            </div>
          )}
          {nav.sub === 'l3' && (
            <div className="wlc-form">
              <Field label="Layer 3 Security" htmlFor={`${id}-l3`}>
                <Select
                  id={`${id}-l3`}
                  value={w.l3}
                  options={[
                    { id: 'none', label: 'None' },
                    { id: 'web', label: 'Web Policy (not in this lab)', disabled: true }
                  ]}
                  onChange={(v) => set((d) => (d.l3 = v))}
                />
              </Field>
              <Teach>Layer 3 security adds a web portal (web authentication or passthrough) after a client joins, typical for guest WLANs. The CCNA tasks configure Layer 2 security.</Teach>
            </div>
          )}
          {nav.sub === 'aaa' && (
            <div className="wlc-form">
              <p className="small subtle">Select AAA servers below to override use of default servers on this WLAN.</p>
              {[0, 1, 2].map((n) => (
                <Field key={n} label={`Server ${n + 1}`} htmlFor={`${id}-aaa${n}`}>
                  <Select
                    id={`${id}-aaa${n}`}
                    value={w.aaa[n]}
                    options={[{ id: 'none', label: 'None' }, ...cfg.radius.map((r) => ({ id: r.ip, label: `IP:${r.ip}, Port:${r.port}` }))]}
                    onChange={(v) => set((d) => (d.aaa[n] = v))}
                  />
                </Field>
              ))}
              <Teach>RADIUS servers check users only on 802.1X (Enterprise) WLANs. Personal WLANs, with PSK or SAE, never ask a RADIUS server.</Teach>
            </div>
          )}
        </>
      )}

      {nav.tab === 'qos' && (
        <div className="wlc-form">
          <Field label="Quality of Service (QoS)" htmlFor={`${id}-qos`} note={`${qosById(w.qos).short} treats every frame on this WLAN as ${qosById(w.qos).use}.`}>
            <Select id={`${id}-qos`} value={w.qos} options={QOS_PROFILES} onChange={(v) => set((d) => (d.qos = v))} />
          </Field>
          <Field label="WMM Policy" htmlFor={`${id}-wmm`} note="Wi-Fi Multimedia lets clients mark their own frames with a priority.">
            <Select id={`${id}-wmm`} value={w.wmm} options={WMM_POLICIES} onChange={(v) => set((d) => (d.wmm = v))} />
          </Field>
          <div className="wlc-scroll">
            <table className="wlc-table wlc-qos">
              <thead>
                <tr>
                  <th scope="col">Profile</th>
                  <th scope="col">Meant for</th>
                </tr>
              </thead>
              <tbody>
                {['platinum', 'gold', 'silver', 'bronze'].map((q) => (
                  <tr key={q} className={w.qos === q ? 'on' : ''}>
                    <th scope="row">{qosById(q).short}</th>
                    <td>{qosById(q).use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nav.tab === 'advanced' && (
        <div className="wlc-form">
          <Field label="Allow AAA Override">
            <Tick checked={w.advanced.aaaOverride} label="Enabled" aria="Allow AAA Override" onChange={(v) => set((d) => (d.advanced.aaaOverride = v))} />
          </Field>
          <Field label="Coverage Hole Detection">
            <Tick checked={w.advanced.coverageHole} label="Enabled" aria="Coverage Hole Detection" onChange={(v) => set((d) => (d.advanced.coverageHole = v))} />
          </Field>
          <Field label="Enable Session Timeout" htmlFor={`${id}-st`} note="After this many seconds a client must authenticate again. The default is 1800 (30 minutes).">
            <span className="wlc-inline">
              <Tick checked={w.advanced.sessionTimeoutOn} label="" aria="Enable Session Timeout" onChange={(v) => set((d) => (d.advanced.sessionTimeoutOn = v))} />
              <input id={`${id}-st`} className="input wlc-input wlc-num" inputMode="numeric" value={w.advanced.sessionTimeout} disabled={!w.advanced.sessionTimeoutOn} onChange={(e) => set((d) => (d.advanced.sessionTimeout = e.target.value))} />
              <span className="xsmall subtle">Session Timeout (secs)</span>
            </span>
          </Field>
          <Field label="P2P Blocking Action" htmlFor={`${id}-p2p`} note="Drop stops wireless clients on this WLAN from talking to each other directly.">
            <Select id={`${id}-p2p`} value={w.advanced.p2p} options={P2P_OPTIONS} onChange={(v) => set((d) => (d.advanced.p2p = v))} />
          </Field>
          <Field label="Client Exclusion" htmlFor={`${id}-ex`} note="Clients that keep failing to authenticate are blocked for this many seconds (60 by default).">
            <span className="wlc-inline">
              <Tick checked={w.advanced.exclusionOn} label="Enabled" aria="Client Exclusion Enabled" onChange={(v) => set((d) => (d.advanced.exclusionOn = v))} />
              <input id={`${id}-ex`} className="input wlc-input wlc-num" inputMode="numeric" value={w.advanced.exclusionTimeout} disabled={!w.advanced.exclusionOn} onChange={(e) => set((d) => (d.advanced.exclusionTimeout = e.target.value))} />
              <span className="xsmall subtle">Timeout Value (secs)</span>
            </span>
          </Field>
          <Field label="DHCP Addr. Assignment" note="When required, a client gets no network access until it takes an address from DHCP.">
            <Tick checked={w.advanced.dhcpRequired} label="Required" aria="DHCP Address Assignment Required" onChange={(v) => set((d) => (d.advanced.dhcpRequired = v))} />
          </Field>
          <Field label="FlexConnect Local Switching" note="Read only here: these APs run in Local mode, so client traffic is tunneled to the controller in CAPWAP. Local switching applies to FlexConnect APs.">
            <Tick checked={false} disabled label="Enabled" aria="FlexConnect Local Switching" onChange={() => {}} />
          </Field>
        </div>
      )}
    </div>
  )
}

function ControllerGeneral({ cfg }) {
  return (
    <div className="wlc-stack">
      <dl className="wlc-kv">
        <dt>Name</dt>
        <dd>{cfg.system.name}</dd>
        <dt>Model</dt>
        <dd>{cfg.system.model}</dd>
        <dt>Software Version</dt>
        <dd className="mono">{cfg.system.version}</dd>
        <dt>LAG Mode</dt>
        <dd>Disabled</dd>
        <dt>Web access</dt>
        <dd>HTTPS to the management interface, {cfg.system.mgmtIp}</dd>
      </dl>
      <Teach>Ports are physical; interfaces are logical. Look at CONTROLLER, Interfaces to see which VLAN each WLAN can reach.</Teach>
    </div>
  )
}

function InterfaceList({ cfg, go }) {
  return (
    <div className="wlc-stack">
      <div className="wlc-listbar">
        <span className="xsmall subtle">Entries 1 - {cfg.interfaces.length} of {cfg.interfaces.length}</span>
        <button type="button" className="btn btn-sm wlc-btn" onClick={() => go({ page: 'iface-new' })}>
          New...
        </button>
      </div>
      <Table
        head={['Interface Name', 'VLAN Identifier', 'IP Address', 'Interface Type', 'Dynamic AP Management']}
        rows={cfg.interfaces.map((i) => (
          <tr key={i.name}>
            <td>
              <button type="button" className="wlc-link" onClick={() => go({ page: 'iface-edit', id: i.name })}>
                {i.name}
              </button>
            </td>
            <td className="tabular">{i.vlan ?? 'N/A'}</td>
            <td className="mono">{i.ip || '0.0.0.0'}</td>
            <td>{i.type === 'dynamic' ? 'Dynamic' : 'Static'}</td>
            <td>{i.apMgmt ? 'Enabled' : i.type === 'dynamic' ? 'Disabled' : 'Not Supported'}</td>
          </tr>
        ))}
      />
      <Teach>
        The management interface carries CAPWAP to the APs and admin traffic. The virtual interface ({cfg.interfaces.find((i) => i.name === 'virtual')?.ip}) is what clients see as the DHCP relay. A dynamic interface maps WLANs to one VLAN. The switch port to the controller ({cfg.network.switchPort}) is an 802.1Q trunk.
      </Teach>
    </div>
  )
}

function InterfaceNew({ draft, updDraft }) {
  const id = useId()
  if (!draft) return null
  return (
    <div className="wlc-form">
      <Field label="Interface Name" htmlFor={`${id}-name`}>
        <input id={`${id}-name`} className="input wlc-input" value={draft.data.name} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => updDraft((d) => (d.name = e.target.value))} />
      </Field>
      <Field label="VLAN Id" htmlFor={`${id}-vlan`} note="The wired VLAN this interface sits in. The switch trunk must carry it.">
        <input id={`${id}-vlan`} className="input wlc-input wlc-num" inputMode="numeric" value={draft.data.vlan} onChange={(e) => updDraft((d) => (d.vlan = e.target.value))} />
      </Field>
    </div>
  )
}

function InterfaceEdit({ cfg, nav, draft, updDraft }) {
  const id = useId()
  const i = cfg.interfaces.find((x) => x.name === nav.id)
  if (!i) return <p className="small">This interface no longer exists.</p>
  const ro = !draft
  const v = draft ? draft.data : interfaceDraft(i)
  const input = (key, label, note) => (
    <Field label={label} htmlFor={`${id}-${key}`} note={note}>
      {ro ? (
        <span className="wlc-static mono">{v[key] || (key === 'vlan' ? 'N/A' : 'none')}</span>
      ) : (
        <input id={`${id}-${key}`} className={`input wlc-input${key === 'vlan' ? ' wlc-num' : ''}`} inputMode={key === 'vlan' ? 'numeric' : 'decimal'} value={v[key]} autoComplete="off" onChange={(e) => updDraft((d) => (d[key] = e.target.value))} />
      )}
    </Field>
  )
  return (
    <div className="wlc-form">
      <h5 className="wlc-section">General Information</h5>
      <Field label="Interface Name">
        <span className="wlc-static">{i.name}</span>
      </Field>
      <Field label="Physical Information">
        <span className="wlc-static">Port Number {i.port}</span>
      </Field>
      {ro && <Teach>{i.name === 'management' ? 'The management interface stays as it is in this lab: the APs reach the controller through it.' : 'This interface is not used for WLANs.'}</Teach>}
      <h5 className="wlc-section">Interface Address</h5>
      {input('vlan', 'VLAN Identifier')}
      {input('ip', 'IP Address')}
      {input('mask', 'Netmask')}
      {input('gateway', 'Gateway', 'The router on this VLAN.')}
      <h5 className="wlc-section">DHCP Information</h5>
      {input('dhcp1', 'Primary DHCP Server', 'The controller relays client DHCP requests here.')}
      {input('dhcp2', 'Secondary DHCP Server')}
    </div>
  )
}

function Ports({ cfg }) {
  return (
    <div className="wlc-stack">
      <Table
        head={['Port No', 'Admin Status', 'Physical Mode', 'Physical Status', 'Link Status']}
        rows={[1, 2].map((n) => (
          <tr key={n}>
            <td className="tabular">{n}</td>
            <td>Enable</td>
            <td>Auto</td>
            <td>{n === 1 ? '1000 Full Duplex' : 'Auto'}</td>
            <td>{n === 1 ? 'Link Up' : 'Link Down'}</td>
          </tr>
        ))}
      />
      <Teach>
        Port 1 is a distribution system port, cabled to {cfg.network.switchPort}. The switch side is an 802.1Q trunk allowing VLANs {cfg.network.trunkVlans.join(', ')}. That list lives in the switch configuration, not on the WLC. The service port is a separate access port for out-of-band management.
      </Teach>
    </div>
  )
}

function AllAps({ cfg }) {
  return (
    <div className="wlc-stack">
      <Table
        head={['AP Name', 'IP Address', 'AP Model', 'AP MAC', 'AP Up Time', 'Admin Status', 'Operational Status', 'AP Mode']}
        rows={cfg.aps.map((a) => (
          <tr key={a.name}>
            <td>{a.name}</td>
            <td className="mono">{a.ip}</td>
            <td className="mono">{a.model}</td>
            <td className="mono">{a.mac}</td>
            <td>{a.uptime}</td>
            <td>Enabled</td>
            <td>{a.status}</td>
            <td>{a.mode}</td>
          </tr>
        ))}
      />
      <Teach>Lightweight APs in Local mode tunnel every WLAN to the controller inside CAPWAP, so their switch ports are plain access ports in VLAN 10.</Teach>
    </div>
  )
}

function Radius({ cfg }) {
  return (
    <div className="wlc-stack">
      <Table
        head={['Network User', 'Management', 'Server Index', 'Server Address', 'Port', 'Admin Status']}
        rows={cfg.radius.map((r) => (
          <tr key={r.index}>
            <td>Yes</td>
            <td>Yes</td>
            <td className="tabular">{r.index}</td>
            <td className="mono">{r.ip}</td>
            <td className="tabular">{r.port}</td>
            <td>{r.enabled ? 'Enabled' : 'Disabled'}</td>
          </tr>
        ))}
      />
      <Teach>Enterprise WLANs (802.1X) send each login to these servers. Network User covers wireless clients; Management covers admins logging in to the controller.</Teach>
    </div>
  )
}

const EXCLUSION = ['Excessive 802.11 Association Failures', 'Excessive 802.11 Authentication Failures', 'Excessive 802.1X Authentication Failures', 'IP Theft or IP Reuse', 'Excessive Web Authentication Failures']

function Exclusion() {
  return (
    <div className="wlc-stack">
      <div className="wlc-form">
        {EXCLUSION.map((p) => (
          <Tick key={p} checked disabled label={p} aria={p} onChange={() => {}} />
        ))}
      </div>
      <Teach>A client that trips one of these is excluded for the WLAN's Client Exclusion timeout, 60 seconds by default. That is enough to slow a password-guessing attack to a crawl.</Teach>
    </div>
  )
}

function MgmtSummary({ cfg }) {
  return (
    <div className="wlc-stack">
      <dl className="wlc-kv">
        <dt>HTTPS Access</dt>
        <dd>Enabled</dd>
        <dt>HTTP Access</dt>
        <dd>Disabled</dd>
        <dt>SSH</dt>
        <dd>Enabled</dd>
        <dt>Telnet</dt>
        <dd>Disabled</dd>
        <dt>Console</dt>
        <dd>9600 baud, 8 data bits, 1 stop bit</dd>
        <dt>Admin login</dt>
        <dd>Local users, then TACACS+ or RADIUS</dd>
        <dt>Mgmt Via Wireless</dt>
        <dd>{cfg.mgmtViaWireless ? 'Enabled' : 'Disabled'}</dd>
      </dl>
      <Teach>Admins reach a WLC with HTTPS or SSH to the management interface, or the console port. HTTP and Telnet send passwords in the clear.</Teach>
    </div>
  )
}

function MgmtWireless({ draft, updDraft }) {
  if (!draft) return null
  return (
    <div className="wlc-form">
      <Tick checked={draft.data.on} label="Enable Controller Management to be accessible from Wireless Clients" aria="Management via wireless" onChange={(v) => updDraft((d) => (d.on = v))} />
      <Teach>Off by default: nobody on a WLAN can open the controller GUI or CLI. Keeping management on the wired side is the safer choice.</Teach>
    </div>
  )
}

// ---------- test client ----------

const STATUS_ICON = { ok: CircleCheck, warn: TriangleAlert, fail: CircleX, skip: Minus }

function TestClient({ cfg, defaults, onConnect }) {
  const id = useId()
  const [device, setDevice] = useState(defaults.device)
  const [mode, setMode] = useState(defaults.typed ? 'typed' : 'list')
  const [picked, setPicked] = useState(defaults.typed ? '' : defaults.ssid)
  const [typed, setTyped] = useState(defaults.typed ? defaults.ssid : '')
  const [pass, setPass] = useState(defaults.passphrase || '')
  const [show, setShow] = useState(false)
  const [result, setResult] = useState(null)
  const [run, setRun] = useState(0)
  const boxRef = useRef(null)

  const dev = deviceById(device)
  const networks = visibleNetworks(cfg, device)
  const listValue = networks.some((n) => n.ssid === picked) ? picked : ''
  const ssid = mode === 'typed' ? typed : listValue
  const connected = cfg.clients.find((c) => c.device === device)

  const connect = () => {
    const r = onConnect({ device, ssid, passphrase: pass, typed: mode === 'typed' })
    setResult(r)
    setRun((n) => n + 1)
    if (r.ok) feedbackCorrect(boxRef.current)
    else feedbackWrong(boxRef.current)
  }

  const pickNetwork = (value) => {
    sfx.tick()
    if (value === '__other') {
      setMode('typed')
      if (!typed) setTyped(picked)
    } else {
      setMode('list')
      setPicked(value)
    }
  }

  return (
    <section className="wlc-card wlc-client" aria-labelledby={`${id}-h`}>
      <h5 id={`${id}-h`} className="wlc-sub">
        Test client
      </h5>
      <div className="w-pill-group wlc-devices" role="group" aria-label="Client device">
        {DEVICES.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={device === d.id}
            onClick={() => {
              sfx.tap()
              setDevice(d.id)
              setResult(null)
            }}
          >
            {d.name}
          </button>
        ))}
      </div>
      <p className="xsmall subtle wlc-devnote">{dev.detail}.</p>
      <p className="xsmall wlc-conn">
        <Wifi size={12} /> {connected ? `Connected to ${connected.ssid}, ${connected.ip}, VLAN ${connected.vlan}` : 'Not connected'}
      </p>

      <label className="wlc-clabel" htmlFor={`${id}-net`}>
        Network
      </label>
      <select id={`${id}-net`} className="select wlc-select" value={mode === 'typed' ? '__other' : listValue} onChange={(e) => pickNetwork(e.target.value)}>
        {mode === 'list' && !listValue && <option value="">{networks.length ? 'Choose a network' : 'No networks in range'}</option>}
        {networks.map((n) => (
          <option key={n.ssid} value={n.ssid}>
            {n.ssid} ({n.security}{/^WPA3/.test(n.security) && !dev.wpa3 ? ', not supported here' : ''})
          </option>
        ))}
        <option value="__other">Other network: type the SSID</option>
      </select>
      {mode === 'typed' && (
        <>
          <label className="wlc-clabel" htmlFor={`${id}-ssid`}>
            SSID {defaults.typed && typed === defaults.ssid ? '(saved on this device)' : ''}
          </label>
          <input id={`${id}-ssid`} className="input wlc-input" value={typed} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        </>
      )}
      <label className="wlc-clabel" htmlFor={`${id}-pass`}>
        Passphrase
      </label>
      <span className="wlc-keyrow">
        <input id={`${id}-pass`} className="input wlc-input" type={show ? 'text' : 'password'} value={pass} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connect()} />
        <button type="button" className="btn btn-sm wlc-btn wlc-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide the passphrase' : 'Show the passphrase'} aria-pressed={show}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </span>
      <button type="button" className="btn btn-primary wlc-connect" onClick={connect} disabled={!ssid}>
        <Wifi size={15} /> Connect
      </button>

      <div ref={boxRef} className="wlc-result" aria-live="polite">
        {result && (
          <>
            <p className={`wlc-verdict ${result.ok ? 'good' : 'bad'}`}>
              {result.ok ? <CircleCheck size={16} /> : <CircleX size={16} />}
              <strong>{result.ok ? result.summary : `${deviceById(result.device).name} could not connect to ${result.ssid || 'the network'}.`}</strong>
            </p>
            <ol key={run} className="wlc-steps">
              {JOIN_STEPS.map((s, i) => {
                const st = result.steps.find((x) => x.id === s.id)
                const status = st ? st.status : 'pending'
                const Icon = STATUS_ICON[status] || Minus
                return (
                  <li key={s.id} className={`wlc-step ${status}`} style={{ '--i': i }}>
                    <Icon size={15} className="wlc-step-icon" aria-hidden="true" />
                    <span>
                      <strong>{s.label}</strong>
                      <span className="sr-only">: {status === 'pending' ? 'not reached' : status === 'ok' ? 'passed' : status === 'warn' ? 'passed with a warning' : status === 'skip' ? 'skipped' : 'failed'}</span>
                      <span className="wlc-steptext">{st ? st.text : 'Not reached.'}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </div>
    </section>
  )
}
