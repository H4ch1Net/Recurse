// IPv4 and MAC helpers shared by the networking activities. Addresses are handled
// as unsigned 32-bit integers so the math stays exact across every octet boundary,
// not just the last one.

const OCTET_RE = /^\d{1,3}$/

/** Parse dotted decimal ("192.168.1.10") to an unsigned int, or null when invalid. */
export function parseIp(text) {
  if (typeof text !== 'string') return null
  const parts = text.trim().split('.')
  if (parts.length !== 4 || parts.some((p) => !OCTET_RE.test(p))) return null
  const nums = parts.map(Number)
  if (nums.some((n) => n > 255)) return null
  return nums[0] * 2 ** 24 + nums[1] * 2 ** 16 + nums[2] * 2 ** 8 + nums[3]
}

export const isValidIp = (text) => parseIp(text) !== null

/** Strict version of parseIp for addresses written in code. */
export function ipToInt(ip) {
  const value = parseIp(ip)
  if (value === null) throw new Error(`Not an IPv4 address: ${ip}`)
  return value
}

export function intToIp(value) {
  const n = value >>> 0
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/** The four octets of an address as numbers. */
export function toOctets(value) {
  const n = value >>> 0
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

export function fromOctets(list) {
  return ((list[0] & 255) * 2 ** 24 + (list[1] & 255) * 2 ** 16 + (list[2] & 255) * 2 ** 8 + (list[3] & 255)) >>> 0
}

// ---- Masks and prefixes ------------------------------------------------------------

export function prefixToMaskInt(prefix) {
  if (prefix <= 0) return 0
  if (prefix >= 32) return 0xffffffff
  return (0xffffffff << (32 - prefix)) >>> 0
}

export const prefixToMask = (prefix) => intToIp(prefixToMaskInt(prefix))

export const wildcardIntFromPrefix = (prefix) => ~prefixToMaskInt(prefix) >>> 0

export const wildcardFromPrefix = (prefix) => intToIp(wildcardIntFromPrefix(prefix))

/** Count of one bits in a 32-bit value. */
export function popcount(value) {
  let n = value >>> 0
  let count = 0
  while (n) {
    count += n & 1
    n >>>= 1
  }
  return count
}

/** Prefix length of a mask, or null when its one bits are not contiguous. */
export function maskIntToPrefix(maskInt) {
  const inverse = ~maskInt >>> 0
  // A valid mask inverts to 0...01...1, and adding one to that gives a power of two.
  if ((inverse & (inverse + 1)) !== 0) return null
  return popcount(maskInt)
}

export function maskToPrefix(text) {
  const value = parseIp(text)
  return value === null ? null : maskIntToPrefix(value)
}

/** Accepts "/26", "26" or "255.255.255.192" and returns the prefix length, or null. */
export function parsePrefixOrMask(text) {
  if (typeof text !== 'string' && typeof text !== 'number') return null
  const s = String(text).trim()
  const m = /^\/?\s*(\d{1,2})$/.exec(s)
  if (m) {
    const prefix = Number(m[1])
    return prefix >= 0 && prefix <= 32 ? prefix : null
  }
  return maskToPrefix(s)
}

/** Wildcard mask written by a person, like ACL "0.0.0.63". Returns the matching prefix or null. */
export function wildcardToPrefix(text) {
  const value = parseIp(text)
  if (value === null) return null
  return maskIntToPrefix(~value >>> 0)
}

// ---- Subnet facts -------------------------------------------------------------------

/**
 * Everything about the subnet that holds `address` (an int) with `prefix`.
 * /31 follows RFC 3021 (two usable addresses on a point-to-point link, no broadcast);
 * /32 is a single host route.
 */
export function subnetFacts(address, prefix) {
  const maskInt = prefixToMaskInt(prefix)
  const networkInt = (address & maskInt) >>> 0
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0
  const hostBits = 32 - prefix
  const totalAddresses = 2 ** hostBits
  let usableHosts = Math.max(0, totalAddresses - 2)
  let firstInt = networkInt + 1
  let lastInt = broadcastInt - 1
  let special = null
  if (prefix === 31) {
    usableHosts = 2
    firstInt = networkInt
    lastInt = broadcastInt
    special = 'p2p'
  } else if (prefix === 32) {
    usableHosts = 1
    firstInt = networkInt
    lastInt = networkInt
    special = 'host'
  }
  return {
    address: intToIp(address),
    addressInt: address >>> 0,
    prefix,
    hostBits,
    maskInt,
    mask: intToIp(maskInt),
    wildcard: intToIp(~maskInt >>> 0),
    networkInt,
    broadcastInt,
    network: intToIp(networkInt),
    broadcast: intToIp(broadcastInt),
    firstHostInt: firstInt >>> 0,
    lastHostInt: lastInt >>> 0,
    firstHost: intToIp(firstInt),
    lastHost: intToIp(lastInt),
    totalAddresses,
    usableHosts,
    special
  }
}

/** True when both addresses land in the same subnet under `prefix`. */
export function sameSubnet(a, b, prefix) {
  const mask = prefixToMaskInt(prefix)
  return ((a & mask) >>> 0) === ((b & mask) >>> 0)
}

/** Smallest subnet (longest prefix, up to /30) with at least `hosts` usable addresses. */
export function prefixForHosts(hosts) {
  for (let prefix = 30; prefix >= 1; prefix--) {
    if (2 ** (32 - prefix) - 2 >= hosts) return prefix
  }
  return null
}

/** Fewest borrowed bits that give at least `count` subnets. */
export function bitsForSubnets(count) {
  let bits = 0
  while (2 ** bits < count) bits++
  return bits
}

// ---- Binary ---------------------------------------------------------------------------

export const octetToBinary = (value) => (value & 255).toString(2).padStart(8, '0')

/** ["11000000", "10101000", ...] for an address int. */
export const binaryOctets = (value) => toOctets(value).map(octetToBinary)

/** Dotted binary, like "11000000.10101000.00000001.00001010". */
export const toDottedBinary = (value) => binaryOctets(value).join('.')

// ---- The magic number method ------------------------------------------------------------

const ORDINALS = ['1st', '2nd', '3rd', '4th']
export const octetOrdinal = (index) => ORDINALS[index] || `${index + 1}th`

/** Index (0 to 3) of the octet where the mask stops being 255. /24 gives 3, /19 gives 2. */
export function interestingOctetIndex(prefix) {
  return Math.min(3, Math.floor(prefix / 8))
}

/**
 * The interesting octet ("magic number") method, worked step by step for one address.
 * Returns the numbers the method uses plus friendly sentences describing each step.
 */
export function magicSteps(address, prefix) {
  const f = subnetFacts(address, prefix)
  const index = interestingOctetIndex(prefix)
  const maskOctets = toOctets(f.maskInt)
  const addrOctets = toOctets(address)
  const maskOctet = maskOctets[index]
  const magic = 256 - maskOctet
  const addrOctet = addrOctets[index]
  const networkOctet = Math.floor(addrOctet / magic) * magic
  const nextOctet = networkOctet + magic
  const broadcastOctet = nextOctet - 1
  const boundary = prefix % 8 === 0
  const ord = octetOrdinal(index)
  const steps = []

  if (prefix === 32) {
    steps.push(`/32 keeps all 32 bits for the network, so it names exactly one address: ${f.network}. Routers use /32 for host routes and loopbacks.`)
    return { index, maskOctet, magic: 1, addrOctet, networkOctet: addrOctet, nextOctet: addrOctet + 1, broadcastOctet: addrOctet, boundary: true, multiples: [], steps, facts: f }
  }

  if (boundary) {
    const kept = prefix / 8
    steps.push(`/${prefix} ends exactly on an octet boundary: the mask is ${f.mask}.`)
    steps.push(
      kept === 0
        ? 'No octets belong to the network part, so every octet is host bits.'
        : `Keep the first ${kept === 1 ? 'octet' : `${kept} octets`} of the address as they are. Set the rest to 0 for the network (${f.network}) and to 255 for the broadcast (${f.broadcast}).`
    )
  } else {
    steps.push(`/${prefix} is mask ${f.mask}. The interesting octet is the ${ord}, where the mask is ${maskOctet} (not 255 and not 0).`)
    const shown = []
    for (let m = 0; m < 256 && shown.length < 8; m += magic) shown.push(m)
    const more = 256 / magic > shown.length ? ', ...' : ''
    steps.push(`Magic number: 256 - ${maskOctet} = ${magic}. Subnets start at multiples of ${magic} in that octet: ${shown.join(', ')}${more}`)
    steps.push(`The address has ${addrOctet} in the ${ord} octet. The biggest multiple of ${magic} that is not more than ${addrOctet} is ${networkOctet}, so the network is ${f.network}.${index < 3 ? ' Octets to the right become 0.' : ''}`)
    steps.push(
      nextOctet >= 256
        ? `The next subnet would start at ${nextOctet}, past the end of the octet, so the broadcast uses ${broadcastOctet} there: ${f.broadcast}.${index < 3 ? ' Octets to the right become 255.' : ''}`
        : `The next subnet starts at ${nextOctet}, so the broadcast is one less: ${broadcastOctet} in that octet, giving ${f.broadcast}.${index < 3 ? ' Octets to the right become 255.' : ''}`
    )
  }

  if (prefix === 31) {
    steps.push(`/31 leaves 1 host bit: 2 addresses. On a point-to-point link both are usable (RFC 3021), and there is no broadcast.`)
  } else {
    steps.push(`Hosts sit between the two: ${f.firstHost} to ${f.lastHost}. That is 2^${f.hostBits} - 2 = ${f.usableHosts.toLocaleString('en-US')} usable addresses.`)
  }

  const multiples = []
  if (!boundary) for (let m = 0; m < 256; m += magic) multiples.push(m)
  return { index, maskOctet, magic, addrOctet, networkOctet, nextOctet, broadcastOctet, boundary, multiples, steps, facts: f }
}

/** "255.255.240.0 has 8 + 8 + 4 + 0 = 20 one bits" style explanation of a mask. */
export function explainMaskBits(prefix) {
  const counts = toOctets(prefixToMaskInt(prefix)).map(popcount)
  return `${prefixToMask(prefix)} has ${counts.join(' + ')} = ${prefix} one bits, so it is /${prefix}.`
}

// ---- Address classes ------------------------------------------------------------------

export function addressClass(value) {
  const first = toOctets(value)[0]
  if (first < 128) return 'A'
  if (first < 192) return 'B'
  if (first < 224) return 'C'
  if (first < 240) return 'D'
  return 'E'
}

/** RFC 1918 private ranges. */
export function isPrivate(value) {
  const [a, b] = toOctets(value)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

// ---- MAC addresses ----------------------------------------------------------------------

/** Normalize "00:1A:2b:3c:4d:5e", "001a-2b3c-4d5e" or "001a.2b3c.4d5e" to Cisco "001a.2b3c.4d5e". */
export function normalizeMac(text) {
  if (typeof text !== 'string') return null
  const hex = text.trim().toLowerCase().replace(/[.:-]/g, '')
  if (!/^[0-9a-f]{12}$/.test(hex)) return null
  return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`
}

/** Compare two MACs numerically (any accepted format). Negative when a is lower. */
export function compareMac(a, b) {
  const x = (normalizeMac(a) || '').replace(/\./g, '')
  const y = (normalizeMac(b) || '').replace(/\./g, '')
  return x < y ? -1 : x > y ? 1 : 0
}

export const BROADCAST_MAC = 'ffff.ffff.ffff'

/** True for group (multicast or broadcast) MACs: the lowest bit of the first octet is 1. */
export function isGroupMac(mac) {
  const n = normalizeMac(mac)
  return n ? (parseInt(n.slice(0, 2), 16) & 1) === 1 : false
}
