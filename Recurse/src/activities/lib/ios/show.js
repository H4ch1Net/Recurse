// Output of the IOS simulator's show commands. Each function returns an array of lines
// laid out like real Cisco IOS 15 output, trimmed where real output is very long.

import { cdpIf, compareIf, formatVlanList, inPrefix, ipv6ToStr, isPhysical, isSubif, maskToPrefix, parentIf, parseIPv6, shortIf } from './addr.js'
import { aclRuleText, configBytes, configLines, ifMac, interfaceConfigLines, modelOf, sortedIfNames } from './device.js'
import {
  areaText,
  briefStatus,
  cdpNeighbors,
  channelGroups,
  classfulGroups,
  dhcpBindings,
  etherchannelMembers,
  fmtAge,
  hsrpGroups,
  ifState,
  ipv6Addrs,
  ipv6RoutingTable,
  isUp,
  linkLocal,
  lldpNeighbors,
  lookupRoute,
  natTranslations,
  neighborsOn,
  ntpState,
  ospfInterfaces,
  ospfNeighbors,
  ospfRouterId,
  poolSize,
  portConnected,
  portSecurityState,
  routingTable,
  stpForVlan,
  stpVlans,
  swOperMode,
  trunkAllowed,
  trunkRows,
  vlanPorts
} from './model.js'

const pad = (s, n) => String(s ?? '').padEnd(n)
const rpad = (s, n) => String(s ?? '').padStart(n)

// ---------- clock ----------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Device time in ms since the epoch (UTC), plus whether it is trusted. */
export function deviceTime(sim) {
  const ntp = ntpState(sim)
  if (ntp.synced && ntp.server) return { ms: sim.now(), trusted: true }
  const c = sim.clock
  return { ms: c.base + (sim.now() - c.setAt), trusted: c.authoritative }
}

function tzShift(sim, ms) {
  const tz = sim.dev.clockTz
  return tz ? ms + (tz.hours * 60 + Math.sign(tz.hours || 1) * tz.mins) * 60000 : ms
}

const two = (n) => String(n).padStart(2, '0')

