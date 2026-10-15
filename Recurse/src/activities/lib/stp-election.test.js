import { describe, expect, it } from 'vitest'
import {
  LONG_COST,
  PRIORITIES,
  SHORT_COST,
  compareBid,
  electStp,
  gradePrediction,
  isValidPriority,
  linkCost,
  listPorts,
  portId,
  portNumber,
  presetTopology,
  showSpanningTree
} from './stp-election'

const withPriority = (topo, id, priority) => ({ ...topo, switches: topo.switches.map((s) => (s.id === id ? { ...s, priority } : s)) })
const withSpeed = (topo, linkId, speed) => ({ ...topo, links: topo.links.map((l) => (l.id === linkId ? { ...l, speed } : l)) })

describe('basics', () => {
  it('knows the short and long costs', () => {
    expect(SHORT_COST).toEqual({ '10M': 100, '100M': 19, '1G': 4, '10G': 2 })
    expect(LONG_COST['1G']).toBe(20000)
    expect(linkCost({ speed: '10G' })).toBe(2)
    expect(linkCost({ speed: '1G', cost: 7 })).toBe(7)
  })

  it('only allows priorities in steps of 4096', () => {
    expect(PRIORITIES).toHaveLength(16)
    expect(PRIORITIES.at(-1)).toBe(61440)
    expect(isValidPriority(32768)).toBe(true)
    expect(isValidPriority(32769)).toBe(false)
    expect(isValidPriority(65536)).toBe(false)
  })

  it('compares bridge IDs by priority, then MAC', () => {
    expect(compareBid({ priority: 4096, mac: 'ffff.ffff.ffff' }, { priority: 8192, mac: '0000.0000.0001' })).toBeLessThan(0)
    expect(compareBid({ priority: 32768, mac: '00a0.0000.0000' }, { priority: 32768, mac: '0011.0000.0000' })).toBeGreaterThan(0)
  })

  it('reads port numbers and IDs', () => {
    expect(portNumber('Gi0/2')).toBe(2)
    expect(portNumber('Fa0/24')).toBe(24)
    expect(portId({ port: 'Gi0/3' })).toEqual({ priority: 128, number: 3 })
    expect(portId({ port: 'Gi0/3', portPriority: 64 })).toEqual({ priority: 64, number: 3 })
  })

  it('lists both ends of every link', () => {
    expect(listPorts(presetTopology('square'))).toHaveLength(8)
  })
})

describe('square ring with default priorities', () => {
  const topo = presetTopology('square')
  const r = electStp(topo)

  it('elects the lowest MAC when priorities tie', () => {
    expect(r.root).toBe('SW3')
    expect(r.rootReason.kind).toBe('mac')
  })

  it('computes root path costs', () => {
    expect(r.rootCost).toEqual({ SW1: 4, SW2: 8, SW3: 0, SW4: 4 })
  })

  it('breaks an equal-cost tie with the lowest neighbor bridge ID', () => {
    expect(r.rootPort.SW2).toBe('SW2:Gi0/2')
    expect(r.rootPortInfo.SW2.kind).toBe('sender-bid')
    expect(r.rootPortInfo.SW2.text).toContain('SW4')
    expect(r.rootPort.SW1).toBe('SW1:Gi0/2')
    expect(r.rootPortInfo.SW1.kind).toBe('cost')
  })

  it('makes every root bridge port designated and blocks exactly one port', () => {
    expect(r.roles['SW3:Gi0/1']).toBe('designated')
    expect(r.roles['SW3:Gi0/2']).toBe('designated')
    expect(r.links.L3.kind).toBe('root')
    expect(r.roles['SW1:Gi0/1']).toBe('designated')
    expect(r.blocked).toEqual(['SW2:Gi0/1'])
  })

  it('ripples BPDUs out from the root', () => {
    expect(r.waves[0]).toHaveLength(8)
    expect(r.waves[1].map((w) => w.from)).toEqual(['SW3', 'SW3'])
    expect(r.waves[2].map((w) => `${w.from}>${w.to}`).sort()).toEqual(['SW1>SW2', 'SW4>SW2'])
    expect(r.waves).toHaveLength(3)
  })

  it('explains everything without em dashes', () => {
    expect(r.explanations.length).toBeGreaterThanOrEqual(1 + 3 + 4 + 1)
    for (const line of r.explanations) expect(line).not.toMatch(/\u2014/)
  })
})

