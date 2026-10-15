import { describe, expect, it } from 'vitest'
import {
  applyInterfaceEdit,
  applyNewInterface,
  applyNewWlan,
  applyWlanEdit,
  connectClient,
  freeWlanIds,
  interfaceDraft,
  isDirty,
  joinClient,
  maskBits,
  newWlan,
  parseIp,
  pskErrors,
  removeWlans,
  securityLabel,
  securityPolicies,
  setWlansEnabled,
  subnetOf,
  validateInterface,
  validateNewInterface,
  validateNewWlan,
  validateWlan,
  visibleNetworks,
  wlanDraft
} from './model.js'
import { getScenario } from './scenarios.js'

/** The explore controller: Guest WLAN 1 (WPA2-PSK on guest, VLAN 50), staff 20, research 40. */
const base = () => getScenario('explore').build()

/** Add a WLAN through the New form and return the controller with it applied. */
function withWlan(cfg, profile, edit = () => {}, ssid = profile) {
  const created = applyNewWlan(cfg, { profile, ssid, id: freeWlanIds(cfg)[0] })
  expect(created.ok).toBe(true)
  const draft = wlanDraft(created.cfg.wlans.find((w) => w.id === created.id))
  edit(draft)
  const res = applyWlanEdit(created.cfg, draft)
  expect(res.errors).toEqual([])
  return res.cfg
}

/** WPA2-Personal, AES, PSK, enabled, on the staff interface. */
const wpa2Staff = (d) => {
  d.enabled = true
  d.iface = 'staff'
  d.security.akm = { dot1x: false, psk: true, sae: false }
  d.security.psk = 'Staff-Video-42'
}

const wpa3Only = (d) => {
  wpa2Staff(d)
  d.security.l2 = 'wpa2+wpa3'
  d.security.wpa2 = false
  d.security.wpa3 = true
  d.security.akm = { dot1x: false, psk: false, sae: true }
  d.security.pmf = 'required'
}

const join = (cfg, device, ssid, passphrase, typed = false) => joinClient(cfg, { device, ssid, passphrase, typed })
const stepOf = (r, id) => r.steps.find((s) => s.id === id)

describe('IPv4 helpers', () => {
  it('parses addresses and masks', () => {
    expect(parseIp('10.10.20.5')).toBe(0x0a0a1405)
    expect(parseIp('10.10.20.256')).toBe(null)
    expect(parseIp('10.10.20')).toBe(null)
    expect(maskBits('255.255.255.0')).toBe(24)
    expect(maskBits('255.255.255.252')).toBe(30)
    expect(maskBits('255.0.255.0')).toBe(null)
    expect(subnetOf('10.10.20.5', '255.255.255.0')).toBe('10.10.20.0/24')
    expect(subnetOf('', '')).toBe(null)
  })
})

describe('a new WLAN', () => {
  it('gets the AireOS defaults Odom describes', () => {
    const w = newWlan({ id: 2, profile: 'Staff', ssid: 'Staff' })
    expect(w.enabled).toBe(false)
    expect(w.iface).toBe('management')
    expect(w.radio).toBe('all')
    expect(w.broadcast).toBe(true)
    expect(w.qos).toBe('silver')
    expect(w.advanced).toMatchObject({ sessionTimeoutOn: true, sessionTimeout: 1800, exclusionOn: true, exclusionTimeout: 60, dhcpRequired: false })
    expect(securityPolicies(w)).toBe('[WPA2][Auth(802.1X)]')
    expect(securityLabel(w)).toBe('WPA2-Enterprise')
  })

  it('describes security the way the WLANs list does', () => {
    const w = newWlan({ id: 1, profile: 'A', ssid: 'A' })
    w.security.akm = { dot1x: false, psk: true, sae: false }
    expect(securityPolicies(w)).toBe('[WPA2][Auth(PSK)]')
    expect(securityLabel(w)).toBe('WPA2-Personal')
    w.security.l2 = 'wpa2+wpa3'
    w.security.wpa3 = true
    w.security.akm.sae = true
    expect(securityPolicies(w)).toBe('[WPA2][WPA3][Auth(PSK, SAE)]')
    expect(securityLabel(w)).toBe('WPA2/WPA3-Personal')
    w.security.l2 = 'none'
    expect(securityPolicies(w)).toBe('None')
    expect(securityLabel(w)).toBe('Open')
  })
})

