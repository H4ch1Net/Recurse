// Routing table lookup: which route does a router use for a destination?
// Longest prefix match first; when two sources offer the very same prefix, the lower
// administrative distance wins, then the lower metric; a full tie means load balancing.
// No matching route and no default route means the packet is dropped.

// ---- IPv4 helpers (kept local so this widget has no shared dependencies) ----------

/** Dotted decimal to an unsigned 32-bit integer, or null when invalid. */
export function parseIp(text) {
  const parts = String(text ?? '').trim().split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

export function intToIp(value) {
  const n = value >>> 0
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export function prefixToMask(prefix) {
  if (prefix <= 0) return 0
  if (prefix >= 32) return 0xffffffff
  return (0xffffffff << (32 - prefix)) >>> 0
}

export const maskString = (prefix) => intToIp(prefixToMask(prefix))

export const networkOf = (ip, prefix) => (ip & prefixToMask(prefix)) >>> 0

/** Four 8-character binary strings, one per octet. */
export function toBinaryOctets(value) {
  const n = value >>> 0
  return [24, 16, 8, 0].map((shift) => ((n >>> shift) & 255).toString(2).padStart(8, '0'))
}

/** Classful prefix length of an address (A: 8, B: 16, C: 24), or null for D and E. */
export function classfulPrefix(ip) {
  const first = ip >>> 24
  if (first < 128) return 8
  if (first < 192) return 16
  if (first < 224) return 24
  return null
}

// ---- The routing table ---------------------------------------------------------------

export const CODE_NAMES = {
  C: 'connected',
  L: 'local',
  S: 'static',
  'S*': 'static default',
  O: 'OSPF'
}

const AGE = '00:14:07'

/**
 * Every candidate route router R1 has learned. A real `show ip route` lists only the
 * winner for each prefix; candidates for the same prefix are shown here so the
 * administrative distance and metric tie breakers can be seen.
 */
export const ROUTES = [
  { id: 'default', code: 'S*', network: '0.0.0.0', prefix: 0, ad: 1, metric: 0, via: '203.0.113.1' },
  { id: 'c-12', code: 'C', network: '10.0.12.0', prefix: 30, ad: 0, metric: 0, iface: 'GigabitEthernet0/1' },
  { id: 'l-12', code: 'L', network: '10.0.12.1', prefix: 32, ad: 0, metric: 0, iface: 'GigabitEthernet0/1' },
  { id: 'c-13', code: 'C', network: '10.0.13.0', prefix: 30, ad: 0, metric: 0, iface: 'GigabitEthernet0/2' },
  { id: 'l-13', code: 'L', network: '10.0.13.1', prefix: 32, ad: 0, metric: 0, iface: 'GigabitEthernet0/2' },
  { id: 'o-10-1', code: 'O', network: '10.1.0.0', prefix: 16, ad: 110, metric: 20, via: '10.0.12.2', iface: 'GigabitEthernet0/1', age: AGE },
  { id: 's-10-1-1', code: 'S', network: '10.1.1.0', prefix: 24, ad: 1, metric: 0, via: '10.0.13.2' },
  { id: 'o-10-1-1-16', code: 'O', network: '10.1.1.16', prefix: 28, ad: 110, metric: 30, via: '10.0.12.2', iface: 'GigabitEthernet0/1', age: AGE },
  { id: 's-host', code: 'S', network: '10.1.1.25', prefix: 32, ad: 1, metric: 0, via: '10.0.13.2' },
  { id: 'o-10-2-a', code: 'O', network: '10.2.0.0', prefix: 16, ad: 110, metric: 20, via: '10.0.12.2', iface: 'GigabitEthernet0/1', age: AGE },
  { id: 'o-10-2-b', code: 'O', network: '10.2.0.0', prefix: 16, ad: 110, metric: 40, via: '10.0.13.2', iface: 'GigabitEthernet0/2', age: AGE },
  { id: 'o-172', code: 'O', network: '172.16.0.0', prefix: 16, ad: 110, metric: 45, via: '10.0.12.2', iface: 'GigabitEthernet0/1', age: AGE },
  { id: 's-172-float', code: 'S', network: '172.16.0.0', prefix: 16, ad: 130, metric: 0, via: '10.0.13.2', note: 'floating static' },
  { id: 'c-lan', code: 'C', network: '192.168.10.0', prefix: 24, ad: 0, metric: 0, iface: 'GigabitEthernet0/0' },
  { id: 'l-lan', code: 'L', network: '192.168.10.1', prefix: 32, ad: 0, metric: 0, iface: 'GigabitEthernet0/0' },
  { id: 's-50', code: 'S', network: '192.168.50.0', prefix: 24, ad: 5, metric: 0, via: '10.0.13.2' },
  { id: 'o-50', code: 'O', network: '192.168.50.0', prefix: 24, ad: 110, metric: 20, via: '10.0.12.2', iface: 'GigabitEthernet0/1', age: AGE },
  { id: 'c-isp', code: 'C', network: '203.0.113.0', prefix: 30, ad: 0, metric: 0, iface: 'GigabitEthernet0/3' },
  { id: 'l-isp', code: 'L', network: '203.0.113.2', prefix: 32, ad: 0, metric: 0, iface: 'GigabitEthernet0/3' }
]

/** Drill destinations, in teaching order. `noDefault` removes the default route first. */
export const QUESTIONS = [
  { ip: '10.1.1.200', focus: 'Several routes overlap. Which one is most specific?' },
  { ip: '10.1.1.20', focus: 'Watch the /16, /24 and /28 all match.' },
  { ip: '10.1.1.25', focus: 'Five routes match this one.' },
  { ip: '10.1.77.5', focus: 'The /24 and /28 do not cover this one.' },
  { ip: '8.8.8.8', focus: 'Nothing specific matches.' },
  { ip: '172.16.4.4', focus: 'Two sources offer the same prefix.' },
  { ip: '192.168.50.9', focus: 'Same prefix again. Compare the numbers in brackets.' },
  { ip: '10.2.3.4', focus: 'Same prefix, same source. What breaks the tie?' },
  { ip: '192.168.10.1', focus: 'Where is this address?' },
  { ip: '8.8.8.8', noDefault: true, focus: 'The default route is gone on this router.' },
  { ip: '10.0.13.2', focus: 'A neighbor on a connected link.' },
  { ip: '172.20.1.1', noDefault: true, focus: 'No default route here either.' }
]

export function tableFor({ noDefault = false } = {}) {
  return noDefault ? ROUTES.filter((r) => r.code !== 'S*') : ROUTES
}

export const routeLabel = (route) => `${route.network}/${route.prefix}`

export function routeMatches(route, ip) {
  return networkOf(ip, route.prefix) === parseIp(route.network)
}

/**
 * Look up a destination. Returns the ids of every matching route, the winner ids
 * (more than one only for an equal-cost tie), the longest matching prefix and which
 * rule decided: 'drop' | 'only' | 'prefix' | 'ad' | 'metric' | 'ecmp'.
 */
export function lookup(routes, ip) {
  const matching = routes.filter((r) => routeMatches(r, ip))
  if (!matching.length) return { matches: [], winners: [], longest: null, decidedBy: 'drop' }
  const longest = Math.max(...matching.map((r) => r.prefix))
  let tied = matching.filter((r) => r.prefix === longest)
  let decidedBy = matching.length === 1 ? 'only' : 'prefix'
  if (tied.length > 1) {
    const minAd = Math.min(...tied.map((r) => r.ad))
    const byAd = tied.filter((r) => r.ad === minAd)
    if (byAd.length < tied.length) decidedBy = 'ad'
    tied = byAd
    if (tied.length > 1) {
      const minMetric = Math.min(...tied.map((r) => r.metric))
      const byMetric = tied.filter((r) => r.metric === minMetric)
      decidedBy = byMetric.length < tied.length ? 'metric' : 'ecmp'
      tied = byMetric
    }
  }
  return { matches: matching.map((r) => r.id), winners: tied.map((r) => r.id), longest, decidedBy }
}

/** The interface a route sends packets out of, following a static route's next hop (recursive lookup). */
export function exitInterface(routes, route, depth = 0) {
  if (!route) return null
  if (route.iface) return route.iface
  if (!route.via || depth > 4) return null
  const nextHop = parseIp(route.via)
  const result = lookup(routes.filter((r) => r.code !== 'S*'), nextHop)
  const next = routes.find((r) => r.id === result.winners[0])
  return next ? exitInterface(routes, next, depth + 1) : null
}

const describe = (r) => `${r.code} ${routeLabel(r)}`
const adText = (r) => (r.code === 'C' || r.code === 'L' ? 'AD 0' : `AD ${r.ad}`)

/** Plain sentences that explain the decision, in order. */
export function explain(routes, ip) {
  const result = lookup(routes, ip)
  const byId = (id) => routes.find((r) => r.id === id)
  const dest = intToIp(ip)
  if (result.decidedBy === 'drop') {
    return [
      `No route matches ${dest}, and there is no default route.`,
      'So the router drops the packet and usually sends an ICMP unreachable message back to the sender.'
    ]
  }
  const matches = result.matches.map(byId)
  const winners = result.winners.map(byId)
  const win = winners[0]
  const lines = []
  lines.push(
    matches.length === 1
      ? `Only one route matches ${dest}: ${describe(win)}.`
      : `${matches.length} routes match ${dest}: ${matches.map((r) => `/${r.prefix}`).join(', ')}.`
  )
  if (win.prefix === 0) {
    lines.push(`Only the default route covers it, so the packet goes to the gateway of last resort, ${win.via}.`)
  } else if (matches.length > 1) {
    lines.push(`Longest prefix wins: /${result.longest} is the most specific match, no matter how the route was learned.`)
  }
  const tied = matches.filter((r) => r.prefix === result.longest)
  if (result.decidedBy === 'ad') {
    const losers = tied.filter((r) => !result.winners.includes(r.id))
    lines.push(
      `Two sources offer ${routeLabel(win)}. Same prefix length, so the lower administrative distance wins: ${CODE_NAMES[win.code]} with ${adText(win)} beats ${losers.map((r) => `${r.note || CODE_NAMES[r.code]} with ${adText(r)}`).join(' and ')}.`
    )
    if (losers.some((r) => r.note === 'floating static')) {
      lines.push('That static route is a floating static: its AD is set higher than OSPF on purpose, so it waits as a backup and only gets installed if the OSPF route disappears.')
    }
  } else if (result.decidedBy === 'metric') {
    const losers = tied.filter((r) => !result.winners.includes(r.id))
    lines.push(
      `Both come from ${CODE_NAMES[win.code]} with the same AD (${win.ad}), so the lower metric wins: ${win.metric} beats ${losers.map((r) => r.metric).join(' and ')}. OSPF itself only offers its best path, so the real table would show just this one.`
    )
  } else if (result.decidedBy === 'ecmp') {
    lines.push(`Same prefix, AD and metric: the router installs ${winners.length} equal-cost routes and load balances across them.`)
  }
  if (win.code === 'L') {
    lines.push(`${dest} is one of the router's own addresses (a local /32 route), so the router keeps the packet for itself instead of forwarding it.`)
  } else if (win.code === 'C') {
    lines.push(`The destination is on a directly connected network, so the router delivers it out ${win.iface} itself, using ARP to find the host.`)
  } else if (win.code === 'S' || win.code === 'S*') {
    const iface = exitInterface(routes, win)
    lines.push(`Next hop ${win.via}${iface ? `, which the router finds on ${iface} with a second lookup` : ''}.`)
  } else if (win.code === 'O') {
    lines.push(`Next hop ${win.via} out ${win.iface}.`)
  }
  return lines
}

/**
 * Grade the learner's pick: a route id or 'drop'. Returns { correct, why } where
 * `why` explains a wrong pick in one sentence.
 */
export function gradePick(routes, ip, pick) {
  const result = lookup(routes, ip)
  if (pick === 'drop') {
    if (result.decidedBy === 'drop') return { correct: true, why: '' }
    return { correct: false, why: `At least one route matches ${intToIp(ip)}, so the router forwards it instead of dropping it.` }
  }
  if (result.winners.includes(pick)) return { correct: true, why: '' }
  const route = routes.find((r) => r.id === pick)
  if (!route) return { correct: false, why: 'Pick a route from the table.' }
  if (!routeMatches(route, ip)) {
    const net = intToIp(networkOf(ip, route.prefix))
    const tail = result.decidedBy === 'drop' ? ' Nothing matches, so the packet is dropped.' : ''
    return { correct: false, why: `${routeLabel(route)} does not match: ${intToIp(ip)} AND ${maskString(route.prefix)} is ${net}, not ${route.network}.${tail}` }
  }
  const win = routes.find((r) => r.id === result.winners[0])
  if (route.prefix < result.longest) {
    return { correct: false, why: `${routeLabel(route)} matches, but /${route.prefix} is less specific than /${result.longest}. The longest prefix wins.` }
  }
  if (route.ad > win.ad) {
    return { correct: false, why: `Same prefix, but ${adText(route)} loses to ${adText(win)}. Lower administrative distance wins.` }
  }
  return { correct: false, why: `Same prefix and AD, but metric ${route.metric} loses to ${win.metric}. Lower metric wins.` }
}

/** The AND-with-mask working for one route: each line has a dotted value and binary octets. */
export function andMath(route, ip) {
  const mask = prefixToMask(route.prefix)
  const result = (ip & mask) >>> 0
  const network = parseIp(route.network)
  return {
    prefix: route.prefix,
    rows: [
      { label: 'Destination', dotted: intToIp(ip), bits: toBinaryOctets(ip) },
      { label: `Mask /${route.prefix}`, dotted: intToIp(mask), bits: toBinaryOctets(mask) },
      { label: 'AND result', dotted: intToIp(result), bits: toBinaryOctets(result) },
      { label: 'Route network', dotted: route.network, bits: toBinaryOctets(network) }
    ],
    matches: result === network
  }
}

// ---- show ip route layout --------------------------------------------------------------

/** One display line for a route, the way IOS prints it (after the code column). */
export function routeText(route) {
  const net = routeLabel(route)
  if (route.code === 'C' || route.code === 'L') return `${net} is directly connected, ${route.iface}`
  if (route.code === 'O') return `${net} [${route.ad}/${route.metric}] via ${route.via}, ${route.age || AGE}, ${route.iface}`
  return `${net} [${route.ad}/${route.metric}] via ${route.via}`
}

/**
 * Rows for a `show ip route` style listing: classful group headers ("10.0.0.0/8 is
 * variably subnetted, 9 subnets, 5 masks") followed by their routes, indented.
 */
export function tableRows(routes) {
  const rows = []
  const seen = new Set()
  for (const route of routes) {
    const ip = parseIp(route.network)
    const classful = classfulPrefix(ip)
    if (classful === null || route.prefix < classful) {
      rows.push({ type: 'route', route, indent: false })
      continue
    }
    const major = networkOf(ip, classful)
    const members = routes.filter((r) => {
      const rip = parseIp(r.network)
      return r.prefix >= classful && classfulPrefix(rip) === classful && networkOf(rip, classful) === major
    })
    const subnetted = members.some((r) => r.prefix > classful)
    if (!subnetted) {
      rows.push({ type: 'route', route, indent: false })
      continue
    }
    if (!seen.has(major)) {
      seen.add(major)
      const subnets = new Set(members.map(routeLabel)).size
      const masks = new Set(members.map((r) => r.prefix))
      const text =
        masks.size === 1
          ? `${intToIp(major)}/${[...masks][0]} is subnetted, ${subnets} subnet${subnets === 1 ? '' : 's'}`
          : `${intToIp(major)}/${classful} is variably subnetted, ${subnets} subnets, ${masks.size} masks`
      rows.push({ type: 'header', text, key: `h-${major}` })
    }
    rows.push({ type: 'route', route, indent: true })
  }
  return rows
}

export function gatewayLine(routes) {
  const def = routes.find((r) => r.prefix === 0)
  return def ? `Gateway of last resort is ${def.via} to network 0.0.0.0` : 'Gateway of last resort is not set'
}

/** Which neighbor in the diagram an exit interface leads to. */
export const IFACE_NEIGHBOR = {
  'GigabitEthernet0/0': 'lan',
  'GigabitEthernet0/1': 'r2',
  'GigabitEthernet0/2': 'r3',
  'GigabitEthernet0/3': 'isp'
}

/** Shuffle helper for the standalone mode (Fisher-Yates). */
export function shuffled(list, rand = Math.random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
