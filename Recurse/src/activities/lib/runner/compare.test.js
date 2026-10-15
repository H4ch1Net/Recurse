import { describe, expect, it } from 'vitest'
import { canonicalKey, compareValues } from './compare.js'
import { diffStrings, formatArgs, formatValue } from './format.js'

describe('compareValues', () => {
  it('exact compares deeply', () => {
    expect(compareValues([1, [2, { a: 3 }]], [1, [2, { a: 3 }]])).toBe(true)
    expect(compareValues([1, 2], [2, 1])).toBe(false)
    expect(compareValues({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(compareValues('1', 1)).toBe(false)
    expect(compareValues(true, 1)).toBe(false)
    expect(compareValues([1, 2], [1, 2, 3])).toBe(false)
  })

  it('keeps null and undefined apart, and treats NaN as equal to NaN', () => {
    expect(compareValues(undefined, null)).toBe(false)
    expect(compareValues(null, null)).toBe(true)
    expect(compareValues(NaN, NaN)).toBe(true)
    expect(compareValues(0, -0)).toBe(true)
  })

  it('ignores object keys whose value is undefined, like JSON does', () => {
    expect(compareValues({ a: 1, b: undefined }, { a: 1 })).toBe(true)
  })

  it('unordered ignores outer order only', () => {
    expect(compareValues([3, 1, 2], [1, 2, 3], 'unordered')).toBe(true)
    expect(compareValues([1, 1, 2], [1, 2, 2], 'unordered')).toBe(false)
    expect(compareValues([[1, 2], [3]], [[3], [1, 2]], 'unordered')).toBe(true)
    expect(compareValues([[2, 1], [3]], [[3], [1, 2]], 'unordered')).toBe(false)
  })

  it('unordered-deep ignores order at the outer and inner levels', () => {
    const groups = [['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']]
    expect(compareValues([['bat'], ['nat', 'tan'], ['ate', 'eat', 'tea']], groups, 'unordered-deep')).toBe(true)
    expect(compareValues([['bat'], ['nat', 'tan']], groups, 'unordered-deep')).toBe(false)
  })

  it('float allows tiny differences', () => {
    expect(compareValues(0.1 + 0.2, 0.3, 'float')).toBe(true)
    expect(compareValues([1.0000001, 2], [1, 2], 'float')).toBe(true)
    expect(compareValues(1.01, 1, 'float')).toBe(false)
    expect(compareValues(0.1 + 0.2, 0.3)).toBe(false)
  })

  it('canonical keys distinguish types', () => {
    expect(canonicalKey('1')).not.toBe(canonicalKey(1))
    expect(canonicalKey({ b: 1, a: 2 })).toBe(canonicalKey({ a: 2, b: 1 }))
  })
})

describe('formatValue', () => {
  it('formats JavaScript values', () => {
    expect(formatValue([1, 'a', null, true])).toBe('[1, "a", null, true]')
    expect(formatValue({ a: 1, 'b-c': [2] })).toBe('{ a: 1, "b-c": [2] }')
    expect(formatValue(undefined)).toBe('undefined')
    expect(formatValue('hi', { quoteStrings: false })).toBe('hi')
    expect(formatValue(new Map([['x', 1]]))).toBe('Map(1) { "x" => 1 }')
    expect(formatValue(new Set([1, 2]))).toBe('Set(2) { 1, 2 }')
  })

  it('formats Python style', () => {
    expect(formatValue([null, true, false, 'it'], { language: 'python' })).toBe("[None, True, False, 'it']")
    expect(formatValue({ a: 1 }, { language: 'python' })).toBe("{'a': 1}")
    expect(formatValue("don't", { language: 'python' })).toBe('"don\'t"')
  })

  it('survives cycles and long arrays', () => {
    const a = [1]
    a.push(a)
    expect(formatValue(a)).toBe('[1, [Circular]]')
    expect(formatValue(Array.from({ length: 105 }, (_, i) => i))).toMatch(/\.\.\. 5 more\]$/)
  })

  it('shows linked lists and trees compactly', () => {
    class ListNode {
      constructor(val, next = null) {
        this.val = val
        this.next = next
      }
    }
    expect(formatValue(new ListNode(1, new ListNode(2)))).toBe('ListNode(1 -> 2)')
  })

  it('formats arguments with parameter names', () => {
    expect(formatArgs(['nums', 'target'], [[2, 7], 9])).toBe('nums = [2, 7], target = 9')
  })
})

describe('diffStrings', () => {
  it('finds the differing middle', () => {
    expect(diffStrings('[1, 2, 3]', '[1, 5, 3]')).toEqual({ prefix: '[1, ', a: '2', b: '5', suffix: ', 3]' })
    expect(diffStrings('abc', 'abc')).toEqual({ prefix: 'abc', a: '', b: '', suffix: '' })
    expect(diffStrings('[1]', '[1, 2]')).toEqual({ prefix: '[1', a: '', b: ', 2', suffix: ']' })
  })
})
