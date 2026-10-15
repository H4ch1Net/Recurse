import { describe, expect, it } from 'vitest'
import {
  POLICIES,
  cloneAcl,
  configLines,
  evaluateAcl,
  gradePolicy,
  maskFromPrefix,
  normalizedBase,
  numberFits,
  packetPath,
  parseIp,
  ruleBody,
  ruleCheck,
  runPacket,
  specMatches,
  validateAcl,
  wildcardFromMask,
  wildcardFromPrefix,
  wildcardRange
} from './acl-tester'

const ip = (s) => parseIp(s)
const net = (a, w) => ({ kind: 'wild', ip: a, wildcard: w })
const host = (a) => ({ kind: 'host', ip: a })
const ANY = { kind: 'any' }
const rule = (action, src, extra = {}) => ({ action, protocol: 'ip', src, dst: ANY, port: '', ...extra })
const std = (rules, number = '10') => ({ kind: 'standard', naming: 'numbered', number, name: '', rules })
const ext = (rules, number = '110') => ({ kind: 'extended', naming: 'numbered', number, name: '', rules })
const packet = (src, dst, protocol = 'tcp', port = 80) => ({ src, dst, protocol, port })

describe('wildcard matching', () => {
  it('0 bits must match and 1 bits are ignored', () => {
    expect(specMatches(net('10.1.1.0', '0.0.0.255'), ip('10.1.1.77'))).toBe(true)
    expect(specMatches(net('10.1.1.0', '0.0.0.255'), ip('10.1.2.77'))).toBe(false)
    expect(specMatches(net('172.16.0.0', '0.0.255.255'), ip('172.16.99.1'))).toBe(true)
    expect(specMatches(net('10.1.1.0', '0.0.0.15'), ip('10.1.1.15'))).toBe(true)
    expect(specMatches(net('10.1.1.0', '0.0.0.15'), ip('10.1.1.16'))).toBe(false)
  })
  it('handles host and any', () => {
    expect(specMatches(host('10.2.2.10'), ip('10.2.2.10'))).toBe(true)
    expect(specMatches(host('10.2.2.10'), ip('10.2.2.11'))).toBe(false)
    expect(specMatches(ANY, ip('8.8.8.8'))).toBe(true)
    expect(specMatches(net('0.0.0.0', '255.255.255.255'), ip('8.8.8.8'))).toBe(true)
  })
  it('supports discontiguous wildcards', () => {
    // Odd third octet: 10.1.1.x, 10.1.3.x, ... match; even ones do not.
    const odd = net('10.1.1.0', '0.0.254.255')
    expect(specMatches(odd, ip('10.1.3.9'))).toBe(true)
    expect(specMatches(odd, ip('10.1.4.9'))).toBe(false)
  })
  it('a wildcard of 0.0.0.0 is the same as host', () => {
    expect(specMatches(net('10.1.1.5', '0.0.0.0'), ip('10.1.1.5'))).toBe(true)
    expect(specMatches(net('10.1.1.5', '0.0.0.0'), ip('10.1.1.6'))).toBe(false)
  })
  it('shows how IOS normalizes the address', () => {
    expect(normalizedBase(net('10.1.1.5', '0.0.0.255'))).toBe('10.1.1.0')
    expect(normalizedBase(net('10.1.1.0', '0.0.0.255'))).toBeNull()
  })
})

