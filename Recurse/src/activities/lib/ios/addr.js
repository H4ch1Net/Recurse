// Address math and interface naming for the IOS simulator. Pure functions, no state.

// ---------- IPv4 ----------

/** Parse dotted decimal into an unsigned 32-bit number, or null. */
export function parseIPv4(s) {
  if (typeof s !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return null
  const parts = s.split('.').map(Number)
  if (parts.some((n) => n > 255)) return null
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

export const isIPv4 = (s) => parseIPv4(s) !== null

export function ipToStr(n) {
  return [24, 16, 8, 0].map((b) => (n >>> b) & 255).join('.')
}

/** Prefix length of a contiguous mask, or null when the mask is not contiguous. */
export function maskToPrefix(mask) {
  const n = parseIPv4(mask)
  if (n === null) return null
  let bits = 0
  let seenZero = false
  for (let b = 31; b >= 0; b--) {
    if ((n >>> b) & 1) {
      if (seenZero) return null
      bits++
    } else seenZero = true
  }
  return bits
}

export function prefixToMaskNum(len) {
  return len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0
}

export const prefixToMask = (len) => ipToStr(prefixToMaskNum(len))

/** Network address of ip/mask as a string. */
export function networkOf(ip, mask) {
  const a = parseIPv4(ip)
  const m = typeof mask === 'number' ? prefixToMaskNum(mask) : parseIPv4(mask)
  if (a === null || m === null) return ip
  return ipToStr((a & m) >>> 0)
}

/** True when ip falls inside network/len. */
export function inPrefix(ip, network, len) {
  const a = parseIPv4(ip)
  const n = parseIPv4(network)
  if (a === null || n === null) return false
  const m = prefixToMaskNum(len)
  return ((a & m) >>> 0) === ((n & m) >>> 0)
}

/** Wildcard match used by ACLs and OSPF network statements: bits set in the wildcard are ignored. */
export function wildMatch(ip, addr, wild) {
  const a = parseIPv4(ip)
  const b = parseIPv4(addr)
  const w = parseIPv4(wild)
  if (a === null || b === null || w === null) return false
  const care = ~w >>> 0
  return ((a & care) >>> 0) === ((b & care) >>> 0)
}

/** Clear the wildcard bits, the way IOS normalizes ACL and OSPF entries. */
export function applyWildcard(addr, wild) {
  const a = parseIPv4(addr)
  const w = parseIPv4(wild)
  if (a === null || w === null) return addr
  return ipToStr((a & ~w) >>> 0)
}

/** Number of zero bits from the left in a wildcard, used to rank network statements. */
export function wildcardSpecificity(wild) {
  const w = parseIPv4(wild)
  if (w === null) return 0
  let n = 0
  for (let b = 31; b >= 0 && !((w >>> b) & 1); b--) n++
  return n
}

/** Classful prefix length for the routing table's grouping headers. */
export function classfulLen(ip) {
  const first = Number(String(ip).split('.')[0])
  if (first < 128) return 8
  if (first < 192) return 16
  return 24
}

export function ipCompare(a, b) {
  return (parseIPv4(a) ?? 0) - (parseIPv4(b) ?? 0)
}

// ---------- IPv6 ----------

/** Parse an IPv6 address (no prefix) into a BigInt, or null. */
export function parseIPv6(s) {
  if (typeof s !== 'string' || !/^[0-9a-fA-F:]+$/.test(s) || s.length < 2) return null
  const dbl = s.split('::')
  if (dbl.length > 2) return null
  const head = dbl[0] ? dbl[0].split(':') : []
  const tail = dbl.length === 2 && dbl[1] ? dbl[1].split(':') : []
  if ([...head, ...tail].some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null
  let groups
  if (dbl.length === 2) {
    const fill = 8 - head.length - tail.length
    if (fill < 1) return null
    groups = [...head, ...Array(fill).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n)
}

export const isIPv6 = (s) => parseIPv6(s) !== null

/** Compressed, upper-case text form, the way IOS prints addresses. */
export function ipv6ToStr(n) {
  const groups = []
  for (let i = 7; i >= 0; i--) groups.push(Number((n >> BigInt(i * 16)) & 0xffffn))
  let best = -1
  let bestLen = 0
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++
      continue
    }
    let j = i
    while (j < 8 && groups[j] === 0) j++
    if (j - i > bestLen && j - i >= 2) {
      best = i
      bestLen = j - i
    }
    i = j
  }
  const hex = groups.map((g) => g.toString(16).toUpperCase())
  if (best < 0) return hex.join(':')
  const left = hex.slice(0, best).join(':')
  const right = hex.slice(best + bestLen).join(':')
  return `${left}::${right}`
}

/** "2001:db8::1/64" into { addr, len }, or null. */
export function parseIPv6Prefix(s) {
  const m = String(s).match(/^([0-9a-fA-F:]+)\/(\d{1,3})$/)
  if (!m) return null
  const addr = parseIPv6(m[1])
  const len = Number(m[2])
  if (addr === null || len > 128) return null
  return { addr, len }
}

export function ipv6Mask(len) {
  if (len === 0) return 0n
  return ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - len)) - 1n)
}

export function ipv6Network(addr, len) {
  return addr & ipv6Mask(len)
}

/** Normalize "2001:db8:0:12::1/64" to "2001:DB8:0:12::1/64". */
export function normIPv6Prefix(s) {
  const p = parseIPv6Prefix(s)
  return p ? `${ipv6ToStr(p.addr)}/${p.len}` : String(s).toUpperCase()
}

export function normIPv6(s) {
  const a = parseIPv6(s)
  return a === null ? String(s).toUpperCase() : ipv6ToStr(a)
}

