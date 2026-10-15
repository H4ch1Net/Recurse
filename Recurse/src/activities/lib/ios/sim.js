// A Cisco IOS CLI simulator for CCNA practice. It models one router or switch: modes,
// abbreviations, `?` context help, Tab completion, IOS error messages with the caret,
// running versus startup config, and a broad set of configuration and show commands.
// Simulated neighbors (from a lab's `env`) make show output, pings and protocol
// adjacencies react to what the learner configures.
//
// Public API:
//   createSim({ kind, env, startingConfig, now }) -> sim
//   createLabSim(lab, opts) -> sim
//   runLine(sim, raw) -> { lines: [{ text, kind }], output, error, prompt }
//   helpLines(sim, text) -> lines for `?` typed after `text`
//   complete(sim, text) -> text with the last word completed (Tab)
//   interrupt(sim, 'z' | 'c') -> result like runLine (Ctrl+Z / Ctrl+C)
//   promptFor(sim), modeKey(sim), bootLines(sim)
//
// Line kinds: 'out' normal output, 'err' error, 'log' syslog message, 'dim' simulator tip.

import {
  IF_TYPES,
  applyWildcard,
  canonicalIf,
  formatVlanList,
  inPrefix,
  ipv6Network,
  ipv6ToStr,
  isIPv4,
  isIPv6,
  isPhysical,
  isSubif,
  maskToPrefix,
  normIPv6,
  parentIf,
  parseIPv4,
  parseIPv6Prefix,
  parseVlanList
} from './addr.js'
import {
  MODELS,
  aclTypeForNumber,
  addAclRule,
  cloneConfig,
  ensureAcl,
  ensureIf,
  hasPort,
  ifTypesFor,
  makeDevice,
  modelOf,
  newPortSecurity,
  parseAclRule,
  TCP_PORTS,
  UDP_PORTS
} from './device.js'
import { MODE_LABELS, formatHelpList, formatPartialHelp } from './help.js'
import { clearErrDisable, errDisable, ipInterfaces, isUp, lookupRoute, observe, pingResult, pingV6Result, startupNotices, stpForVlan } from './model.js'
import * as S from './show.js'

// =====================================================================
// Grammar primitives
// =====================================================================

const LABELS = { VLANS: 'WORD', ACLNAME: 'WORD', PORT: '<0-65535>' }

function rangeTest(lo, hi) {
  return (t) => /^-?\d+$/.test(t) && Number(t) >= lo && Number(t) <= hi
}

function typeTest(type) {
  if (type === 'A.B.C.D') return isIPv4
  if (type === 'WORD' || type === 'LINE') return () => true
  if (type === 'X:X:X:X::X') return isIPv6
  if (type === 'X:X:X:X::X/<0-128>') return (t) => parseIPv6Prefix(t) !== null
  if (type === 'H.H.H') return (t) => /^[0-9a-f]{1,4}\.[0-9a-f]{1,4}\.[0-9a-f]{1,4}$/i.test(t)
  if (type === 'hh:mm:ss') return (t) => /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(t)
  if (type === '/nn') return (t) => /^\/(\d|[12]\d|3[0-2])$/.test(t)
  if (type === 'VLANS') return (t) => parseVlanList(t) !== null
  if (type === 'ACLNAME') return (t) => /^[A-Za-z][\w.-]*$/.test(t)
  const r = type.match(/^<(-?\d+)-(\d+)>$/)
  if (r) return rangeTest(Number(r[1]), Number(r[2]))
  return () => false
}

function mk(t, spec, next, extra) {
  const bar = spec.indexOf('|')
  const word = bar >= 0 ? spec.slice(0, bar) : spec
  const n = { t, word, wl: word.toLowerCase(), help: bar >= 0 ? spec.slice(bar + 1) : '', next: next || [] }
  if (typeof extra === 'function') n.run = extra
  else if (extra) Object.assign(n, extra)
  return n
}

/** Keyword node. spec: "word|help". extra: run function or flags object. */
const K = (spec, next, extra) => mk('kw', spec, next, extra)

/** Argument node. spec: "TYPE|help", TYPE like A.B.C.D, WORD, LINE, <1-4094>. */
function A(spec, next, extra) {
  const n = mk('arg', spec, next, extra)
  n.type = n.word
  n.test = n.test || typeTest(n.type)
  if (n.type === 'LINE') n.rest = true
  n.label = n.label || LABELS[n.type] || n.type
  return n
}

const PIPE = mk('kw', 'x', [], { word: '|', wl: '|', help: 'Output modifiers' })
PIPE.next = [
  K('begin|Begin with the line that matches', [A('LINE|Regular Expression', [], { pipeEnd: true })]),
  K('count|Count number of lines which match regexp', [A('LINE|Regular Expression', [], { pipeEnd: true })]),
  K('exclude|Exclude lines that match', [A('LINE|Regular Expression', [], { pipeEnd: true })]),
  K('include|Include lines that match', [A('LINE|Regular Expression', [], { pipeEnd: true })]),
  K('section|Filter a section of output', [A('LINE|Regular Expression', [], { pipeEnd: true })])
]
PIPE.pipeStart = true

/** A show leaf: prints the lines fn(ctx) returns, through any `| include` style filter. */
function SH(spec, fn, more = []) {
  return K(spec, [...more, PIPE], { run: (ctx) => ctx.print(fn(ctx)) })
}

function ifNumTest(kind, type, sub) {
  const ports = MODELS[kind].ports
  return (t) => {
    if (type === 'GigabitEthernet') {
      if (ports.includes(`GigabitEthernet${t}`)) return true
      if (!sub) return false
      const m = t.match(/^(\d+\/\d+)\.(\d+)$/)
      return Boolean(m && ports.includes(`GigabitEthernet${m[1]}`) && Number(m[2]) >= 1 && Number(m[2]) <= 4294967295)
    }
    if (!/^\d+$/.test(t)) return false
    const n = Number(t)
    if (type === 'Loopback') return n <= 2147483647
    if (type === 'Vlan') return n >= 1 && n <= 4094
    if (type === 'Port-channel') return n >= 1 && n <= 48
    return false
  }
}

function ifNumLabel(kind, type, sub) {
  if (type === 'GigabitEthernet') return kind === 'switch' ? '<0-0>/<1-24>' : `<0-0>/<0-2>${sub ? '[.<1-4294967295>]' : ''}`
  if (type === 'Loopback') return '<0-2147483647>'
  if (type === 'Vlan') return '<1-4094>'
  return '<1-48>'
}

/** Interface type keywords (glued or spaced) followed by the number, then `next`. */
function IFACE(kind, next = [], flags = {}, opts = {}) {
  return ifTypesFor(kind)
    .filter((t) => !opts.types || opts.types.includes(t.type))
    .map((t) =>
      K(`${t.type}|${t.help}`, [A(`IFNUM|${t.type} interface number`, next, { ...flags, ifNum: true, test: ifNumTest(kind, t.type, opts.sub), label: ifNumLabel(kind, t.type, opts.sub) })], { glue: true, ifType: t.type })
    )
}

// =====================================================================
// Parser
// =====================================================================

function tokenize(raw) {
  const toks = []
  const re = /\S+/g
  let m
  while ((m = re.exec(raw))) toks.push({ text: m[0], start: m.index })
  return toks
}

function filterLevel(level, st) {
  return level.filter((n) => !(st.fresh && st.negate && n.noNeg) && !(st.doFresh && n.noDo))
}

function matchToken(level, text, sim) {
  const low = text.toLowerCase()
  const kws = level.filter((n) => n.t === 'kw')
  const exact = kws.find((n) => n.wl === low)
  if (exact) return { node: exact }
  const pref = kws.filter((n) => n.wl.startsWith(low))
  if (pref.length === 1) return { node: pref[0] }
  if (pref.length > 1) {
    const argHit = level.find((n) => n.t === 'arg' && n.type !== 'WORD' && n.type !== 'LINE' && n.test(text, sim))
    if (argHit) return { node: argHit }
    return { ambiguous: pref }
  }
  const g = text.match(/^([a-zA-Z-]+)(\d.*)$/)
  if (g) {
    const glued = kws.filter((n) => n.glue && n.wl.startsWith(g[1].toLowerCase()))
    if (glued.length === 1) return { node: glued[0], split: g[1].length }
  }
  const arg = level.find((n) => n.t === 'arg' && n.test(text, sim))
  if (arg) return { node: arg }
  return null
}

/**
 * Walk tokens through a grammar. Returns { status: 'ok' | 'invalid' | 'ambiguous',
 * node, level, matched, st, at, text }. 'ok' means every token matched.
 */
function walk(roots, raw, sim) {
  const toks = tokenize(raw)
  const st = { negate: false, inDo: false, fresh: true, doFresh: false, pipe: null, pipeFrom: null }
  let level = roots
  let node = null
  const matched = []
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i]
    const hit = matchToken(filterLevel(level, st), tok.text, sim)
    if (!hit) return { status: 'invalid', at: tok.start, matched, node, st, tokIndex: i }
    if (hit.ambiguous) return { status: 'ambiguous', at: tok.start, text: raw.slice(0, tok.start + tok.text.length).trim(), matched, node, st }
    const n = hit.node
    if (hit.split) {
      toks.splice(i + 1, 0, { text: tok.text.slice(hit.split), start: tok.start + hit.split })
      tok.text = tok.text.slice(0, hit.split)
    }
    st.fresh = false
    st.doFresh = false
    if (n.pipeStart) st.pipeFrom = node
    if (n.t === 'arg' && n.rest) {
      matched.push({ node: n, text: raw.slice(tok.start).trimEnd(), start: tok.start })
      node = n
      level = []
      if (n.pipeEnd) st.pipe = { mod: matched[matched.length - 2].node.word, pattern: matched[matched.length - 1].text }
      return { status: 'ok', node, level, matched, st, consumedAll: true }
    }
    matched.push({ node: n, text: tok.text, start: tok.start })
    if (n.negate) {
      st.negate = true
      st.fresh = true
    }
    if (n.doExec) {
      st.inDo = true
      st.doFresh = true
    }
    node = n
    level = n.next
  }
  return { status: 'ok', node, level, matched, st }
}

function runnable(node, st) {
  if (!node) return null
  if (st.negate) return node.nrun || (node.noNegRun ? null : node.run) || null
  return node.run || null
}

/** Full parse: walk plus the check that the command can end here. */
function parse(roots, raw, sim) {
  const w = walk(roots, raw, sim)
  if (w.status !== 'ok') return w
  if (!w.node) return { ...w, status: 'empty' }
  const target = w.st.pipeFrom && w.st.pipe ? w.st.pipeFrom : w.node
  if (w.st.pipeFrom && !w.st.pipe) return { ...w, status: 'incomplete' }
  const fn = runnable(target, w.st)
  if (!fn) return { ...w, status: 'incomplete' }
  return { ...w, status: 'ok', fn }
}

// =====================================================================
// Output and execution context
// =====================================================================

class Out {
  constructor() {
    this.lines = []
    this.error = false
  }
  add(text, kind = 'out') {
    for (const l of String(text).split('\n')) this.lines.push({ text: l, kind })
  }
  err(text) {
    this.error = true
    this.add(text, 'err')
  }
}

function applyPipe(lines, pipe) {
  if (!pipe) return lines
  let re
  try {
    re = new RegExp(pipe.pattern)
  } catch {
    re = { test: (l) => l.includes(pipe.pattern) }
  }
  if (pipe.mod === 'include') return lines.filter((l) => re.test(l))
  if (pipe.mod === 'exclude') return lines.filter((l) => !re.test(l))
  if (pipe.mod === 'count') return [`Number of lines which match regexp = ${lines.filter((l) => re.test(l)).length}`]
  if (pipe.mod === 'begin') {
    const i = lines.findIndex((l) => re.test(l))
    return i < 0 ? [] : lines.slice(i)
  }
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (/^\s/.test(lines[i]) || !re.test(lines[i])) continue
    out.push(lines[i])
    while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) out.push(lines[++i])
  }
  return out
}

function makeCtx(sim, parsed, out, raw, promptLen) {
  const words = []
  const starts = []
  const m = parsed.matched
  let skip = 0
  while (skip < m.length && (m[skip].node.negate || m[skip].node.doExec)) skip++
  const body = parsed.st.pipeFrom ? m.slice(skip, m.findIndex((x) => x.node.pipeStart)) : m.slice(skip)
  for (let i = 0; i < body.length; i++) {
    const n = body[i].node
    if (n.ifType && body[i + 1]?.node.ifNum) {
      words.push(`${n.ifType}${body[i + 1].text}`)
      starts.push(body[i].start)
      i++
      continue
    }
    words.push(n.t === 'kw' ? n.word : body[i].text)
    starts.push(body[i].start)
  }
  const ctx = {
    sim,
    dev: sim.dev,
    out,
    raw,
    w: words,
    negate: parsed.st.negate,
    viaDo: parsed.st.inDo,
    has: (word) => words.includes(word),
    after: (word, k = 1) => {
      const i = words.indexOf(word)
      return i >= 0 ? words[i + k] : undefined
    },
    print: (lines) => {
      const shown = applyPipe(lines, parsed.st.pipe)
      if (shown.length) out.add(shown.join('\n'))
    },
    say: (text) => out.add(text),
    fail: (text) => out.err(text),
    invalidAt: (i) => {
      out.err(`${' '.repeat(promptLen + (starts[i] ?? 0))}^`)
      out.err("% Invalid input detected at '^' marker.")
      out.add('')
    }
  }
  return ctx
}

// =====================================================================
// Modes and prompts
// =====================================================================

const CONFIG_MODES = new Set(['config', 'if', 'vlan', 'line', 'router', 'dhcp', 'acl'])

export function modeKey(sim) {
  const m = sim.mode
  if (m.name === 'if') return m.targets.some((t) => t.includes('.')) ? 'subif' : m.range ? 'if-range' : 'if'
  if (m.name === 'acl') return m.type === 'standard' ? 'std-nacl' : 'ext-nacl'
  return m.name
}

export function modeLabel(sim) {
  return MODE_LABELS[modeKey(sim)] ?? ''
}

/** Prompt text, or the pending question when the device is waiting for an answer. */
export function promptFor(sim) {
  if (sim.pending) return sim.pending.prompt
  const h = sim.dev.hostname
  const key = modeKey(sim)
  if (key === 'user') return `${h}>`
  if (key === 'enable') return `${h}#`
  if (key === 'config') return `${h}(config)#`
  if (key === 'dhcp') return `${h}(dhcp-config)#`
  if (key === 'router') return `${h}(config-router)#`
  return `${h}(config-${key})#`
}

function rootsFor(sim) {
  const g = sim.grammar
  const m = sim.mode
  if (m.name === 'acl') return m.type === 'standard' ? g.aclStd : g.aclExt
  return g[m.name]
}

function enterConfigExit(sim, out) {
  sim.mode = { name: 'enable' }
  logMsg(sim, out, '%SYS-5-CONFIG_I: Configured from console by console')
}

function logMsg(sim, out, msg) {
  const line = `${S.logStamp(sim)}${msg}`
  sim.logBuf.push(line)
  if (sim.logBuf.length > 200) sim.logBuf.shift()
  if (sim.dev.logging.console) out.add(line, 'log')
}

// =====================================================================
// Shared helpers for commands
// =====================================================================

const LEVELS = ['emergencies', 'alerts', 'critical', 'errors', 'warnings', 'notifications', 'informational', 'debugging']

function targets(ctx) {
  return ctx.sim.mode.targets.map((n) => ensureIf(ctx.dev, n))
}

function defaultHost(dev) {
  return dev.kind === 'switch' ? 'Switch' : 'Router'
}

function pw(dev, text, typeHint) {
  if (typeHint === '7') return { type: 7, text: '', raw: text }
  if (typeHint === '5') return { type: 5, text: '', raw: text }
  return { type: dev.servicePasswordEncryption ? 7 : 0, text }
}

/** Split "0 secret" style arguments into type and text. */
function splitPw(rest) {
  const m = rest.match(/^([057])\s+(.+)$/)
  return m ? [m[1], m[2]] : [null, rest]
}

function encryptAll(dev) {
  const bump = (p) => {
    if (p && p.type === 0) p.type = 7
  }
  bump(dev.enablePassword)
  for (const u of dev.users) if (u.kind === 'password') bump(u.pw)
  for (const l of Object.values(dev.lines)) bump(l.password)
}

function lineNumber(dev, group) {
  if (group === 'con') return 0
  if (group === 'aux') return 1
  const base = dev.kind === 'router' ? 2 : 1
  return group === 'vty' ? base : base + 5
}

// =====================================================================
// EXEC commands
// =====================================================================

function execEnable(ctx) {
  const { sim, dev } = ctx
  if (sim.mode.name !== 'user') return
  if (dev.enableSecret || dev.enablePassword) {
    sim.pending = { kind: 'enable-pw', prompt: 'Password: ', secret: true, tries: 0 }
    return
  }
  sim.mode = { name: 'enable' }
  sim.stats.enable = true
}

function execDisable(ctx) {
  ctx.sim.mode = { name: 'user' }
}

function execLogout(ctx) {
  const { sim, out } = ctx
  sim.mode = { name: 'user' }
  out.add(['', `${sim.dev.hostname} con0 is now available`, '', '', '', '', '', 'Press RETURN to get started.'].join('\n'))
  sim.pending = { kind: 'press-return', prompt: '' }
}

function execConfigure(ctx) {
  const { sim, out } = ctx
  if (!ctx.has('terminal')) {
    sim.pending = { kind: 'configure', prompt: 'Configuring from terminal, memory, or network [terminal]? ' }
    return
  }
  sim.mode = { name: 'config' }
  sim.stats.config = true
  out.add('Enter configuration commands, one per line.  End with CNTL/Z.')
}

