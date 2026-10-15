import { describe, expect, it } from 'vitest'
import { ipToInt, parseIp, subnetFacts } from './net'
import { CALC_TASKS, GENERATORS, answerKey, generateQuestion, gradeField, gradeQuestion, normalizeDifficulty, parseCalcInput, parseCidr } from './subnet-drill'

function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

describe('parseCalcInput', () => {
  it('reads separate fields with a prefix or a mask', () => {
    expect(parseCalcInput('192.168.1.77', '/26')).toEqual({ ok: true, address: ipToInt('192.168.1.77'), prefix: 26 })
    expect(parseCalcInput('192.168.1.77', '255.255.255.192').prefix).toBe(26)
    expect(parseCalcInput('192.168.1.77', '26').prefix).toBe(26)
  })

  it('reads CIDR or a mask typed into the address box', () => {
    expect(parseCalcInput('10.1.2.3/12', '').prefix).toBe(12)
    expect(parseCalcInput('10.1.2.3 /12', '/24').prefix).toBe(12)
    expect(parseCalcInput('10.1.2.3 255.255.0.0', '').prefix).toBe(16)
  })

  it('reports which field is wrong', () => {
    expect(parseCalcInput('10.1.2', '/24')).toMatchObject({ ok: false, field: 'address' })
    expect(parseCalcInput('10.1.2.3', '255.0.255.0')).toMatchObject({ ok: false, field: 'prefix' })
    expect(parseCalcInput('10.1.2.3', '/40')).toMatchObject({ ok: false, field: 'prefix' })
  })
})

describe('parseCidr', () => {
  it('accepts slash or mask forms', () => {
    expect(parseCidr('192.168.5.64/26')).toEqual({ address: ipToInt('192.168.5.64'), prefix: 26 })
    expect(parseCidr('192.168.5.64 / 26')).toEqual({ address: ipToInt('192.168.5.64'), prefix: 26 })
    expect(parseCidr('192.168.5.64 255.255.255.192')).toEqual({ address: ipToInt('192.168.5.64'), prefix: 26 })
    expect(parseCidr('192.168.5.64')).toBeNull()
  })
})

describe('gradeField', () => {
  const f = subnetFacts(ipToInt('192.168.1.77'), 26)
  const q = GENERATORS.easy(seeded(3))

  it('accepts equivalent spellings of IPs and numbers', () => {
    const field = { key: 'network', type: 'ip', value: f.networkInt, display: f.network }
    expect(gradeField(field, ' 192.168.001.064 ').ok).toBe(true)
    expect(gradeField({ type: 'number', value: 2046 }, '2,046').ok).toBe(true)
    expect(gradeField({ type: 'prefix', value: 20 }, '255.255.240.0').ok).toBe(true)
    expect(gradeField({ type: 'prefix', value: 20 }, '20').ok).toBe(true)
  })

  it('insists on dotted notation for masks and explains why', () => {
    const mask = { type: 'mask', value: 26 }
    expect(gradeField(mask, '255.255.255.192').ok).toBe(true)
    const r = gradeField(mask, '/26')
    expect(r.ok).toBe(false)
    expect(r.hint).toMatch(/dotted/)
    expect(gradeField(mask, '255.255.0.255').hint).toMatch(/contiguous/)
  })

  it('gives targeted hints for classic slips', () => {
    const host = q.fields.find((x) => x.key === 'network')
    const broadcast = q.fields.find((x) => x.key === 'broadcast')
    expect(gradeField(host, broadcast.display).hint).toMatch(/broadcast/)
    const hosts = q.fields.find((x) => x.key === 'hosts')
    expect(gradeField(hosts, String(hosts.value + 2)).hint).toMatch(/Subtract 2/)
  })

  it('flags blanks and junk', () => {
    expect(gradeField({ type: 'ip', value: 1 }, '')).toEqual({ ok: false, hint: 'Left blank.' })
    expect(gradeField({ type: 'ip', value: 1 }, 'hello').ok).toBe(false)
    expect(gradeField({ type: 'number', value: 1 }, 'ten').ok).toBe(false)
  })
})

