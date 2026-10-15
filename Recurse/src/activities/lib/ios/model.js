// Operational state for the IOS simulator. The device object holds configuration; this
// module derives what the device would be doing with it, given the simulated
// neighbors a lab places around it (sim.env): link states, trunking, spanning tree,
// OSPF adjacencies, the routing table, HSRP roles, NAT translations and DHCP leases.

import {
  classfulLen,
  inPrefix,
  ipCompare,
  ipToStr,
  ipv6Network,
  ipv6ToStr,
  isPhysical,
  isSubif,
  linkLocalFor,
  maskToPrefix,
  networkOf,
  parentIf,
  parseIPv4,
  parseIPv6,
  parseIPv6Prefix,
  parseVlanList,
  prefixToMask,
  shortIf,
  wildMatch,
  wildcardSpecificity
} from './addr.js'
import { aclEval, allowedList, ifMac, sortedIfNames } from './device.js'

// ---------- environment ----------

/** Neighbors (switches, routers, hosts) attached to one local port. */
export function neighborsOn(sim, name) {
  return (sim.env.neighbors || []).filter((n) => n.port === name)
}

export function portConnected(sim, name) {
  if (!isPhysical(name)) return false
  if (neighborsOn(sim, name).length) return true
  const list = sim.env.connected
  return list ? list.includes(name) : true
}

// ---------- interface state ----------

/**
 * Link and protocol state: { link: 'up'|'down'|'admin', proto: 'up'|'down', err: bool }.
 * err marks an err-disabled switch port.
 */
export function ifState(sim, name) {
  const dev = sim.dev
  const i = dev.interfaces[name]
  if (!i) return { link: 'down', proto: 'down', err: false }
  if (i.shutdown) return { link: 'admin', proto: 'down', err: false }
  if (sim.op.errdisabled.includes(name)) return { link: 'down', proto: 'down', err: true }
  if (isSubif(name)) {
    const p = ifState(sim, parentIf(name))
    return p.link === 'up' ? { link: 'up', proto: 'up', err: false } : { link: 'down', proto: 'down', err: false }
  }
  if (/^Loopback/.test(name)) return { link: 'up', proto: 'up', err: false }
  if (/^Vlan/.test(name)) {
    const id = Number(name.slice(4))
    return { link: 'up', proto: vlanHasActivePort(sim, id) ? 'up' : 'down', err: false }
  }
  if (/^Port-channel/.test(name)) {
    const up = etherchannelMembers(sim, Number(name.slice(12))).some((m) => m.flag === 'P')
    return up ? { link: 'up', proto: 'up', err: false } : { link: 'down', proto: 'down', err: false }
  }
  if (!portConnected(sim, name)) return { link: 'down', proto: 'down', err: false }
  return { link: 'up', proto: 'up', err: false }
}

export const isUp = (sim, name) => ifState(sim, name).proto === 'up'

/** Status words for show ip interface brief. */
export function briefStatus(sim, name) {
  const s = ifState(sim, name)
  if (s.link === 'admin') return ['administratively down', 'down']
  return [s.link, s.proto]
}

// ---------- switching ----------

function peerTrunk(sim, name) {
  const n = neighborsOn(sim, name).find((x) => x.trunk)
  return n ? n.trunk : null
}

/** Operational switchport mode: 'access' | 'trunk' | 'routed' | null for non-switchports. */
export function swOperMode(sim, name) {
  const i = sim.dev.interfaces[name]
  if (!i || i.switchport === undefined) return null
  if (i.switchport === false) return 'routed'
  if (i.mode === 'access') return 'access'
  if (i.mode === 'trunk') return 'trunk'
  const peer = peerTrunk(sim, name)
  const pm = peer?.mode ?? 'access'
  if (i.mode === 'dynamic desirable' && ['trunk', 'dynamic desirable', 'dynamic auto'].includes(pm)) return 'trunk'
  if (i.mode === 'dynamic auto' && ['trunk', 'dynamic desirable'].includes(pm)) return 'trunk'
  return 'access'
}

/** VLANs a trunk port is allowed to carry (all when not limited). */
export function trunkAllowed(i) {
  const list = allowedList(i)
  return list ?? null
}

export function trunkCarries(i, vlan) {
  const list = trunkAllowed(i)
  return list === null || list.includes(vlan)
}

/** True when an up port puts this VLAN into service. */
export function vlanHasActivePort(sim, id) {
  const dev = sim.dev
  if (dev.vlans[id] == null) return false
  return Object.values(dev.interfaces).some((i) => {
    if (i.switchport !== true || i.channelGroup) return false
    if (ifState(sim, i.name).proto !== 'up') return false
    const mode = swOperMode(sim, i.name)
    if (mode === 'access') return i.accessVlan === id || i.voiceVlan === id
    if (mode === 'trunk') return trunkCarries(i, id)
    return false
  })
}

/** Ports to show in show vlan brief for this VLAN. */
export function vlanPorts(sim, id) {
  const dev = sim.dev
  return sortedIfNames(dev)
    .map((n) => dev.interfaces[n])
    .filter((i) => i.switchport === true && !i.channelGroup && swOperMode(sim, i.name) === 'access' && (i.accessVlan === id || i.voiceVlan === id))
    .map((i) => shortIf(i.name))
}

export function nativeMismatch(sim, name) {
  const i = sim.dev.interfaces[name]
  if (!i || swOperMode(sim, name) !== 'trunk' || !isUp(sim, name)) return null
  const n = neighborsOn(sim, name).find((x) => x.trunk)
  if (!n || n.cdp === false) return null
  const peerNative = n.trunk.native ?? 1
  return peerNative !== i.nativeVlan ? { local: i.nativeVlan, peer: peerNative, neighbor: n } : null
}

/** Rows for show interfaces trunk. */
export function trunkRows(sim) {
  const dev = sim.dev
  const rows = []
  for (const name of sortedIfNames(dev, { 'Port-channel': 0, GigabitEthernet: 1 })) {
    const i = dev.interfaces[name]
    if (i.switchport !== true || i.channelGroup) continue
    if (/^Port-channel/.test(name)) {
      const members = etherchannelMembers(sim, Number(name.slice(12)))
      if (!members.some((m) => m.flag === 'P')) continue
      if (swOperMode(sim, members[0].name) !== 'trunk') continue
    } else if (swOperMode(sim, name) !== 'trunk' || !isUp(sim, name)) continue
    const allowed = trunkAllowed(i)
    const existing = Object.keys(dev.vlans).map(Number)
    const active = (allowed ?? existing).filter((v) => existing.includes(v))
    const mm = /^Port-channel/.test(name) ? null : nativeMismatch(sim, name)
    const blocked = new Set()
    if (mm) {
      blocked.add(mm.local)
      blocked.add(mm.peer)
    }
    for (const v of active) {
      const st = stpForVlan(sim, v)
      const port = st?.ports.find((p) => p.name === name)
      if (port && port.state !== 'FWD') blocked.add(v)
    }
    rows.push({
      name,
      mode: i.mode === 'trunk' ? 'on' : i.mode === 'dynamic desirable' ? 'desirable' : 'auto',
      native: i.nativeVlan,
      allowed,
      active,
      forwarding: active.filter((v) => !blocked.has(v))
    })
  }
  return rows
}

