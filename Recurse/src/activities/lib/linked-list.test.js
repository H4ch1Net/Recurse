import { describe, expect, it } from 'vitest'
import { applyLine, deleteNode, expectedLine, fromValues, insertAfter, insertHead, insertTail, reversalLength, startReversal, toArray, values } from './linked-list'

function reverseAll(list) {
  let rev = startReversal(list)
  const lines = []
  while (expectedLine(rev)) {
    const line = expectedLine(rev)
    lines.push(line)
    const r = applyLine(rev, line)
    expect(r.ok).toBe(true)
    rev = r.rev
  }
  return { rev, lines }
}

describe('linked-list', () => {
  it('builds from values and walks from the head', () => {
    const list = fromValues([3, 7, 1])
    expect(values(list)).toEqual([3, 7, 1])
    expect(toArray(list)[2].next).toBe(null)
  })

  it('inserts at the head, the tail and after a node', () => {
    let list = fromValues([3, 7])
    let r = insertHead(list, 9)
    expect(values(r.list)).toEqual([9, 3, 7])
    expect(r.walked).toEqual([])
    r = insertTail(r.list, 5)
    expect(values(r.list)).toEqual([9, 3, 7, 5])
    expect(r.walked).toHaveLength(3)
    list = r.list
    const three = toArray(list)[1].id
    r = insertAfter(list, three, 4)
    expect(values(r.list)).toEqual([9, 3, 4, 7, 5])
    expect(insertTail(fromValues([]), 1).list.head).toBeTruthy()
  })

  it('deletes the head, a middle node and the tail', () => {
    const list = fromValues([1, 2, 3, 4])
    const [a, b, , d] = toArray(list).map((n) => n.id)
    expect(values(deleteNode(list, a).list)).toEqual([2, 3, 4])
    expect(values(deleteNode(list, b).list)).toEqual([1, 3, 4])
    expect(values(deleteNode(list, d).list)).toEqual([1, 2, 3])
    expect(values(deleteNode(list, 'nope').list)).toEqual([1, 2, 3, 4])
  })

  it('reverses with the classic pointer dance', () => {
    const { rev, lines } = reverseAll(fromValues([1, 2, 3]))
    expect(values(rev.list)).toEqual([3, 2, 1])
    expect(lines).toHaveLength(reversalLength(3))
    expect(lines.slice(0, 6)).toEqual(['init', 'save', 'repoint', 'prev', 'curr', 'save'])
    expect(lines[lines.length - 1]).toBe('head')
  })

  it('reverses empty and single-node lists', () => {
    expect(reverseAll(fromValues([])).lines).toEqual(['init', 'head'])
    expect(values(reverseAll(fromValues([8])).rev.list)).toEqual([8])
  })

  it('rejects lines out of order with a hint', () => {
    let rev = startReversal(fromValues([1, 2]))
    rev = applyLine(rev, 'init').rev
    const wrong = applyLine(rev, 'repoint')
    expect(wrong.ok).toBe(false)
    expect(wrong.rev).toBe(rev)
    expect(wrong.caption).toMatch(/save/i)
    rev = applyLine(rev, 'save').rev
    rev = applyLine(rev, 'repoint').rev
    expect(applyLine(rev, 'curr').ok).toBe(false)
  })
})
