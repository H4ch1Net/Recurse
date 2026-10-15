// Scenarios for the WLC GUI widget: the starting controller, the brief, and live checks.
// Checks read the applied configuration (what Apply committed), never unsaved form edits.

import { joinClient, newWlan, offered } from './model.js'

/** The wired side every scenario shares: VLANs on the switch trunk, their subnets, one DHCP server. */
const NETWORK = {
  trunkVlans: [10, 20, 30, 40, 50],
  vlanSubnets: {
    10: { subnet: '10.10.10.0/24', router: '10.10.10.1', name: 'Management' },
    20: { subnet: '10.10.20.0/24', router: '10.10.20.1', name: 'Staff' },
    30: { subnet: '10.10.30.0/24', router: '10.10.30.1', name: 'Warehouse' },
    40: { subnet: '10.10.40.0/24', router: '10.10.40.1', name: 'Research' },
    50: { subnet: '10.10.50.0/24', router: '10.10.50.1', name: 'Guest' }
  },
  dhcpServers: { '10.10.1.17': ['10.10.10.0/24', '10.10.20.0/24', '10.10.30.0/24', '10.10.40.0/24', '10.10.50.0/24'] },
  switchPort: 'SW1 Gi1/0/48'
}

export const DHCP_SERVER = '10.10.1.17'

const STATIC_INTERFACES = [
  { name: 'management', type: 'static', vlan: 10, ip: '10.10.10.5', mask: '255.255.255.0', gateway: '10.10.10.1', dhcp1: DHCP_SERVER, dhcp2: '', editable: false, wlanCapable: true, apMgmt: true, port: 1 },
  { name: 'service-port', type: 'static', vlan: null, ip: '192.168.255.5', mask: '255.255.255.0', gateway: '', dhcp1: '', dhcp2: '', editable: false, wlanCapable: false, port: 'SP' },
  { name: 'virtual', type: 'static', vlan: null, ip: '192.0.2.1', mask: '', gateway: '', dhcp1: '', dhcp2: '', editable: false, wlanCapable: false, port: 'N/A' }
]

/** A dynamic interface on 10.10.<vlan>.0/24, relaying DHCP to the shared server. */
const dynamicInterface = (name, vlan) => ({ name, type: 'dynamic', vlan, ip: `10.10.${vlan}.5`, mask: '255.255.255.0', gateway: `10.10.${vlan}.1`, dhcp1: DHCP_SERVER, dhcp2: '', editable: true, wlanCapable: true, port: 1 })

/** An enabled WPA2-Personal (PSK, AES) WLAN. */
function personalWlan({ id, profile, ssid = profile, iface, psk, qos = 'silver' }) {
  const w = newWlan({ id, profile, ssid })
  w.enabled = true
  w.iface = iface
  w.qos = qos
  w.security.akm = { dot1x: false, psk: true, sae: false }
  w.security.psk = psk
  return w
}

function controller({ interfaces, wlans }) {
  return {
    system: { name: 'WLC1', model: 'Cisco 3504 Wireless Controller', version: '8.10.185.0', mgmtIp: '10.10.10.5', uptime: '12 days, 4 hours, 37 minutes' },
    interfaces: [STATIC_INTERFACES[0], ...interfaces, ...STATIC_INTERFACES.slice(1)].map((i) => ({ ...i })),
    wlans,
    network: structuredClone(NETWORK),
    aps: [
      { name: 'AP-Lobby', model: 'AIR-AP2802I-B-K9', ip: '10.10.10.21', mac: '70:db:98:3e:21:a0', mode: 'Local', status: 'Registered', uptime: '12 d, 04 h 31 m' },
      { name: 'AP-Floor2', model: 'AIR-AP1832I-B-K9', ip: '10.10.10.22', mac: '70:db:98:51:7c:40', mode: 'Local', status: 'Registered', uptime: '12 d, 04 h 30 m' }
    ],
    radius: [{ index: 1, ip: '10.10.1.20', port: 1812, enabled: true }],
    mgmtViaWireless: false,
    clients: [],
    meta: {}
  }
}

