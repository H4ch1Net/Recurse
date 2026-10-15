// IPv6 tool: parse, expand and compress addresses, explain each shortening rule,
// build modified EUI-64 interface IDs and name the address type.
// Compression follows the CCNA book and RFC 5952: drop leading zeros in each group,
// then replace the longest run of two or more all-zero groups with "::" (only once;
// if two runs tie, shorten the first one). A single zero group stays "0".

const HEX_GROUP = /^[0-9a-fA-F]{1,4}$/

/**
 * Parse an IPv6 address. Returns { ok: true, hextets: number[8], gap: {start, len} | null,
 * groups: string[] (the groups as typed, without the gap) } or { ok: false, error }.
 */
export function parseIpv6(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return { ok: false, error: 'Type an address.' }
  if (raw.includes('.')) return { ok: false, error: 'Dotted IPv4 parts are not used here. Write every group in hex.' }
  if (/[^0-9a-fA-F:]/.test(raw)) return { ok: false, error: 'Only hex digits (0 to 9, A to F) and colons are allowed.' }
  if (raw.includes(':::')) return { ok: false, error: 'Three colons in a row is never valid.' }
  const pieces = raw.split('::')
  if (pieces.length > 2) return { ok: false, error: 'You can use :: only once. With two, nobody can tell how many zero groups each one stands for.' }
  const split = (part) => (part === '' ? [] : part.split(':'))
  const head = split(pieces[0])
  const tail = pieces.length === 2 ? split(pieces[1]) : []
  const all = [...head, ...tail]
  if (all.some((g) => g === '')) return { ok: false, error: 'There is an empty group. A single colon cannot start or end an address, and only :: may skip groups.' }
  const long = all.find((g) => g.length > 4)
  if (long) return { ok: false, error: `"${long}" has more than four hex digits. Each group holds at most four.` }
  if (all.some((g) => !HEX_GROUP.test(g))) return { ok: false, error: 'Each group must be one to four hex digits.' }
  let gap = null
  if (pieces.length === 2) {
    const missing = 8 - all.length
    if (missing < 1) return { ok: false, error: `With :: there must be fewer than 8 groups written. This has ${all.length}.` }
    gap = { start: head.length, len: missing }
  } else if (all.length !== 8) {
    return { ok: false, error: `An IPv6 address has 8 groups. This has ${all.length}${all.length < 8 ? '. Use :: to stand for the missing zero groups' : ''}.` }
  }
  const hextets = gap
    ? [...head, ...Array(gap.len).fill('0'), ...tail].map((g) => parseInt(g, 16))
    : all.map((g) => parseInt(g, 16))
  return { ok: true, hextets, gap, groups: all }
}

const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0')
const hexShort = (n) => n.toString(16).toUpperCase()

/** Full form: eight groups of four digits. */
export const expand = (hextets) => hextets.map(hex4).join(':')

/** All runs of zero groups: [{ start, len }]. */
export function zeroRuns(hextets) {
  const runs = []
  let start = -1
  hextets.forEach((h, i) => {
    if (h === 0 && start === -1) start = i
    if (h !== 0 && start !== -1) {
      runs.push({ start, len: i - start })
      start = -1
    }
  })
  if (start !== -1) runs.push({ start, len: hextets.length - start })
  return runs
}

/** The run that :: replaces: the longest of length 2 or more, the first one on a tie. */
export function bestRun(hextets) {
  let best = null
  for (const run of zeroRuns(hextets)) {
    if (run.len >= 2 && (!best || run.len > best.len)) best = run
  }
  return best
}

/** Shortest canonical form (uppercase, as Cisco and the exam write it). */
export function compress(hextets) {
  const groups = hextets.map(hexShort)
  const run = bestRun(hextets)
  if (!run) return groups.join(':')
  const left = groups.slice(0, run.start).join(':')
  const right = groups.slice(run.start + run.len).join(':')
  return `${left}::${right}`
}

/**
 * Step-by-step working for the widget: each group's full text, the leading zeros
 * that rule 1 drops, every zero run, and the run rule 2 replaces.
 */
export function compressSteps(hextets) {
  const groups = hextets.map((h) => {
    const full = hex4(h)
    const short = hexShort(h)
    return { full, short, dropped: full.length - short.length }
  })
  const runs = zeroRuns(hextets)
  const best = bestRun(hextets)
  const ties = best ? runs.filter((r) => r.len === best.len).length : 0
  return { groups, runs, best, tie: ties > 1, result: compress(hextets) }
}

/**
 * Grade a typed compressed answer for `target` (hextets). Returns { correct, same,
 * issues: [sentences] }. `same` is true when the answer is the right address but not
 * fully or properly shortened.
 */
