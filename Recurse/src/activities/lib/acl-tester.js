// ACL tester: build a standard or extended IPv4 ACL, apply it to an interface and a
// direction, and run packets through it. Lines are checked top-down, the first match
// decides, and every ACL ends with an implicit deny.
import { intToIp, parseIp, prefixToMask } from './route-lookup'

export { intToIp, parseIp }

export const PROTOCOLS = ['ip', 'tcp', 'udp', 'icmp']

// ---- Address specs ----------------------------------------------------------------
// { kind: 'any' } | { kind: 'host', ip } | { kind: 'wild', ip, wildcard }

/** True when the address matches the spec. Wildcard bits of 0 must match, 1 means ignore. */
export function specMatches(spec, ip) {
  if (!spec || spec.kind === 'any') return true
  const base = parseIp(spec.ip)
  if (base === null) return false
  if (spec.kind === 'host') return base === ip
  const wc = parseIp(spec.wildcard)
  if (wc === null) return false
  const care = ~wc >>> 0
  return ((base ^ ip) & care) >>> 0 === 0
}

export function specText(spec) {
  if (!spec || spec.kind === 'any') return 'any'
  if (spec.kind === 'host') return `host ${spec.ip || '?'}`
  return `${spec.ip || '?'} ${spec.wildcard || '?'}`
}

/** Problems with one address spec, as short sentences (empty when fine). */
export function specProblems(spec, label = 'Address') {
  if (!spec || spec.kind === 'any') return []
  const out = []
  const base = parseIp(spec.ip)
  if (base === null) out.push(`${label}: "${spec.ip || ''}" is not a valid IPv4 address.`)
  if (spec.kind === 'wild') {
    const wc = parseIp(spec.wildcard)
    if (wc === null) out.push(`${label}: wildcard "${spec.wildcard || ''}" is not valid. Try 0.0.0.255 for a /24.`)
  }
  return out
}

/**
 * IOS stores ip AND NOT wildcard. Returns the normalized address when it differs
 * (for example 10.1.1.5 0.0.0.255 becomes 10.1.1.0 0.0.0.255), otherwise null.
 */
export function normalizedBase(spec) {
  if (!spec || spec.kind !== 'wild') return null
  const base = parseIp(spec.ip)
  const wc = parseIp(spec.wildcard)
  if (base === null || wc === null) return null
  const norm = (base & ~wc) >>> 0
  return norm === base ? null : intToIp(norm)
}

// ---- Wildcard helper ---------------------------------------------------------------

export const wildcardFromPrefix = (prefix) => intToIp(~prefixToMask(prefix) >>> 0)
export const maskFromPrefix = (prefix) => intToIp(prefixToMask(prefix))

/** Wildcard from a dotted subnet mask (255.255.255.255 minus the mask), or null. */
export function wildcardFromMask(mask) {
  const m = parseIp(mask)
  if (m === null) return null
  return intToIp((0xffffffff - m) >>> 0)
}

/** First and last address a wildcard matches, when the wildcard is contiguous. */
export function wildcardRange(ip, wildcard) {
  const base = parseIp(ip)
  const wc = parseIp(wildcard)
  if (base === null || wc === null) return null
  const contiguous = ((wc + 1) & wc) === 0
  if (!contiguous) return { contiguous: false, count: null }
  const first = (base & ~wc) >>> 0
  const last = (first | wc) >>> 0
  return { contiguous: true, first: intToIp(first), last: intToIp(last), count: wc + 1 }
}

// ---- ACLs ----------------------------------------------------------------------------

export const NUMBER_RANGES = {
  standard: [[1, 99], [1300, 1999]],
  extended: [[100, 199], [2000, 2699]]
}

export function numberFits(kind, value) {
  const n = Number(value)
  if (!Number.isInteger(n) || String(value).trim() === '') return false
  return NUMBER_RANGES[kind].some(([lo, hi]) => n >= lo && n <= hi)
}

const usesPort = (rule) => (rule.protocol === 'tcp' || rule.protocol === 'udp') && rule.port !== '' && rule.port != null