function saveConfig(sim, out) {
  out.add('Building configuration...')
  sim.startup = cloneConfig(sim.dev)
  out.add('[OK]')
}

function execWrite(ctx) {
  const { sim, out } = ctx
  if (ctx.has('erase')) {
    sim.pending = { kind: 'erase', prompt: 'Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]' }
    return
  }
  if (ctx.has('terminal')) return ctx.print(S.showRunning(sim))
  saveConfig(sim, out)
}

function execCopy(ctx) {
  const { sim } = ctx
  if (ctx.w[1] === 'running-config' && ctx.w[2] === 'startup-config') {
    sim.pending = { kind: 'copy-rs', prompt: 'Destination filename [startup-config]? ' }
  } else if (ctx.w[1] === 'startup-config' && ctx.w[2] === 'running-config') {
    sim.pending = { kind: 'copy-sr', prompt: 'Destination filename [running-config]? ' }
  }
}

function execErase(ctx) {
  ctx.sim.pending = { kind: 'erase', prompt: 'Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]' }
}

function modified(sim) {
  const a = JSON.stringify(sim.dev)
  return !sim.startup || a !== JSON.stringify(sim.startup)
}

function execReload(ctx) {
  const { sim } = ctx
  if (modified(sim)) sim.pending = { kind: 'reload-save', prompt: 'System configuration has been modified. Save? [yes/no]: ' }
  else sim.pending = { kind: 'reload-confirm', prompt: 'Proceed with reload? [confirm]' }
}

function doReload(sim, out) {
  logMsg(sim, out, '%SYS-5-RELOAD: Reload requested by console. Reload Reason: Reload Command.')
  const meta = modelOf(sim.dev)
  sim.dev = sim.startup ? cloneConfig(sim.startup) : makeDevice(sim.dev.kind, { baseMac: sim.dev.baseMac, model: sim.dev.model })
  sim.mode = { name: 'user' }
  sim.bootAt = sim.now()
  sim.clock = { base: Date.UTC(1993, 2, 1), setAt: sim.now(), authoritative: false }
  sim.op = freshOp(sim.op)
  observe(sim, { silent: true })
  out.add(['', `System Bootstrap, Version 15.0(1r)M16, RELEASE SOFTWARE (fc1)`, 'Copyright (c) 1986-2021 by Cisco Systems, Inc.', '', `Cisco IOS Software, Version ${meta.version}`, sim.startup ? '' : '\n         --- System Configuration Dialog ---\n\nWould you like to enter the initial configuration dialog? [yes/no]: no', ''].join('\n'))
  if (sim.dev.banner != null) out.add(sim.dev.banner)
  out.add('Press RETURN to get started!')
  sim.pending = { kind: 'press-return', prompt: '' }
}

function execClockSet(ctx) {
  const { sim, w } = ctx
  const [h, mi, s] = w[2].split(':').map(Number)
  let day
  let month
  if (/^\d+$/.test(w[3])) {
    day = Number(w[3])
    month = S.MONTH_NAMES.indexOf(w[4].toLowerCase())
  } else {
    month = S.MONTH_NAMES.indexOf(w[3].toLowerCase())
    day = Number(w[4])
  }
  const year = Number(w[5])
  const tz = sim.dev.clockTz
  const shift = tz ? (tz.hours * 60 + Math.sign(tz.hours || 1) * tz.mins) * 60000 : 0
  sim.clock = { base: Date.UTC(year, month, day, h, mi, s) - shift, setAt: sim.now(), authoritative: true }
}

function pingOutput(ok, firstMiss, target, partial = false) {
  const lines = ['Type escape sequence to abort.', `Sending 5, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`]
  if (partial) lines.push('!.!.!', 'Success rate is 60 percent (3/5), round-trip min/avg/max = 1/1/2 ms')
  else if (!ok) lines.push('.....', 'Success rate is 0 percent (0/5)')
  else if (firstMiss) lines.push('.!!!!', 'Success rate is 80 percent (4/5), round-trip min/avg/max = 1/1/2 ms')
  else lines.push('!!!!!', 'Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms')
  return lines
}

function arpTarget(sim, ip) {
  const own = ipInterfaces(sim).some((x) => x.ip === ip)
  if (own) return null
  const r = lookupRoute(sim, ip)
  if (!r) return null
  if (r.code === 'C') return ip
  return r.paths[0].nh ?? ip
}

function execPing(ctx) {
  const { sim, out } = ctx
  const target = ctx.w[ctx.w.length - 1]
  if (isIPv4(target)) {
    const res = pingResult(sim, target)
    const hop = arpTarget(sim, target)
    const firstMiss = res.ok && hop && !sim.op.arp.includes(hop)
    if (res.ok) {
      if (hop && !sim.op.arp.includes(hop)) sim.op.arp.push(hop)
      if (!sim.op.pingOk.includes(target)) sim.op.pingOk.push(target)
    }
    ctx.print(pingOutput(res.ok, firstMiss, target, res.partial))
    return
  }
  if (isIPv6(target)) {
    const norm = normIPv6(target)
    const res = pingV6Result(sim, target)
    if (res.ok && !sim.op.pingOk.includes(norm)) sim.op.pingOk.push(norm)
    ctx.print(pingOutput(res.ok, false, norm))
    return
  }
  if (sim.dev.domainLookup) out.add(`Translating "${target}"...domain server (255.255.255.255)`)
  out.err('% Unrecognized host or address, or protocol not running.')
  out.add('')
}

function execTraceroute(ctx) {
  const { sim } = ctx
  const target = ctx.w[ctx.w.length - 1]
  const lines = ['Type escape sequence to abort.', `Tracing the route to ${target}`, 'VRF info: (vrf in name/id, vrf out name/id)']
  const res = pingResult(sim, target)
  const r = lookupRoute(sim, target)
  if (res.ok && r) {
    if (r.code === 'C' || r.code === 'L') lines.push(`  1 ${target} 1 msec 0 msec 1 msec`)
    else {
      lines.push(`  1 ${r.paths[0].nh} 1 msec 0 msec 1 msec`)
      lines.push(`  2 ${target} 1 msec 1 msec 0 msec`)
    }
  } else {
    if (r && r.code !== 'C') lines.push(`  1 ${r.paths[0].nh ?? target} 1 msec 0 msec 1 msec`)
    const start = lines.length - 2
    for (let k = start; k < start + 3; k++) lines.push(`  ${k} ${' *'.repeat(3)}`)
  }
  ctx.print(lines)
}

function execRemote(ctx) {
  const { sim, out } = ctx
  const host = ctx.w[ctx.w.length - 1]
  if (!isIPv4(host)) {
    out.err('% Unknown command or computer name, or unable to find computer address')
    return
  }
  out.add(`Trying ${host} ... `)
  if (pingResult(sim, host).ok) out.err('% Connection refused by remote host')
  else out.err('% Connection timed out; remote host not responding')
}

/** clear port-security {all | configured | dynamic | sticky} [interface X | address H.H.H] */
function execClearPortSecurity(ctx) {
  const { dev, w } = ctx
  const what = w[2]
  const onlyIf = ctx.has('interface') ? ctx.after('interface') : null
  const onlyMac = ctx.has('address') ? ctx.after('address').toLowerCase() : null
  for (const i of Object.values(dev.interfaces)) {
    const ps = i.portSecurity
    if (!ps || (onlyIf && i.name !== onlyIf)) continue
    const keep = (m) => onlyMac && m !== onlyMac
    if (what === 'sticky' || what === 'all') ps.stickyMacs = ps.stickyMacs.filter(keep)
    if (what === 'configured' || what === 'all') ps.macs = ps.macs.filter(keep)
  }
}

function execClearOspf(ctx) {
  ctx.sim.pending = { kind: 'clear-ospf', prompt: 'Reset ALL OSPF processes? [no]: ' }
}

function noop() {}

// =====================================================================
// Global configuration commands
// =====================================================================

function cfgHostname(ctx) {
  const { dev, w } = ctx
  if (ctx.negate) {
    dev.hostname = defaultHost(dev)
    return
  }
  const name = w[1]
  if (!/^[A-Za-z]([A-Za-z0-9-]*[A-Za-z0-9])?$/.test(name) || name.length > 63) {
    ctx.fail('% Hostname contains one or more illegal characters.')
    return
  }
  dev.hostname = name
}

function cfgInterface(ctx) {
  const { sim, dev } = ctx
  const name = ctx.w[1]
  if (ctx.negate) {
    if (isPhysical(name)) {
      ctx.fail('% Removal of physical interfaces is not permitted')
      return
    }
    delete dev.interfaces[name]
    return
  }
  if (/^Vlan/.test(name) && dev.kind !== 'switch') return ctx.invalidAt(1)
  ensureIf(dev, name)
  sim.mode = { name: 'if', targets: [name] }
}

