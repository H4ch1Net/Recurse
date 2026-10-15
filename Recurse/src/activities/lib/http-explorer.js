// A mock REST API that runs in memory, plus helpers to show requests and responses the way
// they travel on the wire. handleRequest(server, request) never mutates its input.
import { parseJson } from './json-explorer.js'

export const HOST = 'api.example.test'
export const BASE_URL = `https://${HOST}`
export const DEMO_USER = { username: 'ada', password: 'lovelace', name: 'Ada Lovelace', role: 'student' }
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
export const BODY_METHODS = ['POST', 'PUT', 'PATCH']

export const STATUS_TEXT = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  415: 'Unsupported Media Type',
  500: 'Internal Server Error'
}

export const STATUS_HELP = {
  200: 'Success. The body holds what you asked for.',
  201: 'Created. The server made a new resource, and the Location header says where it lives.',
  204: 'Success, with nothing to send back, so the body is empty. Typical for DELETE.',
  301: 'The resource moved for good. Clients follow the Location header and update their links.',
  400: 'The request itself is wrong: broken JSON, a missing field or a value of the wrong type. Fix it before retrying.',
  401: 'The server does not know who you are. Send valid credentials, here an Authorization: Bearer token.',
  403: 'The server knows who you are, but you are not allowed to do this. Logging in again will not help.',
  404: 'Nothing lives at this path, or no item has that id.',
  405: 'The path exists, but it does not accept this method. The Allow header lists the ones it does.',
  415: 'The server cannot read the body format you sent. Say what it is with Content-Type: application/json.',
  500: 'The server broke while handling the request. Not the client\'s fault: retrying later may work.'
}

export function statusClass(code) {
  if (code >= 500) return { id: '5xx', label: 'Server error' }
  if (code >= 400) return { id: '4xx', label: 'Client error' }
  if (code >= 300) return { id: '3xx', label: 'Redirect' }
  if (code >= 200) return { id: '2xx', label: 'Success' }
  return { id: '1xx', label: 'Informational' }
}

export function createServer({ now = Date.now() } = {}) {
  return {
    tasks: [
      { id: 1, title: 'Read about HTTP methods', done: true },
      { id: 2, title: 'Send a POST request', done: false },
      { id: 3, title: 'Learn the common status codes', done: false }
    ],
    nextId: 4,
    tokens: [],
    tokenSeq: 0,
    requestSeq: 0,
    log: [],
    now
  }
}

// ---- Request helpers ----------------------------------------------------------------------------

/** Turn "https://api.example.test/api/tasks?done=true" or "api/tasks" into { path, query }. */
export function splitUrl(input) {
  let s = String(input ?? '').trim()
  s = s.replace(/^[a-z]+:\/\/[^/]+/i, '')
  if (!s.startsWith('/')) s = `/${s}`
  const q = s.indexOf('?')
  const path = (q === -1 ? s : s.slice(0, q)).replace(/\/+$/, '') || '/'
  const query = {}
  if (q !== -1) {
    for (const pair of s.slice(q + 1).split('&')) {
      if (!pair) continue
      const [k, v = ''] = pair.split('=')
      try {
        query[decodeURIComponent(k)] = decodeURIComponent(v)
      } catch {
        query[k] = v
      }
    }
  }
  return { path, query, target: s }
}

/** Header rows [{ name, value }] to a lowercase lookup. Blank names are skipped. */
export function headerMap(rows = []) {
  const map = {}
  for (const row of rows) {
    const name = String(row?.name ?? '').trim()
    if (!name) continue
    map[name.toLowerCase()] = String(row.value ?? '').trim()
  }
  return map
}

const byteLength = (text) => new TextEncoder().encode(text).length

/** What the client puts on the wire. Adds Host and Content-Length like a real client. */
export function formatRequest(req) {
  const { target } = splitUrl(req.path)
  const method = String(req.method || 'GET').toUpperCase()
  const rows = (req.headers || []).filter((h) => String(h?.name ?? '').trim())
  const sendBody = BODY_METHODS.includes(method) && req.body
  const lines = [`${method} ${target} HTTP/1.1`, `Host: ${HOST}`]
  for (const h of rows) lines.push(`${h.name.trim()}: ${String(h.value ?? '').trim()}`)
  if (sendBody && !rows.some((h) => h.name.trim().toLowerCase() === 'content-length')) lines.push(`Content-Length: ${byteLength(req.body)}`)
  return `${lines.join('\n')}\n\n${sendBody ? req.body : ''}`.replace(/\n+$/, sendBody ? '' : '\n')
}

