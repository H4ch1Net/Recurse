// Two switches, three hosts each, one inter-switch link. Hosts get an address in their
// VLAN's subnet (VLAN 10 is 10.0.10.0/24 and so on), so a VLAN really is a subnet here.
// The link is either an access port in one VLAN or an 802.1Q trunk with an allowed
// list and a native VLAN on each side.

export const VLANS = [1, 10, 20, 30]
export const GOAL_VLANS = [10, 20, 30]
export const SWITCHES = ['SW1', 'SW2']
export const LINK_PORT = 'Gi0/1'

export const HOSTS = [
  { id: 'PC1', sw: 'SW1', port: 'Fa0/1', n: 11 },
  { id: 'PC2', sw: 'SW1', port: 'Fa0/2', n: 12 },
  { id: 'PC3', sw: 'SW1', port: 'Fa0/3', n: 13 },
  { id: 'PC4', sw: 'SW2', port: 'Fa0/1', n: 21 },
  { id: 'PC5', sw: 'SW2', port: 'Fa0/2', n: 22 },
  { id: 'PC6', sw: 'SW2', port: 'Fa0/3', n: 23 }
]
const HOST_MAP = Object.fromEntries(HOSTS.map((h) => [h.id, h]))
export const hostById = (id) => HOST_MAP[id] || null
export const otherSwitch = (sw) => (sw === 'SW1' ? 'SW2' : 'SW1')

/** Factory defaults: every port in VLAN 1, the link an access port in VLAN 1. */
export function defaultConfig() {
  return {
    access: Object.fromEntries(HOSTS.map((h) => [h.id, 1])),
    link: { mode: 'access', accessVlan: 1, removed: [], native: { SW1: 1, SW2: 1 } }
  }
}

export const ipOf = (config, id) => `10.0.${config.access[id]}.${hostById(id).n}`
export const subnetOf = (vlan) => `10.0.${vlan}.0/24`

/** Allowed VLANs on the trunk, as IOS prints them: 1-4094 minus anything removed. */
export function allowedText(removed = []) {
  const cut = [...new Set(removed)].filter((v) => v >= 1 && v <= 4094).sort((a, b) => a - b)
  const ranges = []
  let start = 1
  for (const v of cut) {
    if (v > start) ranges.push([start, v - 1])
    start = v + 1
  }
  if (start <= 4094) ranges.push([start, 4094])
  return ranges.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(',') || 'none'
}

export const isAllowed = (link, vlan) => !link.removed.includes(vlan)

export function nativeMismatch(config) {
  const { link } = config
  return link.mode === 'trunk' && link.native.SW1 !== link.native.SW2
}

/** The CDP log line a real switch prints for a native VLAN mismatch, or null. */
export function mismatchLog(config) {
  if (!nativeMismatch(config)) return null
  const { native } = config.link
  return `%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0/1 (${native.SW1}), with SW2 GigabitEthernet0/1 (${native.SW2}).`
}

/**
 * One frame in `vlan` crossing the link from switch `from`. Returns
 * { ok, tag, landsIn, reason } where tag is the 802.1Q VLAN ID or null for untagged.
 */
export function crossLink(config, from, vlan) {
  const { link } = config
  const to = otherSwitch(from)
  if (link.mode === 'access') {
    if (vlan === link.accessVlan) return { ok: true, tag: null, landsIn: vlan, reason: null }
    return { ok: false, tag: null, landsIn: null, reason: 'access-link' }
  }
  if (!isAllowed(link, vlan)) return { ok: false, tag: null, landsIn: null, reason: 'not-allowed' }
  const tagged = vlan !== link.native[from]
  const landsIn = tagged ? vlan : link.native[to]
  if (!tagged && !isAllowed(link, landsIn)) return { ok: false, tag: null, landsIn: null, reason: 'native' }
  return { ok: landsIn === vlan, tag: tagged ? vlan : null, landsIn, reason: landsIn === vlan ? null : 'native' }
}

function crossReason(config, reason, from, vlan, dstName, leg) {
  const { link } = config
  const to = otherSwitch(from)
  if (reason === 'access-link') {
    return `The link between the switches is an access port in VLAN ${link.accessVlan}, so it carries only VLAN ${link.accessVlan}. VLAN ${vlan} frames have no way across. Make the link a trunk so it can carry several VLANs.`
  }
  if (reason === 'not-allowed') {
    return `VLAN ${vlan} is not in the trunk's allowed list, so ${from} will not send it across. Add it back with switchport trunk allowed vlan add ${vlan}.`
  }
  const lead = leg === 'reply' ? `The request got through, but the reply did not. ` : ''
  return `${lead}Native VLAN mismatch: ${from} sends VLAN ${vlan} untagged because it is ${from}'s native VLAN, and ${to} drops untagged frames into its own native VLAN ${link.native[to]}. The frame lands in the wrong VLAN and never reaches ${dstName}.`
}

/**
 * Ping from host a to host b: an echo request and an echo reply must both make it.
 * Returns { ok, vlan, crosses, tag, failAt, leg, reason, text }.
 * failAt is 'source-switch', 'link' or null; leg is 'request' or 'reply'.
 */
