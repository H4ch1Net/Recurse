// Device configuration model for the IOS simulator: factory defaults, interface
// creation, password encoding, ACL entries and the running-config renderer.
// Everything in a device object is plain JSON so it can be saved to "NVRAM" by cloning.

import {
  IF_TYPES,
  applyWildcard,
  compareIf,
  formatVlanList,
  ifType,
  isPhysical,
  isSubif,
  macAdd,
  parentIf,
  parseVlanList,
  wildMatch
} from './addr.js'

/** @typedef {'router'|'switch'} DeviceKind */

export const MODELS = {
  router: {
    family: 'C2900',
    model: 'CISCO2911/K9',
    platform: 'CISCO2911',
    image: 'C2900-UNIVERSALK9-M',
    file: 'flash0:c2900-universalk9-mz.SPA.157-3.M8.bin',
    version: '15.7(3)M8',
    shortVersion: '15.7',
    baseMac: '0c8f.1a2b.3c00',
    ports: ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2']
  },
  switch: {
    family: 'C2960',
    model: 'WS-C2960G-24TC-L',
    platform: 'WS-C2960G-24TC-L',
    image: 'C2960-LANBASEK9-M',
    file: 'flash:c2960-lanbasek9-mz.150-2.SE11.bin',
    version: '15.0(2)SE11',
    shortVersion: '15.0',
    baseMac: '0019.e86a.6f80',
    ports: Array.from({ length: 24 }, (_, i) => `GigabitEthernet0/${i + 1}`)
  },
  // Multilayer switch used by the Layer 3 switching labs (same port layout as the 2960).
  l3switch: {
    family: 'C3560',
    model: 'WS-C3560G-24TS',
    platform: 'WS-C3560G-24TS',
    image: 'C3560-IPSERVICESK9-M',
    file: 'flash:c3560-ipservicesk9-mz.150-2.SE11.bin',
    version: '15.0(2)SE11',
    shortVersion: '15.0',
    baseMac: '0022.0dc4.1a00',
    ports: Array.from({ length: 24 }, (_, i) => `GigabitEthernet0/${i + 1}`)
  }
}

/** Interface types each device kind accepts after `interface`. */
export function ifTypesFor(kind) {
  return IF_TYPES.filter((t) => kind === 'switch' || t.type !== 'Vlan')
}

function lineDefaults(kind) {
  return {
    password: null,
    login: kind === 'vty' ? 'line' : 'none',
    transport: null,
    execTimeout: null,
    loggingSync: false,
    accessClass: null,
    privilege: null
  }
}

/** A factory-fresh device. opts: { hostname, baseMac, model: 'l3switch' for a multilayer switch } */
export function makeDevice(kind = 'router', opts = {}) {
  const sw = kind === 'switch'
  const modelKey = sw && opts.model === 'l3switch' ? 'l3switch' : sw ? 'switch' : 'router'
  const meta = MODELS[modelKey]
  const dev = {
    kind: sw ? 'switch' : 'router',
    model: modelKey,
    hostname: opts.hostname || (sw ? 'Switch' : 'Router'),
    baseMac: opts.baseMac || meta.baseMac,
    interfaces: {},
    vlans: sw ? { 1: 'default' } : {},
    vtpMode: 'server',
    vtpDomain: '',
    routes: [],
    ipv6Routes: [],
    ospf: null,
    ipRouting: !sw,
    ipv6Routing: false,
    enableSecret: null,
    enablePassword: null,
    users: [],
    servicePasswordEncryption: false,
    banner: null,
    domainName: null,
    domainLookup: true,
    nameServers: [],
    rsaModulus: null,
    sshVersion: null,
    defaultGateway: null,
    stp: { mode: 'pvst', priority: {}, portfastDefault: false, bpduguardDefault: false },
    dhcpPools: [],
    dhcpExcluded: [],
    nat: { pools: [], rules: [], statics: [] },
    ntp: { servers: [], master: null },
    logging: { hosts: [], trap: null, console: true },
    snmp: { communities: [], hosts: [], traps: false, location: null, contact: null },
    acls: {},
    dhcpSnooping: { enabled: false, vlans: [] },
    arpInspection: { vlans: [] },
    cdp: true,
    lldp: false,
    lines: { con: lineDefaults('con'), vty: lineDefaults('vty'), vty2: lineDefaults('vty'), ...(sw ? {} : { aux: lineDefaults('aux') }) },
    clockTz: null,
    errdisable: { causes: [], interval: null },
    passwordMinLength: null,
    httpServer: false,
    httpsServer: false
  }
  meta.ports.forEach((name) => ensureIf(dev, name))
  if (sw) ensureIf(dev, 'Vlan1').shutdown = true
  return dev
}

