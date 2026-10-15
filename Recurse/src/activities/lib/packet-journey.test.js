import { describe, expect, it } from 'vitest'
import { BROADCAST_MAC } from './net'
import { DEVICES, LINKS, ROUTES, START_TTL, buildJourney, checkpointCount, headerRows, localCheck } from './packet-journey'

const steps = buildJourney()
const byId = Object.fromEntries(steps.map((s) => [s.id, s]))
const { A, B, R1 } = DEVICES
const G0 = R1.ifaces['G0/0']
const G1 = R1.ifaces['G0/1']

describe('localCheck', () => {
  it('ANDs both addresses with the mask', () => {
    expect(localCheck()).toEqual({ src: A.ip, dst: B.ip, mask: '255.255.255.0', srcNet: '192.168.1.0', dstNet: '192.168.2.0', local: false })
    expect(localCheck('192.168.1.10', '192.168.1.30').local).toBe(true)
    expect(localCheck('192.168.1.10', '192.168.2.20', 16).local).toBe(true)
  })
})

describe('the journey', () => {
  it('has three checkpoints with valid answers and no em dashes', () => {
    expect(checkpointCount(steps)).toBe(3)
    for (const s of steps) {
      expect(s.caption).not.toMatch(/\u2014/)
      if (!s.checkpoint) continue
      expect(s.checkpoint.choices[s.checkpoint.answer]).toBeTruthy()
      expect(new Set(s.checkpoint.choices).size).toBe(s.checkpoint.choices.length)
      expect(s.checkpoint.prompt + s.checkpoint.explain + s.checkpoint.hint).not.toMatch(/\u2014/)
    }
  })

  it('ARPs for the gateway with a broadcast and gets a unicast reply', () => {
    expect(byId['arp-request'].pdu.eth.dst).toBe(BROADCAST_MAC)
    expect(byId['arp-request'].pdu.arp.targetIp).toBe(G0.ip)
    expect(byId['arp-request'].hops[1].map(([, to]) => to).sort()).toEqual(['C', 'R1'])
    expect(byId['arp-reply'].pdu.eth).toMatchObject({ dst: A.mac, src: G0.mac })
    expect(byId['arp-reply'].hops).toEqual([[['R1', 'SW1']], [['SW1', 'A']]])
  })

  it('addresses the first frame to the gateway MAC but B\'s IP', () => {
    const f = byId.frame.pdu
    expect(f.eth).toMatchObject({ dst: G0.mac, src: A.mac })
    expect(f.ip).toMatchObject({ src: A.ip, dst: B.ip, ttl: START_TTL })
    expect(byId.frame.checkpoint.choices[byId.frame.checkpoint.answer]).toContain(G0.mac)
  })

  it('strips layer 2 at the router, lowers the TTL by one and routes out G0/1', () => {
    expect(byId.decap.pdu.eth).toBeUndefined()
    expect(byId.route.pdu.ip.ttl).toBe(START_TTL - 1)
    expect(byId.route.changed).toEqual(['ip.ttl'])
    expect(ROUTES[byId.route.route].prefix).toBe('192.168.2.0/24')
  })

  it('re-encapsulates with new MACs and the same IPs', () => {
    const before = byId.frame.pdu
    const after = byId.reencap.pdu
    expect(after.eth).toMatchObject({ dst: B.mac, src: G1.mac })
    expect(after.eth.dst).not.toBe(before.eth.dst)
    expect(after.eth.src).not.toBe(before.eth.src)
    expect(after.ip.src).toBe(before.ip.src)
    expect(after.ip.dst).toBe(before.ip.dst)
    expect(after.ip.ttl).toBe(before.ip.ttl - 1)
  })

  it('only uses links that exist', () => {
    const exists = (a, b) => LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
    for (const s of steps) for (const phase of s.hops) for (const [a, b] of phase) expect(exists(a, b), `${s.id} ${a}-${b}`).toBe(true)
  })

  it('fills the tables in the right order', () => {
    expect(byId.start.tables).toEqual({ A: [], SW1: [], R1: [], SW2: [], B: [] })
    expect(byId['arp-request'].tables.SW1).toEqual([[A.mac, 'Fa0/1']])
    expect(byId['arp-request'].fresh['SW1:' + A.mac]).toBe(true)
    expect(byId['arp-reply'].tables.A).toEqual([[G0.ip, G0.mac]])
    const last = steps.at(-1).tables
    expect(last.SW1).toEqual([[A.mac, 'Fa0/1'], [G0.mac, 'Gi0/1']])
    expect(last.SW2).toEqual([[G1.mac, 'Gi0/1'], [B.mac, 'Fa0/1']])
    expect(last.R1).toEqual([[A.ip, A.mac], [B.ip, B.mac]])
    expect(last.B).toEqual([[G1.ip, G1.mac]])
  })

  it('ends with the reply arriving with TTL one lower than it started', () => {
    const reply = steps.at(-1)
    expect(reply.pdu.icmp.type).toBe(0)
    expect(reply.pdu.ip).toMatchObject({ src: B.ip, dst: A.ip })
    expect(reply.caption).toContain(`TTL=${START_TTL - 1}`)
    expect(reply.hops.flat().map(([a]) => a)).toEqual(['B', 'SW2', 'R1', 'SW1'])
  })
})

describe('headerRows', () => {
  it('flags changed fields, including whole headers', () => {
    const rows = headerRows(byId.reencap.pdu, byId.reencap.changed)
    expect(rows.eth.filter((r) => r.changed).map((r) => r.key)).toEqual(['eth.dst', 'eth.src'])
    expect(rows.ip.some((r) => r.changed)).toBe(false)
    const arpRows = headerRows(byId['arp-request'].pdu, byId['arp-request'].changed)
    expect(arpRows.arp.every((r) => r.changed)).toBe(true)
    expect(arpRows.ip).toBeUndefined()
  })
})