describe('wildcard helper', () => {
  it('derives wildcards from prefixes and masks', () => {
    expect(wildcardFromPrefix(24)).toBe('0.0.0.255')
    expect(wildcardFromPrefix(30)).toBe('0.0.0.3')
    expect(wildcardFromPrefix(16)).toBe('0.0.255.255')
    expect(wildcardFromPrefix(32)).toBe('0.0.0.0')
    expect(wildcardFromPrefix(0)).toBe('255.255.255.255')
    expect(wildcardFromMask('255.255.255.240')).toBe('0.0.0.15')
    expect(wildcardFromMask('nope')).toBeNull()
    expect(maskFromPrefix(26)).toBe('255.255.255.192')
  })
  it('lists the range a contiguous wildcard covers', () => {
    expect(wildcardRange('10.1.2.0', '0.0.0.255')).toEqual({ contiguous: true, first: '10.1.2.0', last: '10.1.2.255', count: 256 })
    expect(wildcardRange('10.1.2.77', '0.0.0.3')).toMatchObject({ first: '10.1.2.76', last: '10.1.2.79', count: 4 })
    expect(wildcardRange('10.1.1.0', '0.0.254.255').contiguous).toBe(false)
  })
})

describe('ACL numbers and validation', () => {
  it('knows the numbered ranges', () => {
    expect(numberFits('standard', 1)).toBe(true)
    expect(numberFits('standard', 99)).toBe(true)
    expect(numberFits('standard', 100)).toBe(false)
    expect(numberFits('standard', 1300)).toBe(true)
    expect(numberFits('extended', 100)).toBe(true)
    expect(numberFits('extended', 199)).toBe(true)
    expect(numberFits('extended', 2000)).toBe(true)
    expect(numberFits('extended', 2700)).toBe(false)
    expect(numberFits('extended', '')).toBe(false)
  })
  it('catches bad numbers, names, addresses and ports', () => {
    expect(validateAcl(std([], '110'))).toHaveLength(1)
    expect(validateAcl({ kind: 'extended', naming: 'named', name: '9 BAD', rules: [] })).toHaveLength(1)
    expect(validateAcl(std([rule('deny', net('10.1.300.0', '0.0.0.255'))]))[0]).toMatch(/not a valid IPv4/)
    expect(validateAcl(ext([rule('permit', ANY, { protocol: 'tcp', port: '70000' })]))[0]).toMatch(/port/)
    expect(validateAcl(ext([rule('permit', ANY)]))).toEqual([])
  })
})

describe('IOS lines', () => {
  it('writes numbered standard and extended entries', () => {
    expect(ruleBody(rule('deny', net('10.1.2.0', '0.0.0.255')), 'standard')).toBe('deny 10.1.2.0 0.0.0.255')
    expect(ruleBody(rule('permit', net('10.1.1.0', '0.0.0.255'), { protocol: 'tcp', port: '80' }), 'extended')).toBe('permit tcp 10.1.1.0 0.0.0.255 any eq 80')
    expect(ruleBody(rule('permit', host('10.1.1.50'), { protocol: 'icmp', port: '80' }), 'extended')).toBe('permit icmp host 10.1.1.50 any')
    const lines = configLines(ext([rule('permit', net('10.1.1.0', '0.0.0.255'), { protocol: 'tcp', port: '80' })]), { router: 'R1', iface: 'Gi0/1', dir: 'in' })
    expect(lines.map((l) => l.text)).toEqual([
      'access-list 110 permit tcp 10.1.1.0 0.0.0.255 any eq 80',
      '! implicit, always last: deny ip any any',
      'interface GigabitEthernet0/1',
      ' ip access-group 110 in'
    ])
  })
  it('writes named ACLs as a block', () => {
    const acl = { kind: 'extended', naming: 'named', name: 'GUEST', rules: [rule('deny', ANY)] }
    expect(configLines(acl, { router: 'R2', iface: 'Gi0/0', dir: 'out' }).map((l) => l.text)).toEqual([
      'ip access-list extended GUEST',
      ' deny ip any any',
      ' ! implicit, always last: deny ip any any',
      'interface GigabitEthernet0/0',
      ' ip access-group GUEST out'
    ])
  })
})

