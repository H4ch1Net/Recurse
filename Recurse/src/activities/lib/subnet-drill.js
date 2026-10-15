// Subnetting drill: question generators for three difficulty levels, a forgiving
// grader with targeted hints, and worked solutions built on the magic number method.
import {
  bitsForSubnets,
  explainMaskBits,
  fromOctets,
  intToIp,
  magicSteps,
  parseIp,
  parsePrefixOrMask,
  prefixForHosts,
  prefixToMask,
  subnetFacts
} from './net'

export const DIFFICULTIES = ['easy', 'medium', 'hard']

export const normalizeDifficulty = (value) => (DIFFICULTIES.includes(value) ? value : 'easy')

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))
const pick = (rng, list) => list[Math.floor(rng() * list.length)]
const fmt = (n) => Number(n).toLocaleString('en-US')

// ---- Calculator input ----------------------------------------------------------------

/**
 * Read the calculator fields. The address box may also hold "10.1.2.3/26" or
 * "10.1.2.3 255.255.255.192", which wins over an empty prefix box.
 */
export function parseCalcInput(addressText, prefixText) {
  let addr = String(addressText ?? '').trim()
  let pre = String(prefixText ?? '').trim()
  const slash = addr.indexOf('/')
  if (slash >= 0) {
    pre = addr.slice(slash)
    addr = addr.slice(0, slash).trim()
  } else {
    const parts = addr.split(/\s+/)
    if (parts.length === 2) {
      addr = parts[0]
      pre = parts[1]
    }
  }
  const address = parseIp(addr)
  if (address === null) return { ok: false, field: 'address', error: 'Enter an IPv4 address such as 192.168.1.77.' }
  const prefix = parsePrefixOrMask(pre)
  if (prefix === null) return { ok: false, field: 'prefix', error: 'Enter a prefix such as /26, or a mask such as 255.255.255.192.' }
  return { ok: true, address, prefix }
}

// ---- Answer parsing -------------------------------------------------------------------

function parseNumber(text) {
  const s = String(text ?? '').replace(/[,\s_]/g, '')
  return /^\d+$/.test(s) ? Number(s) : null
}

/** "192.168.5.64/26", "192.168.5.64 /26" or "192.168.5.64 255.255.255.192". */
export function parseCidr(text) {
  const s = String(text ?? '').trim()
  const m = /^(\S+?)\s*(?:\/\s*(\d{1,2})|\s+(\S+))$/.exec(s)
  if (!m) return null
  const address = parseIp(m[1])
  const prefix = m[2] != null ? parsePrefixOrMask(m[2]) : parsePrefixOrMask(m[3])
  if (address === null || prefix === null) return null
  return { address, prefix }
}

/** Grade one field. Returns { ok, hint }. */
export function gradeField(field, given) {
  const text = String(given ?? '').trim()
  if (!text) return { ok: false, hint: 'Left blank.' }
  switch (field.type) {
    case 'ip': {
      const value = parseIp(text)
      if (value === null) return { ok: false, hint: 'That is not a valid IPv4 address.' }
      if (value === field.value) return { ok: true }
      return { ok: false, hint: field.traps?.[value] || '' }
    }
    case 'number': {
      const value = parseNumber(text)
      if (value === null) return { ok: false, hint: 'Type a whole number.' }
      if (value === field.value) return { ok: true }
      return { ok: false, hint: field.traps?.[value] || '' }
    }
    case 'prefix': {
      const value = parsePrefixOrMask(text)
      if (value === null) return { ok: false, hint: 'Type a prefix such as /26.' }
      return value === field.value ? { ok: true } : { ok: false, hint: '' }
    }
    case 'mask': {
      if (/^\/?\d{1,2}$/.test(text)) {
        return Number(text.replace('/', '')) === field.value
          ? { ok: false, hint: 'Right size, but write it as a dotted mask such as 255.255.255.0.' }
          : { ok: false, hint: 'Write the mask in dotted decimal.' }
      }
      const value = parsePrefixOrMask(text)
      if (value === null) return { ok: false, hint: 'Not a valid mask: the one bits must be contiguous.' }
      return value === field.value ? { ok: true } : { ok: false, hint: '' }
    }
    case 'cidr': {
      const value = parseCidr(text)
      if (!value) return { ok: false, hint: 'Write it as network/prefix, such as 192.168.5.64/26.' }
      const okNet = value.address === field.value.address
      const okPre = value.prefix === field.value.prefix
      if (okNet && okPre) return { ok: true }
      if (okNet) return { ok: false, hint: 'Right start address, wrong size.' }
      if (okPre) return { ok: false, hint: 'Right size, wrong start address.' }
      return { ok: false, hint: '' }
    }
    default:
      return { ok: false, hint: '' }
  }
}