/** The text of one ACL entry after "permit"/"deny", the way IOS shows it. */
export function ruleBody(rule, kind) {
  if (kind === 'standard') return `${rule.action} ${specText(rule.src)}`
  const proto = rule.protocol || 'ip'
  const port = usesPort(rule) ? ` eq ${rule.port}` : ''
  return `${rule.action} ${proto} ${specText(rule.src)} ${specText(rule.dst)}${port}`
}

export const aclName = (acl) => (acl.naming === 'named' ? String(acl.name || '').trim() : String(acl.number ?? '').trim())

/** Every configuration error in the ACL, as sentences. */
export function validateAcl(acl) {
  const errors = []
  if (acl.naming === 'named') {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,30}$/.test(String(acl.name || ''))) errors.push('Give the ACL a name that starts with a letter, with no spaces (for example GUEST-FILTER).')
  } else if (!numberFits(acl.kind, acl.number)) {
    errors.push(acl.kind === 'standard' ? 'Standard ACL numbers are 1 to 99 or 1300 to 1999.' : 'Extended ACL numbers are 100 to 199 or 2000 to 2699.')
  }
  acl.rules.forEach((rule, i) => {
    const line = `Line ${i + 1}`
    errors.push(...specProblems(rule.src, `${line} source`))
    if (acl.kind === 'extended') {
      errors.push(...specProblems(rule.dst, `${line} destination`))
      if (usesPort(rule)) {
        const p = Number(rule.port)
        if (!Number.isInteger(p) || p < 0 || p > 65535) errors.push(`${line}: port must be a number from 0 to 65535.`)
      }
    }
  })
  return errors
}

/** IOS configuration lines for the ACL plus the interface it is applied to. */
export function configLines(acl, applied) {
  const name = aclName(acl) || '?'
  const lines = []
  if (acl.naming === 'named') {
    lines.push({ text: `ip access-list ${acl.kind} ${name}`, kind: 'head' })
    acl.rules.forEach((rule, i) => lines.push({ text: ` ${ruleBody(rule, acl.kind)}`, kind: 'rule', index: i }))
  } else {
    acl.rules.forEach((rule, i) => lines.push({ text: `access-list ${name} ${ruleBody(rule, acl.kind)}`, kind: 'rule', index: i }))
  }
  const indent = acl.naming === 'named' ? ' ' : ''
  lines.push({ text: `${indent}! implicit, always last: ${acl.kind === 'standard' ? 'deny any' : 'deny ip any any'}`, kind: 'implicit', index: -1 })
  if (applied) {
    lines.push({ text: `interface ${fullIface(applied.iface)}`, kind: 'iface' })
    lines.push({ text: ` ip access-group ${name} ${applied.dir}`, kind: 'iface' })
  }
  return lines
}

/** Check one rule against a packet. Returns { match, reason }. */
export function ruleCheck(rule, kind, packet) {
  const src = parseIp(packet.src)
  const dst = parseIp(packet.dst)
  if (kind === 'standard') {
    const ok = specMatches(rule.src, src)
    return { match: ok, reason: ok ? `source ${packet.src} matches ${specText(rule.src)}` : `source ${packet.src} is not ${specText(rule.src)}` }
  }
  const proto = rule.protocol || 'ip'
  if (proto !== 'ip' && proto !== packet.protocol) {
    return { match: false, reason: `the packet is ${packet.protocol.toUpperCase()}, this line only matches ${proto.toUpperCase()}` }
  }
  if (!specMatches(rule.src, src)) return { match: false, reason: `source ${packet.src} is not ${specText(rule.src)}` }
  if (!specMatches(rule.dst, dst)) return { match: false, reason: `destination ${packet.dst} is not ${specText(rule.dst)}` }
  if (usesPort(rule) && Number(packet.port) !== Number(rule.port)) {
    return { match: false, reason: `destination port ${packet.port ?? 'none'} is not ${rule.port}` }
  }
  return { match: true, reason: 'protocol, source, destination and port all match' }
}

/**
 * Run a packet through the ACL top-down. Returns the per-line checks up to and
 * including the first match, the index of the match (-1 for the implicit deny), and
 * the action taken.
 */
export function evaluateAcl(acl, packet) {
  const steps = []
  for (let i = 0; i < acl.rules.length; i++) {
    const check = ruleCheck(acl.rules[i], acl.kind, packet)
    steps.push({ index: i, ...check })
    if (check.match) return { steps, matchIndex: i, action: acl.rules[i].action }
  }
  return { steps, matchIndex: -1, action: 'deny' }
}