export function formatResponseHead(res) {
  return [`HTTP/1.1 ${res.status} ${res.statusText}`, ...res.headers.map(([k, v]) => `${k}: ${v}`)].join('\n')
}

function httpDate(ms) {
  return new Date(ms).toUTCString()
}

function makeToken(server) {
  server.tokenSeq += 1
  let h = 2166136261 ^ server.tokenSeq
  let out = ''
  for (let i = 0; i < 32; i++) {
    h = Math.imul(h ^ (i + server.now), 16777619) >>> 0
    out += 'abcdefghijklmnopqrstuvwxyz0123456789'[h % 36]
  }
  return `rk_${out}`
}

// ---- Routing ---------------------------------------------------------------------------------------

function respond(status, body, extraHeaders = []) {
  const text = body === undefined ? '' : JSON.stringify(body, null, 2)
  return { status, body: text, json: body ?? null, extraHeaders }
}

function readJson(headers, body) {
  const type = headers['content-type'] || ''
  if (!/^application\/json\b/i.test(type)) {
    return { error: respond(415, { error: 'Unsupported Media Type', detail: type ? `The server only reads JSON, but Content-Type says "${type}".` : 'Add the header Content-Type: application/json so the server knows the body is JSON.' }) }
  }
  if (!String(body ?? '').trim()) return { error: respond(400, { error: 'Bad Request', detail: 'The request body is empty. Send a JSON object.' }) }
  const parsed = parseJson(body)
  if (!parsed.ok) return { error: respond(400, { error: 'Invalid JSON', detail: `Line ${parsed.error.line}, column ${parsed.error.column}: ${parsed.error.message}` }) }
  if (parsed.root.type !== 'object') return { error: respond(400, { error: 'Bad Request', detail: `Expected a JSON object in { }, got ${parsed.root.type === 'array' ? 'an array' : `a ${parsed.root.type}`}.` }) }
  return { data: parsed.value }
}

function checkAuth(server, headers) {
  const auth = headers.authorization
  if (auth === undefined || auth === '') return { state: 'none', error: respond(401, { error: 'Unauthorized', detail: 'Missing Authorization header. Log in, then send Authorization: Bearer <token>.' }, [['WWW-Authenticate', 'Bearer realm="api"']]) }
  const m = /^(\S+)\s+(\S+)$/.exec(auth)
  if (!m || m[1].toLowerCase() !== 'bearer') {
    return { state: 'bad-scheme', error: respond(401, { error: 'Unauthorized', detail: 'Use the Bearer scheme: Authorization: Bearer <token>' }, [['WWW-Authenticate', 'Bearer realm="api", error="invalid_request"']]) }
  }
  if (!server.tokens.includes(m[2])) return { state: 'invalid', error: respond(401, { error: 'Unauthorized', detail: 'That token is invalid or expired. Log in again to get a new one.' }, [['WWW-Authenticate', 'Bearer realm="api", error="invalid_token"']]) }
  return { state: 'valid', user: DEMO_USER }
}

function validateTask(data, { partial }) {
  const errors = []
  const known = ['title', 'done', 'id']
  if (!partial || 'title' in data) {
    if (typeof data.title !== 'string' || !data.title.trim()) errors.push(partial ? 'title must be a non-empty string' : 'title is required and must be a non-empty string')
    else if (data.title.length > 120) errors.push('title must be 120 characters or fewer')
  }
  if ('done' in data && typeof data.done !== 'boolean') errors.push('done must be true or false (no quotes)')
  for (const k of Object.keys(data)) if (!known.includes(k)) errors.push(`unknown field "${k}"`)
  if (partial && !Object.keys(data).some((k) => k === 'title' || k === 'done')) errors.push('send at least one of title or done')
  return errors
}

const notAllowed = (allow) => respond(405, { error: 'Method Not Allowed', detail: `This path accepts ${allow.join(', ')}.` }, [['Allow', allow.join(', ')]])

