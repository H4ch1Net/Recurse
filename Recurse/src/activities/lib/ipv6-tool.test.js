import { describe, expect, it } from 'vitest'
import { PATTERNS, bestRun, classify, compress, compressSteps, diagnose, drillAddress, drillSet, eui64, expand, parseIpv6, parseMac, withPrefix, zeroRuns } from './ipv6-tool'

const h = (text) => {
  const r = parseIpv6(text)
  if (!r.ok) throw new Error(`${text}: ${r.error}`)
  return r.hextets
}

// Small seeded generator so drill tests are repeatable.
function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('parsing valid addresses', () => {
  it('reads full, shortened and mixed-case forms', () => {
    expect(h('2001:0db8:0000:0000:0000:ff00:0042:8329')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0xff00, 0x42, 0x8329])
    expect(h('2001:DB8::FF00:42:8329')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0xff00, 0x42, 0x8329])
    expect(h('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(h('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(h('fe80::')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 0])
    expect(h('  FE80::1  ')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1])
  })
  it('allows :: for a single group (valid, though not the preferred form)', () => {
    const r = parseIpv6('1:2:3:4:5:6:7::')
    expect(r.ok).toBe(true)
    expect(r.gap).toEqual({ start: 7, len: 1 })
  })
  it('records where the :: gap sits', () => {
    expect(parseIpv6('2001:db8::1').gap).toEqual({ start: 2, len: 5 })
    expect(parseIpv6('::1').gap).toEqual({ start: 0, len: 7 })
    expect(parseIpv6('1:2:3:4:5:6:7:8').gap).toBeNull()
  })
})

describe('parsing invalid addresses', () => {
  const bad = {
    '': /Type an address/,
    '2001:db8::1::2': /only once/,
    'fe80:::1': /Three colons/,
    '2001:db8:0:0:0:0:0:1:2': /8 groups/,
    '2001:db8:1': /8 groups/,
    '12345::1': /more than four/,
    'g001::1': /hex digits/,
    ':1:2:3:4:5:6:7': /empty group/,
    '1:2:3:4:5:6:7:': /empty group/,
    '1:2:3:4:5:6:7::8': /fewer than 8/,
    '::ffff:192.0.2.1': /Dotted/
  }
  for (const [input, message] of Object.entries(bad)) {
    it(`rejects "${input}"`, () => {
      const r = parseIpv6(input)
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(message)
    })
  }
})

describe('expand and compress', () => {
  it('expands to eight four-digit groups', () => {
    expect(expand(h('2001:db8::1'))).toBe('2001:0DB8:0000:0000:0000:0000:0000:0001')
    expect(expand(h('::'))).toBe('0000:0000:0000:0000:0000:0000:0000:0000')
  })
  it('handles the book example: FE00:0:0:1::56', () => {
    expect(compress(h('FE00:0000:0000:0001:0000:0000:0000:0056'))).toBe('FE00:0:0:1::56')
  })
  it('keeps trailing zeros and drops leading ones', () => {
    expect(compress(h('2001:0DB8:DB80:1000:0001:0010:0100:A000'))).toBe('2001:DB8:DB80:1000:1:10:100:A000')
  })
  it('never uses :: for a single zero group', () => {
    expect(compress(h('2001:db8:0:1:1:1:1:1'))).toBe('2001:DB8:0:1:1:1:1:1')
  })
  it('picks the longest run', () => {
    expect(compress(h('2001:0:0:1:0:0:0:1'))).toBe('2001:0:0:1::1')
  })
  it('picks the leftmost run on a tie (RFC 5952)', () => {
    expect(compress(h('2001:db8:0:0:1:0:0:1'))).toBe('2001:DB8::1:0:0:1')
    expect(compress(h('1:0:0:2:0:0:3:4'))).toBe('1::2:0:0:3:4')
  })
  it('compresses runs at either end', () => {
    expect(compress(h('0:0:0:0:0:0:0:1'))).toBe('::1')
    expect(compress(h('0:0:0:0:0:0:0:0'))).toBe('::')
    expect(compress(h('fe80:0:0:0:0:0:0:0'))).toBe('FE80::')
    expect(compress(h('0:0:1:2:3:4:5:6'))).toBe('::1:2:3:4:5:6')
    expect(compress(h('fe80:0:0:0:0250:56ff:feab:cdef'))).toBe('FE80::250:56FF:FEAB:CDEF')
  })
  it('round-trips: compress then parse gives the same address', () => {
    const rand = seeded(7)
    for (let i = 0; i < 300; i++) {
      const addr = drillAddress(PATTERNS[i % PATTERNS.length], rand)
      expect(h(compress(addr))).toEqual(addr)
      expect(h(expand(addr))).toEqual(addr)
    }
  })
})

