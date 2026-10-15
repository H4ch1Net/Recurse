import { describe, expect, it } from 'vitest'
import { applyInterfaceEdit, applyNewWlan, applyWlanEdit, connectClient, interfaceDraft, joinClient, wlanDraft } from './model.js'
import { FAULTS, SCANNER_PROFILE, SCENARIOS, SCENARIO_IDS, emptyStats, faultNotes, getScenario, gradeScenario, recordApply, recordCreate, recordJoin, recordVisit, scenarioScore } from './scenarios.js'

const allPass = (grades) => grades.every((g) => g.pass)

/** Edit WLAN `id` through its draft and Apply; fails the test if Apply refuses. */
function edit(cfg, id, fn) {
  const draft = wlanDraft(cfg.wlans.find((w) => w.id === id))
  fn(draft)
  const res = applyWlanEdit(cfg, draft)
  expect(res.errors).toEqual([])
  return res.cfg
}

describe('scenario list', () => {
  it('matches the catalog props', () => {
    expect(SCENARIO_IDS).toEqual(['create-wlan', 'wpa3', 'troubleshoot', 'explore'])
    expect(getScenario('nope').id).toBe('create-wlan')
  })

  it('never starts solved, and has no em or en dashes in its text', () => {
    for (const s of SCENARIOS) {
      const cfg = s.build(() => 0)
      expect(allPass(gradeScenario(s, cfg, emptyStats()))).toBe(false)
      const text = JSON.stringify({ ...s, checks: gradeScenario(s, cfg, emptyStats()) })
      expect(text).not.toMatch(/[–—]/)
    }
  })
})

describe('create-wlan', () => {
  const s = getScenario('create-wlan')

  it('passes when Staff is built the way Odom configures a WPA2-Personal WLAN', () => {
    let cfg = s.build()
    const created = applyNewWlan(cfg, { profile: 'Staff', ssid: 'Staff', id: 2 })
    cfg = created.cfg
    let grades = gradeScenario(s, cfg)
    expect(grades.map((g) => g.pass)).toEqual([true, false, false, true, false, false, false])

    cfg = edit(cfg, 2, (d) => {
      d.enabled = true
      d.iface = 'staff'
      d.security.akm = { dot1x: false, psk: true, sae: false }
      d.security.psk = 'Video-Calls-All-Day'
    })
    grades = gradeScenario(s, cfg)
    expect(grades.filter((g) => !g.pass).map((g) => g.label)).toEqual(['QoS is set for video', 'The laptop is connected to Staff in VLAN 20'])

    cfg = connectClient(cfg, { device: 'laptop', ssid: 'Staff', passphrase: 'Video-Calls-All-Day' }).cfg
    cfg = edit(cfg, 2, (d) => (d.qos = 'gold'))
    expect(allPass(gradeScenario(s, cfg))).toBe(true)
  })

  it('does not accept WPA with TKIP or an 802.1X leftover', () => {
    let cfg = applyNewWlan(s.build(), { profile: 'Staff', ssid: 'Staff', id: 2 }).cfg
    cfg = edit(cfg, 2, (d) => {
      d.enabled = true
      d.iface = 'staff'
      d.security.wpa = true
      d.security.cipher.tkip = true
      d.security.akm = { dot1x: true, psk: true, sae: false }
      d.security.psk = 'Video-Calls-All-Day'
    })
    const grades = gradeScenario(s, cfg)
    expect(grades[3].pass).toBe(false)
    expect(grades[4].pass).toBe(false)
  })
})

describe('wpa3', () => {
  const s = getScenario('wpa3')

  it('passes with WPA3-only SAE, PMF required, a WPA3 laptop and a refused scanner', () => {
    let cfg = s.build()
    let stats = emptyStats()
    cfg = edit(cfg, 1, (d) => {
      d.security.l2 = 'wpa2+wpa3'
      d.security.wpa2 = false
      d.security.wpa3 = true
      d.security.akm = { dot1x: false, psk: false, sae: true }
      d.security.pmf = 'required'
    })
    const laptop = connectClient(cfg, s.client)
    cfg = laptop.cfg
    stats = recordJoin(stats, laptop.result)
    expect(laptop.result.method).toBe('WPA3-SAE')
    expect(allPass(gradeScenario(s, cfg, stats))).toBe(false)
    const scanner = connectClient(cfg, { ...s.client, device: 'scanner' })
    stats = recordJoin(stats, scanner.result)
    expect(scanner.result.code).toBe('wpa3-unsupported')
    expect(allPass(gradeScenario(s, scanner.cfg, stats))).toBe(true)
  })

  it('refuses to apply WPA3 without PMF Required', () => {
    const cfg = s.build()
    const d = wlanDraft(cfg.wlans[0])
    d.security.l2 = 'wpa2+wpa3'
    d.security.wpa2 = false
    d.security.wpa3 = true
    d.security.akm = { dot1x: false, psk: false, sae: true }
    const res = applyWlanEdit(cfg, d)
    expect(res.ok).toBe(false)
    expect(res.errors.join(' ')).toMatch(/Protected Management Frames/)
  })
})