describe('generators', () => {
  it('normalizes difficulty', () => {
    expect(normalizeDifficulty('hard')).toBe('hard')
    expect(normalizeDifficulty('nope')).toBe('easy')
  })

  it('every generated question grades its own answer key as fully correct', () => {
    const rng = seeded(42)
    for (const level of ['easy', 'medium', 'hard']) {
      for (let i = 0; i < 300; i++) {
        const q = generateQuestion(level, rng)
        const result = gradeQuestion(q, answerKey(q))
        expect(result.allCorrect, `${q.prompt} ${JSON.stringify(result.fields.filter((x) => !x.ok))}`).toBe(true)
        expect(q.solution.length).toBeGreaterThan(0)
        expect(q.prompt + q.solution.join(' ')).not.toMatch(/—/)
      }
    }
  })

  it('easy questions stay in the last octet between /24 and /30 and give a real host', () => {
    const rng = seeded(9)
    for (let i = 0; i < 200; i++) {
      const q = GENERATORS.easy(rng)
      expect(q.given.prefix).toBeGreaterThanOrEqual(24)
      expect(q.given.prefix).toBeLessThanOrEqual(30)
      const f = subnetFacts(q.given.address, q.given.prefix)
      expect(q.given.address).toBeGreaterThan(f.networkInt)
      expect(q.given.address).toBeLessThan(f.broadcastInt)
      expect(q.fields.map((x) => x.key)).toEqual(['network', 'broadcast', 'first', 'last', 'hosts'])
    }
  })

  it('medium questions reach the 2nd and 3rd octets and ask for the other notation', () => {
    const rng = seeded(5)
    const prefixes = new Set()
    for (let i = 0; i < 300; i++) {
      const q = GENERATORS.medium(rng)
      prefixes.add(q.given.prefix)
      const keys = q.fields.map((x) => x.key)
      expect(keys).toContain(q.given.showMask ? 'prefix' : 'mask')
    }
    expect([...prefixes].some((p) => p < 16)).toBe(true)
    expect([...prefixes].some((p) => p >= 16 && p < 24)).toBe(true)
  })

  it('builds a valid, aligned, non-overlapping VLSM plan', () => {
    const rng = seeded(11)
    for (let i = 0; i < 200; i++) {
      const q = GENERATORS.vlsm(rng)
      let prev = -1
      for (const p of q.plan) {
        expect(p.start % p.size).toBe(0)
        expect(p.start).toBeGreaterThan(prev)
        expect(p.usable).toBeGreaterThanOrEqual(p.hosts)
        expect(2 ** (32 - p.prefix - 1) - 2).toBeLessThan(p.hosts)
        prev = p.end
      }
      expect(q.plan.at(-1).prefix).toBe(30)
      expect(q.plan.at(-1).end - q.plan[0].start).toBeLessThan(256)
    }
  })

  it('works a known VLSM example correctly', () => {
    // rng 0 picks the first option everywhere: base 192.168.0.0, needs 100, 30, 10 and the link.
    const q = GENERATORS.vlsm(() => 0)
    expect(q.fields.map((f) => f.display)).toEqual(['192.168.0.0/25', '192.168.0.128/27', '192.168.0.160/28', '192.168.0.176/30'])
    expect(q.solution[1]).toContain('2^7 - 2 = 126')
  })

  it('counts subnets and hosts from borrowed bits', () => {
    const rng = seeded(21)
    for (let i = 0; i < 100; i++) {
      const q = GENERATORS.count(rng)
      const { basePrefix, newPrefix } = q.given
      expect(newPrefix).toBeGreaterThan(basePrefix)
      expect(newPrefix).toBeLessThanOrEqual(30)
      expect(q.fields[0].value).toBe(2 ** (newPrefix - basePrefix))
      expect(q.fields[1].value).toBe(2 ** (32 - newPrefix) - 2)
    }
    const fixed = GENERATORS.count(() => 0.5)
    expect(fixed.solution.join(' ')).toMatch(/borrowed/)
  })

  it('sizes a mask for a subnet count', () => {
    const rng = seeded(8)
    for (let i = 0; i < 100; i++) {
      const q = GENERATORS.need(rng)
      const { need, basePrefix } = q.given
      const prefix = q.fields[0].value
      expect(2 ** (prefix - basePrefix)).toBeGreaterThanOrEqual(need)
      expect(2 ** (prefix - basePrefix - 1)).toBeLessThan(need)
    }
  })

  it('which-subnet questions use the 2nd or 3rd octet and match subnetFacts', () => {
    const rng = seeded(31)
    for (let i = 0; i < 100; i++) {
      const q = GENERATORS.which(rng)
      expect(q.given.prefix).toBeGreaterThan(8)
      expect(q.given.prefix).toBeLessThan(24)
      const f = subnetFacts(q.given.address, q.given.prefix)
      expect(parseIp(q.fields[0].display)).toBe(f.networkInt)
      expect(q.fields.map((x) => x.key)).toEqual(['network', 'broadcast', 'last'])
    }
  })
})

describe('gradeQuestion', () => {
  it('reports per-field results', () => {
    const q = GENERATORS.easy(seeded(2))
    const key = answerKey(q)
    const result = gradeQuestion(q, { ...key, broadcast: key.network, hosts: '' })
    expect(result.allCorrect).toBe(false)
    expect(result.correct).toBe(3)
    expect(result.fields.find((f) => f.key === 'broadcast').hint).toMatch(/network address/)
    expect(result.fields.find((f) => f.key === 'hosts').hint).toBe('Left blank.')
  })
})

describe('calculator tasks', () => {
  it('recognize the three explore targets', () => {
    const hit = (p) => CALC_TASKS.filter((t) => t.test(p)).map((t) => t.id)
    expect(hit(24)).toEqual(['boundary'])
    expect(hit(27)).toEqual(['last'])
    expect(hit(19)).toEqual(['third'])
    expect(hit(32)).toEqual([])
  })
})