// ---------- MAC ----------

/** "0c8f.1a2b.3c00" plus an offset, kept in Cisco dotted form. */
export function macAdd(mac, offset) {
  const n = parseInt(mac.replace(/\./g, ''), 16) + offset
  const hex = n.toString(16).padStart(12, '0').slice(-12)
  return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`
}

/** EUI-64 interface ID from a MAC, as a BigInt for the low 64 bits. */
export function eui64(mac) {
  const hex = mac.replace(/[.:-]/g, '').toLowerCase()
  const bytes = hex.match(/../g).map((b) => parseInt(b, 16))
  bytes[0] ^= 0x02
  const all = [...bytes.slice(0, 3), 0xff, 0xfe, ...bytes.slice(3)]
  return all.reduce((acc, b) => (acc << 8n) + BigInt(b), 0n)
}

export function linkLocalFor(mac) {
  return ipv6ToStr((0xfe80n << 112n) + eui64(mac))
}

// ---------- Interface names ----------

/** Interface types the simulator knows, in the order IOS lists them. */
export const IF_TYPES = [
  { type: 'GigabitEthernet', short: 'Gi', cdp: 'Gig', help: 'GigabitEthernet IEEE 802.3z' },
  { type: 'Loopback', short: 'Lo', cdp: 'Lo', help: 'Loopback interface' },
  { type: 'Port-channel', short: 'Po', cdp: 'Po', help: 'Ethernet Channel of interfaces' },
  { type: 'Vlan', short: 'Vl', cdp: 'Vl', help: 'Catalyst Vlans' }
]

const PREFIXES = [
  [/^(te|ten|tengig|tengigabitethernet)$/i, 'TenGigabitEthernet'],
  [/^g(i(g(a(b(i(t(e(t(h(e(r(n(e(t)?)?)?)?)?)?)?)?)?)?)?)?)?)?$/i, 'GigabitEthernet'],
  [/^f(a(s(t(e(t(h(e(r(n(e(t)?)?)?)?)?)?)?)?)?)?)?$/i, 'FastEthernet'],
  [/^l(o(o(p(b(a(c(k)?)?)?)?)?)?)?$/i, 'Loopback'],
  [/^v(l(a(n)?)?)?$/i, 'Vlan'],
  [/^p(o(r(t(-(c(h(a(n(n(e(l)?)?)?)?)?)?)?)?)?)?)?$/i, 'Port-channel'],
  [/^portchannel$/i, 'Port-channel'],
  [/^s(e(r(i(a(l)?)?)?)?)?$/i, 'Serial']
]

/** Turn "gi0/0", "g 0/0", "GigabitEthernet0/0.10" into the canonical spelling, or null. */
export function canonicalIf(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, '')
  const m = s.match(/^([a-zA-Z-]+)(\d[\d/.]*)$/)
  if (!m) return null
  for (const [re, full] of PREFIXES) if (re.test(m[1])) return `${full}${m[2]}`
  return null
}

const SHORT = { GigabitEthernet: 'Gi', TenGigabitEthernet: 'Te', FastEthernet: 'Fa', Loopback: 'Lo', Vlan: 'Vl', 'Port-channel': 'Po', Serial: 'Se' }
const CDP_SHORT = { GigabitEthernet: 'Gig ', TenGigabitEthernet: 'Ten ', FastEthernet: 'Fas ', Loopback: 'Lo', Vlan: 'Vl', 'Port-channel': 'Po', Serial: 'Ser ' }

function splitIf(name) {
  const m = String(name).match(/^([A-Za-z-]+)(\d.*)$/)
  return m ? [m[1], m[2]] : [name, '']
}

/** "GigabitEthernet0/0" to "Gi0/0". */
export function shortIf(name) {
  const [type, num] = splitIf(name)
  return `${SHORT[type] ?? type}${num}`
}

/** "GigabitEthernet0/24" to "Gig 0/24", the CDP neighbor table style. */
export function cdpIf(name) {
  const [type, num] = splitIf(name)
  return `${CDP_SHORT[type] ?? type}${num}`
}

export function ifType(name) {
  return splitIf(name)[0]
}

export function ifNumberParts(name) {
  return splitIf(name)[1].split(/[/.]/).map(Number)
}

export const isPhysical = (name) => /^(GigabitEthernet|FastEthernet|TenGigabitEthernet|Serial)\d[\d/]*$/.test(name)
export const isSubif = (name) => /^(GigabitEthernet|FastEthernet|TenGigabitEthernet)\d[\d/]*\.\d+$/.test(name)
export const parentIf = (name) => String(name).split('.')[0]

/** Sort interfaces: by type rank, then numerically. */
export function compareIf(a, b, rank) {
  const ra = rank[ifType(a)] ?? 50
  const rb = rank[ifType(b)] ?? 50
  if (ra !== rb) return ra - rb
  const pa = ifNumberParts(a)
  const pb = ifNumberParts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (d) return d
  }
  return 0
}

// ---------- VLAN lists ----------

/** "1,10-12,20" into [1, 10, 11, 12, 20]. Returns null on bad syntax. */
export function parseVlanList(text) {
  const out = new Set()
  for (const part of String(text).split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/)
    if (!m) return null
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (a < 1 || b > 4094 || b < a) return null
    for (let i = a; i <= b; i++) out.add(i)
  }
  return [...out].sort((x, y) => x - y)
}

/** [1, 10, 11, 12, 20] into "1,10-12,20". */
export function formatVlanList(ids) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    if (j - i >= 2) parts.push(`${sorted[i]}-${sorted[j]}`)
    else for (let k = i; k <= j; k++) parts.push(String(sorted[k]))
    i = j + 1
  }
  return parts.join(',')
}