export function diagnose(input, target) {
  const parsed = parseIpv6(input)
  const want = compress(target)
  if (!parsed.ok) return { correct: false, same: false, issues: [parsed.error] }
  const same = parsed.hextets.every((h, i) => h === target[i])
  if (!same) {
    const issues = ['That expands to a different address. Compare it group by group with the full form.']
    const tokens = String(input).trim().toUpperCase().split(':').filter(Boolean)
    const trimmedTrailing = target.some((h) => {
      const s = hexShort(h)
      return /0$/.test(s) && s.length > 1 && tokens.includes(s.replace(/0+$/, '')) && !tokens.includes(s)
    })
    if (trimmedTrailing) issues.push('Only leading zeros can go. A group like DB80 keeps its trailing zero.')
    if (parsed.gap && parsed.gap.len !== (bestRun(target)?.len ?? -1)) issues.push(`Your :: stands for ${parsed.gap.len} zero group${parsed.gap.len === 1 ? '' : 's'}, which changes the address.`)
    return { correct: false, same, issues }
  }
  const typed = String(input).trim().toUpperCase()
  if (typed === want) return { correct: true, same: true, issues: [] }
  const issues = []
  if (parsed.groups.some((g) => g.length > 1 && g.startsWith('0'))) issues.push('Drop the leading zeros in each group: 0DB8 becomes DB8, and 0000 becomes 0.')
  const best = bestRun(target)
  if (!parsed.gap && best) issues.push('Replace the longest run of zero groups with ::.')
  if (parsed.gap) {
    if (parsed.gap.len === 1) issues.push('Use :: only for two or more zero groups. Write a single zero group as 0.')
    else if (best && parsed.gap.len < best.len) {
      const inside = parsed.gap.start >= best.start && parsed.gap.start + parsed.gap.len <= best.start + best.len
      issues.push(inside ? 'Let :: swallow the whole run of zero groups, not just part of it.' : 'Use :: on the longest run of zero groups.')
    } else if (best && parsed.gap.len === best.len && parsed.gap.start !== best.start) {
      issues.push('Two runs tie for longest. The standard (RFC 5952) shortens the first one, on the left.')
    }
  }
  if (!issues.length) issues.push(`Close. The shortest form is ${want}.`)
  return { correct: false, same: true, issues }
}

// ---- Address types ---------------------------------------------------------------------

export const TYPES = [
  { id: 'unspecified', name: 'Unspecified', prefix: '::/128', note: 'All zeros. A host uses it as its source before it has an address.' },
  { id: 'loopback', name: 'Loopback', prefix: '::1/128', note: 'The IPv6 version of 127.0.0.1. Traffic never leaves the host.' },
  { id: 'multicast', name: 'Multicast', prefix: 'FF00::/8', note: 'One to many. IPv6 has no broadcast; multicast does that job.' },
  { id: 'link-local', name: 'Link-local', prefix: 'FE80::/10', note: 'Valid only on the local link and never routed. Every IPv6 interface has one, and routers use them as next hops.' },
  { id: 'unique-local', name: 'Unique local', prefix: 'FC00::/7', note: 'Private addressing, like RFC 1918 in IPv4. Not routed on the internet. In practice they start with FD.' },
  { id: 'global', name: 'Global unicast', prefix: '2000::/3', note: 'Public, routable on the internet. Starts with 2 or 3.' },
  { id: 'other', name: 'Other or reserved', prefix: '', note: 'Outside the ranges the CCNA asks about.' }
]

const MULTICAST_NOTES = {
  'FF02::1': 'FF02::1 is all nodes on the link.',
  'FF02::2': 'FF02::2 is all routers on the link.',
  'FF02::5': 'FF02::5 is all OSPFv3 routers.',
  'FF02::6': 'FF02::6 is OSPFv3 designated routers.',
  'FF02::A': 'FF02::A is all EIGRP routers.',
  'FF02::1:2': 'FF02::1:2 is all DHCPv6 servers and relay agents.'
}

/** Classify an address. Returns a TYPES entry plus an optional extra note. */
export function classify(hextets) {
  const pick = (id, extra = '') => ({ ...TYPES.find((t) => t.id === id), extra })
  const first = hextets[0]
  if (hextets.every((h) => h === 0)) return pick('unspecified')
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) return pick('loopback')
  if ((first & 0xff00) === 0xff00) {
    const short = compress(hextets)
    let extra = MULTICAST_NOTES[short] || ''
    if (!extra && first === 0xff02 && hextets[5] === 1 && hextets[6] >> 8 === 0xff) extra = 'This is a solicited-node multicast address (FF02::1:FF00:0/104), used by Neighbor Discovery in place of ARP.'
    if (!extra && (first & 0x000f) === 2) extra = 'The 2 in FF02 means link-local scope.'
    return pick('multicast', extra)
  }
  if ((first & 0xffc0) === 0xfe80) return pick('link-local')
  if ((first & 0xfe00) === 0xfc00) return pick('unique-local')
  if ((first & 0xe000) === 0x2000) {
    const doc = first === 0x2001 && hextets[1] === 0x0db8
    return pick('global', doc ? '2001:DB8::/32 is reserved for documentation and examples, like this one.' : '')
  }
  return pick('other')
}