function route(server, method, path, query, headers, body, entry) {
  const segs = path.split('/').filter(Boolean)
  const options = (allow) => (method === 'OPTIONS' ? respond(204, undefined, [['Allow', [...allow, 'OPTIONS'].join(', ')]]) : null)

  if (path === '/' || path === '/api') {
    entry.route = 'index'
    if (method !== 'GET') return options(['GET']) || notAllowed(['GET'])
    return respond(200, {
      name: 'Recurse practice API',
      endpoints: ['GET /api/tasks', 'POST /api/tasks', 'GET /api/tasks/{id}', 'PUT /api/tasks/{id}', 'PATCH /api/tasks/{id}', 'DELETE /api/tasks/{id}', 'POST /api/login', 'GET /api/me', 'GET /api/admin/stats']
    })
  }
  if (segs[0] !== 'api') {
    entry.route = 'unknown'
    return respond(404, { error: 'Not Found', detail: `No route for ${path}. Paths on this API start with /api.` })
  }
  if (segs[1] === 'v1') {
    entry.route = 'moved'
    const location = `/api/${segs.slice(2).join('/')}`.replace(/\/$/, '')
    return respond(301, { error: 'Moved Permanently', location }, [['Location', location]])
  }
  if (segs[1] === 'tasks' && segs.length === 2) {
    entry.route = 'tasks'
    const allow = ['GET', 'POST']
    if (method === 'OPTIONS') return options(allow)
    if (method === 'GET') {
      let list = server.tasks
      if (query.done === 'true' || query.done === 'false') list = list.filter((t) => t.done === (query.done === 'true'))
      return respond(200, list)
    }
    if (method === 'POST') {
      const r = readJson(headers, body)
      if (r.error) return r.error
      const errors = validateTask(r.data, { partial: false })
      if ('id' in r.data) errors.push('id is set by the server, leave it out')
      if (errors.length) return respond(400, { error: 'Validation failed', details: errors })
      const task = { id: server.nextId++, title: r.data.title.trim(), done: r.data.done ?? false }
      server.tasks.push(task)
      entry.createdId = task.id
      return respond(201, task, [['Location', `/api/tasks/${task.id}`]])
    }
    return notAllowed(allow)
  }
  if (segs[1] === 'tasks' && segs.length === 3) {
    entry.route = 'task'
    const allow = ['GET', 'PUT', 'PATCH', 'DELETE']
    if (method === 'OPTIONS') return options(allow)
    if (!allow.includes(method)) return notAllowed(allow)
    if (!/^\d+$/.test(segs[2])) return respond(400, { error: 'Bad Request', detail: `Task ids are whole numbers, got "${segs[2]}".` })
    const id = Number(segs[2])
    entry.targetId = id
    const task = server.tasks.find((t) => t.id === id)
    if (!task) return respond(404, { error: 'Not Found', detail: `There is no task with id ${id}.` })
    if (method === 'GET') return respond(200, task)
    if (method === 'DELETE') {
      server.tasks = server.tasks.filter((t) => t.id !== id)
      entry.deletedId = id
      return respond(204)
    }
    const r = readJson(headers, body)
    if (r.error) return r.error
    const errors = validateTask(r.data, { partial: method === 'PATCH' })
    if ('id' in r.data && r.data.id !== id) errors.push('id in the body must match the id in the path')
    if (errors.length) return respond(400, { error: 'Validation failed', details: errors })
    if (method === 'PUT') Object.assign(task, { title: r.data.title.trim(), done: r.data.done ?? false })
    else Object.assign(task, 'title' in r.data ? { title: r.data.title.trim() } : {}, 'done' in r.data ? { done: r.data.done } : {})
    return respond(200, task)
  }
  if (segs[1] === 'login' && segs.length === 2) {
    entry.route = 'login'
    if (method === 'OPTIONS') return options(['POST'])
    if (method !== 'POST') return notAllowed(['POST'])
    const r = readJson(headers, body)
    if (r.error) return r.error
    const missing = ['username', 'password'].filter((k) => typeof r.data[k] !== 'string' || !r.data[k])
    if (missing.length) return respond(400, { error: 'Validation failed', details: missing.map((k) => `${k} is required`) })
    if (r.data.username !== DEMO_USER.username || r.data.password !== DEMO_USER.password) return respond(401, { error: 'Unauthorized', detail: 'Invalid username or password.' })
    const token = makeToken(server)
    server.tokens.push(token)
    entry.token = token
    return respond(200, { token, tokenType: 'Bearer', expiresIn: 3600 })
  }
  if (segs[1] === 'me' && segs.length === 2) {
    entry.route = 'me'
    if (method === 'OPTIONS') return options(['GET'])
    if (method !== 'GET') return notAllowed(['GET'])
    const auth = checkAuth(server, headers)
    entry.auth = auth.state
    if (auth.error) return auth.error
    return respond(200, { username: auth.user.username, name: auth.user.name, role: auth.user.role })
  }
  if (segs[1] === 'admin' && segs[2] === 'stats' && segs.length === 3) {
    entry.route = 'admin'
    if (method === 'OPTIONS') return options(['GET'])
    if (method !== 'GET') return notAllowed(['GET'])
    const auth = checkAuth(server, headers)
    entry.auth = auth.state
    if (auth.error) return auth.error
    return respond(403, { error: 'Forbidden', detail: `You are logged in as ${auth.user.username}, but the ${auth.user.role} role cannot read admin stats.` })
  }
  if (segs[1] === 'crash') {
    entry.route = 'crash'
    return respond(500, { error: 'Internal Server Error', requestId: `req_${server.requestSeq}` })
  }
  entry.route = 'unknown'
  return respond(404, { error: 'Not Found', detail: `No route for ${path}.` })
}

