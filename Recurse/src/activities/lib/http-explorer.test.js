import { describe, expect, it } from 'vitest'
import { createServer, handleRequest, formatRequest, formatResponseHead, splitUrl, headerMap, statusClass, SCENARIOS, DEMO_USER } from './http-explorer.js'
import { gradeTasks } from './terminal/parse.js'

const JSON_H = [{ name: 'Content-Type', value: 'application/json' }]
const NOW = Date.UTC(2026, 9, 14, 9, 0)

function send(server, method, path, { headers = [], body = '' } = {}) {
  return handleRequest(server, { method, path, headers, body })
}
const header = (res, name) => res.headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]

describe('request helpers', () => {
  it('splits urls and queries', () => {
    expect(splitUrl('https://api.example.test/api/tasks?done=true')).toEqual({ path: '/api/tasks', query: { done: 'true' }, target: '/api/tasks?done=true' })
    expect(splitUrl('api/tasks/').path).toBe('/api/tasks')
  })
  it('lowercases header names and skips blank rows', () => {
    expect(headerMap([{ name: 'Content-Type', value: ' application/json ' }, { name: '', value: 'x' }])).toEqual({ 'content-type': 'application/json' })
  })
  it('formats the raw request with Host and Content-Length', () => {
    const raw = formatRequest({ method: 'post', path: '/api/tasks', headers: JSON_H, body: '{"title":"Hi"}' })
    expect(raw).toBe('POST /api/tasks HTTP/1.1\nHost: api.example.test\nContent-Type: application/json\nContent-Length: 14\n\n{"title":"Hi"}')
    expect(formatRequest({ method: 'GET', path: '/api/tasks', headers: [], body: 'ignored' })).toBe('GET /api/tasks HTTP/1.1\nHost: api.example.test\n')
  })
  it('classifies status codes', () => {
    expect(statusClass(204).id).toBe('2xx')
    expect(statusClass(301).label).toBe('Redirect')
    expect(statusClass(404).label).toBe('Client error')
    expect(statusClass(500).id).toBe('5xx')
  })
})

describe('tasks resource', () => {
  it('lists tasks with JSON headers', () => {
    const { response } = send(createServer({ now: NOW }), 'GET', '/api/tasks')
    expect(response.status).toBe(200)
    expect(response.json).toHaveLength(3)
    expect(header(response, 'Content-Type')).toBe('application/json; charset=utf-8')
    expect(formatResponseHead(response)).toMatch(/^HTTP\/1\.1 200 OK\nDate: /)
    expect(send(createServer(), 'GET', '/api/tasks?done=true').response.json).toHaveLength(1)
  })
  it('creates, fetches, updates and deletes', () => {
    let s = createServer({ now: NOW })
    let r = send(s, 'POST', '/api/tasks', { headers: JSON_H, body: '{"title": "Write tests"}' })
    expect(r.response.status).toBe(201)
    expect(r.response.json).toEqual({ id: 4, title: 'Write tests', done: false })
    expect(header(r.response, 'Location')).toBe('/api/tasks/4')
    s = r.server
    r = send(s, 'GET', '/api/tasks/4')
    expect(r.response.json.title).toBe('Write tests')
    r = send(r.server, 'PATCH', '/api/tasks/4', { headers: JSON_H, body: '{"done": true}' })
    expect(r.response.json).toEqual({ id: 4, title: 'Write tests', done: true })
    r = send(r.server, 'PUT', '/api/tasks/4', { headers: JSON_H, body: '{"title": "Renamed"}' })
    expect(r.response.json).toEqual({ id: 4, title: 'Renamed', done: false })
    r = send(r.server, 'DELETE', '/api/tasks/4')
    expect(r.response.status).toBe(204)
    expect(r.response.body).toBe('')
    expect(send(r.server, 'GET', '/api/tasks/4').response.status).toBe(404)
  })
  it('never mutates the previous server', () => {
    const s = createServer()
    send(s, 'DELETE', '/api/tasks/1')
    expect(s.tasks).toHaveLength(3)
    expect(s.log).toHaveLength(0)
  })
  it('validates bodies', () => {
    const s = createServer()
    expect(send(s, 'POST', '/api/tasks', { body: '{"title":"x"}' }).response.status).toBe(415)
    expect(send(s, 'POST', '/api/tasks', { headers: [{ name: 'Content-Type', value: 'text/plain' }], body: 'hi' }).response.json.detail).toMatch(/text\/plain/)
    const bad = send(s, 'POST', '/api/tasks', { headers: JSON_H, body: '{"title": "x",}' })
    expect(bad.response.status).toBe(400)
    expect(bad.response.json.detail).toMatch(/^Line 1, column 15: Trailing commas/)
    const missing = send(s, 'POST', '/api/tasks', { headers: JSON_H, body: '{"done": "yes"}' })
    expect(missing.response.json.details).toEqual(['title is required and must be a non-empty string', 'done must be true or false (no quotes)'])
    expect(send(s, 'POST', '/api/tasks', { headers: JSON_H, body: '' }).response.json.detail).toMatch(/empty/)
    expect(send(s, 'POST', '/api/tasks', { headers: JSON_H, body: '[1]' }).response.json.detail).toMatch(/an array/)
    expect(send(s, 'PATCH', '/api/tasks/1', { headers: JSON_H, body: '{}' }).response.json.details).toContain('send at least one of title or done')
    expect(send(s, 'GET', '/api/tasks/abc').response.status).toBe(400)
  })
  it('rejects methods a path does not allow, with an Allow header', () => {
    const r = send(createServer(), 'DELETE', '/api/tasks')
    expect(r.response.status).toBe(405)
    expect(header(r.response, 'Allow')).toBe('GET, POST')
    const opt = send(createServer(), 'OPTIONS', '/api/tasks/1')
    expect(opt.response.status).toBe(204)
    expect(header(opt.response, 'Allow')).toBe('GET, PUT, PATCH, DELETE, OPTIONS')
  })
  it('redirects old paths and reports unknown ones', () => {
    const r = send(createServer(), 'GET', '/api/v1/tasks')
    expect(r.response.status).toBe(301)
    expect(header(r.response, 'Location')).toBe('/api/tasks')
    expect(send(createServer(), 'GET', '/api/nothing').response.status).toBe(404)
    expect(send(createServer(), 'GET', '/api/crash').response.status).toBe(500)
  })
})

