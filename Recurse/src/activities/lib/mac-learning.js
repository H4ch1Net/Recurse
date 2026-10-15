// A Layer 2 switch learning MAC addresses. Four hosts: A on Fa0/1, B on Fa0/2,
// and C and D sharing Fa0/3 through a hub, which is what makes filtering visible
// (a frame whose destination sits on the port it came in on is dropped).
import { BROADCAST_MAC } from './net'

export const HOSTS = [
  { id: 'A', name: 'PC A', mac: '00aa.aaaa.aaaa', port: 'Fa0/1', hub: false },
  { id: 'B', name: 'PC B', mac: '00bb.bbbb.bbbb', port: 'Fa0/2', hub: false },
  { id: 'C', name: 'PC C', mac: '00cc.cccc.cccc', port: 'Fa0/3', hub: true },
  { id: 'D', name: 'PC D', mac: '00dd.dddd.dddd', port: 'Fa0/3', hub: true }
]
export const PORTS = ['Fa0/1', 'Fa0/2', 'Fa0/3']
export const BROADCAST = 'broadcast'
export const DEFAULT_AGING = 300
export const AGING_CHOICES = [300, 60, 30]
export const ACTIONS = ['flood', 'forward', 'filter']

const HOST_MAP = Object.fromEntries(HOSTS.map((h) => [h.id, h]))
export const hostById = (id) => HOST_MAP[id] || null
export const hostByMac = (mac) => HOSTS.find((h) => h.mac === mac) || null
export const macOf = (id) => (id === BROADCAST ? BROADCAST_MAC : HOST_MAP[id]?.mac)
const nameOf = (id) => (id === BROADCAST ? 'everyone' : HOST_MAP[id]?.name)

/** A switch with an empty MAC address table. */
export function createSwitch(agingTime = DEFAULT_AGING) {
  return { table: [], agingTime }
}

export function lookup(sw, mac) {
  return sw.table.find((e) => e.mac === mac) || null
}

/** What the switch does with a frame from srcId to dstId (a host id or BROADCAST). */
export function decide(sw, srcId, dstId) {
  const src = hostById(srcId)
  const inPort = src.port
  const others = PORTS.filter((p) => p !== inPort)
  if (dstId === BROADCAST) return { action: 'flood', reason: 'broadcast', inPort, outPorts: others }
  const dst = hostById(dstId)
  const entry = lookup(sw, dst.mac)
  if (!entry) return { action: 'flood', reason: 'unknown', inPort, outPorts: others }
  if (entry.port === inPort) return { action: 'filter', reason: 'same-port', inPort, outPorts: [] }
  return { action: 'forward', reason: 'known', inPort, outPorts: [entry.port] }
}

/** Learn the source address: add it, refresh its age, or move it to a new port. */
export function learn(sw, srcId) {
  const src = hostById(srcId)
  const existing = lookup(sw, src.mac)
  if (!existing) {
    return { sw: { ...sw, table: [...sw.table, { mac: src.mac, port: src.port, host: src.id, age: 0 }] }, kind: 'new' }
  }
  const kind = existing.port === src.port ? 'refresh' : 'moved'
  return {
    sw: { ...sw, table: sw.table.map((e) => (e.mac === src.mac ? { ...e, port: src.port, age: 0 } : e)) },
    kind,
    previousPort: existing.port
  }
}

/** Which hosts physically receive the frame, and whether each one keeps it. */
export function receivers(srcId, dstId, decision) {
  const src = hostById(srcId)
  const out = []
  const accepts = (h) => dstId === BROADCAST || h.id === dstId
  for (const h of HOSTS) {
    if (h.id === src.id) continue
    let via = null
    if (src.hub && h.hub) via = 'hub'
    else if (decision.outPorts.includes(h.port)) via = 'switch'
    if (via) out.push({ id: h.id, via, accepted: accepts(h) })
  }
  return out
}

