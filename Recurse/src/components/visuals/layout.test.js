import { describe, expect, it } from 'vitest'
import { VISUAL_FIXTURES } from './fixtures'
import {
  bitsRow,
  edgeDistance,
  fieldShares,
  fitWidths,
  ipv4ToBits,
  layoutSequence,
  layoutTopology,
  longestWord,
  overlaps,
  parseInline,
  plainText,
  segmentHitsRect,
  textWidth,
  tidyTree,
  toBinary,
  treeSize,
  wrapText
} from './layout'

const fixtures = (type) => VISUAL_FIXTURES.filter((f) => f.spec.type === type)
const lineText = (line) => line.runs.map((r) => r.text).join('')
const WIDTHS = [240, 268, 338, 640]

describe('text measuring', () => {
  it('gives monospace 0.6 em a character, plus a little slack', () => {
    const w = textWidth('10.1.1.1', 12, { mono: true })
    expect(w).toBeGreaterThanOrEqual(8 * 0.6 * 12)
    expect(w).toBeLessThan(8 * 0.6 * 12 * 1.1)
  })
  it('makes bold text wider than regular', () => {
    expect(textWidth('Router', 13, { bold: true })).toBeGreaterThan(textWidth('Router', 13))
  })
  it('reads inline markup as runs and strips it for plain text', () => {
    expect(parseInline('Send `SYN` then **wait**')).toEqual([{ text: 'Send ' }, { text: 'SYN', code: true }, { text: ' then ' }, { text: 'wait', bold: true }])
    expect(plainText('Send `SYN` then **wait**')).toBe('Send SYN then wait')
  })
  it('measures the longest word', () => {
    expect(longestWord('a Lightweight AP', 13)).toBeCloseTo(textWidth('Lightweight', 13))
  })
})

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    const t = wrapText('Discover', 200, 13)
    expect(t.lines).toHaveLength(1)
    expect(t.truncated).toBe(false)
  })
  it('wraps to lines no wider than the limit', () => {
    const t = wrapText('The PC uses 10.1.1.20 and renews at half the lease', 120, 12, { maxLines: 6 })
    expect(t.lines.length).toBeGreaterThan(2)
    for (const line of t.lines) expect(line.width).toBeLessThanOrEqual(120)
  })
  it('balances two lines instead of leaving one word alone', () => {
    const limit = textWidth('10.1.1.20 for 24', 12) + 1
    expect(wrapText('10.1.1.20 for 24 hours', limit, 12, { balance: false }).lines.map(lineText)).toEqual(['10.1.1.20 for 24', 'hours'])
    expect(wrapText('10.1.1.20 for 24 hours', limit, 12).lines.map(lineText)).toEqual(['10.1.1.20 for', '24 hours'])
  })
  it('ends in an ellipsis when the text needs more lines than allowed', () => {
    const t = wrapText('one two three four five six seven eight nine ten', 60, 12, { maxLines: 2 })
    expect(t.truncated).toBe(true)
    expect(t.lines).toHaveLength(2)
    expect(lineText(t.lines[1]).endsWith('…')).toBe(true)
    expect(t.lines[1].width).toBeLessThanOrEqual(60)
  })
  it('leaves a word wider than the limit whole', () => {
    const t = wrapText('Authentication server', 40, 13, { maxLines: 3 })
    expect(t.lines.map(lineText)).toEqual(['Authentication', 'server'])
  })
  it('keeps code runs in the mono font', () => {
    const t = wrapText('EAP Response: `alice@corp`', 400, 13, { bold: true })
    expect(t.lines[0].runs.map((r) => [r.text, r.mono])).toEqual([
      ['EAP Response:', false],
      [' alice@corp', true]
    ])
  })
})

