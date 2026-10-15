// OSPF cost and shortest path first. Interface cost = reference bandwidth / interface
// bandwidth, with any fraction dropped and never below 1 (max 65535), unless
// `ip ospf cost` sets it by hand. A path's cost is the sum of the outgoing interface
// costs along it. Dijkstra builds the tree from R1; equal-cost paths are all kept.

export const LINK_TYPES = {
  fe: { label: 'FastEthernet', prefix: 'FastEthernet', kbps: 100000, speed: '100 Mbps' },
  ge: { label: 'GigabitEthernet', prefix: 'GigabitEthernet', kbps: 1000000, speed: '1 Gbps' },
  te: { label: '10 Gigabit', prefix: 'TenGigabitEthernet', kbps: 10000000, speed: '10 Gbps' }
}

export const ROUTERS = ['R1', 'R2', 'R3', 'R4', 'R5']

export const LINKS = [
  { id: 'r1-r2', kind: 'fe', ends: [{ router: 'R1', iface: 'Fa0/0' }, { router: 'R2', iface: 'Fa0/0' }] },
  { id: 'r2-r4', kind: 'fe', ends: [{ router: 'R2', iface: 'Fa0/1' }, { router: 'R4', iface: 'Fa0/1' }] },
  { id: 'r1-r3', kind: 'ge', ends: [{ router: 'R1', iface: 'Gi0/1' }, { router: 'R3', iface: 'Gi0/1' }] },
  { id: 'r3-r5', kind: 'ge', ends: [{ router: 'R3', iface: 'Gi0/2' }, { router: 'R5', iface: 'Gi0/2' }] },
  { id: 'r5-r4', kind: 'te', ends: [{ router: 'R5', iface: 'Te0/3' }, { router: 'R4', iface: 'Te0/3' }] }
]

export const TOP_PATH = ['R1', 'R2', 'R4']
export const BOTTOM_PATH = ['R1', 'R3', 'R5', 'R4']

export const REFERENCE_OPTIONS = [100, 1000, 10000, 40000, 100000]

export const BANDWIDTH_OPTIONS = [
  { kbps: 10000, label: '10 Mbps' },
  { kbps: 100000, label: '100 Mbps' },
  { kbps: 1000000, label: '1 Gbps' },
  { kbps: 10000000, label: '10 Gbps' }
]

export const ifaceKey = (end) => `${end.router} ${end.iface}`

export function fullName(end, kind) {
  return `${LINK_TYPES[kind].prefix}${end.iface.replace(/^[A-Za-z]+/, '')}`
}

export function defaultConfig() {
  return { ref: 100, ifaces: {} }
}

/** The OSPF cost formula on its own: floor(ref Mbps * 1000 / kbps), between 1 and 65535. */
export function autoCost(refMbps, kbps) {
  return Math.min(65535, Math.max(1, Math.floor((refMbps * 1000) / kbps)))
}

/** Every interface with its bandwidth, cost and how the cost was set. */
export function interfaces(config) {
  const out = {}
  for (const link of LINKS) {
    for (const end of link.ends) {
      const key = ifaceKey(end)
      const set = config.ifaces[key] || {}
      const kbps = set.bandwidth || LINK_TYPES[link.kind].kbps
      const manual = Number.isInteger(set.cost) && set.cost >= 1 && set.cost <= 65535 ? set.cost : null
      const auto = autoCost(config.ref, kbps)
      out[key] = {
        key,
        router: end.router,
        iface: end.iface,
        name: fullName(end, link.kind),
        link: link.id,
        kind: link.kind,
        kbps,
        bandwidthSet: Boolean(set.bandwidth),
        cost: manual ?? auto,
        auto,
        source: manual ? 'manual' : 'auto',
        formula: `${(config.ref * 1000).toLocaleString('en-US')} / ${kbps.toLocaleString('en-US')} = ${(config.ref * 1000) / kbps}${(config.ref * 1000) / kbps < 1 ? ', raised to 1' : Number.isInteger((config.ref * 1000) / kbps) ? '' : `, so ${auto}`}`
      }
    }
  }
  return out
}

