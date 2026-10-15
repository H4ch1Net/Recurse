// Classic 802.1D spanning tree election for small topologies:
//   1. Root bridge: lowest bridge ID (priority, then MAC).
//   2. Root port on every other switch: lowest root path cost, then lowest sender
//      (neighbor) bridge ID, then lowest sender port ID, then lowest local port ID.
//   3. Designated port on every link: the end with the lowest root cost, then lowest
//      bridge ID, then lowest port ID.
//   4. Everything else blocks (shown as Altn BLK by PVST+ and RSTP).
import { compareMac, normalizeMac } from './net'

export const SPEEDS = ['10M', '100M', '1G', '10G']
/** 802.1D short costs (the Catalyst default) and the 802.1t long costs. */
export const SHORT_COST = { '10M': 100, '100M': 19, '1G': 4, '10G': 2 }
export const LONG_COST = { '10M': 2000000, '100M': 200000, '1G': 20000, '10G': 2000 }
export const PRIORITIES = Array.from({ length: 16 }, (_, i) => i * 4096)
export const DEFAULT_PRIORITY = 32768
export const PORT_PRIORITY = 128

export const isValidPriority = (p) => Number.isInteger(p) && p >= 0 && p <= 61440 && p % 4096 === 0

export const portKey = (sw, port) => `${sw}:${port}`

/** Port number from a name like Gi0/2 (the last number). */
export function portNumber(name) {
  const m = /(\d+)\s*$/.exec(name)
  return m ? Number(m[1]) : 0
}

export function portId(end) {
  return { priority: end.portPriority ?? PORT_PRIORITY, number: end.portNum ?? portNumber(end.port) }
}
export const formatPortId = (id) => `${id.priority}.${id.number}`

export function compareBid(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority
  return compareMac(a.mac, b.mac)
}
const comparePortId = (a, b) => a.priority - b.priority || a.number - b.number
export const formatBid = (sw) => `${sw.priority}.${normalizeMac(sw.mac) || sw.mac}`

export function linkCost(link) {
  if (Number.isFinite(link.cost)) return link.cost
  return SHORT_COST[link.speed] ?? SHORT_COST['1G']
}

// ---- Presets --------------------------------------------------------------------------

const sw = (id, mac, priority = DEFAULT_PRIORITY) => ({ id, priority, mac })
const link = (id, a, ap, b, bp, speed = '1G') => ({ id, a: { sw: a, port: ap }, b: { sw: b, port: bp }, speed })

export const PRESETS = {
  square: {
    label: 'Four switches in a ring',
    switches: [sw('SW1', '00d0.c011.1111'), sw('SW2', '00d0.c022.2222'), sw('SW3', '0011.5c33.3333'), sw('SW4', '00a0.5c44.4444')],
    links: [link('L1', 'SW1', 'Gi0/1', 'SW2', 'Gi0/1'), link('L2', 'SW2', 'Gi0/2', 'SW4', 'Gi0/1'), link('L3', 'SW4', 'Gi0/2', 'SW3', 'Gi0/2'), link('L4', 'SW3', 'Gi0/1', 'SW1', 'Gi0/2')]
  },
  triangle: {
    label: 'Three switches in a triangle',
    switches: [sw('SW1', '0050.0f11.1111'), sw('SW2', '0050.0f22.2222'), sw('SW3', '0050.0f33.3333')],
    links: [link('L1', 'SW1', 'Gi0/1', 'SW2', 'Gi0/1'), link('L2', 'SW2', 'Gi0/2', 'SW3', 'Gi0/2'), link('L3', 'SW3', 'Gi0/1', 'SW1', 'Gi0/2', '100M')]
  },
  parallel: {
    label: 'Triangle with a double link',
    switches: [sw('SW1', '0050.0f11.1111'), sw('SW2', '0050.0f22.2222'), sw('SW3', '0050.0f33.3333')],
    links: [link('L1', 'SW1', 'Gi0/1', 'SW2', 'Gi0/1'), link('L2', 'SW1', 'Gi0/2', 'SW2', 'Gi0/2'), link('L3', 'SW2', 'Gi0/3', 'SW3', 'Gi0/2', '100M'), link('L4', 'SW3', 'Gi0/1', 'SW1', 'Gi0/3', '100M')]
  }
}