/** Grade every field of a question. answers: { [key]: text }. */
export function gradeQuestion(question, answers) {
  const fields = question.fields.map((field) => {
    const result = gradeField(field, answers?.[field.key])
    return { key: field.key, label: field.label, ok: result.ok, hint: result.hint, expected: field.display }
  })
  const correct = fields.filter((f) => f.ok).length
  return { fields, correct, total: fields.length, allCorrect: correct === fields.length }
}

// ---- Field builders ---------------------------------------------------------------------

function ipField(key, label, value, traps = {}) {
  return { key, label, type: 'ip', value, display: intToIp(value), traps }
}
const numberField = (key, label, value, traps = {}) => ({ key, label, type: 'number', value, display: fmt(value), traps })
const prefixField = (key, label, prefix) => ({ key, label, type: 'prefix', value: prefix, display: `/${prefix}` })
const maskField = (key, label, prefix) => ({ key, label, type: 'mask', value: prefix, display: prefixToMask(prefix) })
const cidrField = (key, label, address, prefix) => ({ key, label, type: 'cidr', value: { address, prefix }, display: `${intToIp(address)}/${prefix}` })

/** The four classic fields, with traps for the usual slips. */
function subnetFields(f, { withRange = true } = {}) {
  const next = (f.broadcastInt + 1) >>> 0
  const fields = [
    ipField('network', 'Network address', f.networkInt, {
      [f.broadcastInt]: 'That is the broadcast. The network is the lowest address in the block.',
      [f.addressInt]: f.addressInt === f.networkInt ? undefined : 'That is the host itself. Set the host bits to 0 to get the network.',
      [f.firstHostInt]: 'That is the first usable host. The network is one below it.'
    }),
    ipField('broadcast', 'Broadcast address', f.broadcastInt, {
      [f.networkInt]: 'That is the network address. The broadcast is the highest address in the block.',
      [next]: 'That is where the next subnet starts. The broadcast is one less.',
      [f.lastHostInt]: 'That is the last usable host. The broadcast is one above it.'
    })
  ]
  if (withRange) {
    fields.push(
      ipField('first', 'First usable host', f.firstHostInt, { [f.networkInt]: 'The network address cannot be a host. Add one.' }),
      ipField('last', 'Last usable host', f.lastHostInt, { [f.broadcastInt]: 'The broadcast address cannot be a host. Subtract one.' })
    )
  }
  return fields
}

function hostsField(f) {
  return numberField('hosts', 'Usable hosts', f.usableHosts, {
    [f.totalAddresses]: 'That counts every address. Subtract 2 for the network and broadcast.',
    [f.totalAddresses - 1]: 'Subtract 2, not 1: both the network and broadcast addresses are reserved.'
  })
}

// ---- Address pickers ------------------------------------------------------------------------

/** A random host address (not the network or broadcast) inside a random subnet of the right size. */
function randomHost(rng, prefix) {
  let first
  if (prefix < 16) first = [10, randInt(rng, 0, 255)]
  else first = pick(rng, [[10, randInt(rng, 0, 255)], [172, randInt(rng, 16, 31)], [192, 168]])
  const base = fromOctets([first[0], first[1], randInt(rng, 0, 255), randInt(rng, 0, 255)])
  const f = subnetFacts(base, prefix)
  const span = f.totalAddresses
  const offset = span > 2 ? randInt(rng, 1, Math.min(span - 2, 2 ** 31)) : 0
  return (f.networkInt + offset) >>> 0
}

// ---- Generators ------------------------------------------------------------------------------

let counter = 0
const nextId = (kind) => `${kind}-${++counter}`

function easyQuestion(rng) {
  const prefix = randInt(rng, 24, 30)
  const address = randomHost(rng, prefix)
  const f = subnetFacts(address, prefix)
  return {
    id: nextId('easy'),
    kind: 'host',
    difficulty: 'easy',
    title: 'Find the subnet',
    prompt: `A host has address ${f.address}/${prefix} (mask ${f.mask}). Fill in its subnet.`,
    given: { address, prefix, showMask: true },
    fields: [...subnetFields(f), hostsField(f)],
    solution: magicSteps(address, prefix).steps,
    binary: { address, prefix }
  }
}