// ---------- EtherChannel ----------

const LACP = ['active', 'passive']
const PAGP = ['desirable', 'auto']

function channelCompatible(local, peer) {
  if (!peer) return true
  if (local === 'on' || peer === 'on') return local === peer
  if (LACP.includes(local) && LACP.includes(peer)) return local === 'active' || peer === 'active'
  if (PAGP.includes(local) && PAGP.includes(peer)) return local === 'desirable' || peer === 'desirable'
  return false
}

/** Why a member's Layer 2 settings stop it bundling with its port-channel, or null. */
export function memberMismatch(i, po) {
  if (!po || po.switchport !== true || i.switchport !== true) return null
  const m = shortIf(i.name)
  const p = shortIf(po.name)
  if (i.mode !== po.mode) return `trunk mode of ${m} is ${i.mode}, ${p} is ${po.mode}`
  if ((i.allowed ?? null) !== (po.allowed ?? null)) return 'vlan mask is different'
  if (i.nativeVlan !== po.nativeVlan) return `native vlan of ${m} is ${i.nativeVlan}, ${p} id ${po.nativeVlan}`
  if (i.accessVlan !== po.accessVlan) return `access vlan of ${m} is ${i.accessVlan}, ${p} id ${po.accessVlan}`
  return null
}

/** Members of a channel group with their bundle flag: P bundled, I stand-alone, s suspended, D down. */
export function etherchannelMembers(sim, id) {
  const dev = sim.dev
  const po = dev.interfaces[`Port-channel${id}`]
  return sortedIfNames(dev)
    .map((n) => dev.interfaces[n])
    .filter((i) => i.channelGroup?.id === id)
    .map((i) => {
      const st = ifState(sim, i.name)
      if (st.proto !== 'up') return { name: i.name, flag: 'D' }
      const peer = neighborsOn(sim, i.name).find((n) => n.channel)?.channel ?? null
      if (!channelCompatible(i.channelGroup.mode, peer)) {
        const crossed = peer && (LACP.includes(i.channelGroup.mode) !== LACP.includes(peer)) && i.channelGroup.mode !== 'on' && peer !== 'on'
        return { name: i.name, flag: crossed ? 'I' : i.channelGroup.mode === 'on' || peer === 'on' ? 's' : 'I' }
      }
      const why = memberMismatch(i, po)
      if (why) return { name: i.name, flag: 's', why }
      return { name: i.name, flag: 'P' }
    })
}

export function channelGroups(sim) {
  const ids = new Set(Object.values(sim.dev.interfaces).filter((i) => i.channelGroup).map((i) => i.channelGroup.id))
  return [...ids].sort((a, b) => a - b)
}

// ---------- spanning tree ----------

const portCost = (i) => i.stpCost ?? (/^Port-channel/.test(i.name) ? 3 : 4)
const portNum = (name) => (/^Port-channel/.test(name) ? 64 + Number(name.slice(12)) : Number(name.split('/').pop()))

function bidLess(a, b) {
  if (a.prio !== b.prio) return a.prio < b.prio
  return a.mac < b.mac
}

function neighborPrio(n, vlan) {
  const p = n.stp.priority
  if (typeof p === 'object' && p) return (p[vlan] ?? p.default ?? 32768) + vlan
  return (p ?? 32768) + vlan
}

/** Ports carrying the VLAN for STP: up access ports in it and up trunks allowing it. */
function stpPorts(sim, vlan) {
  const dev = sim.dev
  const out = []
  for (const name of sortedIfNames(dev, { GigabitEthernet: 0, 'Port-channel': 1 })) {
    const i = dev.interfaces[name]
    if (i.switchport !== true || i.channelGroup) continue
    if (/^Port-channel/.test(name)) {
      if (ifState(sim, name).proto !== 'up') continue
      const first = etherchannelMembers(sim, Number(name.slice(12))).find((m) => m.flag === 'P')
      if (!first) continue
      const mode = swOperMode(sim, first.name)
      if (mode === 'trunk' ? !trunkCarries(i, vlan) : i.accessVlan !== vlan) continue
      out.push({ i, neighbor: neighborsOn(sim, first.name).find((n) => n.stp) })
      continue
    }
    if (!isUp(sim, name)) continue
    const mode = swOperMode(sim, name)
    if (mode === 'access' && i.accessVlan !== vlan && i.voiceVlan !== vlan) continue
    if (mode === 'trunk' && !trunkCarries(i, vlan)) continue
    out.push({ i, neighbor: i.bpdufilter === 'enable' ? undefined : neighborsOn(sim, name).find((n) => n.stp) })
  }
  return out
}

export function localBridge(sim, vlan) {
  const prio = (sim.dev.stp.priority[vlan] ?? 32768) + vlan
  return { prio, mac: sim.dev.baseMac }
}

/**
 * Spanning tree for one VLAN, or null when the instance does not exist.
 * Returns { vlan, root: {prio, mac, local}, rootCost, rootPort, bridge, ports: [{ name, role, state, cost, prio, edge }] }
 */
export function stpForVlan(sim, vlan) {
  const dev = sim.dev
  if (dev.kind !== 'switch' || dev.vlans[vlan] == null) return null
  const ports = stpPorts(sim, vlan)
  if (!ports.length) return null
  const me = localBridge(sim, vlan)
  const guarded = (p) => p.i.guard === 'root'
  let root = { ...me, local: true }
  for (const p of ports) {
    if (!p.neighbor || guarded(p)) continue
    const nb = { prio: neighborPrio(p.neighbor, vlan), mac: p.neighbor.stp.mac }
    if (bidLess(nb, root)) root = { ...nb, local: false }
  }
  // Root guard: a port that hears a better root than the one we know goes root-inconsistent.
  const rootInc = new Set(ports.filter((p) => p.neighbor && guarded(p) && bidLess({ prio: neighborPrio(p.neighbor, vlan), mac: p.neighbor.stp.mac }, root)).map((p) => p.i.name))
  const nbInfo = (p) => {
    const nb = { prio: neighborPrio(p.neighbor, vlan), mac: p.neighbor.stp.mac }
    const isRoot = !root.local && nb.prio === root.prio && nb.mac === root.mac
    return { nb, cost: isRoot ? 0 : p.neighbor.stp.rootCost ?? 4 }
  }
  let rootCost = 0
  let rootPort = null
  if (!root.local) {
    let best = null
    for (const p of ports) {
      if (!p.neighbor || guarded(p)) continue
      const { nb, cost } = nbInfo(p)
      const total = cost + portCost(p.i)
      const cand = { name: p.i.name, total, nb, num: portNum(p.i.name) }
      if (!best || total < best.total || (total === best.total && (bidLess(nb, best.nb) || (nb.mac === best.nb.mac && cand.num < best.num)))) best = cand
    }
    rootPort = best?.name ?? null
    rootCost = best?.total ?? 0
  }
  const rows = ports.map((p) => {
    const i = p.i
    const edge = !p.neighbor && (i.portfast === 'enable' || (dev.stp.portfastDefault && swOperMode(sim, i.name) === 'access' && i.portfast !== 'disable'))
    let role = 'Desg'
    let state = 'FWD'
    if (rootInc.has(i.name)) return { name: i.name, role, state: 'BKN*', cost: portCost(i), prio: i.stpPrio ?? 128, num: portNum(i.name), edge: false, rootInc: true }
    if (i.name === rootPort) role = 'Root'
    else if (p.neighbor && !root.local) {
      const { nb, cost } = nbInfo(p)
      const mine = rootCost
      const better = mine < cost || (mine === cost && bidLess(me, nb))
      if (!better) {
        role = 'Altn'
        state = 'BLK'
      }
    }
    return { name: i.name, role, state, cost: portCost(i), prio: i.stpPrio ?? 128, num: portNum(i.name), edge }
  })
  return { vlan, root, rootCost, rootPort, bridge: me, ports: rows }
}