describe('auth', () => {
  const login = (s) => send(s, 'POST', '/api/login', { headers: JSON_H, body: JSON.stringify({ username: DEMO_USER.username, password: DEMO_USER.password }) })
  it('returns 401 with WWW-Authenticate when no token is sent', () => {
    const r = send(createServer(), 'GET', '/api/me')
    expect(r.response.status).toBe(401)
    expect(header(r.response, 'WWW-Authenticate')).toBe('Bearer realm="api"')
    expect(r.entry.auth).toBe('none')
  })
  it('logs in and accepts the bearer token', () => {
    const l = login(createServer({ now: NOW }))
    expect(l.response.status).toBe(200)
    const token = l.response.json.token
    expect(token).toMatch(/^rk_[a-z0-9]{32}$/)
    const me = send(l.server, 'GET', '/api/me', { headers: [{ name: 'Authorization', value: `Bearer ${token}` }] })
    expect(me.response.json).toEqual({ username: 'ada', name: 'Ada Lovelace', role: 'student' })
    const admin = send(me.server, 'GET', '/api/admin/stats', { headers: [{ name: 'Authorization', value: `Bearer ${token}` }] })
    expect(admin.response.status).toBe(403)
  })
  it('explains a wrong scheme, a bad token and bad credentials', () => {
    const l = login(createServer())
    const token = l.response.json.token
    expect(send(l.server, 'GET', '/api/me', { headers: [{ name: 'Authorization', value: token }] }).response.json.detail).toMatch(/Bearer scheme/)
    expect(send(l.server, 'GET', '/api/me', { headers: [{ name: 'Authorization', value: 'Bearer nope' }] }).entry.auth).toBe('invalid')
    expect(send(createServer(), 'POST', '/api/login', { headers: JSON_H, body: '{"username":"ada","password":"x"}' }).response.status).toBe(401)
    expect(send(createServer(), 'POST', '/api/login', { headers: JSON_H, body: '{}' }).response.json.details).toEqual(['username is required', 'password is required'])
    expect(send(createServer(), 'GET', '/api/login').response.status).toBe(405)
  })
})

describe('scenarios', () => {
  const play = (id, requests) => {
    let s = createServer({ now: NOW })
    const done = new Set()
    for (const [method, path, opts] of requests) {
      s = send(s, method, path, opts).server
      gradeTasks(SCENARIOS[id].tasks, s, done, { ordered: SCENARIOS[id].ordered })
    }
    return done
  }
  it('rest-basics', () => {
    const done = play('rest-basics', [
      ['GET', '/api/tasks'],
      ['POST', '/api/tasks', { headers: JSON_H, body: '{"title":"Mine"}' }],
      ['GET', '/api/tasks/4'],
      ['PATCH', '/api/tasks/4', { headers: JSON_H, body: '{"done":true}' }],
      ['DELETE', '/api/tasks/4'],
      ['GET', '/api/tasks/4']
    ])
    expect(done.size).toBe(SCENARIOS['rest-basics'].tasks.length)
  })
  it('rest-basics needs the new task, not an old one', () => {
    const done = play('rest-basics', [['GET', '/api/tasks'], ['POST', '/api/tasks', { headers: JSON_H, body: '{"title":"Mine"}' }], ['GET', '/api/tasks/1']])
    expect(done.has('fetch')).toBe(false)
  })
  it('auth', () => {
    let s = createServer({ now: NOW })
    const done = new Set()
    const step = (m, p, o) => {
      const r = send(s, m, p, o)
      s = r.server
      gradeTasks(SCENARIOS.auth.tasks, s, done)
      return r
    }
    step('GET', '/api/me')
    const token = step('POST', '/api/login', { headers: JSON_H, body: '{"username":"ada","password":"lovelace"}' }).response.json.token
    step('GET', '/api/me', { headers: [{ name: 'Authorization', value: `Bearer ${token}` }] })
    step('GET', '/api/admin/stats', { headers: [{ name: 'Authorization', value: `Bearer ${token}` }] })
    expect(done.size).toBe(4)
  })
  it('errors in any order', () => {
    const done = play('errors', [
      ['POST', '/api/tasks', { body: '{"title":"x"}' }],
      ['DELETE', '/api/tasks'],
      ['GET', '/api/tasks/99'],
      ['POST', '/api/tasks', { headers: JSON_H, body: '{' }]
    ])
    expect(done.size).toBe(4)
  })
})