// ---- Topology ------------------------------------------------------------------------
// Sales 10.1.1.0/24 (R1 Gi0/0) and Guest 10.1.2.0/24 (R1 Gi0/1) on R1; R1 Gi0/2 to
// R2 Gi0/2 over 10.0.0.0/30; Servers 10.2.2.0/24 on R2 Gi0/0.

export const SUBNETS = [
  { id: 'sales', name: 'Sales LAN', net: '10.1.1.0', prefix: 24, router: 'R1', iface: 'Gi0/0' },
  { id: 'guest', name: 'Guest LAN', net: '10.1.2.0', prefix: 24, router: 'R1', iface: 'Gi0/1' },
  { id: 'servers', name: 'Servers LAN', net: '10.2.2.0', prefix: 24, router: 'R2', iface: 'Gi0/0' }
]

export const HOSTS = [
  { id: 'sales-pc', name: 'Sales PC', ip: '10.1.1.20', subnet: 'sales' },
  { id: 'admin-pc', name: 'Admin PC', ip: '10.1.1.50', subnet: 'sales' },
  { id: 'guest-pc', name: 'Guest PC', ip: '10.1.2.15', subnet: 'guest' },
  { id: 'web', name: 'Web server', ip: '10.2.2.10', subnet: 'servers' },
  { id: 'dns', name: 'DNS server', ip: '10.2.2.20', subnet: 'servers' }
]

export const SERVICES = [
  { id: 'http', label: 'HTTP (TCP 80)', protocol: 'tcp', port: 80 },
  { id: 'https', label: 'HTTPS (TCP 443)', protocol: 'tcp', port: 443 },
  { id: 'ssh', label: 'SSH (TCP 22)', protocol: 'tcp', port: 22 },
  { id: 'telnet', label: 'Telnet (TCP 23)', protocol: 'tcp', port: 23 },
  { id: 'dns', label: 'DNS (UDP 53)', protocol: 'udp', port: 53 },
  { id: 'ping', label: 'Ping (ICMP)', protocol: 'icmp', port: null }
]

export const INTERFACES = [
  { router: 'R1', iface: 'Gi0/0', faces: 'Sales LAN' },
  { router: 'R1', iface: 'Gi0/1', faces: 'Guest LAN' },
  { router: 'R1', iface: 'Gi0/2', faces: 'link to R2' },
  { router: 'R2', iface: 'Gi0/2', faces: 'link to R1' },
  { router: 'R2', iface: 'Gi0/0', faces: 'Servers LAN' }
]

export const fullIface = (short) => String(short).replace(/^Gi/, 'GigabitEthernet')
export const pointKey = (p) => `${p.router} ${p.iface} ${p.dir}`

export function subnetOf(ipText) {
  const ip = parseIp(ipText)
  if (ip === null) return null
  return SUBNETS.find((s) => ((ip & prefixToMask(s.prefix)) >>> 0) === parseIp(s.net)) || null
}

/** The interface crossings a packet makes from source to destination, in order. */
export function packetPath(srcIp, dstIp) {
  const a = subnetOf(srcIp)
  const b = subnetOf(dstIp)
  if (!a || !b || a.id === b.id) return []
  if (a.router === b.router) {
    return [
      { router: a.router, iface: a.iface, dir: 'in' },
      { router: b.router, iface: b.iface, dir: 'out' }
    ]
  }
  return [
    { router: a.router, iface: a.iface, dir: 'in' },
    { router: a.router, iface: 'Gi0/2', dir: 'out' },
    { router: b.router, iface: 'Gi0/2', dir: 'in' },
    { router: b.router, iface: b.iface, dir: 'out' }
  ]
}

/**
 * Send a packet across the topology with the ACL applied at `applied` ({router, iface, dir}).
 * Returns { path, filterAt (index into path or -1), evaluation (or null), delivered }.
 */
export function runPacket(acl, applied, packet) {
  const path = packetPath(packet.src, packet.dst)
  const filterAt = applied ? path.findIndex((p) => pointKey(p) === pointKey(applied)) : -1
  if (filterAt === -1) return { path, filterAt, evaluation: null, delivered: path.length > 0 }
  const evaluation = evaluateAcl(acl, packet)
  return { path, filterAt, evaluation, delivered: evaluation.action === 'permit' }
}