export function stpVlans(sim) {
  return Object.keys(sim.dev.vlans)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((v) => stpForVlan(sim, v))
}

/** True when the local switch is the root bridge for the VLAN. */
export function isStpRoot(sim, vlan) {
  const st = stpForVlan(sim, vlan)
  if (st) return st.root.local
  // No active ports: compare against every switch neighbor anyway, so a lab can still grade it.
  const me = localBridge(sim, vlan)
  return (sim.env.neighbors || []).filter((n) => n.stp).every((n) => bidLess(me, { prio: neighborPrio(n, vlan), mac: n.stp.mac }))
}

// ---------- IPv4 interfaces and routes ----------

/** Every up/up interface with an IPv4 address: [{ name, ip, mask, len }] (secondaries included). */
export function ipInterfaces(sim) {
  const out = []
  for (const i of Object.values(sim.dev.interfaces)) {
    if (!i.ip || !isUp(sim, i.name)) continue
    if (i.switchport === true) continue
    if (isSubif(i.name) && i.encap == null) continue
    out.push({ name: i.name, ip: i.ip, mask: i.mask, len: maskToPrefix(i.mask) })
    for (const s of i.secondary) out.push({ name: i.name, ip: s.ip, mask: s.mask, len: maskToPrefix(s.mask) })
  }
  return out
}

function routerIdCandidate(sim) {
  const dev = sim.dev
  if (dev.ospf?.routerId) return dev.ospf.routerId
  const ifs = ipInterfaces(sim)
  const loops = ifs.filter((x) => /^Loopback/.test(x.name)).sort((a, b) => ipCompare(b.ip, a.ip))
  if (loops.length) return loops[0].ip
  const all = [...ifs].sort((a, b) => ipCompare(b.ip, a.ip))
  return all[0]?.ip ?? null
}

/** The OSPF router ID in use. Once chosen it sticks until the process is cleared. */
export function ospfRouterId(sim) {
  if (!sim.dev.ospf) return null
  if (!sim.op.ospfRid) sim.op.ospfRid = routerIdCandidate(sim)
  return sim.op.ospfRid
}

export function ospfIfCost(sim, i) {
  if (i.ospf?.cost != null) return i.ospf.cost
  const ref = (sim.dev.ospf?.refBw ?? 100) * 1000
  const bw = i.bandwidth ?? (/^Loopback/.test(i.name) ? 8000000 : 1000000)
  return Math.max(1, Math.floor(ref / bw))
}

const areaNum = (a) => (typeof a === 'string' && a.includes('.') ? parseIPv4(a) : Number(a))
export const areaText = (a) => String(a)

/** Interfaces running OSPF: [{ name, ip, len, area, passive, cost, network }] */
export function ospfInterfaces(sim) {
  const dev = sim.dev
  const o = dev.ospf
  if (!o) return []
  const nets = [...o.networks].sort((a, b) => wildcardSpecificity(b.wildcard) - wildcardSpecificity(a.wildcard))
  const out = []
  for (const x of ipInterfaces(sim)) {
    if (out.some((y) => y.name === x.name)) continue
    const i = dev.interfaces[x.name]
    let area = null
    if (i.ospf?.process === o.process) area = i.ospf.area
    else {
      const hit = nets.find((n) => wildMatch(x.ip, n.network, n.wildcard))
      if (hit) area = hit.area
    }
    if (area == null) continue
    const passive = o.passiveDefault ? !o.noPassive.includes(x.name) : o.passive.includes(x.name)
    out.push({ name: x.name, ip: x.ip, mask: x.mask, len: x.len, area, passive, cost: ospfIfCost(sim, i), network: i.ospf?.network ?? 'broadcast', priority: i.ospf?.priority ?? 1 })
  }
  return out
}

/**
 * OSPF neighbors on this router: [{ rid, ip, iface, area, state, role, priority, routes }]
 * plus `problems`: [{ kind: 'area', iface, ip }] for log messages.
 */
export function ospfNeighbors(sim) {
  const rid = ospfRouterId(sim)
  const result = []
  result.problems = []
  if (!rid) return result
  for (const oi of ospfInterfaces(sim)) {
    if (oi.passive) continue
    const i = sim.dev.interfaces[oi.name]
    for (const n of neighborsOn(sim, parentIf(oi.name))) {
      if (!n.ospf) continue
      if (n.vlan != null && i.encap != null && n.vlan !== i.encap) continue
      if (!inPrefix(n.ip, oi.ip, oi.len)) continue
      if (areaNum(n.ospf.area ?? 0) !== areaNum(oi.area)) {
        result.problems.push({ kind: 'area', iface: oi.name, ip: n.ip, local: oi.area, remote: n.ospf.area ?? 0 })
        continue
      }
      const hello = i.ospf?.hello ?? 10
      const dead = i.ospf?.dead ?? hello * 4
      const nh = n.ospf.hello ?? 10
      const nd = n.ospf.dead ?? nh * 4
      if (hello !== nh || dead !== nd) {
        result.problems.push({ kind: 'timers', iface: oi.name, ip: n.ip })
        continue
      }
      if (n.ospf.rid === rid) {
        result.problems.push({ kind: 'rid', iface: oi.name, ip: n.ip })
        continue
      }
      let role = '-'
      const p2p = oi.network === 'point-to-point'
      if (!p2p) {
        const np = n.ospf.priority ?? 1
        const lp = oi.priority
        let nbrIsDr
        if (np === 0) nbrIsDr = false
        else if (lp === 0) nbrIsDr = true
        else if (np !== lp) nbrIsDr = np > lp
        else nbrIsDr = ipCompare(n.ospf.rid, rid) > 0
        role = nbrIsDr ? 'DR' : np === 0 ? 'DROTHER' : 'BDR'
      }
      result.push({ rid: n.ospf.rid, ip: n.ip, iface: oi.name, area: oi.area, state: 'FULL', role, priority: n.ospf.priority ?? 1, cost: oi.cost, routes: n.ospf.routes || [], defaultRoute: n.ospf.defaultRoute, device: n.device })
    }
  }
  return result
}