describe('validation', () => {
  it('checks PSK length and format', () => {
    expect(pskErrors('', 'ascii')).toHaveLength(1)
    expect(pskErrors('short', 'ascii')[0]).toMatch(/8 to 63/)
    expect(pskErrors('x'.repeat(64), 'ascii')[0]).toMatch(/8 to 63/)
    expect(pskErrors('Staff-Video-42', 'ascii')).toEqual([])
    expect(pskErrors('Staff-Video-42', 'hex')[0]).toMatch(/64 hexadecimal/)
    expect(pskErrors('ab'.repeat(32), 'hex')).toEqual([])
  })

  it('enforces the WPA3 rules', () => {
    const cfg = base()
    const d = wlanDraft(newWlan({ id: 5, profile: 'X', ssid: 'X' }))
    wpa3Only(d)
    expect(validateWlan(d, cfg)).toEqual([])
    d.security.pmf = 'optional'
    expect(validateWlan(d, cfg)).toEqual(['WPA3 requires Protected Management Frames. Set PMF to Required.'])
    d.security.wpa2 = true
    d.security.akm.psk = true
    d.security.pmf = 'disabled'
    expect(validateWlan(d, cfg)).toEqual(['SAE needs PMF set to Optional or Required, even in transition mode.'])
    d.security.pmf = 'optional'
    expect(validateWlan(d, cfg)).toEqual([])
    d.security.wpa2 = false
    d.security.akm.psk = false
    d.security.pmf = 'disabled'
    expect(validateWlan(d, cfg).join(' ')).toMatch(/PMF to Required/)
    d.security.pmf = 'required'
    d.security.akm.psk = true
    expect(validateWlan(d, cfg).join(' ')).toMatch(/use SAE instead of PSK/)
    d.security.akm = { dot1x: false, psk: false, sae: true }
    d.security.wpa3 = false
    d.security.wpa2 = true
    expect(validateWlan(d, cfg).join(' ')).toMatch(/SAE belongs to WPA3/)
  })

  it('needs a policy, a cipher and a key management method', () => {
    const cfg = base()
    const d = wlanDraft(newWlan({ id: 5, profile: 'X', ssid: 'X' }))
    d.security.wpa2 = false
    expect(validateWlan(d, cfg).join(' ')).toMatch(/Select WPA2 Policy/)
    d.security.wpa2 = true
    d.security.cipher = { aes: false, tkip: true, gcmp256: false }
    expect(validateWlan(d, cfg).join(' ')).toMatch(/WPA2 needs AES/)
    d.security.cipher.aes = true
    d.security.akm = { dot1x: false, psk: false, sae: false }
    expect(validateWlan(d, cfg).join(' ')).toMatch(/at least one Authentication Key Management/)
    d.security.akm.psk = true
    expect(validateWlan(d, cfg).join(' ')).toMatch(/pre-shared key/)
  })

  it('rejects legacy WEP options and bad timeouts', () => {
    const cfg = base()
    const d = wlanDraft(newWlan({ id: 5, profile: 'X', ssid: 'X' }))
    d.security.l2 = 'static-wep'
    expect(validateWlan(d, cfg).join(' ')).toMatch(/WEP, which is broken/)
    d.security.l2 = 'none'
    d.advanced.sessionTimeout = '100'
    expect(validateWlan(d, cfg).join(' ')).toMatch(/300 to 86400/)
    d.advanced.sessionTimeoutOn = false
    expect(validateWlan(d, cfg)).toEqual([])
  })

  it('validates the New WLAN form', () => {
    const cfg = base()
    expect(validateNewWlan({ profile: 'Guest', ssid: 'Other', id: 2 }, cfg)[0]).toMatch(/already in use/)
    expect(validateNewWlan({ profile: 'Other', ssid: 'Guest', id: 2 }, cfg)[0]).toMatch(/already uses SSID/)
    expect(validateNewWlan({ profile: 'Staff', ssid: 'Staff', id: 1 }, cfg)[0]).toMatch(/ID 1 is already in use/)
    expect(validateNewWlan({ profile: 'Staff', ssid: 'x'.repeat(33), id: 2 }, cfg)[0]).toMatch(/32 characters/)
    expect(validateNewWlan({ profile: 'Staff', ssid: 'Staff', id: 2 }, cfg)).toEqual([])
    expect(freeWlanIds(cfg)[0]).toBe(2)
  })

  it('validates interfaces', () => {
    const cfg = base()
    const form = interfaceDraft(cfg.interfaces.find((i) => i.name === 'staff'))
    expect(validateInterface(form, cfg, 'staff')).toEqual([])
    expect(validateInterface({ ...form, gateway: '10.10.30.1' }, cfg, 'staff').join(' ')).toMatch(/same subnet/)
    expect(validateInterface({ ...form, vlan: '40' }, cfg, 'staff').join(' ')).toMatch(/already used by interface research/)
    expect(validateInterface({ ...form, ip: '10.10.20.0' }, cfg, 'staff').join(' ')).toMatch(/subnet number/)
    expect(validateInterface({ ...form, dhcp1: 'server' }, cfg, 'staff').join(' ')).toMatch(/Primary DHCP Server/)
    expect(validateNewInterface({ name: 'staff', vlan: '60' }, cfg)[0]).toMatch(/already exists/)
    expect(validateNewInterface({ name: 'iot', vlan: '20' }, cfg)[0]).toMatch(/already used/)
    expect(validateNewInterface({ name: 'iot', vlan: '60' }, cfg)).toEqual([])
  })

  it('tracks unsaved edits', () => {
    const w = base().wlans[0]
    const d = wlanDraft(w)
    expect(isDirty(d, wlanDraft(w))).toBe(false)
    d.qos = 'gold'
    expect(isDirty(d, wlanDraft(w))).toBe(true)
  })
})