describe('zero runs', () => {
  it('finds every run and the one to replace', () => {
    const a = h('2001:0:0:1:0:0:0:1')
    expect(zeroRuns(a)).toEqual([{ start: 1, len: 2 }, { start: 4, len: 3 }])
    expect(bestRun(a)).toEqual({ start: 4, len: 3 })
    expect(bestRun(h('2001:db8:0:1:1:1:1:1'))).toBeNull()
  })
  it('explains the steps, including ties', () => {
    const steps = compressSteps(h('2001:0db8:0:0:1:0:0:1'))
    expect(steps.groups[1]).toEqual({ full: '0DB8', short: 'DB8', dropped: 1 })
    expect(steps.groups[2]).toEqual({ full: '0000', short: '0', dropped: 3 })
    expect(steps.tie).toBe(true)
    expect(steps.best).toEqual({ start: 2, len: 2 })
    expect(steps.result).toBe('2001:DB8::1:0:0:1')
  })
})

describe('grading typed answers', () => {
  const target = h('2001:0db8:0000:0000:0000:ff00:0042:8329')
  it('accepts the shortest form in any case', () => {
    expect(diagnose('2001:db8::ff00:42:8329', target).correct).toBe(true)
    expect(diagnose(' 2001:DB8::FF00:42:8329 ', target).correct).toBe(true)
  })
  it('spots leading zeros left in', () => {
    const d = diagnose('2001:0db8::ff00:0042:8329', target)
    expect(d.correct).toBe(false)
    expect(d.same).toBe(true)
    expect(d.issues.join(' ')).toMatch(/leading zeros/)
  })
  it('spots a missing ::', () => {
    expect(diagnose('2001:db8:0:0:0:ff00:42:8329', target).issues.join(' ')).toMatch(/Replace the longest run/)
  })
  it('spots a :: that covers only part of the run', () => {
    expect(diagnose('2001:db8:0::ff00:42:8329', target).issues.join(' ')).toMatch(/whole run/)
  })
  it('spots the wrong run and the wrong side of a tie', () => {
    expect(diagnose('2001::1:0:0:0:1', h('2001:0:0:1:0:0:0:1')).issues.join(' ')).toMatch(/longest run/)
    expect(diagnose('2001:db8:0:0:1::1', h('2001:db8:0:0:1:0:0:1')).issues.join(' ')).toMatch(/first one/)
  })
  it('spots :: used for a single group', () => {
    expect(diagnose('2001:db8::1:1:1:1:1', h('2001:db8:0:1:1:1:1:1')).issues.join(' ')).toMatch(/two or more/)
  })
  it('spots trailing zeros removed by mistake', () => {
    const d = diagnose('FE:0:0:1::56', h('FE00:0:0:1:0:0:0:56'))
    expect(d.same).toBe(false)
    expect(d.issues.join(' ')).toMatch(/trailing zero/)
  })
  it('reports parse errors and different addresses', () => {
    expect(diagnose('FE00::1::56', h('FE00:0:0:1:0:0:0:56')).issues[0]).toMatch(/only once/)
    expect(diagnose('2001:db8::1', target).same).toBe(false)
  })
})