function since(sim, key) {
  const t = sim.op.since[key]
  if (t == null) {
    sim.op.since[key] = sim.now()
    return 0
  }
  return sim.now() - t
}

export function fmtAge(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The IPv4 routing table: [{ code, prefix, len, ad, metric, paths: [{ nh, iface, age }] }]
 * sorted by prefix. Only the best administrative distance for each prefix is installed.
 */
export function routingTable(sim) {
  const dev = sim.dev
  const cands = []
  const conn = ipInterfaces(sim)
  for (const x of conn) {
    cands.push({ code: 'C', prefix: networkOf(x.ip, x.mask), len: x.len, ad: 0, metric: 0, paths: [{ iface: x.name }] })
    cands.push({ code: 'L', prefix: x.ip, len: 32, ad: 0, metric: 0, paths: [{ iface: x.name }] })
  }
  const connectedVia = (ip) => conn.find((x) => inPrefix(ip, x.ip, x.len))
  const nbrs = ospfNeighbors(sim)
  const ospfRoutes = []
  for (const n of nbrs) {
    const age = fmtAge(since(sim, `ospf:${n.rid}@${n.iface}`))
    for (const r of n.routes) {
      const [prefix, len] = r.prefix.split('/')
      const ext = r.type === 'E2' || r.type === 'E1'
      const metric = r.type === 'E2' ? r.cost ?? 20 : n.cost + (r.cost ?? 1)
      ospfRoutes.push({ code: r.type === 'IA' ? 'O IA' : ext ? `O ${r.type}` : 'O', prefix, len: Number(len), ad: 110, metric, paths: [{ nh: n.ip, iface: n.iface, age }] })
    }
    if (n.defaultRoute) ospfRoutes.push({ code: 'O*E2', prefix: '0.0.0.0', len: 0, ad: 110, metric: 1, paths: [{ nh: n.ip, iface: n.iface, age }] })
  }
  cands.push(...ospfRoutes)
  const resolvable = (nh) => connectedVia(nh) || ospfRoutes.some((r) => inPrefix(nh, r.prefix, r.len))
  for (const r of dev.routes) {
    const len = maskToPrefix(r.mask)
    let ok
    if (r.iface) ok = isUp(sim, r.iface)
    else ok = Boolean(resolvable(r.nextHop))
    if (!ok) continue
    cands.push({ code: r.prefix === '0.0.0.0' && len === 0 ? 'S*' : 'S', prefix: r.prefix, len, ad: r.ad, metric: 0, paths: [{ nh: r.nextHop, iface: r.iface }] })
  }
  const best = new Map()
  for (const c of cands) {
    const key = `${c.prefix}/${c.len}`
    const cur = best.get(key)
    if (!cur || c.ad < cur.ad) best.set(key, { ...c, paths: [...c.paths] })
    else if (c.ad === cur.ad && c.code === cur.code && c.code !== 'C' && c.code !== 'L') cur.paths.push(...c.paths)
  }
  return [...best.values()].sort((a, b) => ipCompare(a.prefix, b.prefix) || a.len - b.len)
}

/** Longest-prefix match: the route a packet to `ip` would use, or null. */
export function lookupRoute(sim, ip) {
  let hit = null
  for (const r of routingTable(sim)) {
    if (inPrefix(ip, r.prefix, r.len) && (!hit || r.len > hit.len)) hit = r
  }
  return hit
}

/** Group routes under classful headers the way show ip route does. */
export function classfulGroups(table) {
  const groups = []
  for (const r of table) {
    const cl = classfulLen(r.prefix)
    const major = networkOf(r.prefix, cl)
    if (r.len === cl && !table.some((x) => x !== r && x.len > cl && networkOf(x.prefix, cl) === major)) {
      groups.push({ header: null, routes: [r] })
      continue
    }
    if (r.len < cl) {
      groups.push({ header: null, routes: [r] })
      continue
    }
    let g = groups.find((x) => x.major === major)
    if (!g) {
      g = { major, cl, routes: [] }
      groups.push(g)
    }
    g.routes.push(r)
  }
  for (const g of groups) {
    if (!g.major) continue
    const masks = new Set(g.routes.map((r) => r.len))
    g.header =
      masks.size === 1
        ? `${g.major}/${[...masks][0]} is subnetted, ${g.routes.length} subnet${g.routes.length > 1 ? 's' : ''}`
        : `${g.major}/${g.cl} is variably subnetted, ${g.routes.length} subnets, ${masks.size} masks`
  }
  return groups
}

// ---------- IPv6 ----------

export function linkLocal(sim, i) {
  if (i.linkLocal) return i.linkLocal
  if (!i.ipv6.length && !i.ipv6Enable) return null
  return linkLocalFor(ifMac(sim.dev, i.name))
}

/** Global IPv6 addresses of an interface as [{ addr (BigInt), len, text }]. */
export function ipv6Addrs(sim, i) {
  return i.ipv6
    .map((a) => {
      const eui = a.endsWith(' eui-64')
      const p = parseIPv6Prefix(eui ? a.slice(0, -7) : a)
      if (!p) return null
      let addr = p.addr
      if (eui) {
        const mac = ifMac(sim.dev, i.name)
        const net = ipv6Network(p.addr, 64)
        const hex = mac.replace(/\./g, '')
        const bytes = hex.match(/../g).map((b) => parseInt(b, 16))
        bytes[0] ^= 2
        const id = [...bytes.slice(0, 3), 0xff, 0xfe, ...bytes.slice(3)].reduce((acc, b) => (acc << 8n) + BigInt(b), 0n)
        addr = net | id
      }
      return { addr, len: p.len, text: ipv6ToStr(addr) }
    })
    .filter(Boolean)
}

/** IPv6 routing table: [{ code, prefix, len, ad, metric, paths: [{ nh, iface }] }] */
export function ipv6RoutingTable(sim) {
  const dev = sim.dev
  const out = []
  const conn = []
  for (const i of Object.values(dev.interfaces)) {
    if (!isUp(sim, i.name)) continue
    for (const a of ipv6Addrs(sim, i)) {
      conn.push({ name: i.name, ...a })
      out.push({ code: 'C', prefix: ipv6ToStr(ipv6Network(a.addr, a.len)), len: a.len, ad: 0, metric: 0, paths: [{ iface: i.name, connected: true }] })
      out.push({ code: 'L', prefix: a.text, len: 128, ad: 0, metric: 0, paths: [{ iface: i.name, receive: true }] })
    }
  }
  for (const r of dev.ipv6Routes) {
    const p = parseIPv6Prefix(r.prefix)
    if (!p) continue
    let ok
    if (r.iface) ok = isUp(sim, r.iface)
    else {
      const nh = parseIPv6(r.nextHop)
      ok = nh !== null && conn.some((c) => ipv6Network(nh, c.len) === ipv6Network(c.addr, c.len))
    }
    if (!ok) continue
    const prefix = ipv6ToStr(ipv6Network(p.addr, p.len))
    const existing = out.find((x) => x.prefix === prefix && x.len === p.len)
    if (existing && existing.ad < r.ad) continue
    if (existing && existing.ad === r.ad) {
      existing.paths.push({ nh: r.nextHop, iface: r.iface })
      continue
    }
    if (existing) out.splice(out.indexOf(existing), 1)
    out.push({ code: 'S', prefix, len: p.len, ad: r.ad, metric: 0, paths: [{ nh: r.nextHop, iface: r.iface }] })
  }
  out.push({ code: 'L', prefix: 'FF00::', len: 8, ad: 0, metric: 0, paths: [{ iface: 'Null0', receive: true }] })
  const key = (r) => parseIPv6(r.prefix) ?? 0n
  return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.len - b.len))
}

