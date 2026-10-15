// A simulated Cisco AireOS wireless LAN controller (WLC): the configuration model behind the
// web GUI widget, the checks its Apply buttons run, and an honest client join that explains
// exactly where and why a client fails. Framework-free so it can be tested on its own.
//
// Labels and defaults follow Odom, CCNA 200-301 Official Cert Guide Vol. 1, chapter 29
// ("Building a Wireless LAN"): a new WLAN starts disabled, on the management interface,
// with WPA2, AES and 802.1X, QoS Silver, a 1800 second session timeout and client
// exclusion for 60 seconds.

// ---------- option lists (ids are what the model stores, labels are what the GUI shows) ----------

export const RADIO_POLICIES = [
  { id: 'all', label: 'All', bands: ['2.4', '5'] },
  { id: 'a', label: '802.11a only', bands: ['5'] },
  { id: 'ag', label: '802.11a/g only', bands: ['2.4', '5'] },
  { id: 'g', label: '802.11g only', bands: ['2.4'] },
  { id: 'bg', label: '802.11b/g only', bands: ['2.4'] }
]

/** In the same order as the AireOS QoS drop-down. */
export const QOS_PROFILES = [
  { id: 'silver', label: 'Silver (best effort)', short: 'Silver', use: 'best effort, the default for normal data' },
  { id: 'gold', label: 'Gold (video)', short: 'Gold', use: 'video' },
  { id: 'platinum', label: 'Platinum (voice)', short: 'Platinum', use: 'voice' },
  { id: 'bronze', label: 'Bronze (background)', short: 'Bronze', use: 'background traffic' }
]

export const WMM_POLICIES = [
  { id: 'allowed', label: 'Allowed' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'required', label: 'Required' }
]

/** Layer 2 Security choices. The legacy ones are listed (as on a real WLC) but not configurable here. */
export const L2_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'wpa+wpa2', label: 'WPA+WPA2' },
  { id: 'wpa2+wpa3', label: 'WPA2+WPA3' },
  { id: '802.1x', label: '802.1X (dynamic WEP)', legacy: true },
  { id: 'static-wep', label: 'Static WEP', legacy: true },
  { id: 'static-wep+802.1x', label: 'Static WEP + 802.1X', legacy: true },
  { id: 'ckip', label: 'CKIP', legacy: true },
  { id: 'none+eap', label: 'None + EAP Passthrough', legacy: true }
]

export const PMF_OPTIONS = [
  { id: 'disabled', label: 'Disabled' },
  { id: 'optional', label: 'Optional' },
  { id: 'required', label: 'Required' }
]

export const P2P_OPTIONS = [
  { id: 'disabled', label: 'Disabled' },
  { id: 'drop', label: 'Drop' },
  { id: 'forward-upstream', label: 'Forward-UpStream' }
]

/** The two test clients. Each one is honest about what its radio and software support. */
export const DEVICES = [
  {
    id: 'laptop',
    name: 'Laptop',
    detail: 'Wi-Fi 6, 2.4 and 5 GHz, WPA2 and WPA3, supports PMF',
    bands: ['5', '2.4'],
    wpa: true,
    wpa2: true,
    wpa3: true,
    pmf: true,
    mac: '3c:22:fb:4a:10:01',
    proto: { '5': '802.11ax (5 GHz)', '2.4': '802.11ax (2.4 GHz)' },
    ap: 'AP-Lobby',
    host: 101
  },
  {
    id: 'scanner',
    name: 'Handheld scanner',
    detail: 'Older 802.11n device, 2.4 GHz only, WPA2 at most, no PMF',
    bands: ['2.4'],
    wpa: true,
    wpa2: true,
    wpa3: false,
    pmf: false,
    mac: '00:17:23:5c:08:2e',
    proto: { '2.4': '802.11n (2.4 GHz)' },
    ap: 'AP-Floor2',
    host: 102
  }
]

export const deviceById = (id) => DEVICES.find((d) => d.id === id) || DEVICES[0]
export const radioById = (id) => RADIO_POLICIES.find((r) => r.id === id) || RADIO_POLICIES[0]
export const qosById = (id) => QOS_PROFILES.find((q) => q.id === id) || QOS_PROFILES[0]
export const l2ById = (id) => L2_OPTIONS.find((o) => o.id === id) || L2_OPTIONS[0]

const clone = (x) => structuredClone(x)

// ---------- IPv4 helpers ----------

/** Dotted quad to a 32-bit unsigned number, or null. */
export function parseIp(text) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(text ?? '').trim())
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return null
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

export const ipStr = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')