// ---- EUI-64 -------------------------------------------------------------------------------

/** Parse a MAC in Cisco (0050.56ab.cdef), colon, dash or bare form. Returns 6 bytes or null. */
export function parseMac(text) {
  const raw = String(text ?? '').trim()
  let hex = null
  if (/^[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}$/.test(raw)) hex = raw.replace(/\./g, '')
  else if (/^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/.test(raw)) hex = raw.replace(/[:-]/g, '')
  else if (/^[0-9a-fA-F]{12}$/.test(raw)) hex = raw
  if (!hex) return null
  return Array.from({ length: 6 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))
}

const byteHex = (b) => b.toString(16).toUpperCase().padStart(2, '0')

/**
 * Modified EUI-64: split the MAC in half, insert FFFE, and flip the 7th bit (the
 * universal/local bit) of the first byte. Returns the working and the interface ID.
 */
export function eui64(mac) {
  const flipped = mac[0] ^ 0x02
  const bytes = [flipped, mac[1], mac[2], 0xff, 0xfe, mac[3], mac[4], mac[5]]
  const hextets = [0, 1, 2, 3].map((i) => (bytes[i * 2] << 8) | bytes[i * 2 + 1])
  return {
    oui: mac.slice(0, 3).map(byteHex),
    nic: mac.slice(3).map(byteHex),
    firstBefore: mac[0].toString(2).padStart(8, '0'),
    firstAfter: flipped.toString(2).padStart(8, '0'),
    firstByteBefore: byteHex(mac[0]),
    firstByteAfter: byteHex(flipped),
    bytes: bytes.map(byteHex),
    hextets,
    text: hextets.map(hex4).join(':')
  }
}

/** Join a /64 prefix (first four hextets) with a 64-bit interface ID. */
export function withPrefix(prefixHextets, iidHextets) {
  return [...prefixHextets.slice(0, 4), ...iidHextets.slice(0, 4)]
}

// ---- Drill ---------------------------------------------------------------------------------

const PATTERNS = ['one-run', 'single-zero', 'tie', 'two-runs', 'edge-run']

function randomGroup(rand) {
  const roll = rand()
  if (roll < 0.22) return 1 + Math.floor(rand() * 0xf)
  if (roll < 0.42) return 0x10 + Math.floor(rand() * 0xf0)
  if (roll < 0.62) return 0x100 + Math.floor(rand() * 0xf00)
  if (roll < 0.78) return [0xdb80, 0x1000, 0xfe00, 0xa000, 0x2300, 0xb0][Math.floor(rand() * 6)]
  return 0x1000 + Math.floor(rand() * 0xf000)
}

/** A random address that exercises one compression rule. */
export function drillAddress(pattern = PATTERNS[0], rand = Math.random) {
  const firsts = [0x2001, 0xfe80, 0xfd00, 0x2620, 0xff02, 0x3ffe]
  const h = Array.from({ length: 8 }, () => randomGroup(rand))
  h[0] = firsts[Math.floor(rand() * firsts.length)]
  if (h[0] === 0x2001) h[1] = rand() < 0.6 ? 0x0db8 : h[1]
  const zero = (start, len) => {
    for (let i = start; i < start + len; i++) h[i] = 0
  }
  if (pattern === 'one-run') {
    const len = 2 + Math.floor(rand() * 3)
    zero(2 + Math.floor(rand() * (6 - len)), len)
  } else if (pattern === 'single-zero') {
    zero(2, 1)
    zero(4 + Math.floor(rand() * 2), 2 + Math.floor(rand() * 2))
  } else if (pattern === 'tie') {
    zero(1, 2)
    zero(4, 2)
  } else if (pattern === 'two-runs') {
    zero(1, 2)
    zero(4, 3)
  } else if (rand() < 0.5) {
    // A run right after the first group, like FE80::1:2:3.
    zero(1, 4)
  } else {
    // A run touching the end, like 2001:DB8:1:2:3::.
    zero(5, 3)
  }
  return h
}

/** Five drill addresses, one per pattern, in a shuffled order. */
export function drillSet(rand = Math.random) {
  const order = [...PATTERNS]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order.map((p) => ({ pattern: p, hextets: drillAddress(p, rand) }))
}

export { PATTERNS }
