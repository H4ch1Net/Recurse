// Guided, auto-graded console labs for the CCNA path. Each lab targets one simulated
// device. The learner types real IOS; every check reads the device state (and the
// simulator's derived state) after each command, so grading is live. Checks never
// change state.
//
// Lab fields:
//   id, topic (Recurse pack id), kind ('build' | 'troubleshoot'), minutes, domainId,
//   title, difficulty, deviceKind, hostname, objective, scenario, symptoms?,
//   topology: [{ device, port, address, link }], brief: [..],
//   startingConfig?: config-mode lines applied (and saved) before the learner starts,
//   env: simulated neighbors (see sim.js), suggestedShow, checks: [{ label, test(dev, sim), hint }],
//   solution: known-good command sequence from the user EXEC prompt, reflection: [..]

import { canonicalIf, maskToPrefix, normIPv6, normIPv6Prefix } from './addr.js'
import { aclEval } from './device.js'
import {
  dhcpBindings,
  etherchannelMembers,
  hsrpGroups,
  isStpRoot,
  isUp,
  lldpNeighbors,
  lookupRoute,
  nativeMismatch,
  natTranslations,
  ntpState,
  ospfNeighbors,
  relayLeases
} from './model.js'

// ---------- check helpers ----------

const ifc = (d, n) => d.interfaces[canonicalIf(n)]

function ifUpWithIp(d, n, ip, len) {
  const i = ifc(d, n)
  return Boolean(i && !i.shutdown && i.ip === ip && maskToPrefix(i.mask ?? '') === len)
}

function hasIp(d, n, ip, len) {
  const i = ifc(d, n)
  return Boolean(i && i.ip === ip && maskToPrefix(i.mask ?? '') === len)
}

function accessPort(d, n, vlan) {
  const i = ifc(d, n)
  return Boolean(i && i.switchport && i.mode !== 'trunk' && i.mode !== 'dynamic desirable' && i.accessVlan === vlan && !i.shutdown)
}

function trunkPort(d, n) {
  const i = ifc(d, n)
  return Boolean(i && i.switchport && i.mode === 'trunk' && !i.shutdown)
}

function allowedIncludes(d, n, vlans) {
  const i = ifc(d, n)
  if (!i) return false
  if (i.allowed == null) return true
  const list = i.allowed.split(',').flatMap((p) => {
    const [a, b] = p.split('-').map(Number)
    return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a]
  })
  return vlans.every((v) => list.includes(v))
}

const hasVlan = (d, id) => d.vlans[id] != null

function hasStatic(d, prefix, mask, nextHop, ad = 1) {
  return d.routes.some((r) => r.prefix === prefix && r.mask === mask && r.nextHop === nextHop && r.ad === ad)
}

function hasV6Static(d, prefix, nextHop) {
  const p = normIPv6Prefix(prefix)
  const nh = normIPv6(nextHop)
  return d.ipv6Routes.some((r) => r.prefix === p && r.nextHop === nh)
}

function hasV6Addr(d, n, prefix) {
  const i = ifc(d, n)
  return Boolean(i && i.ipv6.includes(normIPv6Prefix(prefix)))
}

/** Explicit (not implicit) ACL decision for a packet: 'permit' | 'deny' | null when the ACL is missing. */
function aclSays(d, key, pkt) {
  const acl = d.acls[key]
  if (!acl || !acl.rules.some((r) => r.remark == null)) return null
  const r = aclEval(acl, pkt)
  return r.implicit ? 'implicit-deny' : r.action
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k)
const pinged = (sim, ip) => sim.op.pingOk.includes(ip.includes(':') ? normIPv6(ip) : ip)
const saved = (sim, pred) => Boolean(sim.startup && pred(sim.startup))

// ---------- the labs ----------