const vlanFact = (vlan, label = NETWORK.vlanSubnets[vlan].name.toLowerCase()) => ({ label: `VLAN ${vlan} (${label})`, value: `${NETWORK.vlanSubnets[vlan].subnet}, gateway ${NETWORK.vlanSubnets[vlan].router}` })
const COMMON_FACTS = [
  { label: 'Controller', value: 'WLC1, management 10.10.10.5 (VLAN 10)' },
  { label: 'DHCP server', value: `${DHCP_SERVER}, one scope per VLAN` },
  { label: 'Switch trunk to WLC', value: `${NETWORK.switchPort}, 802.1Q, VLANs ${NETWORK.trunkVlans.join(', ')}` }
]

// ---------- stats: what the learner did, for checks that are about actions ----------

export const emptyStats = () => ({ visited: [], created: 0, applied: [], joins: [] })

export function recordVisit(stats, page) {
  return stats.visited.includes(page) ? stats : { ...stats, visited: [...stats.visited, page] }
}
export function recordApply(stats, what) {
  return stats.applied.includes(what) ? stats : { ...stats, applied: [...stats.applied, what] }
}
export const recordCreate = (stats) => ({ ...stats, created: stats.created + 1 })
export function recordJoin(stats, result) {
  return { ...stats, joins: [...stats.joins, { device: result.device, ssid: result.ssid, ok: result.ok, code: result.code, method: result.method || null }].slice(-40) }
}

// ---------- hints keyed by why a join failed ----------

const CLUES = {
  disabled: 'The WLANs page shows each WLAN\'s Admin Status. A disabled WLAN is never advertised.',
  radio: 'Compare the Radio Policy on the General tab with the scanner, which has only a 2.4 GHz radio.',
  'ssid-unknown': 'Read the SSID on the General tab letter by letter. SSIDs are case sensitive.',
  enterprise: 'Look at Authentication Key Management on Security > Layer 2. Personal mode means PSK, not 802.1X.',
  pmf: 'The scanner has no PMF (802.11w) support. Check the PMF setting on Security > Layer 2.',
  'psk-wrong': 'The key on the controller is masked, so you cannot read it. Type the passphrase from the brief into the PSK field again, then Apply.',
  'dhcp-vlan': 'Open CONTROLLER > Interfaces and compare the interface VLAN with the VLANs the switch trunk carries.',
  'dhcp-no-server': 'Open the interface on CONTROLLER > Interfaces and look at its DHCP Information.',
  'wrong-vlan': 'Check which interface the General tab maps the WLAN to, then look up that interface\'s VLAN on CONTROLLER > Interfaces.'
}

// ---------- scenario definitions ----------

const findBySsid = (cfg, ssid) => cfg.wlans.find((w) => w.ssid === ssid)
const findByProfile = (cfg, profile) => cfg.wlans.find((w) => w.profile.toLowerCase() === profile.toLowerCase())
const ifaceVlan = (cfg, name) => cfg.interfaces.find((i) => i.name === name)?.vlan ?? null
const reached = (r, id) => r.steps.find((s) => s.id === id)
const passed = (r, id) => {
  const s = reached(r, id)
  return Boolean(s) && s.status !== 'fail'
}