export function modelOf(dev) {
  return MODELS[dev.model] ?? MODELS[dev.kind]
}

/** True when a physical port name is part of this device's hardware. */
export function hasPort(dev, name) {
  return modelOf(dev).ports.includes(name)
}

/** MAC address of an interface (deterministic per device). */
export function ifMac(dev, name) {
  const ports = modelOf(dev).ports
  const p = parentIf(name)
  const idx = ports.indexOf(p)
  if (idx >= 0) return macAdd(dev.baseMac, dev.kind === 'switch' ? idx + 1 : idx)
  if (/^Vlan/.test(name)) return macAdd(dev.baseMac, 0x40)
  if (/^Port-channel/.test(name)) return macAdd(dev.baseMac, 0x30 + Number(name.replace(/\D/g, '')))
  return dev.baseMac
}

/** Create the interface if needed and return it. */
export function ensureIf(dev, name) {
  if (dev.interfaces[name]) return dev.interfaces[name]
  const phys = isPhysical(name)
  const type = ifType(name)
  const i = {
    name,
    shutdown: dev.kind === 'router' && phys,
    description: null,
    ip: null,
    mask: null,
    secondary: [],
    dhcpClient: false,
    ipv6: [],
    ipv6Enable: false,
    linkLocal: null,
    duplex: 'auto',
    speed: 'auto',
    bandwidth: null,
    natRole: null,
    helpers: [],
    hsrpVersion: 1,
    hsrp: [],
    aclIn: null,
    aclOut: null,
    ospf: {},
    cdp: true,
    lldpTx: true,
    lldpRx: true
  }
  if (isSubif(name)) {
    i.encap = null
    i.encapNative = false
  }
  if (dev.kind === 'switch' && (phys || type === 'Port-channel')) {
    Object.assign(i, {
      switchport: true,
      mode: 'dynamic auto',
      accessVlan: 1,
      voiceVlan: null,
      nativeVlan: 1,
      allowed: null,
      trunkEncap: null,
      nonegotiate: false,
      portSecurity: null,
      channelGroup: null,
      portfast: null,
      bpduguard: null,
      bpdufilter: null,
      guard: null,
      stpCost: null,
      stpPrio: null,
      dhcpSnoopTrust: false,
      dhcpSnoopRate: null,
      arpTrust: false
    })
  }
  dev.interfaces[name] = i
  return i
}

export function newPortSecurity() {
  return { enabled: false, max: 1, violation: 'shutdown', sticky: false, macs: [], stickyMacs: [] }
}

export function cloneConfig(dev) {
  return JSON.parse(JSON.stringify(dev))
}

// ---------- passwords ----------

const XLAT = 'dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87'

