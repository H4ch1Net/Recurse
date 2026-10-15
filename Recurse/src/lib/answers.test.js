import { describe, expect, it } from 'vitest'
import { answerText, checkCli, checkMatch, checkMulti, checkOrder, checkTyped, normalizeAnswer, parseNumber } from './answers'

describe('normalizeAnswer', () => {
  it('ignores case, outer whitespace, quotes and trailing punctuation', () => {
    expect(normalizeAnswer('  "Hello   World." ')).toBe('hello world')
    expect(normalizeAnswer('¿Cómo estás?')).toBe('cómo estás')
  })
})

describe('parseNumber', () => {
  it('parses integers, decimals, fractions, separators and percents', () => {
    expect(parseNumber('42')).toBe(42)
    expect(parseNumber('.5')).toBe(0.5)
    expect(parseNumber('1/4')).toBe(0.25)
    expect(parseNumber('10,000')).toBe(10000)
    expect(parseNumber('25%')).toBe(25)
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('1/0')).toBeNull()
  })
})

describe('checkTyped', () => {
  const q = { answer: 'Canberra', accept: ['canberra, australia'] }

  it('accepts the answer and listed alternatives', () => {
    expect(checkTyped('canberra', q).correct).toBe(true)
    expect(checkTyped('Canberra, Australia', q).correct).toBe(true)
    expect(checkTyped('Sydney', q).correct).toBe(false)
  })

  it('rejects empty input', () => {
    expect(checkTyped('   ', q).correct).toBe(false)
  })

  it('compares numbers numerically', () => {
    expect(checkTyped('0.50', { answer: '0.5' }).correct).toBe(true)
    expect(checkTyped('2', { answer: '2.0' }).correct).toBe(true)
    expect(checkTyped('3', { answer: '0.5' }).correct).toBe(false)
  })

  it('treats accent-only differences as a near miss that still counts', () => {
    const result = checkTyped('como estas', { answer: 'cómo estás' })
    expect(result.correct).toBe(true)
    expect(result.nearMiss).toBe(true)
  })
})

describe('checkCli', () => {
  const ios = { answer: 'show ip interface brief', shell: 'ios' }
  it('accepts IOS abbreviations and the do prefix', () => {
    expect(checkCli('sh ip int br', ios).correct).toBe(true)
    expect(checkCli('show ip interface brief', ios).correct).toBe(true)
    expect(checkCli('do sh ip int b', ios).correct).toBe(true)
    expect(checkCli('sh ip route', ios).correct).toBe(false)
    expect(checkCli('s ip int br', ios).correct).toBe(false)
  })
  it('normalizes interface names but keeps arguments exact', () => {
    const q = { answer: 'interface GigabitEthernet0/1', shell: 'ios' }
    expect(checkCli('int gi0/1', q).correct).toBe(true)
    expect(checkCli('int g0/1', q).correct).toBe(true)
    expect(checkCli('interface gig 0/1', q).correct).toBe(true)
    expect(checkCli('int gi0/2', q).correct).toBe(false)
    const vlan = { answer: 'switchport access vlan 10', shell: 'ios' }
    expect(checkCli('sw acc vl 10', vlan).correct).toBe(true)
    expect(checkCli('switchport access vlan 20', vlan).correct).toBe(false)
    const ip = { answer: 'ip address 192.168.1.1 255.255.255.0', shell: 'ios' }
    expect(checkCli('ip add 192.168.1.1 255.255.255.0', ip).correct).toBe(true)
    expect(checkCli('ip add 192.168.1.2 255.255.255.0', ip).correct).toBe(false)
  })
  it('matches other shells exactly, apart from spacing and quote style', () => {
    const git = { answer: 'git commit -m "Add tests"', shell: 'git' }
    expect(checkCli("git   commit -m 'Add tests'", git).correct).toBe(true)
    expect(checkCli('git com -m "Add tests"', git).correct).toBe(false)
    const ls = { answer: 'ls -R', shell: 'bash' }
    expect(checkCli('ls -r', ls).correct).toBe(false)
    const sql = { answer: 'SELECT name FROM users WHERE id = 1;', shell: 'sql' }
    expect(checkCli('select name from users where id=1', sql).correct).toBe(true)
  })
})

describe('interactive types', () => {
  it('grades select-all by exact set', () => {
    const q = { choices: ['a', 'b', 'c', 'd'], answers: [0, 2] }
    expect(checkMulti([2, 0], q).correct).toBe(true)
    expect(checkMulti([0], q)).toMatchObject({ correct: false, missed: [2] })
    expect(checkMulti([0, 1, 2], q)).toMatchObject({ correct: false, extra: [1] })
  })
  it('grades order and match', () => {
    const order = { items: ['one', 'two', 'three'] }
    expect(checkOrder([0, 1, 2], order).correct).toBe(true)
    expect(checkOrder([1, 0, 2], order).rightPositions).toEqual([false, false, true])
    const match = { pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }] }
    expect(checkMatch({ 0: 0, 1: 1, 2: 2 }, match).correct).toBe(true)
    expect(checkMatch({ 0: 1, 1: 0, 2: 2 }, match).results).toEqual([false, false, true])
  })
  it('describes any answer as text', () => {
    expect(answerText({ type: 'order', items: ['a', 'b'] })).toBe('a → b')
    expect(answerText({ type: 'mcq', choices: ['x', 'y'], answer: 1 })).toBe('y')
  })
})