describe('address types', () => {
  const type = (t) => classify(h(t)).id
  it('classifies every CCNA type', () => {
    expect(type('::')).toBe('unspecified')
    expect(type('::1')).toBe('loopback')
    expect(type('ff02::1')).toBe('multicast')
    expect(type('ff05::2')).toBe('multicast')
    expect(type('fe80::1')).toBe('link-local')
    expect(type('febf::1')).toBe('link-local')
    expect(type('fec0::1')).toBe('other')
    expect(type('fc00::1')).toBe('unique-local')
    expect(type('fd12:3456::1')).toBe('unique-local')
    expect(type('2001:db8::1')).toBe('global')
    expect(type('3fff::1')).toBe('global')
    expect(type('4000::1')).toBe('other')
    expect(type('::2')).toBe('other')
  })
  it('adds notes for well-known addresses', () => {
    expect(classify(h('ff02::1')).extra).toMatch(/all nodes/)
    expect(classify(h('ff02::2')).extra).toMatch(/all routers/)
    expect(classify(h('ff02::1:ff00:1')).extra).toMatch(/solicited-node/)
    expect(classify(h('2001:db8::1')).extra).toMatch(/documentation/)
  })
})

describe('EUI-64', () => {
  it('parses MACs in every common format', () => {
    const want = [0x00, 0x13, 0x12, 0x34, 0xab, 0xcd]
    expect(parseMac('0013.1234.ABCD')).toEqual(want)
    expect(parseMac('00:13:12:34:ab:cd')).toEqual(want)
    expect(parseMac('00-13-12-34-AB-CD')).toEqual(want)
    expect(parseMac('00131234abcd')).toEqual(want)
    expect(parseMac('0013.1234.ABC')).toBeNull()
    expect(parseMac('00:13:12:34:ab')).toBeNull()
    expect(parseMac('zz13.1234.abcd')).toBeNull()
  })
  it('builds the book example 0213:12FF:FE34:ABCD', () => {
    const r = eui64(parseMac('0013.1234.ABCD'))
    expect(r.text).toBe('0213:12FF:FE34:ABCD')
    expect(r.oui).toEqual(['00', '13', '12'])
    expect(r.nic).toEqual(['34', 'AB', 'CD'])
    expect(r.firstBefore).toBe('00000000')
    expect(r.firstAfter).toBe('00000010')
  })
  it('flips the bit back off when it was already set', () => {
    expect(eui64(parseMac('0200.0000.0001')).text).toBe('0000:00FF:FE00:0001')
    expect(eui64(parseMac('0050.56ab.cdef')).text).toBe('0250:56FF:FEAB:CDEF')
  })
  it('joins a /64 prefix with the interface ID', () => {
    const iid = eui64(parseMac('0013.1234.ABCD')).hextets
    expect(compress(withPrefix(h('2001:db8:1:1::'), iid))).toBe('2001:DB8:1:1:213:12FF:FE34:ABCD')
    expect(compress(withPrefix(h('fe80::'), iid))).toBe('FE80::213:12FF:FE34:ABCD')
  })
})

describe('drill generator', () => {
  it('makes addresses that exercise each rule', () => {
    const rand = seeded(42)
    for (let i = 0; i < 200; i++) {
      for (const p of PATTERNS) {
        const a = drillAddress(p, rand)
        expect(a).toHaveLength(8)
        expect(a.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff)).toBe(true)
        const runs = zeroRuns(a)
        const best = bestRun(a)
        expect(best).not.toBeNull()
        if (p === 'single-zero') expect(runs.some((r) => r.len === 1)).toBe(true)
        if (p === 'tie') expect(runs.filter((r) => r.len === best.len).length).toBe(2)
        if (p === 'two-runs') expect(runs.length).toBe(2)
        expect(compress(a).length).toBeLessThan(expand(a).length)
      }
    }
  })
  it('a drill set covers every pattern once', () => {
    const set = drillSet(seeded(3))
    expect(set.map((s) => s.pattern).sort()).toEqual([...PATTERNS].sort())
  })
})