/** A deep copy of a preset, safe to edit. */
export function presetTopology(name = 'square') {
  const p = PRESETS[name] || PRESETS.square
  return { switches: p.switches.map((s) => ({ ...s })), links: p.links.map((l) => ({ ...l, a: { ...l.a }, b: { ...l.b } })) }
}

/** Every port in the topology: { key, sw, port, linkId, other: { sw, port } }. */
export function listPorts(topology) {
  const out = []
  for (const l of topology.links) {
    out.push({ key: portKey(l.a.sw, l.a.port), sw: l.a.sw, port: l.a.port, end: l.a, linkId: l.id, other: l.b })
    out.push({ key: portKey(l.b.sw, l.b.port), sw: l.b.sw, port: l.b.port, end: l.b, linkId: l.id, other: l.a })
  }
  return out
}

// ---- Election ----------------------------------------------------------------------------

/**
 * Run the election. Returns { root, rootReason, rootCost, rootPort, roles, links,
 * waves, explanations }. `roles` maps port keys to 'root' | 'designated' | 'blocked'.
 */
export function electStp(topology) {
  const switches = topology.switches
  const byId = Object.fromEntries(switches.map((s) => [s.id, s]))
  const ports = listPorts(topology)

  // 1. Root bridge.
  const sorted = [...switches].sort(compareBid)
  const root = sorted[0]
  const lowestPriority = root.priority
  const tied = switches.filter((s) => s.priority === lowestPriority)
  const rootReason = tied.length > 1
    ? { kind: 'mac', text: `${tied.map((s) => s.id).join(', ')} tie on priority ${lowestPriority}, so the lowest MAC address wins: ${root.id} (${root.mac}) becomes root.` }
    : { kind: 'priority', text: `${root.id} has the lowest priority (${lowestPriority}), so it becomes root. The MAC address never comes into it.` }

  // 2. Root path cost for every switch (Dijkstra on a handful of nodes).
  const rootCost = Object.fromEntries(switches.map((s) => [s.id, Infinity]))
  rootCost[root.id] = 0
  const visited = new Set()
  while (visited.size < switches.length) {
    let current = null
    for (const s of switches) if (!visited.has(s.id) && (current === null || rootCost[s.id] < rootCost[current])) current = s.id
    if (current === null || rootCost[current] === Infinity) break
    visited.add(current)
    for (const l of topology.links) {
      const ends = l.a.sw === current ? [l.a, l.b] : l.b.sw === current ? [l.b, l.a] : null
      if (!ends) continue
      const next = ends[1].sw
      const cost = rootCost[current] + linkCost(l)
      if (cost < rootCost[next]) rootCost[next] = cost
    }
  }

  // 3. Root ports.
  const rootPort = {}
  const rootPortInfo = {}
  for (const s of switches) {
    if (s.id === root.id) continue
    const candidates = ports
      .filter((p) => p.sw === s.id && rootCost[p.other.sw] !== Infinity)
      .map((p) => {
        const l = topology.links.find((x) => x.id === p.linkId)
        return {
          key: p.key,
          port: p.port,
          via: p.other.sw,
          cost: rootCost[p.other.sw] + linkCost(l),
          senderBid: byId[p.other.sw],
          senderPort: portId(p.other),
          senderPortName: p.other.port,
          localPort: portId(p.end)
        }
      })
      .sort((x, y) => x.cost - y.cost || compareBid(x.senderBid, y.senderBid) || comparePortId(x.senderPort, y.senderPort) || comparePortId(x.localPort, y.localPort))
    if (!candidates.length) continue
    const best = candidates[0]
    const second = candidates[1]
    let kind = 'only'
    if (second) {
      if (second.cost !== best.cost) kind = 'cost'
      else if (compareBid(second.senderBid, best.senderBid) !== 0) kind = 'sender-bid'
      else if (comparePortId(second.senderPort, best.senderPort) !== 0) kind = 'sender-port'
      else kind = 'local-port'
    }
    const costs = candidates.map((c) => `${c.port} via ${c.via} costs ${c.cost}`).join(', ')
    const text = {
      only: `${s.id} has one path to the root, so ${best.port} is its root port (cost ${best.cost}).`,
      cost: `${s.id}: ${costs}. The lowest root cost wins, so ${best.port} is the root port.`,
      'sender-bid': `${s.id}: ${costs}. That is a tie on cost, so the lowest neighbor bridge ID breaks it: ${best.via} (${formatBid(best.senderBid)}) beats ${second.via} (${formatBid(second.senderBid)}). ${best.port} is the root port.`,
      'sender-port': `${s.id}: both links reach ${best.via} at cost ${best.cost}, and it is the same neighbor, so the lowest neighbor port ID decides: ${best.via} sends on ${best.senderPortName} (${formatPortId(best.senderPort)}), lower than ${second.senderPortName} (${formatPortId(second.senderPort)}). ${best.port} is the root port.`,
      'local-port': `${s.id}: everything ties, so its own lowest port ID decides: ${best.port}.`
    }[kind]
    rootPort[s.id] = best.key
    rootPortInfo[s.id] = { key: best.key, kind, text, candidates }
  }

  // 4. Designated ports, one per link.
  const roles = {}
  const linkInfo = {}
  for (const l of topology.links) {
    const sa = byId[l.a.sw]
    const sb = byId[l.b.sw]
    const ka = portKey(l.a.sw, l.a.port)
    const kb = portKey(l.b.sw, l.b.port)
    const cmp = rootCost[sa.id] - rootCost[sb.id] || compareBid(sa, sb) || comparePortId(portId(l.a), portId(l.b))
    const [win, lose, wk, lk] = cmp <= 0 ? [sa, sb, ka, kb] : [sb, sa, kb, ka]
    let kind = 'cost'
    if (win.id === root.id) kind = 'root'
    else if (rootCost[sa.id] === rootCost[sb.id]) kind = sa.id === sb.id ? 'port' : 'bid'
    const text = {
      root: `${l.a.sw} to ${l.b.sw}: ${win.id} is the root bridge, and every root bridge port is designated.`,
      cost: `${l.a.sw} to ${l.b.sw}: ${win.id} advertises root cost ${rootCost[win.id]}, lower than ${lose.id}'s ${rootCost[lose.id]}, so ${win.id}'s end is designated.`,
      bid: `${l.a.sw} to ${l.b.sw}: both ends advertise root cost ${rootCost[win.id]}, so the lower bridge ID gets the designated port: ${win.id} (${formatBid(win)}).`,
      port: `${l.a.sw} to ${l.b.sw}: same switch at both ends, so the lower port ID is designated.`
    }[kind]
    roles[wk] = 'designated'
    roles[lk] = rootPort[lose.id] === lk ? 'root' : 'blocked'
    linkInfo[l.id] = { designated: wk, other: lk, kind, text, blocked: roles[lk] === 'blocked' ? lk : null }
  }

  const blocked = Object.keys(roles).filter((k) => roles[k] === 'blocked')

  // 5. BPDU waves for the animation: first everyone claims to be root, then the
  //    root's BPDUs ripple outward through designated ports, one hop at a time.
  const depth = { [root.id]: 0 }
  let changed = true
  while (changed) {
    changed = false
    for (const s of switches) {
      if (depth[s.id] != null || !rootPort[s.id]) continue
      const [upstream] = rootPort[s.id].split(':')
      const p = ports.find((x) => x.key === rootPort[s.id])
      if (p && depth[p.other.sw] != null) {
        depth[s.id] = depth[p.other.sw] + 1
        changed = true
      }
      void upstream
    }
  }
  const claim = ports.map((p) => ({ from: p.sw, to: p.other.sw, linkId: p.linkId, fromPort: p.port }))
  const ripple = []
  for (const p of ports) {
    if (roles[p.key] !== 'designated' || depth[p.sw] == null) continue
    const d = depth[p.sw]
    ;(ripple[d] ||= []).push({ from: p.sw, to: p.other.sw, linkId: p.linkId, fromPort: p.port })
  }
  const waves = [claim, ...ripple.filter(Boolean)]

  const explanations = [
    rootReason.text,
    ...switches.filter((s) => rootPortInfo[s.id]).map((s) => rootPortInfo[s.id].text),
    ...topology.links.map((l) => linkInfo[l.id].text),
    ...(blocked.length
      ? blocked.map((k) => `${k.replace(':', ' ')} is neither a root port nor a designated port, so it blocks. That breaks the loop.`)
      : ['No port needs to block: there is no loop.'])
  ]

  return { root: root.id, rootReason, rootCost, rootPort, rootPortInfo, roles, links: linkInfo, blocked, waves, explanations }
}