function mediumQuestion(rng) {
  const octet = pick(rng, [1, 2, 2, 3, 3])
  let prefix = octet * 8 + randInt(rng, 1, 7)
  if (rng() < 0.12) prefix = octet * 8
  prefix = Math.min(30, Math.max(9, prefix))
  const address = randomHost(rng, prefix)
  const f = subnetFacts(address, prefix)
  const givenMask = rng() < 0.5
  const fields = subnetFields(f)
  fields.push(givenMask ? prefixField('prefix', 'Prefix length', prefix) : maskField('mask', 'Subnet mask', prefix))
  const steps = magicSteps(address, prefix).steps
  return {
    id: nextId('medium'),
    kind: 'host',
    difficulty: 'medium',
    title: 'Find the subnet',
    prompt: givenMask
      ? `A host has address ${f.address} with mask ${f.mask}. Fill in its subnet and the prefix length.`
      : `A host has address ${f.address}/${prefix}. Fill in its subnet and the dotted subnet mask.`,
    given: { address, prefix, showMask: givenMask },
    fields,
    solution: [explainMaskBits(prefix), ...steps],
    binary: { address, prefix }
  }
}

const VLSM_BIG = [100, 110, 120, 60, 58, 50, 45]
const VLSM_MID = [30, 28, 25, 20, 14, 12]
const VLSM_SMALL = [10, 8, 6, 5, 3]
const LAN_NAMES = ['Sales', 'Engineering', 'Guest', 'Admin', 'Lab', 'Support', 'Warehouse', 'Finance']

function vlsmQuestion(rng) {
  const base = fromOctets(pick(rng, [[192, 168, randInt(rng, 0, 255), 0], [10, randInt(rng, 0, 255), randInt(rng, 0, 255), 0], [172, randInt(rng, 16, 31), randInt(rng, 0, 255), 0]]))
  const names = [...LAN_NAMES].sort(() => rng() - 0.5)
  const sizes = [pick(rng, VLSM_BIG), pick(rng, VLSM_MID), pick(rng, VLSM_SMALL)]
  const needs = sizes.map((hosts, i) => ({ name: `${names[i]} LAN`, hosts })).concat({ name: 'Router link', hosts: 2 })
  needs.sort((a, b) => b.hosts - a.hosts)
  let cursor = base
  const plan = needs.map((need) => {
    const prefix = prefixForHosts(need.hosts)
    const size = 2 ** (32 - prefix)
    const start = cursor
    cursor = (cursor + size) >>> 0
    return { ...need, prefix, size, start, end: (start + size - 1) >>> 0, usable: size - 2 }
  })
  const fields = plan.map((p, i) => cidrField(`vlsm${i}`, `${p.name} (${p.hosts} hosts)`, p.start, p.prefix))
  const solution = [
    `Sort the needs from largest to smallest and hand out blocks in that order, starting at ${intToIp(base)}. Big blocks first keeps every block aligned.`,
    ...plan.map(
      (p) =>
        `${p.name} needs ${p.hosts} hosts. The smallest block that fits is /${p.prefix}: 2^${32 - p.prefix} - 2 = ${p.usable} usable. It runs ${intToIp(p.start)} to ${intToIp(p.end)}, so the next free address is ${intToIp(p.end + 1)}.`
    )
  ]
  return {
    id: nextId('vlsm'),
    kind: 'vlsm',
    difficulty: 'hard',
    title: 'VLSM plan',
    prompt: `Carve ${intToIp(base)}/24 with VLSM. Allocate the largest subnet first, each one starting right after the previous one, using the smallest block that fits. Write each as network/prefix.`,
    given: { base },
    fields,
    solution,
    plan
  }
}

function subnetCountQuestion(rng) {
  const [baseText, basePrefix] = pick(rng, [['10.0.0.0', 8], ['172.16.0.0', 16], ['172.20.0.0', 16], ['192.168.10.0', 24]])
  const newPrefix = basePrefix === 24 ? randInt(rng, 25, 30) : randInt(rng, basePrefix + 2, Math.min(30, basePrefix + 10))
  const borrowed = newPrefix - basePrefix
  const subnets = 2 ** borrowed
  const hosts = 2 ** (32 - newPrefix) - 2
  const useMask = rng() < 0.5
  const written = useMask ? `mask ${prefixToMask(newPrefix)}` : `/${newPrefix}`
  return {
    id: nextId('count'),
    kind: 'count',
    difficulty: 'hard',
    title: 'How many subnets?',
    prompt: `${baseText}/${basePrefix} is subnetted with ${written}. How many subnets does that make, and how many usable hosts are in each?`,
    given: { basePrefix, newPrefix },
    fields: [
      numberField('subnets', 'Number of subnets', subnets, {
        [subnets - 2]: 'Modern subnetting (ip subnet-zero, on by default) uses every subnet: no need to subtract 2.',
        [2 ** (32 - newPrefix)]: 'That is the block size. Count subnets from the borrowed bits.'
      }),
      numberField('hosts', 'Usable hosts per subnet', hosts, {
        [hosts + 2]: 'Subtract 2 for the network and broadcast addresses.',
        [subnets]: 'That is the subnet count. Hosts come from the bits left over.'
      })
    ],
    solution: [
      useMask ? explainMaskBits(newPrefix) : `/${newPrefix} is mask ${prefixToMask(newPrefix)}.`,
      `You borrowed ${newPrefix} - ${basePrefix} = ${borrowed} bits for subnets: 2^${borrowed} = ${fmt(subnets)} subnets.`,
      `${32 - newPrefix} host bits remain: 2^${32 - newPrefix} - 2 = ${fmt(hosts)} usable hosts in each subnet.`
    ]
  }
}