describe('troubleshoot', () => {
  const s = getScenario('troubleshoot')

  /** Every combination of one fault per stage: 3 x 3 x 3. */
  const combos = []
  FAULTS.find.forEach((a, i) => FAULTS.security.forEach((b, j) => FAULTS.dhcp.forEach((c, k) => combos.push([i, j, k, [a.id, b.id, c.id]]))))

  /** An rng that returns the given indexes (out of 3) in order. */
  const picks = (idx) => {
    let n = 0
    return () => (idx[n++] + 0.5) / 3
  }

  it.each(combos)('seeds faults %i/%i/%i and every one stops the scanner', (i, j, k, ids) => {
    const cfg = s.build(picks([i, j, k]))
    expect(cfg.meta.faults).toEqual(ids)
    expect(faultNotes(cfg)).toHaveLength(3)
    const r = joinClient(cfg, SCANNER_PROFILE)
    expect(r.ok && r.vlan === 30).toBe(false)
    const grades = gradeScenario(s, cfg)
    expect(grades[0].pass).toBe(false)
    expect(grades.every((g) => g.hint)).toBe(true)
  })

  it.each(combos)('fixing faults %i/%i/%i one at a time passes every check', (i, j, k) => {
    let cfg = s.build(picks([i, j, k]))
    // Fix through the GUI's own Apply paths, in the order the test client reveals them.
    cfg = edit(cfg, 2, (d) => {
      d.enabled = true
      d.radio = 'all'
      d.ssid = 'Warehouse'
    })
    expect(gradeScenario(s, cfg)[0].pass).toBe(true)
    cfg = edit(cfg, 2, (d) => {
      d.security.akm = { dot1x: false, psk: true, sae: false }
      d.security.pmf = 'disabled'
      d.security.psk = 'Forklift-Lane-9'
    })
    expect(gradeScenario(s, cfg)[1].pass).toBe(true)
    cfg = edit(cfg, 2, (d) => (d.iface = 'warehouse'))
    const wh = interfaceDraft(cfg.interfaces.find((x) => x.name === 'warehouse'))
    cfg = applyInterfaceEdit(cfg, 'warehouse', { ...wh, vlan: '30', dhcp1: '10.10.1.17' }).cfg
    const grades = gradeScenario(s, cfg)
    expect(grades.slice(0, 4).every((g) => g.pass)).toBe(true)
    expect(grades[4].pass).toBe(false)
    cfg = connectClient(cfg, s.client).cfg
    expect(allPass(gradeScenario(s, cfg))).toBe(true)
  })

  it('does not count opening the WLAN as a fix', () => {
    let cfg = s.build(picks([0, 0, 0]))
    cfg = edit(cfg, 2, (d) => {
      d.enabled = true
      d.security.l2 = 'none'
      d.iface = 'warehouse'
    })
    const grades = gradeScenario(s, cfg)
    expect(grades[2].pass).toBe(true)
    expect(grades[3].pass).toBe(false)
  })

  it('points each hint at the fault the scanner hits first', () => {
    const cfg = s.build(picks([1, 2, 1]))
    expect(gradeScenario(s, cfg)[0].hint).toMatch(/Radio Policy/)
    const fixed = edit(cfg, 2, (d) => (d.radio = 'all'))
    expect(gradeScenario(s, fixed)[1].hint).toMatch(/masked/)
  })
})

describe('explore', () => {
  const s = getScenario('explore')

  it('completes after a few meaningful actions', () => {
    let cfg = s.build()
    let stats = emptyStats()
    expect(gradeScenario(s, cfg, stats).filter((g) => g.pass)).toHaveLength(0)
    stats = recordVisit(stats, 'ifaces')
    stats = recordCreate(stats)
    stats = recordApply(stats, 'qos')
    expect(allPass(gradeScenario(s, cfg, stats))).toBe(false)
    const r = connectClient(cfg, s.client)
    cfg = r.cfg
    stats = recordJoin(stats, r.result)
    expect(r.result.ok).toBe(true)
    expect(allPass(gradeScenario(s, cfg, stats))).toBe(true)
    expect(scenarioScore(s, { hints: 3 })).toBe(1)
  })
})

describe('scoring', () => {
  it('takes a little off per hint, with a floor', () => {
    const s = getScenario('create-wlan')
    expect(scenarioScore(s)).toBe(1)
    expect(scenarioScore(s, { hints: 2 })).toBe(0.84)
    expect(scenarioScore(s, { hints: 20 })).toBe(0.3)
  })
})