export function ping(config, a, b) {
  if (a === b) throw new Error('Pick two different hosts')
  const ha = hostById(a)
  const hb = hostById(b)
  const va = config.access[a]
  const vb = config.access[b]
  const crosses = ha.sw !== hb.sw
  if (va !== vb) {
    return {
      ok: false,
      vlan: va,
      crosses,
      tag: null,
      failAt: 'source-switch',
      leg: 'request',
      reason: 'different-vlan',
      text: `${a} is in VLAN ${va} (${ipOf(config, a)}) and ${b} is in VLAN ${vb} (${ipOf(config, b)}). Different VLANs are different subnets, so ${a} hands the packet to its default gateway, and there is no router here. Traffic between VLANs needs a router or a Layer 3 switch.`
    }
  }
  if (!crosses) {
    return { ok: true, vlan: va, crosses, tag: null, failAt: null, leg: null, reason: null, text: `${a} and ${b} are both in VLAN ${va} on ${ha.sw}. The switch forwards the frame between its own access ports; the link to the other switch is not involved.` }
  }
  const there = crossLink(config, ha.sw, va)
  if (!there.ok) return { ok: false, vlan: va, crosses, tag: there.tag, failAt: 'link', leg: 'request', reason: there.reason, landsIn: there.landsIn, text: crossReason(config, there.reason, ha.sw, va, b, 'request') }
  const back = crossLink(config, hb.sw, va)
  if (!back.ok) return { ok: false, vlan: va, crosses, tag: there.tag, failAt: 'link', leg: 'reply', reason: back.reason, landsIn: back.landsIn, text: crossReason(config, back.reason, hb.sw, va, a, 'reply') }
  const how = config.link.mode === 'access'
    ? `The link is an access port in VLAN ${va}, so the frame crosses untagged. That only works for this one VLAN.`
    : there.tag
      ? `On the trunk, ${ha.sw} inserts a 4-byte 802.1Q tag with VLAN ID ${va}. ${hb.sw} reads the tag, removes it, and sends the frame out the access port to ${b}.`
      : `VLAN ${va} is the native VLAN on both ends, so it crosses the trunk untagged and ${hb.sw} puts it back into VLAN ${va}.`
  return { ok: true, vlan: va, crosses, tag: there.tag, failAt: null, leg: null, reason: null, text: `Reply received from ${ipOf(config, b)}. ${how}` }
}

/** Progress toward the goal: one host per VLAN 10, 20 and 30 on each switch, and all three pairs reach each other. */
export function goalStatus(config) {
  const assigned = SWITCHES.every((sw) => GOAL_VLANS.every((v) => HOSTS.some((h) => h.sw === sw && config.access[h.id] === v)))
  const pairs = GOAL_VLANS.map((v) => {
    const a = HOSTS.find((h) => h.sw === 'SW1' && config.access[h.id] === v)
    const b = HOSTS.find((h) => h.sw === 'SW2' && config.access[h.id] === v)
    return { vlan: v, a: a?.id, b: b?.id, ok: Boolean(a && b && ping(config, a.id, b.id).ok) }
  })
  const trunk = config.link.mode === 'trunk' && GOAL_VLANS.every((v) => isAllowed(config.link, v))
  return { assigned, trunk, pairs, reach: pairs.every((p) => p.ok), done: assigned && pairs.every((p) => p.ok) }
}

// ---- Show commands ----------------------------------------------------------------------

const pad = (s, n) => String(s).padEnd(n, ' ')

/** `show vlan brief` for one switch. Trunk ports are not listed, just like IOS. */
export function showVlanBrief(config, sw) {
  const lines = ['VLAN Name              Status    Ports', '---- ----------------- --------- ------------------------']
  for (const v of VLANS) {
    const ports = HOSTS.filter((h) => h.sw === sw && config.access[h.id] === v).map((h) => h.port)
    if (config.link.mode === 'access' && config.link.accessVlan === v) ports.push(LINK_PORT)
    const name = v === 1 ? 'default' : `VLAN${String(v).padStart(4, '0')}`
    lines.push(`${pad(v, 5)}${pad(name, 18)}${pad('active', 10)}${ports.join(', ')}`)
  }
  return lines
}

/** `show interfaces trunk`. Empty when the link is not trunking, just like IOS. */
export function showInterfacesTrunk(config, sw) {
  const { link } = config
  if (link.mode !== 'trunk') return []
  const allowed = allowedText(link.removed)
  const active = VLANS.filter((v) => isAllowed(link, v)).join(',') || 'none'
  return [
    'Port        Mode         Encapsulation  Status        Native vlan',
    `${pad(LINK_PORT, 12)}${pad('on', 13)}${pad('802.1q', 15)}${pad('trunking', 14)}${link.native[sw]}`,
    '',
    'Port        Vlans allowed on trunk',
    `${pad(LINK_PORT, 12)}${allowed}`,
    '',
    'Port        Vlans allowed and active in management domain',
    `${pad(LINK_PORT, 12)}${active}`,
    '',
    'Port        Vlans in spanning tree forwarding state and not pruned',
    `${pad(LINK_PORT, 12)}${active}`
  ]
}

/** The interface configuration that produces this setup, one switch. */
export function runningConfig(config, sw) {
  const lines = []
  for (const h of HOSTS.filter((x) => x.sw === sw)) {
    lines.push(`interface FastEthernet${h.port.slice(2)}`, ' switchport mode access')
    if (config.access[h.id] !== 1) lines.push(` switchport access vlan ${config.access[h.id]}`)
    lines.push('!')
  }
  const { link } = config
  lines.push('interface GigabitEthernet0/1')
  if (link.mode === 'access') {
    lines.push(' switchport mode access')
    if (link.accessVlan !== 1) lines.push(` switchport access vlan ${link.accessVlan}`)
  } else {
    lines.push(' switchport mode trunk')
    if (link.native[sw] !== 1) lines.push(` switchport trunk native vlan ${link.native[sw]}`)
    if (link.removed.length) lines.push(` switchport trunk allowed vlan ${allowedText(link.removed)}`)
  }
  lines.push('!')
  return lines
}
