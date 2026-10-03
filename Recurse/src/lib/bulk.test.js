import { describe, expect, it } from 'vitest'
import { parseBulk } from './bulk'

describe('parseBulk', () => {
  it('reads tab, pipe and semicolon separated lines and skips the rest', () => {
    const rows = parseBulk('el perro\tthe dog\nla casa | the house\nhola ; hello\nno separator here\n\n')
    expect(rows).toEqual([
      { question: 'el perro', answer: 'the dog' },
      { question: 'la casa', answer: 'the house' },
      { question: 'hola', answer: 'hello' }
    ])
  })
})