describe('evaluation', () => {
  const acl = ext([
    rule('permit', net('10.1.2.0', '0.0.0.255'), { protocol: 'tcp', dst: host('10.2.2.10'), port: '80' }),
    rule('deny', net('10.1.2.0', '0.0.0.255'), { dst: net('10.2.2.0', '0.0.0.255') }),
    rule('permit', ANY)
  ])
  it('stops at the first match', () => {
    const r = evaluateAcl(acl, packet('10.1.2.15', '10.2.2.10', 'tcp', 80))
    expect(r.matchIndex).toBe(0)
    expect(r.action).toBe('permit')
    expect(r.steps).toHaveLength(1)
  })
  it('explains each line it skips', () => {
    const r = evaluateAcl(acl, packet('10.1.2.15', '10.2.2.10', 'udp', 53))
    expect(r.matchIndex).toBe(1)
    expect(r.steps[0].reason).toMatch(/UDP/)
    expect(r.action).toBe('deny')
  })
  it('ports only match tcp and udp with the same port', () => {
    const tcp80 = rule('permit', ANY, { protocol: 'tcp', port: '80' })
    expect(ruleCheck(tcp80, 'extended', packet('1.1.1.1', '2.2.2.2', 'tcp', 443)).match).toBe(false)
    expect(ruleCheck(tcp80, 'extended', packet('1.1.1.1', '2.2.2.2', 'tcp', 80)).match).toBe(true)
    expect(ruleCheck(tcp80, 'extended', packet('1.1.1.1', '2.2.2.2', 'udp', 80)).match).toBe(false)
    expect(ruleCheck(rule('permit', ANY), 'extended', packet('1.1.1.1', '2.2.2.2', 'icmp', null)).match).toBe(true)
  })
  it('a standard ACL looks only at the source', () => {
    const s = std([rule('deny', net('10.1.2.0', '0.0.0.255'))])
    expect(evaluateAcl(s, packet('10.1.2.15', '10.1.1.20', 'icmp', null)).action).toBe('deny')
    expect(evaluateAcl(s, packet('10.1.1.20', '10.1.2.15', 'icmp', null)).matchIndex).toBe(-1)
  })
  it('falls into the implicit deny when nothing matches', () => {
    const r = evaluateAcl(std([rule('permit', host('10.1.1.50'))]), packet('10.1.1.20', '10.2.2.10'))
    expect(r.matchIndex).toBe(-1)
    expect(r.action).toBe('deny')
    expect(evaluateAcl(std([]), packet('10.1.1.20', '10.2.2.10')).action).toBe('deny')
  })
})

describe('paths and placement', () => {
  it('lists interface crossings in order', () => {
    expect(packetPath('10.1.2.15', '10.2.2.10').map((p) => `${p.router} ${p.iface} ${p.dir}`)).toEqual(['R1 Gi0/1 in', 'R1 Gi0/2 out', 'R2 Gi0/2 in', 'R2 Gi0/0 out'])
    expect(packetPath('10.1.2.15', '10.1.1.20').map((p) => `${p.router} ${p.iface} ${p.dir}`)).toEqual(['R1 Gi0/1 in', 'R1 Gi0/0 out'])
    expect(packetPath('10.1.1.20', '10.1.1.50')).toEqual([])
  })
  it('only filters packets that cross the applied interface in that direction', () => {
    const deny = std([rule('deny', ANY)])
    const p = packet('10.1.2.15', '10.2.2.10')
    expect(runPacket(deny, { router: 'R2', iface: 'Gi0/0', dir: 'out' }, p).delivered).toBe(false)
    expect(runPacket(deny, { router: 'R2', iface: 'Gi0/0', dir: 'in' }, p).delivered).toBe(true)
    expect(runPacket(deny, { router: 'R2', iface: 'Gi0/0', dir: 'in' }, p).evaluation).toBeNull()
    expect(runPacket(deny, { router: 'R1', iface: 'Gi0/1', dir: 'in' }, p).filterAt).toBe(0)
  })
})

