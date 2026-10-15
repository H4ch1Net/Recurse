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
  'cl-ts-trunk': 'ccna-trunking',
  'cl-d3-l3switch': 'ccna-intervlan-routing',
  'cl-d4-dhcp-relay': 'ccna-dhcp-dns',
  'cl-d2-stp-guards': 'ccna-stp',
  'cl-ts-dhcp': 'ccna-dhcp-dns',
  'cl-ts-hsrp': 'ccna-fhrp',
  'cl-ts-static': 'ccna-static-routing',
  'cl-ts-portsec': 'ccna-layer2-security',
  'cl-ts-ssh': 'ccna-ssh-tftp-ftp',
  'cl-ts-etherchannel': 'ccna-etherchannel',
  'cl-cap-branch-router': 'ccna-nat',
  'cl-cap-access-switch': 'ccna-vlans'
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
  it('has the 41 labs with the expected ids and topics', () => {
    expect(CONSOLE_LABS).toHaveLength(41)
    expect(new Set(CONSOLE_LABS.map((l) => l.id)).size).toBe(41)
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
    expect(ts).toEqual(['cl-d2-troubleshoot-vlan', 'cl-ts-acl', 'cl-ts-dhcp', 'cl-ts-etherchannel', 'cl-ts-hsrp', 'cl-ts-intervlan', 'cl-ts-nat', 'cl-ts-ospf', 'cl-ts-portsec', 'cl-ts-ssh', 'cl-ts-static', 'cl-ts-trunk'])
    for (const id of ts) expect(getConsoleLab(id).symptoms?.length, id).toBeGreaterThan(0)
  })

  it('looks labs up by id and by topic', () => {
    expect(getConsoleLab('cl-d2-vlans').title).toMatch(/VLAN/)
    expect(getConsoleLab('nope')).toBeNull()
    const trunking = consoleLabsForTopic('ccna-trunking').map((l) => l.id)
    expect(trunking).toEqual(['cl-d2-trunk', 'cl-ts-trunk'])
    expect(consoleLabsForTopic('ccna-static-routing').map((l) => l.id)).toEqual(['cl-d3-static', 'cl-d3-floating', 'cl-d3-ipv6-static', 'cl-ts-static'])
  })

  it('keeps em and en dashes out of every learner-facing string', () => {
    const text = JSON.stringify(CONSOLE_LABS)
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false)
    expect(text.includes(String.fromCharCode(0x2013))).toBe(false)
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

describe('round 2 labs start with their seeded faults', () => {
  const start = (id) => createLabSim(getConsoleLab(id), { now: clock() })

  it('cl-d2-stp-guards: G0/5 is err-disabled by BPDU guard and SW4 is root', () => {
    const sim = start('cl-d2-stp-guards')
    expect(sim.op.errdisabled).toContain('GigabitEthernet0/5')
    expect(sim.op.errInfo['GigabitEthernet0/5'].reason).toBe('bpduguard')
    expect(sim.op.bootMsgs.join('\n')).toContain('%SPANTREE-2-BLOCK_BPDUGUARD')
    const results = gradeLab(getConsoleLab('cl-d2-stp-guards'), sim)
    expect(results.find((r) => r.label.startsWith('SW1 is the root')).pass).toBe(false)
    expect(results.find((r) => r.label.startsWith('G0/5')).pass).toBe(false)
  })

  it('cl-ts-portsec: both ports are err-disabled by port security', () => {
    const sim = start('cl-ts-portsec')
    expect(sim.op.errdisabled.sort()).toEqual(['GigabitEthernet0/3', 'GigabitEthernet0/4'])
    expect(sim.op.bootMsgs.filter((m) => m.includes('PSECURE_VIOLATION'))).toHaveLength(2)
  })

  it('cl-ts-etherchannel: mode on facing LACP err-disables both members', () => {
    const sim = start('cl-ts-etherchannel')
    expect(sim.op.errdisabled.sort()).toEqual(['GigabitEthernet0/1', 'GigabitEthernet0/2'])
    expect(sim.op.bootMsgs[0]).toMatch(/%SPANTREE-2-CHNL_MISCFG/)
  })

  it('cl-ts-static: R1 LAN answers only some pings and R3 LAN none', () => {
    const sim = start('cl-ts-static')
    run(sim, 'enable')
    expect(runLine(sim, 'ping 192.168.1.10').output).toContain('!.!.!')
    expect(runLine(sim, 'ping 192.168.3.10').output).toContain('Success rate is 0 percent')
  })

  it('cl-ts-dhcp and cl-ts-ssh: nothing works yet', () => {
    const dhcp = start('cl-ts-dhcp')
    expect(gradeLab(getConsoleLab('cl-ts-dhcp'), dhcp).every((r) => !r.pass)).toBe(true)
    const ssh = start('cl-ts-ssh')
    run(ssh, 'enable')
    expect(runLine(ssh, 'show ip ssh').output).toContain('SSH Disabled')
  })

  it('cl-ts-hsrp: R1 is alone in the wrong group', () => {
    const sim = start('cl-ts-hsrp')
    run(sim, 'enable')
    expect(runLine(sim, 'show standby brief').output).toMatch(/Gi0\/0\s+1\s+90\s+Active\s+local\s+unknown\s+192\.168\.1\.253/)
  })

  it('capstones start from factory defaults', () => {
    expect(start('cl-cap-branch-router').dev.hostname).toBe('Router')
    expect(start('cl-cap-access-switch').dev.hostname).toBe('Switch')
    expect(start('cl-d3-l3switch').dev.model).toBe('l3switch')
  })
})

function run(sim, ...lines) {
  for (const l of lines) runLine(sim, l)
}