const createWlan = {
  id: 'create-wlan',
  title: 'Build the Staff WLAN',
  kind: 'build',
  minutes: 10,
  story: 'The office already has a Guest WLAN. Staff need their own network: SSID Staff, bridged to the staff VLAN, secured with WPA2-Personal, and tuned for the video meetings they run all day.',
  brief: [
    'Create a WLAN with the Profile Name and SSID "Staff", and enable it.',
    'Connect it to the staff interface, which is VLAN 20.',
    'Secure it with WPA2-Personal: WPA2 Policy, AES and a PSK of 8 to 63 characters.',
    'Classify its traffic for video.',
    'Join the laptop to Staff with the test client.'
  ],
  facts: [...COMMON_FACTS, vlanFact(20), vlanFact(50)],
  client: { device: 'laptop', ssid: 'Staff', passphrase: '' },
  startPage: 'wlans',
  build() {
    return controller({
      interfaces: [dynamicInterface('staff', 20), dynamicInterface('guest', 50)],
      wlans: [personalWlan({ id: 1, profile: 'Guest', iface: 'guest', psk: 'Welcome-Guest-1', qos: 'bronze' })]
    })
  },
  checks(cfg) {
    const w = findBySsid(cfg, 'Staff')
    const o = w ? offered(w.security) : null
    const sec = w?.security
    return [
      { label: 'A WLAN with SSID Staff exists', pass: Boolean(w), hint: 'WLANs page: choose Create New, click Go, and enter Staff as the Profile Name and SSID. SSIDs are case sensitive.' },
      { label: 'Staff is enabled', pass: Boolean(w?.enabled), hint: 'General tab: tick Status Enabled, then Apply. New WLANs start disabled.' },
      { label: 'Staff uses the staff interface (VLAN 20)', pass: Boolean(w) && w.iface === 'staff' && ifaceVlan(cfg, 'staff') === 20, hint: 'General tab: set Interface/Interface Group(G) to staff. New WLANs start on the management interface.' },
      { label: 'Security is WPA2 with AES only', pass: Boolean(o) && o.wpa2 && !o.wpa && !o.wpa3 && o.aes && !o.tkip, hint: 'Security > Layer 2: WPA+WPA2, tick WPA2 Policy and AES. Leave WPA Policy and TKIP off; they are deprecated.' },
      { label: 'Authentication is PSK, not 802.1X', pass: Boolean(o) && o.psk && !sec.akm.dot1x && !o.sae && Boolean(sec.psk), hint: 'Authentication Key Management: untick 802.1X, tick PSK, keep the format ASCII and type a passphrase of 8 to 63 characters.' },
      { label: 'QoS is set for video', pass: w?.qos === 'gold', hint: 'QoS tab: Gold (video). Platinum is voice, Silver is best effort and Bronze is background.' },
      { label: 'The laptop is connected to Staff in VLAN 20', pass: cfg.clients.some((c) => c.ssid === 'Staff' && c.vlan === 20), hint: 'In the test client, pick the laptop and Staff, type your passphrase and press Connect.' }
    ]
  },
  reflection: [
    'Why should client WLANs use a dynamic interface instead of the management interface?',
    'Which QoS profile fits a WLAN that carries mostly phone calls?',
    'Why is turning off Broadcast SSID not a security control?'
  ]
}

const wpa3 = {
  id: 'wpa3',
  title: 'Move Research to WPA3',
  kind: 'build',
  minutes: 8,
  story: 'The Research WLAN runs WPA2-Personal. Every research laptop now supports WPA3, so security wants WPA3-Personal only: SAE in place of PSK, with management frames protected. Keep the passphrase Research-Lab-7.',
  brief: [
    'Open WLAN 1 (Research) and go to Security > Layer 2.',
    'Set Layer 2 Security to WPA2+WPA3 and offer only the WPA3 Policy.',
    'Make SAE the only key management method.',
    'Set Protected Management Frames the way WPA3 requires.',
    'Join the laptop, then try the old scanner and read why it cannot join.'
  ],
  facts: [...COMMON_FACTS, vlanFact(40)],
  client: { device: 'laptop', ssid: 'Research', passphrase: 'Research-Lab-7' },
  startPage: 'wlans',
  build() {
    return controller({
      interfaces: [dynamicInterface('research', 40)],
      wlans: [personalWlan({ id: 1, profile: 'Research', iface: 'research', psk: 'Research-Lab-7' })]
    })
  },
  checks(cfg, stats) {
    const w = findByProfile(cfg, 'Research') || findBySsid(cfg, 'Research')
    const sec = w?.security
    const o = w ? offered(sec) : null
    return [
      { label: 'Layer 2 Security is WPA2+WPA3 with only the WPA3 Policy', pass: Boolean(o) && sec.l2 === 'wpa2+wpa3' && o.wpa3 && !o.wpa2, hint: 'Security > Layer 2: choose WPA2+WPA3, tick WPA3 Policy and untick WPA2 Policy.' },
      { label: 'SAE is the only key management method', pass: Boolean(o) && o.sae && !sec.akm.psk && !sec.akm.dot1x, hint: 'Authentication Key Management: tick SAE, untick PSK and 802.1X. SAE uses the same passphrase field.' },
      { label: 'Protected Management Frames are Required', pass: sec?.pmf === 'required', hint: 'PMF: Required. WPA3 always protects management frames.' },
      { label: 'The laptop connects to Research with WPA3-SAE', pass: cfg.clients.some((c) => c.device === 'laptop' && c.ssid === (w?.ssid ?? 'Research') && c.method === 'WPA3-SAE'), hint: 'Test client: Laptop, Research, passphrase Research-Lab-7, Connect.' },
      { label: 'You tried the WPA2-only scanner on WPA3-only Research', pass: stats.joins.some((j) => j.device === 'scanner' && j.code === 'wpa3-unsupported'), hint: 'Test client: pick the handheld scanner and try Research. Read the explanation.' }
    ]
  },
  reflection: [
    'What attack against WPA2-Personal does SAE stop?',
    'How could the old scanners keep working while the laptops use WPA3?'
  ]
}

