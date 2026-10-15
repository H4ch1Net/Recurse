import { describe, expect, it } from 'vitest'
import { POOL, QUIZ, TERMS, checkQuiz, clearTranslations, configFor, initialNat, poolUsage, sendFlow } from './nat-table'

const run = (mode, hosts) => {
  let state = initialNat(mode)
  const results = []
  for (const h of hosts) {
    const out = sendFlow(state, h)
    state = out.state
    results.push(out.result)
  }
  return { state, results }
}

describe('static NAT', () => {
  it('shows the configured entries before any traffic', () => {
    const s = initialNat('static')
    expect(s.rows).toHaveLength(3)
    expect(s.rows[0]).toMatchObject({ pro: '---', insideGlobal: '203.0.113.10', insideLocal: '192.168.1.10', outsideLocal: '---', outsideGlobal: '---' })
  })
  it('translates one to one without adding rows', () => {
    const { state, results } = run('static', ['pc1', 'pc1', 'pc2'])
    expect(state.rows).toHaveLength(3)
    expect(results[0].kind).toBe('static')
    expect(results[0].after.src).toBe('203.0.113.10:49152')
    expect(results[1].after.src).toBe('203.0.113.10:49153')
    expect(results[2].after.src).toBe('203.0.113.11:49152')
    expect(state.hits).toBe(3)
  })
  it('a host without a static entry leaves untranslated', () => {
    const { results } = run('static', ['pc4'])
    expect(results[0].kind).toBe('untranslated')
    expect(results[0].after.src).toBe('192.168.1.13:51007')
  })
  it('clearing keeps static entries', () => {
    expect(clearTranslations(initialNat('static')).rows).toHaveLength(3)
  })
})

describe('dynamic NAT', () => {
  it('starts empty and allocates pool addresses in order', () => {
    const { state, results } = run('dynamic', ['pc1', 'pc2', 'pc3'])
    expect(initialNat('dynamic').rows).toHaveLength(0)
    expect(results.map((r) => r.kind)).toEqual(['dynamic-new', 'dynamic-new', 'dynamic-new'])
    expect(state.rows.map((r) => r.insideGlobal)).toEqual(POOL.addresses)
    expect(state.rows.every((r) => r.pro === '---')).toBe(true)
  })
  it('reuses a host’s address for its next flow', () => {
    const { state, results } = run('dynamic', ['pc1', 'pc1'])
    expect(results[1].kind).toBe('dynamic-reuse')
    expect(results[1].after.src).toBe('203.0.113.20:49153')
    expect(state.rows).toHaveLength(1)
  })
  it('the fourth host finds the pool exhausted', () => {
    const { state, results } = run('dynamic', ['pc1', 'pc2', 'pc3', 'pc4'])
    expect(results[3].kind).toBe('exhausted')
    expect(results[3].after).toBeNull()
    expect(state.misses).toBe(1)
    expect(state.rows).toHaveLength(3)
    expect(poolUsage(state).every((p) => p.used)).toBe(true)
  })
  it('clearing frees the pool', () => {
    const { state } = run('dynamic', ['pc1', 'pc2', 'pc3'])
    const cleared = clearTranslations(state)
    expect(cleared.rows).toHaveLength(0)
    expect(sendFlow(cleared, 'pc4').result.kind).toBe('dynamic-new')
  })
})

describe('PAT', () => {
  it('shares one address and keeps free source ports', () => {
    const { state, results } = run('pat', ['pc1', 'pc3'])
    expect(results[0].after.src).toBe('203.0.113.1:49152')
    expect(results[1].after.src).toBe('203.0.113.1:50310')
    expect(state.rows.every((r) => r.pro === 'tcp')).toBe(true)
    expect(state.rows[0]).toMatchObject({ insideLocal: '192.168.1.10:49152', outsideLocal: '198.51.100.80:80', outsideGlobal: '198.51.100.80:80' })
  })
  it('picks another port when two hosts use the same one', () => {
    const { state, results } = run('pat', ['pc1', 'pc2'])
    expect(results[1].portChanged).toBe(true)
    expect(results[1].after.src).toBe('203.0.113.1:49153')
    const globals = state.rows.map((r) => r.insideGlobal)
    expect(new Set(globals).size).toBe(globals.length)
  })
  it('never hands out a duplicate inside global across many flows', () => {
    const { state } = run('pat', ['pc1', 'pc2', 'pc1', 'pc2', 'pc3', 'pc4', 'pc1', 'pc2'])
    const globals = state.rows.map((r) => r.insideGlobal)
    expect(new Set(globals).size).toBe(8)
    expect(globals.every((g) => g.startsWith('203.0.113.1:'))).toBe(true)
  })
  it('never runs out the way a pool does', () => {
    const { results } = run('pat', ['pc1', 'pc2', 'pc3', 'pc4'])
    expect(results.every((r) => r.kind === 'pat')).toBe(true)
  })
})

describe('configuration', () => {
  it('marks inside and outside interfaces in every mode', () => {
    for (const mode of ['static', 'dynamic', 'pat']) {
      const lines = configFor(mode)
      expect(lines).toContain(' ip nat inside')
      expect(lines).toContain(' ip nat outside')
    }
  })
  it('uses the right command for each mode', () => {
    expect(configFor('static')).toContain('ip nat inside source static 192.168.1.10 203.0.113.10')
    expect(configFor('dynamic')).toContain('ip nat pool PUBLIC 203.0.113.20 203.0.113.22 netmask 255.255.255.0')
    expect(configFor('dynamic')).toContain('ip nat inside source list 1 pool PUBLIC')
    expect(configFor('pat')).toContain('ip nat inside source list 1 interface GigabitEthernet0/1 overload')
  })
})

describe('quiz', () => {
  it('has one question per term, and grades it', () => {
    expect(new Set(QUIZ.map((q) => q.answer)).size).toBe(4)
    for (const q of QUIZ) {
      expect(checkQuiz(q.id, q.answer).correct).toBe(true)
      const wrong = Object.keys(TERMS).find((k) => k !== q.answer)
      const graded = checkQuiz(q.id, wrong)
      expect(graded.correct).toBe(false)
      expect(graded.why).toMatch(/as seen from the/)
    }
  })
  it('has no em dashes', () => {
    const text = [...QUIZ.map((q) => q.prompt + q.why), ...Object.values(TERMS).map((t) => t.short)].join(' ')
    expect(text).not.toMatch(/—/)
  })
})
