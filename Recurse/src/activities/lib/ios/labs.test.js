import { describe, expect, it } from 'vitest'
import { CONSOLE_LABS, consoleLabsForTopic, getConsoleLab, labScore } from './labs.js'
import { createLabSim, gradeLab, runLine } from './sim.js'

const TOPICS = {
  'cl-d1-router-bringup': 'ccna-cabling-interfaces',
  'cl-d1-ipv6': 'ccna-ipv6',
  'cl-d2-vlans': 'ccna-vlans',
  'cl-d2-troubleshoot-vlan': 'ccna-vlans',
  'cl-d2-trunk': 'ccna-trunking',
  'cl-d2-etherchannel': 'ccna-etherchannel',
  'cl-d2-stp': 'ccna-stp',
  'cl-d3-static': 'ccna-static-routing',
  'cl-d3-floating': 'ccna-static-routing',
  'cl-d3-ospf': 'ccna-ospf',
  'cl-ts-ospf': 'ccna-ospf',
  'cl-d3-ros': 'ccna-intervlan-routing',
  'cl-ts-intervlan': 'ccna-intervlan-routing',
  'cl-d3-hsrp': 'ccna-fhrp',
  'cl-d4-dhcp': 'ccna-dhcp-dns',
  'cl-d4-nat': 'ccna-nat',
  'cl-ts-nat': 'ccna-nat',
  'cl-d4-ntp': 'ccna-ntp-snmp-syslog',
  'cl-d4-syslog': 'ccna-ntp-snmp-syslog',
  'cl-d4-snmp': 'ccna-ntp-snmp-syslog',
  'cl-d4-ssh': 'ccna-ssh-tftp-ftp',
  'cl-d5-portsec': 'ccna-layer2-security',
  'cl-d5-dhcpsnoop': 'ccna-layer2-security',
  'cl-d5-acl-standard': 'ccna-acls',
  'cl-d5-acl-extended': 'ccna-acls',
  'cl-ts-acl': 'ccna-acls',
  'cl-d5-device-hardening': 'ccna-device-security',
  'cl-d2-cdp-lldp': 'ccna-cdp-lldp',
  'cl-d3-ipv6-static': 'ccna-static-routing',
  'cl-ts-trunk': 'ccna-trunking'
}

function clock() {
  let t = 1_700_000_000_000
  return () => (t += 1000)
}

/** Feed a solution like a learner would, pressing Enter at confirmation prompts. */
function play(lab) {
  const sim = createLabSim(lab, { now: clock() })
  const errors = []
  for (const cmd of lab.solution) {
    const r = runLine(sim, cmd)
    if (r.error) errors.push(`${cmd}: ${r.output}`)
    while (sim.pending && !['enable-pw', 'login-user', 'login-pass'].includes(sim.pending.kind)) runLine(sim, '')
  }
  return { sim, errors }
}

describe('lab catalog', () => {
  it('has the 30 labs with the expected ids and topics', () => {
    expect(CONSOLE_LABS).toHaveLength(30)
    expect(new Set(CONSOLE_LABS.map((l) => l.id)).size).toBe(30)
    for (const lab of CONSOLE_LABS) expect(lab.topic, lab.id).toBe(TOPICS[lab.id])
  })

  it('gives every lab the fields the widget needs', () => {
    for (const lab of CONSOLE_LABS) {
      expect(['build', 'troubleshoot'], lab.id).toContain(lab.kind)
      expect(lab.minutes, lab.id).toBeGreaterThan(0)
      expect(['router', 'switch'], lab.id).toContain(lab.deviceKind)
      expect(lab.title && lab.objective && lab.scenario, lab.id).toBeTruthy()
      expect(lab.checks.length, lab.id).toBeGreaterThan(0)
      expect(lab.solution.length, lab.id).toBeGreaterThan(0)
      expect(lab.suggestedShow.length, lab.id).toBeGreaterThan(0)
      expect(Array.isArray(lab.topology), lab.id).toBe(true)
      for (const c of lab.checks) expect(typeof c.test === 'function' && c.label && c.hint, `${lab.id}: ${c.label}`).toBeTruthy()
    }
  })

  it('marks the troubleshooting labs', () => {
    const ts = CONSOLE_LABS.filter((l) => l.kind === 'troubleshoot').map((l) => l.id).sort()
    expect(ts).toEqual(['cl-d2-troubleshoot-vlan', 'cl-ts-acl', 'cl-ts-intervlan', 'cl-ts-nat', 'cl-ts-ospf', 'cl-ts-trunk'])
    for (const id of ts) expect(getConsoleLab(id).symptoms?.length, id).toBeGreaterThan(0)
  })

  it('looks labs up by id and by topic', () => {
    expect(getConsoleLab('cl-d2-vlans').title).toMatch(/VLAN/)
    expect(getConsoleLab('nope')).toBeNull()
    const trunking = consoleLabsForTopic('ccna-trunking').map((l) => l.id)
    expect(trunking).toEqual(['cl-d2-trunk', 'cl-ts-trunk'])
    expect(consoleLabsForTopic('ccna-static-routing')).toHaveLength(3)
  })

  it('keeps em dashes out of every learner-facing string', () => {
    const text = JSON.stringify(CONSOLE_LABS)
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false)
  })

  it('lowers the score a little for hints and solution steps', () => {
    expect(labScore()).toBe(1)
    expect(labScore({ hints: 1 })).toBeLessThan(1)
    expect(labScore({ hints: 1, solutionSteps: 2 })).toBeLessThan(labScore({ hints: 1 }))
    expect(labScore({ hints: 50 })).toBe(0.3)
  })
})

describe.each(CONSOLE_LABS.map((l) => [l.id, l]))('%s', (_id, lab) => {
  it('applies its starting config cleanly', () => {
    const sim = createLabSim(lab, { now: clock() })
    expect(sim.setupErrors).toEqual([])
  })

  it('does not start already solved', () => {
    const sim = createLabSim(lab, { now: clock() })
    const results = gradeLab(lab, sim)
    expect(results.some((r) => !r.pass)).toBe(true)
  })

  it('passes every check after the known-good solution', () => {
    const { sim, errors } = play(lab)
    expect(errors).toEqual([])
    const failing = gradeLab(lab, sim).filter((r) => !r.pass).map((r) => r.label)
    expect(failing).toEqual([])
  })
})

describe('troubleshooting labs start broken', () => {
  it.each(CONSOLE_LABS.filter((l) => l.kind === 'troubleshoot').map((l) => [l.id, l]))('%s has a failing check before the fix', (_id, lab) => {
    const sim = createLabSim(lab, { now: clock() })
    expect(sim.startup).not.toBeNull()
    expect(gradeLab(lab, sim).filter((r) => !r.pass).length).toBeGreaterThan(0)
  })
})