/** Seeded faults for the troubleshooting scenario: one per stage of the join, picked at random. */
export const FAULTS = {
  find: [
    { id: 'disabled', text: 'The Warehouse WLAN was disabled (Status unticked).', apply: (c, w) => (w.enabled = false) },
    { id: 'radio-a', text: 'The Radio Policy was 802.11a only, so the 2.4 GHz scanners never heard it.', apply: (c, w) => (w.radio = 'a') },
    { id: 'ssid-case', text: 'The SSID was "warehouse" in lower case; the scanners look for "Warehouse".', apply: (c, w) => (w.ssid = 'warehouse') }
  ],
  security: [
    { id: 'akm-dot1x', text: 'Key management was 802.1X (Enterprise) instead of PSK.', apply: (c, w) => (w.security.akm = { dot1x: true, psk: false, sae: false }) },
    { id: 'pmf-required', text: 'PMF was Required, and the scanners do not support PMF.', apply: (c, w) => (w.security.pmf = 'required') },
    { id: 'psk-wrong', text: 'The PSK was Forklift-Lane-6, not Forklift-Lane-9.', apply: (c, w) => (w.security.psk = 'Forklift-Lane-6') }
  ],
  dhcp: [
    { id: 'iface-wrong', text: 'The WLAN was mapped to the staff interface (VLAN 20) instead of warehouse.', apply: (c, w) => (w.iface = 'staff') },
    { id: 'vlan-typo', text: 'The warehouse interface had VLAN 31, which the switch trunk does not carry.', apply: (c) => (c.interfaces.find((i) => i.name === 'warehouse').vlan = 31) },
    { id: 'no-dhcp', text: 'The warehouse interface had no Primary DHCP Server.', apply: (c) => (c.interfaces.find((i) => i.name === 'warehouse').dhcp1 = '') }
  ]
}

export const SCANNER_PROFILE = { device: 'scanner', ssid: 'Warehouse', passphrase: 'Forklift-Lane-9', typed: true }

const troubleshoot = {
  id: 'troubleshoot',
  title: 'Fix the Warehouse WLAN',
  kind: 'troubleshoot',
  minutes: 12,
  story: 'Since last night\'s change window, none of the handheld scanners can get online. They are set up for SSID "Warehouse" with the passphrase Forklift-Lane-9, and their traffic belongs in VLAN 30. Laptops on Staff are fine. There is more than one problem.',
  brief: [
    'Use the test client with the handheld scanner to see where the join fails.',
    'Fix what the explanation points to on the controller, Apply, and test again.',
    'Keep the WLAN on WPA2-Personal with AES. Opening it up is not a fix.',
    'Finish with the scanner connected to Warehouse in VLAN 30.'
  ],
  symptoms: ['Scanners: "Unable to join Warehouse."', 'Laptops on Staff: working normally.'],
  facts: [...COMMON_FACTS, vlanFact(20), vlanFact(30)],
  client: { device: 'scanner', ssid: 'Warehouse', passphrase: 'Forklift-Lane-9', typed: true },
  startPage: 'wlans',
  build(rng = Math.random) {
    const cfg = controller({
      interfaces: [dynamicInterface('staff', 20), dynamicInterface('warehouse', 30)],
      wlans: [personalWlan({ id: 1, profile: 'Staff', iface: 'staff', psk: 'Staff-Video-42', qos: 'gold' }), personalWlan({ id: 2, profile: 'Warehouse', iface: 'warehouse', psk: 'Forklift-Lane-9' })]
    })
    const w = cfg.wlans[1]
    const picked = Object.values(FAULTS).map((group) => group[Math.min(group.length - 1, Math.floor(rng() * group.length))])
    picked.forEach((f) => f.apply(cfg, w))
    cfg.meta.faults = picked.map((f) => f.id)
    return cfg
  },
  checks(cfg) {
    const r = joinClient(cfg, SCANNER_PROFILE)
    const w = findByProfile(cfg, 'Warehouse')
    const o = w ? offered(w.security) : null
    const clue = CLUES[r.code]
    const vlanOk = r.ok && r.vlan === 30
    return [
      { label: 'The scanner finds Warehouse', pass: passed(r, 'find'), hint: (!passed(r, 'find') && clue) || 'Run the test client with the scanner and read the first step.' },
      { label: 'The scanner passes the security and passphrase checks', pass: passed(r, 'security') && passed(r, 'key'), hint: (reached(r, 'find') && passed(r, 'find') && !passed(r, 'key') && clue) || 'Fix the first problem, then test again to reach this step.' },
      { label: 'The scanner gets an address in VLAN 30 (10.10.30.0/24)', pass: vlanOk, hint: (r.ok && r.vlan !== 30 && CLUES['wrong-vlan']) || (passed(r, 'key') && clue) || 'Earlier steps must pass before DHCP happens.' },
      { label: 'Warehouse stays on WPA2-Personal with AES', pass: Boolean(o) && !o.open && o.wpa2 && o.psk && o.aes, hint: 'Security > Layer 2: WPA+WPA2 with WPA2 Policy, AES and PSK.' },
      { label: 'The scanner is connected to Warehouse in VLAN 30', pass: cfg.clients.some((c) => c.device === 'scanner' && c.ssid === 'Warehouse' && c.vlan === 30), hint: 'Test client: Handheld scanner, Warehouse, Forklift-Lane-9, Connect.' }
    ]
  },
  reflection: [
    'Which of the faults could you spot on the GUI alone, and which needed the test client?',
    'Why could the passphrase fault only show up after the scanner found the network?'
  ]
}