/**
 * Send one frame. Returns the new switch state plus everything the widget needs to
 * animate and explain it: decision, learning result, receivers and sentences.
 */
export function sendFrame(sw, srcId, dstId) {
  if (srcId === dstId) throw new Error('Source and destination must differ')
  const decision = decide(sw, srcId, dstId)
  const learned = learn(sw, srcId)
  const src = hostById(srcId)
  const dstMac = macOf(dstId)
  const lines = []
  if (learned.kind === 'new') lines.push(`Learn: the source MAC ${src.mac} arrived on ${src.port}, so the switch adds it to the table.`)
  else if (learned.kind === 'moved') lines.push(`Learn: ${src.mac} used to be on ${learned.previousPort} but just arrived on ${src.port}, so the entry moves.`)
  else lines.push(`Learn: ${src.mac} is already known on ${src.port}, so the switch just resets its age to 0.`)

  if (decision.reason === 'broadcast') {
    lines.push(`Flood: the destination is the broadcast address ${BROADCAST_MAC}, so it goes out every port except ${decision.inPort}. Switches always flood broadcasts.`)
  } else if (decision.reason === 'unknown') {
    lines.push(`Flood: ${dstMac} is not in the table (an unknown unicast), so the switch sends it out every port except ${decision.inPort} and lets the right host pick it up.`)
  } else if (decision.reason === 'known') {
    lines.push(`Forward: ${dstMac} is in the table on ${decision.outPorts[0]}, so the frame goes out that one port only.`)
  } else {
    lines.push(`Filter: ${dstMac} is on ${decision.inPort}, the same port the frame came in on. The hub already delivered it, so the switch drops its copy.`)
  }
  const got = receivers(srcId, dstId, decision)
  const ignored = got.filter((r) => !r.accepted).map((r) => nameOf(r.id))
  if (ignored.length && dstId !== BROADCAST) lines.push(`${ignored.join(' and ')} ${ignored.length > 1 ? 'see' : 'sees'} a destination MAC that is not ${ignored.length > 1 ? 'theirs' : 'its own'} and ${ignored.length > 1 ? 'ignore' : 'ignores'} the frame.`)
  return { sw: learned.sw, decision, learned: learned.kind, receivers: got, lines }
}

/** Let time pass. Entries reaching the aging time are removed. */
export function advanceTime(sw, seconds) {
  const aged = sw.table.map((e) => ({ ...e, age: e.age + seconds }))
  const expired = aged.filter((e) => e.age >= sw.agingTime)
  return { sw: { ...sw, table: aged.filter((e) => e.age < sw.agingTime) }, expired }
}

export function setAging(sw, agingTime) {
  const next = { ...sw, agingTime }
  return advanceTime(next, 0)
}

/** True once every host's MAC is in the table. */
export function tableComplete(sw) {
  return HOSTS.every((h) => lookup(sw, h.mac))
}

/**
 * The hops a frame takes, phase by phase, as [from, to] node ids ('SW', 'HUB' or a
 * host id). Parallel copies share a phase. The switch hop is marked with `atSwitch`.
 */
export function framePhases(srcId, decision) {
  const src = hostById(srcId)
  const phases = []
  if (src.hub) {
    phases.push([[src.id, 'HUB']])
    const repeat = HOSTS.filter((h) => h.hub && h.id !== src.id).map((h) => ['HUB', h.id])
    phases.push([...repeat, ['HUB', 'SW']])
  } else {
    phases.push([[src.id, 'SW']])
  }
  const atSwitch = phases.length - 1
  const fromSwitch = decision.outPorts.map((port) => {
    const h = HOSTS.find((x) => x.port === port)
    return ['SW', h.hub ? 'HUB' : h.id]
  })
  if (fromSwitch.length) phases.push(fromSwitch)
  if (decision.outPorts.includes('Fa0/3')) phases.push(HOSTS.filter((h) => h.hub).map((h) => ['HUB', h.id]))
  return { phases, atSwitch }
}
