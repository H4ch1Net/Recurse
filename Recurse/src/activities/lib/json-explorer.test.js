import { describe, expect, it } from 'vitest'
import { parseJson, formatPath, pythonPath, getNode, preview, answerMatches, SAMPLE_JSON, SAMPLE_QUIZ, generateQuiz, gradeQuestion, errorExcerpt, allNodes } from './json-explorer.js'

describe('parseJson', () => {
  it('parses into a tree that keeps key order', () => {
    const r = parseJson('{"b": 1, "a": [true, null, "x"], "10": {}, "2": 2.5e1}')
    expect(r.ok).toBe(true)
    expect(r.root.children.map((c) => c.key)).toEqual(['b', 'a', '10', '2'])
    expect(r.root.children[1].children.map((c) => c.type)).toEqual(['boolean', 'null', 'string'])
    expect(r.root.children[3]).toMatchObject({ type: 'number', value: 25, raw: '2.5e1' })
    expect(r.value).toEqual({ b: 1, a: [true, null, 'x'], 10: {}, 2: 25 })
  })
  it('handles escapes', () => {
    expect(parseJson('"a\\n\\u0041\\"b"').value).toBe('a\nA"b')
  })
  it('reports friendly errors with line and column', () => {
    const cases = [
      ['{"a": 1,}', /Trailing commas/, 1, 9],
      ["{'a': 1}", /double quotes/, 1, 2],
      ['{a: 1}', /Property names must be in double quotes/, 1, 2],
      ['{"a": True}', /lowercase true/, 1, 7],
      ['{"a": 1 "b": 2}', /comma between/, 1, 9],
      ['[1, 2', /ends inside an array/, 1, 6],
      ['{\n  "a": 07\n}', /leading zeros/, 2, 8],
      ['{"a": 1} x', /extra text/, 1, 10],
      ['// hi\n{}', /Comments/, 1, 1],
      ['{"a": undefined}', /not a JSON value/, 1, 7],
      ['"abc', /closing quote/, 1, 1]
    ]
    for (const [text, message, line, column] of cases) {
      const r = parseJson(text)
      expect(r.ok, text).toBe(false)
      expect(r.error.message, text).toMatch(message)
      expect([r.error.line, r.error.column], text).toEqual([line, column])
    }
    expect(parseJson('   ').error.empty).toBe(true)
  })
  it('builds an excerpt with a caret', () => {
    const text = '{\n  "a": 07\n}'
    expect(errorExcerpt(text, parseJson(text).error)).toEqual({ line: '  "a": 07', caret: '       ^' })
  })
})

describe('paths and values', () => {
  const { root } = parseJson(SAMPLE_JSON)
  it('formats dot, bracket and Python paths', () => {
    expect(formatPath(['interfaces', 1, 'ipv4', 'address'])).toBe('response.interfaces[1].ipv4.address')
    expect(formatPath(['content-type', 0], 'data')).toBe('data["content-type"][0]')
    expect(pythonPath(['interfaces', 1, 'name'])).toBe('data["interfaces"][1]["name"]')
  })
  it('finds nodes and previews them', () => {
    expect(getNode(root, ['interfaces', 1, 'ipv4', 'address']).value).toBe('192.168.10.1')
    expect(getNode(root, ['interfaces', 9])).toBeNull()
    expect(preview(getNode(root, ['interfaces']))).toBe('[…] 3 items')
    expect(preview(getNode(root, ['device']))).toBe('{…} 5 keys')
    expect(preview(getNode(root, ['device', 'hostname']))).toBe('"edge-rtr-01"')
  })
  it('accepts answers with or without quotes', () => {
    const host = getNode(root, ['device', 'hostname'])
    expect(answerMatches(host, 'edge-rtr-01')).toBe(true)
    expect(answerMatches(host, '"edge-rtr-01"')).toBe(true)
    expect(answerMatches(host, 'Edge-rtr-01')).toBe(false)
    expect(answerMatches(getNode(root, ['device', 'uptimeSeconds']), ' 864210 ')).toBe(true)
    expect(answerMatches(getNode(root, ['device', 'managed']), 'TRUE')).toBe(true)
    expect(answerMatches(getNode(root, ['lastConfigChange']), 'null')).toBe(true)
  })
})

describe('quiz', () => {
  const { root } = parseJson(SAMPLE_JSON)
  it('grades the sample questions', () => {
    const [value, click, type, choice, index] = SAMPLE_QUIZ
    expect(gradeQuestion(root, value, '192.168.10.1').correct).toBe(true)
    expect(gradeQuestion(root, value, '203.0.113.2').correct).toBe(false)
    expect(gradeQuestion(root, click, ['interfaces', 1, 'name']).correct).toBe(true)
    expect(gradeQuestion(root, click, ['interfaces', 0, 'name']).correct).toBe(false)
    expect(gradeQuestion(root, type, 'null').correct).toBe(true)
    expect(gradeQuestion(root, type, 'object')).toEqual({ correct: false, expected: 'null' })
    expect(gradeQuestion(root, choice, 'response.device.hostname').correct).toBe(true)
    expect(gradeQuestion(root, index, '30').correct).toBe(true)
  })
  it('every sample question points at a real node', () => {
    for (const q of SAMPLE_QUIZ) expect(getNode(root, q.path), q.prompt).toBeTruthy()
  })
  it('generates five varied questions for any document, deterministically', () => {
    const doc = parseJson('{"users": [{"name": "Ana", "age": 31, "tags": ["admin", "ops"]}, {"name": "Bo", "age": 27, "tags": []}], "total": 2}').root
    const a = generateQuiz(doc, { seed: 7 })
    const b = generateQuiz(doc, { seed: 7 })
    expect(a).toEqual(b)
    expect(a).toHaveLength(5)
    expect(new Set(a.map((q) => q.kind)).size).toBeGreaterThanOrEqual(4)
    for (const q of a) {
      expect(getNode(doc, q.path)).toBeTruthy()
      if (q.kind === 'choice') {
        expect(q.choices).toContain(q.answer)
        expect(new Set(q.choices).size).toBe(q.choices.length)
      }
    }
  })
  it('copes with tiny documents', () => {
    expect(generateQuiz(parseJson('42').root)).toEqual([])
    expect(generateQuiz(parseJson('{"a": 1}').root).length).toBeGreaterThan(0)
    expect(allNodes(parseJson('[1,[2]]').root)).toHaveLength(4)
  })
})