// ---------- reachability ----------

/** All addresses that answer on a directly connected link, with their neighbor. */
function linkPeers(sim, ifaceName) {
  const i = sim.dev.interfaces[ifaceName]
  return neighborsOn(sim, parentIf(ifaceName)).filter((n) => {
    if (!n.ip && !n.ipv6) return false
    if (i && isSubif(ifaceName)) return n.vlan == null || n.vlan === i.encap
    return n.vlan == null || sim.dev.kind === 'switch' || i?.encap == null
  })
}

/** True when a neighbor on this switch port sits in the VLAN. */
function portInVlan(sim, n, vlan) {
  const i = sim.dev.interfaces[n.port]
  if (!i || i.switchport !== true || !isUp(sim, n.port)) return false
  const mode = swOperMode(sim, n.port)
  if (mode === 'access') return (n.vlan ?? i.accessVlan) === vlan && (i.accessVlan === vlan || i.voiceVlan === vlan)
  if (mode === 'trunk') return trunkCarries(i, vlan) && (n.vlan ?? i.nativeVlan) === vlan
  return false
}

function hostReachableOnLink(sim, ifaceName, ip) {
  if (sim.dev.kind === 'switch' && /^Vlan/.test(ifaceName)) {
    const vlan = Number(ifaceName.slice(4))
    return (sim.env.neighbors || []).some((n) => n.ip === ip && portInVlan(sim, n, vlan))
  }
  if (linkPeers(sim, ifaceName).some((n) => n.ip === ip)) return true
  return dhcpLeases(sim).some((l) => l.ip === ip && l.port === parentIf(ifaceName))
}

function pathReaches(sim, p, ip) {
  const nh = p.nh
  const viaIf = nh ? ipInterfaces(sim).find((x) => inPrefix(nh, x.ip, x.len))?.name : p.iface
  if (!viaIf) return false
  const nb = linkPeers(sim, viaIf).find((n) => (nh ? n.ip === nh : true))
  if (!nb) return false
  return (nb.behind || []).some((b) => {
    const [net, len] = b.split('/')
    return inPrefix(ip, net, Number(len))
  })
}

/**
 * Would a ping to this IPv4 address succeed? Returns { ok, reason }.
 * Own addresses always answer; hosts on a connected subnet answer when the lab
 * defines them; remote addresses answer when a route leads to a neighbor that
 * has the destination "behind" it.
 */
export function pingResult(sim, ip) {
  const own = ipInterfaces(sim).find((x) => x.ip === ip)
  if (own) return { ok: true }
  const route = sim.dev.kind === 'switch' && !sim.dev.ipRouting ? switchRoute(sim, ip) : lookupRoute(sim, ip)
  if (!route) return { ok: false, reason: 'noroute' }
  if (route.code === 'C') return { ok: hostReachableOnLink(sim, route.paths[0].iface, ip) }
  const results = route.paths.map((p) => pathReaches(sim, p, ip))
  const good = results.filter(Boolean).length
  if (good === results.length) return { ok: true }
  // Equal-cost paths where only some work: packets alternate between them.
  if (good) return { ok: false, partial: true }
  return { ok: false }
}

/** A Layer 2 switch reaches off-subnet hosts through its default gateway. */
function switchRoute(sim, ip) {
  const conn = ipInterfaces(sim)
  const c = conn.find((x) => inPrefix(ip, x.ip, x.len))
  if (c) return { code: 'C', paths: [{ iface: c.name }], len: c.len }
  const gw = sim.dev.defaultGateway
  if (gw && conn.some((x) => inPrefix(gw, x.ip, x.len))) return { code: 'S', paths: [{ nh: gw }] }
  return null
}

export function pingV6Result(sim, text) {
  const addr = parseIPv6(text)
  if (addr === null) return { ok: false }
  for (const i of Object.values(sim.dev.interfaces)) {
    if (!isUp(sim, i.name)) continue
    if (ipv6Addrs(sim, i).some((a) => a.addr === addr)) return { ok: true }
  }
  const table = ipv6RoutingTable(sim).filter((r) => r.code !== 'L')
  let hit = null
  for (const r of table) {
    const p = parseIPv6(r.prefix)
    if (ipv6Network(addr, r.len) === p && (!hit || r.len > hit.len)) hit = r
  }
  if (!hit) return { ok: false }
  const norm = ipv6ToStr(addr)
  for (const path of hit.paths) {
    if (path.connected) {
      if (linkPeers(sim, path.iface).some((n) => n.ipv6 && ipv6ToStr(parseIPv6(n.ipv6)) === norm)) return { ok: true }
      continue
    }
    const nh = path.nh ? ipv6ToStr(parseIPv6(path.nh)) : null
    const norm6 = (x) => (x ? ipv6ToStr(parseIPv6(x)) : null)
    const nb = (sim.env.neighbors || []).find((n) => (!path.iface || n.port === parentIf(path.iface)) && (nh ? [norm6(n.ipv6), norm6(n.ipv6LinkLocal)].includes(nh) : Boolean(n.ipv6)))
    if (!nb) continue
    if ((nb.behind6 || []).some((b) => {
      const p = parseIPv6Prefix(b)
      return p && ipv6Network(addr, p.len) === ipv6Network(p.addr, p.len)
    })) return { ok: true }
  }
  return { ok: false }
}

// ---------- HSRP ----------

/** HSRP role for every configured group: [{ iface, group, state, vip, priority, preempt, active, standby }] */
export function hsrpGroups(sim) {
  const out = []
  for (const name of sortedIfNames(sim.dev)) {
    const i = sim.dev.interfaces[name]
    for (const g of i.hsrp) {
      const peer = neighborsOn(sim, parentIf(name)).find((n) => n.hsrp && n.hsrp.group === g.group)
      const prio = g.priority ?? 100
      const vip = g.ip ?? peer?.hsrp.ip ?? null
      let state
      if (!isUp(sim, name) || !i.ip || !vip) state = 'Init'
      else if (!peer) state = 'Active'
      else {
        const pp = peer.hsrp.priority ?? 100
        const wins = prio > pp || (prio === pp && ipCompare(i.ip, peer.ip) > 0)
        if (peer.hsrp.active !== false) state = wins && g.preempt ? 'Active' : 'Standby'
        else state = wins ? 'Active' : 'Standby'
      }
      out.push({
        iface: name,
        group: g.group,
        state,
        vip,
        priority: prio,
        preempt: Boolean(g.preempt),
        version: i.hsrpVersion,
        active: state === 'Active' ? 'local' : state === 'Standby' ? peer.ip : 'unknown',
        standby: state === 'Active' ? peer?.ip ?? 'unknown' : state === 'Standby' ? 'local' : 'unknown',
        peerPriority: peer?.hsrp.priority ?? null,
        vipMismatch: g.ip && peer?.hsrp.ip && peer.hsrp.active !== false && g.ip !== peer.hsrp.ip ? peer.hsrp.ip : null
      })
    }
  }
  return out
}