/** @type {Array<object>} */
export const CONSOLE_LABS = [
  // ===== Domain 1: network fundamentals =====
  {
    id: 'cl-d1-router-bringup',
    topic: 'ccna-cabling-interfaces',
    kind: 'build',
    minutes: 6,
    domainId: 1,
    title: 'Bring up a router LAN interface',
    difficulty: 'starter',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Name the router, bring its LAN interface online with the right address, prove it with a ping, and save.',
    scenario: 'A brand-new router fresh out of the box. Its G0/0 faces the office LAN and must be reachable at 192.168.1.1/24. PC1 is already cabled and addressed.',
    topology: [
      { device: 'R1', port: 'G0/0', address: '192.168.1.1 /24', link: 'PC1' },
      { device: 'PC1', port: 'eth0', address: '192.168.1.10 /24', link: 'R1 G0/0' }
    ],
    brief: [
      'Set the hostname to R1.',
      'Configure GigabitEthernet0/0 with 192.168.1.1 255.255.255.0.',
      'Bring the interface up. Router ports start administratively down.',
      'Ping PC1 at 192.168.1.10, then save the configuration.'
    ],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', kind: 'host', device: 'PC1', ip: '192.168.1.10', mac: '0050.7966.6801' }]
    },
    suggestedShow: ['show ip interface brief', 'show running-config', 'show startup-config'],
    checks: [
      { label: 'Hostname is R1', test: (d) => d.hostname === 'R1', hint: 'In global config: hostname R1' },
      { label: 'G0/0 has IP 192.168.1.1 /24', test: (d) => hasIp(d, 'gi0/0', '192.168.1.1', 24), hint: 'interface g0/0, then ip address 192.168.1.1 255.255.255.0' },
      { label: 'G0/0 is up (not administratively down)', test: (d) => ifc(d, 'gi0/0')?.shutdown === false, hint: 'Router ports start shut. Under the interface: no shutdown' },
      { label: 'PC1 answers a ping from R1', test: (d, sim) => pinged(sim, '192.168.1.10'), hint: 'From privileged EXEC (or with do): ping 192.168.1.10' },
      { label: 'The configuration is saved', test: (d, sim) => saved(sim, (s) => s.hostname === 'R1' && s.interfaces['GigabitEthernet0/0']?.ip === '192.168.1.1'), hint: 'From privileged EXEC: copy running-config startup-config (or write memory)' }
    ],
    solution: ['enable', 'configure terminal', 'hostname R1', 'interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'end', 'ping 192.168.1.10', 'write memory'],
    reflection: [
      'Why does a router interface start administratively down while a switch port does not?',
      'What would show ip interface brief look like if you forgot no shutdown?',
      'What happens to your work if the router reloads before you save it?'
    ]
  },
  {
    id: 'cl-d1-ipv6',
    topic: 'ccna-ipv6',
    kind: 'build',
    minutes: 6,
    domainId: 1,
    title: 'IPv6 addressing on a router link',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Turn on IPv6 routing, give the link a global unicast address, and reach R2 over IPv6.',
    scenario: 'R1 G0/0 is a point-to-point link to R2. R2 is already configured with 2001:db8:0:12::2/64. R1 should use 2001:db8:0:12::1/64.',
    topology: [
      { device: 'R1', port: 'G0/0', address: '2001:DB8:0:12::1 /64', link: 'R2 G0/0' },
      { device: 'R2', port: 'G0/0', address: '2001:DB8:0:12::2 /64', link: 'R1 G0/0' }
    ],
    brief: [
      'Enable IPv6 routing (it is off by default).',
      'On G0/0, add the global address 2001:db8:0:12::1/64.',
      'Bring the interface up and ping R2 at 2001:db8:0:12::2.'
    ],
    startingConfig: ['hostname R1'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', device: 'R2', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ipv6: '2001:DB8:0:12::2' }]
    },
    suggestedShow: ['show ipv6 interface brief', 'show ipv6 route', 'show running-config'],
    checks: [
      { label: 'IPv6 unicast routing is enabled', test: (d) => d.ipv6Routing, hint: 'Global config: ipv6 unicast-routing' },
      { label: 'G0/0 has 2001:DB8:0:12::1/64', test: (d) => hasV6Addr(d, 'gi0/0', '2001:db8:0:12::1/64'), hint: 'interface g0/0, then ipv6 address 2001:db8:0:12::1/64' },
      { label: 'G0/0 is up', test: (d) => ifc(d, 'gi0/0')?.shutdown === false, hint: 'no shutdown under the interface' },
      { label: 'R2 answers an IPv6 ping', test: (d, sim) => pinged(sim, '2001:db8:0:12::2'), hint: 'ping 2001:db8:0:12::2' }
    ],
    solution: ['enable', 'configure terminal', 'ipv6 unicast-routing', 'interface g0/0', 'ipv6 address 2001:db8:0:12::1/64', 'no shutdown', 'end', 'ping 2001:db8:0:12::2'],
    reflection: [
      'How does the /64 split this address into a network prefix and an interface ID?',
      'show ipv6 interface brief also lists an FE80:: address you never typed. Where did it come from and what is it for?'
    ]
  },

  // ===== Domain 2: network access =====
  {
    id: 'cl-d2-vlans',
    topic: 'ccna-vlans',
    kind: 'build',
    minutes: 8,
    domainId: 2,
    title: 'Create VLANs and assign access ports',
    difficulty: 'core',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Create two VLANs and drop the right access ports into each.',
    scenario: 'SW1 serves two groups that must sit in separate broadcast domains: Sales in VLAN 10 on G0/1 and Engineering in VLAN 20 on G0/2.',
    topology: [
      { device: 'SW1', port: 'G0/1', address: 'VLAN 10', link: 'PC1 10.0.10.11 /24' },
      { device: 'SW1', port: 'G0/2', address: 'VLAN 20', link: 'PC2 10.0.20.12 /24' }
    ],
    brief: [
      'Create VLAN 10 named SALES and VLAN 20 named ENG.',
      'Make G0/1 an access port in VLAN 10.',
      'Make G0/2 an access port in VLAN 20.'
    ],
    startingConfig: ['hostname SW1'],
    env: {
      connected: ['Gi0/1', 'Gi0/2'],
      neighbors: [
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' },
        { port: 'Gi0/2', kind: 'host', device: 'PC2', ip: '10.0.20.12', mac: '0050.7966.6802' }
      ]
    },
    suggestedShow: ['show vlan brief', 'show interfaces status', 'show interfaces g0/1 switchport'],
    checks: [
      { label: 'VLAN 10 exists', test: (d) => hasVlan(d, 10), hint: 'Global config: vlan 10' },
      { label: 'VLAN 10 is named SALES', test: (d) => d.vlans[10] === 'SALES', hint: 'Inside vlan 10: name SALES' },
      { label: 'VLAN 20 exists and is named ENG', test: (d) => d.vlans[20] === 'ENG', hint: 'vlan 20, then name ENG' },
      { label: 'G0/1 is an access port in VLAN 10', test: (d) => accessPort(d, 'gi0/1', 10), hint: 'interface g0/1, switchport mode access, switchport access vlan 10' },
      { label: 'G0/2 is an access port in VLAN 20', test: (d) => accessPort(d, 'gi0/2', 20), hint: 'interface g0/2, switchport mode access, switchport access vlan 20' }
    ],
    solution: ['enable', 'configure terminal', 'vlan 10', 'name SALES', 'vlan 20', 'name ENG', 'interface g0/1', 'switchport mode access', 'switchport access vlan 10', 'interface g0/2', 'switchport mode access', 'switchport access vlan 20', 'end', 'show vlan brief'],
    reflection: [
      'Two PCs in VLAN 10 on the same switch can talk. Why can a PC in VLAN 10 not reach one in VLAN 20 without a router?',
      'Why is it good practice to set switchport mode access instead of leaving the port on its default DTP mode?'
    ]
  },
  {
    id: 'cl-d2-trunk',
    topic: 'ccna-trunking',
    kind: 'build',
    minutes: 8,
    domainId: 2,
    title: 'Configure an 802.1Q trunk',
    difficulty: 'core',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Turn the switch-to-switch link into a trunk that carries VLANs 10 and 20 with native VLAN 99.',
    scenario: 'G0/24 connects SW1 to SW2. SW2 is already configured as a trunk with native VLAN 99, allowing 10, 20 and 99. Until SW1 matches, CDP will complain about a native VLAN mismatch.',
    topology: [
      { device: 'SW1', port: 'G0/24', address: 'Trunk, native 99', link: 'SW2 G0/24' },
      { device: 'SW2', port: 'G0/24', address: 'Trunk, native 99, allows 10,20,99', link: 'SW1 G0/24' }
    ],
    brief: [
      'Create VLAN 99 (VLANs 10 and 20 already exist).',
      'Set G0/24 to trunk mode.',
      'Set the trunk native VLAN to 99.',
      'Allow only VLANs 10, 20 and 99 on the trunk.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'name SALES', 'vlan 20', 'name ENG', 'exit'],
    env: {
      connected: ['Gi0/24'],
      neighbors: [
        { port: 'Gi0/24', device: 'SW2', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I', trunk: { mode: 'trunk', native: 99, allowed: '10,20,99' }, stp: { priority: 32768, mac: '0019.e86a.9a00' } }
      ]
    },
    suggestedShow: ['show interfaces trunk', 'show vlan brief', 'show interfaces g0/24 switchport'],
    checks: [
      { label: 'VLANs 10, 20 and 99 exist', test: (d) => hasVlan(d, 10) && hasVlan(d, 20) && hasVlan(d, 99), hint: 'vlan 99 (10 and 20 are already there)' },
      { label: 'G0/24 is a trunk', test: (d) => trunkPort(d, 'gi0/24'), hint: 'interface g0/24, switchport mode trunk' },
      { label: 'Native VLAN on G0/24 is 99', test: (d) => ifc(d, 'gi0/24')?.nativeVlan === 99, hint: 'Under the trunk: switchport trunk native vlan 99' },
      { label: 'Trunk allows only 10, 20 and 99', test: (d) => ifc(d, 'gi0/24')?.allowed === '10,20,99', hint: 'switchport trunk allowed vlan 10,20,99' },
      { label: 'No native VLAN mismatch with SW2', test: (d, sim) => trunkPort(d, 'gi0/24') && !nativeMismatch(sim, 'GigabitEthernet0/24'), hint: 'Both ends of a trunk must agree on the native VLAN. SW2 uses 99.' }
    ],
    solution: ['enable', 'configure terminal', 'vlan 99', 'name NATIVE', 'interface g0/24', 'switchport mode trunk', 'switchport trunk native vlan 99', 'switchport trunk allowed vlan 10,20,99', 'end', 'show interfaces trunk'],
    reflection: [
      'What actually gets added to a frame as it crosses an 802.1Q trunk, and what happens to native VLAN frames?',
      'A native VLAN mismatch on the two ends: what breaks, and where did you see it here?'
    ]
  },
  {
    id: 'cl-d2-etherchannel',
    topic: 'ccna-etherchannel',
    kind: 'build',
    minutes: 7,
    domainId: 2,
    title: 'Bundle two links with LACP EtherChannel',
    difficulty: 'core',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Combine G0/1 and G0/2 into one logical link that negotiates with LACP.',
    scenario: 'Two parallel links run to SW2. SW2 already has both ports in an LACP channel in passive mode. You want one 2-link bundle instead of a link that STP blocks.',
    topology: [
      { device: 'SW1', port: 'G0/1', address: 'Channel member', link: 'SW2 G0/1' },
      { device: 'SW1', port: 'G0/2', address: 'Channel member', link: 'SW2 G0/2' }
    ],
    brief: [
      'Select both G0/1 and G0/2 together with interface range.',
      'Put them in channel-group 1 using LACP. SW2 is passive, so SW1 must actively negotiate.',
      'Verify Po1 is in use with both ports bundled.'
    ],
    startingConfig: ['hostname SW1'],
    env: {
      connected: ['Gi0/1', 'Gi0/2'],
      neighbors: [
        { port: 'Gi0/1', device: 'SW2', remotePort: 'GigabitEthernet0/1', platform: 'WS-C2960G-24TC-L', capability: 'S I', channel: 'passive', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.9a00' } },
        { port: 'Gi0/2', device: 'SW2', remotePort: 'GigabitEthernet0/2', platform: 'WS-C2960G-24TC-L', capability: 'S I', channel: 'passive', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.9a00' } }
      ]
    },
    suggestedShow: ['show etherchannel summary', 'show interfaces trunk', 'show running-config'],
    checks: [
      { label: 'G0/1 is in channel-group 1, mode active', test: (d) => ifc(d, 'gi0/1')?.channelGroup?.id === 1 && ifc(d, 'gi0/1')?.channelGroup?.mode === 'active', hint: 'interface range g0/1 - 2, then channel-group 1 mode active' },
      { label: 'G0/2 is in channel-group 1, mode active', test: (d) => ifc(d, 'gi0/2')?.channelGroup?.id === 1 && ifc(d, 'gi0/2')?.channelGroup?.mode === 'active', hint: 'Both ports need the same channel-group and mode.' },
      { label: 'Port-channel 1 is up with both ports bundled', test: (d, sim) => { const m = etherchannelMembers(sim, 1); return m.length === 2 && m.every((x) => x.flag === 'P') }, hint: 'Passive on one end needs active on the other. Check show etherchannel summary for (P) on both ports.' }
    ],
    solution: ['enable', 'configure terminal', 'interface range g0/1 - 2', 'channel-group 1 mode active', 'end', 'show etherchannel summary'],
    reflection: [
      'Why does spanning tree treat the bundle as a single link instead of blocking one member?',
      'Which LACP mode pairs form a channel: active/active, active/passive, passive/passive?'
    ]
  },
  {
    id: 'cl-d2-stp',
    topic: 'ccna-stp',
    kind: 'build',
    minutes: 9,
    domainId: 2,
    title: 'Set the STP root and protect edge ports',
    difficulty: 'core',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Make SW1 the root bridge for VLANs 1, 10 and 20, and harden the access port on G0/1.',
    scenario: 'Three switches form a triangle. Right now SW2 wins the root election because it has the lowest MAC address. SW1 sits in the core, so it should be root. G0/1 connects a single PC that should forward instantly but drop any switch someone plugs in.',
    topology: [
      { device: 'SW1', port: 'G0/23', address: 'Trunk', link: 'SW2 G0/23' },
      { device: 'SW1', port: 'G0/24', address: 'Trunk', link: 'SW3 G0/23' },
      { device: 'SW1', port: 'G0/1', address: 'Access VLAN 10', link: 'PC1' }
    ],
    brief: [
      'Check show spanning-tree vlan 10: who is root now?',
      'Make SW1 the primary root for VLANs 1, 10 and 20.',
      'On access port G0/1, enable PortFast and BPDU guard.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'vlan 20', 'exit', 'interface range g0/23 - 24', 'switchport mode trunk', 'interface g0/1', 'switchport mode access', 'switchport access vlan 10'],
    env: {
      connected: ['Gi0/1', 'Gi0/23', 'Gi0/24'],
      neighbors: [
        { port: 'Gi0/23', device: 'SW2', remotePort: 'GigabitEthernet0/23', platform: 'WS-C2960G-24TC-L', capability: 'S I', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.1200' } },
        { port: 'Gi0/24', device: 'SW3', remotePort: 'GigabitEthernet0/23', platform: 'WS-C2960G-24TC-L', capability: 'S I', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.b400' } },
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' }
      ]
    },
    suggestedShow: ['show spanning-tree vlan 10', 'show spanning-tree', 'show running-config'],
    checks: [
      { label: 'SW1 is the root bridge for VLAN 1', test: (d, sim) => isStpRoot(sim, 1), hint: 'spanning-tree vlan 1,10,20 root primary' },
      { label: 'SW1 is the root bridge for VLANs 10 and 20', test: (d, sim) => isStpRoot(sim, 10) && isStpRoot(sim, 20), hint: 'One command covers a VLAN list: spanning-tree vlan 1,10,20 root primary' },
      { label: 'G0/1 has PortFast', test: (d) => ifc(d, 'gi0/1')?.portfast === 'enable', hint: 'interface g0/1, spanning-tree portfast' },
      { label: 'G0/1 has BPDU guard', test: (d) => ifc(d, 'gi0/1')?.bpduguard === 'enable', hint: 'spanning-tree bpduguard enable' }
    ],
    solution: ['enable', 'show spanning-tree vlan 10', 'configure terminal', 'spanning-tree vlan 1,10,20 root primary', 'interface g0/1', 'spanning-tree portfast', 'spanning-tree bpduguard enable', 'end', 'show spanning-tree vlan 10'],
    reflection: [
      'How does root primary win the election, and what priority did it actually write into the running config?',
      'What does BPDU guard do if a switch is plugged into that PortFast port?'
    ]
  },
  {
    id: 'cl-d2-cdp-lldp',
    topic: 'ccna-cdp-lldp',
    kind: 'build',
    minutes: 7,
    domainId: 2,
    title: 'Discover neighbors with CDP and LLDP',
    difficulty: 'core',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Use CDP to map your neighbors, turn on LLDP to see a non-Cisco switch, and stop CDP leaking details on an edge port.',
    scenario: 'SW1 has three neighbors: SW2 (Cisco) on G0/24, ACCESS-SW3 (another vendor, LLDP only) on G0/23, and a contractor router on G0/1. You do not control that contractor network, so CDP should not advertise your platform and IOS version there.',
    topology: [
      { device: 'SW1', port: 'G0/24', address: 'Trunk', link: 'SW2 G0/24 (Cisco)' },
      { device: 'SW1', port: 'G0/23', address: 'Trunk', link: 'ACCESS-SW3 port 1 (LLDP only)' },
      { device: 'SW1', port: 'G0/1', address: 'Access', link: 'CONTRACTOR-R1 G0/0' }
    ],
    brief: [
      'Look at show cdp neighbors. Which neighbor is missing?',
      'Enable LLDP globally and confirm ACCESS-SW3 appears in show lldp neighbors.',
      'Disable CDP on G0/1 only. Keep CDP running everywhere else.'
    ],
    startingConfig: ['hostname SW1', 'interface range g0/23 - 24', 'switchport mode trunk'],
    env: {
      connected: ['Gi0/1', 'Gi0/23', 'Gi0/24'],
      neighbors: [
        { port: 'Gi0/24', device: 'SW2', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I', lldp: true, ip: '10.0.0.2', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.9a00' } },
        { port: 'Gi0/23', device: 'ACCESS-SW3', remotePort: '1', platform: 'Generic L2 switch', capability: 'B', cdp: false, lldp: true, ip: '10.0.0.3', trunk: { mode: 'trunk', native: 1 } },
        { port: 'Gi0/1', device: 'CONTRACTOR-R1', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', lldp: false, ip: '172.16.5.1' }
      ]
    },
    suggestedShow: ['show cdp neighbors', 'show lldp neighbors', 'show cdp neighbors detail', 'show lldp'],
    checks: [
      { label: 'LLDP is enabled globally', test: (d) => d.lldp, hint: 'Global config: lldp run' },
      { label: 'ACCESS-SW3 shows up as an LLDP neighbor', test: (d, sim) => lldpNeighbors(sim).some((n) => n.device === 'ACCESS-SW3'), hint: 'LLDP is off by default on Cisco IOS. After lldp run, check show lldp neighbors.' },
      { label: 'CDP is disabled on G0/1', test: (d) => ifc(d, 'gi0/1')?.cdp === false, hint: 'interface g0/1, then no cdp enable' },
      { label: 'CDP still runs on the rest of the switch', test: (d) => d.cdp && ifc(d, 'gi0/24')?.cdp === true, hint: 'Use no cdp enable on the interface, not no cdp run, which turns CDP off everywhere.' }
    ],
    solution: ['enable', 'show cdp neighbors', 'configure terminal', 'lldp run', 'interface g0/1', 'no cdp enable', 'end', 'show cdp neighbors', 'show lldp neighbors'],
    reflection: [
      'CDP is Cisco proprietary and LLDP is IEEE 802.1AB. When would you need LLDP even in a mostly Cisco network?',
      'What could someone on the contractor network learn about SW1 from CDP?'
    ]
  },
  {
    id: 'cl-d2-troubleshoot-vlan',
    topic: 'ccna-vlans',
    kind: 'troubleshoot',
    minutes: 8,
    domainId: 2,
    title: 'Troubleshoot: PC in the wrong VLAN',
    difficulty: 'challenge',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'The PC on G0/1 should be in VLAN 10 but cannot reach its VLAN 10 neighbors. Find and fix it.',
    scenario: 'Someone configured G0/1 before you. VLAN 10 (SALES) exists and the port is up/up, but the user on it is isolated.',
    symptoms: ['PC1 on G0/1 cannot ping other Sales hosts in VLAN 10.', 'The link light is green: G0/1 shows connected.', 'Other Sales PCs can reach each other.'],
    topology: [
      { device: 'SW1', port: 'G0/1', address: 'Should be VLAN 10', link: 'PC1 10.0.10.11 /24' },
      { device: 'SW1', port: 'G0/3', address: 'VLAN 10', link: 'PC3 10.0.10.13 /24' }
    ],
    brief: [
      'Investigate first with show vlan brief and show interfaces status.',
      'The port must end up as an access port in VLAN 10.',
      'Do not create new VLANs; fix the port.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'name SALES', 'vlan 99', 'name PARKING', 'exit', 'interface g0/1', 'switchport mode access', 'switchport access vlan 99', 'interface g0/3', 'switchport mode access', 'switchport access vlan 10'],
    env: {
      connected: ['Gi0/1', 'Gi0/3'],
      neighbors: [
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' },
        { port: 'Gi0/3', kind: 'host', device: 'PC3', ip: '10.0.10.13', mac: '0050.7966.6803' }
      ]
    },
    suggestedShow: ['show vlan brief', 'show interfaces status', 'show running-config interface g0/1'],
    checks: [
      { label: 'G0/1 is now an access port in VLAN 10', test: (d) => accessPort(d, 'gi0/1', 10), hint: 'show vlan brief lists Gi0/1 under VLAN 99. interface g0/1, then switchport access vlan 10' },
      { label: 'G0/1 is still up', test: (d) => ifc(d, 'gi0/1')?.shutdown === false, hint: 'If you shut it while testing, no shutdown it again.' },
      { label: 'No new VLANs were created', test: (d) => Object.keys(d.vlans).every((v) => ['1', '10', '99'].includes(v)), hint: 'The fix is on the port. Remove any VLAN you added with no vlan <id>.' }
    ],
    solution: ['enable', 'show vlan brief', 'configure terminal', 'interface g0/1', 'switchport access vlan 10', 'end', 'show vlan brief'],
    reflection: [
      'How did show vlan brief reveal the fault? What did you look for?',
      'Why does putting the port in the wrong VLAN isolate the host even though the link is up/up?'
    ]
  },
  {
    id: 'cl-ts-trunk',
    topic: 'ccna-trunking',
    kind: 'troubleshoot',
    minutes: 10,
    domainId: 2,
    title: 'Troubleshoot: VLAN 10 cannot cross the trunk',
    difficulty: 'challenge',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Hosts in VLAN 10 on SW1 cannot reach VLAN 10 hosts on SW2, and the console keeps logging a CDP warning. Find both faults on the trunk and fix them.',
    scenario: 'SW1 G0/24 trunks to SW2 G0/24. SW2 is correct: native VLAN 99, allowing VLANs 10, 20 and 99. VLAN 20 works across the link. VLAN 10 does not.',
    symptoms: ['PC1 (VLAN 10, SW1) cannot ping PC2 (VLAN 10, SW2).', 'VLAN 20 hosts can reach each other across the switches.', 'SW1 logs %CDP-4-NATIVE_VLAN_MISMATCH messages.'],
    topology: [
      { device: 'SW1', port: 'G0/24', address: 'Trunk', link: 'SW2 G0/24' },
      { device: 'SW2', port: 'G0/24', address: 'Trunk, native 99, allows 10,20,99', link: 'SW1 G0/24' },
      { device: 'SW1', port: 'G0/1', address: 'VLAN 10', link: 'PC1' },
      { device: 'SW1', port: 'G0/2', address: 'VLAN 20', link: 'PC3' }
    ],
    brief: [
      'Start with show interfaces trunk and compare it with what SW2 uses.',
      'Make the native VLAN match SW2.',
      'Get VLAN 10 back onto the trunk without removing 20 or 99.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'name SALES', 'vlan 20', 'name ENG', 'vlan 99', 'name NATIVE', 'exit', 'interface g0/1', 'switchport mode access', 'switchport access vlan 10', 'interface g0/2', 'switchport mode access', 'switchport access vlan 20', 'interface g0/24', 'switchport mode trunk', 'switchport trunk allowed vlan 20,99'],
    env: {
      connected: ['Gi0/1', 'Gi0/2', 'Gi0/24'],
      neighbors: [
        { port: 'Gi0/24', device: 'SW2', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I', trunk: { mode: 'trunk', native: 99, allowed: '10,20,99' }, stp: { priority: 32768, mac: '0019.e86a.9a00' } },
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' },
        { port: 'Gi0/2', kind: 'host', device: 'PC3', ip: '10.0.20.13', mac: '0050.7966.6803' }
      ]
    },
    suggestedShow: ['show interfaces trunk', 'show interfaces g0/24 switchport', 'show cdp neighbors detail'],
    checks: [
      { label: 'G0/24 is still a trunk', test: (d) => trunkPort(d, 'gi0/24'), hint: 'Keep switchport mode trunk on G0/24.' },
      { label: 'Native VLAN matches SW2 (99)', test: (d, sim) => ifc(d, 'gi0/24')?.nativeVlan === 99 && !nativeMismatch(sim, 'GigabitEthernet0/24'), hint: 'show interfaces trunk shows native vlan 1 on SW1. Fix: switchport trunk native vlan 99' },
      { label: 'The trunk carries VLANs 10, 20 and 99', test: (d) => allowedIncludes(d, 'gi0/24', [10, 20, 99]), hint: 'VLAN 10 was pruned from the allowed list. Add it back: switchport trunk allowed vlan add 10' }
    ],
    solution: ['enable', 'show interfaces trunk', 'configure terminal', 'interface g0/24', 'switchport trunk native vlan 99', 'switchport trunk allowed vlan add 10', 'end', 'show interfaces trunk'],
    reflection: [
      'Which column of show interfaces trunk proved VLAN 10 was the problem?',
      'Why is switchport trunk allowed vlan add safer than retyping the whole list?',
      'How did CDP help you find the native VLAN mismatch?'
    ]
  },

  // ===== Domain 3: IP connectivity =====
  {
    id: 'cl-d3-static',
    topic: 'ccna-static-routing',
    kind: 'build',
    minutes: 7,
    domainId: 3,
    title: 'Static and default routes',
    difficulty: 'starter',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Reach a remote LAN with a static route and everything else with a default route.',
    scenario: 'R1 links to R2 on 10.0.0.0/30, with R2 at 10.0.0.2. The remote LAN 192.168.2.0/24 sits behind R2, and R2 is also the way to the internet.',
    topology: [
      { device: 'R1', port: 'G0/0', address: '10.0.0.1 /30', link: 'R2 G0/0 (10.0.0.2)' },
      { device: 'R2', port: 'G0/1', address: '192.168.2.1 /24', link: 'Remote LAN' }
    ],
    brief: [
      'Address G0/0 as 10.0.0.1/30 and bring it up.',
      'Add a static route to 192.168.2.0/24 via 10.0.0.2.',
      'Add a default route (0.0.0.0/0) via 10.0.0.2.',
      'Ping a host on the remote LAN, 192.168.2.10.'
    ],
    startingConfig: ['hostname R1'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', device: 'R2', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.0.2', behind: ['192.168.2.0/24', '0.0.0.0/0'] }]
    },
    suggestedShow: ['show ip route', 'show ip interface brief', 'show running-config'],
    checks: [
      { label: 'G0/0 is 10.0.0.1 /30 and up', test: (d) => ifUpWithIp(d, 'gi0/0', '10.0.0.1', 30), hint: 'interface g0/0, ip address 10.0.0.1 255.255.255.252, no shutdown' },
      { label: 'Static route to 192.168.2.0/24 via 10.0.0.2', test: (d) => hasStatic(d, '192.168.2.0', '255.255.255.0', '10.0.0.2'), hint: 'ip route 192.168.2.0 255.255.255.0 10.0.0.2' },
      { label: 'Default route via 10.0.0.2', test: (d) => hasStatic(d, '0.0.0.0', '0.0.0.0', '10.0.0.2'), hint: 'ip route 0.0.0.0 0.0.0.0 10.0.0.2' },
      { label: 'A ping to 192.168.2.10 succeeds', test: (d, sim) => pinged(sim, '192.168.2.10'), hint: 'ping 192.168.2.10 (with do in front if you are still in config mode)' }
    ],
    solution: ['enable', 'configure terminal', 'interface g0/0', 'ip address 10.0.0.1 255.255.255.252', 'no shutdown', 'exit', 'ip route 192.168.2.0 255.255.255.0 10.0.0.2', 'ip route 0.0.0.0 0.0.0.0 10.0.0.2', 'end', 'show ip route', 'ping 192.168.2.10'],
    reflection: [
      'How does the router choose between the /24 static route and the 0.0.0.0/0 default route for a packet to 192.168.2.10?',
      'What does "Gateway of last resort" in show ip route tell you?'
    ]
  },
  {
    id: 'cl-d3-floating',
    topic: 'ccna-static-routing',
    kind: 'build',
    minutes: 7,
    domainId: 3,
    title: 'Floating static backup route',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Install a backup static route that only takes over when the primary path fails, using administrative distance.',
    scenario: 'R1 reaches 192.168.2.0/24 through a primary link to R2 (next hop 10.0.12.2) and a slower backup link (next hop 10.0.13.2). Both links are already addressed and up.',
    topology: [
      { device: 'R1', port: 'G0/1', address: '10.0.12.1 /30', link: 'R2 G0/1 (primary)' },
      { device: 'R1', port: 'G0/2', address: '10.0.13.1 /30', link: 'R2 G0/2 (backup)' },
      { device: 'R2', port: 'G0/0', address: '192.168.2.1 /24', link: 'Remote LAN' }
    ],
    brief: [
      'Add the primary route to 192.168.2.0/24 via 10.0.12.2 (default AD 1).',
      'Add a floating backup to the same network via 10.0.13.2 with AD 200.',
      'Optional: shut G0/1, look at show ip route, then bring it back.'
    ],
    startingConfig: ['hostname R1', 'interface g0/1', 'ip address 10.0.12.1 255.255.255.252', 'no shutdown', 'interface g0/2', 'ip address 10.0.13.1 255.255.255.252', 'no shutdown'],
    env: {
      connected: ['Gi0/1', 'Gi0/2'],
      neighbors: [
        { port: 'Gi0/1', device: 'R2', remotePort: 'GigabitEthernet0/1', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.12.2', behind: ['192.168.2.0/24'] },
        { port: 'Gi0/2', device: 'R2', remotePort: 'GigabitEthernet0/2', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.13.2', behind: ['192.168.2.0/24'] }
      ]
    },
    suggestedShow: ['show ip route', 'show ip route static', 'show running-config | include ip route'],
    checks: [
      { label: 'Primary route via 10.0.12.2 exists', test: (d) => hasStatic(d, '192.168.2.0', '255.255.255.0', '10.0.12.2'), hint: 'ip route 192.168.2.0 255.255.255.0 10.0.12.2' },
      { label: 'Floating backup via 10.0.13.2 with AD 200', test: (d) => hasStatic(d, '192.168.2.0', '255.255.255.0', '10.0.13.2', 200), hint: 'ip route 192.168.2.0 255.255.255.0 10.0.13.2 200' },
      { label: 'Traffic uses the primary path while it is up', test: (d, sim) => { const r = lookupRoute(sim, '192.168.2.10'); return Boolean(r && r.ad === 1 && r.paths.every((p) => p.nh === '10.0.12.2')) }, hint: 'Both routes with the same AD would load-share. The backup needs the higher AD.' }
    ],
    solution: ['enable', 'configure terminal', 'ip route 192.168.2.0 255.255.255.0 10.0.12.2', 'ip route 192.168.2.0 255.255.255.0 10.0.13.2 200', 'end', 'show ip route static'],
    reflection: [
      'Why does the backup stay out of the routing table while the primary is up?',
      'What would happen if you set the backup AD to 1 instead of 200?'
    ]
  },
  {
    id: 'cl-d3-ipv6-static',
    topic: 'ccna-static-routing',
    kind: 'build',
    minutes: 12,
    domainId: 3,
    title: 'IPv6 static, default, host and floating routes',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Turn on IPv6 routing and build every kind of IPv6 static route: a network route, a default route with a link-local next hop, a /128 host route and a floating backup.',
    scenario: 'R1 links to R2 twice: G0/0 is the primary link (2001:db8:0:12::/64) and G0/2 is a slower backup (2001:db8:0:13::/64). R2 owns the remote LAN 2001:db8:0:2::/64, a server at 2001:db8:0:99::1, and the path to the IPv6 internet. All interfaces are already addressed.',
    topology: [
      { device: 'R1', port: 'G0/0', address: '2001:DB8:0:12::1 /64', link: 'R2 G0/0, 2001:DB8:0:12::2 (FE80::2)' },
      { device: 'R1', port: 'G0/2', address: '2001:DB8:0:13::1 /64', link: 'R2 G0/2, 2001:DB8:0:13::2 (backup)' },
      { device: 'R1', port: 'G0/1', address: '2001:DB8:0:1::1 /64', link: 'Local LAN' },
      { device: 'R2', port: '-', address: '2001:DB8:0:2::/64, server 2001:DB8:0:99::1', link: 'Remote LAN and server' }
    ],
    brief: [
      'Enable IPv6 unicast routing.',
      'Route 2001:db8:0:2::/64 via R2 global address 2001:db8:0:12::2.',
      'Add a floating backup for 2001:db8:0:2::/64 via 2001:db8:0:13::2 with AD 200.',
      'Add a default route ::/0 out G0/0 using R2 link-local address FE80::2.',
      'Add a /128 host route to the server 2001:db8:0:99::1 via 2001:db8:0:12::2.',
      'Verify with show ipv6 route static, then ping 2001:db8:0:2::10.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ipv6 address 2001:db8:0:12::1/64', 'no shutdown', 'interface g0/1', 'ipv6 address 2001:db8:0:1::1/64', 'no shutdown', 'interface g0/2', 'ipv6 address 2001:db8:0:13::1/64', 'no shutdown'],
    env: {
      connected: ['Gi0/0', 'Gi0/1', 'Gi0/2'],
      neighbors: [
        { port: 'Gi0/0', device: 'R2', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ipv6: '2001:DB8:0:12::2', ipv6LinkLocal: 'FE80::2', behind6: ['2001:DB8:0:2::/64', '2001:DB8:0:99::1/128', '::/0'] },
        { port: 'Gi0/2', device: 'R2', remotePort: 'GigabitEthernet0/2', platform: 'CISCO2911/K9', capability: 'R B S I', ipv6: '2001:DB8:0:13::2', ipv6LinkLocal: 'FE80::2', behind6: ['2001:DB8:0:2::/64'] },
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ipv6: '2001:DB8:0:1::10', mac: '0050.7966.6801' }
      ]
    },
    suggestedShow: ['show ipv6 route static', 'show ipv6 route', 'show ipv6 interface brief', 'show running-config | include ipv6 route'],
    checks: [
      { label: 'IPv6 unicast routing is enabled', test: (d) => d.ipv6Routing, hint: 'Global config: ipv6 unicast-routing' },
      { label: 'Static route to 2001:DB8:0:2::/64 via 2001:DB8:0:12::2', test: (d) => hasV6Static(d, '2001:db8:0:2::/64', '2001:db8:0:12::2'), hint: 'ipv6 route 2001:db8:0:2::/64 2001:db8:0:12::2' },
      { label: 'Floating backup via 2001:DB8:0:13::2 with AD 200', test: (d) => d.ipv6Routes.some((r) => r.prefix === '2001:DB8:0:2::/64' && r.nextHop === '2001:DB8:0:13::2' && r.ad === 200), hint: 'ipv6 route 2001:db8:0:2::/64 2001:db8:0:13::2 200' },
      { label: 'Default route ::/0 out G0/0 via link-local FE80::2', test: (d) => d.ipv6Routes.some((r) => r.prefix === '::/0' && r.iface === 'GigabitEthernet0/0' && r.nextHop === 'FE80::2'), hint: 'A link-local next hop needs the exit interface: ipv6 route ::/0 g0/0 fe80::2' },
      { label: 'Host route 2001:DB8:0:99::1/128 via R2', test: (d) => hasV6Static(d, '2001:db8:0:99::1/128', '2001:db8:0:12::2'), hint: 'ipv6 route 2001:db8:0:99::1/128 2001:db8:0:12::2' },
      { label: 'A ping to 2001:DB8:0:2::10 succeeds', test: (d, sim) => pinged(sim, '2001:db8:0:2::10'), hint: 'ping 2001:db8:0:2::10' }
    ],
    solution: ['enable', 'configure terminal', 'ipv6 unicast-routing', 'ipv6 route 2001:db8:0:2::/64 2001:db8:0:12::2', 'ipv6 route 2001:db8:0:2::/64 2001:db8:0:13::2 200', 'ipv6 route ::/0 g0/0 fe80::2', 'ipv6 route 2001:db8:0:99::1/128 2001:db8:0:12::2', 'end', 'show ipv6 route static', 'ping 2001:db8:0:2::10'],
    reflection: [
      'Why does a link-local next hop need an exit interface, while a global next hop does not?',
      'show ipv6 route static lists only one route to 2001:DB8:0:2::/64. Where is the floating one, and when would it appear?',
      'The IPv6 default route is written ::/0. How does that compare with 0.0.0.0 0.0.0.0 in IPv4?'
    ]
  },
  {
    id: 'cl-d3-ospf',
    topic: 'ccna-ospf',
    kind: 'build',
    minutes: 10,
    domainId: 3,
    title: 'OSPF single area',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Enable OSPF process 1, advertise both of R1 networks into area 0, and form an adjacency with R2.',
    scenario: 'R1 G0/0 (10.0.0.1/30) links to R2, which already runs OSPF in area 0 with router ID 2.2.2.2 and advertises its LAN 192.168.2.0/24. R1 G0/1 (192.168.1.1/24) is the local LAN.',
    topology: [
      { device: 'R1', port: 'G0/0', address: '10.0.0.1 /30', link: 'R2 G0/0 (10.0.0.2)' },
      { device: 'R1', port: 'G0/1', address: '192.168.1.1 /24', link: 'LAN' },
      { device: 'R2', port: 'G0/1', address: '192.168.2.1 /24', link: 'R2 LAN' }
    ],
    brief: [
      'Address and enable G0/0 (10.0.0.1/30) and G0/1 (192.168.1.1/24).',
      'Start OSPF process 1.',
      'Advertise 10.0.0.0/30 and 192.168.1.0/24 into area 0 with the correct wildcard masks.',
      'Confirm R2 is a FULL neighbor and its LAN appears as an O route.'
    ],
    startingConfig: ['hostname R1'],
    env: {
      connected: ['Gi0/0', 'Gi0/1'],
      neighbors: [
        { port: 'Gi0/0', device: 'R2', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.0.2', behind: ['192.168.2.0/24'], ospf: { rid: '2.2.2.2', area: 0, routes: [{ prefix: '192.168.2.0/24', cost: 1 }] } },
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '192.168.1.10', mac: '0050.7966.6801' }
      ]
    },
    suggestedShow: ['show ip ospf neighbor', 'show ip route ospf', 'show ip protocols', 'show ip ospf interface brief'],
    checks: [
      { label: 'G0/0 is 10.0.0.1 /30 and up', test: (d) => ifUpWithIp(d, 'gi0/0', '10.0.0.1', 30), hint: 'interface g0/0, ip address 10.0.0.1 255.255.255.252, no shutdown' },
      { label: 'G0/1 is 192.168.1.1 /24 and up', test: (d) => ifUpWithIp(d, 'gi0/1', '192.168.1.1', 24), hint: 'interface g0/1, ip address 192.168.1.1 255.255.255.0, no shutdown' },
      { label: 'OSPF process 1 is configured', test: (d) => d.ospf?.process === 1, hint: 'Global config: router ospf 1' },
      { label: '10.0.0.0/30 advertised in area 0', test: (d) => Boolean(d.ospf?.networks.some((n) => n.network === '10.0.0.0' && n.wildcard === '0.0.0.3' && Number(n.area) === 0)), hint: 'Under router ospf 1: network 10.0.0.0 0.0.0.3 area 0' },
      { label: '192.168.1.0/24 advertised in area 0', test: (d) => Boolean(d.ospf?.networks.some((n) => n.network === '192.168.1.0' && n.wildcard === '0.0.0.255' && Number(n.area) === 0)), hint: 'network 192.168.1.0 0.0.0.255 area 0' },
      { label: 'R2 (2.2.2.2) is a FULL neighbor', test: (d, sim) => ospfNeighbors(sim).some((n) => n.rid === '2.2.2.2'), hint: 'The link network must be in area 0, the same area R2 uses. Check show ip ospf neighbor.' }
    ],
    solution: ['enable', 'configure terminal', 'interface g0/0', 'ip address 10.0.0.1 255.255.255.252', 'no shutdown', 'interface g0/1', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'router ospf 1', 'network 10.0.0.0 0.0.0.3 area 0', 'network 192.168.1.0 0.0.0.255 area 0', 'end', 'show ip ospf neighbor', 'show ip route ospf'],
    reflection: [
      'The wildcard mask for a /30 is 0.0.0.3 and for a /24 is 0.0.0.255. Why is a wildcard the inverse of the subnet mask?',
      'What router ID did R1 pick, and why that address?',
      'Two routers are cabled and both run OSPF but never become neighbors. Name three things you would check.'
    ]
  },
  {
    id: 'cl-ts-ospf',
    topic: 'ccna-ospf',
    kind: 'troubleshoot',
    minutes: 8,
    domainId: 3,
    title: 'Troubleshoot: OSPF is not advertising the LAN',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'OSPF is up on the link to R2, but R2 never learns R1 LAN. Add what is missing without breaking the adjacency.',
    scenario: 'OSPF process 1 runs and R1 is FULL with R2, but users on R2 side cannot reach 192.168.1.0/24.',
    symptoms: ['R2 has no route to 192.168.1.0/24.', 'show ip ospf neighbor on R1 shows R2 as FULL.', 'R1 can reach R2 LAN fine.'],
    topology: [
      { device: 'R1', port: 'G0/0', address: '10.0.0.1 /30', link: 'R2 G0/0 (10.0.0.2)' },
      { device: 'R1', port: 'G0/1', address: '192.168.1.1 /24', link: 'LAN' }
    ],
    brief: [
      'Check show ip protocols and show ip ospf interface brief to see which networks OSPF covers.',
      'The LAN 192.168.1.0/24 on G0/1 must be advertised into area 0.',
      'R2 must stay a FULL neighbor.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 10.0.0.1 255.255.255.252', 'no shutdown', 'interface g0/1', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'router ospf 1', 'network 10.0.0.0 0.0.0.3 area 0'],
    env: {
      connected: ['Gi0/0', 'Gi0/1'],
      neighbors: [
        { port: 'Gi0/0', device: 'R2', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.0.2', behind: ['192.168.2.0/24'], ospf: { rid: '2.2.2.2', area: 0, routes: [{ prefix: '192.168.2.0/24', cost: 1 }] } },
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '192.168.1.10', mac: '0050.7966.6801' }
      ]
    },
    suggestedShow: ['show ip protocols', 'show ip ospf interface brief', 'show ip ospf neighbor'],
    checks: [
      { label: 'The LAN 192.168.1.0/24 is advertised in area 0', test: (d) => Boolean(d.ospf?.networks.some((n) => n.network === '192.168.1.0' && n.wildcard === '0.0.0.255' && Number(n.area) === 0)) || ifc(d, 'gi0/1')?.ospf?.process === 1, hint: 'Only the link is in OSPF. Add: router ospf 1, then network 192.168.1.0 0.0.0.255 area 0' },
      { label: 'R2 is still a FULL neighbor', test: (d, sim) => ospfNeighbors(sim).some((n) => n.rid === '2.2.2.2'), hint: 'Leave the 10.0.0.0 0.0.0.3 area 0 statement in place.' }
    ],
    solution: ['enable', 'show ip protocols', 'configure terminal', 'router ospf 1', 'network 192.168.1.0 0.0.0.255 area 0', 'end', 'show ip ospf interface brief'],
    reflection: [
      'How did show ip protocols show you the LAN was missing from OSPF?',
      'Why did the adjacency look healthy even though a network was missing?'
    ]
  },
  {
    id: 'cl-d3-ros',
    topic: 'ccna-intervlan-routing',
    kind: 'build',
    minutes: 9,
    domainId: 3,
    title: 'Inter-VLAN routing (router-on-a-stick)',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Route between VLAN 10 and VLAN 20 over one trunked link using subinterfaces.',
    scenario: 'R1 G0/0 connects to a switch trunk carrying VLANs 10 and 20. Each VLAN needs a subinterface that acts as its default gateway.',
    topology: [
      { device: 'R1', port: 'G0/0', address: 'Trunk to SW1', link: 'SW1 G0/24' },
      { device: 'R1', port: 'G0/0.10', address: '192.168.10.1 /24', link: 'VLAN 10, PC1 .10' },
      { device: 'R1', port: 'G0/0.20', address: '192.168.20.1 /24', link: 'VLAN 20, PC2 .10' }
    ],
    brief: [
      'Bring up the physical G0/0.',
      'Create subinterface G0/0.10: tag VLAN 10, address 192.168.10.1/24.',
      'Create subinterface G0/0.20: tag VLAN 20, address 192.168.20.1/24.',
      'Ping both PCs: 192.168.10.10 and 192.168.20.10.'
    ],
    startingConfig: ['hostname R1'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [
        { port: 'Gi0/0', device: 'SW1', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I' },
        { port: 'Gi0/0', kind: 'host', device: 'PC1', ip: '192.168.10.10', vlan: 10, mac: '0050.7966.6801' },
        { port: 'Gi0/0', kind: 'host', device: 'PC2', ip: '192.168.20.10', vlan: 20, mac: '0050.7966.6802' }
      ]
    },
    suggestedShow: ['show ip interface brief', 'show ip route', 'show running-config'],
    checks: [
      { label: 'Physical G0/0 is up', test: (d) => ifc(d, 'gi0/0')?.shutdown === false, hint: 'interface g0/0, no shutdown' },
      { label: 'G0/0.10 tags VLAN 10 and is 192.168.10.1/24', test: (d) => ifc(d, 'gi0/0.10')?.encap === 10 && hasIp(d, 'gi0/0.10', '192.168.10.1', 24), hint: 'interface g0/0.10, encapsulation dot1q 10, ip address 192.168.10.1 255.255.255.0' },
      { label: 'G0/0.20 tags VLAN 20 and is 192.168.20.1/24', test: (d) => ifc(d, 'gi0/0.20')?.encap === 20 && hasIp(d, 'gi0/0.20', '192.168.20.1', 24), hint: 'interface g0/0.20, encapsulation dot1q 20, ip address 192.168.20.1 255.255.255.0' },
      { label: 'Both PCs answer a ping', test: (d, sim) => pinged(sim, '192.168.10.10') && pinged(sim, '192.168.20.10'), hint: 'ping 192.168.10.10, then ping 192.168.20.10' }
    ],
    solution: ['enable', 'configure terminal', 'interface g0/0', 'no shutdown', 'interface g0/0.10', 'encapsulation dot1q 10', 'ip address 192.168.10.1 255.255.255.0', 'interface g0/0.20', 'encapsulation dot1q 20', 'ip address 192.168.20.1 255.255.255.0', 'end', 'ping 192.168.10.10', 'ping 192.168.20.10'],
    reflection: [
      'Why does one physical link need subinterfaces to route several VLANs?',
      'Why did IOS insist on encapsulation dot1q before it would take an IP address on the subinterface?'
    ]
  },
  {
    id: 'cl-ts-intervlan',
    topic: 'ccna-intervlan-routing',
    kind: 'troubleshoot',
    minutes: 8,
    domainId: 3,
    title: 'Troubleshoot: one VLAN cannot route',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Router-on-a-stick is half working: VLAN 10 routes but VLAN 20 hosts have no gateway. Find and fix it.',
    scenario: 'Someone built the subinterfaces before you. VLAN 10 works. VLAN 20 hosts cannot reach their gateway 192.168.20.1.',
    symptoms: ['PC2 in VLAN 20 cannot ping its gateway 192.168.20.1.', 'PC1 in VLAN 10 reaches its gateway fine.', 'show ip interface brief shows every subinterface up/up.'],
    topology: [
      { device: 'R1', port: 'G0/0.10', address: '192.168.10.1 /24', link: 'VLAN 10, PC1 .10' },
      { device: 'R1', port: 'G0/0.20', address: '192.168.20.1 /24', link: 'VLAN 20, PC2 .10' }
    ],
    brief: [
      'Investigate with show running-config and show ip interface brief.',
      'G0/0.20 must tag VLAN 20 and own 192.168.20.1/24.',
      'Do not touch G0/0.10; it is correct.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'no shutdown', 'interface g0/0.10', 'encapsulation dot1q 10', 'ip address 192.168.10.1 255.255.255.0', 'interface g0/0.20', 'encapsulation dot1q 200', 'ip address 192.168.20.1 255.255.255.0'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [
        { port: 'Gi0/0', device: 'SW1', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I' },
        { port: 'Gi0/0', kind: 'host', device: 'PC1', ip: '192.168.10.10', vlan: 10, mac: '0050.7966.6801' },
        { port: 'Gi0/0', kind: 'host', device: 'PC2', ip: '192.168.20.10', vlan: 20, mac: '0050.7966.6802' }
      ]
    },
    suggestedShow: ['show running-config | section interface', 'show ip interface brief', 'ping 192.168.20.10'],
    checks: [
      { label: 'G0/0.20 tags VLAN 20 (not 200) and is 192.168.20.1/24', test: (d) => ifc(d, 'gi0/0.20')?.encap === 20 && hasIp(d, 'gi0/0.20', '192.168.20.1', 24), hint: 'show run reveals encapsulation dot1Q 200 on G0/0.20. Fix it: interface g0/0.20, encapsulation dot1q 20' },
      { label: 'G0/0.10 is unchanged', test: (d) => ifc(d, 'gi0/0.10')?.encap === 10 && hasIp(d, 'gi0/0.10', '192.168.10.1', 24), hint: 'Put G0/0.10 back to encapsulation dot1q 10 with 192.168.10.1/24.' },
      { label: 'PC2 at 192.168.20.10 answers a ping', test: (d, sim) => pinged(sim, '192.168.20.10'), hint: 'After the fix: ping 192.168.20.10' }
    ],
    solution: ['enable', 'show running-config | section interface', 'configure terminal', 'interface g0/0.20', 'encapsulation dot1q 20', 'end', 'ping 192.168.20.10'],
    reflection: [
      'How did show running-config point you at the wrong VLAN tag?',
      'Why does a mismatched dot1q tag silently break routing for that VLAN even though the IP looks right?'
    ]
  },
  {
    id: 'cl-d3-hsrp',
    topic: 'ccna-fhrp',
    kind: 'build',
    minutes: 9,
    domainId: 3,
    title: 'First hop redundancy with HSRP',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Make R1 the active HSRP router for the shared virtual gateway that hosts use as their default gateway.',
    scenario: 'R1 and R2 share the 192.168.1.0/24 LAN. Hosts point at the virtual gateway 192.168.1.254. R2 (192.168.1.2) is already active in group 1 with the default priority. R1 should take over and stay active whenever it is up.',
    topology: [
      { device: 'R1', port: 'G0/0', address: '192.168.1.1 /24', link: 'LAN switch' },
      { device: 'R2', port: 'G0/0', address: '192.168.1.2 /24, HSRP active', link: 'LAN switch' },
      { device: 'VIP', port: '-', address: '192.168.1.254', link: 'Hosts default gateway' }
    ],
    brief: [
      'Address G0/0 as 192.168.1.1/24 and bring it up.',
      'In HSRP group 1, set the virtual IP 192.168.1.254.',
      'Give R1 priority 110 and enable preempt so it takes over from R2.'
    ],
    startingConfig: ['hostname R1'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [
        { port: 'Gi0/0', device: 'R2', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '192.168.1.2', hsrp: { group: 1, priority: 100, active: true, ip: '192.168.1.254' } },
        { port: 'Gi0/0', kind: 'host', device: 'PC1', ip: '192.168.1.10', mac: '0050.7966.6801' }
      ]
    },
    suggestedShow: ['show standby brief', 'show standby', 'show running-config interface g0/0'],
    checks: [
      { label: 'G0/0 is 192.168.1.1/24 and up', test: (d) => ifUpWithIp(d, 'gi0/0', '192.168.1.1', 24), hint: 'interface g0/0, ip address 192.168.1.1 255.255.255.0, no shutdown' },
      { label: 'HSRP group 1 virtual IP is 192.168.1.254', test: (d) => Boolean(ifc(d, 'gi0/0')?.hsrp.find((g) => g.group === 1 && g.ip === '192.168.1.254')), hint: 'standby 1 ip 192.168.1.254' },
      { label: 'R1 priority is 110', test: (d) => ifc(d, 'gi0/0')?.hsrp.find((g) => g.group === 1)?.priority === 110, hint: 'standby 1 priority 110' },
      { label: 'Preempt is enabled', test: (d) => Boolean(ifc(d, 'gi0/0')?.hsrp.find((g) => g.group === 1)?.preempt), hint: 'standby 1 preempt' },
      { label: 'R1 is the active router', test: (d, sim) => hsrpGroups(sim).some((g) => g.group === 1 && g.state === 'Active'), hint: 'A higher priority alone does not take over from an active router. That is what preempt is for.' }
    ],
    solution: ['enable', 'configure terminal', 'interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'standby 1 ip 192.168.1.254', 'standby 1 priority 110', 'standby 1 preempt', 'end', 'show standby brief'],
    reflection: [
      'What single value do hosts use as their default gateway, and why does that survive a router failure?',
      'Before you added preempt, R1 had the higher priority but stayed standby. Why?'
    ]
  },

  // ===== Domain 4: IP services =====
  {
    id: 'cl-d4-dhcp',
    topic: 'ccna-dhcp-dns',
    kind: 'build',
    minutes: 8,
    domainId: 4,
    title: 'Configure a DHCP server pool',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Hand out addresses on the LAN from a DHCP pool, excluding the addresses you use statically.',
    scenario: 'The 192.168.1.0/24 LAN on G0/0 needs DHCP. The router is .1 and static servers use .2 to .10. PC1 is waiting for an address.',
    topology: [
      { device: 'R1', port: 'G0/0', address: '192.168.1.1 /24', link: 'LAN, PC1 (DHCP client)' }
    ],
    brief: [
      'Exclude 192.168.1.1 through 192.168.1.10 from being leased.',
      'Create pool LAN for network 192.168.1.0/24.',
      'Set the default router to 192.168.1.1 and the DNS server to 8.8.8.8.',
      'Check that PC1 got a lease.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown'],
    env: {
      connected: ['Gi0/0'],
      dhcpClients: [{ port: 'Gi0/0', mac: '0050.7966.6801', name: 'PC1' }]
    },
    suggestedShow: ['show ip dhcp binding', 'show ip dhcp pool', 'show running-config | section dhcp'],
    checks: [
      { label: 'The .1 to .10 range is excluded', test: (d) => d.dhcpExcluded.some(([a, b]) => a === '192.168.1.1' && b === '192.168.1.10'), hint: 'ip dhcp excluded-address 192.168.1.1 192.168.1.10' },
      { label: 'Pool LAN covers 192.168.1.0/24', test: (d) => d.dhcpPools.some((p) => p.name === 'LAN' && p.network === '192.168.1.0' && maskToPrefix(p.mask ?? '') === 24), hint: 'ip dhcp pool LAN, then network 192.168.1.0 255.255.255.0' },
      { label: 'default-router is 192.168.1.1', test: (d) => d.dhcpPools.find((p) => p.name === 'LAN')?.routers?.[0] === '192.168.1.1', hint: 'default-router 192.168.1.1' },
      { label: 'dns-server is 8.8.8.8', test: (d) => Boolean(d.dhcpPools.find((p) => p.name === 'LAN')?.dns?.includes('8.8.8.8')), hint: 'dns-server 8.8.8.8' },
      { label: 'PC1 leased 192.168.1.11', test: (d, sim) => dhcpBindings(sim).some((b) => b.ip === '192.168.1.11'), hint: 'With .1 to .10 excluded, the first lease is .11. Check show ip dhcp binding.' }
    ],
    solution: ['enable', 'configure terminal', 'ip dhcp excluded-address 192.168.1.1 192.168.1.10', 'ip dhcp pool LAN', 'network 192.168.1.0 255.255.255.0', 'default-router 192.168.1.1', 'dns-server 8.8.8.8', 'end', 'show ip dhcp binding'],
    reflection: [
      'Why exclude the router and static server addresses from the pool?',
      'If the DHCP server were on another subnet, what one command on the client-facing router would let DORA reach it?'
    ]
  },
  {
    id: 'cl-d4-nat',
    topic: 'ccna-nat',
    kind: 'build',
    minutes: 10,
    domainId: 4,
    title: 'PAT (NAT overload) to the internet',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Let the whole inside LAN share the outside interface address using PAT.',
    scenario: 'The inside LAN 192.168.1.0/24 is on G0/1. The ISP is out G0/0 (203.0.113.2/30, ISP at .1) and a default route already points there. Two inside hosts are trying to browse.',
    topology: [
      { device: 'R1', port: 'G0/1', address: '192.168.1.1 /24 (inside)', link: 'LAN' },
      { device: 'R1', port: 'G0/0', address: '203.0.113.2 /30 (outside)', link: 'ISP 203.0.113.1' }
    ],
    brief: [
      'Mark G0/1 as ip nat inside and G0/0 as ip nat outside.',
      'Match the inside LAN with access-list 1 (permit 192.168.1.0 0.0.0.255).',
      'Translate that list to the G0/0 interface address with overload (PAT).'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 203.0.113.2 255.255.255.252', 'no shutdown', 'interface g0/1', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'exit', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1'],
    env: {
      connected: ['Gi0/0', 'Gi0/1'],
      neighbors: [
        { port: 'Gi0/0', device: 'ISP', remotePort: 'GigabitEthernet0/1', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '203.0.113.1', behind: ['0.0.0.0/0'] },
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '192.168.1.10', mac: '0050.7966.6801' },
        { port: 'Gi0/1', kind: 'host', device: 'PC2', ip: '192.168.1.11', mac: '0050.7966.6802' }
      ],
      natFlows: [
        { proto: 'tcp', src: '192.168.1.10', sport: 49152, dst: '93.184.216.34', dport: 80 },
        { proto: 'tcp', src: '192.168.1.11', sport: 49152, dst: '93.184.216.34', dport: 443 },
        { proto: 'icmp', src: '192.168.1.11', sport: 7, dst: '8.8.8.8', dport: 7 }
      ]
    },
    suggestedShow: ['show ip nat translations', 'show ip nat statistics', 'show access-lists'],
    checks: [
      { label: 'G0/1 is ip nat inside', test: (d) => ifc(d, 'gi0/1')?.natRole === 'inside', hint: 'interface g0/1, ip nat inside' },
      { label: 'G0/0 is ip nat outside', test: (d) => ifc(d, 'gi0/0')?.natRole === 'outside', hint: 'interface g0/0, ip nat outside' },
      { label: 'ACL 1 permits the inside LAN', test: (d) => aclSays(d, '1', { src: '192.168.1.77' }) === 'permit', hint: 'access-list 1 permit 192.168.1.0 0.0.0.255' },
      { label: 'PAT translates list 1, overloaded onto G0/0', test: (d) => d.nat.rules.some((r) => r.acl === '1' && r.iface === 'GigabitEthernet0/0' && r.overload), hint: 'ip nat inside source list 1 interface g0/0 overload' },
      { label: 'Inside hosts show up in the translation table', test: (d, sim) => natTranslations(sim).some((t) => t.kind === 'pat'), hint: 'If the table is empty, check the inside and outside roles and the ACL.' }
    ],
    solution: ['enable', 'configure terminal', 'interface g0/1', 'ip nat inside', 'interface g0/0', 'ip nat outside', 'exit', 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface g0/0 overload', 'end', 'show ip nat translations'],
    reflection: [
      'Two hosts used source port 49152. How does PAT keep their replies apart?',
      'Which interface is inside and which is outside, and how does that decide the translation direction?'
    ]
  },
  {
    id: 'cl-ts-nat',
    topic: 'ccna-nat',
    kind: 'troubleshoot',
    minutes: 8,
    domainId: 4,
    title: 'Troubleshoot: NAT is translating nothing',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'PAT is configured but inside hosts still cannot reach the internet. Find the fault and fix it.',
    scenario: 'G0/1 faces the LAN and G0/0 faces the ISP. The ACL and the overload rule look right, yet show ip nat translations stays empty.',
    symptoms: ['Inside hosts cannot browse the internet.', 'show ip nat translations is empty.', 'The default route to the ISP is in the routing table.'],
    topology: [
      { device: 'R1', port: 'G0/1', address: '192.168.1.1 /24', link: 'LAN' },
      { device: 'R1', port: 'G0/0', address: '203.0.113.2 /30', link: 'ISP 203.0.113.1' }
    ],
    brief: [
      'Check show ip nat statistics to see which interface is inside and which is outside.',
      'G0/1 (LAN) must be ip nat inside and G0/0 (ISP) must be ip nat outside.'
    ],
    startingConfig: ['hostname R1', 'interface g0/1', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'ip nat outside', 'interface g0/0', 'ip address 203.0.113.2 255.255.255.252', 'no shutdown', 'ip nat inside', 'exit', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface g0/0 overload'],
    env: {
      connected: ['Gi0/0', 'Gi0/1'],
      neighbors: [
        { port: 'Gi0/0', device: 'ISP', remotePort: 'GigabitEthernet0/1', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '203.0.113.1', behind: ['0.0.0.0/0'] },
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '192.168.1.10', mac: '0050.7966.6801' }
      ],
      natFlows: [{ proto: 'tcp', src: '192.168.1.10', sport: 51000, dst: '93.184.216.34', dport: 443 }]
    },
    suggestedShow: ['show ip nat statistics', 'show ip nat translations', 'show running-config | include nat'],
    checks: [
      { label: 'G0/1 (LAN) is ip nat inside', test: (d) => ifc(d, 'gi0/1')?.natRole === 'inside', hint: 'interface g0/1, then ip nat inside (it replaces ip nat outside)' },
      { label: 'G0/0 (ISP) is ip nat outside', test: (d) => ifc(d, 'gi0/0')?.natRole === 'outside', hint: 'interface g0/0, then ip nat outside' },
      { label: 'Translations appear for the LAN', test: (d, sim) => natTranslations(sim).some((t) => t.kind === 'pat'), hint: 'Check show ip nat translations after fixing both interfaces.' }
    ],
    solution: ['enable', 'show ip nat statistics', 'configure terminal', 'interface g0/1', 'ip nat inside', 'interface g0/0', 'ip nat outside', 'end', 'show ip nat translations'],
    reflection: [
      'Why does swapping inside and outside stop translation entirely?',
      'How did show ip nat statistics help you spot which interface was mislabeled?'
    ]
  },
  {
    id: 'cl-d4-ntp',
    topic: 'ccna-ntp-snmp-syslog',
    kind: 'build',
    minutes: 5,
    domainId: 4,
    title: 'Sync the clock with NTP',
    difficulty: 'starter',
    deviceKind: 'router',
    hostname: 'R2',
    objective: 'Point this router at an NTP server so its clock stays synchronized.',
    scenario: 'R1 at 10.0.0.1 is the NTP master for the site (stratum 3). R2 must synchronize its clock to it so logs line up across devices.',
    topology: [
      { device: 'R2', port: 'G0/0', address: '10.0.0.2 /24', link: 'R1 G0/0 (10.0.0.1, NTP master)' }
    ],
    brief: ['Look at show clock: the * means the time is not trusted.', 'Configure 10.0.0.1 as this router NTP server.', 'Confirm with show ntp status.'],
    startingConfig: ['hostname R2', 'interface g0/0', 'ip address 10.0.0.2 255.255.255.0', 'no shutdown'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', device: 'R1', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.0.1' }],
      ntp: { '10.0.0.1': 3 }
    },
    suggestedShow: ['show clock', 'show ntp status', 'show ntp associations'],
    checks: [
      { label: 'NTP server 10.0.0.1 is configured', test: (d) => d.ntp.servers.includes('10.0.0.1'), hint: 'Global config: ntp server 10.0.0.1' },
      { label: 'The clock is synchronized to 10.0.0.1', test: (d, sim) => ntpState(sim).server === '10.0.0.1', hint: 'Check show ntp status. The server must be reachable from R2.' }
    ],
    solution: ['enable', 'show clock', 'configure terminal', 'ntp server 10.0.0.1', 'end', 'show ntp status'],
    reflection: [
      'Why does synchronized time matter when you correlate logs across many devices?',
      'R1 is stratum 3. What stratum does R2 report, and why?'
    ]
  },
  {
    id: 'cl-d4-syslog',
    topic: 'ccna-ntp-snmp-syslog',
    kind: 'build',
    minutes: 5,
    domainId: 4,
    title: 'Send logs to a syslog server',
    difficulty: 'starter',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Forward log messages to a central syslog server at informational level and above.',
    scenario: 'R1 should log to the server at 10.0.0.50, capturing severity 6 (informational) and everything more serious.',
    topology: [{ device: 'R1', port: 'G0/0', address: '10.0.0.1 /24', link: 'SYSLOG server 10.0.0.50' }],
    brief: ['Set the logging host to 10.0.0.50.', 'Set the logging trap level to informational.', 'Verify with show logging.'],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 10.0.0.1 255.255.255.0', 'no shutdown'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', kind: 'host', device: 'SYSLOG', ip: '10.0.0.50', mac: '0050.7966.6850' }]
    },
    suggestedShow: ['show logging', 'show running-config | include logging'],
    checks: [
      { label: 'Logging host 10.0.0.50 is set', test: (d) => d.logging.hosts.includes('10.0.0.50'), hint: 'logging host 10.0.0.50' },
      { label: 'Trap level is informational (6)', test: (d) => d.logging.trap === 'informational', hint: 'logging trap informational (or logging trap 6)' }
    ],
    solution: ['enable', 'configure terminal', 'logging host 10.0.0.50', 'logging trap informational', 'end', 'show logging'],
    reflection: [
      'Severity runs 0 to 7. Which end is most serious, and where does informational sit?',
      'Why centralize logs instead of reading them on each device?'
    ]
  },
  {
    id: 'cl-d4-snmp',
    topic: 'ccna-ntp-snmp-syslog',
    kind: 'build',
    minutes: 6,
    domainId: 4,
    title: 'Enable SNMP monitoring',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Allow a management station to poll this device read-only and receive traps.',
    scenario: 'The NMS at 10.0.0.60 needs read-only SNMPv2c access and should receive traps when something changes.',
    topology: [{ device: 'R1', port: 'G0/0', address: '10.0.0.1 /24', link: 'NMS 10.0.0.60' }],
    brief: ['Create a read-only community named READONLY.', 'Send traps to 10.0.0.60 using version 2c and that community.', 'Enable SNMP traps.'],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 10.0.0.1 255.255.255.0', 'no shutdown'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', kind: 'host', device: 'NMS', ip: '10.0.0.60', mac: '0050.7966.6860' }]
    },
    suggestedShow: ['show snmp community', 'show snmp host', 'show running-config | include snmp'],
    checks: [
      { label: 'Read-only community READONLY exists', test: (d) => d.snmp.communities.some((c) => c.name === 'READONLY' && c.access === 'ro'), hint: 'snmp-server community READONLY ro' },
      { label: 'Trap host 10.0.0.60 uses version 2c', test: (d) => d.snmp.hosts.some((h) => h.host === '10.0.0.60' && h.version === '2c'), hint: 'snmp-server host 10.0.0.60 version 2c READONLY' },
      { label: 'Traps are enabled', test: (d) => d.snmp.traps, hint: 'snmp-server enable traps' }
    ],
    solution: ['enable', 'configure terminal', 'snmp-server community READONLY ro', 'snmp-server host 10.0.0.60 version 2c READONLY', 'snmp-server enable traps', 'end', 'show snmp community'],
    reflection: [
      'What is the difference between the manager polling an agent and an agent sending a trap?',
      'Why is a read-only community safer than read-write, and what does SNMPv3 add?'
    ]
  },
  {
    id: 'cl-d4-ssh',
    topic: 'ccna-ssh-tftp-ftp',
    kind: 'build',
    minutes: 9,
    domainId: 4,
    title: 'Secure remote access with SSH',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Replace Telnet with SSH: hostname, domain, local user, RSA key, SSH version 2, and VTY lines locked to SSH.',
    scenario: 'A new router still called Router. It must be reachable only over SSH, authenticating against a local username.',
    topology: [{ device: 'R1', port: 'G0/0', address: '192.168.1.1 /24', link: 'Admin PC 192.168.1.10' }],
    brief: [
      'Set the hostname R1 and an IP domain name. Both are required before the key will generate.',
      'Create a local user admin with a secret.',
      'Generate a 2048-bit RSA key and allow only SSH version 2.',
      'On line vty 0 4: login local and transport input ssh.'
    ],
    startingConfig: ['interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', kind: 'host', device: 'ADMIN-PC', ip: '192.168.1.10', mac: '0050.7966.6810' }]
    },
    suggestedShow: ['show ip ssh', 'show running-config | section line', 'show running-config | include username'],
    checks: [
      { label: 'Hostname is set (not the default Router)', test: (d) => d.hostname !== 'Router', hint: 'hostname R1' },
      { label: 'ip domain-name is configured', test: (d) => Boolean(d.domainName), hint: 'ip domain-name lab.local' },
      { label: 'A local user with a secret exists', test: (d) => d.users.some((u) => u.kind === 'secret'), hint: 'username admin secret Cisco123' },
      { label: 'RSA key of at least 768 bits generated', test: (d) => (d.rsaModulus ?? 0) >= 768, hint: 'crypto key generate rsa modulus 2048 (needs hostname and domain name first)' },
      { label: 'Only SSH version 2 is allowed', test: (d) => d.sshVersion === 2, hint: 'ip ssh version 2' },
      { label: 'VTY lines use login local', test: (d) => d.lines.vty.login === 'local', hint: 'line vty 0 4, then login local' },
      { label: 'VTY transport input is SSH only', test: (d) => JSON.stringify(d.lines.vty.transport) === '["ssh"]', hint: 'transport input ssh' }
    ],
    solution: ['enable', 'configure terminal', 'hostname R1', 'ip domain-name lab.local', 'username admin secret Cisco123', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'line vty 0 4', 'login local', 'transport input ssh', 'end', 'show ip ssh'],
    reflection: [
      'Why must the hostname and domain name be set before crypto key generate rsa will work?',
      'Why is transport input ssh a security improvement over allowing Telnet?'
    ]
  },

  // ===== Domain 5: security fundamentals =====
  {
    id: 'cl-d5-device-hardening',
    topic: 'ccna-device-security',
    kind: 'build',
    minutes: 12,
    domainId: 5,
    title: 'Harden device access',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Lock down access to R1: an enable secret, a local admin account, encrypted passwords, a login banner, local logins with an idle timeout on the console, and SSH-only VTY lines limited to the admin subnet.',
    scenario: 'R1 was set up in a hurry. The console uses a shared line password stored in plain text, and nothing restricts who can open a remote session. Admins sit on 192.168.1.0/24.',
    topology: [
      { device: 'R1', port: 'Console', address: '-', link: 'Your laptop' },
      { device: 'R1', port: 'G0/0', address: '192.168.1.1 /24', link: 'Admin subnet 192.168.1.0/24' }
    ],
    brief: [
      'Set an enable secret.',
      'Create a local user admin with privilege 15 and a secret.',
      'Encrypt plain-text passwords with service password-encryption.',
      'Add a banner motd warning against unauthorized access.',
      'Console: authenticate with local accounts and log out idle sessions after 5 minutes.',
      'VTY 0 4: local logins, SSH only, and an access-class that allows only 192.168.1.0/24.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'line console 0', 'password cisco', 'login'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', kind: 'host', device: 'ADMIN-PC', ip: '192.168.1.10', mac: '0050.7966.6810' }]
    },
    suggestedShow: ['show running-config', 'show running-config | section line', 'show access-lists'],
    checks: [
      { label: 'An enable secret is configured', test: (d) => Boolean(d.enableSecret), hint: 'enable secret <a strong password>' },
      { label: 'Local user admin has privilege 15 and a secret', test: (d) => d.users.some((u) => u.name === 'admin' && u.privilege === 15 && u.kind === 'secret'), hint: 'username admin privilege 15 secret <password>' },
      { label: 'service password-encryption is on', test: (d) => d.servicePasswordEncryption, hint: 'service password-encryption' },
      { label: 'A login banner (motd) is set', test: (d) => Boolean(d.banner && d.banner.trim()), hint: 'banner motd #Authorized access only#' },
      { label: 'Console logs in with local accounts', test: (d) => d.lines.con.login === 'local', hint: 'line console 0, then login local' },
      { label: 'Console times out after 5 idle minutes', test: (d) => JSON.stringify(d.lines.con.execTimeout) === '[5,0]', hint: 'Under line console 0: exec-timeout 5 0' },
      { label: 'VTY lines use local logins and SSH only', test: (d) => d.lines.vty.login === 'local' && JSON.stringify(d.lines.vty.transport) === '["ssh"]', hint: 'line vty 0 4, then login local and transport input ssh' },
      {
        label: 'VTY access is limited to 192.168.1.0/24',
        test: (d) => {
          const ac = d.lines.vty.accessClass
          if (!ac || ac.dir !== 'in') return false
          return aclSays(d, ac.acl, { src: '192.168.1.10' }) === 'permit' && aclSays(d, ac.acl, { src: '10.9.9.9' }) !== 'permit'
        },
        hint: 'access-list 10 permit 192.168.1.0 0.0.0.255, then under line vty 0 4: access-class 10 in'
      }
    ],
    solution: ['enable', 'configure terminal', 'enable secret Str0ngEnable', 'username admin privilege 15 secret Adm1nPass', 'service password-encryption', 'banner motd #Authorized access only. Disconnect now if you are not authorized.#', 'line console 0', 'login local', 'exec-timeout 5 0', 'exit', 'access-list 10 permit 192.168.1.0 0.0.0.255', 'line vty 0 4', 'login local', 'transport input ssh', 'access-class 10 in', 'end', 'show running-config | section line'],
    reflection: [
      'service password-encryption uses type 7. Why is that only light protection, while secrets use a real hash?',
      'access-class filters who can open a VTY session. How is that different from ip access-group on an interface?',
      'Try exit and log back in on the console. What changed?'
    ]
  },
  {
    id: 'cl-d5-portsec',
    topic: 'ccna-layer2-security',
    kind: 'build',
    minutes: 8,
    domainId: 5,
    title: 'Lock a port with port security',
    difficulty: 'core',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Restrict G0/1 to a single learned MAC, sticky, shutting the port on a violation.',
    scenario: 'G0/1 is the access port for one PC in VLAN 10. Nobody else should be able to plug in there.',
    topology: [{ device: 'SW1', port: 'G0/1', address: 'Access VLAN 10', link: 'PC1 0050.7966.6801' }],
    brief: [
      'Make G0/1 an access port in VLAN 10. Port security refuses dynamic ports.',
      'Enable port security on G0/1 with a maximum of 1 MAC address.',
      'Learn it sticky, and set the violation action to shutdown.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'name STAFF', 'exit'],
    env: {
      connected: ['Gi0/1'],
      neighbors: [{ port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' }]
    },
    suggestedShow: ['show port-security interface g0/1', 'show port-security', 'show running-config interface g0/1'],
    checks: [
      { label: 'G0/1 is a static access port in VLAN 10', test: (d) => ifc(d, 'gi0/1')?.mode === 'access' && ifc(d, 'gi0/1')?.accessVlan === 10, hint: 'interface g0/1, switchport mode access, switchport access vlan 10' },
      { label: 'Port security is enabled on G0/1', test: (d) => Boolean(ifc(d, 'gi0/1')?.portSecurity?.enabled), hint: 'switchport port-security' },
      { label: 'Maximum is 1 MAC', test: (d) => ifc(d, 'gi0/1')?.portSecurity?.max === 1, hint: 'switchport port-security maximum 1' },
      { label: 'Sticky learning is on and PC1 MAC is saved', test: (d) => Boolean(ifc(d, 'gi0/1')?.portSecurity?.sticky && ifc(d, 'gi0/1').portSecurity.stickyMacs.includes('0050.7966.6801')), hint: 'switchport port-security mac-address sticky' },
      { label: 'Violation action is shutdown', test: (d) => ifc(d, 'gi0/1')?.portSecurity?.violation === 'shutdown', hint: 'switchport port-security violation shutdown (also the default)' }
    ],
    solution: ['enable', 'configure terminal', 'interface g0/1', 'switchport mode access', 'switchport access vlan 10', 'switchport port-security', 'switchport port-security maximum 1', 'switchport port-security mac-address sticky', 'switchport port-security violation shutdown', 'end', 'show port-security interface g0/1'],
    reflection: [
      'What are the three violation modes, and how does shutdown differ from restrict and protect?',
      'A secured port goes err-disabled after a violation. How do you recover it?',
      'Where did the sticky MAC address end up, and what do you need to do so it survives a reload?'
    ]
  },
  {
    id: 'cl-d5-dhcpsnoop',
    topic: 'ccna-layer2-security',
    kind: 'build',
    minutes: 9,
    domainId: 5,
    title: 'DHCP snooping and Dynamic ARP Inspection',
    difficulty: 'challenge',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Block rogue DHCP servers and ARP spoofing on VLAN 10 by trusting only the uplink.',
    scenario: 'G0/24 is the uplink toward the real DHCP server. Access ports must be untrusted for both DHCP and ARP.',
    topology: [
      { device: 'SW1', port: 'G0/24', address: 'Uplink (trusted)', link: 'DHCP server' },
      { device: 'SW1', port: 'G0/1', address: 'VLAN 10 (untrusted)', link: 'PC1' }
    ],
    brief: [
      'Enable DHCP snooping globally and for VLAN 10.',
      'Trust the uplink G0/24 for DHCP snooping.',
      'Enable Dynamic ARP Inspection for VLAN 10 and trust G0/24.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'exit', 'interface g0/1', 'switchport mode access', 'switchport access vlan 10', 'interface g0/24', 'switchport mode access', 'switchport access vlan 10'],
    env: {
      connected: ['Gi0/1', 'Gi0/24'],
      neighbors: [
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' },
        { port: 'Gi0/24', kind: 'host', device: 'DHCP-SRV', ip: '10.0.10.2', mac: '0050.7966.6824' }
      ]
    },
    suggestedShow: ['show ip dhcp snooping', 'show ip arp inspection', 'show running-config interface g0/24'],
    checks: [
      { label: 'DHCP snooping is on for VLAN 10', test: (d) => d.dhcpSnooping.enabled && d.dhcpSnooping.vlans.includes(10), hint: 'ip dhcp snooping, then ip dhcp snooping vlan 10' },
      { label: 'G0/24 is a trusted snooping port', test: (d) => Boolean(ifc(d, 'gi0/24')?.dhcpSnoopTrust), hint: 'interface g0/24, ip dhcp snooping trust' },
      { label: 'DAI is enabled for VLAN 10', test: (d) => d.arpInspection.vlans.includes(10), hint: 'ip arp inspection vlan 10' },
      { label: 'G0/24 is trusted for ARP inspection', test: (d) => Boolean(ifc(d, 'gi0/24')?.arpTrust), hint: 'interface g0/24, ip arp inspection trust' },
      { label: 'User port G0/1 stays untrusted', test: (d) => !ifc(d, 'gi0/1')?.dhcpSnoopTrust && !ifc(d, 'gi0/1')?.arpTrust, hint: 'Only the uplink should be trusted. Remove trust from G0/1.' }
    ],
    solution: ['enable', 'configure terminal', 'ip dhcp snooping', 'ip dhcp snooping vlan 10', 'interface g0/24', 'ip dhcp snooping trust', 'exit', 'ip arp inspection vlan 10', 'interface g0/24', 'ip arp inspection trust', 'end', 'show ip dhcp snooping'],
    reflection: [
      'How does trusting only the uplink stop a rogue DHCP server on a user port?',
      'Dynamic ARP Inspection checks ARP against which table, and what attack does that stop?'
    ]
  },
  {
    id: 'cl-d5-acl-standard',
    topic: 'ccna-acls',
    kind: 'build',
    minutes: 8,
    domainId: 5,
    title: 'Standard ACL: block one subnet',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Write a numbered standard ACL that blocks one subnet but permits everyone else, and apply it close to the destination.',
    scenario: 'Hosts in 192.168.20.0/24 (on G0/0) must not reach the LAN out G0/1. Everyone else, such as 192.168.30.0/24 on G0/2, may.',
    topology: [
      { device: 'R1', port: 'G0/0', address: '192.168.20.1 /24', link: 'Blocked subnet' },
      { device: 'R1', port: 'G0/1', address: '192.168.1.1 /24', link: 'Protected LAN' },
      { device: 'R1', port: 'G0/2', address: '192.168.30.1 /24', link: 'Allowed subnet' }
    ],
    brief: ['Standard ACL 10: deny 192.168.20.0 0.0.0.255, then permit any.', 'Apply ACL 10 outbound on G0/1.'],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 192.168.20.1 255.255.255.0', 'no shutdown', 'interface g0/1', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'interface g0/2', 'ip address 192.168.30.1 255.255.255.0', 'no shutdown'],
    env: { connected: ['Gi0/0', 'Gi0/1', 'Gi0/2'] },
    suggestedShow: ['show access-lists', 'show ip interface g0/1', 'show running-config | include access'],
    checks: [
      { label: 'ACL 10 denies 192.168.20.0/24', test: (d) => aclSays(d, '10', { src: '192.168.20.5' }) === 'deny' && aclSays(d, '10', { src: '192.168.20.250' }) === 'deny', hint: 'access-list 10 deny 192.168.20.0 0.0.0.255' },
      { label: 'ACL 10 permits everyone else', test: (d) => aclSays(d, '10', { src: '192.168.30.7' }) === 'permit' && aclSays(d, '10', { src: '10.1.1.1' }) === 'permit', hint: 'access-list 10 permit any (after the deny)' },
      { label: 'ACL 10 is applied on G0/1 outbound', test: (d) => ifc(d, 'gi0/1')?.aclOut === '10', hint: 'interface g0/1, ip access-group 10 out' }
    ],
    solution: ['enable', 'configure terminal', 'access-list 10 deny 192.168.20.0 0.0.0.255', 'access-list 10 permit any', 'interface g0/1', 'ip access-group 10 out', 'end', 'show access-lists'],
    reflection: [
      'Every ACL ends with an invisible line. What is it, and why must you add permit any here?',
      'Why does a standard ACL go near the destination instead of the source?'
    ]
  },
  {
    id: 'cl-d5-acl-extended',
    topic: 'ccna-acls',
    kind: 'build',
    minutes: 9,
    domainId: 5,
    title: 'Extended ACL: allow web, block the rest',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Write an extended ACL that permits HTTP and HTTPS from the LAN and drops everything else, then apply it inbound near the source.',
    scenario: 'From the LAN 192.168.1.0/24 on G0/1, allow web traffic (TCP 80 and 443) to any destination and block everything else.',
    topology: [
      { device: 'R1', port: 'G0/1', address: '192.168.1.1 /24', link: 'LAN (source)' },
      { device: 'R1', port: 'G0/0', address: '203.0.113.2 /30', link: 'Internet' }
    ],
    brief: [
      'Extended ACL 100: permit tcp 192.168.1.0 0.0.0.255 any eq 80, then the same for eq 443.',
      'Apply ACL 100 inbound on G0/1.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 203.0.113.2 255.255.255.252', 'no shutdown', 'interface g0/1', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown'],
    env: { connected: ['Gi0/0', 'Gi0/1'] },
    suggestedShow: ['show access-lists 100', 'show ip interface g0/1', 'show running-config | include access'],
    checks: [
      { label: 'ACL 100 permits HTTP (TCP 80) from the LAN', test: (d) => aclSays(d, '100', { proto: 'tcp', src: '192.168.1.20', dst: '93.184.216.34', sport: 50000, dport: 80 }) === 'permit', hint: 'access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80' },
      { label: 'ACL 100 permits HTTPS (TCP 443) from the LAN', test: (d) => aclSays(d, '100', { proto: 'tcp', src: '192.168.1.20', dst: '93.184.216.34', sport: 50000, dport: 443 }) === 'permit', hint: 'access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 443' },
      { label: 'Other traffic, such as Telnet, is dropped', test: (d) => d.acls['100'] != null && aclSays(d, '100', { proto: 'tcp', src: '192.168.1.20', dst: '10.9.9.9', sport: 50000, dport: 23 }) !== 'permit', hint: 'Do not add a permit ip any any. The implicit deny drops the rest.' },
      { label: 'ACL 100 is applied on G0/1 inbound', test: (d) => ifc(d, 'gi0/1')?.aclIn === '100', hint: 'interface g0/1, ip access-group 100 in' }
    ],
    solution: ['enable', 'configure terminal', 'access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80', 'access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 443', 'interface g0/1', 'ip access-group 100 in', 'end', 'show access-lists 100'],
    reflection: [
      'show access-lists printed eq www instead of eq 80. Why?',
      'The implicit deny drops everything else, DNS included. Would web browsing still work for these users? What would you add?'
    ]
  },
  {
    id: 'cl-ts-acl',
    topic: 'ccna-acls',
    kind: 'troubleshoot',
    minutes: 7,
    domainId: 5,
    title: 'Troubleshoot: an ACL is blocking everything',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'An ACL meant to block one subnet is blocking all traffic out G0/1. Find why and fix it without letting the blocked subnet through.',
    scenario: 'ACL 10 should deny 192.168.20.0/24 out G0/1 but permit everyone else. Right now nothing reaches the LAN.',
    symptoms: ['No host can reach the LAN on G0/1.', 'show access-lists shows matches on the only line, but users outside 192.168.20.0/24 are blocked too.'],
    topology: [
      { device: 'R1', port: 'G0/0', address: '192.168.20.1 /24', link: 'Blocked subnet' },
      { device: 'R1', port: 'G0/1', address: '192.168.1.1 /24', link: 'Protected LAN' },
      { device: 'R1', port: 'G0/2', address: '192.168.30.1 /24', link: 'Allowed subnet' }
    ],
    brief: ['Check show access-lists and think about the implicit deny.', 'ACL 10 must still deny 192.168.20.0/24 but permit all other traffic.'],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 192.168.20.1 255.255.255.0', 'no shutdown', 'interface g0/1', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'ip access-group 10 out', 'interface g0/2', 'ip address 192.168.30.1 255.255.255.0', 'no shutdown', 'exit', 'access-list 10 deny 192.168.20.0 0.0.0.255'],
    env: { connected: ['Gi0/0', 'Gi0/1', 'Gi0/2'] },
    suggestedShow: ['show access-lists', 'show ip interface g0/1', 'show running-config | include access'],
    checks: [
      { label: 'ACL 10 still denies 192.168.20.0/24', test: (d) => aclSays(d, '10', { src: '192.168.20.5' }) === 'deny', hint: 'Keep the deny line for 192.168.20.0 0.0.0.255.' },
      { label: 'ACL 10 now permits everyone else', test: (d) => aclSays(d, '10', { src: '192.168.30.7' }) === 'permit', hint: 'The only line is a deny, so the implicit deny blocks the rest. Add: access-list 10 permit any' },
      { label: 'ACL 10 is still applied out G0/1', test: (d) => ifc(d, 'gi0/1')?.aclOut === '10', hint: 'interface g0/1, ip access-group 10 out' }
    ],
    solution: ['enable', 'show access-lists', 'configure terminal', 'access-list 10 permit any', 'end', 'show access-lists'],
    reflection: [
      'Every ACL ends with an invisible line. What is it, and why did it block everything here?',
      'Why must the permit any come after the deny, not before?'
    ]
  },
  // ===== Round 2: Layer 3 switching, relay, STP guards, deeper troubleshooting, capstones =====
  {
    id: 'cl-d3-l3switch',
    topic: 'ccna-intervlan-routing',
    kind: 'build',
    minutes: 12,
    domainId: 3,
    title: 'Layer 3 switch: SVIs, ip routing and a routed port',
    difficulty: 'core',
    deviceKind: 'switch',
    model: 'l3switch',
    hostname: 'DSW1',
    objective: 'Route between VLAN 10 and VLAN 20 on a multilayer switch with SVIs, and reach the internet through a routed uplink.',
    scenario: 'DSW1 is a Catalyst 3560 at the core of a small site. PCs in VLAN 10 and VLAN 20 already sit on access ports. Instead of a router-on-a-stick, DSW1 should route between the VLANs itself, and its G0/24 uplink to R1 should be a routed port, not a switchport.',
    topology: [
      { device: 'DSW1', port: 'Vlan10', address: '192.168.10.1 /24', link: 'Gateway for VLAN 10 (PC1 .10 on G0/1)' },
      { device: 'DSW1', port: 'Vlan20', address: '192.168.20.1 /24', link: 'Gateway for VLAN 20 (PC2 .10 on G0/2)' },
      { device: 'DSW1', port: 'G0/24', address: '10.0.0.2 /30 (routed)', link: 'R1 G0/1 10.0.0.1, toward the internet' }
    ],
    brief: [
      'Turn on IPv4 routing. A multilayer switch does not route until you do.',
      'Create SVIs: Vlan10 192.168.10.1/24 and Vlan20 192.168.20.1/24, and make sure they are not shut down.',
      'Make G0/24 a routed port (no switchport) with 10.0.0.2/30.',
      'Add a default route via R1 (10.0.0.1), then ping PC1, PC2 and 8.8.8.8.'
    ],
    startingConfig: ['hostname DSW1', 'vlan 10', 'name STAFF', 'vlan 20', 'name GUEST', 'exit', 'interface g0/1', 'switchport mode access', 'switchport access vlan 10', 'interface g0/2', 'switchport mode access', 'switchport access vlan 20'],
    env: {
      connected: ['Gi0/1', 'Gi0/2', 'Gi0/24'],
      neighbors: [
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '192.168.10.10', mac: '0050.7966.6801' },
        { port: 'Gi0/2', kind: 'host', device: 'PC2', ip: '192.168.20.10', mac: '0050.7966.6802' },
        { port: 'Gi0/24', device: 'R1', remotePort: 'GigabitEthernet0/1', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.0.1', behind: ['0.0.0.0/0'] }
      ]
    },
    suggestedShow: ['show ip interface brief', 'show ip route', 'show interfaces g0/24 switchport', 'show vlan brief'],
    checks: [
      { label: 'IP routing is enabled', test: (d) => d.ipRouting, hint: 'Global config: ip routing' },
      { label: 'Vlan10 is 192.168.10.1/24 and up', test: (d, sim) => hasIp(d, 'vlan10', '192.168.10.1', 24) && isUp(sim, 'Vlan10'), hint: 'interface vlan 10, ip address 192.168.10.1 255.255.255.0, no shutdown' },
      { label: 'Vlan20 is 192.168.20.1/24 and up', test: (d, sim) => hasIp(d, 'vlan20', '192.168.20.1', 24) && isUp(sim, 'Vlan20'), hint: 'interface vlan 20, ip address 192.168.20.1 255.255.255.0, no shutdown' },
      { label: 'G0/24 is a routed port with 10.0.0.2/30', test: (d) => ifc(d, 'gi0/24')?.switchport === false && ifUpWithIp(d, 'gi0/24', '10.0.0.2', 30), hint: 'interface g0/24, no switchport, then ip address 10.0.0.2 255.255.255.252' },
      { label: 'Default route via 10.0.0.1', test: (d) => hasStatic(d, '0.0.0.0', '0.0.0.0', '10.0.0.1'), hint: 'ip route 0.0.0.0 0.0.0.0 10.0.0.1' },
      { label: 'PC1, PC2 and 8.8.8.8 answer pings', test: (d, sim) => ['192.168.10.10', '192.168.20.10', '8.8.8.8'].every((ip) => pinged(sim, ip)), hint: 'ping 192.168.10.10, ping 192.168.20.10, ping 8.8.8.8' }
    ],
    solution: ['enable', 'configure terminal', 'ip routing', 'interface vlan 10', 'ip address 192.168.10.1 255.255.255.0', 'no shutdown', 'interface vlan 20', 'ip address 192.168.20.1 255.255.255.0', 'no shutdown', 'interface g0/24', 'no switchport', 'ip address 10.0.0.2 255.255.255.252', 'no shutdown', 'exit', 'ip route 0.0.0.0 0.0.0.0 10.0.0.1', 'end', 'show ip route', 'ping 192.168.10.10', 'ping 192.168.20.10', 'ping 8.8.8.8'],
    reflection: [
      'An SVI shows up/down until something in its VLAN is up. Which ports keep Vlan10 up here?',
      'What is the difference between an SVI and a routed port, and why is the uplink a routed port?',
      'Once ip routing is on, the switch ignores ip default-gateway. What does it use instead?'
    ]
  },
  {
    id: 'cl-d4-dhcp-relay',
    topic: 'ccna-dhcp-dns',
    kind: 'build',
    minutes: 8,
    domainId: 4,
    title: 'DHCP relay across a router',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R2',
    objective: 'Let clients on R2\'s LAN get addresses from the DHCP server on R1, one subnet away, using ip helper-address.',
    scenario: 'R1 (10.0.12.1) is the site DHCP server and already has a pool for 10.0.2.0/24 that starts handing out at .11. PC1 sits on R2\'s G0/0 LAN and broadcasts DHCPDISCOVER, but routers do not forward broadcasts.',
    topology: [
      { device: 'R2', port: 'G0/0', address: '10.0.2.1 /24', link: 'LAN, PC1 (DHCP client)' },
      { device: 'R2', port: 'G0/1', address: '10.0.12.2 /30', link: 'R1 G0/1 10.0.12.1 (DHCP server)' }
    ],
    brief: [
      'Address G0/0 as 10.0.2.1/24 and bring it up. The server uses this address (the giaddr) to pick the pool.',
      'Relay DHCP on the interface facing the clients, pointing at 10.0.12.1.',
      'Find PC1\'s new address in show ip arp and ping it.'
    ],
    startingConfig: ['hostname R2', 'interface g0/1', 'ip address 10.0.12.2 255.255.255.252', 'no shutdown'],
    env: {
      connected: ['Gi0/0', 'Gi0/1'],
      neighbors: [{ port: 'Gi0/1', device: 'R1', remotePort: 'GigabitEthernet0/1', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.12.1' }],
      dhcpClients: [{ port: 'Gi0/0', mac: '0050.7966.6801', name: 'PC1' }],
      dhcpServers: [{ ip: '10.0.12.1', pools: [{ network: '10.0.2.0', len: 24, start: '10.0.2.11', router: '10.0.2.1' }] }]
    },
    suggestedShow: ['show ip interface g0/0', 'show ip arp', 'show running-config interface g0/0'],
    checks: [
      { label: 'G0/0 is 10.0.2.1/24 and up', test: (d) => ifUpWithIp(d, 'gi0/0', '10.0.2.1', 24), hint: 'interface g0/0, ip address 10.0.2.1 255.255.255.0, no shutdown' },
      { label: 'G0/0 relays DHCP to 10.0.12.1', test: (d) => Boolean(ifc(d, 'gi0/0')?.helpers.includes('10.0.12.1')), hint: 'The helper goes on the client-facing interface: interface g0/0, ip helper-address 10.0.12.1' },
      { label: 'PC1 leased 10.0.2.11 through the relay', test: (d, sim) => relayLeases(sim).some((l) => l.ip === '10.0.2.11'), hint: 'G0/0 must be up with its address and a helper that points at a reachable server.' },
      { label: 'PC1 answers a ping at its new address', test: (d, sim) => pinged(sim, '10.0.2.11'), hint: 'ping 10.0.2.11' }
    ],
    solution: ['enable', 'configure terminal', 'interface g0/0', 'ip address 10.0.2.1 255.255.255.0', 'no shutdown', 'ip helper-address 10.0.12.1', 'end', 'show ip interface g0/0', 'show ip arp', 'ping 10.0.2.11'],
    reflection: [
      'Why does a router drop the client\'s DHCPDISCOVER unless ip helper-address is set?',
      'The relay fills in the giaddr field with 10.0.2.1. How does the server use it?',
      'Besides DHCP, which other UDP broadcasts does ip helper-address forward by default?'
    ]
  },
  {
    id: 'cl-d2-stp-guards',
    topic: 'ccna-stp',
    kind: 'build',
    minutes: 12,
    domainId: 2,
    title: 'STP guards: recover BPDU guard and add root guard',
    difficulty: 'challenge',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Bring an err-disabled access port back, stop a misconfigured access switch from stealing the root role with root guard, and let BPDU guard ports recover on their own.',
    scenario: 'SW1 is the distribution switch and should be the root bridge (priority 4096). Yesterday someone plugged a small switch into G0/5; BPDU guard shut the port. The switch is gone and PC5 is back on G0/5, but the port is still dead. Meanwhile a new access switch, SW4 on G0/24, was set up with bridge priority 0 and took over as root.',
    symptoms: ['PC5 on G0/5 has no link light; show interfaces status shows err-disabled.', 'show spanning-tree vlan 10 says SW1 is not the root.', 'Traffic between access switches now detours through SW4.'],
    topology: [
      { device: 'SW1', port: 'G0/1 - G0/12', address: 'Access VLAN 10, PortFast, BPDU guard', link: 'User PCs' },
      { device: 'SW1', port: 'G0/23', address: 'Trunk', link: 'SW3 (access switch)' },
      { device: 'SW1', port: 'G0/24', address: 'Trunk', link: 'SW4 (access switch, priority 0)' }
    ],
    brief: [
      'Find the err-disabled port and why: show interfaces status err-disabled.',
      'Recover G0/5. An err-disabled port only comes back after shutdown, then no shutdown.',
      'Put root guard on both downlinks to access switches (G0/23 and G0/24).',
      'Let ports err-disabled by BPDU guard recover automatically after 300 seconds.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'name STAFF', 'exit', 'spanning-tree vlan 1,10 priority 4096', 'interface range g0/1 - 12', 'switchport mode access', 'switchport access vlan 10', 'spanning-tree portfast', 'spanning-tree bpduguard enable', 'interface range g0/23 - 24', 'switchport mode trunk'],
    env: {
      connected: ['Gi0/1', 'Gi0/5', 'Gi0/23', 'Gi0/24'],
      neighbors: [
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' },
        { port: 'Gi0/5', kind: 'host', device: 'PC5', ip: '10.0.10.15', mac: '0050.7966.6805' },
        { port: 'Gi0/23', device: 'SW3', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.b400' } },
        { port: 'Gi0/24', device: 'SW4', remotePort: 'GigabitEthernet0/24', platform: 'WS-C2960G-24TC-L', capability: 'S I', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 0, mac: '0019.e86a.c800' } }
      ],
      errdisabled: [{ port: 'Gi0/5', reason: 'bpduguard' }]
    },
    suggestedShow: ['show interfaces status err-disabled', 'show spanning-tree vlan 10', 'show spanning-tree inconsistentports', 'show errdisable recovery'],
    checks: [
      { label: 'G0/5 is back up (not err-disabled)', test: (d, sim) => !sim.op.errdisabled.includes('GigabitEthernet0/5') && ifc(d, 'gi0/5')?.shutdown === false, hint: 'interface g0/5, shutdown, then no shutdown' },
      { label: 'G0/1 - G0/12 still have PortFast and BPDU guard', test: (d) => range(1, 12).every((n) => ifc(d, `gi0/${n}`)?.portfast === 'enable' && ifc(d, `gi0/${n}`)?.bpduguard === 'enable'), hint: 'Do not remove the protection to recover the port. Shut and no shut instead.' },
      { label: 'Root guard is on G0/23 and G0/24', test: (d) => ['gi0/23', 'gi0/24'].every((n) => ifc(d, n)?.guard === 'root'), hint: 'interface range g0/23 - 24, spanning-tree guard root' },
      { label: 'SW1 is the root bridge for VLANs 1 and 10', test: (d, sim) => isStpRoot(sim, 1) && isStpRoot(sim, 10), hint: 'With root guard on G0/24, SW4\'s superior BPDUs put that port into root-inconsistent state instead of winning the election.' },
      { label: 'BPDU guard ports recover automatically after 300 seconds', test: (d) => (d.errdisable.causes.includes('bpduguard') || d.errdisable.causes.includes('all')) && (d.errdisable.interval ?? 300) === 300, hint: 'errdisable recovery cause bpduguard, then errdisable recovery interval 300' }
    ],
    solution: ['enable', 'show interfaces status err-disabled', 'configure terminal', 'interface g0/5', 'shutdown', 'no shutdown', 'interface range g0/23 - 24', 'spanning-tree guard root', 'exit', 'errdisable recovery cause bpduguard', 'errdisable recovery interval 300', 'end', 'show spanning-tree vlan 10'],
    reflection: [
      'BPDU guard and root guard both react to BPDUs. What does each one protect against, and what state does each put the port in?',
      'Why did G0/24 recover on its own when SW4 stopped sending superior BPDUs, while G0/5 needed shutdown and no shutdown?',
      'What is the risk of automatic err-disable recovery if the rogue switch is still plugged in?'
    ]
  },
  {
    id: 'cl-ts-dhcp',
    topic: 'ccna-dhcp-dns',
    kind: 'troubleshoot',
    minutes: 12,
    domainId: 4,
    title: 'Troubleshoot: DHCP on two LANs',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Clients on both of R1\'s LANs fail to get working addresses. Find the three faults in the local pool and the relay and fix them.',
    scenario: 'R1 serves LAN 10 (G0/0, 192.168.10.0/24) from its own pool, and relays LAN 20 (G0/1, 192.168.20.0/24) to the central DHCP server 10.99.0.5 in the data center behind the core router on G0/2.',
    symptoms: ['PCs on LAN 10 show a 169.254.x.x address.', 'Last week, when LAN 10 PCs did get leases, they could not reach anything off their own subnet.', 'PCs on LAN 20 also get no address, and the central server logs no requests from that subnet.'],
    topology: [
      { device: 'R1', port: 'G0/0', address: '192.168.10.1 /24', link: 'LAN 10, PC1 (local pool)' },
      { device: 'R1', port: 'G0/1', address: '192.168.20.1 /24', link: 'LAN 20, PC2 (central server)' },
      { device: 'R1', port: 'G0/2', address: '10.0.0.1 /30', link: 'CORE 10.0.0.2, then DHCP server 10.99.0.5' }
    ],
    brief: [
      'Compare show ip dhcp pool and show running-config | section dhcp with the addressing above.',
      'LAN 10 clients must lease from 192.168.10.0/24 and use 192.168.10.1 as their gateway.',
      'LAN 20 clients must reach the central server 10.99.0.5 through a relay.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 192.168.10.1 255.255.255.0', 'no shutdown', 'interface g0/1', 'ip address 192.168.20.1 255.255.255.0', 'no shutdown', 'interface g0/2', 'ip address 10.0.0.1 255.255.255.252', 'no shutdown', 'exit', 'ip route 10.99.0.0 255.255.0.0 10.0.0.2', 'ip dhcp excluded-address 192.168.10.1 192.168.10.10', 'ip dhcp pool LAN10', 'network 192.168.1.0 255.255.255.0', 'default-router 192.168.10.254', 'dns-server 10.99.0.53'],
    env: {
      connected: ['Gi0/0', 'Gi0/1', 'Gi0/2'],
      neighbors: [{ port: 'Gi0/2', device: 'CORE', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.0.2', behind: ['10.99.0.0/16'] }],
      dhcpClients: [
        { port: 'Gi0/0', mac: '0050.7966.6801', name: 'PC1' },
        { port: 'Gi0/1', mac: '0050.7966.6802', name: 'PC2' }
      ],
      dhcpServers: [{ ip: '10.99.0.5', pools: [{ network: '192.168.20.0', len: 24, start: '192.168.20.51', router: '192.168.20.1' }] }]
    },
    suggestedShow: ['show ip dhcp pool', 'show ip dhcp binding', 'show running-config | section dhcp', 'show ip interface g0/1'],
    checks: [
      { label: 'Pool LAN10 serves 192.168.10.0/24', test: (d) => d.dhcpPools.some((p) => p.name === 'LAN10' && p.network === '192.168.10.0' && maskToPrefix(p.mask ?? '') === 24), hint: 'The pool network is 192.168.1.0. Under ip dhcp pool LAN10: network 192.168.10.0 255.255.255.0' },
      { label: 'LAN 10 clients get 192.168.10.1 as their gateway', test: (d) => JSON.stringify(d.dhcpPools.find((p) => p.name === 'LAN10')?.routers) === '["192.168.10.1"]', hint: 'default-router 192.168.10.254 points at nothing. Under the pool: default-router 192.168.10.1' },
      { label: 'PC1 leases 192.168.10.11', test: (d, sim) => dhcpBindings(sim).some((b) => b.ip === '192.168.10.11'), hint: 'Check show ip dhcp binding after fixing the pool network.' },
      { label: 'G0/1 relays to 10.99.0.5', test: (d) => Boolean(ifc(d, 'gi0/1')?.helpers.includes('10.99.0.5')), hint: 'interface g0/1, ip helper-address 10.99.0.5' },
      { label: 'PC2 leases 192.168.20.51 from the central server', test: (d, sim) => relayLeases(sim).some((l) => l.ip === '192.168.20.51'), hint: 'The relay needs a route to 10.99.0.5. show ip route 10.99.0.5 should find one.' }
    ],
    solution: ['enable', 'show ip dhcp pool', 'configure terminal', 'ip dhcp pool LAN10', 'network 192.168.10.0 255.255.255.0', 'default-router 192.168.10.1', 'exit', 'interface g0/1', 'ip helper-address 10.99.0.5', 'end', 'show ip dhcp binding', 'show ip arp'],
    reflection: [
      'Which show command told you the pool network did not match any interface?',
      'Why would a wrong default-router still hand out leases, yet leave users stuck on their own subnet?',
      'Where must ip helper-address go: on the interface facing the clients or the one facing the server?'
    ]
  },
  {
    id: 'cl-ts-hsrp',
    topic: 'ccna-fhrp',
    kind: 'troubleshoot',
    minutes: 10,
    domainId: 3,
    title: 'Troubleshoot: HSRP with two active routers',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'R1 and R2 should share virtual gateway 192.168.1.254 in HSRP group 10, with R1 active. Right now each router thinks it is active. Fix R1.',
    scenario: 'R2 (192.168.1.3) is configured correctly: group 10, virtual IP 192.168.1.254, default priority, and it is active right now. R1 (192.168.1.2) was set up by someone working from an old design document.',
    symptoms: ['show standby brief on R1 shows a group Active with the standby router unknown.', 'Hosts using 192.168.1.254 always go through R2, even though R1 has the faster uplink.', 'A few hosts were given 192.168.1.253 as their gateway.'],
    topology: [
      { device: 'R1', port: 'G0/0', address: '192.168.1.2 /24', link: 'LAN switch' },
      { device: 'R2', port: 'G0/0', address: '192.168.1.3 /24, HSRP group 10 active', link: 'LAN switch' },
      { device: 'VIP', port: '-', address: '192.168.1.254', link: 'Hosts\' default gateway' }
    ],
    brief: [
      'Compare show standby brief on R1 with R2\'s settings above.',
      'R1 must join R2\'s group with the right virtual IP and leave no stray group behind.',
      'R1 must take over as active and stay active whenever it is up.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 192.168.1.2 255.255.255.0', 'no shutdown', 'standby 1 ip 192.168.1.253', 'standby 1 priority 90'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [
        { port: 'Gi0/0', device: 'R2', remotePort: 'GigabitEthernet0/0', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '192.168.1.3', hsrp: { group: 10, priority: 100, active: true, ip: '192.168.1.254' } },
        { port: 'Gi0/0', kind: 'host', device: 'PC1', ip: '192.168.1.10', mac: '0050.7966.6801' }
      ]
    },
    suggestedShow: ['show standby brief', 'show standby', 'show running-config interface g0/0'],
    checks: [
      { label: 'No stray HSRP group 1 is left on G0/0', test: (d) => !ifc(d, 'gi0/0')?.hsrp.some((g) => g.group === 1), hint: 'Remove the wrong group: no standby 1' },
      { label: 'Group 10 uses virtual IP 192.168.1.254', test: (d) => ifc(d, 'gi0/0')?.hsrp.find((g) => g.group === 10)?.ip === '192.168.1.254', hint: 'standby 10 ip 192.168.1.254' },
      { label: 'R1 has a higher priority than R2 in group 10', test: (d) => (ifc(d, 'gi0/0')?.hsrp.find((g) => g.group === 10)?.priority ?? 100) > 100, hint: 'standby 10 priority 110' },
      { label: 'Preempt is enabled for group 10', test: (d) => Boolean(ifc(d, 'gi0/0')?.hsrp.find((g) => g.group === 10)?.preempt), hint: 'standby 10 preempt' },
      { label: 'R1 is active with R2 as standby', test: (d, sim) => hsrpGroups(sim).some((g) => g.group === 10 && g.state === 'Active' && g.standby === '192.168.1.3'), hint: 'A higher priority only takes over from an active router when preempt is on.' }
    ],
    solution: ['enable', 'show standby brief', 'configure terminal', 'interface g0/0', 'no standby 1', 'standby 10 ip 192.168.1.254', 'standby 10 priority 110', 'standby 10 preempt', 'end', 'show standby brief'],
    reflection: [
      'Why could both routers report Active at the same time?',
      'What happens to hosts when two routers answer ARP for different virtual IPs?',
      'Without preempt, when would R1 ever become active?'
    ]
  },
  {
    id: 'cl-ts-static',
    topic: 'ccna-static-routing',
    kind: 'troubleshoot',
    minutes: 12,
    domainId: 3,
    title: 'Troubleshoot: static routes on a transit router',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'R2',
    objective: 'R2 sits between R1\'s branch LAN and R3, the internet edge. Three static routing faults break traffic in different ways. Find and fix all three.',
    scenario: 'R1\'s LAN is 192.168.1.0/24 and R3\'s LAN is 192.168.3.0/24. Internet traffic should leave through R3 (10.0.23.2). R1 also has a backup internet link, so R2 keeps a backup default route through R1 that must stay out of the table while R3 is up.',
    symptoms: ['Pings from R2 to 192.168.1.10 succeed only some of the time (!.!.!).', 'Nothing reaches 192.168.3.0/24, yet show ip route lists a route for it.', 'Internet traffic is being split across the slow backup path through R1.'],
    topology: [
      { device: 'R2', port: 'G0/0', address: '192.168.2.1 /24', link: 'R2 LAN' },
      { device: 'R2', port: 'G0/1', address: '10.0.12.2 /30', link: 'R1 10.0.12.1, LAN 192.168.1.0/24, backup internet' },
      { device: 'R2', port: 'G0/2', address: '10.0.23.1 /30', link: 'R3 10.0.23.2, LAN 192.168.3.0/24, internet' }
    ],
    brief: [
      'Start with show ip route static and look closely at every next hop and distance.',
      'R2 needs a route to R1\'s LAN, and the route to R3\'s LAN must point at R3.',
      'The default route through R1 is a floating backup: give it administrative distance 250.',
      'Prove it: ping 192.168.1.10 and 192.168.3.10 with 100 percent success.'
    ],
    startingConfig: ['hostname R2', 'interface g0/0', 'ip address 192.168.2.1 255.255.255.0', 'no shutdown', 'interface g0/1', 'ip address 10.0.12.2 255.255.255.252', 'no shutdown', 'interface g0/2', 'ip address 10.0.23.1 255.255.255.252', 'no shutdown', 'exit', 'ip route 192.168.3.0 255.255.255.0 10.0.23.3', 'ip route 0.0.0.0 0.0.0.0 10.0.23.2', 'ip route 0.0.0.0 0.0.0.0 10.0.12.1'],
    env: {
      connected: ['Gi0/0', 'Gi0/1', 'Gi0/2'],
      neighbors: [
        { port: 'Gi0/1', device: 'R1', remotePort: 'GigabitEthernet0/1', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.12.1', behind: ['192.168.1.0/24'] },
        { port: 'Gi0/2', device: 'R3', remotePort: 'GigabitEthernet0/2', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '10.0.23.2', behind: ['192.168.3.0/24', '8.0.0.0/8', '93.184.216.0/24'] },
        { port: 'Gi0/0', kind: 'host', device: 'PC2', ip: '192.168.2.10', mac: '0050.7966.6802' }
      ]
    },
    suggestedShow: ['show ip route static', 'show ip route 192.168.3.10', 'show running-config | include ip route', 'show cdp neighbors detail'],
    checks: [
      { label: 'Route to R1\'s LAN 192.168.1.0/24 via 10.0.12.1', test: (d) => hasStatic(d, '192.168.1.0', '255.255.255.0', '10.0.12.1'), hint: 'R2 has no route back to R1\'s LAN; the default route only sometimes lands on R1. Add ip route 192.168.1.0 255.255.255.0 10.0.12.1' },
      { label: 'Route to 192.168.3.0/24 points at R3 (10.0.23.2)', test: (d) => hasStatic(d, '192.168.3.0', '255.255.255.0', '10.0.23.2') && !d.routes.some((r) => r.nextHop === '10.0.23.3'), hint: '10.0.23.3 is the broadcast address of the /30. Remove that route and add one via 10.0.23.2.' },
      { label: 'Backup default via R1 has AD 250', test: (d) => hasStatic(d, '0.0.0.0', '0.0.0.0', '10.0.12.1', 250) && hasStatic(d, '0.0.0.0', '0.0.0.0', '10.0.23.2'), hint: 'ip route 0.0.0.0 0.0.0.0 10.0.12.1 250 replaces the distance on the existing route.' },
      { label: 'Internet traffic uses only R3 while it is up', test: (d, sim) => { const r = lookupRoute(sim, '8.8.8.8'); return Boolean(r && r.paths.length === 1 && r.paths[0].nh === '10.0.23.2') }, hint: 'Two defaults with the same distance load-share. The floating one needs the higher AD.' },
      { label: '192.168.1.10 and 192.168.3.10 answer every ping', test: (d, sim) => pinged(sim, '192.168.1.10') && pinged(sim, '192.168.3.10'), hint: 'ping 192.168.1.10, then ping 192.168.3.10. Both need 100 percent.' }
    ],
    solution: ['enable', 'show ip route static', 'configure terminal', 'ip route 192.168.1.0 255.255.255.0 10.0.12.1', 'no ip route 192.168.3.0 255.255.255.0 10.0.23.3', 'ip route 192.168.3.0 255.255.255.0 10.0.23.2', 'ip route 0.0.0.0 0.0.0.0 10.0.12.1 250', 'end', 'show ip route static', 'ping 192.168.1.10', 'ping 192.168.3.10'],
    reflection: [
      'Why did pings to 192.168.1.10 show !.!.! before you added the specific route?',
      'Why did IOS accept a route to 10.0.23.3 even though no router answers there?',
      'With the backup default at AD 250, what has to happen before it appears in the routing table?'
    ]
  },
  {
    id: 'cl-ts-portsec',
    topic: 'ccna-layer2-security',
    kind: 'troubleshoot',
    minutes: 10,
    domainId: 5,
    title: 'Troubleshoot: port security err-disabled two ports',
    difficulty: 'challenge',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'Two desks lost their network this morning. Port security shut both ports for different reasons. Recover them without weakening security more than needed, and make the fix survive a reload.',
    scenario: 'G0/3: a user got a new PC (0050.7966.6803), but the port still holds the old PC\'s sticky MAC (0050.7966.aaaa). G0/4: an IP phone was installed with a PC plugged into the phone\'s switch port, so two MAC addresses now arrive on a port that allows one.',
    symptoms: ['Both G0/3 and G0/4 show err-disabled in show interfaces status.', 'The log shows %PORT_SECURITY-2-PSECURE_VIOLATION for each port.', 'Shutting and re-enabling G0/3 alone puts it straight back into err-disabled.'],
    topology: [
      { device: 'SW1', port: 'G0/3', address: 'VLAN 10, sticky, max 1', link: 'NEW-PC 0050.7966.6803' },
      { device: 'SW1', port: 'G0/4', address: 'VLAN 10, voice 110, max 1', link: 'PHONE4 0004.f2aa.0004 and PC4 0050.7966.6804' }
    ],
    brief: [
      'Read show port-security and show port-security address to see why each port tripped.',
      'G0/3: remove the old sticky MAC so the new PC can be learned, then recover the port.',
      'G0/4: allow two MAC addresses (phone and PC), then recover the port.',
      'Save the configuration so the new sticky MAC survives a reload.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'name DATA', 'vlan 110', 'name VOICE', 'exit', 'interface g0/3', 'switchport mode access', 'switchport access vlan 10', 'switchport port-security mac-address sticky', 'switchport port-security mac-address sticky 0050.7966.aaaa', 'switchport port-security', 'interface g0/4', 'switchport mode access', 'switchport access vlan 10', 'switchport voice vlan 110', 'switchport port-security'],
    env: {
      connected: ['Gi0/3', 'Gi0/4'],
      neighbors: [
        { port: 'Gi0/3', kind: 'host', device: 'NEW-PC', ip: '10.0.10.13', mac: '0050.7966.6803' },
        { port: 'Gi0/4', kind: 'host', device: 'PHONE4', mac: '0004.f2aa.0004' },
        { port: 'Gi0/4', kind: 'host', device: 'PC4', ip: '10.0.10.14', mac: '0050.7966.6804' }
      ]
    },
    suggestedShow: ['show interfaces status err-disabled', 'show port-security', 'show port-security address', 'show port-security interface g0/3'],
    checks: [
      { label: 'G0/3 is back up', test: (d, sim) => !sim.op.errdisabled.includes('GigabitEthernet0/3') && ifc(d, 'gi0/3')?.shutdown === false, hint: 'Remove the old sticky MAC first, then shutdown and no shutdown.' },
      { label: 'G0/3 holds only the new PC\'s sticky MAC', test: (d) => JSON.stringify(ifc(d, 'gi0/3')?.portSecurity?.stickyMacs) === '["0050.7966.6803"]', hint: 'no switchport port-security mac-address sticky 0050.7966.aaaa (or clear port-security sticky interface g0/3)' },
      { label: 'G0/4 allows two MAC addresses', test: (d) => (ifc(d, 'gi0/4')?.portSecurity?.max ?? 1) === 2, hint: 'switchport port-security maximum 2' },
      { label: 'G0/4 is back up', test: (d, sim) => !sim.op.errdisabled.includes('GigabitEthernet0/4') && ifc(d, 'gi0/4')?.shutdown === false, hint: 'After raising the maximum: shutdown, then no shutdown.' },
      { label: 'The new sticky MAC is saved', test: (d, sim) => saved(sim, (s) => (s.interfaces['GigabitEthernet0/3']?.portSecurity?.stickyMacs ?? []).includes('0050.7966.6803')), hint: 'copy running-config startup-config' }
    ],
    solution: ['enable', 'show interfaces status err-disabled', 'show port-security', 'configure terminal', 'interface g0/3', 'no switchport port-security mac-address sticky 0050.7966.aaaa', 'shutdown', 'no shutdown', 'interface g0/4', 'switchport port-security maximum 2', 'shutdown', 'no shutdown', 'end', 'show port-security address', 'copy running-config startup-config'],
    reflection: [
      'Why did shutdown and no shutdown alone not fix G0/3?',
      'Why is maximum 2 the right number for a phone with a PC behind it, and not something like 10?',
      'Sticky MACs live in the running config. What happens to them after a reload if you forget to save?'
    ]
  },
  {
    id: 'cl-ts-ssh',
    topic: 'ccna-ssh-tftp-ftp',
    kind: 'troubleshoot',
    minutes: 9,
    domainId: 4,
    title: 'Troubleshoot: SSH will not connect',
    difficulty: 'core',
    deviceKind: 'router',
    hostname: 'R1',
    objective: 'Admins cannot SSH to R1, and the security team wants Telnet gone. Find what is missing or wrong and make SSH version 2 work with the local admin account.',
    scenario: 'A local user admin already exists. Someone started the SSH setup but never finished it, and the VTY lines are still set up the old way.',
    symptoms: ['ssh -l admin 192.168.1.1 from ADMIN-PC says Connection refused.', 'show ip ssh reports SSH Disabled.', 'Telnet to R1 still connects but asks for a password nobody knows.'],
    topology: [{ device: 'R1', port: 'G0/0', address: '192.168.1.1 /24', link: 'ADMIN-PC 192.168.1.10' }],
    brief: [
      'Check show ip ssh and show running-config | section line vty.',
      'SSH needs RSA keys, and the keys need a domain name first.',
      'VTY lines must accept only SSH and authenticate with the local username.'
    ],
    startingConfig: ['hostname R1', 'interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'exit', 'username admin privilege 15 secret Adm1nPass', 'ip ssh version 2', 'line vty 0 4', 'login', 'transport input telnet'],
    env: {
      connected: ['Gi0/0'],
      neighbors: [{ port: 'Gi0/0', kind: 'host', device: 'ADMIN-PC', ip: '192.168.1.10', mac: '0050.7966.6810' }]
    },
    suggestedShow: ['show ip ssh', 'show running-config | section line vty', 'show running-config | include domain|username'],
    checks: [
      { label: 'An IP domain name is set', test: (d) => Boolean(d.domainName), hint: 'ip domain-name lab.local (crypto key generate refuses to run without it)' },
      { label: 'RSA keys of at least 768 bits exist', test: (d) => (d.rsaModulus ?? 0) >= 768, hint: 'crypto key generate rsa modulus 2048' },
      { label: 'SSH version 2 is running', test: (d) => d.sshVersion === 2 && (d.rsaModulus ?? 0) >= 768, hint: 'show ip ssh should say SSH Enabled - version 2.0' },
      { label: 'VTY 0 4 accepts SSH only', test: (d) => JSON.stringify(d.lines.vty.transport) === '["ssh"]', hint: 'line vty 0 4, transport input ssh' },
      { label: 'VTY 0 4 uses local usernames', test: (d) => d.lines.vty.login === 'local', hint: 'line vty 0 4, login local' }
    ],
    solution: ['enable', 'show ip ssh', 'configure terminal', 'ip domain-name lab.local', 'crypto key generate rsa modulus 2048', 'line vty 0 4', 'transport input ssh', 'login local', 'end', 'show ip ssh'],
    reflection: [
      'Why did ip ssh version 2 not turn SSH on by itself?',
      'login and login local look alike. What does each one check?',
      'Which show command proves that Telnet is now refused?'
    ]
  },
  {
    id: 'cl-ts-etherchannel',
    topic: 'ccna-etherchannel',
    kind: 'troubleshoot',
    minutes: 12,
    domainId: 2,
    title: 'Troubleshoot: EtherChannel will not bundle',
    difficulty: 'challenge',
    deviceKind: 'switch',
    hostname: 'SW1',
    objective: 'The two links from SW1 to SW2 should form one LACP port-channel trunk. Instead both ports are down. Find both faults and bring Po1 up with both links bundled.',
    scenario: 'SW2 is configured correctly: G0/1 and G0/2 in channel-group 1 mode active, as a trunk allowing all VLANs. SW1\'s side was configured by hand, one port at a time.',
    symptoms: ['show interfaces status shows G0/1 and G0/2 err-disabled.', 'The log shows %SPANTREE-2-CHNL_MISCFG for the bundle.', 'Even before the outage, a user noticed VLAN 20 never crossed one of the links.'],
    topology: [
      { device: 'SW1', port: 'G0/1', address: 'Po1 member', link: 'SW2 G0/1 (LACP active)' },
      { device: 'SW1', port: 'G0/2', address: 'Po1 member', link: 'SW2 G0/2 (LACP active)' }
    ],
    brief: [
      'Check show etherchannel summary and show interfaces status err-disabled.',
      'SW1 must negotiate with LACP to match SW2.',
      'Both members need identical trunk settings, or the odd one is suspended.',
      'Recover err-disabled members with shutdown, then no shutdown.'
    ],
    startingConfig: ['hostname SW1', 'vlan 10', 'vlan 20', 'exit', 'interface range g0/1 - 2', 'switchport mode trunk', 'channel-group 1 mode on', 'interface g0/2', 'switchport trunk allowed vlan 10'],
    env: {
      connected: ['Gi0/1', 'Gi0/2'],
      neighbors: [
        { port: 'Gi0/1', device: 'SW2', remotePort: 'GigabitEthernet0/1', platform: 'WS-C2960G-24TC-L', capability: 'S I', channel: 'active', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.9a00' } },
        { port: 'Gi0/2', device: 'SW2', remotePort: 'GigabitEthernet0/2', platform: 'WS-C2960G-24TC-L', capability: 'S I', channel: 'active', trunk: { mode: 'trunk', native: 1 }, stp: { priority: 32768, mac: '0019.e86a.9a00' } }
      ]
    },
    suggestedShow: ['show etherchannel summary', 'show interfaces status err-disabled', 'show running-config interface g0/2', 'show interfaces trunk'],
    checks: [
      { label: 'Both links negotiate with LACP', test: (d) => ['gi0/1', 'gi0/2'].every((n) => ['active', 'passive'].includes(ifc(d, n)?.channelGroup?.mode) && ifc(d, n)?.channelGroup?.id === 1), hint: 'interface range g0/1 - 2, channel-group 1 mode active (mode on never sends LACP)' },
      { label: 'G0/2 has the same trunk settings as G0/1', test: (d) => ifc(d, 'gi0/2')?.allowed === ifc(d, 'gi0/1')?.allowed && ifc(d, 'gi0/2')?.mode === 'trunk', hint: 'G0/2 was pruned to VLAN 10. interface g0/2, no switchport trunk allowed vlan' },
      { label: 'Neither link is err-disabled', test: (d, sim) => ['GigabitEthernet0/1', 'GigabitEthernet0/2'].every((n) => !sim.op.errdisabled.includes(n) && !d.interfaces[n].shutdown), hint: 'After fixing the mode: shutdown, then no shutdown on both ports.' },
      { label: 'Po1 is in use with both links bundled', test: (d, sim) => { const m = etherchannelMembers(sim, 1); return m.length === 2 && m.every((x) => x.flag === 'P') }, hint: 'show etherchannel summary should show Po1(SU) with Gi0/1(P) and Gi0/2(P).' }
    ],
    solution: ['enable', 'show etherchannel summary', 'show interfaces status err-disabled', 'configure terminal', 'interface range g0/1 - 2', 'channel-group 1 mode active', 'shutdown', 'no shutdown', 'interface g0/2', 'no switchport trunk allowed vlan', 'end', 'show etherchannel summary'],
    reflection: [
      'Why does mode on facing mode active cause a loop risk, and what feature caught it?',
      'Which settings must match on every member of a bundle?',
      'Why did the VLAN 10 pruning on G0/2 only show up as (s) after the err-disable was fixed?'
    ]
  },
  {
    id: 'cl-cap-branch-router',
    topic: 'ccna-nat',
    kind: 'build',
    minutes: 35,
    domainId: 4,
    title: 'Capstone: build a branch router from scratch',
    difficulty: 'challenge',
    deviceKind: 'router',
    hostname: 'BR1',
    objective: 'Take a factory-fresh router and turn it into a working, secured branch edge: addressing, DHCP, PAT to the internet, a default route, SSH with a VTY ACL, NTP, syslog, and a saved configuration.',
    scenario: 'A new branch office opens tomorrow. The ISP hands you 203.0.113.6/30 with their router at .5. The LAN is 192.168.50.0/24: the router is .1, the admin PC is .10, the syslog server is .20, and DHCP clients start at .21. The ISP runs an NTP server at 198.51.100.10.',
    topology: [
      { device: 'BR1', port: 'G0/0', address: '192.168.50.1 /24', link: 'LAN: ADMIN-PC .10, SYSLOG .20, DHCP clients' },
      { device: 'BR1', port: 'G0/1', address: '203.0.113.6 /30', link: 'ISP 203.0.113.5' },
      { device: 'ISP', port: '-', address: 'NTP 198.51.100.10', link: 'Internet' }
    ],
    brief: [
      'Name the router BR1. Address G0/0 and G0/1 and bring them up.',
      'Default route to the ISP.',
      'DHCP pool LAN for 192.168.50.0/24, excluding .1 to .20, with gateway .1 and DNS 8.8.8.8.',
      'PAT: ACL 1 matches the LAN; translate it to G0/1\'s address with overload.',
      'SSH: domain branch.local, user admin with a secret, 2048-bit keys, version 2, VTY login local and SSH only.',
      'Only the admin PC (192.168.50.10) may open a VTY session: standard ACL 10 with access-class.',
      'Sync time from 198.51.100.10, send syslog at warnings and above to 192.168.50.20, and save.'
    ],
    env: {
      connected: ['Gi0/0', 'Gi0/1'],
      neighbors: [
        { port: 'Gi0/1', device: 'ISP', remotePort: 'GigabitEthernet0/2', platform: 'CISCO2911/K9', capability: 'R B S I', ip: '203.0.113.5', behind: ['0.0.0.0/0'] },
        { port: 'Gi0/0', kind: 'host', device: 'ADMIN-PC', ip: '192.168.50.10', mac: '0050.7966.6810' },
        { port: 'Gi0/0', kind: 'host', device: 'SYSLOG', ip: '192.168.50.20', mac: '0050.7966.6820' }
      ],
      dhcpClients: [{ port: 'Gi0/0', mac: '0050.7966.6821', name: 'PC1' }],
      ntp: { '198.51.100.10': 2 },
      natFlows: [
        { proto: 'tcp', src: '192.168.50.21', sport: 50111, dst: '93.184.216.34', dport: 443 },
        { proto: 'udp', src: '192.168.50.21', sport: 53001, dst: '8.8.8.8', dport: 53 }
      ]
    },
    suggestedShow: ['show ip interface brief', 'show ip dhcp binding', 'show ip nat translations', 'show ip ssh', 'show ntp status', 'show running-config'],
    checks: [
      { label: 'Hostname is BR1', test: (d) => d.hostname === 'BR1', hint: 'hostname BR1' },
      { label: 'LAN G0/0 is 192.168.50.1/24 and up', test: (d) => ifUpWithIp(d, 'gi0/0', '192.168.50.1', 24), hint: 'interface g0/0, ip address 192.168.50.1 255.255.255.0, no shutdown' },
      { label: 'WAN G0/1 is 203.0.113.6/30 and up', test: (d) => ifUpWithIp(d, 'gi0/1', '203.0.113.6', 30), hint: 'interface g0/1, ip address 203.0.113.6 255.255.255.252, no shutdown' },
      { label: 'Default route via the ISP', test: (d) => hasStatic(d, '0.0.0.0', '0.0.0.0', '203.0.113.5'), hint: 'ip route 0.0.0.0 0.0.0.0 203.0.113.5' },
      { label: 'DHCP excludes 192.168.50.1 to .20', test: (d) => d.dhcpExcluded.some(([a, b]) => a === '192.168.50.1' && b === '192.168.50.20'), hint: 'ip dhcp excluded-address 192.168.50.1 192.168.50.20' },
      { label: 'PC1 leases .21 with gateway .1 and DNS 8.8.8.8', test: (d, sim) => { const p = d.dhcpPools.find((x) => x.network === '192.168.50.0'); return Boolean(p && p.routers?.[0] === '192.168.50.1' && p.dns?.includes('8.8.8.8') && dhcpBindings(sim).some((b) => b.ip === '192.168.50.21')) }, hint: 'ip dhcp pool LAN, network 192.168.50.0 255.255.255.0, default-router 192.168.50.1, dns-server 8.8.8.8' },
      { label: 'PAT translates the LAN to G0/1', test: (d, sim) => natTranslations(sim).some((t) => t.kind === 'pat' && t.insideGlobal.startsWith('203.0.113.6:')), hint: 'ip nat inside on G0/0, ip nat outside on G0/1, access-list 1 permit 192.168.50.0 0.0.0.255, ip nat inside source list 1 interface g0/1 overload' },
      { label: 'SSH version 2 is enabled with 2048-bit keys', test: (d) => Boolean(d.domainName) && (d.rsaModulus ?? 0) >= 2048 && d.sshVersion === 2 && d.users.some((u) => u.kind === 'secret'), hint: 'ip domain-name branch.local, username admin privilege 15 secret ..., crypto key generate rsa modulus 2048, ip ssh version 2' },
      { label: 'VTY lines: local logins, SSH only', test: (d) => d.lines.vty.login === 'local' && JSON.stringify(d.lines.vty.transport) === '["ssh"]', hint: 'line vty 0 4, login local, transport input ssh' },
      { label: 'Only the admin PC can open a VTY session', test: (d) => { const ac = d.lines.vty.accessClass; return Boolean(ac && ac.dir === 'in' && aclSays(d, ac.acl, { src: '192.168.50.10' }) === 'permit' && aclSays(d, ac.acl, { src: '192.168.50.99' }) !== 'permit') }, hint: 'access-list 10 permit host 192.168.50.10, then under line vty 0 4: access-class 10 in' },
      { label: 'Clock is synchronized to 198.51.100.10', test: (d, sim) => ntpState(sim).server === '198.51.100.10', hint: 'ntp server 198.51.100.10 (it is reachable once the default route works)' },
      { label: 'Syslog to 192.168.50.20 at warnings', test: (d) => d.logging.hosts.includes('192.168.50.20') && d.logging.trap === 'warnings', hint: 'logging host 192.168.50.20, logging trap warnings' },
      { label: 'The configuration is saved', test: (d, sim) => saved(sim, (s) => s.hostname === 'BR1' && s.nat.rules.length > 0 && s.dhcpPools.length > 0 && Boolean(s.lines.vty.accessClass)), hint: 'copy running-config startup-config when everything else passes' }
    ],
    solution: [
      'enable', 'configure terminal', 'hostname BR1',
      'interface g0/0', 'ip address 192.168.50.1 255.255.255.0', 'ip nat inside', 'no shutdown',
      'interface g0/1', 'ip address 203.0.113.6 255.255.255.252', 'ip nat outside', 'no shutdown', 'exit',
      'ip route 0.0.0.0 0.0.0.0 203.0.113.5',
      'ip dhcp excluded-address 192.168.50.1 192.168.50.20', 'ip dhcp pool LAN', 'network 192.168.50.0 255.255.255.0', 'default-router 192.168.50.1', 'dns-server 8.8.8.8', 'exit',
      'access-list 1 permit 192.168.50.0 0.0.0.255', 'ip nat inside source list 1 interface g0/1 overload',
      'ip domain-name branch.local', 'username admin privilege 15 secret Br4nchAdm1n', 'crypto key generate rsa modulus 2048', 'ip ssh version 2',
      'access-list 10 permit host 192.168.50.10', 'line vty 0 4', 'login local', 'transport input ssh', 'access-class 10 in', 'exit',
      'ntp server 198.51.100.10', 'logging host 192.168.50.20', 'logging trap warnings', 'end',
      'show ip nat translations', 'copy running-config startup-config'
    ],
    reflection: [
      'Which pieces of this build depend on others (for example, NTP needs the default route)? In what order would you configure them on a real router?',
      'Why does the VTY ACL use a standard ACL, and why is access-class used instead of ip access-group?',
      'Which three show commands would you run first if users at this branch said "the internet is down"?'
    ]
  },
  {
    id: 'cl-cap-access-switch',
    topic: 'ccna-vlans',
    kind: 'build',
    minutes: 30,
    domainId: 2,
    title: 'Capstone: build an access switch from scratch',
    difficulty: 'challenge',
    deviceKind: 'switch',
    hostname: 'ASW1',
    objective: 'Take a factory-fresh switch and make it a production access switch: data and voice VLANs, secured edge ports, a trunk with a dedicated native VLAN, a management SVI and gateway, SSH, and a saved configuration.',
    scenario: 'ASW1 serves a floor of desks, each with an IP phone and a PC behind it. G0/1 - G0/12 are desk ports. G0/24 trunks to the distribution switch DSW1, which already uses native VLAN 99 and allows VLANs 10, 99 and 110. Management lives in VLAN 99, where DSW1 is the gateway at 192.168.99.1.',
    topology: [
      { device: 'ASW1', port: 'G0/1 - G0/12', address: 'Data VLAN 10, voice VLAN 110', link: 'Desks (phone + PC)' },
      { device: 'ASW1', port: 'G0/24', address: 'Trunk, native 99, allows 10,99,110', link: 'DSW1 G0/1' },
      { device: 'ASW1', port: 'Vlan99', address: '192.168.99.11 /24', link: 'Gateway DSW1 192.168.99.1' }
    ],
    brief: [
      'Name the switch ASW1. Create VLAN 10 USERS, VLAN 99 MGMT and VLAN 110 VOICE.',
      'Desk ports G0/1 - G0/12: static access in VLAN 10 with voice VLAN 110, PortFast and BPDU guard, and port security allowing 2 MAC addresses.',
      'G0/24: trunk with native VLAN 99, allowing only 10, 99 and 110.',
      'Management: Vlan99 at 192.168.99.11/24, default gateway 192.168.99.1, and ping the gateway.',
      'SSH: domain campus.local, user admin with a secret, 2048-bit keys, all VTY lines login local and SSH only. Then save.'
    ],
    env: {
      connected: ['Gi0/1', 'Gi0/2', 'Gi0/24'],
      neighbors: [
        { port: 'Gi0/1', kind: 'host', device: 'PHONE1', mac: '0004.f2aa.0001' },
        { port: 'Gi0/1', kind: 'host', device: 'PC1', ip: '10.0.10.11', mac: '0050.7966.6801' },
        { port: 'Gi0/2', kind: 'host', device: 'PC2', ip: '10.0.10.12', mac: '0050.7966.6802' },
        { port: 'Gi0/24', device: 'DSW1', remotePort: 'GigabitEthernet0/1', platform: 'WS-C3560G-24TS', capability: 'R S I', ip: '192.168.99.1', vlan: 99, trunk: { mode: 'trunk', native: 99, allowed: '10,99,110' }, stp: { priority: 4096, mac: '0022.0dc4.1a00' } }
      ]
    },
    suggestedShow: ['show vlan brief', 'show interfaces trunk', 'show port-security', 'show ip interface brief', 'show running-config'],
    checks: [
      { label: 'Hostname is ASW1', test: (d) => d.hostname === 'ASW1', hint: 'hostname ASW1' },
      { label: 'VLANs 10 USERS, 99 MGMT and 110 VOICE exist', test: (d) => d.vlans[10] === 'USERS' && d.vlans[99] === 'MGMT' && d.vlans[110] === 'VOICE', hint: 'vlan 10, name USERS, then the same for 99 MGMT and 110 VOICE' },
      { label: 'Desk ports are access VLAN 10 with voice VLAN 110', test: (d) => range(1, 12).every((n) => { const i = ifc(d, `gi0/${n}`); return i?.mode === 'access' && i.accessVlan === 10 && i.voiceVlan === 110 }), hint: 'interface range g0/1 - 12, switchport mode access, switchport access vlan 10, switchport voice vlan 110' },
      { label: 'Desk ports have PortFast and BPDU guard', test: (d) => range(1, 12).every((n) => ifc(d, `gi0/${n}`)?.portfast === 'enable' && ifc(d, `gi0/${n}`)?.bpduguard === 'enable'), hint: 'spanning-tree portfast and spanning-tree bpduguard enable on the range' },
      { label: 'Desk ports run port security with maximum 2', test: (d) => range(1, 12).every((n) => ifc(d, `gi0/${n}`)?.portSecurity?.enabled && ifc(d, `gi0/${n}`)?.portSecurity?.max === 2), hint: 'switchport port-security maximum 2, then switchport port-security' },
      { label: 'G0/24 trunks 10, 99 and 110 with native VLAN 99', test: (d, sim) => trunkPort(d, 'gi0/24') && ifc(d, 'gi0/24').nativeVlan === 99 && ifc(d, 'gi0/24').allowed === '10,99,110' && !nativeMismatch(sim, 'GigabitEthernet0/24'), hint: 'interface g0/24, switchport mode trunk, switchport trunk native vlan 99, switchport trunk allowed vlan 10,99,110' },
      { label: 'Vlan99 is 192.168.99.11/24 and up', test: (d, sim) => hasIp(d, 'vlan99', '192.168.99.11', 24) && isUp(sim, 'Vlan99'), hint: 'interface vlan 99, ip address 192.168.99.11 255.255.255.0, no shutdown' },
      { label: 'Default gateway 192.168.99.1 answers a ping', test: (d, sim) => d.defaultGateway === '192.168.99.1' && pinged(sim, '192.168.99.1'), hint: 'ip default-gateway 192.168.99.1, then ping 192.168.99.1' },
      { label: 'SSH only, with local logins on every VTY line', test: (d) => Boolean(d.domainName) && (d.rsaModulus ?? 0) >= 2048 && ['vty', 'vty2'].every((g) => d.lines[g].login === 'local' && JSON.stringify(d.lines[g].transport) === '["ssh"]'), hint: 'ip domain-name campus.local, username admin secret ..., crypto key generate rsa modulus 2048, line vty 0 15, login local, transport input ssh' },
      { label: 'The configuration is saved', test: (d, sim) => saved(sim, (s) => s.hostname === 'ASW1' && s.interfaces['Vlan99']?.ip === '192.168.99.11'), hint: 'copy running-config startup-config' }
    ],
    solution: [
      'enable', 'configure terminal', 'hostname ASW1',
      'vlan 10', 'name USERS', 'vlan 99', 'name MGMT', 'vlan 110', 'name VOICE', 'exit',
      'interface range g0/1 - 12', 'switchport mode access', 'switchport access vlan 10', 'switchport voice vlan 110', 'spanning-tree portfast', 'spanning-tree bpduguard enable', 'switchport port-security maximum 2', 'switchport port-security',
      'interface g0/24', 'switchport mode trunk', 'switchport trunk native vlan 99', 'switchport trunk allowed vlan 10,99,110',
      'interface vlan 99', 'ip address 192.168.99.11 255.255.255.0', 'no shutdown', 'exit',
      'ip default-gateway 192.168.99.1',
      'ip domain-name campus.local', 'username admin privilege 15 secret Sw1tchAdm1n', 'crypto key generate rsa modulus 2048',
      'line vty 0 15', 'login local', 'transport input ssh', 'end',
      'ping 192.168.99.1', 'copy running-config startup-config'
    ],
    reflection: [
      'Why use a dedicated, otherwise unused VLAN as the native VLAN instead of VLAN 1?',
      'Why is maximum 2 right for a desk with a phone and a PC behind it?',
      'A Layer 2 switch needs ip default-gateway for its own traffic. Why does it not need a routing table?'
    ]
  }

]

const LAB_MAP = new Map(CONSOLE_LABS.map((l) => [l.id, l]))

export function getConsoleLab(id) {
  return LAB_MAP.get(id) ?? null
}

/** Labs that practice a Recurse pack, build labs first. */
export function consoleLabsForTopic(packId) {
  return CONSOLE_LABS.filter((l) => l.topic === packId).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'build' ? -1 : 1))
}

export function consoleLabsForDomain(domainId) {
  return CONSOLE_LABS.filter((l) => l.domainId === domainId)
}

/** Score after a lab: drops a little for each hint or solution step used. */
export function labScore({ hints = 0, solutionSteps = 0 } = {}) {
  return Math.max(0.3, Math.round((1 - hints * 0.08 - solutionSteps * 0.12) * 100) / 100)
}