/** Prefix length of a dotted mask such as 255.255.255.0, or null if it is not a contiguous mask. */
export function maskBits(text) {
  const n = parseIp(text)
  if (n === null) return null
  const inverse = ~n >>> 0
  if ((inverse & (inverse + 1)) !== 0) return null
  return 32 - Math.log2(inverse + 1)
}

const maskOf = (bits) => (bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0)

/** "10.10.20.0/24" for an address and mask, or null. */
export function subnetOf(ip, mask) {
  const a = parseIp(ip)
  const bits = maskBits(mask)
  if (a === null || bits === null) return null
  return `${ipStr((a & maskOf(bits)) >>> 0)}/${bits}`
}

function inSubnet(ip, cidr) {
  const [net, bits] = cidr.split('/')
  const a = parseIp(ip)
  return a !== null && ((a & maskOf(Number(bits))) >>> 0) === parseIp(net)
}

// ---------- WLAN defaults and descriptions ----------

/** A WLAN as AireOS creates it from WLANs > New: disabled, WPA2 + AES + 802.1X, on management. */
export function newWlan({ id, profile, ssid }) {
  return {
    id,
    type: 'WLAN',
    profile,
    ssid,
    enabled: false,
    radio: 'all',
    iface: 'management',
    broadcast: true,
    security: {
      l2: 'wpa+wpa2',
      wpa: false,
      wpa2: true,
      wpa3: false,
      cipher: { aes: true, tkip: false, gcmp256: false },
      akm: { dot1x: true, psk: false, sae: false },
      pskFormat: 'ascii',
      psk: '',
      pmf: 'disabled'
    },
    l3: 'none',
    aaa: ['none', 'none', 'none'],
    qos: 'silver',
    wmm: 'allowed',
    advanced: {
      aaaOverride: false,
      coverageHole: true,
      sessionTimeoutOn: true,
      sessionTimeout: 1800,
      p2p: 'disabled',
      exclusionOn: true,
      exclusionTimeout: 60,
      dhcpRequired: false,
      flexLocal: false
    }
  }
}

const isWpa = (sec) => sec.l2 === 'wpa+wpa2' || sec.l2 === 'wpa2+wpa3'

/** The policies a WLAN really offers, after ignoring boxes that do not apply to its Layer 2 mode. */
export function offered(sec) {
  if (!isWpa(sec)) return { open: sec.l2 === 'none', wpa: false, wpa2: false, wpa3: false, psk: false, sae: false, dot1x: false, aes: false, tkip: false, gcmp: false }
  const mixed = sec.l2 === 'wpa+wpa2'
  const wpa = mixed && sec.wpa
  const wpa2 = Boolean(sec.wpa2)
  const wpa3 = !mixed && sec.wpa3
  return {
    open: false,
    wpa,
    wpa2,
    wpa3,
    psk: Boolean(sec.akm.psk) && (wpa || wpa2),
    sae: !mixed && Boolean(sec.akm.sae) && wpa3,
    dot1x: Boolean(sec.akm.dot1x),
    aes: Boolean(sec.cipher.aes),
    tkip: mixed && Boolean(sec.cipher.tkip),
    gcmp: !mixed && Boolean(sec.cipher.gcmp256)
  }
}

/** The Security Policies column of the WLANs list, AireOS style: [WPA2][Auth(PSK)]. */
export function securityPolicies(w) {
  const sec = w.security
  if (sec.l2 === 'none') return 'None'
  if (!isWpa(sec)) return `[${l2ById(sec.l2).label}]`
  const o = offered(sec)
  const policies = [o.wpa && 'WPA', o.wpa2 && 'WPA2', o.wpa3 && 'WPA3'].filter(Boolean)
  const akms = [sec.akm.dot1x && '802.1X', sec.akm.psk && 'PSK', o.sae && 'SAE'].filter(Boolean)
  return `${policies.map((p) => `[${p}]`).join('') || '[WPA]'}[Auth(${akms.join(', ') || 'none'})]`
}

/** What a client sees in its network list, such as "WPA2-Personal". */
export function securityLabel(w) {
  const o = offered(w.security)
  if (o.open) return 'Open'
  if (!isWpa(w.security)) return 'Legacy'
  const personal = o.psk || o.sae
  const versions = [o.wpa && 'WPA', o.wpa2 && 'WPA2', o.wpa3 && 'WPA3'].filter(Boolean)
  const top = o.sae && (o.psk ? 'WPA2/WPA3' : 'WPA3')
  const name = top || versions.slice(-1)[0] || 'WPA'
  if (personal && o.dot1x) return `${name}-Personal and Enterprise`
  return `${name}-${personal ? 'Personal' : 'Enterprise'}`
}