// ---------- NAT ----------

function natInsideIf(sim, ip) {
  return Object.values(sim.dev.interfaces).find((i) => i.natRole === 'inside' && i.ip && isUp(sim, i.name) && inPrefix(ip, i.ip, maskToPrefix(i.mask)))
}

/** Current translations: [{ proto, insideGlobal, insideLocal, outsideLocal, outsideGlobal, kind }] */
export function natTranslations(sim) {
  const dev = sim.dev
  const out = []
  for (const s of dev.nat.statics) out.push({ proto: '---', insideGlobal: s.outside, insideLocal: s.inside, outsideLocal: '---', outsideGlobal: '---', kind: 'static' })
  const usedPorts = new Set()
  for (const f of sim.env.natFlows || []) {
    if (!natInsideIf(sim, f.src)) continue
    const route = lookupRoute(sim, f.dst)
    if (!route) continue
    const egress = route.paths[0].iface || ipInterfaces(sim).find((x) => route.paths[0].nh && inPrefix(route.paths[0].nh, x.ip, x.len))?.name
    const out_if = egress && dev.interfaces[egress]
    if (!out_if || out_if.natRole !== 'outside') continue
    const st = dev.nat.statics.find((s) => s.inside === f.src)
    let global
    let overload = false
    if (st) global = st.outside
    else {
      const rule = dev.nat.rules.find((r) => {
        const acl = dev.acls[r.acl]
        return acl && aclEval(acl, { src: f.src, dst: f.dst, proto: f.proto, sport: f.sport, dport: f.dport }).action === 'permit'
      })
      if (!rule) continue
      if (rule.iface) {
        const gi = dev.interfaces[rule.iface]
        if (!gi?.ip || gi.natRole !== 'outside') continue
        global = gi.ip
        overload = rule.overload
      } else {
        const pool = dev.nat.pools.find((p) => p.name === rule.pool)
        if (!pool) continue
        global = pool.start
        overload = rule.overload
        if (!overload) {
          const used = out.filter((t) => t.kind === 'dynamic').map((t) => t.insideGlobal)
          let n = parseIPv4(pool.start)
          while (used.includes(ipToStr(n)) && n < parseIPv4(pool.end)) n++
          global = ipToStr(n)
        }
      }
    }
    let gport = f.sport
    if (overload) {
      while (usedPorts.has(`${f.proto}:${gport}`)) gport = gport < 1024 ? 1024 : gport + 1
      usedPorts.add(`${f.proto}:${gport}`)
    }
    const port = (p) => (f.proto === 'tcp' || f.proto === 'udp' || f.proto === 'icmp' ? `:${p}` : '')
    out.push({
      proto: f.proto,
      insideGlobal: `${global}${port(overload ? gport : f.sport)}`,
      insideLocal: `${f.src}${port(f.sport)}`,
      outsideLocal: `${f.dst}${port(f.dport)}`,
      outsideGlobal: `${f.dst}${port(f.dport)}`,
      kind: overload ? 'pat' : 'dynamic'
    })
  }
  return out
}

// ---------- DHCP server ----------

function excluded(dev, ipNum) {
  return dev.dhcpExcluded.some(([a, b]) => {
    const lo = parseIPv4(a)
    const hi = parseIPv4(b ?? a)
    return ipNum >= lo && ipNum <= hi
  })
}

/** Leases handed to the lab's DHCP clients: [{ ip, mac, clientId, pool, iface }] */
export function dhcpBindings(sim) {
  const dev = sim.dev
  const out = []
  const taken = new Set(Object.values(dev.interfaces).filter((i) => i.ip).map((i) => i.ip))
  for (const c of sim.env.dhcpClients || []) {
    const i = dev.interfaces[c.port]
    if (!i || !i.ip || !isUp(sim, c.port)) continue
    const pool = dev.dhcpPools.find((p) => p.network && p.mask && inPrefix(i.ip, p.network, maskToPrefix(p.mask)))
    if (!pool) continue
    const len = maskToPrefix(pool.mask)
    const net = parseIPv4(pool.network)
    const size = 2 ** (32 - len)
    for (let n = net + 1; n < net + size - 1; n++) {
      const ip = ipToStr(n)
      if (taken.has(ip) || excluded(dev, n)) continue
      taken.add(ip)
      const hex = `01${c.mac.replace(/\./g, '')}`
      out.push({ ip, mac: c.mac, clientId: hex.match(/.{1,4}/g).join('.'), pool: pool.name, iface: c.port, name: c.name })
      break
    }
  }
  return out
}

let leaseDepth = 0

/**
 * Leases clients get from a DHCP server on another subnet, through `ip helper-address`.
 * env.dhcpServers: [{ ip, pools: [{ network, len, start, router }] }]
 */
export function relayLeases(sim) {
  if (leaseDepth) return []
  leaseDepth++
  try {
    const dev = sim.dev
    const out = []
    const taken = new Set()
    for (const c of sim.env.dhcpClients || []) {
      const i = dev.interfaces[c.port]
      if (!i || !i.ip || !isUp(sim, c.port)) continue
      if (dev.dhcpPools.some((p) => p.network && p.mask && inPrefix(i.ip, p.network, maskToPrefix(p.mask)))) continue
      for (const h of i.helpers) {
        const server = (sim.env.dhcpServers || []).find((s) => s.ip === h)
        if (!server || !pingResult(sim, h).ok) continue
        const pool = server.pools.find((p) => inPrefix(i.ip, p.network, p.len))
        if (!pool) continue
        let n = parseIPv4(pool.start)
        while (taken.has(ipToStr(n))) n++
        const ip = ipToStr(n)
        taken.add(ip)
        out.push({ ip, mac: c.mac, port: c.port, server: h, router: pool.router, name: c.name })
        break
      }
    }
    return out
  } finally {
    leaseDepth--
  }
}

/** Every lease a client on this device's links holds, from the local server or a relay. */
export function dhcpLeases(sim) {
  if (leaseDepth) return []
  return [...dhcpBindings(sim).map((b) => ({ ip: b.ip, mac: b.mac, port: b.iface, server: 'local', name: b.name })), ...relayLeases(sim)]
}

export function poolSize(pool) {
  if (!pool.network || !pool.mask) return 0
  return Math.max(0, 2 ** (32 - maskToPrefix(pool.mask)) - 2)
}