describe('joining a client', () => {
  it('connects to a WPA2-Personal WLAN and gets an address in its VLAN', () => {
    const cfg = withWlan(base(), 'Staff', wpa2Staff)
    const r = join(cfg, 'laptop', 'Staff', 'Staff-Video-42')
    expect(r).toMatchObject({ ok: true, method: 'WPA2-PSK', cipher: 'AES-CCMP128', vlan: 20, ip: '10.10.20.101', band: '5' })
    expect(r.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(stepOf(r, 'key').text).toMatch(/without ever sending it/)
    expect(join(cfg, 'scanner', 'Staff', 'Staff-Video-42')).toMatchObject({ ok: true, ip: '10.10.20.102', band: '2.4' })
  })

  it('cannot see a disabled WLAN, and says so', () => {
    const cfg = withWlan(base(), 'Staff', (d) => {
      wpa2Staff(d)
      d.enabled = false
    })
    expect(visibleNetworks(cfg, 'laptop').map((n) => n.ssid)).toEqual(['Guest'])
    const r = join(cfg, 'laptop', 'Staff', 'Staff-Video-42', true)
    expect(r).toMatchObject({ ok: false, code: 'disabled' })
    expect(stepOf(r, 'find').text).toMatch(/Status disabled/)
  })

  it('treats SSIDs as case sensitive', () => {
    const cfg = withWlan(base(), 'Staff', wpa2Staff)
    const r = join(cfg, 'laptop', 'staff', 'Staff-Video-42', true)
    expect(r.code).toBe('ssid-unknown')
    expect(stepOf(r, 'find').text).toMatch(/case sensitive/)
  })

  it('applies the radio policy to what each client can hear', () => {
    const cfg = withWlan(base(), 'Staff', (d) => {
      wpa2Staff(d)
      d.radio = 'a'
    })
    expect(visibleNetworks(cfg, 'scanner').map((n) => n.ssid)).toEqual(['Guest'])
    expect(visibleNetworks(cfg, 'laptop').map((n) => n.ssid)).toContain('Staff')
    const r = join(cfg, 'scanner', 'Staff', 'Staff-Video-42', true)
    expect(r.code).toBe('radio')
    expect(stepOf(r, 'find').text).toMatch(/802\.11a only.*5 GHz.*2\.4 GHz/)
  })

  it('finds a hidden SSID only when the name is typed', () => {
    const cfg = withWlan(base(), 'Staff', (d) => {
      wpa2Staff(d)
      d.broadcast = false
    })
    expect(visibleNetworks(cfg, 'laptop').map((n) => n.ssid)).not.toContain('Staff')
    expect(join(cfg, 'laptop', 'Staff', 'Staff-Video-42').code).toBe('hidden')
    const r = join(cfg, 'laptop', 'Staff', 'Staff-Video-42', true)
    expect(r.ok).toBe(true)
    expect(stepOf(r, 'find')).toMatchObject({ status: 'warn' })
    expect(stepOf(r, 'find').text).toMatch(/not real security/)
  })

  it('explains 802.1X, wrong passphrases and missing PMF support', () => {
    const enterprise = withWlan(base(), 'Corp', (d) => {
      d.enabled = true
      d.iface = 'staff'
    })
    expect(join(enterprise, 'laptop', 'Corp', 'anything').code).toBe('enterprise')

    const cfg = withWlan(base(), 'Staff', wpa2Staff)
    const wrong = join(cfg, 'laptop', 'Staff', 'staff-video-42')
    expect(wrong.code).toBe('psk-wrong')
    expect(stepOf(wrong, 'key').text).toMatch(/four-way handshake failed.*case sensitive.*Client Exclusion blocks a client for 60 seconds/)
    expect(join(cfg, 'laptop', 'Staff', '').code).toBe('psk-missing')

    const pmf = withWlan(base(), 'Staff', (d) => {
      wpa2Staff(d)
      d.security.pmf = 'required'
    })
    expect(join(pmf, 'laptop', 'Staff', 'Staff-Video-42').ok).toBe(true)
    expect(join(pmf, 'scanner', 'Staff', 'Staff-Video-42').code).toBe('pmf')
  })

  it('uses SAE for WPA3 clients and locks WPA2-only clients out of WPA3-only WLANs', () => {
    const cfg = withWlan(base(), 'Staff', wpa3Only)
    const laptop = join(cfg, 'laptop', 'Staff', 'Staff-Video-42')
    expect(laptop).toMatchObject({ ok: true, method: 'WPA3-SAE' })
    expect(stepOf(laptop, 'key').text).toMatch(/forward secrecy/)
    const scanner = join(cfg, 'scanner', 'Staff', 'Staff-Video-42')
    expect(scanner.code).toBe('wpa3-unsupported')
    expect(stepOf(scanner, 'security').text).toMatch(/transition mode/)
    expect(join(cfg, 'laptop', 'Staff', 'nope-nope-nope').code).toBe('psk-wrong')
  })

  it('lets both clients share a WPA2+WPA3 transition-mode WLAN', () => {
    const cfg = withWlan(base(), 'Staff', (d) => {
      wpa2Staff(d)
      d.security.l2 = 'wpa2+wpa3'
      d.security.wpa3 = true
      d.security.akm = { dot1x: false, psk: true, sae: true }
      d.security.pmf = 'optional'
    })
    expect(join(cfg, 'laptop', 'Staff', 'Staff-Video-42')).toMatchObject({ ok: true, method: 'WPA3-SAE' })
    expect(join(cfg, 'scanner', 'Staff', 'Staff-Video-42')).toMatchObject({ ok: true, method: 'WPA2-PSK' })
  })

  it('joins an open WLAN without a key and warns about it', () => {
    const cfg = withWlan(base(), 'Open', (d) => {
      d.enabled = true
      d.iface = 'guest'
      d.security.l2 = 'none'
    })
    const r = join(cfg, 'laptop', 'Open', '')
    expect(r).toMatchObject({ ok: true, method: 'Open', vlan: 50 })
    expect(stepOf(r, 'security').status).toBe('warn')
    expect(stepOf(r, 'key').status).toBe('skip')
  })

  it('follows DHCP through the interface, the trunk and the server', () => {
    let cfg = withWlan(base(), 'Staff', wpa2Staff)
    const staff = interfaceDraft(cfg.interfaces.find((i) => i.name === 'staff'))

    const vlan60 = applyInterfaceEdit(cfg, 'staff', { ...staff, vlan: '60' })
    expect(vlan60.ok).toBe(true)
    const r1 = join(vlan60.cfg, 'laptop', 'Staff', 'Staff-Video-42')
    expect(r1.code).toBe('dhcp-vlan')
    expect(stepOf(r1, 'dhcp').text).toMatch(/carries only VLANs 10, 20, 30, 40, 50/)
    expect(stepOf(r1, 'dhcp').text).toMatch(/169\.254/)

    const noDhcp = applyInterfaceEdit(cfg, 'staff', { ...staff, dhcp1: '' })
    expect(join(noDhcp.cfg, 'laptop', 'Staff', 'Staff-Video-42').code).toBe('dhcp-no-server')

    const wrongSubnet = applyInterfaceEdit(cfg, 'staff', { ...staff, ip: '10.10.30.5', gateway: '10.10.30.1' })
    expect(join(wrongSubnet.cfg, 'laptop', 'Staff', 'Staff-Video-42').code).toBe('dhcp-subnet')

    const required = withWlan(base(), 'Staff', (d) => {
      wpa2Staff(d)
      d.advanced.dhcpRequired = true
    })
    const stuck = applyInterfaceEdit(required, 'staff', { ...interfaceDraft(required.interfaces.find((i) => i.name === 'staff')), dhcp1: '' })
    expect(stepOf(join(stuck.cfg, 'laptop', 'Staff', 'Staff-Video-42'), 'dhcp').text).toMatch(/DHCP-required state/)

    cfg = applyNewInterface(cfg, { name: 'iot', vlan: '60' }).cfg
    cfg = withWlan(cfg, 'Things', (d) => {
      wpa2Staff(d)
      d.iface = 'iot'
    })
    expect(join(cfg, 'laptop', 'Things', 'Staff-Video-42').code).toBe('dhcp-no-ip')
  })

  it('warns when a WLAN sits on the management interface', () => {
    const cfg = withWlan(base(), 'Staff', (d) => {
      wpa2Staff(d)
      d.iface = 'management'
    })
    const r = join(cfg, 'laptop', 'Staff', 'Staff-Video-42')
    expect(r).toMatchObject({ ok: true, vlan: 10 })
    expect(stepOf(r, 'dhcp').status).toBe('warn')
  })
})

describe('the client list', () => {
  it('records connected clients and drops them when a change breaks them', () => {
    let cfg = withWlan(base(), 'Staff', wpa2Staff)
    const res = connectClient(cfg, { device: 'laptop', ssid: 'Staff', passphrase: 'Staff-Video-42' })
    cfg = res.cfg
    expect(cfg.clients).toHaveLength(1)
    expect(cfg.clients[0]).toMatchObject({ device: 'laptop', ssid: 'Staff', vlan: 20, method: 'WPA2-PSK' })

    const off = setWlansEnabled(cfg, [2], false)
    expect(off.cfg.clients).toHaveLength(0)
    expect(off.dropped[0]).toMatchObject({ device: 'laptop', ssid: 'Staff' })

    const draft = wlanDraft(cfg.wlans.find((w) => w.id === 2))
    draft.qos = 'gold'
    const qos = applyWlanEdit(cfg, draft)
    expect(qos.dropped).toEqual([])
    expect(qos.cfg.clients).toHaveLength(1)

    expect(removeWlans(cfg, [2]).cfg.clients).toHaveLength(0)

    const failed = connectClient(cfg, { device: 'laptop', ssid: 'Guest', passphrase: 'wrong-guess' })
    expect(failed.result.ok).toBe(false)
    expect(failed.cfg.clients).toHaveLength(0)
  })
})
