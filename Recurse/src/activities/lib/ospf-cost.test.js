import { describe, expect, it } from 'vitest'
import { BOTTOM_PATH, TOP_PATH, autoCost, bestPaths, commands, defaultConfig, edges, interfaces, pathCost, routeChoice, spf } from './ospf-cost'

const cfg = (ref = 100, ifaces = {}) => ({ ...defaultConfig(), ref, ifaces })

describe('cost formula', () => {
  it('matches the book table with the default 100 Mbps reference', () => {
    expect(autoCost(100, 1544)).toBe(64)
    expect(autoCost(100, 10000)).toBe(10)
    expect(autoCost(100, 100000)).toBe(1)
    expect(autoCost(100, 1000000)).toBe(1)
    expect(autoCost(100, 10000000)).toBe(1)
  })
  it('separates fast links once the reference is raised', () => {
    expect(autoCost(10000, 100000)).toBe(100)
    expect(autoCost(10000, 1000000)).toBe(10)
    expect(autoCost(10000, 10000000)).toBe(1)
    expect(autoCost(100000, 10000000)).toBe(10)
  })
  it('never goes below 1 or above 65535', () => {
    expect(autoCost(100, 100000000)).toBe(1)
    expect(autoCost(4294967, 1)).toBe(65535)
  })
})

describe('interfaces', () => {
  it('uses manual costs over the formula', () => {
    const ifs = interfaces(cfg(100, { 'R1 Fa0/0': { cost: 50 } }))
    expect(ifs['R1 Fa0/0']).toMatchObject({ cost: 50, source: 'manual', auto: 1, name: 'FastEthernet0/0' })
    expect(ifs['R2 Fa0/0']).toMatchObject({ cost: 1, source: 'auto' })
  })
  it('uses the bandwidth command in the formula', () => {
    const ifs = interfaces(cfg(100, { 'R1 Fa0/0': { bandwidth: 10000 } }))
    expect(ifs['R1 Fa0/0'].cost).toBe(10)
    expect(ifs['R5 Te0/3'].name).toBe('TenGigabitEthernet0/3')
  })
  it('explains the formula', () => {
    const ifs = interfaces(cfg(100))
    expect(ifs['R1 Gi0/1'].formula).toBe('100,000 / 1,000,000 = 0.1, raised to 1')
    expect(interfaces(cfg(10000))['R1 Fa0/0'].formula).toBe('10,000,000 / 100,000 = 100')
  })
  it('makes one directed edge per interface', () => {
    expect(edges(cfg())).toHaveLength(10)
  })
})

describe('shortest path first', () => {
  it('with the default reference, the slow two-hop path wins', () => {
    const r = spf(cfg())
    expect(r.dist).toEqual({ R1: 0, R2: 1, R3: 1, R4: 2, R5: 2 })
    expect(bestPaths(r, 'R4')).toEqual([TOP_PATH])
    expect(routeChoice(cfg())).toBe('top')
  })
  it('raising the reference bandwidth moves traffic to the fast path', () => {
    expect(spf(cfg(1000)).dist.R4).toBe(3)
    expect(routeChoice(cfg(1000))).toBe('bottom')
    expect(pathCost(cfg(10000), TOP_PATH).total).toBe(200)
    expect(pathCost(cfg(10000), BOTTOM_PATH).total).toBe(21)
    expect(routeChoice(cfg(10000))).toBe('bottom')
  })
  it('a manual cost on R1 can move the path, or tie it', () => {
    expect(routeChoice(cfg(100, { 'R1 Fa0/0': { cost: 3 } }))).toBe('bottom')
    const tie = cfg(100, { 'R1 Fa0/0': { cost: 2 } })
    expect(routeChoice(tie)).toBe('both')
    expect(bestPaths(spf(tie), 'R4')).toHaveLength(2)
  })
  it('only outgoing interfaces count: raising R2’s cost toward R1 changes nothing for R1 to R4', () => {
    expect(routeChoice(cfg(100, { 'R2 Fa0/0': { cost: 500 } }))).toBe('top')
    // The reverse path does change: R2 sends toward R1 out Fa0/0, so R4 now returns the bottom way.
    const back = spf(cfg(100, { 'R2 Fa0/0': { cost: 500 } }), 'R4')
    expect(back.dist.R1).toBe(3)
    expect(bestPaths(back, 'R1')).toEqual([['R4', 'R5', 'R3', 'R1']])
  })
  it('the bandwidth command also moves the path', () => {
    expect(routeChoice(cfg(100, { 'R2 Fa0/1': { bandwidth: 10000 } }))).toBe('bottom')
  })
  it('breaks a path into hops', () => {
    const p = pathCost(cfg(1000), BOTTOM_PATH)
    expect(p.hops.map((h) => `${h.iface}=${h.cost}`)).toEqual(['R1 Gi0/1=1', 'R3 Gi0/2=1', 'R5 Te0/3=1'])
  })
  it('records a trace in visit order', () => {
    const r = spf(cfg(1000))
    expect(r.order[0]).toBe('R1')
    expect(r.trace[0].updates.map((u) => `${u.to}:${u.result}`).sort()).toEqual(['R2:better', 'R3:better'])
    expect(r.order).toHaveLength(5)
    const visitR4 = r.trace.findIndex((t) => t.visit === 'R4')
    expect(r.trace[visitR4].cost).toBe(3)
  })
  it('keeps both predecessors on a tie', () => {
    const r = spf(cfg(100, { 'R1 Fa0/0': { cost: 2 } }))
    expect(r.preds.R4.map((e) => e.from).sort()).toEqual(['R2', 'R5'])
  })
})

describe('commands', () => {
  it('prints nothing for the defaults', () => {
    expect(commands(cfg())).toEqual([])
  })
  it('prints auto-cost with the IOS warning', () => {
    const c = commands(cfg(10000))
    expect(c[0].lines.map((l) => l.cmd || l.output)).toEqual([
      'router ospf 1',
      'auto-cost reference-bandwidth 10000',
      '% OSPF: Reference bandwidth is changed.',
      '        Please ensure reference bandwidth is consistent across all routers.'
    ])
  })
  it('prints interface costs and bandwidths under the right router', () => {
    const c = commands(cfg(100, { 'R1 Fa0/0': { cost: 30 }, 'R2 Fa0/1': { bandwidth: 10000 } }))
    expect(c.map((x) => x.router)).toEqual(['R1', 'R2'])
    expect(c[0].lines.map((l) => l.cmd)).toEqual(['interface FastEthernet0/0', 'ip ospf cost 30'])
    expect(c[1].lines.map((l) => l.cmd)).toEqual(['interface FastEthernet0/1', 'bandwidth 10000'])
  })
})