// ---------- CDP / LLDP ----------

export function cdpNeighbors(sim) {
  if (!sim.dev.cdp) return []
  return (sim.env.neighbors || []).filter((n) => {
    if (n.kind === 'host' || n.cdp === false || !n.device) return false
    const i = sim.dev.interfaces[n.port]
    return i && i.cdp && isUp(sim, n.port)
  })
}

export function lldpNeighbors(sim) {
  if (!sim.dev.lldp) return []
  return (sim.env.neighbors || []).filter((n) => {
    if (!n.lldp || !n.device) return false
    const i = sim.dev.interfaces[n.port]
    return i && i.lldpRx && isUp(sim, n.port)
  })
}

// ---------- NTP ----------

export function ntpState(sim) {
  const dev = sim.dev
  for (const s of dev.ntp.servers) {
    const stratum = sim.env.ntp?.[s]
    if (stratum != null && pingResult(sim, s).ok) return { synced: true, stratum: stratum + 1, ref: s, server: s, serverStratum: stratum }
  }
  if (dev.ntp.master != null) return { synced: true, stratum: dev.ntp.master, ref: '127.127.1.1', server: null, serverStratum: null }
  return { synced: false, stratum: 16, ref: null }
}

// ---------- port security ----------

export function portSecurityState(sim, name) {
  const i = sim.dev.interfaces[name]
  const ps = i?.portSecurity
  if (!ps) return null
  const hosts = neighborsOn(sim, name).filter((n) => n.mac && n.kind === 'host')
  const configured = ps.macs.length
  const sticky = ps.stickyMacs.length
  const dynamic = ps.sticky ? 0 : Math.min(Math.max(0, ps.max - configured), hosts.filter((h) => !ps.macs.includes(h.mac)).length)
  const err = sim.op.errdisabled.includes(name)
  const st = ifState(sim, name)
  return {
    enabled: ps.enabled,
    status: !ps.enabled ? 'Secure-down' : err ? 'Secure-shutdown' : st.proto === 'up' ? 'Secure-up' : 'Secure-down',
    violation: ps.violation,
    max: ps.max,
    total: configured + sticky + dynamic,
    configured,
    sticky,
    last: hosts.length ? `${hosts[hosts.length - 1].mac}:${i.accessVlan}` : '0000.0000.0000:0',
    violations: sim.op.violations[name] ?? 0
  }
}

// ---------- observation and syslog ----------

function snapshot(sim) {
  const dev = sim.dev
  const links = {}
  for (const name of Object.keys(dev.interfaces)) {
    if (isSubif(name)) continue
    const s = ifState(sim, name)
    links[name] = s.link === 'admin' ? 'admin' : `${s.link}/${s.proto}`
  }
  const nbrs = {}
  for (const n of ospfNeighbors(sim)) nbrs[`${n.rid}|${n.iface}`] = 'FULL'
  const problems = {}
  for (const p of ospfNeighbors(sim).problems) problems[`${p.kind}|${p.iface}|${p.ip}`] = p
  const hsrp = {}
  for (const g of hsrpGroups(sim)) hsrp[`${g.iface}|${g.group}`] = g.state
  const vip = {}
  for (const g of hsrpGroups(sim)) if (g.vipMismatch) vip[`${g.iface}|${g.group}`] = { active: g.vipMismatch, local: sim.dev.interfaces[g.iface].hsrp.find((x) => x.group === g.group)?.ip }
  const mismatch = {}
  const rootInc = {}
  const suspended = {}
  if (dev.kind === 'switch') {
    for (const name of Object.keys(dev.interfaces)) {
      const m = nativeMismatch(sim, name)
      if (m) mismatch[name] = m
    }
    for (const v of stpVlans(sim)) for (const p of stpForVlan(sim, v).ports) if (p.rootInc) rootInc[`${p.name}|${v}`] = true
    for (const id of channelGroups(sim)) for (const m of etherchannelMembers(sim, id)) if (m.flag === 's' && m.why) suspended[m.name] = { why: m.why, po: `Po${id}` }
  }
  return { links, nbrs, problems, hsrp, mismatch, vip, rootInc, suspended }
}

function linkMessages(name, before, after) {
  const msgs = []
  const [bl, bp] = (before ?? 'admin').split('/')
  const [al, ap] = after.split('/')
  if (after === before) return msgs
  if (after === 'admin') {
    msgs.push(`%LINK-5-CHANGED: Interface ${name}, changed state to administratively down`)
    if (bp === 'up') msgs.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to down`)
    return msgs
  }
  if (al !== (before === 'admin' ? 'admin' : bl)) msgs.push(`%LINK-3-UPDOWN: Interface ${name}, changed state to ${al}`)
  if (ap !== (before === 'admin' ? 'down' : bp)) msgs.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to ${ap}`)
  return msgs
}

/** Put a port into err-disabled state, remembering why and when. */
export function errDisable(sim, name, reason) {
  if (!sim.op.errdisabled.includes(name)) sim.op.errdisabled.push(name)
  sim.op.errInfo[name] = { reason, at: sim.now() }
}

export function clearErrDisable(sim, name) {
  sim.op.errdisabled = sim.op.errdisabled.filter((n) => n !== name)
  delete sim.op.errInfo[name]
}

/** Automatic recovery when `errdisable recovery cause` covers the reason and the interval has passed. */
function recoverTimers(sim) {
  const dev = sim.dev
  const msgs = []
  const causes = dev.errdisable.causes
  if (!causes.length) return msgs
  const interval = (dev.errdisable.interval ?? 300) * 1000
  for (const name of [...sim.op.errdisabled]) {
    const info = sim.op.errInfo[name]
    if (!info || !(causes.includes('all') || causes.includes(info.reason))) continue
    if (sim.now() - info.at < interval) continue
    clearErrDisable(sim, name)
    msgs.push(`%PM-4-ERR_RECOVER: Attempting to recover from ${info.reason} err-disable state on ${shortIf(name)}`)
  }
  return msgs
}

/** "on" facing an LACP or PAgP neighbor: STP's EtherChannel guard err-disables the bundle. */
function channelMisconfig(sim) {
  const dev = sim.dev
  const msgs = []
  for (const id of channelGroups(sim)) {
    const members = Object.values(dev.interfaces).filter((i) => i.channelGroup?.id === id && i.channelGroup.mode === 'on')
    const bad = members.filter((i) => {
      if (i.shutdown || sim.op.errdisabled.includes(i.name) || !portConnected(sim, i.name)) return false
      const peer = neighborsOn(sim, i.name).find((n) => n.channel)
      return peer && peer.channel !== 'on' && (peer.stp || peer.trunk)
    })
    if (!bad.length) continue
    msgs.push(`%SPANTREE-2-CHNL_MISCFG: Detected loop due to etherchannel misconfiguration of ${shortIf(bad[0].name)}`)
    for (const i of bad) {
      errDisable(sim, i.name, 'channel-misconfig')
      msgs.push(`%PM-4-ERR_DISABLE: channel-misconfig (STP) error detected on Po${id}, putting ${shortIf(i.name)} in err-disable state`)
    }
  }
  return msgs
}