// ---- Policy challenges ---------------------------------------------------------------

const pkt = (from, to, service) => {
  const s = SERVICES.find((x) => x.id === service)
  const a = HOSTS.find((h) => h.id === from)
  const b = HOSTS.find((h) => h.id === to)
  return { src: a.ip, dst: b.ip, protocol: s.protocol, port: s.port, label: `${a.name} to ${b.name}, ${s.label}` }
}
const test = (from, to, service, expect) => ({ packet: pkt(from, to, service), expect })

const rule = (action, src, extra = {}) => ({ action, protocol: 'ip', src, dst: { kind: 'any' }, port: '', ...extra })
const net = (ip, wildcard) => ({ kind: 'wild', ip, wildcard })
const host = (ip) => ({ kind: 'host', ip })
const ANY = { kind: 'any' }

export const POLICIES = [
  {
    id: 'guest-servers',
    title: 'Keep guests off the servers',
    kind: 'standard',
    text: 'Use a standard ACL. Block the Guest LAN (10.1.2.0/24) from reaching the Servers LAN (10.2.2.0/24). Guests must still reach Sales, and Sales must still reach the servers.',
    draftNote: 'A coworker drafted this and applied it on R1. Send a few packets, see what it really does, then fix it.',
    best: [{ router: 'R2', iface: 'Gi0/0', dir: 'out' }],
    bestText: 'R2 Gi0/0 outbound, right in front of the servers',
    draft: {
      acl: { kind: 'standard', naming: 'numbered', number: '10', name: '', rules: [rule('deny', net('10.1.2.0', '0.0.0.255'))] },
      applied: { router: 'R1', iface: 'Gi0/1', dir: 'in' }
    },
    tests: [
      test('guest-pc', 'web', 'http', 'deny'),
      test('guest-pc', 'dns', 'dns', 'deny'),
      test('guest-pc', 'sales-pc', 'ping', 'permit'),
      test('sales-pc', 'web', 'http', 'permit'),
      test('admin-pc', 'dns', 'dns', 'permit'),
      test('sales-pc', 'guest-pc', 'ping', 'permit')
    ]
  },
  {
    id: 'guest-web-only',
    title: 'Guests get the web, nothing else',
    kind: 'extended',
    text: 'Guests (10.1.2.0/24) may reach the web server 10.2.2.10 on HTTP (TCP 80) and HTTPS (TCP 443) only. Block every other Guest packet to the Servers LAN (10.2.2.0/24). Leave all other traffic alone.',
    draftNote: 'This draft has every line it needs, but guests cannot browse. Test it and find out why.',
    best: [{ router: 'R1', iface: 'Gi0/1', dir: 'in' }],
    bestText: 'R1 Gi0/1 inbound, where guest traffic enters the network',
    draft: {
      acl: {
        kind: 'extended',
        naming: 'numbered',
        number: '110',
        name: '',
        rules: [
          rule('deny', net('10.1.2.0', '0.0.0.255'), { dst: net('10.2.2.0', '0.0.0.255') }),
          rule('permit', net('10.1.2.0', '0.0.0.255'), { protocol: 'tcp', dst: host('10.2.2.10'), port: '80' }),
          rule('permit', net('10.1.2.0', '0.0.0.255'), { protocol: 'tcp', dst: host('10.2.2.10'), port: '443' }),
          rule('permit', ANY)
        ]
      },
      applied: { router: 'R1', iface: 'Gi0/1', dir: 'in' }
    },
    tests: [
      test('guest-pc', 'web', 'http', 'permit'),
      test('guest-pc', 'web', 'https', 'permit'),
      test('guest-pc', 'web', 'ssh', 'deny'),
      test('guest-pc', 'web', 'ping', 'deny'),
      test('guest-pc', 'dns', 'dns', 'deny'),
      test('guest-pc', 'sales-pc', 'ping', 'permit'),
      test('sales-pc', 'web', 'ssh', 'permit'),
      test('sales-pc', 'dns', 'dns', 'permit')
    ]
  },
  {
    id: 'ssh-admin',
    title: 'Only the admin may SSH',
    kind: 'extended',
    text: 'Only the Admin PC (10.1.1.50) may open SSH (TCP 22) to the servers (10.2.2.0/24). Block SSH to the servers from everyone else. Everything else must keep working.',
    draftNote: 'You start from an empty named ACL. Add the lines yourself.',
    best: [{ router: 'R1', iface: 'Gi0/2', dir: 'out' }],
    bestText: 'R1 Gi0/2 outbound, the closest single spot to both sources',
    draft: {
      acl: { kind: 'extended', naming: 'named', number: '', name: 'SSH-ADMIN', rules: [] },
      applied: { router: 'R1', iface: 'Gi0/2', dir: 'out' }
    },
    tests: [
      test('admin-pc', 'web', 'ssh', 'permit'),
      test('admin-pc', 'dns', 'ssh', 'permit'),
      test('sales-pc', 'web', 'ssh', 'deny'),
      test('guest-pc', 'dns', 'ssh', 'deny'),
      test('guest-pc', 'web', 'http', 'permit'),
      test('sales-pc', 'dns', 'dns', 'permit'),
      test('sales-pc', 'web', 'https', 'permit'),
      test('admin-pc', 'web', 'ping', 'permit')
    ]
  }
]