// ---------- validation (what the Apply button checks) ----------

const PRINTABLE = /^[\x20-\x7e]*$/

/** Errors for a pre-shared key in the given format, or []. */
export function pskErrors(psk, format) {
  if (!psk) return ['Enter a pre-shared key.']
  if (format === 'hex') return /^[0-9a-fA-F]{64}$/.test(psk) ? [] : ['A HEX key must be exactly 64 hexadecimal digits (0 to 9, a to f).']
  if (!PRINTABLE.test(psk)) return ['An ASCII key can use only printable ASCII characters.']
  if (psk.length < 8 || psk.length > 63) return [`An ASCII key must be 8 to 63 characters long (this one has ${psk.length}).`]
  return []
}

const intIn = (v, lo, hi) => {
  const s = String(v).trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n >= lo && n <= hi ? n : null
}

/** Errors the WLAN edit page would show on Apply, in the order AireOS-style alerts would show them. */
export function validateWlan(w, cfg) {
  const errors = []
  const ssid = String(w.ssid ?? '')
  if (!ssid.trim()) errors.push('The SSID cannot be empty.')
  else if (ssid.length > 32) errors.push('An SSID can be at most 32 characters.')
  else if (cfg.wlans.some((o) => o.id !== w.id && o.ssid === ssid)) errors.push(`WLAN ${cfg.wlans.find((o) => o.id !== w.id && o.ssid === ssid).id} already uses SSID "${ssid}". This lab keeps SSIDs unique.`)
  const iface = cfg.interfaces.find((i) => i.name === w.iface)
  if (!iface || !iface.wlanCapable) errors.push('Choose the interface that connects this WLAN to its VLAN.')

  const sec = w.security
  const opt = l2ById(sec.l2)
  if (opt.legacy) errors.push(`${opt.label} is a legacy method built on WEP, which is broken. Choose WPA+WPA2 or WPA2+WPA3.`)
  if (isWpa(sec)) {
    const mixed = sec.l2 === 'wpa+wpa2'
    const o = offered(sec)
    if (mixed && !sec.wpa && !sec.wpa2) errors.push('Select WPA2 Policy (or WPA Policy).')
    if (!mixed && !sec.wpa2 && !sec.wpa3) errors.push('Select WPA2 Policy, WPA3 Policy or both.')
    if (mixed && !o.aes && !o.tkip) errors.push('Select an encryption method: AES.')
    if (!mixed && !o.aes && !o.gcmp) errors.push('Select an encryption cipher: CCMP128 (AES) or GCMP256.')
    if (o.wpa2 && !o.aes) errors.push('WPA2 needs AES (CCMP128) encryption. TKIP alone belongs to the old WPA.')
    if (!sec.akm.dot1x && !sec.akm.psk && !(sec.akm.sae && !mixed)) errors.push('Enable at least one Authentication Key Management method.')
    if (!mixed && sec.akm.sae && !sec.wpa3) errors.push('SAE belongs to WPA3. Select WPA3 Policy to use it.')
    if (o.wpa3 && !o.sae && !sec.akm.dot1x) errors.push('WPA3 Policy needs SAE (Personal) or 802.1X (Enterprise) key management.')
    if (!mixed && o.wpa3 && !o.wpa2 && sec.akm.psk) errors.push('With only WPA3 Policy selected, use SAE instead of PSK. PSK key management belongs to WPA2.')
    if (o.wpa3 && !o.wpa2 && sec.pmf !== 'required') errors.push('WPA3 requires Protected Management Frames. Set PMF to Required.')
    if (o.sae && sec.pmf === 'disabled') errors.push('SAE needs PMF set to Optional or Required.')
    if (o.psk || o.sae) errors.push(...pskErrors(sec.psk, sec.pskFormat))
  }

  const adv = w.advanced
  if (adv.sessionTimeoutOn && intIn(adv.sessionTimeout, 300, 86400) === null) errors.push('Session Timeout must be a whole number of seconds from 300 to 86400.')
  if (adv.exclusionOn && intIn(adv.exclusionTimeout, 0, 86400) === null) errors.push('The Client Exclusion timeout must be a whole number of seconds from 0 to 86400 (0 means until an admin removes the client).')
  return errors
}