/** "g0/1 - 3, g0/5" into canonical names, or null. */
function parseRange(text, dev) {
  const out = []
  for (const part of text.split(',')) {
    const m = part.trim().match(/^([A-Za-z-]+)\s*(\d+\/)?(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) return null
    const type = canonicalIf(`${m[1]}0`)?.replace(/0$/, '')
    if (!type) return null
    const a = Number(m[3])
    const b = m[4] ? Number(m[4]) : a
    if (b < a) return null
    for (let k = a; k <= b; k++) {
      const name = `${type}${m[2] ?? ''}${k}`
      if (isPhysical(name) && !hasPort(dev, name)) return null
      if (!isPhysical(name) && !/^(Vlan|Loopback|Port-channel)\d+$/.test(name)) return null
      if (/^Vlan/.test(name) && dev.kind !== 'switch') return null
      out.push(name)
    }
  }
  return out.length ? out : null
}

function cfgInterfaceRange(ctx) {
  const { sim, dev } = ctx
  const names = parseRange(ctx.w[2], dev)
  if (!names) {
    ctx.fail('% Command rejected: Bad interface range.')
    return
  }
  names.forEach((n) => ensureIf(dev, n))
  sim.mode = { name: 'if', targets: names, range: true }
}

function cfgVlan(ctx) {
  const { sim, dev } = ctx
  const ids = parseVlanList(ctx.w[1])
  if (ctx.negate) {
    for (const id of ids) {
      if (id === 1 || (id >= 1002 && id <= 1005)) {
        ctx.fail(`%Default VLAN ${id} may not be deleted.`)
        continue
      }
      delete dev.vlans[id]
    }
    return
  }
  const ext = ids.filter((id) => id > 1005)
  if (ext.length && dev.vtpMode !== 'transparent' && dev.vtpMode !== 'off') {
    ctx.fail(`VLAN(s) ${formatVlanList(ext)} will not be created because VTP is not in TRANSPARENT mode.`)
    return
  }
  for (const id of ids) if (dev.vlans[id] == null && !(id >= 1002 && id <= 1005)) dev.vlans[id] = `VLAN${String(id).padStart(4, '0')}`
  sim.mode = { name: 'vlan', ids }
}

function cfgVtp(ctx) {
  const { dev, w } = ctx
  if (ctx.has('mode')) {
    const m = ctx.negate ? 'server' : w[2]
    if (dev.vtpMode === m) {
      ctx.say(`Device mode already VTP ${m[0].toUpperCase()}${m.slice(1)}.`)
      return
    }
    dev.vtpMode = m
    ctx.say(`Setting device to VTP ${m[0].toUpperCase()}${m.slice(1)} mode for VLANS.`)
  } else if (ctx.has('domain')) {
    ctx.say(`Changing VTP domain name from ${dev.vtpDomain || 'NULL'} to ${w[2]}`)
    dev.vtpDomain = w[2]
  }
}

function cfgLine(ctx) {
  const { sim, dev, w } = ctx
  let groups
  if (w[1] === 'console' || w[1] === 'aux') groups = [w[1] === 'console' ? 'con' : 'aux']
  else {
    const a = Number(w[2])
    const b = w[3] != null ? Number(w[3]) : a
    if (b < a) return ctx.invalidAt(3)
    groups = []
    if (a <= 4) groups.push('vty')
    if (b >= 5) groups.push('vty2')
  }
  groups = groups.filter((g) => dev.lines[g])
  sim.mode = { name: 'line', groups }
}

function cfgRouterOspf(ctx) {
  const { sim, dev, out } = ctx
  const proc = Number(ctx.w[2])
  if (ctx.negate) {
    if (dev.ospf && dev.ospf.process === proc) dev.ospf = null
    sim.op.ospfRid = null
    return
  }
  if (!dev.ospf) {
    dev.ospf = { process: proc, routerId: null, networks: [], passive: [], noPassive: [], passiveDefault: false, defaultOriginate: null, refBw: null, maxPaths: null }
    sim.op.ospfRid = null
    if (!ipInterfaces(sim).length && !dev.ospf.routerId) logMsg(sim, out, `%OSPF-4-NORTRID: OSPF process ${proc} failed to allocate unique router-id and cannot start`)
  } else dev.ospf.process = proc
  sim.mode = { name: 'router', proto: 'ospf' }
}

function cfgIpRoute(ctx) {
  const { dev, w } = ctx
  const [prefix, mask] = [w[2], w[3]]
  const len = maskToPrefix(mask)
  if (ctx.negate && w.length === 4) {
    dev.routes = dev.routes.filter((r) => !(r.prefix === prefix && r.mask === mask))
    return
  }
  let i = 4
  let iface = null
  let nextHop = null
  if (w[i] && /^[A-Z]/.test(w[i])) iface = w[i++]
  if (w[i] && isIPv4(w[i])) nextHop = w[i++]
  const ad = w[i] ? Number(w[i]) : 1
  if (ctx.negate) {
    dev.routes = dev.routes.filter((r) => !(r.prefix === prefix && r.mask === mask && (!nextHop || r.nextHop === nextHop) && (!iface || r.iface === iface)))
    return
  }
  if (len === null || (parseIPv4(prefix) & ~(len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0)) !== 0) {
    ctx.fail('%Inconsistent address and mask')
    return
  }
  if (nextHop && Object.values(dev.interfaces).some((x) => x.ip === nextHop)) {
    ctx.fail("%Invalid next hop address (it's this router)")
    return
  }
  dev.routes = dev.routes.filter((r) => !(r.prefix === prefix && r.mask === mask && r.nextHop === nextHop && r.iface === iface))
  dev.routes.push({ prefix, mask, nextHop, iface, ad })
}

function cfgIpv6Route(ctx) {
  const { dev, w } = ctx
  const p = parseIPv6Prefix(w[2])
  const prefix = `${ipv6ToStr(ipv6Network(p.addr, p.len))}/${p.len}`
  let i = 3
  let iface = null
  let nextHop = null
  if (w[i] && /^[A-Z]/.test(w[i]) && !isIPv6(w[i])) iface = w[i++]
  if (w[i] && isIPv6(w[i])) nextHop = normIPv6(w[i++])
  const ad = w[i] ? Number(w[i]) : 1
  if (ctx.negate) {
    dev.ipv6Routes = dev.ipv6Routes.filter((r) => !(r.prefix === prefix && (!nextHop || r.nextHop === nextHop) && (!iface || r.iface === iface)))
    return
  }
  if (nextHop && /^FE[89AB]/i.test(nextHop) && !iface) {
    ctx.fail('% Interface has to be specified for a link-local nexthop')
    return
  }
  dev.ipv6Routes = dev.ipv6Routes.filter((r) => !(r.prefix === prefix && r.nextHop === nextHop && r.iface === iface))
  dev.ipv6Routes.push({ prefix, nextHop, iface, ad })
}

function cfgDomainName(ctx) {
  ctx.dev.domainName = ctx.negate ? null : ctx.w[ctx.w.length - 1]
}

function cfgDomainLookup(ctx) {
  ctx.dev.domainLookup = !ctx.negate
}

function cfgNameServer(ctx) {
  const { dev } = ctx
  const addrs = ctx.w.slice(2)
  if (ctx.negate) dev.nameServers = addrs.length ? dev.nameServers.filter((a) => !addrs.includes(a)) : []
  else for (const a of addrs) if (!dev.nameServers.includes(a)) dev.nameServers.push(a)
}

function cfgDefaultGateway(ctx) {
  ctx.dev.defaultGateway = ctx.negate ? null : ctx.w[2]
}

function cfgIpRouting(ctx) {
  ctx.dev.ipRouting = !ctx.negate
}

function cfgSshVersion(ctx) {
  const { dev } = ctx
  if (ctx.negate) {
    dev.sshVersion = null
    return
  }
  const v = Number(ctx.w[3])
  if (v === 2 && (dev.rsaModulus ?? 0) < 768) ctx.say('Please create RSA keys (of atleast 768 bits size) to enable SSH v2.')
  dev.sshVersion = v
}

function cfgDhcpPool(ctx) {
  const { sim, dev } = ctx
  const name = ctx.w[3]
  if (ctx.negate) {
    dev.dhcpPools = dev.dhcpPools.filter((p) => p.name !== name)
    return
  }
  if (!dev.dhcpPools.some((p) => p.name === name)) dev.dhcpPools.push({ name, network: null, mask: null, routers: [], dns: [], domain: null, lease: null })
  sim.mode = { name: 'dhcp', pool: name }
}

function cfgDhcpExcluded(ctx) {
  const { dev } = ctx
  const a = ctx.w[3]
  const b = ctx.w[4] ?? a
  if (ctx.negate) {
    dev.dhcpExcluded = dev.dhcpExcluded.filter(([x, y]) => !(x === a && (y ?? x) === b))
    return
  }
  if (parseIPv4(b) < parseIPv4(a)) {
    ctx.fail('% Invalid range')
    return
  }
  if (!dev.dhcpExcluded.some(([x, y]) => x === a && y === b)) dev.dhcpExcluded.push(ctx.w[4] ? [a, b] : [a])
}

function cfgDhcpSnooping(ctx) {
  const { dev } = ctx
  if (ctx.has('vlan')) {
    const ids = parseVlanList(ctx.after('vlan'))
    if (ctx.negate) dev.dhcpSnooping.vlans = dev.dhcpSnooping.vlans.filter((v) => !ids.includes(v))
    else dev.dhcpSnooping.vlans = [...new Set([...dev.dhcpSnooping.vlans, ...ids])].sort((a, b) => a - b)
  } else dev.dhcpSnooping.enabled = !ctx.negate
}

function cfgArpInspection(ctx) {
  const { dev } = ctx
  const ids = parseVlanList(ctx.after('vlan'))
  if (ctx.negate) dev.arpInspection.vlans = dev.arpInspection.vlans.filter((v) => !ids.includes(v))
  else dev.arpInspection.vlans = [...new Set([...dev.arpInspection.vlans, ...ids])].sort((a, b) => a - b)
}

function cfgNatSource(ctx) {
  const { dev, w } = ctx
  if (ctx.has('static')) {
    const [inside, outside] = [w[5], w[6]]
    dev.nat.statics = dev.nat.statics.filter((s) => s.inside !== inside)
    if (!ctx.negate) dev.nat.statics.push({ inside, outside })
    return
  }
  const acl = w[5]
  if (ctx.negate) {
    dev.nat.rules = dev.nat.rules.filter((r) => r.acl !== acl)
    return
  }
  const rule = { acl, overload: ctx.has('overload') }
  if (ctx.has('pool')) rule.pool = ctx.after('pool')
  else rule.iface = ctx.after('interface')
  dev.nat.rules = dev.nat.rules.filter((r) => r.acl !== acl)
  dev.nat.rules.push(rule)
}

function cfgNatPool(ctx) {
  const { dev, w } = ctx
  const name = w[3]
  if (ctx.negate) {
    dev.nat.pools = dev.nat.pools.filter((p) => p.name !== name)
    return
  }
  const mask = ctx.has('netmask') ? ctx.after('netmask') : ctx.has('prefix-length') ? `${[24, 16, 8, 0].map((b) => ((0xffffffff << (32 - Number(ctx.after('prefix-length')))) >>> b) & 255).join('.')}` : '255.255.255.0'
  dev.nat.pools = dev.nat.pools.filter((p) => p.name !== name)
  dev.nat.pools.push({ name, start: w[4], end: w[5], mask })
}

function cfgNamedAcl(ctx) {
  const { sim, dev, w } = ctx
  const type = w[2]
  const key = w[3]
  if (ctx.negate) {
    delete dev.acls[key]
    return
  }
  const existing = dev.acls[key]
  if (existing && existing.type !== type) {
    ctx.fail('% Access-list type conflicts with prior definition')
    return
  }
  ensureAcl(dev, key, type, !/^\d+$/.test(key))
  sim.mode = { name: 'acl', key, type }
}

function cfgNumberedAcl(ctx) {
  const { dev, w } = ctx
  const key = w[1]
  const type = aclTypeForNumber(key)
  if (ctx.negate) {
    delete dev.acls[key]
    return
  }
  const acl = ensureAcl(dev, key, type, false)
  if (w[2] === 'remark') {
    addAclRule(acl, { remark: w[3] })
    return
  }
  addAclRule(acl, parseAclRule(w.slice(2), type))
}

function cfgUsername(ctx) {
  const { dev, w } = ctx
  const name = w[1]
  if (ctx.negate) {
    dev.users = dev.users.filter((u) => u.name !== name)
    return
  }
  const kind = ctx.has('secret') ? 'secret' : 'password'
  const [hint, text] = splitPw(ctx.after(kind))
  const privilege = ctx.has('privilege') ? Number(ctx.after('privilege')) : null
  const stored = kind === 'secret' ? (hint === '5' ? { type: 5, text: '', raw: text } : { type: 5, text }) : pw(dev, text, hint)
  dev.users = dev.users.filter((u) => u.name !== name)
  dev.users.push({ name, privilege, kind, pw: stored })
}

function cfgEnable(ctx) {
  const { dev, w } = ctx
  const isSecret = w[1] === 'secret'
  if (ctx.negate) {
    if (isSecret) dev.enableSecret = null
    else dev.enablePassword = null
    return
  }
  const [hint, text] = splitPw(w[2])
  if (isSecret) {
    if (dev.enablePassword && dev.enablePassword.text === text) ctx.say('The enable secret you have chosen is the same as your enable password.\nThis is not recommended.  Re-enter the enable secret.')
    dev.enableSecret = hint === '5' ? { type: 5, text: '', raw: text } : { type: 5, text }
  } else {
    if (dev.enableSecret && dev.enableSecret.text === text) {
      ctx.say('The enable password you have chosen is the same as your enable secret.\nThis is not recommended.  Re-enter the enable password.')
      return
    }
    dev.enablePassword = pw(dev, text, hint)
  }
}

function cfgServicePwEnc(ctx) {
  ctx.dev.servicePasswordEncryption = !ctx.negate
  if (!ctx.negate) encryptAll(ctx.dev)
}

function cfgBanner(ctx) {
  const { sim, dev, out } = ctx
  if (ctx.negate) {
    dev.banner = null
    return
  }
  const text = ctx.w[2]
  const delim = text[0]
  const body = text.slice(1)
  const end = body.indexOf(delim)
  if (end >= 0) {
    dev.banner = body.slice(0, end)
    return
  }
  out.add(`Enter TEXT message.  End with the character '${delim}'.`)
  sim.pending = { kind: 'banner', prompt: '', delim, lines: body ? [body] : [] }
}

function keyName(dev) {
  return `${dev.hostname}.${dev.domainName}`
}

function generateKeys(sim, out, bits) {
  const dev = sim.dev
  out.add(`% Generating ${bits} bit RSA keys, keys will be non-exportable...`)
  out.add(`[OK] (elapsed time was ${bits >= 2048 ? 1 : 0} seconds)`)
  const had = dev.rsaModulus
  dev.rsaModulus = bits
  if (!had) logMsg(sim, out, '%SSH-5-ENABLED: SSH 1.99 has been enabled')
}

function cfgCryptoKey(ctx) {
  const { sim, dev, out } = ctx
  if (ctx.has('zeroize')) {
    if (!dev.rsaModulus) {
      ctx.fail('% No Signature RSA Keys found in configuration.')
      return
    }
    sim.pending = { kind: 'zeroize', prompt: '% All keys will be removed.\n% All router certs issued using these keys will also be removed.\nDo you really want to remove these keys? [yes/no]: ' }
    return
  }
  if (dev.hostname === defaultHost(dev)) {
    ctx.fail(`% Please define a hostname other than ${defaultHost(dev)}.`)
    return
  }
  if (!dev.domainName) {
    ctx.fail('% Please define a domain-name first.')
    return
  }
  const bits = ctx.has('modulus') ? Number(ctx.after('modulus')) : null
  if (dev.rsaModulus) {
    out.add(`% You already have RSA keys defined named ${keyName(dev)}.`)
    sim.pending = { kind: 'rsa-replace', prompt: '% Do you really want to replace them? [yes/no]: ', bits }
    return
  }
  out.add(`The name for the keys will be: ${keyName(dev)}`)
  if (bits) {
    out.add(`\n% The key modulus size is ${bits} bits`)
    generateKeys(sim, out, bits)
  } else {
    out.add('Choose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n')
    sim.pending = { kind: 'rsa-bits', prompt: 'How many bits in the modulus [512]: ' }
  }
}

function cfgStpMode(ctx) {
  ctx.dev.stp.mode = ctx.negate ? 'pvst' : ctx.w[2]
}

function cfgStpVlan(ctx) {
  const { sim, dev } = ctx
  const ids = parseVlanList(ctx.w[2])
  if (ctx.negate) {
    for (const id of ids) delete dev.stp.priority[id]
    return
  }
  if (ctx.has('priority')) {
    const p = Number(ctx.after('priority'))
    if (p % 4096 !== 0) {
      ctx.fail('% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  0     4096  8192  12288 16384 20480 24576 28672\n  32768 36864 40960 45056 49152 53248 57344 61440')
      return
    }
    for (const id of ids) dev.stp.priority[id] = p
    return
  }
  const primary = ctx.has('primary')
  for (const id of ids) {
    if (!primary) {
      dev.stp.priority[id] = 28672
      continue
    }
    const st = stpForVlan(sim, id)
    let target = 24576
    if (st && !st.root.local) {
      const rootPrio = st.root.prio - id
      if (rootPrio <= 24576) target = rootPrio - 4096
    }
    if (target < 0) {
      ctx.fail(`% Failed to make the bridge root for vlan ${id}`)
      continue
    }
    dev.stp.priority[id] = Math.min(dev.stp.priority[id] ?? 32768, target)
  }
}

function cfgStpPortfastDefault(ctx) {
  const { dev } = ctx
  if (ctx.has('bpduguard')) dev.stp.bpduguardDefault = !ctx.negate
  else {
    dev.stp.portfastDefault = !ctx.negate
    if (!ctx.negate) ctx.say('%Warning: this command enables portfast by default on all interfaces. You\n should now disable portfast explicitly on switched ports leading to hubs,\n switches and bridges as they may create temporary bridging loops.')
  }
}

function cfgNtp(ctx) {
  const { dev, w } = ctx
  if (w[1] === 'master') {
    dev.ntp.master = ctx.negate ? null : w[2] ? Number(w[2]) : 8
    return
  }
  const s = w[2]
  dev.ntp.servers = dev.ntp.servers.filter((x) => x !== s)
  if (!ctx.negate) dev.ntp.servers.push(s)
}

function cfgLoggingHost(ctx) {
  const { dev, w } = ctx
  const host = w[1] === 'host' ? w[2] : w[1]
  dev.logging.hosts = dev.logging.hosts.filter((h) => h !== host)
  if (!ctx.negate) dev.logging.hosts.push(host)
}

function cfgLoggingTrap(ctx) {
  const { dev, w } = ctx
  if (ctx.negate) {
    dev.logging.trap = null
    return
  }
  const v = w[2] ?? 'informational'
  dev.logging.trap = /^\d$/.test(v) ? LEVELS[Number(v)] : v
}

function cfgLoggingConsole(ctx) {
  ctx.dev.logging.console = !ctx.negate
}

function cfgSnmp(ctx) {
  const { dev, w } = ctx
  const s = dev.snmp
  if (w[1] === 'community') {
    const name = w[2]
    s.communities = s.communities.filter((c) => c.name !== name)
    if (!ctx.negate) s.communities.push({ name, access: ctx.has('rw') ? 'rw' : 'ro', acl: w.length > 3 && !['ro', 'rw'].includes(w[w.length - 1]) ? w[w.length - 1] : null })
  } else if (w[1] === 'host') {
    const host = w[2]
    s.hosts = s.hosts.filter((h) => h.host !== host)
    if (!ctx.negate) s.hosts.push({ host, version: ctx.has('version') ? ctx.after('version') : '1', community: w[w.length - 1] })
  } else if (w[1] === 'enable') s.traps = !ctx.negate
  else if (w[1] === 'location') s.location = ctx.negate ? null : w[2]
  else if (w[1] === 'contact') s.contact = ctx.negate ? null : w[2]
}

function cfgCdpRun(ctx) {
  ctx.dev.cdp = !ctx.negate
}

function cfgLldpRun(ctx) {
  ctx.dev.lldp = !ctx.negate
}

function cfgClockTz(ctx) {
  const { dev, w } = ctx
  dev.clockTz = ctx.negate ? null : { name: w[2], hours: Number(w[3]), mins: w[4] ? Number(w[4]) : 0 }
}

function cfgErrdisable(ctx) {
  const { dev, w } = ctx
  if (w[2] === 'interval') dev.errdisable.interval = ctx.negate ? null : Number(w[3])
  else {
    const c = w[3]
    dev.errdisable.causes = dev.errdisable.causes.filter((x) => x !== c)
    if (!ctx.negate) dev.errdisable.causes.push(c)
  }
}

function cfgMinLength(ctx) {
  ctx.dev.passwordMinLength = ctx.negate ? null : Number(ctx.w[3])
}

function cfgHttp(ctx) {
  if (ctx.has('secure-server')) ctx.dev.httpsServer = !ctx.negate
  else ctx.dev.httpServer = !ctx.negate
}

function cfgIpv6Routing(ctx) {
  ctx.dev.ipv6Routing = !ctx.negate
}

// =====================================================================
// Interface configuration commands
// =====================================================================

function needSwitchport(ctx) {
  const ifs = targets(ctx)
  if (ifs.some((i) => i.switchport === undefined)) {
    ctx.invalidAt(0)
    return null
  }
  if (ifs.some((i) => i.switchport === false) && ctx.w[0] === 'switchport' && ctx.w.length > 1) {
    ctx.fail('% Interface is not a switchport.')
    return null
  }
  return ifs
}

/** Settings on a port-channel apply to its members too. */
function withMembers(ctx, ifs) {
  const all = [...ifs]
  for (const i of ifs) {
    if (!/^Port-channel/.test(i.name)) continue
    const id = Number(i.name.slice(12))
    for (const m of Object.values(ctx.dev.interfaces)) if (m.channelGroup?.id === id && !all.includes(m)) all.push(m)
  }
  return all
}

function ifDescription(ctx) {
  for (const i of targets(ctx)) i.description = ctx.negate ? null : ctx.w[1]
}

function ifShutdown(ctx) {
  const { sim } = ctx
  for (const i of targets(ctx)) {
    i.shutdown = !ctx.negate
    if (i.shutdown) clearErrDisable(sim, i.name)
  }
}

function ifIpAddress(ctx) {
  const { dev, w } = ctx
  const ifs = targets(ctx)
  if (ifs.some((i) => i.switchport === true)) {
    ctx.fail('% IP addresses may not be configured on L2 links.')
    return
  }
  if (ctx.negate) {
    for (const i of ifs) {
      if (w[2] && ctx.has('secondary')) i.secondary = i.secondary.filter((s) => s.ip !== w[2])
      else {
        i.ip = null
        i.mask = null
        i.dhcpClient = false
      }
    }
    return
  }
  if (w[2] === 'dhcp') {
    for (const i of ifs) {
      i.dhcpClient = true
      i.ip = null
      i.mask = null
    }
    return
  }
  const [ip, mask] = [w[2], w[3]]
  const len = maskToPrefix(mask)
  if (len === null) {
    ctx.fail(`Bad mask 0x${(parseIPv4(mask) >>> 0).toString(16).toUpperCase()} for address ${ip}`)
    return
  }
  const n = parseIPv4(ip)
  if (len < 31) {
    const hostBits = (2 ** (32 - len) - 1) >>> 0
    if ((n & hostBits) === 0 || (n & hostBits) >>> 0 === hostBits) {
      ctx.fail(`Bad mask /${len} for address ${ip}`)
      return
    }
  }
  for (const i of ifs) {
    if (isSubif(i.name) && i.encap == null) {
      ctx.fail('% Configuring IP routing on a LAN subinterface is only allowed if that\nsubinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,\nor ISL vLAN.')
      return
    }
    const clash = Object.values(dev.interfaces).find((o) => o !== i && o.ip && (inPrefix(ip, o.ip, Math.min(len, maskToPrefix(o.mask))) || inPrefix(o.ip, ip, Math.min(len, maskToPrefix(o.mask)))))
    if (clash && !ctx.has('secondary')) {
      ctx.fail(`% ${ipNetwork(ip, len)} overlaps with ${clash.name}`)
      return
    }
    if (ctx.has('secondary')) {
      if (!i.secondary.some((s) => s.ip === ip)) i.secondary.push({ ip, mask })
    } else {
      i.ip = ip
      i.mask = mask
      i.dhcpClient = false
    }
  }
}

function ipNetwork(ip, len) {
  const n = parseIPv4(ip)
  const m = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0
  return [24, 16, 8, 0].map((b) => (((n & m) >>> 0) >>> b) & 255).join('.')
}

function ifSimple(field, valueFn) {
  return (ctx) => {
    for (const i of targets(ctx)) i[field] = valueFn(ctx)
  }
}

function ifSwitchportBare(ctx) {
  const ifs = targets(ctx)
  if (ifs.some((i) => i.switchport === undefined)) return ctx.invalidAt(0)
  for (const i of ifs) {
    i.switchport = !ctx.negate
    if (ctx.negate) {
      i.ip = null
      i.mask = null
    }
  }
}

function ifSwMode(ctx) {
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  const mode = ctx.negate ? 'dynamic auto' : ctx.w[2] === 'dynamic' ? `dynamic ${ctx.w[3]}` : ctx.w[2]
  if (mode.startsWith('dynamic') && ifs.some((i) => i.nonegotiate)) {
    ctx.fail("Command rejected: Conflict between 'nonegotiate' and 'dynamic' status.")
    return
  }
  for (const i of withMembers(ctx, ifs)) i.mode = mode
}

function ifAccessVlan(ctx) {
  const { dev } = ctx
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  const id = ctx.negate ? 1 : Number(ctx.w[3])
  if (!ctx.negate && dev.vlans[id] == null) {
    if (dev.vtpMode === 'client') {
      ctx.fail('% Access VLAN does not exist.')
      return
    }
    ctx.say(`% Access VLAN does not exist. Creating vlan ${id}`)
    dev.vlans[id] = `VLAN${String(id).padStart(4, '0')}`
  }
  for (const i of withMembers(ctx, ifs)) i.accessVlan = id
}

function ifVoiceVlan(ctx) {
  const { dev } = ctx
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  const id = ctx.negate ? null : Number(ctx.w[3])
  if (id != null && dev.vlans[id] == null && dev.vtpMode !== 'client') {
    ctx.say(`% Voice VLAN does not exist. Creating vlan ${id}`)
    dev.vlans[id] = `VLAN${String(id).padStart(4, '0')}`
  }
  for (const i of ifs) i.voiceVlan = id
}

function ifNativeVlan(ctx) {
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  for (const i of withMembers(ctx, ifs)) i.nativeVlan = ctx.negate ? 1 : Number(ctx.w[4])
}

function ifAllowedVlan(ctx) {
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  const w = ctx.w
  const op = w[4]
  for (const i of withMembers(ctx, ifs)) {
    if (ctx.negate || op === 'all') {
      i.allowed = null
      continue
    }
    if (op === 'none') {
      i.allowed = ''
      continue
    }
    const all = Array.from({ length: 4094 }, (_, k) => k + 1)
    const cur = i.allowed == null ? all : i.allowed === '' ? [] : parseVlanList(i.allowed)
    let next
    if (op === 'add') next = [...new Set([...cur, ...parseVlanList(w[5])])]
    else if (op === 'remove') next = cur.filter((v) => !parseVlanList(w[5]).includes(v))
    else if (op === 'except') next = all.filter((v) => !parseVlanList(w[5]).includes(v))
    else next = parseVlanList(op)
    next.sort((a, b) => a - b)
    i.allowed = next.length === 4094 ? null : formatVlanList(next)
  }
}

function ifTrunkEncap(ctx) {
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  for (const i of ifs) i.trunkEncap = ctx.negate || ctx.w[3] === 'negotiate' ? null : ctx.w[3]
}

function ifNonegotiate(ctx) {
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  if (!ctx.negate && ifs.some((i) => i.mode.startsWith('dynamic'))) {
    ctx.fail("Command rejected: Conflict between 'nonegotiate' and 'dynamic' status.")
    return
  }
  for (const i of ifs) i.nonegotiate = !ctx.negate
}

function ifPortSecurity(ctx) {
  const { sim } = ctx
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  const w = ctx.w
  const sub = w[2]
  for (const i of ifs) {
    if (!sub) {
      if (!ctx.negate && i.mode.startsWith('dynamic')) {
        ctx.fail(`Command rejected: ${i.name} is a dynamic port.`)
        return
      }
      if (ctx.negate) {
        if (i.portSecurity) i.portSecurity.enabled = false
        if (sim.op.errInfo[i.name]?.reason === 'psecure-violation') clearErrDisable(sim, i.name)
      } else (i.portSecurity ??= newPortSecurity()).enabled = true
      continue
    }
    const ps = (i.portSecurity ??= newPortSecurity())
    if (sub === 'maximum') ps.max = ctx.negate ? 1 : Number(w[3])
    else if (sub === 'violation') ps.violation = ctx.negate ? 'shutdown' : w[3]
    else if (sub === 'aging') ps.aging = ctx.negate ? null : Number(w[4])
    else if (sub === 'mac-address') {
      if (w[3] === 'sticky') {
        if (w[4]) {
          const mac = w[4].toLowerCase()
          ps.stickyMacs = ps.stickyMacs.filter((m) => m !== mac)
          if (!ctx.negate) ps.stickyMacs.push(mac)
        } else {
          ps.sticky = !ctx.negate
          if (ctx.negate) ps.stickyMacs = []
        }
      } else {
        const mac = w[3].toLowerCase()
        ps.macs = ps.macs.filter((m) => m !== mac)
        if (!ctx.negate) ps.macs.push(mac)
      }
    }
  }
}

const proto = (mode) => (['active', 'passive'].includes(mode) ? 'lacp' : ['desirable', 'auto'].includes(mode) ? 'pagp' : 'on')

function ifChannelGroup(ctx) {
  const { dev, out } = ctx
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  if (ctx.negate) {
    for (const i of ifs) i.channelGroup = null
    return
  }
  const id = Number(ctx.w[1])
  const mode = ctx.w[3]
  const existing = Object.values(dev.interfaces).find((i) => i.channelGroup?.id === id && !ifs.includes(i))
  if (existing && proto(existing.channelGroup.mode) !== proto(mode)) {
    ctx.fail(`Command rejected (Channel protocol mismatch for interface ${ifs[0].name.replace('GigabitEthernet', 'Gi')} in group ${id}): the interface can not be added to the channel group`)
    return
  }
  const poName = `Port-channel${id}`
  if (!dev.interfaces[poName]) {
    out.add(`Creating a port-channel interface Port-channel ${id}`)
    const po = ensureIf(dev, poName)
    po.shutdown = false
    for (const k of ['mode', 'accessVlan', 'nativeVlan', 'allowed', 'trunkEncap', 'nonegotiate']) po[k] = ifs[0][k]
  }
  for (const i of ifs) i.channelGroup = { id, mode }
}

function ifStp(ctx) {
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  const w = ctx.w
  const what = w[1]
  for (const i of ifs) {
    if (what === 'portfast') {
      if (ctx.negate) i.portfast = null
      else i.portfast = w[2] === 'trunk' ? 'trunk' : w[2] === 'disable' ? 'disable' : 'enable'
    } else if (what === 'bpduguard') i.bpduguard = ctx.negate ? null : w[2]
    else if (what === 'bpdufilter') i.bpdufilter = ctx.negate ? null : w[2]
    else if (what === 'guard') {
      const before = i.guard
      i.guard = ctx.negate || w[2] === 'none' ? null : w[2]
      if (before !== i.guard && (before === 'root' || i.guard === 'root')) logMsg(ctx.sim, ctx.out, `%SPANTREE-2-ROOTGUARD_CONFIG_CHANGE: Root guard ${i.guard === 'root' ? 'enabled' : 'disabled'} on port ${i.name}.`)
      if (before !== i.guard && (before === 'loop' || i.guard === 'loop')) logMsg(ctx.sim, ctx.out, `%SPANTREE-2-LOOPGUARD_CONFIG_CHANGE: Loop guard ${i.guard === 'loop' ? 'enabled' : 'disabled'} on port ${i.name}.`)
    }
    else if (what === 'cost') i.stpCost = ctx.negate ? null : Number(w[2])
    else if (what === 'port-priority') i.stpPrio = ctx.negate ? null : Number(w[2])
  }
  if (what === 'portfast' && !ctx.negate && w[2] !== 'disable') {
    const name = ifs.length > 1 || ctx.sim.mode.range ? 'the range' : ifs[0].name
    ctx.say(
      '%Warning: portfast should only be enabled on ports connected to a single\n host. Connecting hubs, concentrators, switches, bridges, etc... to this\n interface  when portfast is enabled, can cause temporary bridging loops.\n Use with CAUTION\n'
    )
    if (w[2] !== 'trunk' && ifs.some((i) => i.mode !== 'access')) ctx.say(`%Portfast has been configured on ${name} but will only\n have effect when the interface is in a non-trunking mode.`)
  }
}

function ifEncapsulation(ctx) {
  const { dev } = ctx
  const ifs = targets(ctx)
  if (ifs.some((i) => !isSubif(i.name))) return ctx.invalidAt(0)
  for (const i of ifs) {
    if (ctx.negate) {
      i.encap = null
      continue
    }
    const vid = Number(ctx.w[2])
    const clash = Object.values(dev.interfaces).find((o) => o !== i && isSubif(o.name) && parentIf(o.name) === parentIf(i.name) && o.encap === vid)
    if (clash) {
      ctx.fail(`Configuration of multiple subinterfaces of the same main\ninterface with the same VID (${vid}) is not permitted.\nThis VID is already configured on ${clash.name}.`)
      return
    }
    i.encap = vid
    i.encapNative = ctx.has('native')
  }
}

function ifStandby(ctx) {
  const w = ctx.w
  const ifs = targets(ctx)
  if (w[1] === 'version') {
    for (const i of ifs) i.hsrpVersion = ctx.negate ? 1 : Number(w[2])
    return
  }
  const group = Number(w[1])
  for (const i of ifs) {
    if (i.hsrpVersion === 1 && group > 255) {
      ctx.fail('% Invalid group number, valid range is 0-255 for version 1')
      return
    }
    let g = i.hsrp.find((x) => x.group === group)
    if (!g) {
      if (ctx.negate) continue
      g = { group, ip: null, priority: null, preempt: false }
      i.hsrp.push(g)
      i.hsrp.sort((a, b) => a.group - b.group)
    }
    const what = w[2]
    if (!what && ctx.negate) i.hsrp = i.hsrp.filter((x) => x.group !== group)
    else if (what === 'ip') g.ip = ctx.negate ? null : w[3] ?? g.ip
    else if (what === 'priority') g.priority = ctx.negate ? null : Number(w[3])
    else if (what === 'preempt') g.preempt = !ctx.negate
  }
}

function ifNat(ctx) {
  for (const i of targets(ctx)) {
    if (ctx.negate) {
      if (i.natRole === ctx.w[2]) i.natRole = null
    } else i.natRole = ctx.w[2]
  }
}

function ifHelper(ctx) {
  const a = ctx.w[2]
  for (const i of targets(ctx)) {
    if (ctx.negate) i.helpers = a ? i.helpers.filter((h) => h !== a) : []
    else if (!i.helpers.includes(a)) i.helpers.push(a)
  }
}

function ifAccessGroup(ctx) {
  const [acl, dir] = [ctx.w[2], ctx.w[3]]
  for (const i of targets(ctx)) {
    if (dir === 'in') i.aclIn = ctx.negate ? null : acl
    else i.aclOut = ctx.negate ? null : acl
  }
}

function ifDhcpSnoop(ctx) {
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  for (const i of ifs) {
    if (ctx.has('trust')) i.dhcpSnoopTrust = !ctx.negate
    else i.dhcpSnoopRate = ctx.negate ? null : Number(ctx.w[5])
  }
}

function ifArpTrust(ctx) {
  const ifs = needSwitchport(ctx)
  if (!ifs) return
  for (const i of ifs) i.arpTrust = !ctx.negate
}

function ifOspf(ctx) {
  const w = ctx.w
  for (const i of targets(ctx)) {
    const o = (i.ospf ??= {})
    if (/^\d+$/.test(w[2])) {
      if (ctx.negate) {
        delete o.process
        delete o.area
      } else {
        o.process = Number(w[2])
        o.area = /^\d+$/.test(w[4]) ? Number(w[4]) : w[4]
      }
    } else if (w[2] === 'cost') o.cost = ctx.negate ? undefined : Number(w[3])
    else if (w[2] === 'priority') o.priority = ctx.negate ? undefined : Number(w[3])
    else if (w[2] === 'network') o.network = ctx.negate ? undefined : w[3]
    else if (w[2] === 'hello-interval') o.hello = ctx.negate ? undefined : Number(w[3])
    else if (w[2] === 'dead-interval') o.dead = ctx.negate ? undefined : Number(w[3])
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  }
}

function ifIpv6Address(ctx) {
  const w = ctx.w
  const ifs = targets(ctx)
  if (ifs.some((i) => i.switchport === true)) return ctx.invalidAt(0)
  if (ctx.negate && !w[2]) {
    for (const i of ifs) {
      i.ipv6 = []
      i.linkLocal = null
    }
    return
  }
  if (ctx.has('link-local')) {
    const a = normIPv6(w[2])
    if (!/^FE[89AB]/i.test(a)) {
      ctx.fail('% Invalid link-local address')
      return
    }
    for (const i of ifs) i.linkLocal = ctx.negate ? null : a
    return
  }
  const p = parseIPv6Prefix(w[2])
  const eui = ctx.has('eui-64')
  const text = eui ? `${ipv6ToStr(ipv6Network(p.addr, p.len))}/${p.len} eui-64` : `${ipv6ToStr(p.addr)}/${p.len}`
  for (const i of ifs) {
    i.ipv6 = i.ipv6.filter((x) => x !== text)
    if (!ctx.negate) i.ipv6.push(text)
  }
}

function ifIpv6Enable(ctx) {
  for (const i of targets(ctx)) i.ipv6Enable = !ctx.negate
}

function ifCdp(ctx) {
  for (const i of targets(ctx)) i.cdp = !ctx.negate
}

function ifLldp(ctx) {
  for (const i of targets(ctx)) {
    if (ctx.w[1] === 'transmit') i.lldpTx = !ctx.negate
    else i.lldpRx = !ctx.negate
  }
}

// =====================================================================
// Sub-mode commands (VLAN, line, OSPF, DHCP pool, ACL)
// =====================================================================

function vlanName(ctx) {
  const { sim, dev } = ctx
  for (const id of sim.mode.ids) {
    if (id === 1) {
      ctx.fail('%Default VLAN 1 may not have its name changed.')
      continue
    }
    dev.vlans[id] = ctx.negate ? `VLAN${String(id).padStart(4, '0')}` : ctx.w[1].slice(0, 32)
  }
}

function lineGroups(ctx) {
  return ctx.sim.mode.groups.map((g) => ctx.dev.lines[g])
}

function linePassword(ctx) {
  const { dev } = ctx
  const [hint, text] = splitPw(ctx.w[1] ?? '')
  for (const l of lineGroups(ctx)) l.password = ctx.negate ? null : pw(dev, text, hint)
}

function lineLogin(ctx) {
  const { sim, dev } = ctx
  const local = ctx.has('local')
  for (const g of sim.mode.groups) {
    const l = dev.lines[g]
    l.login = ctx.negate ? 'none' : local ? 'local' : 'line'
    if (!ctx.negate && !local && !l.password) ctx.say(`% Login disabled on line ${lineNumber(dev, g)}, until 'password' is set`)
  }
}

function lineTransport(ctx) {
  const list = ctx.w.slice(2)
  for (const l of lineGroups(ctx)) l.transport = ctx.negate ? null : list
}

function lineExecTimeout(ctx) {
  const m = Number(ctx.w[1])
  const s = ctx.w[2] != null ? Number(ctx.w[2]) : 0
  for (const l of lineGroups(ctx)) l.execTimeout = ctx.negate || (m === 10 && s === 0) ? null : [m, s]
}

function lineLoggingSync(ctx) {
  for (const l of lineGroups(ctx)) l.loggingSync = !ctx.negate
}

function lineAccessClass(ctx) {
  for (const l of lineGroups(ctx)) l.accessClass = ctx.negate ? null : { acl: ctx.w[1], dir: ctx.w[2] }
}

function linePrivilege(ctx) {
  for (const l of lineGroups(ctx)) l.privilege = ctx.negate ? null : Number(ctx.w[2])
}

function ospfNetwork(ctx) {
  const { dev, w } = ctx
  const net = applyWildcard(w[1], w[2])
  const area = /^\d+$/.test(w[4]) ? Number(w[4]) : w[4]
  const o = dev.ospf
  if (ctx.negate) {
    o.networks = o.networks.filter((n) => !(n.network === net && n.wildcard === w[2]))
    return
  }
  const same = o.networks.find((n) => n.network === net && n.wildcard === w[2])
  if (same) {
    if (String(same.area) !== String(area)) ctx.fail(`% OSPF: "network ${net} ${w[2]} area ${same.area}" is already configured`)
    return
  }
  o.networks.push({ network: net, wildcard: w[2], area })
}

function ospfRouterIdCmd(ctx) {
  const { sim, dev } = ctx
  if (ctx.negate) {
    dev.ospf.routerId = null
    return
  }
  const rid = ctx.w[1]
  dev.ospf.routerId = rid
  if (sim.op.ospfRid && sim.op.ospfRid !== rid) ctx.say('% OSPF: Reload or use "clear ip ospf process" command, for this to take effect')
  else sim.op.ospfRid = rid
}

function ospfPassive(ctx) {
  const o = ctx.dev.ospf
  const target = ctx.w[1]
  if (target === 'default') {
    o.passiveDefault = !ctx.negate
    o.passive = []
    o.noPassive = []
    return
  }
  if (o.passiveDefault) {
    o.noPassive = o.noPassive.filter((n) => n !== target)
    if (ctx.negate) o.noPassive.push(target)
  } else {
    o.passive = o.passive.filter((n) => n !== target)
    if (!ctx.negate) o.passive.push(target)
  }
}

function ospfDefaultInfo(ctx) {
  ctx.dev.ospf.defaultOriginate = ctx.negate ? null : ctx.has('always') ? 'always' : 'yes'
}

function ospfRefBw(ctx) {
  ctx.dev.ospf.refBw = ctx.negate ? null : Number(ctx.w[2])
  if (!ctx.negate) ctx.say('% OSPF: Reference bandwidth is changed.\n        Please ensure reference bandwidth is consistent across all routers.')
}

function ospfMaxPaths(ctx) {
  ctx.dev.ospf.maxPaths = ctx.negate ? null : Number(ctx.w[1])
}

function poolOf(ctx) {
  return ctx.dev.dhcpPools.find((p) => p.name === ctx.sim.mode.pool)
}

function dhcpNetwork(ctx) {
  const p = poolOf(ctx)
  if (ctx.negate) {
    p.network = null
    p.mask = null
    return
  }
  const ip = ctx.w[1]
  let mask = ctx.w[2]
  if (!mask) {
    const first = Number(ip.split('.')[0])
    mask = first < 128 ? '255.0.0.0' : first < 192 ? '255.255.0.0' : '255.255.255.0'
  } else if (mask.startsWith('/')) mask = [24, 16, 8, 0].map((b) => ((0xffffffff << (32 - Number(mask.slice(1)))) >>> b) & 255).join('.')
  if (maskToPrefix(mask) === null) {
    ctx.fail('% Invalid mask')
    return
  }
  p.network = ipNetwork(ip, maskToPrefix(mask))
  p.mask = mask
}

function dhcpList(field) {
  return (ctx) => {
    const p = poolOf(ctx)
    p[field] = ctx.negate ? [] : ctx.w.slice(1)
  }
}

function dhcpDomain(ctx) {
  poolOf(ctx).domain = ctx.negate ? null : ctx.w[1]
}

function dhcpLease(ctx) {
  poolOf(ctx).lease = ctx.negate ? null : ctx.w.slice(1).join(' ')
}

function aclEntry(ctx) {
  const acl = ensureAcl(ctx.dev, ctx.sim.mode.key, ctx.sim.mode.type, !/^\d+$/.test(ctx.sim.mode.key))
  const w = ctx.w
  const seq = /^\d+$/.test(w[0]) ? Number(w[0]) : null
  const body = seq != null ? w.slice(1) : w
  if (ctx.negate) {
    if (seq != null && body.length === 0) {
      acl.rules = acl.rules.filter((r) => r.seq !== seq)
      return
    }
    const rule = parseAclRule(body, acl.type)
    const key = JSON.stringify({ ...rule })
    acl.rules = acl.rules.filter((r) => {
      const { seq: _s, ...rest } = r
      return JSON.stringify(rest) !== key
    })
    return
  }
  if (body[0] === 'remark') {
    addAclRule(acl, { remark: body[1] })
    return
  }
  if (!addAclRule(acl, parseAclRule(body, acl.type), seq)) ctx.fail('% Duplicate sequence number')
}

// =====================================================================
// Grammar trees
// =====================================================================

const PORT_HELP = { bgp: 'Border Gateway Protocol (179)', domain: 'Domain Name Service (53)', ftp: 'File Transfer Protocol (21)', 'ftp-data': 'FTP data connections (20)', pop3: 'Post Office Protocol v3 (110)', smtp: 'Simple Mail Transport Protocol (25)', telnet: 'Telnet (23)', www: 'World Wide Web (HTTP, 80)', bootpc: 'Bootstrap Protocol (BOOTP) client (68)', bootps: 'Bootstrap Protocol (BOOTP) server (67)', ntp: 'Network Time Protocol (123)', snmp: 'Simple Network Management Protocol (161)', snmptrap: 'SNMP Traps (162)', syslog: 'System Logger (514)', tftp: 'Trivial File Transfer Protocol (69)' }
const TCP_NAMES = ['bgp', 'domain', 'ftp', 'ftp-data', 'pop3', 'smtp', 'telnet', 'www'].filter((n) => n in TCP_PORTS)
const UDP_NAMES = ['bootpc', 'bootps', 'domain', 'ntp', 'snmp', 'snmptrap', 'syslog', 'tftp'].filter((n) => n in UDP_PORTS)

function portNodes(next, run, protoName) {
  const flags = run ? { run } : {}
  return [A('<0-65535>|Port number', next, flags), ...(protoName === 'udp' ? UDP_NAMES : TCP_NAMES).map((n) => K(`${n}|${PORT_HELP[n]}`, next, flags))]
}

function portOps(next, run, protoName) {
  const one = portNodes(next, run, protoName)
  return [
    K('eq|Match only packets on a given port number', one),
    K('gt|Match only packets with a greater port number', one),
    K('lt|Match only packets with a lower port number', one),
    K('neq|Match only packets not on a given port number', one),
    K('range|Match only packets in the range of port numbers', portNodes(one, null, protoName))
  ]
}

function addrNodes(next, role, run) {
  const flags = run ? { run } : {}
  const lower = role.toLowerCase()
  return [
    A(`A.B.C.D|${role} address`, [A(`A.B.C.D|${role} wildcard bits`, next, flags)]),
    K(`any|Any ${lower} host`, next, flags),
    K(`host|A single ${lower} host`, [A(`A.B.C.D|${role} address`, next, flags)])
  ]
}

function stdBody(run) {
  const log = [K('log|Log matches against this entry', [], run)]
  return [A('A.B.C.D|Address to match', [A('A.B.C.D|Wildcard bits', log, run), ...log], run), K('any|Any source host', log, run), K('host|A single host address', [A('A.B.C.D|Host address', log, run)])]
}

function extBody(run) {
  const tail = [K('log|Log matches against this entry', [], run)]
  const make = (p) => {
    const ports = p === 'tcp' || p === 'udp'
    const end = p === 'tcp' ? [K('established|Match established connections', tail, run), ...tail] : tail
    const afterDst = ports ? [...portOps(end, run, p), ...end] : end
    const dst = addrNodes(afterDst, 'Destination', run)
    const afterSrc = ports ? [...portOps(dst, null, p), ...dst] : dst
    return addrNodes(afterSrc, 'Source', null)
  }
  return [
    K('ahp|Authentication Header Protocol', make('ahp')),
    K('eigrp|Cisco\'s EIGRP routing protocol', make('eigrp')),
    K('esp|Encapsulation Security Payload', make('esp')),
    K('gre|Cisco\'s GRE tunneling', make('gre')),
    K('icmp|Internet Control Message Protocol', make('icmp')),
    K('ip|Any Internet Protocol', make('ip')),
    K('ospf|OSPF routing protocol', make('ospf')),
    K('tcp|Transmission Control Protocol', make('tcp')),
    K('udp|User Datagram Protocol', make('udp'))
  ]
}

function aclActions(type, run) {
  const body = type === 'standard' ? () => stdBody(run) : () => extBody(run)
  return [K('deny|Specify packets to reject', body()), K('permit|Specify packets to forward', body())]
}

function showTree(kind, priv) {
  const sw = kind === 'switch'
  const ifx = (fn, more = []) => IFACE(kind, [...more, PIPE], { run: (ctx) => ctx.print(fn(ctx)) })
  const accessListArgs = [A('<1-2699>|ACL number', [PIPE], (ctx) => ctx.print(S.showAccessLists(ctx.sim, ctx.w[ctx.w.length - 1]))), A('WORD|ACL name', [PIPE], (ctx) => ctx.print(S.showAccessLists(ctx.sim, ctx.w[ctx.w.length - 1])))]
  const ipChildren = [
    SH('access-lists|List IP access lists', (c) => S.showAccessLists(c.sim), accessListArgs),
    SH('arp|IP ARP table', (c) => S.showArp(c.sim), sw ? [SH('inspection|Show ARP Inspection', (c) => S.showIpArpInspection(c.sim))] : []),
    K('dhcp|Show items in the DHCP database', [SH('binding|DHCP address bindings', (c) => S.showIpDhcpBinding(c.sim)), SH('pool|DHCP pools information', (c) => S.showIpDhcpPool(c.sim)), ...(sw ? [SH('snooping|DHCP snooping', (c) => S.showIpDhcpSnooping(c.sim))] : [])]),
    SH('interface|IP interface status and configuration', (c) => S.showIpInterface(c.sim), [SH('brief|Brief summary of IP status and configuration', (c) => S.showIpIntBrief(c.sim)), ...ifx((c) => S.showIpInterface(c.sim, c.w[3]))]),
    K('nat|IP NAT information', [SH('statistics|Translation statistics', (c) => S.showIpNatStatistics(c.sim)), SH('translations|Translation entries', (c) => S.showIpNatTranslations(c.sim))]),
    SH('ospf|OSPF information', (c) => S.showIpOspf(c.sim), [
      SH('interface|Interface information', (c) => S.showIpOspfInterfaceBrief(c.sim), [SH('brief|Brief summary of OSPF interface', (c) => S.showIpOspfInterfaceBrief(c.sim))]),
      SH('neighbor|Neighbor list', (c) => S.showIpOspfNeighbor(c.sim))
    ]),
    SH('protocols|IP routing protocol process parameters and statistics', (c) => S.showIpProtocols(c.sim)),
    SH('route|IP routing table', (c) => S.showIpRoute(c.sim), [
      A('A.B.C.D|Network to display information about or host', [PIPE], (c) => c.print(S.showIpRoute(c.sim, c.w[3]))),
      SH('connected|Connected networks', (c) => S.showIpRoute(c.sim, 'connected')),
      SH('ospf|Open Shortest Path First (OSPF)', (c) => S.showIpRoute(c.sim, 'ospf')),
      SH('static|Static routes', (c) => S.showIpRoute(c.sim, 'static'))
    ]),
    SH('ssh|Information on SSH', (c) => S.showIpSsh(c.sim))
  ]
  const nodes = [
    SH('access-lists|List access lists', (c) => S.showAccessLists(c.sim), accessListArgs),
    SH('arp|ARP table', (c) => S.showArp(c.sim)),
    SH('cdp|CDP information', (c) => S.showCdp(c.sim), [SH('neighbors|CDP neighbor entries', (c) => S.showCdpNeighbors(c.sim, false), [SH('detail|Show detailed information', (c) => S.showCdpNeighbors(c.sim, true))])]),
    SH('clock|Display the system clock', (c) => S.showClock(c.sim)),
    SH('history|Display the session command history', (c) => S.showHistory(c.sim)),
    SH('interfaces|Interface status and configuration', (c) => S.showInterfaces(c.sim), [
      ...ifx((c) => S.showInterfaces(c.sim, c.w[2]), sw ? [SH('switchport|Show interface switchport information', (c) => S.showInterfacesSwitchport(c.sim, c.w[2]))] : []),
      SH('description|Show interface description', (c) => S.showInterfacesDescription(c.sim)),
      ...(sw
        ? [
            SH('status|Show interface line status', (c) => S.showInterfacesStatus(c.sim), [SH('err-disabled|Show interfaces in err-disabled state', (c) => S.showInterfacesStatusErr(c.sim))]),
            SH('switchport|Show interface switchport information', (c) => S.showInterfacesSwitchport(c.sim)),
            SH('trunk|Show interface trunk information', (c) => S.showInterfacesTrunk(c.sim))
          ]
        : [])
    ]),
    K('ip|IP information', ipChildren),
    K('ipv6|IPv6 information', [
      K('interface|IPv6 interface status and configuration', [SH('brief|Brief summary of IPv6 status and configuration', (c) => S.showIpv6IntBrief(c.sim))]),
      SH('route|Show IPv6 route table entries', (c) => S.showIpv6Route(c.sim), [SH('connected|Connected routes', (c) => S.showIpv6Route(c.sim, 'connected')), SH('static|Static routes', (c) => S.showIpv6Route(c.sim, 'static'))])
    ]),
    SH('lldp|LLDP information', (c) => S.showLldp(c.sim), [SH('neighbors|LLDP neighbor entries', (c) => S.showLldpNeighbors(c.sim, false), [SH('detail|Show detailed information', (c) => S.showLldpNeighbors(c.sim, true))])]),
    SH('logging|Show the contents of logging buffers', (c) => S.showLogging(c.sim)),
    K('ntp|Network time protocol', [SH('associations|NTP associations', (c) => S.showNtpAssociations(c.sim)), SH('status|NTP status', (c) => S.showNtpStatus(c.sim))]),
    SH('snmp|snmp statistics', (c) => S.showSnmp(c.sim), [SH('community|show snmp communities', (c) => S.showSnmpCommunity(c.sim)), SH('host|show snmp notification recipients', (c) => S.showSnmpHost(c.sim))]),
    SH('standby|Hot standby protocol information', (c) => S.showStandby(c.sim), [SH('brief|Brief output', (c) => S.showStandbyBrief(c.sim))]),
    SH('users|Display information about terminal lines', () => S.showUsers()),
    SH('version|System hardware and software status', (c) => S.showVersion(c.sim))
  ]
  if (priv) {
    nodes.push(
      SH('running-config|Current operating configuration', (c) => S.showRunning(c.sim), [K('interface|Show interface configuration', IFACE(kind, [PIPE], { run: (c) => c.print(S.showRunning(c.sim, c.w[3])) }))]),
      SH('startup-config|Contents of startup configuration', (c) => S.showStartup(c.sim))
    )
  }
  if (sw) {
    nodes.push(
      SH('etherchannel|EtherChannel information', (c) => S.showEtherchannelSummary(c.sim), [SH('summary|One-line summary per channel-group', (c) => S.showEtherchannelSummary(c.sim))]),
      K('mac|MAC configuration', [SH('address-table|MAC forwarding table', (c) => S.showMacAddressTable(c.sim))]),
      K('errdisable|Error disable', [SH('recovery|Error disable recovery', (c) => S.showErrdisableRecovery(c.sim))]),
      SH('port-security|Show secure port information', (c) => S.showPortSecurity(c.sim), [SH('address|Show secure address', (c) => S.showPortSecurityAddress(c.sim)), K('interface|Show secure interface', IFACE(kind, [PIPE], { run: (c) => c.print(S.showPortSecurityInterface(c.sim, c.w[3])) }, { types: ['GigabitEthernet'] }))]),
      SH('spanning-tree|Spanning tree topology', (c) => S.showSpanningTree(c.sim), [SH('inconsistentports|Show inconsistent ports', (c) => S.showSpanningTreeInconsistent(c.sim)), K('vlan|VLAN Switch Spanning Trees', [A('<1-4094>|VLAN ID', [PIPE], (c) => c.print(S.showSpanningTree(c.sim, Number(c.w[3]))))])]),
      SH('vlan|VTP VLAN status', (c) => S.showVlanBrief(c.sim), [SH('brief|VTP all VLAN status in brief', (c) => S.showVlanBrief(c.sim))]),
      K('vtp|VTP information', [SH('status|VTP domain status', (c) => S.showVtpStatus(c.sim))])
    )
  }
  return K('show|Show running system information', nodes)
}

function execTree(kind, priv) {
  const year = A('<1993-2035>|Year', [], execClockSet)
  const monthArg = (next) => A('MONTH|Month of the year', next, { test: (t) => t.length >= 3 && S.MONTH_NAMES.some((m) => m.startsWith(t.toLowerCase())), label: 'MONTH' })
  const pingTargets = [A('WORD|Ping destination address or hostname', [], execPing)]
  const nodes = [
    K('connect|Open a terminal connection', [A('WORD|IP address or hostname of a remote system', [], execRemote)]),
    K('disable|Turn off privileged commands', [], { run: execDisable, noDo: true }),
    K('disconnect|Disconnect an existing network connection', [], (c) => c.fail('% No connections open')),
    K('enable|Turn on privileged commands', [], { run: execEnable, noDo: true }),
    K('exit|Exit from the EXEC', [], { run: execLogout, noDo: true }),
    K('logout|Exit from the EXEC', [], { run: execLogout, noDo: true }),
    K('ping|Send echo messages', pingTargets),
    showTree(kind, priv),
    K('ssh|Open a secure shell client connection', [K('-l|Log in using this user name', [A('WORD|Login name', [A('WORD|IP address or hostname of a remote system', [], execRemote)])])]),
    K('telnet|Open a telnet connection', [A('WORD|IP address or hostname of a remote system', [], execRemote)]),
    K('terminal|Set terminal line parameters', [
      K('history|Enable and control the command history function', [K('size|Set history buffer size', [A('<0-256>|Size of history buffer', [], noop)])], noop),
      K('length|Set number of lines on a screen', [A('<0-512>|Number of lines on screen (0 for no pausing)', [], noop)]),
      K('monitor|Copy debug output to the current terminal line', [], noop),
      K('no|Negate a command or set its defaults', [K('monitor|Copy debug output to the current terminal line', [], noop)])
    ]),
    K('traceroute|Trace route to destination', [A('WORD|Trace route to destination address or hostname', [], execTraceroute)])
  ]
  if (priv) {
    nodes.push(
      K('clear|Reset functions', [
        K('arp-cache|Clear the entire ARP cache', [], (c) => {
          c.sim.op.arp = []
        }),
        K('counters|Clear counters on one or all interfaces', [], (c) => {
          c.sim.pending = { kind: 'confirm-noop', prompt: 'Clear "show interface" counters on all interfaces [confirm]' }
        }),
        K('ip|IP', [
          K('nat|Clear NAT', [K('translation|Clear dynamic translation', [K('*|Delete all dynamic translations', [], noop)])]),
          K('ospf|OSPF clear commands', [K('process|Reset OSPF process', [], execClearOspf)])
        ]),
        K('mac|MAC forwarding table', [K('address-table|MAC forwarding table', [K('dynamic|dynamic entry type', [], noop)])]),
        K('port-security|Clear secure MAC addresses', ['all|All secure MAC addresses', 'configured|Configured secure MAC addresses', 'dynamic|Dynamic secure MAC addresses', 'sticky|Sticky secure MAC addresses'].map((spec) =>
          K(spec, [K('address|Clear a specific secure MAC address', [A('H.H.H|48 bit mac address', [], execClearPortSecurity)]), K('interface|Clear secure MAC addresses on an interface', IFACE(kind, [], { run: execClearPortSecurity }, { types: ['GigabitEthernet'] }))], execClearPortSecurity)
        ))
      ]),
      K('clock|Manage the system clock', [
        K('set|Set the time and date', [A('hh:mm:ss|Current Time', [A('<1-31>|Day of the month', [monthArg([year])]), monthArg([A('<1-31>|Day of the month', [year])])])])
      ]),
      K('configure|Enter configuration mode', [K('terminal|Configure from the terminal', [], { run: execConfigure, noDo: true })], { run: execConfigure, noDo: true }),
      K('copy|Copy from one file to another', [
        K('running-config|Copy from current system configuration', [K('startup-config|Copy to startup configuration', [], execCopy)]),
        K('startup-config|Copy from startup configuration', [K('running-config|Update (merge with) current system configuration', [], execCopy)])
      ]),
      K('erase|Erase a filesystem', [K('nvram:|Erase nvram: filesystem', [], execErase), K('startup-config|Erase contents of configuration memory', [], execErase)]),
      K('reload|Halt and perform a cold restart', [], { run: execReload, noDo: true }),
      K('undebug|Disable debugging functions (see also \'debug\')', [K('all|Disable all debugging', [], (c) => c.say('All possible debugging has been turned off'))]),
      K('write|Write running configuration to memory, network, or terminal', [K('erase|Erase NV memory', [], execWrite), K('memory|Write to NV memory', [], execWrite), K('terminal|Write to terminal', [], execWrite)], execWrite)
    )
  }
  return nodes
}

/** Commands shared by every configuration mode: end, exit, do, no. */
function withCommon(root, execRoot, exitFn) {
  root.push(
    K('do|To run exec commands in config mode', execRoot, { doExec: true, noNeg: true }),
    K('end|Exit from configure mode', [], { run: (ctx) => enterConfigExit(ctx.sim, ctx.out), noNeg: true }),
    K('exit|Exit from the current mode', [], { run: exitFn, noNeg: true })
  )
  root.push(K('no|Negate a command or set its defaults', root, { negate: true, noNeg: true }))
  return root
}

function configTree(kind, execRoot) {
  const sw = kind === 'switch'
  const ip = (spec, next, extra) => A(`A.B.C.D|${spec}`, next, extra)
  const nums = ['<1-99>|IP standard access list', '<100-199>|IP extended access list', '<1300-1999>|IP standard access list (expanded range)', '<2000-2699>|IP extended access list (expanded range)']
  const numbered = nums.map((spec) => {
    const lo = Number(spec.match(/<(\d+)/)[1])
    const type = aclTypeForNumber(lo)
    return A(spec, [...aclActions(type, cfgNumberedAcl), K('remark|Access list entry comment', [A('LINE|Comment up to 100 characters', [], cfgNumberedAcl)])], { nrun: cfgNumberedAcl })
  })
  const ipRouteTail = (extraNext) => [A('<1-255>|Distance metric for this route', [], cfgIpRoute), ...extraNext]
  const levelWords = LEVELS.map((l, k) => K(`${l}|${['System is unusable', 'Immediate action needed', 'Critical conditions', 'Error conditions', 'Warning conditions', 'Normal but significant conditions', 'Informational messages', 'Debugging messages'][k]} (severity=${k})`, [], cfgLoggingTrap))
  const root = [
    K('access-list|Add an access list entry', numbered),
    K('banner|Define a login banner', [K('motd|Set Message of the Day banner', [A('LINE|c banner-text c, where \'c\' is a delimiting character', [], cfgBanner)], { nrun: cfgBanner })]),
    K('cdp|Global CDP configuration subcommands', [K('run|Enable CDP', [], cfgCdpRun)]),
    K('clock|Configure time-of-day clock', [K('timezone|Configure time zone', [A('WORD|name of time zone', [A('<-23-23>|Hours offset from UTC', [A('<0-59>|Minutes offset from UTC', [], cfgClockTz)], cfgClockTz)])], { nrun: cfgClockTz })]),
    K('crypto|Encryption module', [
      K('key|Long term key operations', [
        K('generate|Generate new keys', [K('rsa|Generate RSA keys', [K('general-keys|Generate a general purpose RSA key pair for signing and encryption', [K('modulus|Provide number of modulus bits on the command line', [A('<360-4096>|size of the key modulus [360-4096]', [], cfgCryptoKey)])], cfgCryptoKey), K('modulus|Provide number of modulus bits on the command line', [A('<360-4096>|size of the key modulus [360-4096]', [], cfgCryptoKey)])], cfgCryptoKey)]),
        K('zeroize|Remove keys', [K('rsa|Remove RSA keys', [], cfgCryptoKey)])
      ])
    ]),
    K('enable|Modify enable password parameters', [
      K('password|Assign the privileged level password (MAX of 25 characters)', [A('LINE|The UNENCRYPTED (cleartext) \'enable\' password', [], cfgEnable)], { nrun: cfgEnable }),
      K('secret|Assign the privileged level secret (MAX of 25 characters)', [A('LINE|The UNENCRYPTED (cleartext) \'enable\' secret', [], cfgEnable)], { nrun: cfgEnable })
    ]),
    K('errdisable|Error disable', [K('recovery|Error disable recovery', [K('cause|Enable error disable recovery for application', ['all', 'bpduguard', 'channel-misconfig', 'psecure-violation'].map((c) => K(`${c}|Enable timer to recover from ${c} error disable state`, [], cfgErrdisable))), K('interval|Error disable recovery timer value', [A('<30-86400>|timer-interval(sec)', [], cfgErrdisable)], { nrun: cfgErrdisable })])]),
    K('hostname|Set system\'s network name', [A('WORD|This system\'s network name', [], cfgHostname)], { nrun: cfgHostname }),
    K('interface|Select an interface to configure', [...IFACE(kind, [], { run: cfgInterface }, { sub: !sw }), K('range|interface range command', [A('LINE|Interface range, for example GigabitEthernet0/1 - 4', [], cfgInterfaceRange)])]),
    K('ip|Global IP configuration subcommands', [
      K('access-list|Named access list', [
        K('extended|Extended Access List', [A('<100-199>|Extended IP access-list number', [], cfgNamedAcl), A('<2000-2699>|Extended IP access-list number (expanded range)', [], cfgNamedAcl), A('ACLNAME|Access-list name', [], cfgNamedAcl)]),
        K('standard|Standard Access List', [A('<1-99>|Standard IP access-list number', [], cfgNamedAcl), A('<1300-1999>|Standard IP access-list number (expanded range)', [], cfgNamedAcl), A('ACLNAME|Access-list name', [], cfgNamedAcl)])
      ]),
      ...(sw ? [K('arp|IP ARP global configuration', [K('inspection|Arp Inspection configuration', [K('vlan|Enable/Disable ARP Inspection on vlans', [A('VLANS|vlan range, example: 1,3-5,7,9-11', [], cfgArpInspection)])])])] : []),
      K('cef|Cisco Express Forwarding', [], noop),
      K('default-gateway|Specify default gateway (if not routing IP)', [ip('Default gateway', [], cfgDefaultGateway)], { nrun: cfgDefaultGateway }),
      K('dhcp|Configure DHCP server and relay parameters', [
        K('excluded-address|Prevent DHCP from assigning certain addresses', [ip('Low IP address', [ip('High IP address', [], cfgDhcpExcluded)], cfgDhcpExcluded)]),
        K('pool|Configure DHCP address pools', [A('WORD|Pool name', [], cfgDhcpPool)]),
        ...(sw ? [K('snooping|DHCP Snooping', [K('vlan|DHCP Snooping vlan', [A('VLANS|DHCP Snooping vlan first number or vlan range,example: 1,3-5,7,9-11', [], cfgDhcpSnooping)])], cfgDhcpSnooping)] : [])
      ]),
      K('domain|IP DNS Resolver', [K('lookup|Enable IP Domain Name System hostname translation', [], cfgDomainLookup), K('name|Define the default domain name', [A('WORD|Default domain name', [], cfgDomainName)], { nrun: cfgDomainName })]),
      K('domain-lookup|Enable IP Domain Name System hostname translation', [], cfgDomainLookup),
      K('domain-name|Define the default domain name', [A('WORD|Default domain name', [], cfgDomainName)], { nrun: cfgDomainName }),
      K('forward-protocol|Controls forwarding of physical and directed IP broadcasts', [K('nd|Sun\'s Network Disk protocol', [], noop)]),
      K('http|HTTP server configuration', [K('secure-server|Enable HTTP secure server', [], cfgHttp), K('server|Enable http server', [], cfgHttp)]),
      K('name-server|Specify address of name server to use', [ip('Domain server IP address (maximum of 6)', [ip('Domain server IP address (maximum of 6)', [ip('Domain server IP address (maximum of 6)', [], cfgNameServer)], cfgNameServer)], cfgNameServer)], { nrun: cfgNameServer }),
      ...(sw
        ? []
        : [
            K('nat|NAT configuration commands', [
              K('inside|Inside address translation', [
                K('source|Source address translation', [
                  K('list|Specify access list describing local addresses', [
                    A('<1-2699>|Access list number for local addresses', [K('interface|Specify interface for global address', IFACE(kind, [K('overload|Overload an address translation', [], cfgNatSource)], { run: cfgNatSource })), K('pool|Name pool of global addresses', [A('WORD|Pool name for global addresses', [K('overload|Overload an address translation', [], cfgNatSource)], cfgNatSource)])], { nrun: cfgNatSource }),
                    A('WORD|Access list name for local addresses', [K('interface|Specify interface for global address', IFACE(kind, [K('overload|Overload an address translation', [], cfgNatSource)], { run: cfgNatSource })), K('pool|Name pool of global addresses', [A('WORD|Pool name for global addresses', [K('overload|Overload an address translation', [], cfgNatSource)], cfgNatSource)])], { nrun: cfgNatSource })
                  ]),
                  K('static|Specify static local->global mapping', [ip('Inside local IP address', [ip('Inside global IP address', [], cfgNatSource)])])
                ])
              ]),
              K('pool|Define pool of addresses', [A('WORD|Pool name', [ip('Start IP address', [ip('End IP address', [K('netmask|Specify the network mask', [ip('Network mask', [], cfgNatPool)]), K('prefix-length|Specify the prefix length', [A('<1-32>|Prefix length', [], cfgNatPool)])])])], { nrun: cfgNatPool })])
            ])
          ]),
      K('route|Establish static routes', [ip('Destination prefix', [ip('Destination prefix mask', [ip('Forwarding router\'s address', ipRouteTail([]), cfgIpRoute), ...IFACE(kind, [ip('Forwarding router\'s address', ipRouteTail([]), cfgIpRoute), ...ipRouteTail([])], { run: cfgIpRoute })], { nrun: cfgIpRoute })])]),
      K('routing|Enable IP routing', [], cfgIpRouting),
      K('ssh|Configure ssh options', [
        K('authentication-retries|Specify number of authentication retries', [A('<0-5>|Number of authentication retries', [], noop)]),
        K('time-out|Specify SSH time-out interval', [A('<1-120>|SSH time-out interval (secs)', [], noop)]),
        K('version|Specify protocol version supported', [A('<1-2>|Protocol version', [], cfgSshVersion)], { nrun: cfgSshVersion })
      ])
    ]),
    K('ipv6|Global IPv6 configuration commands', [
      K('route|Configure static routes', [A('X:X:X:X::X/<0-128>|IPv6 prefix', [A('X:X:X:X::X|IPv6 address of next-hop', [A('<1-254>|Administrative distance', [], cfgIpv6Route)], cfgIpv6Route), ...IFACE(kind, [A('X:X:X:X::X|IPv6 address of next-hop', [A('<1-254>|Administrative distance', [], cfgIpv6Route)], cfgIpv6Route), A('<1-254>|Administrative distance', [], cfgIpv6Route)], { run: cfgIpv6Route })])]),
      K('unicast-routing|Enable unicast routing', [], cfgIpv6Routing)
    ]),
    K('line|Configure a terminal line', [
      K('aux|Auxiliary line', [A('<0-0>|First Line number', [], cfgLine)]),
      K('console|Primary terminal line', [A('<0-0>|First Line number', [], cfgLine)]),
      K('vty|Virtual terminal', [A('<0-15>|First Line number', [A('<1-15>|Last Line number', [], cfgLine)], cfgLine)])
    ]),
    K('lldp|Global LLDP configuration subcommands', [K('run|Enable LLDP', [], cfgLldpRun)]),
    K('logging|Modify message logging facilities', [
      ip('IP address of the logging host', [], cfgLoggingHost),
      K('buffered|Set buffered logging parameters', [A('<4096-2147483647>|Logging buffer size', [], noop), ...LEVELS.map((l) => K(`${l}|Logging severity level`, [], noop))], noop),
      K('console|Set console logging parameters', LEVELS.map((l) => K(`${l}|Logging severity level`, [], cfgLoggingConsole)), cfgLoggingConsole),
      K('host|Set syslog server IP address and parameters', [ip('IP address of the syslog server', [], cfgLoggingHost)]),
      K('trap|Set syslog server logging level', [A('<0-7>|Logging severity level', [], cfgLoggingTrap), ...levelWords], cfgLoggingTrap)
    ]),
    K('ntp|Configure NTP', [
      K('master|Act as NTP master clock', [A('<1-15>|Stratum number', [], cfgNtp)], cfgNtp),
      K('server|Configure NTP server', [ip('IP address of peer', [K('prefer|Prefer this peer when possible', [], cfgNtp)], cfgNtp)])
    ]),
    K('router|Enable a routing process', [K('ospf|Open Shortest Path First (OSPF)', [A('<1-65535>|Process ID', [], cfgRouterOspf)])]),
    K('security|Infra Security CLIs', [K('passwords|Password security configuration', [K('min-length|Minimum length of passwords', [A('<0-16>|Minimum length of all user/enable passwords', [], cfgMinLength)], { nrun: cfgMinLength })])]),
    K('service|Modify use of network based services', [
      K('pad|Enable PAD commands', [], noop),
      K('password-encryption|Encrypt system passwords', [], cfgServicePwEnc),
      K('timestamps|Timestamp debug/log messages', [K('debug|Timestamp debug messages', [K('datetime|Timestamp with date and time', [K('msec|Include milliseconds in timestamp', [], noop)], noop)], noop), K('log|Timestamp log messages', [K('datetime|Timestamp with date and time', [K('msec|Include milliseconds in timestamp', [], noop)], noop), K('uptime|Timestamp with system uptime', [], noop)], noop)], noop)
    ]),
    K('snmp-server|Modify SNMP engine parameters', [
      K('community|Enable SNMP; set community string and access privs', [A('WORD|SNMP community string', [K('ro|Read-only access with this community string', [A('<1-99>|Std IP accesslist allowing access with this community string', [], cfgSnmp), A('WORD|Access-list name', [], cfgSnmp)], cfgSnmp), K('rw|Read-write access with this community string', [A('<1-99>|Std IP accesslist allowing access with this community string', [], cfgSnmp), A('WORD|Access-list name', [], cfgSnmp)], cfgSnmp)], cfgSnmp)]),
      K('contact|Text for mib object sysContact', [A('LINE|identification of the contact person for this managed node', [], cfgSnmp)], { nrun: cfgSnmp }),
      K('enable|Enable SNMP Traps or Informs', [K('traps|Enable SNMP Traps', [A('LINE|Notification types', [], cfgSnmp)], cfgSnmp)]),
      K('host|Specify hosts to receive SNMP notifications', [ip('IP address of SNMP notification host', [K('version|SNMP version to use for notification messages', [A('1|Use SNMPv1', [A('WORD|SNMPv1/v2c community string or SNMPv3 user name', [], cfgSnmp)], { test: (t) => t === '1' }), A('2c|Use SNMPv2c', [A('WORD|SNMPv1/v2c community string or SNMPv3 user name', [], cfgSnmp)], { test: (t) => t.toLowerCase() === '2c', label: '2c' }), A('3|Use SNMPv3', [A('WORD|SNMPv3 user name', [], cfgSnmp)], { test: (t) => t === '3' })]), A('WORD|SNMPv1/v2c community string or SNMPv3 user name', [], cfgSnmp)], { nrun: cfgSnmp })]),
      K('location|Text for mib object sysLocation', [A('LINE|The physical location of this node', [], cfgSnmp)], { nrun: cfgSnmp })
    ]),
    K('username|Establish User Name Authentication', [
      A('WORD|User name', [
        K('password|Specify the password for the user', [A('LINE|The UNENCRYPTED (cleartext) user password', [], cfgUsername)]),
        K('privilege|Set user privilege level', [A('<0-15>|User privilege level', [K('password|Specify the password for the user', [A('LINE|The UNENCRYPTED (cleartext) user password', [], cfgUsername)]), K('secret|Specify the secret for the user', [A('LINE|The UNENCRYPTED (cleartext) user secret', [], cfgUsername)])])]),
        K('secret|Specify the secret for the user', [A('LINE|The UNENCRYPTED (cleartext) user secret', [], cfgUsername)])
      ], { nrun: cfgUsername })
    ])
  ]
  if (sw) {
    root.push(
      K('spanning-tree|Spanning Tree Subsystem', [
        K('extend|Spanning Tree 802.1t extensions', [K('system-id|Extend system-id into priority portion of the bridge id (PVST & Rapid PVST)', [], noop)]),
        K('mode|Spanning tree operating mode', [K('mst|Multiple spanning tree mode', [], cfgStpMode), K('pvst|Per-Vlan spanning tree mode', [], cfgStpMode), K('rapid-pvst|Per-Vlan rapid spanning tree mode', [], cfgStpMode)], { nrun: cfgStpMode }),
        K('portfast|Spanning tree portfast options', [K('bpduguard|Enable portfast bpdu guard', [K('default|Enable bpdu guard by default on all portfast ports', [], cfgStpPortfastDefault)]), K('default|Enable portfast by default on all access ports', [], cfgStpPortfastDefault)]),
        K('vlan|VLAN Switch Spanning Tree', [A('VLANS|vlan range, example: 1,3-5,7,9-11', [K('priority|Set the bridge priority for the spanning tree', [A('<0-61440>|bridge priority in increments of 4096', [], cfgStpVlan)], { nrun: cfgStpVlan }), K('root|Configure switch as root', [K('primary|Configure this switch as primary root for this spanning tree', [], cfgStpVlan), K('secondary|Configure switch as secondary root', [], cfgStpVlan)], { nrun: cfgStpVlan })], { nrun: cfgStpVlan })])
      ]),
      K('vlan|Vlan commands', [A('VLANS|ISL VLAN IDs 1-1005', [], cfgVlan)]),
      K('vtp|Configure global VTP state', [K('domain|Set the name of the VTP administrative domain.', [A('WORD|The ascii name for the VTP administrative domain.', [], cfgVtp)]), K('mode|Configure VTP device mode', ['client', 'off', 'server', 'transparent'].map((m) => K(`${m}|Set the device to ${m} mode.`, [], cfgVtp)), { nrun: cfgVtp })])
    )
  }
  return withCommon(root, execRoot, (ctx) => enterConfigExit(ctx.sim, ctx.out))
}

const toConfig = (ctx) => {
  ctx.sim.mode = { name: 'config' }
}

function ifTree(kind, execRoot) {
  const sw = kind === 'switch'
  const ip = (spec, next, extra) => A(`A.B.C.D|${spec}`, next, extra)
  const aclRef = [A('<1-199>|IP access list (standard or extended)', [K('in|inbound packets', [], ifAccessGroup), K('out|outbound packets', [], ifAccessGroup)]), A('<1300-2699>|IP expanded access list (standard or extended)', [K('in|inbound packets', [], ifAccessGroup), K('out|outbound packets', [], ifAccessGroup)]), A('WORD|Access-list name', [K('in|inbound packets', [], ifAccessGroup), K('out|outbound packets', [], ifAccessGroup)], { test: (t) => /^[A-Za-z]/.test(t) })]
  const root = [
    K('bandwidth|Set bandwidth informational parameter', [A('<1-10000000>|Bandwidth in kilobits', [], ifSimple('bandwidth', (c) => (c.negate ? null : Number(c.w[1]))))], { nrun: ifSimple('bandwidth', () => null) }),
    K('cdp|CDP interface subcommands', [K('enable|Enable CDP on interface', [], ifCdp)]),
    K('description|Interface specific description', [A('LINE|Up to 240 characters describing this interface', [], ifDescription)], { nrun: ifDescription }),
    K('duplex|Configure duplex operation.', ['auto', 'full', 'half'].map((d) => K(`${d}|Enable ${d === 'auto' ? 'AUTO' : d.toUpperCase()}-duplex mode`, [], ifSimple('duplex', (c) => (c.negate ? 'auto' : d)))), { nrun: ifSimple('duplex', () => 'auto') }),
    K('ip|Interface Internet Protocol config commands', [
      K('access-group|Specify access control for packets', aclRef),
      K('address|Set the IP address of an interface', [ip('IP address', [ip('IP subnet mask', [K('secondary|Make this IP address a secondary address', [], ifIpAddress)], ifIpAddress)]), K('dhcp|IP Address negotiated via DHCP', [], ifIpAddress)], { nrun: ifIpAddress }),
      ...(sw ? [K('arp|Configure ARP features', [K('inspection|Arp Inspection configuration', [K('trust|Configure Trust state', [], ifArpTrust)])])] : []),
      ...(sw ? [K('dhcp|Configure DHCP parameters for this interface', [K('snooping|DHCP Snooping', [K('limit|DHCP Snooping limit', [K('rate|DHCP Snooping limit rate', [A('<1-2048>|DHCP snooping rate limit', [], ifDhcpSnoop)], { nrun: ifDhcpSnoop })]), K('trust|DHCP Snooping trust config', [], ifDhcpSnoop)])])] : []),
      K('helper-address|Specify a destination address for UDP broadcasts', [ip('IP destination address', [], ifHelper)], { nrun: ifHelper }),
      ...(sw ? [] : [K('nat|NAT interface commands', [K('inside|Inside interface for address translation', [], ifNat), K('outside|Outside interface for address translation', [], ifNat)])]),
      K('ospf|OSPF interface commands', [
        A('<1-65535>|Process ID', [K('area|Set the OSPF area ID', [A('<0-4294967295>|OSPF area ID as a decimal value', [], ifOspf), ip('OSPF area ID in IP address format', [], ifOspf)])], { nrun: ifOspf }),
        K('cost|Interface cost', [A('<1-65535>|Cost', [], ifOspf)], { nrun: ifOspf }),
        K('dead-interval|Interval after which a neighbor is declared dead', [A('<1-65535>|Seconds', [], ifOspf)], { nrun: ifOspf }),
        K('hello-interval|Time between HELLO packets', [A('<1-65535>|Seconds', [], ifOspf)], { nrun: ifOspf }),
        K('network|Network type', [K('broadcast|Specify OSPF broadcast multi-access network', [], ifOspf), K('point-to-point|Specify OSPF point-to-point network', [], ifOspf)], { nrun: ifOspf }),
        K('priority|Router priority', [A('<0-255>|Priority', [], ifOspf)], { nrun: ifOspf })
      ])
    ]),
    K('ipv6|IPv6 interface subcommands', [
      K('address|Configure IPv6 address on interface', [
        A('X:X:X:X::X/<0-128>|IPv6 prefix', [K('eui-64|Use eui-64 interface identifier', [], ifIpv6Address)], ifIpv6Address),
        A('X:X:X:X::X|IPv6 link-local address', [K('link-local|Use link-local address', [], ifIpv6Address)])
      ], { nrun: ifIpv6Address }),
      K('enable|Enable IPv6 on interface', [], ifIpv6Enable)
    ]),
    K('lldp|LLDP interface subcommands', [K('receive|Enable LLDP reception on interface', [], ifLldp), K('transmit|Enable LLDP transmission on interface', [], ifLldp)]),
    K('shutdown|Shutdown the selected interface', [], ifShutdown),
    K('speed|Configure speed operation.', ['10', '100', '1000', 'auto'].map((s) => K(`${s}|${s === 'auto' ? 'Enable AUTO speed configuration' : `Force ${s} Mbps operation`}`, [], ifSimple('speed', (c) => (c.negate ? 'auto' : s)))), { nrun: ifSimple('speed', () => 'auto') }),
    K('standby|HSRP interface configuration commands', [
      A('<0-4095>|group number', [
        K('ip|Enable HSRP and set the virtual IP address', [ip('Virtual IP address', [], ifStandby)], ifStandby),
        K('preempt|Overthrow lower priority Active routers', [], ifStandby),
        K('priority|Priority level', [A('<0-255>|Priority value', [], ifStandby)], { nrun: ifStandby })
      ], { nrun: ifStandby }),
      K('version|HSRP version', [A('<1-2>|Version', [], ifStandby)], { nrun: ifStandby })
    ])
  ]
  if (!sw) {
    root.push(K('encapsulation|Set encapsulation type for an interface', [K('dot1Q|IEEE 802.1Q Virtual LAN', [A('<1-4094>|IEEE 802.1Q VLAN ID required', [K('native|Make this as native vlan', [], ifEncapsulation)], ifEncapsulation)], { nrun: ifEncapsulation })]))
  } else {
    const vlanArg = (fn) => [A('<1-4094>|VLAN ID of the VLAN when this port is in access mode', [], fn)]
    root.push(
      K('channel-group|Etherchannel/port bundling configuration', [A('<1-48>|Channel group number', [K('mode|Etherchannel Mode of the interface', [
        K('active|Enable LACP unconditionally', [], ifChannelGroup),
        K('auto|Enable PAgP only if a PAgP device is detected', [], ifChannelGroup),
        K('desirable|Enable PAgP unconditionally', [], ifChannelGroup),
        K('on|Enable Etherchannel only', [], ifChannelGroup),
        K('passive|Enable LACP only if a LACP device is detected', [], ifChannelGroup)
      ])])], { nrun: ifChannelGroup }),
      K('spanning-tree|Spanning Tree Subsystem', [
        K('bpdufilter|Don\'t send or receive BPDUs on this interface', [K('disable|Disable BPDU filtering for this interface', [], ifStp), K('enable|Enable BPDU filtering for this interface', [], ifStp)], { nrun: ifStp }),
        K('bpduguard|Don\'t accept BPDUs on this interface', [K('disable|Disable BPDU guard for this interface', [], ifStp), K('enable|Enable BPDU guard for this interface', [], ifStp)], { nrun: ifStp }),
        K('cost|Change an interface\'s spanning tree port path cost', [A('<1-200000000>|port path cost', [], ifStp)], { nrun: ifStp }),
        K('guard|Change an interface\'s spanning tree guard mode', [K('loop|Set guard mode to loop guard on interface', [], ifStp), K('none|Set guard mode to none', [], ifStp), K('root|Set guard mode to root guard on interface', [], ifStp)], { nrun: ifStp }),
        K('port-priority|Change an interface\'s spanning tree port priority', [A('<0-240>|port priority in increments of 16', [], ifStp)], { nrun: ifStp }),
        K('portfast|Portfast options for the interface', [K('disable|Disable portfast for this interface', [], ifStp), K('trunk|Enable portfast on the interface even in trunk mode', [], ifStp)], ifStp)
      ]),
      K('switchport|Set switching mode characteristics', [
        K('access|Set access mode characteristics of the interface', [K('vlan|Set VLAN when interface is in access mode', vlanArg(ifAccessVlan), { nrun: ifAccessVlan })]),
        K('mode|Set trunking mode of the interface', [
          K('access|Set trunking mode to ACCESS unconditionally', [], ifSwMode),
          K('dynamic|Set trunking mode to dynamically negotiate access or trunk mode', [K('auto|Set trunking mode dynamic negotiation parameter to AUTO', [], ifSwMode), K('desirable|Set trunking mode dynamic negotiation parameter to DESIRABLE', [], ifSwMode)]),
          K('trunk|Set trunking mode to TRUNK unconditionally', [], ifSwMode)
        ], { nrun: ifSwMode }),
        K('nonegotiate|Device will not engage in negotiation protocol on this interface', [], ifNonegotiate),
        K('port-security|Security related command', [
          K('aging|Port-security aging commands', [K('time|Port-security aging time', [A('<1-1440>|Aging time in minutes. Enter a value between 1 and 1440', [], ifPortSecurity)], { nrun: ifPortSecurity })]),
          K('mac-address|Secure mac address', [A('H.H.H|48 bit mac address', [], ifPortSecurity), K('sticky|Configure dynamic secure addresses as sticky', [A('H.H.H|48 bit mac address', [], ifPortSecurity)], ifPortSecurity)]),
          K('maximum|Max secure addresses', [A('<1-132>|Maximum addresses', [], ifPortSecurity)], { nrun: ifPortSecurity }),
          K('violation|Security violation mode', [K('protect|Security violation protect mode', [], ifPortSecurity), K('restrict|Security violation restrict mode', [], ifPortSecurity), K('shutdown|Security violation shutdown mode', [], ifPortSecurity)], { nrun: ifPortSecurity })
        ], ifPortSecurity),
        K('trunk|Set trunking characteristics of the interface', [
          K('allowed|Set allowed VLAN characteristics when interface is in trunking mode', [K('vlan|Set allowed VLANs when interface is in trunking mode', [
            A('VLANS|VLAN IDs of the allowed VLANs when this port is in trunking mode', [], ifAllowedVlan),
            K('add|add VLANs to the current list', [A('VLANS|VLAN IDs of the allowed VLANs when this port is in trunking mode', [], ifAllowedVlan)]),
            K('all|all VLANs', [], ifAllowedVlan),
            K('except|all VLANs except the following', [A('VLANS|VLAN IDs of the disallowed VLANs when this port is in trunking mode', [], ifAllowedVlan)]),
            K('none|no VLANs', [], ifAllowedVlan),
            K('remove|remove VLANs from the current list', [A('VLANS|VLAN IDs of disallowed VLANS when this port is in trunking mode', [], ifAllowedVlan)])
          ], { nrun: ifAllowedVlan })]),
          K('encapsulation|Set trunking encapsulation when interface is in trunking mode', [K('dot1q|Interface uses only 802.1q trunking encapsulation when trunking', [], ifTrunkEncap), K('isl|Interface uses only ISL trunking encapsulation when trunking', [], ifTrunkEncap), K('negotiate|Device will negotiate trunking encapsulation with peer on interface', [], ifTrunkEncap)], { nrun: ifTrunkEncap }),
          K('native|Set trunking native characteristics when interface is in trunking mode', [K('vlan|Set native VLAN when interface is in trunking mode', [A('<1-4094>|VLAN ID of the native VLAN when this port is in trunking mode', [], ifNativeVlan)], { nrun: ifNativeVlan })])
        ]),
        K('voice|Voice appliance attributes', [K('vlan|Vlan for voice traffic', [A('<1-4094>|Vlan for voice traffic', [], ifVoiceVlan)], { nrun: ifVoiceVlan })])
      ], ifSwitchportBare)
    )
  }
  return withCommon(root, execRoot, toConfig)
}

function vlanModeTree(execRoot) {
  return withCommon([K('name|Ascii name of the VLAN', [A('WORD|The ascii name for the VLAN', [], vlanName)], { nrun: vlanName })], execRoot, toConfig)
}

function lineModeTree(execRoot) {
  const aclRef = [A('<1-199>|IP access list', [K('in|Filter incoming connections', [], lineAccessClass), K('out|Filter outgoing connections', [], lineAccessClass)]), A('<1300-2699>|IP expanded access list', [K('in|Filter incoming connections', [], lineAccessClass), K('out|Filter outgoing connections', [], lineAccessClass)]), A('WORD|Access-list name', [K('in|Filter incoming connections', [], lineAccessClass), K('out|Filter outgoing connections', [], lineAccessClass)], { test: (t) => /^[A-Za-z]/.test(t) })]
  const proto = (exclude) => ['ssh', 'telnet'].filter((p) => p !== exclude).map((p) => K(`${p}|${p === 'ssh' ? 'TCP/IP SSH protocol' : 'TCP/IP Telnet protocol'}`, [], lineTransport))
  return withCommon(
    [
      K('access-class|Filter connections based on an IP access list', aclRef, { nrun: lineAccessClass }),
      K('exec-timeout|Set the EXEC timeout', [A('<0-35791>|Timeout in minutes', [A('<0-2147483>|Timeout in seconds', [], lineExecTimeout)], lineExecTimeout)], { nrun: lineExecTimeout }),
      K('logging|Modify message logging facilities', [K('synchronous|Synchronized message output', [], lineLoggingSync)]),
      K('login|Enable password checking', [K('local|Local password checking', [], lineLogin)], lineLogin),
      K('password|Set a password', [A('LINE|The UNENCRYPTED (cleartext) line password', [], linePassword)], { nrun: linePassword }),
      K('privilege|Change privilege level for line', [K('level|Assign default privilege level for line', [A('<0-15>|Default privilege level for line', [], linePrivilege)], { nrun: linePrivilege })]),
      K('transport|Define transport protocols for line', [K('input|Define which protocols to use when connecting to the terminal server', [
        K('all|All protocols', [], lineTransport),
        K('none|No protocols', [], lineTransport),
        K('ssh|TCP/IP SSH protocol', proto('ssh'), lineTransport),
        K('telnet|TCP/IP Telnet protocol', proto('telnet'), lineTransport)
      ], { nrun: lineTransport })])
    ],
    execRoot,
    toConfig
  )
}

function routerTree(kind, execRoot) {
  return withCommon(
    [
      K('auto-cost|Calculate OSPF interface cost according to bandwidth', [K('reference-bandwidth|Use reference bandwidth method to assign OSPF cost', [A('<1-4294967>|The reference bandwidth in terms of Mbits per second', [], ospfRefBw)], { nrun: ospfRefBw })]),
      K('default-information|Control distribution of default information', [K('originate|Distribute a default route', [K('always|Always advertise default route', [], ospfDefaultInfo)], ospfDefaultInfo)]),
      K('log-adjacency-changes|Log changes in adjacency state', [], noop),
      K('maximum-paths|Forward packets over multiple paths', [A('<1-32>|Number of paths', [], ospfMaxPaths)], { nrun: ospfMaxPaths }),
      K('network|Enable routing on an IP network', [A('A.B.C.D|Network number', [A('A.B.C.D|OSPF wild card bits', [K('area|Set the OSPF area ID', [A('<0-4294967295>|OSPF area ID as a decimal value', [], ospfNetwork), A('A.B.C.D|OSPF area ID in IP address format', [], ospfNetwork)])])])]),
      K('passive-interface|Suppress routing updates on an interface', [K('default|Suppress routing updates on all interfaces', [], ospfPassive), ...IFACE(kind, [], { run: ospfPassive })]),
      K('router-id|router-id for this OSPF process', [A('A.B.C.D|OSPF router-id in IP address format', [], ospfRouterIdCmd)], { nrun: ospfRouterIdCmd })
    ],
    execRoot,
    toConfig
  )
}

function dhcpTree(execRoot) {
  const ips = (help, fn, depth = 4) => (depth ? [A(`A.B.C.D|${help}`, ips(help, fn, depth - 1), fn)] : [])
  return withCommon(
    [
      K('default-router|Default routers', ips('Router\'s IP address', dhcpList('routers')), { nrun: dhcpList('routers') }),
      K('dns-server|DNS servers', ips('Server\'s name or IP address', dhcpList('dns')), { nrun: dhcpList('dns') }),
      K('domain-name|Domain name', [A('WORD|Domain name', [], dhcpDomain)], { nrun: dhcpDomain }),
      K('lease|Address lease time', [A('<0-365>|Days', [A('<0-23>|Hours', [A('<0-59>|Minutes', [], dhcpLease)], dhcpLease)], dhcpLease), K('infinite|Infinite lease', [], dhcpLease)], { nrun: dhcpLease }),
      K('network|Network number and mask', [A('A.B.C.D|Network number in dotted-decimal notation', [A('A.B.C.D|Network mask or prefix length', [], dhcpNetwork), A('/nn|/nn or A.B.C.D  Network mask or prefix length', [], dhcpNetwork)], dhcpNetwork)], { nrun: dhcpNetwork })
    ],
    execRoot,
    toConfig
  )
}

function aclTree(type, execRoot) {
  const actions = aclActions(type, aclEntry)
  return withCommon(
    [A('<1-2147483647>|Sequence Number', [...aclActions(type, aclEntry)], { nrun: aclEntry }), ...actions, K('remark|Access list entry comment', [A('LINE|Comment up to 100 characters', [], aclEntry)])],
    execRoot,
    toConfig
  )
}

const GRAMMARS = {}

function grammarFor(kind) {
  if (GRAMMARS[kind]) return GRAMMARS[kind]
  const enable = execTree(kind, true)
  const g = {
    user: execTree(kind, false),
    enable,
    config: configTree(kind, enable),
    if: ifTree(kind, enable),
    vlan: vlanModeTree(enable),
    line: lineModeTree(enable),
    router: routerTree(kind, enable),
    dhcp: dhcpTree(enable),
    aclStd: aclTree('standard', enable),
    aclExt: aclTree('extended', enable)
  }
  GRAMMARS[kind] = g
  return g
}

// =====================================================================
// Running a line
// =====================================================================

function errorFor(p, out, promptLen) {
  if (p.status === 'ambiguous') {
    out.err(`% Ambiguous command: "${p.text}"`)
  } else if (p.status === 'incomplete') {
    out.err('% Incomplete command.')
  } else {
    out.err(`${' '.repeat(promptLen + p.at)}^`)
    out.err("% Invalid input detected at '^' marker.")
  }
  out.add('')
}

const progress = (p, raw) => (p.status === 'ok' ? Infinity : p.status === 'incomplete' ? raw.length : p.at ?? 0)

function execute(sim, raw, out, promptLen) {
  const toks = tokenize(raw)
  if (!toks.length) return
  if (toks[0].text.startsWith('!')) return
  const inConfig = CONFIG_MODES.has(sim.mode.name)
  let p = parse(rootsFor(sim), raw, sim)
  if (p.status !== 'ok' && sim.mode.name !== 'config' && inConfig) {
    const g = parse(sim.grammar.config, raw, sim)
    if (g.status === 'ok') {
      sim.mode = { name: 'config' }
      p = g
    } else if (progress(g, raw) > progress(p, raw)) p = g
  }
  if (p.status === 'empty') return
  if (p.status !== 'ok') {
    if (!inConfig && p.status === 'invalid' && p.tokIndex === 0 && toks.length === 1) {
      const name = toks[0].text
      out.add(sim.dev.domainLookup ? `Translating "${name}"...domain server (255.255.255.255)` : `Translating "${name}"`)
      out.err('% Unknown command or computer name, or unable to find computer address')
      return
    }
    errorFor(p, out, promptLen)
    if (inConfig && p.status === 'invalid' && p.tokIndex === 0 && /^(sh|sho|show|ping|wr|write|copy|tr|traceroute)$/i.test(toks[0].text)) {
      out.add(`Tip: in configuration mode, put do in front: do ${raw.trim()}`, 'dim')
    }
    return
  }
  const ctx = makeCtx(sim, p, out, raw, promptLen)
  if (p.matched.some((m) => m.node.word === 'show')) sim.stats.shows++
  p.fn(ctx)
}

function handlePending(sim, raw, out) {
  const pend = sim.pending
  sim.pending = null
  const ans = raw.trim()
  const yes = /^y(es)?$/i.test(ans)
  switch (pend.kind) {
    case 'enable-pw': {
      const dev = sim.dev
      const want = dev.enableSecret ?? dev.enablePassword
      const ok = Boolean(want && want.raw == null && want.text === raw)
      if (ok) {
        sim.mode = { name: 'enable' }
        sim.stats.enable = true
      } else if (pend.tries < 2) sim.pending = { ...pend, tries: pend.tries + 1 }
      else out.err('% Bad secrets')
      out.add('')
      return
    }
    case 'configure':
      if (!ans || 'terminal'.startsWith(ans.toLowerCase())) {
        sim.mode = { name: 'config' }
        sim.stats.config = true
        out.add('Enter configuration commands, one per line.  End with CNTL/Z.')
      } else out.err('?Must be "terminal", "memory" or "network"')
      return
    case 'copy-rs':
      if (ans && ans !== 'startup-config') {
        out.err(`%Error opening flash:${ans} (Permission denied)`)
        return
      }
      saveConfig(sim, out)
      return
    case 'copy-sr':
      if (!sim.startup) {
        out.err('%Error opening nvram:/startup-config (No such file or directory)')
        return
      }
      sim.dev = cloneConfig(sim.startup)
      out.add(`${JSON.stringify(sim.startup).length} bytes copied in 0.204 secs`)
      return
    case 'erase':
      if (ans && !yes) return
      sim.startup = null
      out.add('[OK]')
      out.add('Erase of nvram: complete')
      logMsg(sim, out, '%SYS-7-NV_BLOCK_INIT: Initialized the geometry of nvram')
      return
    case 'reload-save':
      if (yes) saveConfig(sim, out)
      else if (!/^no?$/i.test(ans)) {
        out.add('% Please answer \'yes\' or \'no\'.')
        sim.pending = pend
        return
      }
      sim.pending = { kind: 'reload-confirm', prompt: 'Proceed with reload? [confirm]' }
      return
    case 'reload-confirm':
      if (ans && !yes) return
      doReload(sim, out)
      return
    case 'press-return':
      return loginSequence(sim, out)
    case 'login-user':
      sim.pending = { kind: 'login-pass', prompt: 'Password: ', secret: true, user: ans, tries: pend.tries ?? 0 }
      return
    case 'login-pass': {
      const con = sim.dev.lines.con
      let ok
      if (pend.user != null) {
        const u = sim.dev.users.find((x) => x.name === pend.user)
        ok = Boolean(u && u.pw.text === raw)
      } else ok = con.password && con.password.text === raw
      if (ok) {
        out.add('')
        sim.mode = { name: 'user' }
        return
      }
      const tries = (pend.tries ?? 0) + 1
      if (pend.user != null) {
        out.err('% Login invalid')
        out.add('')
        sim.pending = tries >= 3 ? { kind: 'press-return', prompt: '' } : { kind: 'login-user', prompt: 'Username: ', tries }
      } else {
        sim.pending = tries >= 3 ? { kind: 'press-return', prompt: '' } : { ...pend, tries }
        if (tries >= 3) out.err('% Bad passwords')
      }
      return
    }
    case 'banner': {
      const i = raw.indexOf(pend.delim)
      if (i >= 0) {
        if (i > 0) pend.lines.push(raw.slice(0, i))
        sim.dev.banner = pend.lines.join('\n')
        return
      }
      pend.lines.push(raw)
      sim.pending = pend
      return
    }
    case 'rsa-bits': {
      const bits = ans ? Number(ans) : 512
      if (!Number.isInteger(bits) || bits < 360 || bits > 4096) {
        out.err('% You must specify a modulus value in the range 360 to 4096')
        sim.pending = pend
        return
      }
      generateKeys(sim, out, bits)
      return
    }
    case 'rsa-replace':
      if (!yes) return
      out.add(`The name for the keys will be: ${keyName(sim.dev)}`)
      if (pend.bits) {
        out.add(`\n% The key modulus size is ${pend.bits} bits`)
        generateKeys(sim, out, pend.bits)
      } else sim.pending = { kind: 'rsa-bits', prompt: 'How many bits in the modulus [512]: ' }
      return
    case 'zeroize':
      if (!yes) return
      sim.dev.rsaModulus = null
      logMsg(sim, out, '%SSH-5-DISABLED: SSH 1.99 has been disabled')
      return
    case 'clear-ospf':
      if (!yes) return
      sim.op.ospfRid = null
      return
    default:
  }
}

function loginSequence(sim, out) {
  const dev = sim.dev
  if (dev.banner != null) out.add(dev.banner)
  const con = dev.lines.con
  if (con.login === 'local' && dev.users.length) {
    out.add('\nUser Access Verification\n')
    sim.pending = { kind: 'login-user', prompt: 'Username: ', tries: 0 }
  } else if (con.login === 'line' && con.password) {
    out.add('\nUser Access Verification\n')
    sim.pending = { kind: 'login-pass', prompt: 'Password: ', secret: true, user: null, tries: 0 }
  }
}

function finish(sim, out) {
  for (const msg of observe(sim)) logMsg(sim, out, msg)
  const text = out.lines.map((l) => l.text).join('\n')
  return { lines: out.lines, output: text, error: out.error, prompt: promptFor(sim) }
}

/** Run one line of input (a command, or the answer to a pending question). */
export function runLine(sim, raw = '') {
  const out = new Out()
  const line = String(raw).replace(/\r/g, '')
  const promptLen = promptFor(sim).length
  if (sim.pending) {
    handlePending(sim, line, out)
    return finish(sim, out)
  }
  if (line.trim()) {
    sim.history.push(line.trim())
    if (sim.history.length > 100) sim.history.shift()
    sim.stats.commands++
  }
  execute(sim, line, out, promptLen)
  return finish(sim, out)
}

/** Ctrl+Z ('z') leaves configuration mode; Ctrl+C ('c') also cancels a question. */
export function interrupt(sim, key = 'z') {
  const out = new Out()
  if (sim.pending) {
    if (key === 'c' && !['press-return', 'login-user', 'login-pass', 'enable-pw'].includes(sim.pending.kind)) sim.pending = null
    return finish(sim, out)
  }
  if (CONFIG_MODES.has(sim.mode.name)) enterConfigExit(sim, out)
  return finish(sim, out)
}

// =====================================================================
// Help and completion
// =====================================================================

function entryFor(n) {
  if (n.t === 'arg') return { word: n.label, help: n.help, arg: true }
  return { word: n.word, help: n.help }
}

function listLevel(level, st, node) {
  const seen = new Set()
  const entries = []
  for (const n of filterLevel(level, st)) {
    if (n.hidden) continue
    const e = entryFor(n)
    if (seen.has(e.word)) continue
    seen.add(e.word)
    entries.push(e)
  }
  entries.sort((a, b) => (a.arg !== b.arg ? (a.arg ? -1 : 1) : a.word === '|' ? 1 : b.word === '|' ? -1 : a.word.toLowerCase() < b.word.toLowerCase() ? -1 : 1))
  if (node && runnable(node, st) && !st.pipeFrom) entries.push({ word: '<cr>', help: '' })
  if (node?.pipeEnd) entries.push({ word: '<cr>', help: '' })
  return entries
}

/** Lines to print for `?` typed after `text`, the way IOS answers without Enter. */
export function helpLines(sim, text = '') {
  sim.stats.help++
  if (sim.pending) return []
  const promptLen = promptFor(sim).length
  const roots = rootsFor(sim)
  const out = new Out()
  if (text === '' || /\s$/.test(text)) {
    const w = walk(roots, text, sim)
    if (w.status !== 'ok') {
      errorFor({ ...w, status: w.status }, out, promptLen)
      return out.lines.map((l) => l.text)
    }
    const level = w.node ? w.level : roots
    return formatHelpList(listLevel(level, w.node ? w.st : { fresh: true }, w.node))
  }
  const toks = tokenize(text)
  const last = toks[toks.length - 1]
  const prefix = text.slice(0, last.start)
  const w = walk(roots, prefix, sim)
  if (w.status !== 'ok') {
    errorFor(w, out, promptLen)
    return out.lines.map((l) => l.text)
  }
  const level = filterLevel(w.node ? w.level : roots, w.node ? w.st : { fresh: true })
  const low = last.text.toLowerCase()
  const words = []
  for (const n of level) {
    if (n.hidden) continue
    if (n.t === 'kw' && n.wl.startsWith(low)) words.push(n.word)
    else if (n.t === 'arg' && n.type !== 'WORD' && n.type !== 'LINE' && n.test(last.text, sim)) words.push(n.label)
  }
  const uniq = [...new Set(words)].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
  if (!uniq.length) return ['% Unrecognized command']
  return formatPartialHelp(uniq)
}

/** Tab completion: expand the last word when it is unambiguous. */
export function complete(sim, text = '') {
  if (sim.pending || !text.trim() || /\s$/.test(text)) return text
  const toks = tokenize(text)
  const last = toks[toks.length - 1]
  const prefix = text.slice(0, last.start)
  const tries = [rootsFor(sim)]
  if (CONFIG_MODES.has(sim.mode.name) && sim.mode.name !== 'config') tries.push(sim.grammar.config)
  for (const roots of tries) {
    const w = walk(roots, prefix, sim)
    if (w.status !== 'ok') continue
    const level = filterLevel(w.node ? w.level : roots, w.node ? w.st : { fresh: true })
    const low = last.text.toLowerCase()
    const kws = level.filter((n) => n.t === 'kw' && n.wl.startsWith(low))
    const pick = kws.find((n) => n.wl === low) ?? (kws.length === 1 ? kws[0] : null)
    if (pick) return `${prefix}${pick.word}${pick.glue ? '' : ' '}`
  }
  return text
}

// =====================================================================
// Creating simulators
// =====================================================================

function freshOp(prev) {
  return { errdisabled: [], errInfo: {}, violations: {}, ospfRid: null, since: {}, obs: null, pingOk: prev?.pingOk ?? [], arp: [], aclHits: {}, bootMsgs: [] }
}

function normalizeEnv(env = {}) {
  const fix = (p) => canonicalIf(p) ?? p
  const neighbors = [...(env.neighbors || []), ...(env.hosts || []).map((h) => ({ kind: 'host', ...h }))].map((n) => ({ ...n, port: fix(n.port) }))
  return {
    ...env,
    connected: env.connected ? env.connected.map(fix) : undefined,
    neighbors,
    dhcpClients: (env.dhcpClients || []).map((c) => ({ ...c, port: fix(c.port) }))
  }
}

/**
 * Create a simulator. opts: { kind: 'router' | 'switch', env, startingConfig: [config lines], hostname, now: () => ms }
 * Lines in startingConfig are configuration commands; enable / configure terminal / end lines are tolerated.
 */
export function createSim(opts = {}) {
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
  const dev = makeDevice(opts.kind === 'switch' ? 'switch' : 'router', { hostname: opts.hostname, baseMac: opts.baseMac, model: opts.model })
  const sim = {
    dev,
    kind: dev.kind,
    mode: { name: 'user' },
    pending: null,
    env: normalizeEnv(opts.env),
    startup: null,
    history: [],
    logBuf: [],
    bootAt: now(),
    now,
    clock: { base: Date.UTC(1993, 2, 1), setAt: now(), authoritative: false },
    op: freshOp(),
    stats: { commands: 0, shows: 0, help: 0, enable: false, config: false },
    grammar: grammarFor(dev.kind),
    setupErrors: []
  }
  const lines = opts.startingConfig || []
  if (lines.length) {
    sim.mode = { name: 'config' }
    for (const raw of lines) {
      if (/^\s*(en|enable|conf t|configure terminal)\s*$/i.test(raw)) continue
      if (/^\s*end\s*$/i.test(raw)) {
        sim.mode = { name: 'config' }
        continue
      }
      if (sim.mode.name === 'user' || sim.mode.name === 'enable') sim.mode = { name: 'config' }
      const r = runLine(sim, raw)
      while (sim.pending) runLine(sim, '')
      if (r.error) sim.setupErrors.push(`${raw}: ${r.output}`)
      for (const l of r.lines) if (l.kind === 'log' && BOOT_KEEP.test(l.text)) sim.op.bootMsgs.push(l.text.replace(/^\*?[A-Z][a-z]{2}\s+\d+ [\d:.]+: /, ''))
    }
    sim.mode = { name: 'user' }
    sim.startup = cloneConfig(sim.dev)
    sim.history = []
    sim.stats = { commands: 0, shows: 0, help: 0, enable: false, config: false }
  }
  for (const seed of sim.env.errdisabled || []) {
    errDisable(sim, seed.port, seed.reason)
    sim.op.bootMsgs.push(...(seed.messages || defaultErrMessages(seed)))
  }
  sim.logBuf = []
  sim.op.obs = null
  sim.op.pingOk = []
  sim.op.arp = []
  observe(sim, { silent: true })
  return sim
}

// Log messages from setting up a lab that a learner should still see when the console opens.
const BOOT_KEEP = /ERR_DISABLE|PSECURE_VIOLATION|BLOCK_BPDUGUARD|CHNL_MISCFG|ROOTGUARD_BLOCK|CANNOT_BUNDLE|DIFFVIP/

function defaultErrMessages(seed) {
  const short = seed.port.replace('GigabitEthernet', 'Gi')
  if (seed.reason === 'bpduguard') return [`%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${seed.port} with BPDU Guard enabled. Disabling port.`, `%PM-4-ERR_DISABLE: bpduguard error detected on ${short}, putting ${short} in err-disable state`]
  return [`%PM-4-ERR_DISABLE: ${seed.reason} error detected on ${short}, putting ${short} in err-disable state`]
}

/** A simulator set up for a console lab from labs.js. */
export function createLabSim(lab, opts = {}) {
  return createSim({ kind: lab.deviceKind, model: lab.model, env: lab.env, startingConfig: lab.startingConfig, ...opts })
}

/** Lines shown when the console first opens: the console banner and any standing problems. */
export function bootLines(sim) {
  const lines = []
  const seen = new Set()
  for (const msg of [...sim.op.bootMsgs, ...startupNotices(sim)]) {
    if (seen.has(msg)) continue
    seen.add(msg)
    const l = `${S.logStamp(sim)}${msg}`
    sim.logBuf.push(l)
    lines.push({ text: l, kind: 'log' })
  }
  lines.push({ text: `${sim.dev.hostname} con0 is now available`, kind: 'out' }, { text: '', kind: 'out' }, { text: 'Press RETURN to get started.', kind: 'out' }, { text: '', kind: 'out' })
  return lines
}

/** Run the lab checks against a simulator: [{ label, hint, pass }]. */
export function gradeLab(lab, sim) {
  const safe = (c) => {
    try {
      return Boolean(c.test(sim.dev, sim))
    } catch {
      return false
    }
  }
  return lab.checks.map((c) => ({ label: c.label, hint: c.hint, pass: safe(c) }))
}

export { IF_TYPES, isUp }