/** Cisco type 7 (reversible Vigenere) encoding, with a seed derived from the text. */
export function type7(text) {
  const seed = [...text].reduce((a, c) => a + c.charCodeAt(0), 0) % 16
  let out = String(seed).padStart(2, '0')
  for (let i = 0; i < text.length; i++) {
    out += (text.charCodeAt(i) ^ XLAT.charCodeAt((seed + i) % XLAT.length)).toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

const B64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function fnv(text, salt) {
  let h = 2166136261 ^ salt
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h
}

/** A stand-in for an MD5 type 5 hash: same shape, deterministic, one way enough for a simulator. */
export function type5(text) {
  let out = ''
  let h = fnv(text, 7)
  for (let i = 0; i < 26; i++) {
    if (i % 5 === 0) h = fnv(text + i, h)
    out += B64[h % 64]
    h = Math.floor(h / 64)
  }
  return `$1$${out.slice(0, 4)}$${out.slice(4)}`
}

/** Text after the keyword in show running-config, for a stored password. */
export function pwText(pw) {
  if (!pw) return ''
  if (pw.type === 5) return `5 ${type5(pw.text)}`
  if (pw.type === 7) return `7 ${type7(pw.text)}`
  return pw.text
}

// ---------- ACLs ----------

export const TCP_PORTS = { bgp: 179, chargen: 19, cmd: 514, daytime: 13, discard: 9, domain: 53, echo: 7, exec: 512, finger: 79, ftp: 21, 'ftp-data': 20, gopher: 70, hostname: 101, ident: 113, irc: 194, klogin: 543, kshell: 544, login: 513, lpd: 515, nntp: 119, pop2: 109, pop3: 110, smtp: 25, sunrpc: 111, tacacs: 49, talk: 517, telnet: 23, time: 37, uucp: 540, whois: 43, www: 80 }
export const UDP_PORTS = { biff: 512, bootpc: 68, bootps: 67, discard: 9, dnsix: 195, domain: 53, echo: 7, isakmp: 500, 'mobile-ip': 434, nameserver: 42, 'netbios-dgm': 138, 'netbios-ns': 137, 'netbios-ss': 139, ntp: 123, rip: 520, snmp: 161, snmptrap: 162, sunrpc: 111, syslog: 514, tacacs: 49, talk: 517, tftp: 69, time: 37, who: 513, xdmcp: 177 }

export function aclTypeForNumber(n) {
  const num = Number(n)
  if ((num >= 1 && num <= 99) || (num >= 1300 && num <= 1999)) return 'standard'
  if ((num >= 100 && num <= 199) || (num >= 2000 && num <= 2699)) return 'extended'
  return null
}

export function ensureAcl(dev, key, type, named) {
  if (!dev.acls[key]) dev.acls[key] = { key, type, named: Boolean(named), rules: [] }
  return dev.acls[key]
}

function portNumber(word, proto) {
  if (/^\d+$/.test(word)) return Number(word)
  const table = proto === 'udp' ? UDP_PORTS : TCP_PORTS
  return table[word] ?? null
}

function portName(n, proto) {
  const table = proto === 'udp' ? UDP_PORTS : TCP_PORTS
  const hit = Object.entries(table).find(([, v]) => v === n)
  return hit ? hit[0] : String(n)
}

const ANY = { addr: '0.0.0.0', wild: '255.255.255.255' }

function readAddr(words, i) {
  const w = words[i]
  if (w === 'any') return [{ ...ANY }, i + 1]
  if (w === 'host') return [{ addr: words[i + 1], wild: '0.0.0.0' }, i + 2]
  const wild = words[i + 1] && /^\d+\.\d+\.\d+\.\d+$/.test(words[i + 1]) ? words[i + 1] : '0.0.0.0'
  const step = words[i + 1] && /^\d+\.\d+\.\d+\.\d+$/.test(words[i + 1]) ? 2 : 1
  return [{ addr: applyWildcard(w, wild), wild }, i + step]
}

function readPorts(words, i, proto) {
  const op = words[i]
  if (!['eq', 'gt', 'lt', 'neq', 'range'].includes(op)) return [null, i]
  if (op === 'range') return [{ op, ports: [portNumber(words[i + 1], proto), portNumber(words[i + 2], proto)] }, i + 3]
  return [{ op, ports: [portNumber(words[i + 1], proto)] }, i + 2]
}

/**
 * Build an ACL rule from full words (keywords expanded), starting at the action.
 * Standard: permit|deny (any | host A | A [W]) [log]
 * Extended: permit|deny PROTO SRC [ports] DST [ports] [established] [log]
 */
export function parseAclRule(words, type) {
  const action = words[0]
  if (type === 'standard') {
    const [src, next] = readAddr(words, 1)
    return { action, src, log: words[next] === 'log' }
  }
  const proto = words[1]
  let i = 2
  const [src, a] = readAddr(words, i)
  i = a
  const [srcOp, b] = readPorts(words, i, proto)
  i = b
  const [dst, c] = readAddr(words, i)
  i = c
  const [dstOp, d] = readPorts(words, i, proto)
  i = d
  const rest = words.slice(i)
  return { action, proto, src, srcOp, dst, dstOp, established: rest.includes('established'), log: rest.includes('log') }
}

function addrText(a, std, style) {
  if (a.wild === '255.255.255.255') return 'any'
  if (a.wild === '0.0.0.0') return std ? a.addr : `host ${a.addr}`
  if (std && style === 'show') return `${a.addr}, wildcard bits ${a.wild}`
  return `${a.addr} ${a.wild}`
}

function opText(op, proto) {
  if (!op) return ''
  return ` ${op.op} ${op.ports.map((p) => portName(p, proto)).join(' ')}`
}

/** Text of one ACL entry, after the sequence number. style: 'show' | 'run' */
export function aclRuleText(rule, type, style = 'show') {
  if (rule.remark != null) return `remark ${rule.remark}`
  if (type === 'standard') {
    const pad = rule.action === 'deny' ? 'deny   ' : 'permit '
    return `${pad}${addrText(rule.src, true, style)}${rule.log ? ' log' : ''}`
  }
  let t = `${rule.action} ${rule.proto} ${addrText(rule.src, false)}${opText(rule.srcOp, rule.proto)} ${addrText(rule.dst, false)}${opText(rule.dstOp, rule.proto)}`
  if (rule.established) t += ' established'
  if (rule.log) t += ' log'
  return t
}

function portMatch(op, port) {
  if (!op) return true
  if (port == null) return false
  const [a, b] = op.ports
  if (op.op === 'eq') return port === a
  if (op.op === 'neq') return port !== a
  if (op.op === 'gt') return port > a
  if (op.op === 'lt') return port < a
  return port >= a && port <= b
}

/**
 * Evaluate a packet against an ACL, top down with the implicit deny at the end.
 * pkt: { src, dst?, proto?, sport?, dport?, established? }
 * Returns { action, seq, implicit }.
 */
export function aclEval(acl, pkt) {
  if (!acl) return { action: 'permit', seq: null, implicit: false, missing: true }
  for (const r of acl.rules) {
    if (r.remark != null) continue
    if (!wildMatch(pkt.src, r.src.addr, r.src.wild)) continue
    if (acl.type === 'extended') {
      const proto = pkt.proto ?? 'ip'
      if (r.proto !== 'ip' && r.proto !== proto) continue
      if (!wildMatch(pkt.dst ?? '0.0.0.0', r.dst.addr, r.dst.wild)) continue
      if (!portMatch(r.srcOp, pkt.sport)) continue
      if (!portMatch(r.dstOp, pkt.dport)) continue
      if (r.established && !pkt.established) continue
    }
    return { action: r.action, seq: r.seq, implicit: false }
  }
  return { action: 'deny', seq: null, implicit: true }
}

/** Add a rule with the next free sequence number (or the given one), keeping order. */
export function addAclRule(acl, rule, seq) {
  if (rule.remark != null) {
    acl.rules.push({ ...rule, seq: null })
    return true
  }
  const used = acl.rules.filter((r) => r.seq != null).map((r) => r.seq)
  if (seq != null && used.includes(seq)) return false
  const s = seq ?? (used.length ? Math.max(...used) + 10 : 10)
  const entry = { ...rule, seq: s }
  const idx = acl.rules.findIndex((r) => r.seq != null && r.seq > s)
  if (idx < 0) acl.rules.push(entry)
  else acl.rules.splice(idx, 0, entry)
  return true
}

// ---------- running-config ----------

const RUN_RANK = { Loopback: 0, 'Port-channel': 1, GigabitEthernet: 2, FastEthernet: 2, Vlan: 9 }

export function sortedIfNames(dev, rank = RUN_RANK) {
  return Object.keys(dev.interfaces).sort((a, b) => compareIf(a, b, rank))
}

function interfaceBlock(dev, i) {
  const L = [`interface ${i.name}`]
  const sw = i.switchport === true
  const routedPort = dev.kind === 'switch' && i.switchport === false
  if (i.description) L.push(` description ${i.description}`)
  if (i.encap != null) L.push(` encapsulation dot1Q ${i.encap}${i.encapNative ? ' native' : ''}`)
  if (routedPort) L.push(' no switchport')
  if (sw) {
    if (i.accessVlan !== 1) L.push(` switchport access vlan ${i.accessVlan}`)
    if (i.trunkEncap) L.push(` switchport trunk encapsulation ${i.trunkEncap}`)
    if (i.nativeVlan !== 1) L.push(` switchport trunk native vlan ${i.nativeVlan}`)
    if (i.allowed != null) L.push(` switchport trunk allowed vlan ${i.allowed === '' ? 'none' : i.allowed}`)
    if (i.mode !== 'dynamic auto') L.push(` switchport mode ${i.mode}`)
    if (i.nonegotiate) L.push(' switchport nonegotiate')
    if (i.voiceVlan != null) L.push(` switchport voice vlan ${i.voiceVlan}`)
    const ps = i.portSecurity
    if (ps) {
      if (ps.max !== 1) L.push(` switchport port-security maximum ${ps.max}`)
      if (ps.enabled) L.push(' switchport port-security')
      if (ps.violation !== 'shutdown') L.push(` switchport port-security violation ${ps.violation}`)
      if (ps.sticky) L.push(' switchport port-security mac-address sticky')
      for (const m of ps.stickyMacs) L.push(` switchport port-security mac-address sticky ${m}`)
      for (const m of ps.macs) L.push(` switchport port-security mac-address ${m}`)
    }
  } else if (dev.kind === 'router' || routedPort || /^(Vlan|Loopback)/.test(i.name) || isSubif(i.name)) {
    if (i.dhcpClient) L.push(' ip address dhcp')
    else if (i.ip) {
      L.push(` ip address ${i.ip} ${i.mask}`)
      for (const s of i.secondary) L.push(` ip address ${s.ip} ${s.mask} secondary`)
    } else L.push(' no ip address')
  }
  if (!sw) {
    for (const h of i.helpers) L.push(` ip helper-address ${h}`)
    if (i.aclIn) L.push(` ip access-group ${i.aclIn} in`)
    if (i.aclOut) L.push(` ip access-group ${i.aclOut} out`)
    if (i.natRole) L.push(` ip nat ${i.natRole}`)
    const o = i.ospf || {}
    if (o.network) L.push(` ip ospf network ${o.network}`)
    if (o.hello != null) L.push(` ip ospf hello-interval ${o.hello}`)
    if (o.dead != null) L.push(` ip ospf dead-interval ${o.dead}`)
    if (o.priority != null) L.push(` ip ospf priority ${o.priority}`)
    if (o.process != null) L.push(` ip ospf ${o.process} area ${o.area}`)
    if (o.cost != null) L.push(` ip ospf cost ${o.cost}`)
    if (i.hsrp.length && i.hsrpVersion === 2) L.push(' standby version 2')
    for (const g of i.hsrp) {
      if (g.ip) L.push(` standby ${g.group} ip ${g.ip}`)
      if (g.priority != null) L.push(` standby ${g.group} priority ${g.priority}`)
      if (g.preempt) L.push(` standby ${g.group} preempt`)
    }
  }
  if (i.shutdown) L.push(' shutdown')
  if (dev.kind === 'router' && isPhysical(i.name)) {
    L.push(` duplex ${i.duplex}`, ` speed ${i.speed}`)
  } else if (sw && isPhysical(i.name)) {
    if (i.duplex !== 'auto') L.push(` duplex ${i.duplex}`)
    if (i.speed !== 'auto') L.push(` speed ${i.speed}`)
  }
  if (i.bandwidth != null) L.push(` bandwidth ${i.bandwidth}`)
  for (const a of i.ipv6) L.push(` ipv6 address ${a}`)
  if (i.linkLocal) L.push(` ipv6 address ${i.linkLocal} link-local`)
  if (i.ipv6Enable) L.push(' ipv6 enable')
  if (sw) {
    if (i.channelGroup) L.push(` channel-group ${i.channelGroup.id} mode ${i.channelGroup.mode}`)
    if (i.portfast === 'enable') L.push(' spanning-tree portfast')
    if (i.portfast === 'trunk') L.push(' spanning-tree portfast trunk')
    if (i.portfast === 'disable') L.push(' spanning-tree portfast disable')
    if (i.bpdufilter) L.push(` spanning-tree bpdufilter ${i.bpdufilter}`)
    if (i.bpduguard) L.push(` spanning-tree bpduguard ${i.bpduguard}`)
    if (i.guard) L.push(` spanning-tree guard ${i.guard}`)
    if (i.stpCost != null) L.push(` spanning-tree cost ${i.stpCost}`)
    if (i.stpPrio != null) L.push(` spanning-tree port-priority ${i.stpPrio}`)
    if (i.arpTrust) L.push(' ip arp inspection trust')
    if (i.dhcpSnoopRate != null) L.push(` ip dhcp snooping limit rate ${i.dhcpSnoopRate}`)
    if (i.dhcpSnoopTrust) L.push(' ip dhcp snooping trust')
  }
  if (!i.cdp) L.push(' no cdp enable')
  if (!i.lldpTx) L.push(' no lldp transmit')
  if (!i.lldpRx) L.push(' no lldp receive')
  L.push('!')
  return L
}

function lineBlock(dev, header, l) {
  const L = [header]
  if (l.accessClass) L.push(` access-class ${l.accessClass.acl} ${l.accessClass.dir}`)
  if (l.execTimeout) L.push(` exec-timeout ${l.execTimeout[0]} ${l.execTimeout[1]}`)
  if (l.privilege != null) L.push(` privilege level ${l.privilege}`)
  if (l.password) L.push(` password ${pwText(l.password)}`)
  if (l.loggingSync) L.push(' logging synchronous')
  if (l.login === 'line') L.push(' login')
  if (l.login === 'local') L.push(' login local')
  if (l.transport) L.push(` transport input ${l.transport.join(' ')}`)
  return L
}

/** Group VLAN priorities into "spanning-tree vlan 1,10,20 priority 24576" lines. */
function stpPriorityLines(dev) {
  const byPrio = {}
  for (const [vlan, prio] of Object.entries(dev.stp.priority)) {
    ;(byPrio[prio] ??= []).push(Number(vlan))
  }
  return Object.entries(byPrio)
    .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))
    .map(([prio, vlans]) => `spanning-tree vlan ${formatVlanList(vlans)} priority ${prio}`)
}

