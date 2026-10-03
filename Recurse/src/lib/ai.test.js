import { afterEach, describe, expect, it, vi } from 'vitest'
import { callAI, extractJSON, generatePack, gradeExplanation, isAIConfigured } from './ai'

const reply = (body, status = 200) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }))

afterEach(() => vi.unstubAllGlobals())

describe('callAI', () => {
  it('requires a key', async () => {
    expect(isAIConfigured({ provider: 'anthropic', apiKey: '' })).toBe(false)
    await expect(callAI({ provider: 'anthropic', apiKey: '' }, 's', 'u')).rejects.toThrow(/API key/)
  })

  it('sends the Anthropic Messages shape and joins text blocks', async () => {
    const fetch = reply({ content: [{ type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }] })
    vi.stubGlobal('fetch', fetch)
    const text = await callAI({ provider: 'anthropic', apiKey: 'k', model: '' }, 'system', 'user')
    expect(text).toBe('Hello')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('k')
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ model: 'claude-haiku-4-5', system: 'system', messages: [{ role: 'user', content: 'user' }] })
  })

  it('sends the chat completions shape for OpenAI-compatible providers', async () => {
    const fetch = reply({ choices: [{ message: { content: 'ok' } }] })
    vi.stubGlobal('fetch', fetch)
    await callAI({ provider: 'openrouter', apiKey: 'k', model: 'some/model' }, 's', 'u')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers.authorization).toBe('Bearer k')
    expect(JSON.parse(init.body).messages[0]).toEqual({ role: 'system', content: 's' })
  })

  it('turns HTTP errors into readable messages', async () => {
    vi.stubGlobal('fetch', reply({ error: { message: 'invalid x-api-key' } }, 401))
    await expect(callAI({ provider: 'anthropic', apiKey: 'bad' }, 's', 'u')).rejects.toThrow(/rejected the API key/)
    vi.stubGlobal('fetch', reply({ error: { message: 'model not found' } }, 404))
    await expect(callAI({ provider: 'openai', apiKey: 'k' }, 's', 'u')).rejects.toThrow(/model not found/)
  })

  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(callAI({ provider: 'openai', apiKey: 'k' }, 's', 'u')).rejects.toThrow(/Could not reach/)
  })
})

describe('extractJSON', () => {
  it('reads JSON from plain replies, code fences and surrounding prose', () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 })
    expect(extractJSON('Here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 })
    expect(extractJSON('Sure! {"a":3} Hope that helps.')).toEqual({ a: 3 })
    expect(() => extractJSON('no json here')).toThrow()
  })
})

describe('features', () => {
  it('normalizes explanation feedback', async () => {
    vi.stubGlobal('fetch', reply({ content: [{ type: 'text', text: '{"score": 140, "strengths": "Clear", "gaps": "Edge cases", "misconceptions": "None", "modelExplanation": "..." }' }] }))
    const result = await gradeExplanation({ provider: 'anthropic', apiKey: 'k' }, { topic: 'T', prompt: 'P', text: 'x' })
    expect(result.score).toBe(100)
    expect(result.misconceptions).toBe('')
  })

  it('sanitizes generated packs', async () => {
    const pack = { id: 'Photosynthesis Basics', name: 'Photosynthesis', subject: 'science', questions: [{ type: 'mcq', question: 'Where?', choices: ['Chloroplast', 'Nucleus'], answer: 0 }] }
    vi.stubGlobal('fetch', reply({ content: [{ type: 'text', text: JSON.stringify(pack) }] }))
    const result = await generatePack({ provider: 'anthropic', apiKey: 'k' }, { topic: 'photosynthesis' })
    expect(result.id).toBe('photosynthesis-basics')
    expect(result.community).toBe(true)
    expect(result.author).toBe('AI generated')
  })
})