/** Errors for the WLANs > New form: Type, Profile Name, SSID, ID. */
export function validateNewWlan(form, cfg) {
  const errors = []
  const profile = String(form.profile ?? '').trim()
  const ssid = String(form.ssid ?? '')
  const id = Number(form.id)
  if (!profile) errors.push('Enter a Profile Name.')
  else if (profile.length > 32) errors.push('A Profile Name can be at most 32 characters.')
  else if (cfg.wlans.some((w) => w.profile.toLowerCase() === profile.toLowerCase())) errors.push(`Profile Name "${profile}" is already in use.`)
  if (!ssid.trim()) errors.push('Enter an SSID.')
  else if (ssid.length > 32) errors.push('An SSID can be at most 32 characters.')
  else if (cfg.wlans.some((w) => w.ssid === ssid)) errors.push(`WLAN ${cfg.wlans.find((w) => w.ssid === ssid).id} already uses SSID "${ssid}". This lab keeps SSIDs unique.`)
  if (!Number.isInteger(id) || id < 1 || id > 512) errors.push('Choose a WLAN ID.')
  else if (cfg.wlans.some((w) => w.id === id)) errors.push(`WLAN ID ${id} is already in use.`)
  return errors
}

/** WLAN IDs offered in the New form's ID drop-down (the free ones from 1 to 16). */
export const freeWlanIds = (cfg) => Array.from({ length: 16 }, (_, i) => i + 1).filter((id) => !cfg.wlans.some((w) => w.id === id))

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/** Errors for an interface edit (all fields are strings, as typed). */
export function validateInterface(form, cfg, originalName) {
  const errors = []
  const vlan = intIn(form.vlan, 1, 4094)
  if (vlan === null) errors.push('VLAN Identifier must be a number from 1 to 4094.')
  else {
    const other = cfg.interfaces.find((i) => i.name !== originalName && i.vlan === vlan)
    if (other) errors.push(`VLAN ${vlan} is already used by interface ${other.name}.`)
  }
  const ip = parseIp(form.ip)
  const bits = maskBits(form.mask)
  const gw = parseIp(form.gateway)
  if (ip === null) errors.push('Enter a valid IP Address, such as 10.10.20.5.')
  if (bits === null || bits < 8 || bits > 30) errors.push('Enter a valid Netmask, such as 255.255.255.0.')
  if (gw === null) errors.push('Enter a valid Gateway address.')
  if (ip !== null && bits !== null && bits >= 8 && bits <= 30) {
    const m = maskOf(bits)
    const host = ip & ~m
    if (host === 0 || (host >>> 0) === (~m >>> 0)) errors.push('The IP Address cannot be the subnet number or the broadcast address.')
    if (gw !== null && ((gw & m) >>> 0) !== ((ip & m) >>> 0)) errors.push('The Gateway must be in the same subnet as the IP Address.')
    if (gw !== null && gw === ip) errors.push('The Gateway cannot be the interface\'s own address.')
  }
  for (const [key, label] of [['dhcp1', 'Primary DHCP Server'], ['dhcp2', 'Secondary DHCP Server']]) {
    const v = String(form[key] ?? '').trim()
    if (v && parseIp(v) === null) errors.push(`${label} must be an IP address or empty.`)
  }
  return errors
}

export function validateNewInterface(form, cfg) {
  const errors = []
  const name = String(form.name ?? '').trim()
  if (!name) errors.push('Enter an Interface Name.')
  else if (name.length > 32 || !NAME_RE.test(name)) errors.push('Use up to 32 letters, digits, dots, dashes or underscores for the Interface Name.')
  else if (cfg.interfaces.some((i) => i.name.toLowerCase() === name.toLowerCase())) errors.push(`Interface ${name} already exists.`)
  const vlan = intIn(form.vlan, 1, 4094)
  if (vlan === null) errors.push('VLAN Id must be a number from 1 to 4094.')
  else if (cfg.interfaces.some((i) => i.vlan === vlan)) errors.push(`VLAN ${vlan} is already used by interface ${cfg.interfaces.find((i) => i.vlan === vlan).name}.`)
  return errors
}

// ---------- drafts: the form state behind an edit page ----------

/** WLAN edit-page draft: numbers become strings, as they would be in text boxes. */
export function wlanDraft(w) {
  const d = clone(w)
  d.advanced.sessionTimeout = String(w.advanced.sessionTimeout)
  d.advanced.exclusionTimeout = String(w.advanced.exclusionTimeout)
  return d
}

function wlanFromDraft(d) {
  const w = clone(d)
  w.ssid = String(d.ssid)
  w.advanced.sessionTimeout = Number(String(d.advanced.sessionTimeout).trim())
  w.advanced.exclusionTimeout = Number(String(d.advanced.exclusionTimeout).trim())
  return w
}