function needSubnetsQuestion(rng) {
  const [baseText, basePrefix] = pick(rng, [['10.0.0.0', 8], ['172.16.0.0', 16], ['172.25.0.0', 16], ['192.168.4.0', 24]])
  const maxBits = basePrefix === 24 ? 5 : 10
  const bits = randInt(rng, 2, maxBits)
  const need = randInt(rng, 2 ** (bits - 1) + 1, 2 ** bits)
  const prefix = basePrefix + bitsForSubnets(need)
  const hosts = 2 ** (32 - prefix) - 2
  return {
    id: nextId('need'),
    kind: 'need',
    difficulty: 'hard',
    title: 'Size the mask',
    prompt: `You need at least ${need} subnets from ${baseText}/${basePrefix}, each as large as possible. Which mask do you use, and how many usable hosts does each subnet get?`,
    given: { basePrefix, need },
    fields: [
      maskField('mask', 'Subnet mask', prefix),
      numberField('hosts', 'Usable hosts per subnet', hosts, { [hosts + 2]: 'Subtract 2 for the network and broadcast addresses.' })
    ],
    solution: [
      `Find the fewest bits that give ${need} subnets: 2^${bitsForSubnets(need) - 1} = ${2 ** (bitsForSubnets(need) - 1)} is too few, 2^${bitsForSubnets(need)} = ${2 ** bitsForSubnets(need)} is enough.`,
      `Borrow ${bitsForSubnets(need)} bits: /${basePrefix} + ${bitsForSubnets(need)} = /${prefix}, which is ${prefixToMask(prefix)}.`,
      `${32 - prefix} host bits remain: 2^${32 - prefix} - 2 = ${fmt(hosts)} usable hosts per subnet.`
    ]
  }
}

function whichSubnetQuestion(rng) {
  const octet = pick(rng, [1, 2, 2])
  const prefix = octet * 8 + randInt(rng, 1, 7)
  const address = randomHost(rng, prefix)
  const f = subnetFacts(address, prefix)
  const useMask = rng() < 0.6
  return {
    id: nextId('which'),
    kind: 'which',
    difficulty: 'hard',
    title: 'Which subnet?',
    prompt: `Which subnet does host ${f.address} ${useMask ? `with mask ${f.mask}` : `/${prefix}`} belong to? Give the subnet ID, its broadcast and its last usable host.`,
    given: { address, prefix, showMask: useMask },
    fields: [...subnetFields(f, { withRange: false }), subnetFields(f)[3]],
    solution: [useMask ? explainMaskBits(prefix) : `/${prefix} is mask ${f.mask}.`, ...magicSteps(address, prefix).steps],
    binary: { address, prefix }
  }
}

const HARD = [vlsmQuestion, subnetCountQuestion, needSubnetsQuestion, whichSubnetQuestion]

/** A fresh question at the given difficulty. `rng` defaults to Math.random. */
export function generateQuestion(difficulty = 'easy', rng = Math.random) {
  const level = normalizeDifficulty(difficulty)
  if (level === 'easy') return easyQuestion(rng)
  if (level === 'medium') return mediumQuestion(rng)
  return pick(rng, HARD)(rng)
}

/** Generators by name, for tests and for content that wants one kind. */
export const GENERATORS = {
  easy: easyQuestion,
  medium: mediumQuestion,
  vlsm: vlsmQuestion,
  count: subnetCountQuestion,
  need: needSubnetsQuestion,
  which: whichSubnetQuestion
}

/** The answers a perfect learner would type, for tests and "show answer". */
export function answerKey(question) {
  return Object.fromEntries(question.fields.map((f) => [f.key, f.display]))
}

// ---- Calculator explore tasks ------------------------------------------------------------

export const CALC_TASKS = [
  { id: 'boundary', label: 'Try a prefix on an octet boundary, such as /24 or /16.', test: (p) => p % 8 === 0 && p > 0 && p < 32 },
  { id: 'last', label: 'Try a prefix from /25 to /30, where the 4th octet is interesting.', test: (p) => p >= 25 && p <= 30 },
  { id: 'third', label: 'Try a prefix from /17 to /23, where the 3rd octet is interesting.', test: (p) => p >= 17 && p <= 23 }
]