describe('changing priorities and costs', () => {
  it('a lower priority beats any MAC', () => {
    const r = electStp(withPriority(presetTopology('square'), 'SW1', 4096))
    expect(r.root).toBe('SW1')
    expect(r.rootReason.kind).toBe('priority')
    expect(r.rootCost).toEqual({ SW1: 0, SW2: 4, SW3: 4, SW4: 8 })
    expect(r.rootPort.SW4).toBe('SW4:Gi0/2')
    expect(r.rootPortInfo.SW4.kind).toBe('sender-bid')
    expect(r.blocked).toEqual(['SW4:Gi0/1'])
  })

  it('a slower link moves the root port and the blocked port', () => {
    const r = electStp(withSpeed(presetTopology('square'), 'L3', '100M'))
    expect(r.root).toBe('SW3')
    expect(r.rootCost.SW4).toBe(12)
    expect(r.rootPort.SW4).toBe('SW4:Gi0/1')
    expect(r.rootPort.SW2).toBe('SW2:Gi0/1')
    expect(r.blocked).toEqual(['SW4:Gi0/2'])
  })

  it('a 10G link lowers costs', () => {
    const r = electStp(withSpeed(withSpeed(presetTopology('square'), 'L4', '10G'), 'L1', '10G'))
    expect(r.rootCost.SW1).toBe(2)
    expect(r.rootCost.SW2).toBe(4)
    expect(r.rootPort.SW2).toBe('SW2:Gi0/1')
  })
})

describe('triangle', () => {
  it('blocks the slow direct link when the long way round is cheaper', () => {
    const r = electStp(presetTopology('triangle'))
    expect(r.root).toBe('SW1')
    expect(r.rootCost.SW3).toBe(8)
    expect(r.rootPort.SW3).toBe('SW3:Gi0/2')
    expect(r.blocked).toEqual(['SW3:Gi0/1'])
  })

  it('gives the designated port to the lower bridge ID when root costs tie', () => {
    const r = electStp(withSpeed(presetTopology('triangle'), 'L3', '1G'))
    expect(r.rootCost.SW2).toBe(4)
    expect(r.rootCost.SW3).toBe(4)
    expect(r.links.L2.kind).toBe('bid')
    expect(r.roles['SW2:Gi0/2']).toBe('designated')
    expect(r.blocked).toEqual(['SW3:Gi0/2'])
  })
})

describe('parallel links', () => {
  it('uses the lowest sender port ID when the same neighbor is reachable twice', () => {
    const r = electStp(presetTopology('parallel'))
    expect(r.root).toBe('SW1')
    expect(r.rootPort.SW2).toBe('SW2:Gi0/1')
    expect(r.rootPortInfo.SW2.kind).toBe('sender-port')
    expect(r.blocked.sort()).toEqual(['SW2:Gi0/2', 'SW3:Gi0/2'])
  })

  it('a lower port priority on the sender flips the choice', () => {
    const topo = presetTopology('parallel')
    topo.links[1].a.portPriority = 64
    const r = electStp(topo)
    expect(r.rootPort.SW2).toBe('SW2:Gi0/2')
    expect(r.blocked).toContain('SW2:Gi0/1')
  })
})

describe('gradePrediction', () => {
  const r = electStp(presetTopology('square'))

  it('accepts a perfect prediction', () => {
    const g = gradePrediction(r, { root: 'SW3', rootPorts: { SW1: 'SW1:Gi0/2', SW2: 'SW2:Gi0/2', SW4: 'SW4:Gi0/2' }, blocked: ['SW2:Gi0/1'] })
    expect(g.allCorrect).toBe(true)
    expect(g.score).toBe(1)
  })

  it('marks each wrong part', () => {
    const g = gradePrediction(r, { root: 'SW3', rootPorts: { SW1: 'SW1:Gi0/2', SW2: 'SW2:Gi0/1', SW4: 'SW4:Gi0/2' }, blocked: ['SW2:Gi0/2'] })
    expect(g.root).toBe(true)
    expect(g.rootPorts).toEqual({ SW1: true, SW2: false, SW4: true })
    expect(g.blocked).toBe(false)
    expect(g.allCorrect).toBe(false)
  })

  it('a wrong root means the true root ports were not predicted', () => {
    const g = gradePrediction(r, { root: 'SW1', rootPorts: {}, blocked: [] })
    expect(g.root).toBe(false)
    expect(Object.values(g.rootPorts).every((x) => x === false)).toBe(true)
  })
})

describe('showSpanningTree', () => {
  const topo = presetTopology('square')
  const r = electStp(topo)

  it('prints a non-root switch like IOS does', () => {
    const out = showSpanningTree(topo, r, 'SW2').join('\n')
    expect(out).toContain('VLAN0001')
    expect(out).toContain('Root ID    Priority    32769')
    expect(out).toContain('Address     0011.5c33.3333')
    expect(out).toContain('Cost        8')
    expect(out).toContain('Port        2 (GigabitEthernet0/2)')
    expect(out).toContain('(priority 32768 sys-id-ext 1)')
    expect(out).toMatch(/Gi0\/1\s+Altn BLK 4\s+128\.1/)
    expect(out).toMatch(/Gi0\/2\s+Root FWD 4\s+128\.2/)
  })

  it('says so on the root', () => {
    const out = showSpanningTree(topo, r, 'SW3').join('\n')
    expect(out).toContain('This bridge is the root')
    expect(out).toMatch(/Gi0\/1\s+Desg FWD/)
  })
})