export function interfaceDraft(i) {
  return { name: i.name, vlan: i.vlan == null ? '' : String(i.vlan), ip: i.ip, mask: i.mask, gateway: i.gateway, dhcp1: i.dhcp1, dhcp2: i.dhcp2 }
}

/** True when a draft differs from what is applied. */
export const isDirty = (draft, original) => JSON.stringify(draft) !== JSON.stringify(original)

// ---------- applying changes ----------

/** WLANs > New > Apply. Returns { ok, errors, cfg, id }. */
export function applyNewWlan(cfg, form) {
  const errors = validateNewWlan(form, cfg)
  if (errors.length) return { ok: false, errors, cfg }
  const next = clone(cfg)
  const id = Number(form.id)
  next.wlans.push(newWlan({ id, profile: String(form.profile).trim(), ssid: String(form.ssid) }))
  next.wlans.sort((a, b) => a.id - b.id)
  return { ok: true, errors: [], cfg: next, id }
}

/** WLAN edit > Apply. Returns { ok, errors, cfg, dropped } where dropped lists clients that lost their connection. */
export function applyWlanEdit(cfg, draft) {
  const errors = validateWlan(draft, cfg)
  if (errors.length) return { ok: false, errors, cfg, dropped: [] }
  const next = clone(cfg)
  next.wlans = next.wlans.map((w) => (w.id === draft.id ? wlanFromDraft(draft) : w))
  return { ok: true, errors: [], ...refreshClients(next) }
}

/** Enable, disable or remove WLANs from the list page's action menu. */
export function setWlansEnabled(cfg, ids, enabled) {
  const next = clone(cfg)
  next.wlans.forEach((w) => {
    if (ids.includes(w.id)) w.enabled = enabled
  })
  return refreshClients(next)
}

export function removeWlans(cfg, ids) {
  const next = clone(cfg)
  next.wlans = next.wlans.filter((w) => !ids.includes(w.id))
  return refreshClients(next)
}

/** CONTROLLER > Interfaces > New > Apply: creates the interface with no address yet, as AireOS does. */
export function applyNewInterface(cfg, form) {
  const errors = validateNewInterface(form, cfg)
  if (errors.length) return { ok: false, errors, cfg }
  const next = clone(cfg)
  const name = String(form.name).trim()
  next.interfaces.push({ name, type: 'dynamic', vlan: Number(String(form.vlan).trim()), ip: '', mask: '', gateway: '', dhcp1: '', dhcp2: '', editable: true, wlanCapable: true, port: 1 })
  return { ok: true, errors: [], cfg: next, name }
}

export function applyInterfaceEdit(cfg, name, form) {
  const errors = validateInterface(form, cfg, name)
  if (errors.length) return { ok: false, errors, cfg, dropped: [] }
  const next = clone(cfg)
  next.interfaces = next.interfaces.map((i) =>
    i.name === name
      ? { ...i, vlan: Number(String(form.vlan).trim()), ip: form.ip.trim(), mask: form.mask.trim(), gateway: form.gateway.trim(), dhcp1: String(form.dhcp1 ?? '').trim(), dhcp2: String(form.dhcp2 ?? '').trim() }
      : i
  )
  return { ok: true, errors: [], ...refreshClients(next) }
}

// ---------- the client join ----------

/** SSIDs a device can see in its network list: enabled, broadcast, and on a band it has. */
export function visibleNetworks(cfg, deviceId) {
  const dev = deviceById(deviceId)
  const seen = new Map()
  for (const w of cfg.wlans) {
    if (!w.enabled || !w.broadcast || seen.has(w.ssid)) continue
    const band = dev.bands.find((b) => radioById(w.radio).bands.includes(b))
    if (band) seen.set(w.ssid, { ssid: w.ssid, wlanId: w.id, security: securityLabel(w), band })
  }
  return [...seen.values()]
}

const STEP_LABELS = {
  find: 'Find the network',
  security: 'Agree on security',
  key: 'Prove the passphrase',
  dhcp: 'Get an IP address'
}
export const JOIN_STEPS = Object.entries(STEP_LABELS).map(([id, label]) => ({ id, label }))

const bandText = (bands) => bands.map((b) => `${b} GHz`).join(' and ')

/**
 * Tries to connect a test client. attempt: { device, ssid, passphrase, typed }.
 * `typed` means the user typed the SSID (or the device has a saved profile), so the client
 * can probe for a hidden SSID. Returns { ok, code, steps, ...details } where each step is
 * { id, label, status: 'ok' | 'warn' | 'fail' | 'skip', text }.
 */
