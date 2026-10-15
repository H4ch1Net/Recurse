// NAT and PAT: a translation table that behaves like `show ip nat translations` on
// IOS. Static NAT shows its one-to-one entries before any traffic. Dynamic NAT takes
// an address from a pool on a host's first packet and fails when the pool is empty.
// PAT (overload) shares one public address and tells flows apart by source port.

export const MODES = ['static', 'dynamic', 'pat']

export const MODE_LABEL = { static: 'Static NAT', dynamic: 'Dynamic NAT (pool)', pat: 'PAT (overload)' }

export const HOSTS = [
  { id: 'pc1', name: 'PC1', ip: '192.168.1.10', basePort: 49152 },
  { id: 'pc2', name: 'PC2', ip: '192.168.1.11', basePort: 49152 },
  { id: 'pc3', name: 'PC3', ip: '192.168.1.12', basePort: 50310 },
  { id: 'pc4', name: 'PC4', ip: '192.168.1.13', basePort: 51007 }
]

export const SERVER = { name: 'Web server', ip: '198.51.100.80', port: 80 }
export const INSIDE_IF = { name: 'GigabitEthernet0/0', short: 'Gi0/0', ip: '192.168.1.1' }
export const OUTSIDE_IF = { name: 'GigabitEthernet0/1', short: 'Gi0/1', ip: '203.0.113.1' }

export const STATIC_MAP = {
  '192.168.1.10': '203.0.113.10',
  '192.168.1.11': '203.0.113.11',
  '192.168.1.12': '203.0.113.12'
}

export const POOL = { name: 'PUBLIC', first: '203.0.113.20', last: '203.0.113.22', addresses: ['203.0.113.20', '203.0.113.21', '203.0.113.22'] }

export const TERMS = {
  insideLocal: {
    name: 'Inside local',
    short: 'The inside host’s address as seen on the inside network. Usually a private address.',
    example: '192.168.1.10'
  },
  insideGlobal: {
    name: 'Inside global',
    short: 'The inside host’s address as the outside world sees it, after translation. A public address.',
    example: '203.0.113.1'
  },
  outsideLocal: {
    name: 'Outside local',
    short: 'The outside host’s address as seen from the inside network. With no outside NAT, it equals the outside global.',
    example: '198.51.100.80'
  },
  outsideGlobal: {
    name: 'Outside global',
    short: 'The outside host’s real address on the outside network.',
    example: '198.51.100.80'
  }
}

export const TERM_KEYS = ['insideGlobal', 'insideLocal', 'outsideLocal', 'outsideGlobal']

const hostById = (id) => HOSTS.find((h) => h.id === id)

/** A fresh NAT state for a mode. Static entries exist before any traffic. */
export function initialNat(mode) {
  const rows =
    mode === 'static'
      ? Object.entries(STATIC_MAP).map(([local, global]) => simpleRow(local, global, 'static'))
      : []
  return { mode, rows, flows: {}, hits: 0, misses: 0 }
}

function simpleRow(local, global, origin) {
  return { key: `s-${local}`, pro: '---', insideGlobal: global, insideLocal: local, outsideLocal: '---', outsideGlobal: '---', origin }
}

/** Every inside global address and port pair in use. */
function usedPorts(rows) {
  return new Set(rows.filter((r) => r.pro !== '---').map((r) => r.insideGlobal))
}

/**
 * Send one new flow from an inside host to the web server. Returns { state, result }
 * where result = { kind, host, before: {src, dst}, after: {src, dst} | null,
 * rowKey, newRow, portChanged, text }.
 * kinds: 'static' | 'untranslated' | 'dynamic-new' | 'dynamic-reuse' | 'exhausted' | 'pat'
 */
export function sendFlow(state, hostId) {
  const host = hostById(hostId)
  const n = state.flows[hostId] || 0
  const port = host.basePort + n
  const flows = { ...state.flows, [hostId]: n + 1 }
  const dst = `${SERVER.ip}:${SERVER.port}`
  const before = { src: `${host.ip}:${port}`, dst }
  const base = { host, before, after: null, rowKey: null, newRow: false, portChanged: false }

  if (state.mode === 'static') {
    const global = STATIC_MAP[host.ip]
    if (!global) {
      return {
        state: { ...state, flows },
        result: { ...base, kind: 'untranslated', after: before, text: `${host.name} (${host.ip}) has no static entry, so R1 sends it out untranslated. Private addresses are not routed on the internet, so no reply ever comes back.` }
      }
    }
    return {
      state: { ...state, flows, hits: state.hits + 1 },
      result: { ...base, kind: 'static', after: { src: `${global}:${port}`, dst }, rowKey: `s-${host.ip}`, text: `The static entry was already there, built by your configuration. ${host.ip} always becomes ${global}, one to one.` }
    }
  }

  if (state.mode === 'dynamic') {
    const existing = state.rows.find((r) => r.insideLocal === host.ip)
    if (existing) {
      return {
        state: { ...state, flows, hits: state.hits + 1 },
        result: { ...base, kind: 'dynamic-reuse', after: { src: `${existing.insideGlobal}:${port}`, dst }, rowKey: existing.key, text: `${host.name} already holds ${existing.insideGlobal} from the pool, so this flow reuses it.` }
      }
    }
    const taken = new Set(state.rows.map((r) => r.insideGlobal))
    const free = POOL.addresses.find((a) => !taken.has(a))
    if (!free) {
      return {
        state: { ...state, flows, misses: state.misses + 1 },
        result: {
          ...base,
          kind: 'exhausted',
          text: `Pool exhausted: all ${POOL.addresses.length} addresses are in use by ${state.rows.map((r) => hostByIp(r.insideLocal)?.name).join(', ')}. R1 cannot translate ${host.name}, so it drops the packet. Dynamic NAT is still one to one.`
        }
      }
    }
    const row = simpleRow(host.ip, free, 'dynamic')
    return {
      state: { ...state, flows, rows: [...state.rows, row], hits: state.hits + 1 },
      result: { ...base, kind: 'dynamic-new', after: { src: `${free}:${port}`, dst }, rowKey: row.key, newRow: true, text: `${host.name} gets the next free pool address, ${free}. It keeps it until the entry times out (24 hours by default) or is cleared.` }
    }
  }

  // PAT: one public IP, a unique port per flow. IOS keeps the original port when it is free.
  const used = usedPorts(state.rows)
  let global = port
  while (used.has(`${OUTSIDE_IF.ip}:${global}`)) global += 1
  const row = {
    key: `p-${host.ip}:${port}`,
    pro: 'tcp',
    insideGlobal: `${OUTSIDE_IF.ip}:${global}`,
    insideLocal: `${host.ip}:${port}`,
    outsideLocal: dst,
    outsideGlobal: dst,
    origin: 'pat'
  }
  const portChanged = global !== port
  return {
    state: { ...state, flows, rows: [...state.rows, row], hits: state.hits + 1 },
    result: {
      ...base,
      kind: 'pat',
      after: { src: row.insideGlobal, dst },
      rowKey: row.key,
      newRow: true,
      portChanged,
      text: portChanged
        ? `Port ${port} on ${OUTSIDE_IF.ip} is already taken by another flow, so R1 gives ${host.name} port ${global} instead. The port is what keeps the flows apart.`
        : `${host.name} shares ${OUTSIDE_IF.ip} with everyone else. R1 keeps its source port ${port} because it is free.`
    }
  }
}