describe('tidyTree', () => {
  const size = () => ({ w: 40, h: 30 })
  const leaf = (label) => ({ label })

  it('places a single node at the origin', () => {
    const t = tidyTree(leaf('a'), size)
    expect(t.nodes).toEqual([{ node: { label: 'a' }, x: 20, y: 0, w: 40, h: 30, depth: 0, parent: -1 }])
    expect(t.width).toBe(40)
    expect(t.height).toBe(30)
  })

  it('centers a parent over its first and last child', () => {
    const t = tidyTree({ label: 'p', children: [leaf('a'), leaf('b'), leaf('c')] }, size, { gap: 10, levelGap: 20 })
    const [p, a, b, c] = t.nodes
    expect(p.x).toBe((a.x + c.x) / 2)
    expect(b.x - a.x).toBe(50)
    expect(c.x - b.x).toBe(50)
    expect(a.y).toBe(50)
  })

  it('packs subtrees by their contours so no two nodes on a level overlap', () => {
    const deep = { label: 'l', children: [{ label: 'x', children: [leaf('1'), leaf('2'), leaf('3')] }] }
    const root = { label: 'r', children: [deep, { label: 'm', children: [leaf('4')] }, leaf('s')] }
    const gap = 8
    const t = tidyTree(root, (n) => ({ w: n.label.length * 10 + 20, h: 30 }), { gap })
    const byDepth = {}
    for (const n of t.nodes) (byDepth[n.depth] ||= []).push(n)
    for (const level of Object.values(byDepth)) {
      const sorted = [...level].sort((p, q) => p.x - q.x)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].x - sorted[i].w / 2).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w / 2 + gap - 1e-9)
    }
    expect(Math.min(...t.nodes.map((n) => n.x - n.w / 2))).toBe(0)
    expect(Math.max(...t.nodes.map((n) => n.x + n.w / 2))).toBeCloseTo(t.width)
  })

  it('draws a balanced tree symmetrically', () => {
    const merge = fixtures('tree').find((f) => f.name.includes('merge sort')).spec.root
    const t = tidyTree(merge, size, { gap: 6 })
    expect(t.nodes[0].x).toBeCloseTo(t.width / 2)
    const leaves = t.nodes.filter((n) => n.depth === 3).map((n) => n.x)
    expect(leaves).toHaveLength(8)
    leaves.slice(1).forEach((x, i) => expect(x - leaves[i]).toBeCloseTo(46))
  })

  it('counts nodes', () => {
    expect(treeSize(fixtures('tree').find((f) => f.name.includes('24 nodes')).spec.root)).toBe(24)
  })
})

describe('IPv4 bits', () => {
  it('converts numbers and addresses to binary', () => {
    expect(toBinary(5)).toBe('00000101')
    expect(toBinary(255)).toBe('11111111')
    expect(ipv4ToBits('192.168.10.77')).toEqual(['11000000', '10101000', '00001010', '01001101'])
  })

  it('colors network and host bits by the prefix and marks the first host bit', () => {
    const row = bitsRow({ value: '192.168.10.77' }, { prefix: 26 })
    const digits = row.octets.flatMap((o) => o.digits)
    expect(digits).toHaveLength(32)
    expect(digits.filter((d) => d.net)).toHaveLength(26)
    expect(digits.filter((d) => d.host)).toHaveLength(6)
    expect(digits.findIndex((d) => d.cut)).toBe(26)
  })

  it('shows octets outside the binary view as decimal, tagged against the prefix', () => {
    const row = bitsRow({ value: '172.16.37.9' }, { prefix: 20, octets: [3] })
    expect(row.octets.map((o) => [o.binary, o.text, o.net])).toEqual([
      [false, '172', 'net'],
      [false, '16', 'net'],
      [false, '37', 'mixed'],
      [true, '00001001', 'host']
    ])
  })

  it('keeps the grouping of a raw bit string and splits 32 bits into octets', () => {
    expect(bitsRow({ bits: '0010 0101' }, { prefix: 20 })).toEqual({
      raw: true,
      groups: [
        [...'0010'].map((bit) => ({ bit, host: false, net: false, cut: false })),
        [...'0101'].map((bit) => ({ bit, host: false, net: false, cut: false }))
      ]
    })
    const whole = bitsRow({ bits: '11111111111111111111000000000000' }, { prefix: 20 })
    expect(whole.raw).toBe(false)
    expect(whole.octets.map((o) => o.text)).toEqual(['11111111', '11111111', '11110000', '00000000'])
  })
})

describe('field widths', () => {
  it('uses the sizes of a fixed row as they are', () => {
    expect(fieldShares([{ size: 4 }, { size: 4 }, { size: 8 }, { size: 16 }], 32)).toEqual([4, 4, 8, 16])
  })
  it('gives variable fields what is left of the width, by weight', () => {
    expect(fieldShares([{ size: 8 }, { size: 'x', weight: 1 }, { size: 'y', weight: 3 }], 32)).toEqual([8, 6, 18])
  })
  it('without a width, sizes a variable field as weight times the average fixed field', () => {
    const shares = fieldShares([{ size: 8 }, { size: 6 }, { size: 6 }, { size: 2 }, { size: '46-1500', weight: 4 }, { size: 4 }])
    expect(shares[4]).toBeCloseTo(4 * (26 / 5))
  })
  it('splits in proportion when every field fits', () => {
    expect(fitWidths([1, 1, 2], [10, 10, 10], 400)).toEqual([100, 100, 200])
  })
  it('raises narrow fields to their minimum and shares the rest', () => {
    const widths = fitWidths([1, 30, 1], [40, 10, 40], 320)
    expect(widths[0]).toBe(40)
    expect(widths[2]).toBe(40)
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(320)
  })
  it('gives up when the minimums alone do not fit', () => {
    expect(fitWidths([1, 1], [200, 200], 300)).toBeNull()
  })
})