export function joinClient(cfg, attempt) {
  const dev = deviceById(attempt.device)
  const ssid = String(attempt.ssid ?? '')
  const pass = String(attempt.passphrase ?? '')
  const steps = []
  const step = (id, status, text) => steps.push({ id, label: STEP_LABELS[id], status, text })
  const done = (ok, code, extra = {}) => ({ ok, code, device: dev.id, ssid, steps, ...extra })

  // 1. Find the network: beacons for broadcast SSIDs, probe responses for a typed name.
  if (!ssid) {
    step('find', 'fail', 'Pick a network from the list or type an SSID.')
    return done(false, 'no-ssid')
  }
  const matches = cfg.wlans.filter((w) => w.ssid === ssid)
  if (!matches.length) {
    const near = cfg.wlans.find((w) => w.ssid.toLowerCase() === ssid.toLowerCase())
    step('find', 'fail', near
      ? `No AP offers "${ssid}". WLAN ${near.id} uses the SSID "${near.ssid}". SSIDs are case sensitive, so these are two different names.`
      : `No AP offers a network named "${ssid}". Check the SSID on the WLAN's General tab.`)
    return done(false, 'ssid-unknown')
  }
  const enabled = matches.filter((w) => w.enabled)
  if (!enabled.length) {
    const w = matches[0]
    step('find', 'fail', `WLAN ${w.id} (${w.profile}) has its Status disabled, so no AP sends beacons for "${ssid}" or answers probes for it.`)
    return done(false, 'disabled', { wlanId: w.id })
  }
  const onBand = enabled.map((w) => ({ w, band: dev.bands.find((b) => radioById(w.radio).bands.includes(b)) })).find((x) => x.band)
  if (!onBand) {
    const w = enabled[0]
    const policy = radioById(w.radio)
    step('find', 'fail', `The Radio Policy of WLAN ${w.id} is ${policy.label}, so only ${bandText(policy.bands)} radios offer "${ssid}". The ${dev.name.toLowerCase()} has only a ${bandText(dev.bands)} radio, so it never hears it.`)
    return done(false, 'radio', { wlanId: w.id })
  }
  const { w, band } = onBand
  if (!w.broadcast && !attempt.typed) {
    step('find', 'fail', `"${ssid}" is not broadcast, so it does not appear in the list. Type the SSID instead.`)
    return done(false, 'hidden', { wlanId: w.id })
  }
  step('find', w.broadcast ? 'ok' : 'warn', `${dev.ap} offers "${ssid}" on ${band} GHz (WLAN ${w.id}, profile ${w.profile}).${w.broadcast ? '' : ' Broadcast SSID is off, so the client found it by probing for the name. Hiding an SSID is not real security: the name still travels in probe and association frames.'}`)

  // 2. Agree on security from what the beacon advertises and what the client supports.
  const sec = w.security
  const o = offered(sec)
  let method = null
  let cipher = null
  if (o.open) {
    step('security', 'warn', 'Open authentication: no key and no encryption. Anyone in range can join and read the traffic.')
    method = 'Open'
  } else if (l2ById(sec.l2).legacy) {
    step('security', 'fail', `${l2ById(sec.l2).label} relies on WEP, which modern clients refuse.`)
    return done(false, 'legacy', { wlanId: w.id })
  } else {
    const saeOk = o.sae && sec.pmf !== 'disabled' && (o.aes || o.gcmp)
    const both = o.sae && o.psk
    if (saeOk && dev.wpa3) {
      method = 'WPA3-SAE'
      cipher = o.aes ? 'AES-CCMP128' : 'GCMP256'
      step('security', 'ok', `${both ? 'The WLAN offers WPA2 and WPA3; this client picks WPA3. ' : ''}Both sides support WPA3-Personal: SAE key management, ${cipher} encryption and Protected Management Frames.`)
    } else if (o.psk && o.wpa2 && dev.wpa2 && (o.aes || o.tkip)) {
      if (sec.pmf === 'required' && !dev.pmf) {
        step('security', 'fail', `The WLAN requires Protected Management Frames (PMF Required) and the ${dev.name.toLowerCase()} does not support PMF (802.11w), so the AP rejects its association. PMF Optional lets clients like this one join with WPA2.`)
        return done(false, 'pmf', { wlanId: w.id })
      }
      method = 'WPA2-PSK'
      cipher = o.aes ? 'AES-CCMP128' : 'TKIP'
      const pmfNote = sec.pmf !== 'disabled' && dev.pmf ? ' Management frames are protected (PMF).' : ''
      const pickNote = both ? `The WLAN offers WPA2 and WPA3; the ${dev.name.toLowerCase()} supports WPA2 at most, so it uses WPA2 (transition mode at work). ` : ''
      step('security', cipher === 'TKIP' ? 'warn' : 'ok', `${pickNote}Both sides support WPA2-Personal: PSK key management with ${cipher} encryption.${pmfNote}${cipher === 'TKIP' ? ' TKIP is deprecated; use AES.' : ''}`)
    } else if (o.psk && o.wpa && dev.wpa && (o.aes || o.tkip)) {
      method = 'WPA-PSK'
      cipher = o.tkip ? 'TKIP' : 'AES-CCMP128'
      step('security', 'warn', `Only the original WPA is on offer, so the client uses WPA-Personal with ${cipher}. WPA and TKIP are deprecated; select WPA2 Policy with AES.`)
    } else if (o.sae && !dev.wpa3) {
      step('security', 'fail', `"${ssid}" offers only WPA3-Personal (SAE). The ${dev.name.toLowerCase()} supports WPA2 at most, so it cannot join. WPA2+WPA3 transition mode (both policies, PSK and SAE, PMF Optional) would let WPA2 and WPA3 clients share one WLAN.`)
      return done(false, 'wpa3-unsupported', { wlanId: w.id })
    } else if (o.dot1x) {
      step('security', 'fail', `"${ssid}" uses 802.1X key management (Enterprise), so a client must sign in with credentials that a RADIUS server checks. This test client only has a passphrase. For a Personal WLAN, enable PSK under Authentication Key Management.`)
      return done(false, 'enterprise', { wlanId: w.id })
    } else {
      step('security', 'fail', 'The client and the WLAN have no security method in common.')
      return done(false, 'no-match', { wlanId: w.id })
    }
  }

  // 3. Prove the passphrase (Personal modes only). The key never crosses the air.
  if (method === 'Open') {
    step('key', 'skip', pass ? 'An open WLAN asks for no passphrase, so the one you typed was ignored.' : 'An open WLAN asks for no passphrase.')
  } else {
    const adv = w.advanced
    if (!pass) {
      step('key', 'fail', `"${ssid}" is a ${method === 'WPA3-SAE' ? 'WPA3' : 'WPA2'}-Personal network, so the client needs the passphrase. Type it in the test client.`)
      return done(false, 'psk-missing', { wlanId: w.id, method })
    }
    const match = sec.pskFormat === 'hex' ? pass.trim().toLowerCase() === sec.psk.toLowerCase() : pass === sec.psk
    if (!match) {
      const exclusion = adv.exclusionOn ? ` After repeated failures, Client Exclusion blocks a client for ${adv.exclusionTimeout} seconds.` : ''
      const hex = sec.pskFormat === 'hex' ? ' This WLAN stores a 64-digit HEX key, so the client must enter that same key.' : ' Passphrases are case sensitive.'
      step('key', 'fail', method === 'WPA3-SAE'
        ? `The SAE commit and confirm exchange failed because the client and the AP do not hold the same password.${hex} A captured SAE exchange cannot be used to guess the password offline, unlike a WPA2 handshake.${exclusion}`
        : `The four-way handshake failed: the AP checked message 2 with keys built from its own pre-shared key and the check did not match, so the client's passphrase is different.${hex}${exclusion}`)
      return done(false, 'psk-wrong', { wlanId: w.id, method })
    }
    step('key', 'ok', method === 'WPA3-SAE'
      ? 'SAE proved that both sides know the password without sending it, then the four-way handshake built the session keys. SAE also gives forward secrecy: a password leaked later cannot decrypt traffic captured today.'
      : 'The four-way handshake succeeded: both sides proved they hold the same pre-shared key without ever sending it, and built fresh encryption keys for this session.')
  }

  // 4. DHCP through the WLAN's interface and VLAN.
  const net = cfg.network
  const iface = cfg.interfaces.find((i) => i.name === w.iface)
  const stuck = w.advanced.dhcpRequired
    ? ' DHCP Addr. Assignment Required is on, so the controller holds the client in the DHCP-required state and passes none of its traffic.'
    : ' The client falls back to a 169.254.x.x link-local address and cannot reach anything.'
  const dhcpFail = (code, text) => {
    step('dhcp', 'fail', `${text}${stuck}`)
    return done(false, code, { wlanId: w.id, method, vlan: iface?.vlan ?? null })
  }
  if (!iface) return dhcpFail('iface-missing', `WLAN ${w.id} points at interface ${w.iface}, which does not exist.`)
  const vlan = iface.vlan
  const subnet = subnetOf(iface.ip, iface.mask)
  if (!subnet) return dhcpFail('dhcp-no-ip', `Interface ${iface.name} has no IP address yet, so the controller cannot relay the client's DHCP Discover.`)
  if (!net.trunkVlans.includes(vlan)) return dhcpFail('dhcp-vlan', `WLAN ${w.id} maps to interface ${iface.name} in VLAN ${vlan}. The switch trunk to the controller carries only VLANs ${net.trunkVlans.join(', ')}, so frames tagged VLAN ${vlan} are dropped and the DHCP Discover never reaches the network.`)
  const wired = net.vlanSubnets[vlan]
  if (wired && wired.subnet !== subnet) return dhcpFail('dhcp-subnet', `Interface ${iface.name} is addressed in ${subnet}, but VLAN ${vlan} on the wired network is ${wired.subnet}. The controller's relayed DHCP request has no working gateway.`)
  if (wired && iface.gateway !== wired.router) return dhcpFail('dhcp-gateway', `Interface ${iface.name} uses gateway ${iface.gateway}, but the router on VLAN ${vlan} is ${wired.router}, so relayed DHCP requests cannot leave the VLAN.`)
  const servers = [iface.dhcp1, iface.dhcp2].filter(Boolean)
  if (!servers.length) return dhcpFail('dhcp-no-server', `Interface ${iface.name} has no Primary DHCP Server, so the controller does not relay the client's DHCP Discover anywhere.`)
  const server = servers.find((s) => net.dhcpServers[s])
  if (!server) return dhcpFail('dhcp-server-wrong', `No DHCP server answers at ${servers.join(' or ')}. The DHCP server on this network is ${Object.keys(net.dhcpServers)[0]}.`)
  const scope = net.dhcpServers[server].find((cidr) => cidr === subnet)
  if (!scope) return dhcpFail('dhcp-scope', `The DHCP server at ${server} has no scope for ${subnet}, so it ignores the request.`)
  const [netAddr, bits] = subnet.split('/')
  const ip = ipStr(parseIp(netAddr) + dev.host)
  const mgmt = iface.name === 'management'
  step('dhcp', mgmt ? 'warn' : 'ok', `The controller relayed DHCP from interface ${iface.name} (VLAN ${vlan}) to ${server}, which leased ${ip}/${bits} with gateway ${iface.gateway}.${mgmt ? ` This WLAN uses the management interface, so wireless clients share VLAN ${vlan} with the controller and APs. Client WLANs belong on a dynamic interface.` : ''}`)

  const qos = qosById(w.qos)
  return done(true, 'ok', {
    wlanId: w.id,
    profile: w.profile,
    method,
    cipher,
    band,
    ap: dev.ap,
    protocol: dev.proto[band],
    iface: iface.name,
    vlan,
    ip,
    qos: w.qos,
    summary: `Connected to ${ssid} with ${method === 'Open' ? 'no security' : method}. Address ${ip} in VLAN ${vlan}, QoS ${qos.short} (${qos.use}).`
  })
}