const explore = {
  id: 'explore',
  title: 'Free sandbox',
  kind: 'explore',
  minutes: 5,
  story: 'A controller with a Guest WLAN and three client VLAN interfaces. Build anything, break it on purpose, and use the test client to see what each setting does.',
  brief: [
    'Try a hidden SSID, a WPA3-only WLAN with the old scanner, or a WLAN on an interface whose VLAN the trunk does not carry.',
    'Every Apply re-checks the connected clients, so you can watch a change knock a client off.'
  ],
  facts: [...COMMON_FACTS, vlanFact(20), vlanFact(40), vlanFact(50)],
  client: { device: 'laptop', ssid: 'Guest', passphrase: 'Welcome-Guest-1' },
  startPage: 'summary',
  build() {
    return controller({
      interfaces: [dynamicInterface('staff', 20), dynamicInterface('research', 40), dynamicInterface('guest', 50)],
      wlans: [personalWlan({ id: 1, profile: 'Guest', iface: 'guest', psk: 'Welcome-Guest-1', qos: 'bronze' })]
    })
  },
  checks(cfg, stats) {
    return [
      { label: 'Look up the interface VLANs on CONTROLLER > Interfaces', pass: stats.visited.includes('ifaces'), hint: 'Top menu CONTROLLER, then Interfaces in the side menu.' },
      { label: 'Create a WLAN', pass: stats.created > 0, hint: 'WLANs page: Create New, Go.' },
      { label: 'Apply a change on the Security, QoS or Advanced tab', pass: ['security', 'qos', 'advanced'].some((t) => stats.applied.includes(t)), hint: 'Open a WLAN, change something on one of those tabs and press Apply.' },
      { label: 'Connect a test client to any WLAN', pass: stats.joins.some((j) => j.ok), hint: 'The Guest passphrase is Welcome-Guest-1.' }
    ]
  },
  reflection: []
}

export const SCENARIOS = [createWlan, wpa3, troubleshoot, explore]
export const SCENARIO_IDS = SCENARIOS.map((s) => s.id)
export const getScenario = (id) => SCENARIOS.find((s) => s.id === id) || SCENARIOS[0]

/** Every check, evaluated: [{ label, pass, hint }]. */
export const gradeScenario = (scenario, cfg, stats = emptyStats()) => scenario.checks(cfg, stats)

/** Hints cost a little, like the console labs. Explore always scores 1. */
export function scenarioScore(scenario, { hints = 0 } = {}) {
  if (scenario.kind === 'explore') return 1
  return Math.max(0.3, Math.round((1 - hints * 0.08) * 100) / 100)
}

/** Plain-language list of what was broken, for the end of the troubleshooting scenario. */
export function faultNotes(cfg) {
  const all = Object.values(FAULTS).flat()
  return (cfg.meta?.faults || []).map((id) => all.find((f) => f.id === id)?.text).filter(Boolean)
}