/** Learn sticky MACs and catch BPDU guard and port security violations (they change state). */
function applyDynamics(sim) {
  const dev = sim.dev
  const msgs = []
  if (dev.kind !== 'switch') return msgs
  msgs.push(...recoverTimers(sim))
  msgs.push(...channelMisconfig(sim))
  for (const i of Object.values(dev.interfaces)) {
    if (i.switchport !== true || !isPhysical(i.name)) continue
    if (i.shutdown || sim.op.errdisabled.includes(i.name)) continue
    if (!portConnected(sim, i.name)) continue
    const nbs = neighborsOn(sim, i.name)
    const guard = i.bpduguard === 'enable' || (dev.stp.bpduguardDefault && i.bpduguard !== 'disable' && (i.portfast === 'enable' || (dev.stp.portfastDefault && i.mode === 'access')))
    if (guard && i.bpdufilter !== 'enable' && nbs.some((n) => n.stp)) {
      errDisable(sim, i.name, 'bpduguard')
      msgs.push(`%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${i.name} with BPDU Guard enabled. Disabling port.`)
      msgs.push(`%PM-4-ERR_DISABLE: bpduguard error detected on ${shortIf(i.name)}, putting ${shortIf(i.name)} in err-disable state`)
      continue
    }
    const ps = i.portSecurity
    if (!ps?.enabled || swOperMode(sim, i.name) !== 'access') continue
    const hosts = nbs.filter((n) => n.mac && n.kind === 'host')
    const known = new Set([...ps.macs, ...ps.stickyMacs])
    for (const h of hosts) {
      if (known.has(h.mac)) continue
      if (known.size < ps.max) {
        known.add(h.mac)
        if (ps.sticky) ps.stickyMacs.push(h.mac)
        continue
      }
      sim.op.violations[i.name] = (sim.op.violations[i.name] ?? 0) + 1
      if (ps.violation === 'shutdown') {
        errDisable(sim, i.name, 'psecure-violation')
        msgs.push(`%PM-4-ERR_DISABLE: psecure-violation error detected on ${shortIf(i.name)}, putting ${shortIf(i.name)} in err-disable state`)
        msgs.push(`%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ${h.mac} on port ${i.name}.`)
        break
      }
      if (ps.violation === 'restrict') msgs.push(`%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ${h.mac} on port ${i.name}.`)
    }
  }
  return msgs
}

/**
 * Compare operational state with the previous observation and return the syslog
 * messages a real device would print. Call after every command.
 */
export function observe(sim, { silent = false } = {}) {
  const dyn = applyDynamics(sim)
  const prev = sim.op.obs
  const next = snapshot(sim)
  sim.op.obs = next
  if (silent) return []
  if (!prev) return dyn
  const msgs = [...dyn]
  for (const [name, state] of Object.entries(next.links)) msgs.push(...linkMessages(name, prev.links[name], state))
  for (const key of Object.keys(next.nbrs)) {
    if (prev.nbrs[key]) continue
    const [rid, iface] = key.split('|')
    sim.op.since[`ospf:${rid}@${iface}`] = sim.now()
    msgs.push(`%OSPF-5-ADJCHG: Process ${sim.dev.ospf?.process ?? 1}, Nbr ${rid} on ${iface} from LOADING to FULL, Loading Done`)
  }
  for (const key of Object.keys(prev.nbrs)) {
    if (next.nbrs[key]) continue
    const [rid, iface] = key.split('|')
    delete sim.op.since[`ospf:${rid}@${iface}`]
    msgs.push(`%OSPF-5-ADJCHG: Process ${prev.procId ?? sim.dev.ospf?.process ?? 1}, Nbr ${rid} on ${iface} from FULL to DOWN, Neighbor Down: Interface down or detached`)
  }
  next.procId = sim.dev.ospf?.process
  for (const [key, p] of Object.entries(next.problems)) {
    if (prev.problems[key]) continue
    if (p.kind === 'area') msgs.push(`%OSPF-4-ERRRCV: Received invalid packet: mismatched area ID from backbone area must be virtual-link but not found from ${p.ip}, ${p.iface}`)
    if (p.kind === 'rid') msgs.push(`%OSPF-4-DUP_RTRID_NBR: OSPF detected duplicate router-id ${p.ip} from ${p.ip} on interface ${p.iface}`)
  }
  for (const [key, state] of Object.entries(next.hsrp)) {
    const before = prev.hsrp[key] ?? 'Init'
    if (before === state) continue
    const [iface, group] = key.split('|')
    const from = before === 'Init' ? (state === 'Active' ? 'Standby' : 'Speak') : before
    msgs.push(`%HSRP-5-STATECHANGE: ${iface} Grp ${group} state ${from} -> ${state}`)
  }
  for (const [name, m] of Object.entries(next.mismatch)) {
    if (prev.mismatch[name]) continue
    msgs.push(mismatchMessage(name, m))
  }
  for (const [key, v] of Object.entries(next.vip)) {
    if (prev.vip?.[key]) continue
    const [iface, group] = key.split('|')
    msgs.push(`%HSRP-4-DIFFVIP1: ${iface} Grp ${group} active routers virtual IP address ${v.active} is different to the locally configured address ${v.local}`)
  }
  const vlanName = (v) => `VLAN${String(v).padStart(4, '0')}`
  for (const key of Object.keys(next.rootInc)) {
    if (prev.rootInc?.[key]) continue
    const [port, v] = key.split('|')
    msgs.push(`%SPANTREE-2-ROOTGUARD_BLOCK: Root guard blocking port ${port} on ${vlanName(v)}.`)
  }
  for (const key of Object.keys(prev.rootInc || {})) {
    if (next.rootInc[key]) continue
    const [port, v] = key.split('|')
    msgs.push(`%SPANTREE-2-ROOTGUARD_UNBLOCK: Root guard unblocking port ${port} on ${vlanName(v)}.`)
  }
  for (const [name, s] of Object.entries(next.suspended)) {
    if (prev.suspended?.[name]) continue
    msgs.push(`%EC-5-CANNOT_BUNDLE2: ${shortIf(name)} is not compatible with ${s.po} and will be suspended (${s.why})`)
  }
  return msgs
}

export function mismatchMessage(name, m) {
  return `%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on ${name} (${m.local}), with ${m.neighbor.device} ${m.neighbor.remotePort} (${m.peer}).`
}

/** Problems that already exist when a lab starts, printed as boot-time log messages. */
export function startupNotices(sim) {
  const msgs = []
  const s = sim.op.obs || snapshot(sim)
  for (const [name, m] of Object.entries(s.mismatch)) msgs.push(mismatchMessage(name, m))
  for (const p of Object.values(s.problems)) {
    if (p.kind === 'area') msgs.push(`%OSPF-4-ERRRCV: Received invalid packet: mismatched area ID from backbone area must be virtual-link but not found from ${p.ip}, ${p.iface}`)
  }
  return msgs
}

export { prefixToMask, parseVlanList }