function hostByIp(ip) {
  return HOSTS.find((h) => h.ip === ip)
}

/** `clear ip nat translation *`: dynamic entries go, static entries stay. */
export function clearTranslations(state) {
  return { ...state, rows: state.rows.filter((r) => r.origin === 'static') }
}

/** Pool usage for dynamic NAT. */
export function poolUsage(state) {
  const taken = new Set(state.rows.map((r) => r.insideGlobal))
  return POOL.addresses.map((a) => ({ address: a, host: hostByIp(state.rows.find((r) => r.insideGlobal === a)?.insideLocal)?.name || null, used: taken.has(a) }))
}

/** The IOS configuration for a mode. */
export function configFor(mode) {
  const common = [
    `interface ${INSIDE_IF.name}`,
    ` ip address ${INSIDE_IF.ip} 255.255.255.0`,
    ' ip nat inside',
    `interface ${OUTSIDE_IF.name}`,
    ` ip address ${OUTSIDE_IF.ip} 255.255.255.0`,
    ' ip nat outside'
  ]
  if (mode === 'static') return [...common, ...Object.entries(STATIC_MAP).map(([l, g]) => `ip nat inside source static ${l} ${g}`)]
  if (mode === 'dynamic') {
    return [
      ...common,
      'access-list 1 permit 192.168.1.0 0.0.0.255',
      `ip nat pool ${POOL.name} ${POOL.first} ${POOL.last} netmask 255.255.255.0`,
      `ip nat inside source list 1 pool ${POOL.name}`
    ]
  }
  return [...common, 'access-list 1 permit 192.168.1.0 0.0.0.255', `ip nat inside source list 1 interface ${OUTSIDE_IF.name} overload`]
}

/** Mode summary sentence. */
export const MODE_HELP = {
  static: 'One inside address maps to one public address, set by hand. Good for servers that must always have the same public address. Saves no addresses.',
  dynamic: 'Hosts borrow a public address from a pool on their first packet. Still one to one, so when the pool runs out, the next host gets nothing.',
  pat: 'Everyone shares one public address, and the router tells the flows apart by source port. This is what almost every home and office router does.'
}

// ---- Quiz ------------------------------------------------------------------------------

/** Which-term-is-which questions, based on PC2 browsing through PAT. */
export const QUIZ = [
  { id: 'q1', prompt: 'PC2 sends a packet to the web server. On the inside LAN, before R1 touches it, the source address is 192.168.1.11. Which term is that?', answer: 'insideLocal', why: 'It is the inside host, seen from the inside: inside local.' },
  { id: 'q2', prompt: 'After R1 translates it, the source becomes 203.0.113.1:49153. Which term is that?', answer: 'insideGlobal', why: 'Still the inside host, but now as the outside world sees it: inside global.' },
  { id: 'q3', prompt: 'The destination PC2 writes into its packet is 198.51.100.80, the server as seen from the inside network. Which term is that?', answer: 'outsideLocal', why: 'The outside host, as seen from the inside: outside local. With no outside NAT it matches the outside global.' },
  { id: 'q4', prompt: 'Out on the internet, the server’s own real address is 198.51.100.80. Which term is that?', answer: 'outsideGlobal', why: 'The outside host, seen on the outside: outside global.' }
]

/** Grade a quiz answer. */
export function checkQuiz(questionId, termKey) {
  const q = QUIZ.find((x) => x.id === questionId)
  if (!q) return { correct: false, why: '' }
  if (q.answer === termKey) return { correct: true, why: q.why }
  const picked = TERMS[termKey]?.name || 'That'
  const [side, view] = { insideLocal: ['inside', 'inside'], insideGlobal: ['inside', 'outside'], outsideLocal: ['outside', 'inside'], outsideGlobal: ['outside', 'outside'] }[termKey] || ['', '']
  return { correct: false, why: `${picked} means the ${side} host's address as seen from the ${view}. Ask two questions: whose address is it, and which side is looking?` }
}