/** The body of show running-config (everything after the header), as lines. */
export function configLines(dev) {
  const meta = modelOf(dev)
  const sw = dev.kind === 'switch'
  const L = ['!', `version ${meta.shortVersion}`, 'no service pad', 'service timestamps debug datetime msec', 'service timestamps log datetime msec']
  L.push(dev.servicePasswordEncryption ? 'service password-encryption' : 'no service password-encryption')
  L.push('!', `hostname ${dev.hostname}`, '!', 'boot-start-marker', 'boot-end-marker', '!')
  if (dev.passwordMinLength != null) L.push(`security passwords min-length ${dev.passwordMinLength}`)
  if (!dev.logging.console) L.push('no logging console')
  if (dev.enableSecret) L.push(`enable secret ${pwText(dev.enableSecret)}`)
  if (dev.enablePassword) L.push(`enable password ${pwText(dev.enablePassword)}`)
  L.push('!')
  for (const u of dev.users) {
    L.push(`username ${u.name}${u.privilege != null ? ` privilege ${u.privilege}` : ''} ${u.kind} ${pwText(u.pw)}`)
  }
  if (dev.users.length) L.push('!')
  L.push('no aaa new-model')
  if (dev.clockTz) L.push(`clock timezone ${dev.clockTz.name} ${dev.clockTz.hours} ${dev.clockTz.mins}`)
  L.push('!')
  for (const ex of dev.dhcpExcluded) L.push(`ip dhcp excluded-address ${ex.join(' ')}`)
  if (dev.dhcpExcluded.length) L.push('!')
  for (const p of dev.dhcpPools) {
    L.push(`ip dhcp pool ${p.name}`)
    if (p.network) L.push(` network ${p.network} ${p.mask}`)
    if (p.routers?.length) L.push(` default-router ${p.routers.join(' ')}`)
    if (p.dns?.length) L.push(` dns-server ${p.dns.join(' ')}`)
    if (p.domain) L.push(` domain-name ${p.domain}`)
    if (p.lease) L.push(` lease ${p.lease}`)
    L.push('!')
  }
  if (sw) {
    if (dev.dhcpSnooping.vlans.length) L.push(`ip dhcp snooping vlan ${formatVlanList(dev.dhcpSnooping.vlans)}`)
    if (dev.dhcpSnooping.enabled) L.push('ip dhcp snooping')
    if (dev.arpInspection.vlans.length) L.push(`ip arp inspection vlan ${formatVlanList(dev.arpInspection.vlans)}`)
  }
  if (!dev.domainLookup) L.push('no ip domain-lookup')
  if (dev.domainName) L.push(`ip domain-name ${dev.domainName}`)
  if (dev.nameServers.length) L.push(`ip name-server ${dev.nameServers.join(' ')}`)
  if (sw && dev.ipRouting) L.push('ip routing')
  if (!sw) L.push('ip cef')
  if (dev.ipv6Routing) L.push('ipv6 unicast-routing')
  if (!sw) L.push(dev.ipv6Routing ? 'ipv6 cef' : 'no ipv6 cef')
  L.push('!')
  if (!dev.cdp) L.push('no cdp run', '!')
  if (dev.lldp) L.push('lldp run', '!')
  if (dev.errdisable.causes.length || dev.errdisable.interval != null) {
    for (const c of dev.errdisable.causes) L.push(`errdisable recovery cause ${c}`)
    if (dev.errdisable.interval != null) L.push(`errdisable recovery interval ${dev.errdisable.interval}`)
    L.push('!')
  }
  if (sw) {
    if (dev.vtpMode !== 'server') L.push(`vtp mode ${dev.vtpMode}`)
    if (dev.vtpDomain) L.push(`vtp domain ${dev.vtpDomain}`)
    L.push(`spanning-tree mode ${dev.stp.mode}`)
    if (dev.stp.portfastDefault) L.push('spanning-tree portfast default')
    if (dev.stp.bpduguardDefault) L.push('spanning-tree portfast bpduguard default')
    L.push('spanning-tree extend system-id')
    L.push(...stpPriorityLines(dev))
    L.push('!', 'vlan internal allocation policy ascending', '!')
    if (dev.vtpMode === 'transparent') {
      for (const id of Object.keys(dev.vlans).map(Number).sort((a, b) => a - b)) {
        if (id === 1) continue
        L.push(`vlan ${id}`)
        if (dev.vlans[id] !== `VLAN${String(id).padStart(4, '0')}`) L.push(` name ${dev.vlans[id]}`)
        L.push('!')
      }
    }
  }
  if (dev.sshVersion) L.push(`ip ssh version ${dev.sshVersion}`, '!')
  for (const name of sortedIfNames(dev)) L.push(...interfaceBlock(dev, dev.interfaces[name]))
  if (dev.ospf) {
    const o = dev.ospf
    L.push(`router ospf ${o.process}`)
    if (o.routerId) L.push(` router-id ${o.routerId}`)
    if (o.refBw != null) L.push(` auto-cost reference-bandwidth ${o.refBw}`)
    if (o.passiveDefault) L.push(' passive-interface default')
    for (const p of o.noPassive) L.push(` no passive-interface ${p}`)
    for (const p of o.passive) L.push(` passive-interface ${p}`)
    for (const n of o.networks) L.push(` network ${n.network} ${n.wildcard} area ${n.area}`)
    if (o.defaultOriginate) L.push(` default-information originate${o.defaultOriginate === 'always' ? ' always' : ''}`)
    if (o.maxPaths != null) L.push(` maximum-paths ${o.maxPaths}`)
    L.push('!')
  }
  if (sw && dev.defaultGateway) L.push(`ip default-gateway ${dev.defaultGateway}`)
  if (!sw) L.push('ip forward-protocol nd')
  L.push('!', dev.httpServer ? 'ip http server' : 'no ip http server', dev.httpsServer ? 'ip http secure-server' : 'no ip http secure-server', '!')
  for (const p of dev.nat.pools) L.push(`ip nat pool ${p.name} ${p.start} ${p.end} netmask ${p.mask}`)
  for (const r of dev.nat.rules) {
    const target = r.pool ? `pool ${r.pool}` : `interface ${r.iface}`
    L.push(`ip nat inside source list ${r.acl} ${target}${r.overload ? ' overload' : ''}`)
  }
  for (const s of dev.nat.statics) L.push(`ip nat inside source static ${s.inside} ${s.outside}`)
  for (const r of dev.routes) {
    const via = [r.iface, r.nextHop].filter(Boolean).join(' ')
    L.push(`ip route ${r.prefix} ${r.mask} ${via}${r.ad !== 1 ? ` ${r.ad}` : ''}`)
  }
  L.push('!')
  for (const acl of Object.values(dev.acls)) {
    if (!acl.named) continue
    L.push(`ip access-list ${acl.type} ${acl.key}`)
    for (const r of acl.rules) L.push(` ${aclRuleText(r, acl.type, 'run')}`)
    L.push('!')
  }
  if (dev.logging.trap) L.push(`logging trap ${dev.logging.trap}`)
  for (const h of dev.logging.hosts) L.push(`logging host ${h}`)
  for (const r of dev.ipv6Routes) {
    const via = [r.iface, r.nextHop].filter(Boolean).join(' ')
    L.push(`ipv6 route ${r.prefix} ${via}${r.ad !== 1 ? ` ${r.ad}` : ''}`)
  }
  L.push('!')
  const numbered = Object.values(dev.acls).filter((a) => !a.named).sort((a, b) => Number(a.key) - Number(b.key))
  for (const acl of numbered) for (const r of acl.rules) L.push(`access-list ${acl.key} ${aclRuleText(r, acl.type, 'run')}`)
  if (numbered.length) L.push('!')
  const s = dev.snmp
  for (const c of s.communities) L.push(`snmp-server community ${c.name} ${c.access.toUpperCase()}${c.acl ? ` ${c.acl}` : ''}`)
  if (s.location) L.push(`snmp-server location ${s.location}`)
  if (s.contact) L.push(`snmp-server contact ${s.contact}`)
  if (s.traps) L.push('snmp-server enable traps')
  for (const h of s.hosts) L.push(`snmp-server host ${h.host}${h.version !== '1' ? ` version ${h.version}` : ''} ${h.community}`)
  L.push('!', 'control-plane', '!')
  if (dev.banner != null) {
    const lines = dev.banner.split('\n')
    if (lines.length === 1) L.push(`banner motd ^C${dev.banner}^C`)
    else L.push(`banner motd ^C${lines[0]}`, ...lines.slice(1, -1), `${lines[lines.length - 1]}^C`)
    L.push('!')
  }
  L.push(...lineBlock(dev, 'line con 0', dev.lines.con))
  if (dev.lines.aux) L.push('line aux 0')
  L.push(...lineBlock(dev, 'line vty 0 4', dev.lines.vty))
  L.push(...lineBlock(dev, 'line vty 5 15', dev.lines.vty2))
  L.push('!')
  if (dev.ntp.master != null) L.push(`ntp master${dev.ntp.master === 8 ? '' : ` ${dev.ntp.master}`}`)
  for (const n of dev.ntp.servers) L.push(`ntp server ${n}`)
  L.push('end')
  return collapseBangs(L)
}

/** IOS never prints more than two "!" separators in a row. */
function collapseBangs(lines) {
  const out = []
  for (const l of lines) {
    if (l === '!' && out[out.length - 1] === '!' && out[out.length - 2] === '!') continue
    out.push(l)
  }
  return out
}

export function configBytes(lines) {
  return lines.join('\n').length + 1
}

/** Lines of one interface block, used by show running-config interface X. */
export function interfaceConfigLines(dev, name) {
  const i = dev.interfaces[name]
  return i ? interfaceBlock(dev, i) : []
}

// ---------- VLAN helpers used by commands and the model ----------

export function vlanName(dev, id) {
  return dev.vlans[id] ?? null
}

export function allowedList(i) {
  if (i.allowed == null) return null
  if (i.allowed === '') return []
  return parseVlanList(i.allowed) ?? []
}
