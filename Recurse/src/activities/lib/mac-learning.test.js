import { describe, expect, it } from 'vitest'
import { BROADCAST, advanceTime, createSwitch, decide, framePhases, hostById, learn, lookup, receivers, sendFrame, setAging, tableComplete } from './mac-learning'

const send = (sw, src, dst) => sendFrame(sw, src, dst)

describe('learning', () => {
  it('learns the source MAC on the ingress port', () => {
    const r = send(createSwitch(), 'A', 'B')
    expect(r.learned).toBe('new')
    expect(lookup(r.sw, hostById('A').mac)).toMatchObject({ port: 'Fa0/1', age: 0 })
    expect(r.sw.table).toHaveLength(1)
  })

  it('refreshes the age of a known source', () => {
    let sw = send(createSwitch(), 'A', 'B').sw
    sw = advanceTime(sw, 100).sw
    expect(lookup(sw, hostById('A').mac).age).toBe(100)
    const r = send(sw, 'A', 'B')
    expect(r.learned).toBe('refresh')
    expect(lookup(r.sw, hostById('A').mac).age).toBe(0)
  })

  it('moves an entry when a MAC shows up on another port', () => {
    const sw = { agingTime: 300, table: [{ mac: hostById('A').mac, port: 'Fa0/2', host: 'A', age: 5 }] }
    const r = learn(sw, 'A')
    expect(r.kind).toBe('moved')
    expect(r.previousPort).toBe('Fa0/2')
    expect(lookup(r.sw, hostById('A').mac).port).toBe('Fa0/1')
  })

  it('learns hosts behind the hub on the shared port', () => {
    let sw = createSwitch()
    sw = send(sw, 'C', 'A').sw
    sw = send(sw, 'D', 'A').sw
    expect(lookup(sw, hostById('C').mac).port).toBe('Fa0/3')
    expect(lookup(sw, hostById('D').mac).port).toBe('Fa0/3')
  })
})

describe('forwarding decisions', () => {
  it('floods unknown unicasts out every port except the ingress', () => {
    const d = decide(createSwitch(), 'A', 'B')
    expect(d).toMatchObject({ action: 'flood', reason: 'unknown', outPorts: ['Fa0/2', 'Fa0/3'] })
  })

  it('always floods broadcasts, even with a full table', () => {
    let sw = createSwitch()
    for (const id of ['A', 'B', 'C', 'D']) sw = send(sw, id, BROADCAST).sw
    expect(tableComplete(sw)).toBe(true)
    expect(decide(sw, 'B', BROADCAST)).toMatchObject({ action: 'flood', reason: 'broadcast', outPorts: ['Fa0/1', 'Fa0/3'] })
  })

  it('forwards known unicasts out one port', () => {
    const sw = send(createSwitch(), 'B', 'A').sw
    expect(decide(sw, 'A', 'B')).toMatchObject({ action: 'forward', outPorts: ['Fa0/2'] })
  })

  it('filters when the destination is on the ingress port', () => {
    const sw = send(createSwitch(), 'D', 'A').sw
    const r = send(sw, 'C', 'D')
    expect(r.decision).toMatchObject({ action: 'filter', outPorts: [] })
    expect(r.lines.join(' ')).toMatch(/drops/)
  })

  it('floods the first frame between the hub hosts because D is still unknown', () => {
    const r = send(createSwitch(), 'C', 'D')
    expect(r.decision.action).toBe('flood')
    expect(r.decision.outPorts).toEqual(['Fa0/1', 'Fa0/2'])
  })

  it('rejects a frame to itself', () => {
    expect(() => send(createSwitch(), 'A', 'A')).toThrow()
  })
})

describe('receivers', () => {
  it('a hub repeats to its other host no matter what the switch decides', () => {
    const sw = send(createSwitch(), 'D', 'A').sw
    const d = decide(sw, 'C', 'D')
    expect(receivers('C', 'D', d)).toEqual([{ id: 'D', via: 'hub', accepted: true }])
  })

  it('hosts that get a flooded frame for someone else ignore it', () => {
    const r = send(createSwitch(), 'A', 'B')
    expect(r.receivers).toEqual([
      { id: 'B', via: 'switch', accepted: true },
      { id: 'C', via: 'switch', accepted: false },
      { id: 'D', via: 'switch', accepted: false }
    ])
    expect(r.lines.at(-1)).toMatch(/PC C and PC D see a destination MAC/)
  })

  it('everyone accepts a broadcast', () => {
    const r = send(createSwitch(), 'C', BROADCAST)
    expect(r.receivers.every((x) => x.accepted)).toBe(true)
    expect(r.receivers.map((x) => x.id).sort()).toEqual(['A', 'B', 'D'])
  })
})

describe('aging', () => {
  it('removes entries that reach the aging time', () => {
    let sw = createSwitch(60)
    sw = send(sw, 'A', 'B').sw
    let r = advanceTime(sw, 30)
    expect(r.expired).toHaveLength(0)
    sw = send(r.sw, 'B', 'A').sw
    r = advanceTime(sw, 30)
    expect(r.expired.map((e) => e.host)).toEqual(['A'])
    expect(r.sw.table.map((e) => e.host)).toEqual(['B'])
  })

  it('a shorter aging time can expire entries at once', () => {
    let sw = send(createSwitch(300), 'A', 'B').sw
    sw = advanceTime(sw, 45).sw
    const r = setAging(sw, 30)
    expect(r.expired).toHaveLength(1)
    expect(r.sw.agingTime).toBe(30)
  })

  it('an aged-out destination is flooded again', () => {
    let sw = send(createSwitch(30), 'B', 'A').sw
    expect(decide(sw, 'A', 'B').action).toBe('forward')
    sw = advanceTime(sw, 30).sw
    expect(decide(sw, 'A', 'B').action).toBe('flood')
  })
})

describe('framePhases', () => {
  it('goes host, switch, out ports', () => {
    const d = decide(createSwitch(), 'A', 'B')
    const { phases, atSwitch } = framePhases('A', d)
    expect(atSwitch).toBe(0)
    expect(phases).toEqual([[['A', 'SW']], [['SW', 'B'], ['SW', 'HUB']], [['HUB', 'C'], ['HUB', 'D']]])
  })

  it('starts at the hub for hub hosts and stops at the switch when filtered', () => {
    const sw = send(createSwitch(), 'D', 'A').sw
    const { phases, atSwitch } = framePhases('C', decide(sw, 'C', 'D'))
    expect(atSwitch).toBe(1)
    expect(phases).toEqual([[['C', 'HUB']], [['HUB', 'D'], ['HUB', 'SW']]])
  })
})