/**
 * Join and record the result in the controller's client list (MONITOR > Clients).
 * A device that tries a network leaves the one it was on. Returns { cfg, result }.
 */
export function connectClient(cfg, attempt) {
  const result = joinClient(cfg, attempt)
  const next = clone(cfg)
  next.clients = next.clients.filter((c) => c.device !== result.device)
  if (result.ok) next.clients.push(clientRecord(attempt, result))
  return { cfg: next, result }
}

function clientRecord(attempt, r) {
  const dev = deviceById(r.device)
  return {
    device: dev.id,
    mac: dev.mac,
    attempt: { device: dev.id, ssid: attempt.ssid, passphrase: attempt.passphrase, typed: Boolean(attempt.typed) },
    ssid: r.ssid,
    wlanId: r.wlanId,
    profile: r.profile,
    ap: r.ap,
    protocol: r.protocol,
    method: r.method,
    ip: r.ip,
    vlan: r.vlan,
    iface: r.iface
  }
}

/** After a change, every connected client re-joins with its saved settings; the ones that fail drop off. */
export function refreshClients(cfg) {
  const next = clone(cfg)
  const dropped = []
  next.clients = next.clients.flatMap((c) => {
    const r = joinClient(next, c.attempt)
    if (r.ok) return [clientRecord(c.attempt, r)]
    dropped.push({ device: c.device, ssid: c.ssid, result: r })
    return []
  })
  return { cfg: next, dropped }
}

/** The step that failed, or null. */
export const failedStep = (result) => result?.steps.find((s) => s.status === 'fail') || null