/**
 * Grade an ACL against a policy's hidden tests. Returns { pass, passed, total,
 * failures: [{ label, expect, got }], hints: [], placementTip }.
 */
export function gradePolicy(acl, applied, policy) {
  const hints = []
  const errors = validateAcl(acl)
  if (errors.length) return { pass: false, passed: 0, total: policy.tests.length, failures: [], hints: errors, placementTip: '' }
  if (policy.kind && acl.kind !== policy.kind) {
    hints.push(`This challenge asks for ${policy.kind === 'standard' ? 'a standard' : 'an extended'} ACL.`)
  }
  const results = policy.tests.map((t) => {
    const run = runPacket(acl, applied, t.packet)
    const got = run.delivered ? 'permit' : 'deny'
    return { label: t.packet.label, expect: t.expect, got, run }
  })
  const failures = results.filter((r) => r.got !== r.expect)
  const passed = results.length - failures.length
  if (failures.some((f) => f.got === 'deny' && f.run.evaluation?.matchIndex === -1)) {
    hints.push('Some packets matched no line and fell into the implicit deny. Did you forget a permit at the end?')
  }
  if (results.every((r) => r.run.filterAt === -1)) {
    hints.push(`None of the test packets crossed ${applied.router} ${applied.iface} ${applied.dir}bound, so the ACL never ran. In means entering the router on that interface, out means leaving it.`)
  }
  if (failures.some((f) => f.got === 'deny' && f.run.evaluation?.matchIndex >= 0 && acl.rules[f.run.evaluation.matchIndex].action === 'deny')) {
    const early = acl.rules.findIndex((r) => r.action === 'deny')
    const laterPermit = acl.rules.findIndex((r, i) => i > early && r.action === 'permit')
    if (early >= 0 && laterPermit > early) hints.push('A broad deny sits above a permit that should have matched first. Order matters: the first match wins, so put specific lines on top.')
  }
  const atBest = policy.best.some((b) => pointKey(b) === pointKey(applied))
  if (policy.kind === 'standard' && failures.length && !atBest) {
    hints.push('A standard ACL sees only the source address. Near the source it blocks that source from everything, so place it close to the destination.')
  }
  const pass = failures.length === 0 && !(policy.kind && acl.kind !== policy.kind)
  let placementTip = ''
  if (pass && !atBest) {
    placementTip =
      policy.kind === 'standard'
        ? `It works. Cisco's guideline still puts standard ACLs close to the destination: ${policy.bestText}.`
        : `It works. Cisco's guideline puts extended ACLs close to the source so unwanted packets die before crossing the network: ${policy.bestText}.`
  }
  return { pass, passed, total: results.length, failures, hints, placementTip }
}

export function blankRule() {
  return { action: 'permit', protocol: 'ip', src: { kind: 'any' }, dst: { kind: 'any' }, port: '' }
}

export function cloneAcl(acl) {
  return JSON.parse(JSON.stringify(acl))
}