function hms(d) {
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`
}

/** "*00:12:34.567 UTC Mon Mar 1 1993" */
export function clockText(sim) {
  const t = deviceTime(sim)
  const d = new Date(tzShift(sim, t.ms))
  const zone = sim.dev.clockTz?.name ?? 'UTC'
  return `${t.trusted ? '' : '*'}${hms(d)} ${zone} ${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`
}

/** "*Mar  1 00:12:34.567: " prefix for log messages. */
export function logStamp(sim) {
  const t = deviceTime(sim)
  const d = new Date(tzShift(sim, t.ms))
  return `${t.trusted ? '' : '*'}${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${hms(d)}: `
}

function uptimeText(sim) {
  const mins = Math.floor((sim.now() - sim.bootAt) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const parts = []
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`)
  parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  return parts.join(', ')
}

// ---------- configuration ----------

export function showRunning(sim, iface) {
  if (iface) {
    const body = ['!', ...interfaceConfigLines(sim.dev, iface).slice(0, -1), 'end']
    return ['Building configuration...', '', `Current configuration : ${configBytes(body)} bytes`, ...body]
  }
  const body = configLines(sim.dev)
  return ['Building configuration...', '', `Current configuration : ${configBytes(body)} bytes`, ...body]
}

export function showStartup(sim) {
  if (!sim.startup) return ['startup-config is not present']
  const body = configLines(sim.startup)
  return [`Using ${configBytes(body)} out of 262144 bytes`, ...body]
}

// ---------- interfaces ----------

const BRIEF_RANK_ROUTER = { GigabitEthernet: 0, FastEthernet: 0, Serial: 1, Loopback: 2, 'Port-channel': 3, Vlan: 4 }
const BRIEF_RANK_SWITCH = { Vlan: 0, GigabitEthernet: 1, FastEthernet: 1, 'Port-channel': 2, Loopback: 3 }

function briefOrder(dev) {
  return sortedIfNames(dev, dev.kind === 'switch' ? BRIEF_RANK_SWITCH : BRIEF_RANK_ROUTER)
}

export function showIpIntBrief(sim) {
  const dev = sim.dev
  const w = dev.kind === 'switch' ? 23 : 27
  const out = [`${pad('Interface', w)}${pad('IP-Address', 16)}OK? Method Status                Protocol`]
  for (const name of briefOrder(dev)) {
    const i = dev.interfaces[name]
    const [status, proto] = briefStatus(sim, name)
    const addr = i.dhcpClient ? 'unassigned' : i.ip ?? 'unassigned'
    const method = i.dhcpClient ? 'DHCP' : i.ip ? 'manual' : 'unset'
    out.push(`${pad(name, w)}${pad(addr, 16)}YES ${pad(method, 7)}${pad(status, 22)}${proto}`)
  }
  return out
}

function lineState(sim, name) {
  const s = ifState(sim, name)
  if (s.link === 'admin') return 'administratively down'
  return s.link
}

function swSuffix(sim, name) {
  const s = ifState(sim, name)
  if (s.err) return ' (err-disabled)'
  if (s.link === 'admin') return ' (disabled)'
  if (s.proto === 'up') return ' (connected)'
  return ' (notconnect)'
}

export function showInterfaces(sim, name) {
  const dev = sim.dev
  const names = name ? [name] : briefOrder(dev)
  const out = []
  for (const n of names) {
    const i = dev.interfaces[n]
    if (!i) continue
    const s = ifState(sim, n)
    const sw = i.switchport !== undefined && isPhysical(n)
    out.push(`${n} is ${lineState(sim, n)}, line protocol is ${s.proto}${sw ? swSuffix(sim, n) : ''}`)
    const hw = /^Loopback/.test(n) ? 'Loopback' : /^Vlan/.test(n) ? 'EtherSVI' : /^Port-channel/.test(n) ? 'EtherChannel' : dev.kind === 'switch' ? 'Gigabit Ethernet' : 'CN Gigabit Ethernet'
    const mac = ifMac(dev, n)
    out.push(/^Loopback/.test(n) ? `  Hardware is ${hw}` : `  Hardware is ${hw}, address is ${mac} (bia ${mac})`)
    if (i.description) out.push(`  Description: ${i.description}`)
    if (i.ip) out.push(`  Internet address is ${i.ip}/${maskToPrefix(i.mask)}`)
    const bw = i.bandwidth ?? (/^Loopback/.test(n) ? 8000000 : 1000000)
    out.push(`  MTU ${/^Loopback/.test(n) ? 1514 : 1500} bytes, BW ${bw} Kbit/sec, DLY ${/^Loopback/.test(n) ? 5000 : 10} usec, `)
    out.push('     reliability 255/255, txload 1/255, rxload 1/255')
    if (isSubif(n)) out.push(`  Encapsulation 802.1Q Virtual LAN, Vlan ID  ${i.encap ?? 1}.`)
    else out.push(`  Encapsulation ${/^Loopback/.test(n) ? 'LOOPBACK' : 'ARPA'}, loopback not set`)
    if (isPhysical(n)) {
      out.push('  Keepalive set (10 sec)')
      out.push(s.proto === 'up' ? `  Full-duplex, 1000Mb/s, media type is ${dev.kind === 'switch' ? '10/100/1000BaseTX' : 'RJ45'}` : `  Auto-duplex, Auto-speed, media type is ${dev.kind === 'switch' ? '10/100/1000BaseTX' : 'RJ45'}`)
      out.push('  ARP type: ARPA, ARP Timeout 04:00:00')
      out.push(`  Last input ${s.proto === 'up' ? '00:00:01' : 'never'}, output ${s.proto === 'up' ? '00:00:00' : 'never'}, output hang never`)
      out.push('  Last clearing of "show interface" counters never')
      out.push('  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0')
      out.push('  5 minute input rate 0 bits/sec, 0 packets/sec')
      out.push('  5 minute output rate 0 bits/sec, 0 packets/sec')
      out.push('     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored')
      out.push('     0 output errors, 0 collisions, 0 interface resets')
    }
  }
  return out
}

export function showInterfacesDescription(sim) {
  const dev = sim.dev
  const out = [`${pad('Interface', 31)}${pad('Status', 15)}${pad('Protocol', 9)}Description`]
  for (const n of briefOrder(dev)) {
    const [status, proto] = briefStatus(sim, n)
    out.push(`${pad(shortIf(n), 31)}${pad(status === 'administratively down' ? 'admin down' : status, 15)}${pad(proto, 9)}${dev.interfaces[n].description ?? ''}`)
  }
  return out
}

export function showIpInterface(sim, name) {
  const dev = sim.dev
  const names = name ? [name] : briefOrder(dev)
  const out = []
  for (const n of names) {
    const i = dev.interfaces[n]
    if (!i) continue
    const s = ifState(sim, n)
    out.push(`${n} is ${lineState(sim, n)}, line protocol is ${s.proto}`)
    if (!i.ip || i.switchport === true) {
      out.push('  Internet protocol processing disabled')
      continue
    }
    out.push(`  Internet address is ${i.ip}/${maskToPrefix(i.mask)}`)
    out.push('  Broadcast address is 255.255.255.255')
    out.push('  Address determined by setup command')
    out.push('  MTU is 1500 bytes')
    out.push(i.helpers.length ? `  Helper addresses are ${i.helpers.join(' ')}` : '  Helper address is not set')
    out.push('  Directed broadcast forwarding is disabled')
    out.push('  Outgoing Common access list is not set ')
    out.push(`  Outgoing access list is ${i.aclOut ?? 'not set'}`)
    out.push('  Inbound Common access list is not set ')
    out.push(`  Inbound  access list is ${i.aclIn ?? 'not set'}`)
    out.push('  Proxy ARP is enabled')
    out.push('  Split horizon is enabled')
    out.push(`  IP fast switching is enabled`)
    out.push(`  Network address translation is ${i.natRole ? `enabled, interface in domain ${i.natRole}` : 'disabled'}`)
  }
  return out
}

export function showInterfacesStatus(sim) {
  const dev = sim.dev
  const out = [`${pad('Port', 10)}${pad('Name', 19)}${pad('Status', 13)}${pad('Vlan', 11)}Duplex  Speed Type`]
  const names = sortedIfNames(dev, { GigabitEthernet: 0, 'Port-channel': 1 }).filter((n) => dev.interfaces[n].switchport !== undefined)
  for (const n of names) {
    const i = dev.interfaces[n]
    const s = ifState(sim, n)
    const status = s.err ? 'err-disabled' : s.link === 'admin' ? 'disabled' : s.proto === 'up' ? 'connected' : 'notconnect'
    let vlan = String(i.accessVlan)
    if (i.switchport === false) vlan = 'routed'
    else if (swOperMode(sim, n) === 'trunk' || (/^Port-channel/.test(n) && i.mode === 'trunk')) vlan = 'trunk'
    const up = s.proto === 'up'
    const type = /^Port-channel/.test(n) ? '' : '10/100/1000BaseTX'
    out.push(`${pad(shortIf(n), 10)}${pad((i.description ?? '').slice(0, 18), 19)}${pad(status, 13)}${pad(vlan, 11)}${rpad(up ? 'a-full' : 'auto', 6)} ${rpad(up ? 'a-1000' : 'auto', 6)} ${type}`)
  }
  return out
}

export function showInterfacesTrunk(sim) {
  const rows = trunkRows(sim)
  if (!rows.length) return []
  const out = ['', `${pad('Port', 12)}${pad('Mode', 17)}${pad('Encapsulation', 15)}${pad('Status', 14)}Native vlan`]
  for (const r of rows) out.push(`${pad(shortIf(r.name), 12)}${pad(r.mode, 17)}${pad('802.1q', 15)}${pad('trunking', 14)}${r.native}`)
  const list = (ids) => (ids.length ? formatVlanList(ids) : 'none')
  out.push('', `${pad('Port', 12)}Vlans allowed on trunk`)
  for (const r of rows) out.push(`${pad(shortIf(r.name), 12)}${r.allowed === null ? '1-4094' : list(r.allowed)}`)
  out.push('', `${pad('Port', 12)}Vlans allowed and active in management domain`)
  for (const r of rows) out.push(`${pad(shortIf(r.name), 12)}${list(r.active)}`)
  out.push('', `${pad('Port', 12)}Vlans in spanning tree forwarding state and not pruned`)
  for (const r of rows) out.push(`${pad(shortIf(r.name), 12)}${list(r.forwarding)}`)
  return out
}

export function showInterfacesSwitchport(sim, name) {
  const dev = sim.dev
  const names = name ? [name] : sortedIfNames(dev).filter((n) => dev.interfaces[n].switchport !== undefined)
  const out = []
  for (const n of names) {
    const i = dev.interfaces[n]
    if (!i || i.switchport === undefined) continue
    if (out.length) out.push('')
    out.push(`Name: ${shortIf(n)}`)
    if (i.switchport === false) {
      out.push('Switchport: Disabled')
      continue
    }
    const oper = !portConnected(sim, n) && isPhysical(n) ? 'down' : swOperMode(sim, n) === 'trunk' ? 'trunk' : 'static access'
    const admin = i.mode === 'access' ? 'static access' : i.mode
    const vname = (v) => (dev.vlans[v] ? ` (${dev.vlans[v]})` : ' (Inactive)')
    const allowed = trunkAllowed(i)
    out.push('Switchport: Enabled')
    out.push(`Administrative Mode: ${admin}`)
    out.push(`Operational Mode: ${oper}`)
    out.push('Administrative Trunking Encapsulation: dot1q')
    out.push(`Operational Trunking Encapsulation: ${oper === 'trunk' ? 'dot1q' : 'native'}`)
    out.push(`Negotiation of Trunking: ${i.nonegotiate || i.mode === 'access' ? 'Off' : 'On'}`)
    out.push(`Access Mode VLAN: ${i.accessVlan}${vname(i.accessVlan)}`)
    out.push(`Trunking Native Mode VLAN: ${i.nativeVlan}${vname(i.nativeVlan)}`)
    out.push('Administrative Native VLAN tagging: enabled')
    out.push(`Voice VLAN: ${i.voiceVlan ?? 'none'}`)
    out.push('Administrative private-vlan host-association: none ')
    out.push('Administrative private-vlan mapping: none ')
    out.push('Operational private-vlan: none')
    out.push(`Trunking VLANs Enabled: ${allowed === null ? 'ALL' : allowed.length ? formatVlanList(allowed) : 'NONE'}`)
    out.push('Pruning VLANs Enabled: 2-1001')
    out.push('Capture Mode Disabled')
    out.push('Capture VLANs Allowed: ALL')
    out.push('', 'Protected: false', 'Unknown unicast blocked: disabled', 'Unknown multicast blocked: disabled', 'Appliance trust: none')
  }
  return out
}

// ---------- VLANs and switching ----------

function wrapPorts(ports) {
  const lines = []
  let cur = ''
  for (const p of ports) {
    const next = cur ? `${cur}, ${p}` : p
    if (next.length > 31 && cur) {
      lines.push(`${cur},`)
      cur = p
    } else cur = next
  }
  lines.push(cur)
  return lines.map((l) => l.replace(/,$/, ''))
}

export function showVlanBrief(sim) {
  const dev = sim.dev
  const out = ['', 'VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------']
  const ids = Object.keys(dev.vlans).map(Number).sort((a, b) => a - b)
  for (const id of ids) {
    const ports = wrapPorts(vlanPorts(sim, id))
    out.push(`${pad(id, 5)}${pad(dev.vlans[id], 33)}${pad('active', 10)}${ports[0]}`.trimEnd())
    for (const more of ports.slice(1)) out.push(`${' '.repeat(48)}${more}`)
  }
  for (const [id, name] of [
    [1002, 'fddi-default'],
    [1003, 'token-ring-default'],
    [1004, 'fddinet-default'],
    [1005, 'trnet-default']
  ]) out.push(`${pad(id, 5)}${pad(name, 33)}act/unsup `)
  return out
}

export function showVtpStatus(sim) {
  const dev = sim.dev
  return [
    'VTP Version capable             : 1 to 3',
    'VTP version running             : 1',
    `VTP Domain Name                 : ${dev.vtpDomain}`,
    'VTP Pruning Mode                : Disabled',
    'VTP Traps Generation            : Disabled',
    `Device ID                       : ${dev.baseMac}`,
    '',
    'Feature VLAN:',
    '--------------',
    `VTP Operating Mode                : ${dev.vtpMode[0].toUpperCase()}${dev.vtpMode.slice(1)}`,
    'Maximum VLANs supported locally   : 255',
    `Number of existing VLANs          : ${Object.keys(dev.vlans).length + 4}`,
    'Configuration Revision            : 0'
  ]
}

export function showMacAddressTable(sim) {
  const dev = sim.dev
  const out = ['          Mac Address Table', '-------------------------------------------', '', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----']
  const rows = []
  for (const n of sortedIfNames(dev)) {
    const i = dev.interfaces[n]
    if (i.switchport !== true || !isUp(sim, n)) continue
    const mode = swOperMode(sim, n)
    for (const nb of neighborsOn(sim, n)) {
      if (!nb.mac) continue
      if (mode !== 'access') continue
      const sticky = i.portSecurity?.stickyMacs.includes(nb.mac) || i.portSecurity?.macs.includes(nb.mac)
      rows.push([i.accessVlan, nb.mac, sticky ? 'STATIC' : 'DYNAMIC', shortIf(n)])
    }
    if (mode === 'trunk') {
      const nb = neighborsOn(sim, n).find((x) => x.stp)
      if (nb) rows.push([1, nb.stp.mac.replace(/.$/, (c) => ((parseInt(c, 16) + 1) % 16).toString(16)), 'DYNAMIC', shortIf(n)])
    }
  }
  rows.sort((a, b) => a[0] - b[0])
  for (const r of rows) out.push(`${rpad(r[0], 4)}    ${pad(r[1], 18)}${pad(r[2], 12)}${r[3]}`)
  out.push(`Total Mac Addresses for this criterion: ${rows.length}`)
  return out
}

export function showEtherchannelSummary(sim) {
  const out = [
    'Flags:  D - down        P - bundled in port-channel',
    '        I - stand-alone s - suspended',
    '        H - Hot-standby (LACP only)',
    '        R - Layer3      S - Layer2',
    '        U - in use      f - failed to allocate aggregator',
    '',
    '        M - not in use, minimum links not met',
    '        u - unsuitable for bundling',
    '        w - waiting to be aggregated',
    '        d - default port',
    '',
    ''
  ]
  const groups = channelGroups(sim)
  out.push(`Number of channel-groups in use: ${groups.length}`)
  out.push(`Number of aggregators:           ${groups.length}`)
  out.push('', 'Group  Port-channel  Protocol    Ports', '------+-------------+-----------+-----------------------------------------------')
  for (const id of groups) {
    const members = etherchannelMembers(sim, id)
    const mode = sim.dev.interfaces[members[0].name].channelGroup.mode
    const proto = ['active', 'passive'].includes(mode) ? 'LACP' : ['desirable', 'auto'].includes(mode) ? 'PAgP' : '-'
    const po = `Po${id}(S${members.some((m) => m.flag === 'P') ? 'U' : 'D'})`
    out.push(`${pad(id, 7)}${pad(po, 16)}${pad(proto, 10)}${members.map((m) => pad(`${shortIf(m.name)}(${m.flag})`, 12)).join('')}`)
  }
  return out
}

export function showSpanningTree(sim, vlan) {
  const dev = sim.dev
  if (vlan != null && !stpForVlan(sim, vlan)) return [`Spanning tree instance(s) for vlan ${vlan} does not exist.`]
  const vlans = vlan != null ? [vlan] : stpVlans(sim)
  if (!vlans.length) return ['No spanning tree instance exists.']
  const out = []
  const proto = dev.stp.mode === 'rapid-pvst' ? 'rstp' : dev.stp.mode === 'mst' ? 'mstp' : 'ieee'
  for (const v of vlans) {
    const st = stpForVlan(sim, v)
    if (out.length) out.push('')
    out.push(`VLAN${String(v).padStart(4, '0')}`, `  Spanning tree enabled protocol ${proto}`)
    out.push(`  Root ID    Priority    ${st.root.prio}`, `             Address     ${st.root.mac}`)
    if (st.root.local) out.push('             This bridge is the root')
    else out.push(`             Cost        ${st.rootCost}`, `             Port        ${st.rootPort.split('/').pop()} (${st.rootPort})`)
    out.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec', '')
    const base = st.bridge.prio - v
    out.push(`  Bridge ID  Priority    ${st.bridge.prio}  (priority ${base} sys-id-ext ${v})`, `             Address     ${st.bridge.mac}`)
    out.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec', '             Aging Time  300 sec', '')
    out.push('Interface           Role Sts Cost      Prio.Nbr Type', '------------------- ---- --- --------- -------- --------------------------------')
    for (const p of st.ports) out.push(`${pad(shortIf(p.name), 20)}${pad(p.role, 5)}${pad(p.state, 4)}${pad(p.cost, 10)}${pad(`${p.prio}.${p.num}`, 9)}P2p${p.edge ? ' Edge' : ''}`)
  }
  return out
}

export function showPortSecurity(sim) {
  const dev = sim.dev
  const out = [
    'Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action',
    '                (Count)       (Count)          (Count)',
    '---------------------------------------------------------------------------'
  ]
  for (const n of sortedIfNames(dev)) {
    const st = portSecurityState(sim, n)
    if (!st?.enabled) continue
    const action = st.violation[0].toUpperCase() + st.violation.slice(1)
    out.push(`${rpad(shortIf(n), 11)}${rpad(st.max, 15)}${rpad(st.total, 13)}${rpad(st.violations, 19)}${rpad(action, 17)}`)
  }
  out.push('---------------------------------------------------------------------------')
  out.push('Total Addresses in System (excluding one mac per port)     : 0')
  out.push('Max Addresses limit in System (excluding one mac per port) : 4096')
  return out
}

export function showPortSecurityInterface(sim, name) {
  const st = portSecurityState(sim, name)
  const enabled = Boolean(st?.enabled)
  const v = st?.violation ?? 'shutdown'
  return [
    `Port Security              : ${enabled ? 'Enabled' : 'Disabled'}`,
    `Port Status                : ${enabled ? st.status : 'Secure-down'}`,
    `Violation Mode             : ${v[0].toUpperCase()}${v.slice(1)}`,
    'Aging Time                 : 0 mins',
    'Aging Type                 : Absolute',
    'SecureStatic Address Aging : Disabled',
    `Maximum MAC Addresses      : ${st?.max ?? 1}`,
    `Total MAC Addresses        : ${enabled ? st.total : 0}`,
    `Configured MAC Addresses   : ${st?.configured ?? 0}`,
    `Sticky MAC Addresses       : ${st?.sticky ?? 0}`,
    `Last Source Address:Vlan   : ${enabled ? st.last : '0000.0000.0000:0'}`,
    `Security Violation Count   : ${st?.violations ?? 0}`
  ]
}

// ---------- routing ----------

const CODES = [
  'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
  '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area ',
  '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
  '       E1 - OSPF external type 1, E2 - OSPF external type 2',
  '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
  '       ia - IS-IS inter area, * - candidate default, U - per-user static route',
  '       o - ODR, P - periodic downloaded static route, H - NHRP, l - LISP',
  '       a - application route',
  '       + - replicated route, % - next hop override, p - overrides from PfR'
]

function routeLines(r, indent, showLen) {
  const name = `${r.prefix}${showLen ? `/${r.len}` : ''}`
  const head = pad(r.code, indent)
  if (r.code === 'C' || r.code === 'L') return [`${head}${name} is directly connected, ${r.paths[0].iface}`]
  return r.paths.map((p, k) => {
    const lead = k === 0 ? `${head}${name} ` : ' '.repeat(indent + name.length + 1)
    if (!p.nh) return `${lead}is directly connected, ${p.iface}`
    const tail = p.age ? `, ${p.age}, ${p.iface}` : p.iface ? `, ${p.iface}` : ''
    return `${lead}[${r.ad}/${r.metric}] via ${p.nh}${tail}`
  })
}

const CODE_FILTERS = { static: ['S', 'S*'], connected: ['C', 'L'], ospf: ['O', 'O IA', 'O E1', 'O E2', 'O*E2'] }

export function showIpRoute(sim, filter) {
  const dev = sim.dev
  if (dev.kind === 'switch' && !dev.ipRouting) {
    return [dev.defaultGateway ? `Default gateway is ${dev.defaultGateway}` : 'Default gateway is not set', '', 'Host               Gateway           Last Use    Total Uses  Interface', 'ICMP redirect cache is empty']
  }
  const table = routingTable(sim)
  if (filter && /^\d/.test(filter)) return routeDetail(sim, filter)
  const shown = filter ? table.filter((r) => CODE_FILTERS[filter]?.includes(r.code)) : table
  const def = table.find((r) => r.prefix === '0.0.0.0' && r.len === 0)
  const out = [...CODES, '']
  out.push(def ? `Gateway of last resort is ${def.paths[0].nh ?? '0.0.0.0'} to network 0.0.0.0` : 'Gateway of last resort is not set', '')
  for (const g of classfulGroups(shown)) {
    if (!g.header) {
      for (const r of g.routes) out.push(...routeLines(r, 6, true))
      continue
    }
    out.push(`      ${g.header}`)
    const variable = /variably/.test(g.header)
    for (const r of g.routes) out.push(...routeLines(r, 9, variable))
  }
  return out
}

function routeDetail(sim, ip) {
  const r = lookupRoute(sim, ip)
  if (!r) return ['% Network not in table']
  const known = r.code.startsWith('O') ? `ospf ${sim.dev.ospf?.process ?? 1}` : r.code.startsWith('S') ? 'static' : 'connected'
  const out = [`Routing entry for ${r.prefix}/${r.len}`, `  Known via "${known}", distance ${r.ad}, metric ${r.metric}${r.code === 'C' || r.code === 'L' ? ' (connected, via interface)' : ''}`]
  if (r.code === 'S*' || r.code === 'O*E2') out.push('  Routing Descriptor Blocks:'.replace('Routing', 'Candidate default path\n  Routing'))
  else out.push('  Routing Descriptor Blocks:')
  for (const p of r.paths) {
    out.push(`  * ${p.nh ? `${p.nh}${p.iface ? `, via ${p.iface}` : ''}` : `directly connected, via ${p.iface}`}`)
    out.push(`      Route metric is ${r.metric}, traffic share count is 1`)
  }
  return out.flatMap((l) => l.split('\n'))
}

export function showIpv6IntBrief(sim) {
  const dev = sim.dev
  const out = []
  for (const n of briefOrder(dev)) {
    const i = dev.interfaces[n]
    if (i.switchport === true) continue
    const [status, proto] = briefStatus(sim, n)
    out.push(`${pad(n, 23)}[${status}/${proto}]`)
    const ll = linkLocal(sim, i)
    const addrs = ipv6Addrs(sim, i)
    if (!ll && !addrs.length) out.push('    unassigned')
    if (ll) out.push(`    ${ll}`)
    for (const a of addrs) out.push(`    ${a.text}`)
  }
  return out
}

export function showIpv6Route(sim, filter) {
  const all = ipv6RoutingTable(sim)
  const table = filter === 'static' ? all.filter((r) => r.code === 'S') : filter === 'connected' ? all.filter((r) => r.code === 'C' || r.code === 'L') : all
  const out = [
    `IPv6 Routing Table - default - ${all.length} entries`,
    'Codes: C - Connected, L - Local, S - Static, U - Per-user Static route',
    '       B - BGP, R - RIP, H - NHRP, I1 - ISIS L1',
    '       I2 - ISIS L2, IA - ISIS interarea, IS - ISIS summary, D - EIGRP',
    '       EX - EIGRP external, ND - ND Default, NDp - ND Prefix, DCE - Destination',
    '       NDr - Redirect, O - OSPF Intra, OI - OSPF Inter, OE1 - OSPF ext 1',
    '       OE2 - OSPF ext 2, ON1 - OSPF NSSA ext 1, ON2 - OSPF NSSA ext 2',
    '       a - Application'
  ]
  for (const r of table) {
    out.push(`${pad(r.code, 4)}${r.prefix}/${r.len} [${r.ad}/${r.metric}]`)
    for (const p of r.paths) {
      if (p.connected) out.push(`     via ${p.iface}, directly connected`)
      else if (p.receive) out.push(`     via ${p.iface}, receive`)
      else out.push(`     via ${[p.nh ? ipv6ToStr(parseIPv6(p.nh)) : null, p.iface].filter(Boolean).join(', ')}`)
    }
  }
  return out
}

export function showIpProtocols(sim) {
  const o = sim.dev.ospf
  if (!o) return []
  const rid = ospfRouterId(sim)
  const areas = new Set(ospfInterfaces(sim).map((x) => String(x.area)))
  o.networks.forEach((n) => areas.add(String(n.area)))
  const out = [
    '*** IP Routing is NSF aware ***',
    '',
    `Routing Protocol is "ospf ${o.process}"`,
    '  Outgoing update filter list for all interfaces is not set',
    '  Incoming update filter list for all interfaces is not set',
    `  Router ID ${rid ?? '0.0.0.0'}`,
    `  Number of areas in this router is ${areas.size}. ${areas.size} normal 0 stub 0 nssa`,
    `  Maximum path: ${o.maxPaths ?? 4}`,
    '  Routing for Networks:'
  ]
  for (const n of o.networks) out.push(`    ${n.network} ${n.wildcard} area ${n.area}`)
  const ifEnabled = Object.values(sim.dev.interfaces).filter((i) => i.ospf?.process === o.process)
  if (ifEnabled.length) {
    out.push('  Routing on Interfaces Configured Explicitly (Area ' + ifEnabled[0].ospf.area + '):')
    for (const i of ifEnabled) out.push(`    ${i.name}`)
  }
  const passive = o.passiveDefault ? Object.keys(sim.dev.interfaces).filter((n) => !o.noPassive.includes(n)) : o.passive
  if (passive.length) {
    out.push('  Passive Interface(s):')
    for (const p of passive) out.push(`    ${p}`)
  }
  out.push('  Routing Information Sources:', '    Gateway         Distance      Last Update')
  for (const n of ospfNeighbors(sim)) out.push(`    ${pad(n.rid, 16)}${rpad(110, 8)}      ${fmtAge(sim.now() - (sim.op.since[`ospf:${n.rid}@${n.iface}`] ?? sim.now()))}`)
  out.push('  Distance: (default is 110)')
  return out
}

export function showIpOspf(sim) {
  const o = sim.dev.ospf
  if (!o) return ['%OSPF: No router process is configured']
  const ifs = ospfInterfaces(sim)
  const areas = [...new Set(ifs.map((x) => String(x.area)))]
  const out = [` Routing Process "ospf ${o.process}" with ID ${ospfRouterId(sim) ?? '0.0.0.0'}`, ' Start time: 00:00:05.123, Time elapsed: ' + fmtAge(sim.now() - sim.bootAt), ' Supports only single TOS(TOS0) routes', ' Supports opaque LSA', ` Reference bandwidth unit is ${o.refBw ?? 100} mbps`, ` Number of areas in this router is ${areas.length}. ${areas.length} normal 0 stub 0 nssa`]
  for (const a of areas) {
    const inA = ifs.filter((x) => String(x.area) === a)
    out.push(`    Area ${Number(a) === 0 ? 'BACKBONE(0)' : a}`, `        Number of interfaces in this area is ${inA.length}`)
  }
  return out
}

export function showIpOspfNeighbor(sim) {
  const nbrs = ospfNeighbors(sim)
  if (!sim.dev.ospf) return []
  const out = ['', 'Neighbor ID     Pri   State           Dead Time   Address         Interface']
  const dead = 30 + Math.floor((sim.now() / 1000) % 10)
  for (const n of nbrs) out.push(`${pad(n.rid, 15)}${rpad(n.priority, 4)}   ${pad(`FULL/${n.role === '-' ? '  -' : n.role}`, 16)}00:00:${String(dead).padStart(2, '0')}    ${pad(n.ip, 16)}${n.iface}`)
  return out
}

export function showIpOspfInterfaceBrief(sim) {
  if (!sim.dev.ospf) return []
  const nbrs = ospfNeighbors(sim)
  const out = ['Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C']
  for (const oi of ospfInterfaces(sim)) {
    const n = nbrs.filter((x) => x.iface === oi.name)
    let state = 'DR'
    if (oi.network === 'point-to-point') state = 'P2P'
    else if (n.some((x) => x.role === 'DR')) state = 'BDR'
    if (!n.length && oi.network !== 'point-to-point') state = 'DR'
    out.push(`${pad(shortIf(oi.name), 13)}${pad(sim.dev.ospf.process, 6)}${pad(areaText(oi.area), 16)}${pad(`${oi.ip}/${oi.len}`, 19)}${pad(oi.cost, 6)}${pad(state, 6)}${n.length}/${n.length}`)
  }
  return out
}

// ---------- services ----------

export function showAccessLists(sim, key) {
  const out = []
  const acls = Object.values(sim.dev.acls).filter((a) => !key || a.key === key)
  acls.sort((a, b) => (/^\d+$/.test(a.key) && /^\d+$/.test(b.key) ? Number(a.key) - Number(b.key) : a.key.localeCompare(b.key)))
  for (const a of acls) {
    out.push(`${a.type === 'standard' ? 'Standard' : 'Extended'} IP access list ${a.key}`)
    for (const r of a.rules) {
      if (r.remark != null) continue
      const hits = sim.op.aclHits[`${a.key}:${r.seq}`]
      out.push(`    ${r.seq} ${aclRuleText(r, a.type, 'show')}${hits ? ` (${hits} match${hits === 1 ? '' : 'es'})` : ''}`)
    }
  }
  return out
}

export function showIpNatTranslations(sim) {
  const rows = natTranslations(sim)
  if (!rows.length) return []
  const out = [`${pad('Pro', 4)}${pad('Inside global', 22)}${pad('Inside local', 22)}${pad('Outside local', 22)}Outside global`]
  for (const t of rows) out.push(`${t.proto.padEnd(3)} ${pad(t.insideGlobal, 22)}${pad(t.insideLocal, 22)}${pad(t.outsideLocal, 22)}${t.outsideGlobal}`)
  return out
}

export function showIpNatStatistics(sim) {
  const dev = sim.dev
  const rows = natTranslations(sim)
  const statics = rows.filter((r) => r.kind === 'static').length
  const dyn = rows.length - statics
  const ext = rows.filter((r) => r.kind === 'pat').length
  const out = [`Total active translations: ${rows.length} (${statics} static, ${dyn} dynamic; ${ext} extended)`, `Peak translations: ${rows.length}`, 'Outside interfaces:']
  for (const i of Object.values(dev.interfaces)) if (i.natRole === 'outside') out.push(`  ${i.name}`)
  out.push('Inside interfaces: ')
  for (const i of Object.values(dev.interfaces)) if (i.natRole === 'inside') out.push(`  ${i.name}`)
  out.push(`Hits: ${dyn * 12}  Misses: 0`, 'CEF Translated packets: 0, CEF Punted packets: 0', 'Expired translations: 0', 'Dynamic mappings:')
  if (dev.nat.rules.length) out.push('-- Inside Source')
  dev.nat.rules.forEach((r, k) => {
    const target = r.pool ? `pool ${r.pool}` : `interface ${r.iface}`
    out.push(`[Id: ${k + 1}] access-list ${r.acl} ${target}${r.overload ? ' overload' : ''} refcount ${rows.filter((x) => x.kind !== 'static').length}`)
  })
  return out
}

function leaseEnd(sim, pool) {
  if (pool?.lease === 'infinite') return 'Infinite'
  const days = pool?.lease ? Number(pool.lease.split(' ')[0]) || 1 : 1
  const d = new Date(tzShift(sim, deviceTime(sim).ms) + days * 86400000)
  let h = d.getUTCHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${MONTHS[d.getUTCMonth()]} ${two(d.getUTCDate())} ${d.getUTCFullYear()} ${two(h)}:${two(d.getUTCMinutes())} ${ampm}`
}

export function showIpDhcpBinding(sim) {
  const out = ['Bindings from all pools not associated with VRF:', 'IP address          Client-ID/              Lease expiration        Type', '                    Hardware address/', '                    User name']
  for (const b of dhcpBindings(sim)) {
    const pool = sim.dev.dhcpPools.find((p) => p.name === b.pool)
    out.push(`${pad(b.ip, 20)}${pad(b.clientId, 24)}${pad(leaseEnd(sim, pool), 24)}Automatic`)
  }
  return out
}

export function showIpDhcpPool(sim) {
  const out = []
  const binds = dhcpBindings(sim)
  for (const p of sim.dev.dhcpPools) {
    const leased = binds.filter((b) => b.pool === p.name)
    out.push('', `Pool ${p.name} :`, ' Utilization mark (high/low)    : 100 / 0', ' Subnet size (first/next)       : 0 / 0 ', ` Total addresses                : ${poolSize(p)}`, ` Leased addresses               : ${leased.length}`, ' Pending event                  : none')
    if (p.network) {
      const net = p.network.split('.').map(Number)
      const len = maskToPrefix(p.mask)
      const size = 2 ** (32 - len)
      const last = [...net]
      let n = net.reduce((a, o) => a * 256 + o, 0) + size - 2
      for (let k = 3; k >= 0; k--) {
        last[k] = n % 256
        n = Math.floor(n / 256)
      }
      const first = [...net.slice(0, 3), net[3] + 1].join('.')
      const next = leased.length ? leased[leased.length - 1].ip.replace(/\d+$/, (x) => String(Number(x) + 1)) : first
      out.push(' 1 subnet is currently in the pool :', ' Current index        IP address range                    Leased addresses', ` ${pad(next, 21)}${pad(first, 17)}- ${pad(last.join('.'), 18)}${leased.length}`)
    } else out.push(' 0 subnet is currently in the pool :')
  }
  return out
}

export function showIpDhcpSnooping(sim) {
  const d = sim.dev
  const out = [`Switch DHCP snooping is ${d.dhcpSnooping.enabled ? 'enabled' : 'disabled'}`, 'Switch DHCP gleaning is disabled', 'DHCP snooping is configured on following VLANs:', d.dhcpSnooping.vlans.length ? formatVlanList(d.dhcpSnooping.vlans) : 'none', 'DHCP snooping is operational on following VLANs:', d.dhcpSnooping.enabled && d.dhcpSnooping.vlans.length ? formatVlanList(d.dhcpSnooping.vlans.filter((v) => d.vlans[v])) || 'none' : 'none', 'DHCP snooping is configured on the following L3 Interfaces:', '', 'Insertion of option 82 is enabled', '   circuit-id default format: vlan-mod-port', '   remote-id: ' + d.baseMac + ' (MAC)', 'Option 82 on untrusted port is not allowed', 'Verification of hwaddr field is enabled', 'Verification of giaddr field is enabled', 'DHCP snooping trust/rate is configured on the following Interfaces:', '', 'Interface                  Trusted    Allow option    Rate limit (pps)', '-----------------------    -------    ------------    ----------------   ']
  for (const n of sortedIfNames(d)) {
    const i = d.interfaces[n]
    if (!i.dhcpSnoopTrust && i.dhcpSnoopRate == null) continue
    out.push(`${pad(n, 27)}${pad(i.dhcpSnoopTrust ? 'yes' : 'no', 11)}${pad(i.dhcpSnoopTrust ? 'yes' : 'no', 16)}${i.dhcpSnoopRate ?? 'unlimited'}`)
  }
  return out
}

export function showIpArpInspection(sim) {
  const d = sim.dev
  const out = ['', 'Source Mac Validation      : Disabled', 'Destination Mac Validation : Disabled', 'IP Address Validation      : Disabled', '', ' Vlan     Configuration    Operation   ACL Match          Static ACL', ' ----     -------------    ---------   ---------          ----------']
  for (const v of d.arpInspection.vlans) out.push(`${rpad(v, 5)}     Enabled          ${d.vlans[v] ? 'Active  ' : 'Inactive'}`)
  out.push('', ' Interface        Trust State     Rate (pps)    Burst Interval', ' ---------------  -----------     ----------    --------------')
  for (const n of sortedIfNames(d)) {
    const i = d.interfaces[n]
    if (i.switchport !== true || !isPhysical(n)) continue
    out.push(` ${pad(shortIf(n), 17)}${pad(i.arpTrust ? 'Trusted' : 'Untrusted', 16)}${rpad(i.arpTrust ? 'None' : '15', 10)}${rpad(i.arpTrust ? 'N/A' : '1', 18)}`)
  }
  return out
}

export function showNtpStatus(sim) {
  const st = ntpState(sim)
  if (!st.synced) return ['Clock is unsynchronized, stratum 16, no reference clock', 'nominal freq is 250.0000 Hz, actual freq is 250.0000 Hz, precision is 2**10', 'ntp uptime is 0 (1/100 of seconds), resolution is 4000', 'reference time is 00000000.00000000 (00:00:00.000 UTC Mon Jan 1 1900)', 'clock offset is 0.0000 msec, root delay is 0.00 msec', 'root dispersion is 0.00 msec, peer dispersion is 0.00 msec', "loopfilter state is 'NSET' (Never set), drift is 0.000000000 s/s", 'system poll interval is 64, never updated.']
  return [
    `Clock is synchronized, stratum ${st.stratum}, reference is ${st.ref}`,
    'nominal freq is 250.0000 Hz, actual freq is 250.0000 Hz, precision is 2**10',
    `ntp uptime is ${Math.floor((sim.now() - sim.bootAt) / 10)} (1/100 of seconds), resolution is 4000`,
    `reference time is E1F2A3B4.1A2B3C4D (${clockText(sim).replace('*', '')})`,
    'clock offset is 0.5000 msec, root delay is 1.00 msec',
    'root dispersion is 3.50 msec, peer dispersion is 0.12 msec',
    "loopfilter state is 'CTRL' (Normal Controlled Loop), drift is 0.000000000 s/s",
    'system poll interval is 64, last update was 12 sec ago.'
  ]
}

export function showNtpAssociations(sim) {
  const st = ntpState(sim)
  const out = ['', '  address         ref clock       st   when   poll reach  delay  offset   disp']
  for (const s of sim.dev.ntp.servers) {
    const stratum = sim.env.ntp?.[s]
    const synced = st.server === s
    out.push(`${synced ? '*~' : ' ~'}${pad(s, 16)}${pad(synced ? '127.127.1.1' : '.INIT.', 16)}${rpad(synced ? stratum : 16, 3)}${rpad(synced ? 12 : '-', 7)}${rpad(64, 7)}${rpad(synced ? 377 : 0, 6)}  ${synced ? '1.000   0.500   0.120' : '0.000   0.000 15937.'}`)
  }
  if (sim.dev.ntp.master != null) out.push(`*~127.127.1.1     .LOCL.     ${rpad(sim.dev.ntp.master - 1, 6)}      6     16    377  0.000   0.000   0.230`)
  out.push(' * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured')
  return out
}

export function showStandbyBrief(sim) {
  const out = ['                     P indicates configured to preempt.', '                     |', 'Interface   Grp  Pri P State   Active          Standby         Virtual IP']
  for (const g of hsrpGroups(sim)) out.push(`${pad(shortIf(g.iface), 12)}${pad(g.group, 5)}${pad(g.priority, 4)}${g.preempt ? 'P' : ' '} ${pad(g.state, 8)}${pad(g.active, 16)}${pad(g.standby, 16)}${g.vip ?? 'unknown'}`)
  return out
}

export function showStandby(sim) {
  const out = []
  for (const g of hsrpGroups(sim)) {
    const mac = g.version === 2 ? `0000.0c9f.f${g.group.toString(16).padStart(3, '0')}` : `0000.0c07.ac${g.group.toString(16).padStart(2, '0')}`
    out.push(`${g.iface} - Group ${g.group}${g.version === 2 ? ' (version 2)' : ''}`)
    out.push(`  State is ${g.state}`, '    1 state change, last state change 00:00:12')
    out.push(`  Virtual IP address is ${g.vip ?? 'unknown'}`, `  Active virtual MAC address is ${mac}`, `    Local virtual MAC address is ${mac} (v${g.version} default)`)
    out.push('  Hello time 3 sec, hold time 10 sec', '    Next hello sent in 1.024 secs')
    out.push(`  Preemption ${g.preempt ? 'enabled' : 'disabled'}`)
    out.push(`  Active router is ${g.active}${g.active !== 'local' && g.peerPriority != null ? `, priority ${g.peerPriority} (expires in 9.312 sec)` : ''}`)
    out.push(`  Standby router is ${g.standby}${g.standby !== 'local' && g.standby !== 'unknown' && g.peerPriority != null ? `, priority ${g.peerPriority} (expires in 9.312 sec)` : ''}`)
    out.push(`  Priority ${g.priority} (${g.priority === 100 ? 'default 100' : `configured ${g.priority}`})`)
    out.push(`  Group name is "hsrp-${shortIf(g.iface)}-${g.group}" (default)`)
  }
  return out
}

// ---------- discovery ----------

function neighborVersion(n) {
  if (n.version) return n.version
  if (/2960|3560|3650|9200|C2960/i.test(n.platform ?? '')) return 'Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE11, RELEASE SOFTWARE (fc3)'
  return 'Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.7(3)M8, RELEASE SOFTWARE (fc2)'
}

function holdtime(sim, n, base) {
  const offset = (n.port.length * 7 + Math.floor((sim.now() - sim.bootAt) / 1000)) % 60
  return base - offset
}

const CAP_WORDS = { R: 'Router', T: 'Trans-Bridge', B: 'Source-Route-Bridge', S: 'Switch', H: 'Host', I: 'IGMP', r: 'Repeater', P: 'Phone' }

export function showCdpNeighbors(sim, detail) {
  if (!sim.dev.cdp) return ['% CDP is not enabled']
  const list = cdpNeighbors(sim)
  if (detail) {
    const out = []
    for (const n of list) {
      out.push('-------------------------', `Device ID: ${n.device}`, 'Entry address(es): ')
      if (n.ip) out.push(`  IP address: ${n.ip}`)
      out.push(`Platform: cisco ${n.platform ?? 'unknown'},  Capabilities: ${(n.capability ?? 'R').split(' ').map((c) => CAP_WORDS[c] ?? c).join(' ')} `)
      out.push(`Interface: ${n.port},  Port ID (outgoing port): ${n.remotePort ?? 'unknown'}`)
      out.push(`Holdtime : ${holdtime(sim, n, 180)} sec`, '', 'Version :', neighborVersion(n), 'Technical Support: http://www.cisco.com/techsupport', '', 'advertisement version: 2')
      if (n.trunk) out.push(`Native VLAN: ${n.trunk.native ?? 1}`)
      out.push('Duplex: full', '')
    }
    out.push(`Total cdp entries displayed : ${list.length}`)
    return out
  }
  const out = [
    'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
    '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone, ',
    '                  D - Remote, C - CVTA, M - Two-port Mac Relay ',
    '',
    'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID'
  ]
  for (const n of list) {
    const rest = `${pad(cdpIf(n.port), 18)}${pad(holdtime(sim, n, 180), 11)}${pad(n.capability ?? 'R', 12)}${pad((n.platform ?? '').slice(0, 9), 10)}${n.remotePort ? cdpIf(n.remotePort) : ''}`
    if (n.device.length > 16) out.push(n.device, `${' '.repeat(17)}${rest}`)
    else out.push(`${pad(n.device, 17)}${rest}`)
  }
  out.push('', `Total cdp entries displayed : ${list.length}`)
  return out
}

export function showCdp(sim) {
  if (!sim.dev.cdp) return ['% CDP is not enabled']
  return ['Global CDP information:', '\tSending CDP packets every 60 seconds', '\tSending a holdtime value of 180 seconds', '\tSending CDPv2 advertisements is  enabled']
}

function lldpCap(n) {
  const caps = (n.capability ?? '').split(' ')
  const out = []
  if (caps.includes('R')) out.push('R')
  if (caps.includes('S') || caps.includes('B')) out.push('B')
  if (caps.includes('P')) out.push('T')
  if (!out.length) out.push('S')
  return out.join(',')
}

export function showLldpNeighbors(sim, detail) {
  if (!sim.dev.lldp) return ['% LLDP is not enabled']
  const list = lldpNeighbors(sim)
  if (detail) {
    const out = []
    for (const n of list) {
      out.push('------------------------------------------------', `Local Intf: ${shortIf(n.port)}`, `Chassis id: ${n.mac ?? '0011.2233.4455'}`, `Port id: ${n.remotePort ? shortIf(n.remotePort) : '1'}`, `Port Description: ${n.remotePort ?? 'port 1'}`, `System Name: ${n.device}`, '', 'System Description: ', n.platform ?? '', '', `Time remaining: ${holdtime(sim, n, 120)} seconds`, `System Capabilities: ${lldpCap(n)}`, `Enabled Capabilities: ${lldpCap(n)}`, 'Management Addresses:', n.ip ? `    IP: ${n.ip}` : '    none', '')
    }
    out.push(`Total entries displayed: ${list.length}`)
    return out
  }
  const out = ['Capability codes:', '    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device', '    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other', '', 'Device ID           Local Intf     Hold-time  Capability      Port ID']
  for (const n of list) out.push(`${pad(n.device.slice(0, 19), 20)}${pad(shortIf(n.port), 15)}${pad(holdtime(sim, n, 120), 11)}${pad(lldpCap(n), 16)}${n.remotePort ? shortIf(n.remotePort) : '1'}`)
  out.push('', `Total entries displayed: ${list.length}`)
  return out
}

export function showLldp(sim) {
  if (!sim.dev.lldp) return ['% LLDP is not enabled']
  return ['', 'Global LLDP Information:', '    Status: ACTIVE', '    LLDP advertisements are sent every 30 seconds', '    LLDP hold time advertised is 120 seconds', '    LLDP interface reinitialisation delay is 2 seconds']
}

// ---------- system ----------

export function showVersion(sim) {
  const dev = sim.dev
  const m = modelOf(dev)
  const sw = dev.kind === 'switch'
  return [
    `Cisco IOS Software, ${sw ? 'C2960' : 'C2900'} Software (${m.image}), Version ${m.version}, RELEASE SOFTWARE (fc2)`,
    'Technical Support: http://www.cisco.com/techsupport',
    'Copyright (c) 1986-2021 by Cisco Systems, Inc.',
    '',
    `ROM: ${sw ? 'Bootstrap program is C2960 boot loader' : 'System Bootstrap, Version 15.0(1r)M16, RELEASE SOFTWARE (fc1)'}`,
    '',
    `${dev.hostname} uptime is ${uptimeText(sim)}`,
    'System returned to ROM by power-on',
    `System image file is "${m.file}"`,
    '',
    `cisco ${m.model} ${sw ? '(PowerPC405) processor (revision A0) with 65536K bytes of memory.' : '(revision 1.0) with 491520K/32768K bytes of memory.'}`,
    `${m.ports.length} Gigabit Ethernet interfaces`,
    `${sw ? '64K' : '255K'} bytes of non-volatile configuration memory.`,
    ...(sw ? [`Base ethernet MAC Address       : ${dev.baseMac.replace(/\./g, '').replace(/(..)(?=.)/g, '$1:').toUpperCase()}`, `Model number                    : ${m.model}`] : []),
    '',
    'Configuration register is 0x2102'
  ]
}

export function showClock(sim) {
  return [clockText(sim)]
}

export function showHistory(sim) {
  return sim.history.slice(-10).map((h) => `  ${h}`)
}

export function showUsers() {
  return ['    Line       User       Host(s)              Idle       Location', `*  0 con 0                idle                 00:00:00 `, '', '  Interface    User               Mode         Idle     Peer Address']
}

export function showLogging(sim) {
  const d = sim.dev
  const out = [
    'Syslog logging: enabled (0 messages dropped, 0 messages rate-limited, 0 flushes, 0 overruns, xml disabled, filtering disabled)',
    '',
    '    Console logging: ' + (d.logging.console ? `level debugging, ${sim.logBuf.length} messages logged, xml disabled,` : 'disabled'),
    '                     filtering disabled',
    '    Monitor logging: level debugging, 0 messages logged, xml disabled,',
    '                     filtering disabled',
    `    Buffer logging:  level debugging, ${sim.logBuf.length} messages logged, xml disabled,`,
    '                    filtering disabled',
    '    Exception Logging: size (4096 bytes)',
    '    Count and timestamp logging messages: disabled',
    '    Persistent logging: disabled',
    '',
    'No active filter modules.',
    '',
    `    Trap logging: level ${d.logging.trap ?? 'informational'}, ${sim.logBuf.length} message lines logged`
  ]
  for (const h of d.logging.hosts) out.push(`        Logging to ${h}  (udp port 514, audit disabled,`, '              link up),', `              ${sim.logBuf.length} message lines logged, `, '              0 message lines rate-limited, ', '              0 message lines dropped-by-MD, ', '              xml disabled, sequence number disabled', '              filtering disabled')
  out.push('        Logging Source-Interface:       VRF Name:', '', 'Log Buffer (8192 bytes):', '', ...sim.logBuf.slice(-40))
  return out
}

export function showSnmpCommunity(sim) {
  const out = []
  for (const c of sim.dev.snmp.communities) out.push('', `Community name: ${c.name}`, `Community Index: ${c.name}`, `Community SecurityName: ${c.name}`, 'storage-type: nonvolatile\t active')
  return out
}

export function showSnmpHost(sim) {
  const out = []
  for (const h of sim.dev.snmp.hosts) out.push(`Notification host: ${h.host}\tudp-port: 162\ttype: trap`, `user: ${h.community}\tsecurity model: ${h.version === '2c' ? 'v2c' : h.version === '3' ? 'v3 noauth' : 'v1'}`, '')
  return out
}

export function showSnmp(sim) {
  const s = sim.dev.snmp
  if (!s.communities.length && !s.hosts.length) return ['%SNMP agent not enabled']
  return [`Chassis: ${sim.dev.baseMac}`, ...(s.contact ? [`Contact: ${s.contact}`] : []), ...(s.location ? [`Location: ${s.location}`] : []), '0 SNMP packets input', '0 SNMP packets output', '', s.hosts.length ? `SNMP logging: enabled\n    Logging to ${s.hosts.map((h) => `${h.host}.162`).join(', ')}` : 'SNMP logging: disabled'].flatMap((l) => l.split('\n'))
}

export function showIpSsh(sim) {
  const d = sim.dev
  if (!d.rsaModulus) return ['SSH Disabled - version 1.99', '%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).', 'Authentication methods:publickey,keyboard-interactive,password', 'Authentication Publickey Algorithms:x509v3-ssh-rsa,ssh-rsa', 'Hostkey Algorithms:x509v3-ssh-rsa,ssh-rsa', 'Authentication timeout: 120 secs; Authentication retries: 3', 'Minimum expected Diffie Hellman key size : 1024 bits']
  const ver = d.sshVersion === 2 ? '2.0' : d.sshVersion === 1 ? '1.5' : '1.99'
  return [`SSH Enabled - version ${ver}`, 'Authentication methods:publickey,keyboard-interactive,password', 'Authentication Publickey Algorithms:x509v3-ssh-rsa,ssh-rsa', 'Hostkey Algorithms:x509v3-ssh-rsa,ssh-rsa', 'Authentication timeout: 120 secs; Authentication retries: 3', 'Minimum expected Diffie Hellman key size : 1024 bits', `IOS Keys in SECSH format(ssh-rsa, base64 encoded): ${d.hostname}.${d.domainName}`]
}

export function showArp(sim) {
  const dev = sim.dev
  const out = ['Protocol  Address          Age (min)  Hardware Addr   Type   Interface']
  const rows = []
  for (const n of Object.keys(dev.interfaces)) {
    const i = dev.interfaces[n]
    if (!i.ip || !isUp(sim, n) || i.switchport === true) continue
    rows.push([i.ip, '-', ifMac(dev, n), n])
    for (const nb of neighborsOn(sim, parentIf(n))) {
      if (!nb.ip || !inPrefix(nb.ip, i.ip, maskToPrefix(i.mask))) continue
      if (isSubif(n) && nb.vlan != null && nb.vlan !== i.encap) continue
      if (!sim.op.arp.includes(nb.ip)) continue
      rows.push([nb.ip, '0', nb.mac ?? '0c8f.1a2b.9a01', n])
    }
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1))
  for (const r of rows) out.push(`Internet  ${pad(r[0], 17)}${rpad(r[1], 9)}   ${pad(r[2], 16)}ARPA   ${r[3]}`)
  return out
}

export function compareIfNames(rank) {
  return (a, b) => compareIf(a, b, rank)
}
