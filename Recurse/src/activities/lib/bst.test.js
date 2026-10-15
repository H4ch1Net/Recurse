import { describe, expect, it } from 'vitest'
import { balancedOrder, compareSequences, contains, fromValues, height, inOrder, insert, isBalanced, layout, minHeight, parseSequence, postOrder, preOrder, search, size } from './bst'

const TREE = [50, 30, 70, 20, 40, 60, 85, 35]

describe('bst', () => {
  it('inserts and reports the path taken', () => {
    let root = fromValues([50, 30, 70])
    const r = insert(root, 40)
    expect(r.path).toEqual([50, 30])
    expect(r.duplicate).toBe(false)
    root = r.root
    expect(contains(root, 40)).toBe(true)
    const dup = insert(root, 30)
    expect(dup.duplicate).toBe(true)
    expect(dup.root).toBe(root)
    expect(size(root)).toBe(4)
  })

  it('searches with left and right moves', () => {
    const root = fromValues(TREE)
    const hit = search(root, 35)
    expect(hit.found).toBe(true)
    expect(hit.path).toEqual([50, 30, 40, 35])
    expect(hit.steps.map((s) => s.dir)).toEqual(['left', 'right', 'left', 'found'])
    const miss = search(root, 65)
    expect(miss.found).toBe(false)
    expect(miss.steps[miss.steps.length - 1]).toMatchObject({ value: 60, dir: 'missing', side: 'right' })
  })

  it('traverses in, pre and post order', () => {
    const root = fromValues(TREE)
    expect(inOrder(root)).toEqual([20, 30, 35, 40, 50, 60, 70, 85])
    expect(preOrder(root)).toEqual([50, 30, 20, 40, 35, 70, 60, 85])
    expect(postOrder(root)).toEqual([20, 35, 40, 30, 60, 85, 70, 50])
  })

  it('measures height and balance, and degenerates on sorted input', () => {
    expect(height(null)).toBe(0)
    expect(height(fromValues(TREE))).toBe(4)
    expect(isBalanced(fromValues(TREE))).toBe(true)
    const chain = fromValues([1, 2, 3, 4, 5, 6, 7])
    expect(height(chain)).toBe(7)
    expect(isBalanced(chain)).toBe(false)
    const bal = fromValues(balancedOrder([1, 2, 3, 4, 5, 6, 7]))
    expect(height(bal)).toBe(3)
    expect(minHeight(7)).toBe(3)
    expect(isBalanced(bal)).toBe(true)
  })

  it('lays nodes out by in-order rank and depth', () => {
    const { nodes, columns, levels } = layout(fromValues([2, 1, 3]))
    expect(columns).toBe(3)
    expect(levels).toBe(2)
    expect(nodes).toEqual([
      { value: 1, rank: 0, depth: 1, parent: 2 },
      { value: 2, rank: 1, depth: 0, parent: null },
      { value: 3, rank: 2, depth: 1, parent: 2 }
    ])
  })

  it('parses and compares guessed sequences', () => {
    expect(parseSequence('20, 30 35;40')).toEqual([20, 30, 35, 40])
    expect(parseSequence('-5 3')).toEqual([-5, 3])
    expect(compareSequences([1, 2, 3], [1, 2, 3]).correct).toBe(true)
    expect(compareSequences([1, 3, 2], [1, 2, 3]).firstWrong).toBe(1)
    expect(compareSequences([1, 2], [1, 2, 3]).firstWrong).toBe(2)
  })
})