/** Directed edges: each router can send out each of its interfaces at that interface's cost. */
export function edges(config) {
  const ifs = interfaces(config)
  const list = []
  for (const link of LINKS) {
    const [a, b] = link.ends
    list.push({ from: a.router, to: b.router, cost: ifs[ifaceKey(a)].cost, iface: ifaceKey(a), link: link.id })
    list.push({ from: b.router, to: a.router, cost: ifs[ifaceKey(b)].cost, iface: ifaceKey(b), link: link.id })
  }
  return list
}

/**
 * Dijkstra from `root`. Returns { dist, preds, order, trace }. preds[R] lists every
 * equal-cost edge into R. trace has one entry per visited router with what it updated.
 */
export function spf(config, root = 'R1') {
  const all = edges(config)
  const dist = Object.fromEntries(ROUTERS.map((r) => [r, Infinity]))
  const preds = Object.fromEntries(ROUTERS.map((r) => [r, []]))
  const done = new Set()
  const order = []
  const trace = []
  dist[root] = 0
  while (done.size < ROUTERS.length) {
    let pick = null
    for (const r of ROUTERS) if (!done.has(r) && dist[r] < Infinity && (pick === null || dist[r] < dist[pick])) pick = r
    if (pick === null) break
    done.add(pick)
    order.push(pick)
    const updates = []
    for (const e of all.filter((x) => x.from === pick)) {
      const cand = dist[pick] + e.cost
      const before = dist[e.to]
      let result
      if (done.has(e.to)) result = 'done'
      else if (cand < before) {
        dist[e.to] = cand
        preds[e.to] = [e]
        result = 'better'
      } else if (cand === before) {
        preds[e.to] = [...preds[e.to], e]
        result = 'tie'
      } else result = 'worse'
      updates.push({ to: e.to, via: e.iface, edgeCost: e.cost, cost: cand, before, result })
    }
    trace.push({ visit: pick, cost: dist[pick], updates, tentative: { ...dist }, settled: [...order] })
  }
  return { dist, preds, order, trace }
}

/** Every lowest-cost path from the root to `target`, as router lists. */
export function bestPaths(result, target) {
  const walk = (node) => {
    if (!result.preds[node].length) return [[node]]
    return result.preds[node].flatMap((e) => walk(e.from).map((p) => [...p, node]))
  }
  if (result.dist[target] === Infinity) return []
  return walk(target)
}

/** Total cost of a router path and the per-hop breakdown. */
export function pathCost(config, path) {
  const all = edges(config)
  const hops = []
  for (let i = 0; i < path.length - 1; i++) {
    const e = all.find((x) => x.from === path[i] && x.to === path[i + 1])
    hops.push({ from: path[i], to: path[i + 1], iface: e.iface, cost: e.cost })
  }
  return { total: hops.reduce((s, h) => s + h.cost, 0), hops }
}

const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/** Which path R1 uses to reach R4: 'top', 'bottom' or 'both' (equal cost). */
export function routeChoice(config) {
  const paths = bestPaths(spf(config), 'R4')
  const top = paths.some((p) => samePath(p, TOP_PATH))
  const bottom = paths.some((p) => samePath(p, BOTTOM_PATH))
  if (top && bottom) return 'both'
  return bottom ? 'bottom' : 'top'
}

/** IOS commands that produce the current configuration, per router. */
export function commands(config) {
  const out = []
  if (config.ref !== 100) {
    out.push({
      router: 'every router',
      lines: [
        { mode: '(config)', cmd: 'router ospf 1' },
        { mode: '(config-router)', cmd: `auto-cost reference-bandwidth ${config.ref}` },
        { output: '% OSPF: Reference bandwidth is changed.' },
        { output: '        Please ensure reference bandwidth is consistent across all routers.' }
      ]
    })
  }
  const ifs = interfaces(config)
  for (const router of ROUTERS) {
    const lines = []
    for (const info of Object.values(ifs).filter((x) => x.router === router)) {
      const set = config.ifaces[info.key] || {}
      if (!set.bandwidth && !(info.source === 'manual')) continue
      lines.push({ mode: '(config)', cmd: `interface ${info.name}` })
      if (set.bandwidth) lines.push({ mode: '(config-if)', cmd: `bandwidth ${set.bandwidth}` })
      if (info.source === 'manual') lines.push({ mode: '(config-if)', cmd: `ip ospf cost ${info.cost}` })
    }
    if (lines.length) out.push({ router, lines })
  }
  return out
}