// ---- Predictions -----------------------------------------------------------------------------

/**
 * Grade a prediction { root, rootPorts: { swId: portKey }, blocked: [portKey] }
 * against an election result.
 */
export function gradePrediction(result, prediction) {
  const rootOk = prediction.root === result.root
  const rootPorts = {}
  for (const [id, key] of Object.entries(result.rootPort)) rootPorts[id] = prediction.rootPorts?.[id] === key
  const want = [...result.blocked].sort()
  const got = [...new Set(prediction.blocked || [])].sort()
  const blockedOk = want.length === got.length && want.every((k, i) => k === got[i])
  const allCorrect = rootOk && Object.values(rootPorts).every(Boolean) && blockedOk
  const parts = [rootOk, ...Object.values(rootPorts), blockedOk]
  return { root: rootOk, rootPorts, blocked: blockedOk, allCorrect, score: parts.filter(Boolean).length / parts.length }
}

// ---- show spanning-tree ---------------------------------------------------------------------

const ROLE_TEXT = { root: 'Root FWD', designated: 'Desg FWD', blocked: 'Altn BLK' }
const pad = (s, n) => String(s).padEnd(n, ' ')

/** Lines of `show spanning-tree vlan 1` for one switch, in the PVST+ style. */
export function showSpanningTree(topology, result, switchId, vlan = 1) {
  const byId = Object.fromEntries(topology.switches.map((s) => [s.id, s]))
  const me = byId[switchId]
  const root = byId[result.root]
  const lines = [`VLAN${String(vlan).padStart(4, '0')}`, '  Spanning tree enabled protocol ieee', `  Root ID    Priority    ${root.priority + vlan}`, `             Address     ${normalizeMac(root.mac)}`]
  if (me.id === root.id) lines.push('             This bridge is the root')
  else {
    const rp = result.rootPort[me.id]
    const portName = rp ? rp.split(':')[1] : '?'
    lines.push(`             Cost        ${result.rootCost[me.id]}`)
    lines.push(`             Port        ${portNumber(portName)} (${portName.replace(/^Gi/, 'GigabitEthernet').replace(/^Fa/, 'FastEthernet')})`)
  }
  lines.push('')
  lines.push(`  Bridge ID  Priority    ${me.priority + vlan}  (priority ${me.priority} sys-id-ext ${vlan})`)
  lines.push(`             Address     ${normalizeMac(me.mac)}`)
  lines.push('')
  lines.push('Interface        Role Sts Cost      Prio.Nbr Type')
  lines.push('---------------- ---- --- --------- -------- ----')
  const mine = listPorts(topology)
    .filter((p) => p.sw === me.id)
    .sort((a, b) => comparePortId(portId(a.end), portId(b.end)))
  for (const p of mine) {
    const l = topology.links.find((x) => x.id === p.linkId)
    lines.push(`${pad(p.port, 17)}${pad(ROLE_TEXT[result.roles[p.key]] || '?', 9)}${pad(linkCost(l), 10)}${pad(formatPortId(portId(p.end)), 9)}P2p`)
  }
  return lines
}