describe('geometry', () => {
  it('finds segments that cross a rectangle', () => {
    const r = { x: 10, y: 10, w: 20, h: 20 }
    expect(segmentHitsRect(0, 20, 40, 20, r)).toBe(true)
    expect(segmentHitsRect(0, 0, 40, 5, r)).toBe(false)
    expect(segmentHitsRect(15, 15, 16, 16, r)).toBe(true)
  })
  it('measures from a box center to its edge', () => {
    expect(edgeDistance(40, 20, 1, 0)).toBe(20)
    expect(edgeDistance(40, 20, 0, 1)).toBe(10)
    expect(edgeDistance(40, 20, Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(10 / Math.SQRT1_2)
  })
})

describe('layoutSequence', () => {
  for (const f of fixtures('sequence')) {
    it(`keeps ${f.name} inside its width`, () => {
      for (const width of WIDTHS) {
        const L = layoutSequence(f.spec, width)
        expect(L.width).toBeLessThanOrEqual(width)
        for (const a of L.actors) {
          expect(a.textX - a.text.width / 2).toBeGreaterThanOrEqual(0)
          expect(a.textX + a.text.width / 2).toBeLessThanOrEqual(L.width)
        }
        let last = -Infinity
        for (const row of L.rows) {
          const top = row.kind === 'note' ? row.box.y : row.kind === 'self' ? row.top : row.labelTop
          expect(top).toBeGreaterThan(last)
          last = top
          if (row.kind === 'message') {
            expect(row.labelX - row.label.width / 2).toBeGreaterThanOrEqual(0)
            expect(row.labelX + row.label.width / 2).toBeLessThanOrEqual(L.width)
          }
          if (row.kind === 'note') expect(row.box.x + row.box.w).toBeLessThanOrEqual(L.width)
        }
      }
    })
  }

  it('staggers actor names that do not fit their lanes', () => {
    const five = fixtures('sequence').find((f) => f.spec.actors.length === 5).spec
    const narrow = layoutSequence(five, 268)
    expect(narrow.actors[1].textTop).toBeGreaterThan(narrow.actors[0].textTop)
    const wide = layoutSequence(five, 720)
    expect(wide.actors[1].textTop).toBe(wide.actors[0].textTop)
  })
})

describe('layoutTopology', () => {
  for (const f of fixtures('topology')) {
    it(`places every label of ${f.name} inside the drawing, clear of the others`, () => {
      for (const width of WIDTHS) {
        const L = layoutTopology(f.spec, width)
        expect(L.width).toBeLessThanOrEqual(width)
        const texts = [...L.nodes.map((n) => n.text.rect), ...L.links.flatMap((g) => g.labels.map((l) => l.rect)), ...L.marks.map((m) => m.rect)]
        for (const r of texts) {
          expect(r.x).toBeGreaterThanOrEqual(0)
          expect(r.x + r.w).toBeLessThanOrEqual(L.width + 0.5)
          expect(r.y).toBeGreaterThanOrEqual(0)
          expect(r.y + r.h).toBeLessThanOrEqual(L.height)
        }
        // At desktop width nothing collides; on a phone, labels that cannot be placed move to the key.
        if (width >= 640) {
          for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) expect(overlaps(texts[i], texts[j])).toBe(false)
        }
        // No label ever sits on a device icon.
        for (const r of texts) for (const n of L.nodes) expect(overlaps(r, n.iconRect)).toBe(false)
      }
    })
  }

  it('never runs a link through a node label', () => {
    for (const f of fixtures('topology')) {
      // A fourth column is flagged as cramped on phones; it only has to be clean on wide screens.
      const cramped = f.spec.nodes.some((n) => n.x === 3)
      for (const width of cramped ? [640] : WIDTHS) {
        const L = layoutTopology(f.spec, width)
        for (const n of L.nodes) for (const g of L.links) expect(segmentHitsRect(g.x1, g.y1, g.x2, g.y2, n.text.rect)).toBe(false)
      }
    }
  })

  it('moves a label off a link that leaves its node straight down', () => {
    const chain = fixtures('topology').find((f) => f.name.includes('vertical chain')).spec
    for (const width of WIDTHS) {
      const L = layoutTopology(chain, width)
      const sw = L.nodes.find((n) => n.id === 'sw1')
      expect(sw.text.rect.x >= sw.cx || sw.text.rect.x + sw.text.rect.w <= sw.cx).toBe(true)
      expect(sw.text.sub).not.toBeNull()
    }
  })

  it('turns a callout into a numbered note when a phone drawing has no room for it', () => {
    const acl = fixtures('topology').find((f) => f.name.includes('ACL')).spec
    expect(layoutTopology(acl, 640).marks.every((m) => !m.badge)).toBe(true)
    expect(layoutTopology(acl, 268).marks.some((m) => m.badge === 1)).toBe(true)
  })
})