/**
 * Handle a request { method, path, headers: [{ name, value }], body }.
 * Returns { server, response, entry }. response: { status, statusText, headers: [[k, v]], body, json }.
 */
export function handleRequest(prev, req) {
  const server = structuredClone(prev)
  server.requestSeq += 1
  const method = String(req.method || 'GET').toUpperCase()
  const { path, query } = splitUrl(req.path)
  const headers = headerMap(req.headers)
  const body = BODY_METHODS.includes(method) ? String(req.body ?? '') : ''
  const entry = { seq: server.requestSeq, method, path, route: null, auth: null }
  const r = METHODS.includes(method) || method === 'HEAD' ? route(server, method === 'HEAD' ? 'GET' : method, path, query, headers, body, entry) : notAllowed(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  const sendBody = method !== 'HEAD' && r.status !== 204
  const text = sendBody ? r.body : ''
  const responseHeaders = [['Date', httpDate(server.now + server.requestSeq * 1000)], ['Server', 'recurse-mock/1.0']]
  if (r.body) responseHeaders.push(['Content-Type', 'application/json; charset=utf-8'])
  responseHeaders.push(['Content-Length', String(byteLength(r.body))])
  responseHeaders.push(...r.extraHeaders)
  const response = { status: r.status, statusText: STATUS_TEXT[r.status] ?? '', headers: responseHeaders, body: text, json: sendBody ? r.json : null }
  entry.status = r.status
  entry.contentType = headers['content-type'] ?? null
  server.log.push(entry)
  if (server.log.length > 100) server.log.shift()
  return { server, response, entry }
}

// ---- Scenarios ------------------------------------------------------------------------------------

const created = (log) => log.filter((e) => e.createdId).map((e) => e.createdId)
const deleted = (log) => log.filter((e) => e.deletedId).map((e) => e.deletedId)
const has = (log, pred) => log.some(pred)

export const PRESETS = {
  list: { label: 'List tasks', method: 'GET', path: '/api/tasks', headers: [], body: '' },
  create: { label: 'Create a task', method: 'POST', path: '/api/tasks', headers: [{ name: 'Content-Type', value: 'application/json' }], body: '{\n  "title": "Practice REST"\n}' },
  login: { label: 'Log in', method: 'POST', path: '/api/login', headers: [{ name: 'Content-Type', value: 'application/json' }], body: '{\n  "username": "ada",\n  "password": "lovelace"\n}' },
  me: { label: 'Who am I?', method: 'GET', path: '/api/me', headers: [], body: '' },
  index: { label: 'API index', method: 'GET', path: '/api', headers: [], body: '' }
}

export const SCENARIOS = {
  'rest-basics': {
    title: 'CRUD with a REST API',
    intro: 'The API stores a to-do list at /api/tasks. Create, read, update and delete one task, the four basic operations of almost every web API.',
    ordered: true,
    presets: ['list', 'create', 'index'],
    tasks: [
      { id: 'list', text: 'List all tasks', hint: 'GET /api/tasks', check: (s) => has(s.log, (e) => e.method === 'GET' && e.route === 'tasks' && e.status === 200) },
      { id: 'create', text: 'Create a new task', hint: 'POST /api/tasks with a JSON body like {"title": "..."} and Content-Type: application/json', check: (s) => created(s.log).length > 0 },
      { id: 'fetch', text: 'Fetch your new task by its id', hint: 'The 201 response has a Location header: GET /api/tasks/4', check: (s) => has(s.log, (e) => e.method === 'GET' && e.route === 'task' && e.status === 200 && created(s.log).includes(e.targetId)) },
      { id: 'update', text: 'Mark it done', hint: 'PATCH /api/tasks/4 with {"done": true} changes one field. PUT replaces the whole task.', check: (s) => has(s.log, (e) => ['PATCH', 'PUT'].includes(e.method) && e.status === 200 && created(s.log).includes(e.targetId)) },
      { id: 'delete', text: 'Delete it', hint: 'DELETE /api/tasks/4 (expect 204 No Content)', check: (s) => deleted(s.log).some((id) => created(s.log).includes(id)) },
      { id: 'gone', text: 'Prove it is gone', hint: 'GET the same id again and read the status', check: (s) => has(s.log, (e) => e.method === 'GET' && e.route === 'task' && e.status === 404 && deleted(s.log).includes(e.targetId)) }
    ]
  },
  auth: {
    title: 'Tokens and 401 vs 403',
    intro: `/api/me tells you who you are, if you can prove it. Log in as ${DEMO_USER.username} (password ${DEMO_USER.password}) to get a token, then send it in the Authorization header.`,
    ordered: true,
    presets: ['me', 'login'],
    tasks: [
      { id: 'anon', text: 'Call GET /api/me without a token', hint: 'Expect 401 Unauthorized: the server does not know who you are', check: (s) => has(s.log, (e) => e.route === 'me' && e.status === 401) },
      { id: 'login', text: 'Log in to get a token', hint: `POST /api/login with {"username": "${DEMO_USER.username}", "password": "${DEMO_USER.password}"}`, check: (s) => has(s.log, (e) => e.route === 'login' && e.status === 200) },
      { id: 'me', text: 'Call /api/me again with your token', hint: 'Add the header Authorization: Bearer <your token>', check: (s) => has(s.log, (e) => e.route === 'me' && e.status === 200) },
      { id: 'forbidden', text: 'Try GET /api/admin/stats with the same token', hint: 'Expect 403 Forbidden: known user, not allowed', check: (s) => has(s.log, (e) => e.route === 'admin' && e.status === 403) }
    ]
  },
  errors: {
    title: 'Break it on purpose',
    intro: 'Error codes are messages. Trigger each one on purpose and read what the server says, so you recognize them when they show up for real.',
    ordered: false,
    presets: ['list', 'create'],
    tasks: [
      { id: '400', text: 'Get a 400 Bad Request', hint: 'POST a task with broken JSON, or without a title', check: (s) => has(s.log, (e) => e.status === 400) },
      { id: '404', text: 'Get a 404 Not Found', hint: 'Ask for a task id that does not exist', check: (s) => has(s.log, (e) => e.status === 404) },
      { id: '405', text: 'Get a 405 Method Not Allowed', hint: 'Use a method a path does not support, like DELETE /api/tasks', check: (s) => has(s.log, (e) => e.status === 405) },
      { id: '415', text: 'Get a 415 Unsupported Media Type', hint: 'POST a body without the Content-Type: application/json header', check: (s) => has(s.log, (e) => e.status === 415) }
    ]
  }
}

export const SCENARIO_IDS = Object.keys(SCENARIOS)
export const scenarioFor = (id) => (SCENARIOS[id] ? id : 'rest-basics')
