import { describe, expect, it } from 'vitest'
import { ADDR, CHECKPOINTS, buildSteps, changedFields, formatDuration, leaseTimers, relayConfig } from './dhcp-dora'

describe('DORA through a relay', () => {
  const steps = buildSteps({ relay: true })

  it('has eight hops in Discover, Offer, Request, Ack order', () => {
    expect(steps).toHaveLength(8)
    expect(steps.map((s) => s.letter).join('')).toBe('DDOORRAA')
  })
  it('client messages on the LAN are broadcasts from 0.0.0.0', () => {
    for (const s of steps.filter((x) => x.path[0] === 'client')) {
      expect(s.cast).toBe('broadcast')
      expect(s.l3).toEqual({ src: '0.0.0.0', dst: '255.255.255.255' })
      expect(s.l2.dst).toBe('FFFF.FFFF.FFFF')
      expect(s.udp).toEqual({ src: 68, dst: 67 })
      expect(s.flood).toContain('pc2')
    }
  })
  it('the relay sends unicasts from its client-facing address with giaddr set', () => {
    for (const s of steps.filter((x) => x.path[0] === 'r1' && x.path[1] === 'server')) {
      expect(s.cast).toBe('unicast')
      expect(s.l3).toEqual({ src: ADDR.r1Lan, dst: ADDR.server })
      expect(s.giaddr).toBe(ADDR.r1Lan)
      expect(s.l2.dst).toBe(ADDR.serverMac)
    }
  })
  it('the server replies to the relay by reversing the addresses', () => {
    for (const s of steps.filter((x) => x.path[0] === 'server')) {
      expect(s.l3).toEqual({ src: ADDR.server, dst: ADDR.r1Lan })
      expect(s.cast).toBe('unicast')
    }
  })
  it('the relay delivers Offer and Ack to the client as LAN broadcasts', () => {
    for (const id of ['relay-offer', 'relay-ack']) {
      const s = steps.find((x) => x.id === id)
      expect(s.l3.dst).toBe('255.255.255.255')
      expect(s.l2).toEqual({ src: ADDR.r1LanMac, dst: 'FFFF.FFFF.FFFF' })
      expect(s.udp.dst).toBe(68)
      expect(s.yiaddr).toBe(ADDR.offered)
    }
  })
  it('the Request asks for the offered address', () => {
    expect(steps.find((s) => s.id === 'request').requested).toBe('192.168.10.101')
  })
  it('only Offer and Ack carry the offered address in yiaddr', () => {
    for (const s of steps) expect(s.yiaddr !== '0.0.0.0').toBe(s.msg === 'Offer' || s.msg === 'Ack')
  })
  it('asks every checkpoint once, and each has exactly one right answer', () => {
    const ids = steps.map((s) => s.checkpoint).filter(Boolean)
    expect(ids).toEqual(['relay', 'giaddr', 'request', 'renew'])
    for (const id of ids) expect(CHECKPOINTS[id].options.filter((o) => o.correct)).toHaveLength(1)
  })
})

describe('without a relay', () => {
  it('the Discover dies at R1', () => {
    const steps = buildSteps({ relay: false })
    expect(steps).toHaveLength(2)
    expect(steps[1].dropped).toBe(true)
    expect(steps[1].caption).toMatch(/do not forward broadcasts/)
    expect(steps[0].checkpoint).toBeNull()
  })
  it('the configuration has no helper address', () => {
    expect(relayConfig(false).join('\n')).not.toMatch(/helper/)
    expect(relayConfig(true)).toContain(' ip helper-address 10.0.0.10')
  })
})

describe('changed fields', () => {
  it('highlights what the relay rewrote', () => {
    const [d, rd] = buildSteps()
    expect([...changedFields(d, rd)].sort()).toEqual(['giaddr', 'l2dst', 'l2src', 'l3dst', 'l3src', 'udp'])
    expect(changedFields(null, d).size).toBe(0)
  })
})

describe('lease timers', () => {
  it('renews at 50% and rebinds at 87.5%', () => {
    expect(leaseTimers(86400)).toEqual({ lease: 86400, t1: 43200, t2: 75600 })
    expect(formatDuration(43200)).toBe('12 hours')
    expect(formatDuration(75600)).toBe('21 hours')
    expect(formatDuration(86400)).toBe('1 day')
    expect(formatDuration(5400)).toBe('90 minutes')
    expect(formatDuration(1)).toBe('1 second')
  })
})

describe('text', () => {
  it('has no em dashes', () => {
    const text = [...buildSteps().map((s) => s.caption), ...buildSteps({ relay: false }).map((s) => s.caption), ...Object.values(CHECKPOINTS).flatMap((c) => [c.question, ...c.options.map((o) => o.text + o.why)])].join(' ')
    expect(text).not.toMatch(/\u2014/)
  })
})
