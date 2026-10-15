import { describe, expect, it } from 'vitest'
import { buildGlossary, groupByLetter, letterOf, limitToTopics, searchGlossary } from './glossary'

const packs = [
  { id: 'vlans', name: 'VLANs', subject: 'networking', lesson: { keyTerms: [{ term: 'VLAN', definition: 'A virtual LAN.' }, { term: 'Trunk', definition: 'Carries many VLANs.' }] } },
  { id: 'stp', name: 'Spanning Tree', subject: 'networking', lesson: { keyTerms: [{ term: 'vlan', definition: 'One broadcast domain.' }, { term: '802.1Q', definition: 'The trunk tagging standard.' }] } },
  { id: 'empty', name: 'No lesson', subject: 'cs' }
]

describe('glossary', () => {
  it('merges the same term across topics, ignoring case', () => {
    const entries = buildGlossary(packs)
    const vlan = entries.find((e) => e.key === 'vlan')
    expect(vlan.term).toBe('VLAN')
    expect(vlan.sources.map((s) => s.packId)).toEqual(['vlans', 'stp'])
    expect(entries).toHaveLength(3)
  })

  it('sorts A to Z and files digits under #', () => {
    const entries = buildGlossary(packs)
    expect(entries.map((e) => e.term)).toEqual(['802.1Q', 'Trunk', 'VLAN'])
    expect(letterOf('802.1Q')).toBe('#')
    expect(groupByLetter(entries).map(([letter]) => letter)).toEqual(['T', 'V', '#'])
  })

  it('searches terms and definitions with every word', () => {
    const entries = buildGlossary(packs)
    expect(searchGlossary(entries, 'broadcast').map((e) => e.key)).toEqual(['vlan'])
    expect(searchGlossary(entries, 'trunk standard').map((e) => e.key)).toEqual(['802.1q'])
    expect(searchGlossary(entries, '  ')).toHaveLength(3)
  })

  it('limits to a set of topics and drops other sources', () => {
    const entries = limitToTopics(buildGlossary(packs), ['stp'])
    expect(entries.map((e) => e.key)).toEqual(['802.1q', 'vlan'])
    expect(entries[1].sources).toHaveLength(1)
  })
})