describe('policy challenges', () => {
  const [guestServers, guestWeb, sshAdmin] = POLICIES

  it('the standard draft fails for the classic reasons', () => {
    const g = gradePolicy(guestServers.draft.acl, guestServers.draft.applied, guestServers)
    expect(g.pass).toBe(false)
    expect(g.failures.map((f) => f.label)).toContain('Guest PC to Sales PC, Ping (ICMP)')
    expect(g.hints.join(' ')).toMatch(/close to the destination/)
  })
  it('moving the standard ACL without a permit hits the implicit deny', () => {
    const g = gradePolicy(guestServers.draft.acl, { router: 'R2', iface: 'Gi0/0', dir: 'out' }, guestServers)
    expect(g.pass).toBe(false)
    expect(g.hints.join(' ')).toMatch(/forget a permit/)
  })
  it('the fixed standard ACL near the destination passes', () => {
    const acl = cloneAcl(guestServers.draft.acl)
    acl.rules.push(rule('permit', ANY))
    const g = gradePolicy(acl, { router: 'R2', iface: 'Gi0/0', dir: 'out' }, guestServers)
    expect(g.pass).toBe(true)
    expect(g.placementTip).toBe('')
  })
  it('requires a standard ACL for the standard challenge', () => {
    const acl = ext([rule('deny', net('10.1.2.0', '0.0.0.255'), { dst: net('10.2.2.0', '0.0.0.255') }), rule('permit', ANY)])
    const g = gradePolicy(acl, { router: 'R1', iface: 'Gi0/1', dir: 'in' }, guestServers)
    expect(g.failures).toHaveLength(0)
    expect(g.pass).toBe(false)
  })
  it('the extended draft fails because of line order, and passes once reordered', () => {
    const draft = gradePolicy(guestWeb.draft.acl, guestWeb.draft.applied, guestWeb)
    expect(draft.pass).toBe(false)
    expect(draft.hints.join(' ')).toMatch(/Order matters/)
    const acl = cloneAcl(guestWeb.draft.acl)
    acl.rules = [acl.rules[1], acl.rules[2], acl.rules[0], acl.rules[3]]
    expect(gradePolicy(acl, guestWeb.draft.applied, guestWeb).pass).toBe(true)
  })
  it('gives a placement tip when an extended ACL works far from the source', () => {
    const acl = cloneAcl(guestWeb.draft.acl)
    acl.rules = [acl.rules[1], acl.rules[2], acl.rules[0], acl.rules[3]]
    const g = gradePolicy(acl, { router: 'R2', iface: 'Gi0/0', dir: 'out' }, guestWeb)
    expect(g.pass).toBe(true)
    expect(g.placementTip).toMatch(/close to the source/)
  })
  it('the SSH policy passes with the textbook answer', () => {
    const acl = {
      kind: 'extended',
      naming: 'named',
      name: 'SSH-ADMIN',
      rules: [
        rule('permit', host('10.1.1.50'), { protocol: 'tcp', dst: net('10.2.2.0', '0.0.0.255'), port: '22' }),
        rule('deny', ANY, { protocol: 'tcp', dst: net('10.2.2.0', '0.0.0.255'), port: '22' }),
        rule('permit', ANY)
      ]
    }
    expect(gradePolicy(acl, sshAdmin.draft.applied, sshAdmin).pass).toBe(true)
    expect(gradePolicy(sshAdmin.draft.acl, sshAdmin.draft.applied, sshAdmin).pass).toBe(false)
  })
  it('warns when the ACL is on an interface no test packet crosses', () => {
    const acl = cloneAcl(guestServers.draft.acl)
    const g = gradePolicy(acl, { router: 'R2', iface: 'Gi0/0', dir: 'in' }, guestServers)
    expect(g.hints.join(' ')).toMatch(/never ran/)
  })
  it('policy text has no em dashes', () => {
    for (const p of POLICIES) expect(`${p.text} ${p.draftNote} ${p.bestText}`).not.toMatch(/\u2014/)
  })
})
