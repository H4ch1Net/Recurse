import { describe, expect, it } from 'vitest'
import { MNEMONICS, OSI_CARDS, OSI_LAYERS, TCPIP_LAYERS, cardById, grade, hintFor, shuffled, tcpipFor } from './osi-layers'

describe('layers and mnemonics', () => {
  it('lists the seven OSI layers top down', () => {
    expect(OSI_LAYERS.map((l) => l.n)).toEqual([7, 6, 5, 4, 3, 2, 1])
    expect(OSI_LAYERS.map((l) => l.name)).toEqual(['Application', 'Presentation', 'Session', 'Transport', 'Network', 'Data Link', 'Physical'])
  })

  it('mnemonic words start with each layer initial', () => {
    for (const l of OSI_LAYERS) {
      expect(l.down[0]).toBe(l.name[0])
      expect(l.up[0]).toBe(l.name[0])
    }
    expect(OSI_LAYERS.map((l) => l.down).join(' ')).toBe(MNEMONICS.down.phrase)
    expect([...OSI_LAYERS].reverse().map((l) => l.up).join(' ')).toBe(MNEMONICS.up.phrase)
  })

  it('maps every OSI layer to exactly one TCP/IP layer', () => {
    const covered = TCPIP_LAYERS.flatMap((t) => t.covers).sort()
    expect(covered).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(tcpipFor(6)).toBe('Application')
    expect(tcpipFor(3)).toBe('Network')
  })
})

describe('cards', () => {
  it('have unique ids and valid layers, with every layer used', () => {
    expect(new Set(OSI_CARDS.map((c) => c.id)).size).toBe(OSI_CARDS.length)
    for (const c of OSI_CARDS) expect(c.layer).toBeGreaterThanOrEqual(1)
    expect(new Set(OSI_CARDS.map((c) => c.layer)).size).toBe(7)
  })

  it('put the exam staples on the right layers', () => {
    const at = (id) => cardById(id).layer
    expect([at('http'), at('dns'), at('tcp'), at('udp'), at('port'), at('segment')]).toEqual([7, 7, 4, 4, 4, 4])
    expect([at('ip'), at('icmp'), at('ospf'), at('router'), at('packet')]).toEqual([3, 3, 3, 3, 3])
    expect([at('switch'), at('mac'), at('frame'), at('bits'), at('hub'), at('cable')]).toEqual([2, 2, 2, 1, 1, 1])
  })

  it('never use em dashes', () => {
    for (const c of OSI_CARDS) expect(c.label + c.why).not.toMatch(/\u2014/)
  })
})

describe('grade', () => {
  it('reports correct, wrong and unplaced cards', () => {
    const r = grade({ http: 7, tcp: 3, switch: 2 })
    expect(r.results).toEqual({ http: 'correct', tcp: 'wrong', switch: 'correct' })
    expect(r.correct).toBe(2)
    expect(r.wrong).toBe(1)
    expect(r.unplaced).toBe(OSI_CARDS.length - 3)
    expect(r.allCorrect).toBe(false)
  })

  it('is all correct only when every card is on its layer', () => {
    const perfect = Object.fromEntries(OSI_CARDS.map((c) => [c.id, c.layer]))
    expect(grade(perfect).allCorrect).toBe(true)
    expect(grade({ ...perfect, hub: 2 }).allCorrect).toBe(false)
  })
})

describe('hintFor', () => {
  it('says close for off-by-one', () => {
    expect(hintFor('switch', 3)).toMatch(/one layer lower/)
    expect(hintFor('router', 2)).toMatch(/one layer higher/)
  })

  it('explains the OSI split for the upper layers', () => {
    expect(hintFor('tls', 7)).toMatch(/OSI splits them/)
  })

  it('gives a kind clue for far misses and nothing for correct placements', () => {
    expect(hintFor('hub', 3)).toMatch(/reads/)
    expect(hintFor('hub', 1)).toBe('')
  })
})

describe('shuffled', () => {
  it('keeps every item', () => {
    const list = [1, 2, 3, 4, 5]
    expect(shuffled(list, () => 0.3).sort()).toEqual(list)
    expect(list).toEqual([1, 2, 3, 4, 5])
  })
})
