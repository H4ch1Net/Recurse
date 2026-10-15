import { describe, expect, it } from 'vitest'
import { allowedText, crossLink, defaultConfig, goalStatus, ipOf, mismatchLog, nativeMismatch, ping, runningConfig, showInterfacesTrunk, showVlanBrief } from './vlan-trunk'

/** Config helper: VLANs for PC1..PC6 and link settings. */
function cfg(vlans, link = {}) {
  const c = defaultConfig()
  ;['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6'].forEach((id, i) => (c.access[id] = vlans[i]))
  c.link = { ...c.link, ...link, native: { ...c.link.native, ...(link.native || {}) } }
  return c
}
const goalVlans = [10, 20, 30, 10, 20, 30]
const trunk = (extra = {}) => ({ mode: 'trunk', ...extra })

describe('defaults', () => {
  it('starts with everything in VLAN 1, so everyone can reach everyone', () => {
    const c = defaultConfig()
    expect(ping(c, 'PC1', 'PC6').ok).toBe(true)
    expect(ipOf(c, 'PC1')).toBe('10.0.1.11')
    expect(goalStatus(c).done).toBe(false)
  })
})

describe('allowedText', () => {
  it('prints IOS style ranges', () => {
    expect(allowedText([])).toBe('1-4094')
    expect(allowedText([20])).toBe('1-19,21-4094')
    expect(allowedText([1])).toBe('2-4094')
    expect(allowedText([10, 20, 30])).toBe('1-9,11-19,21-29,31-4094')
  })
})

describe('ping', () => {
  it('fails between VLANs because they are different subnets', () => {
    const r = ping(cfg(goalVlans, trunk()), 'PC1', 'PC5')
    expect(r).toMatchObject({ ok: false, reason: 'different-vlan', failAt: 'source-switch' })
    expect(r.text).toMatch(/router or a Layer 3 switch/)
  })

  it('works on one switch without touching the link', () => {
    const r = ping(cfg([10, 10, 30, 1, 1, 1]), 'PC1', 'PC2')
    expect(r).toMatchObject({ ok: true, crosses: false })
  })

  it('fails across an access link in another VLAN', () => {
    const r = ping(cfg(goalVlans), 'PC1', 'PC4')
    expect(r).toMatchObject({ ok: false, reason: 'access-link', failAt: 'link' })
  })

  it('works across an access link in the same VLAN, untagged', () => {
    const r = ping(cfg(goalVlans, { accessVlan: 10 }), 'PC1', 'PC4')
    expect(r).toMatchObject({ ok: true, tag: null })
    expect(ping(cfg(goalVlans, { accessVlan: 10 }), 'PC2', 'PC5').ok).toBe(false)
  })

  it('tags non-native VLANs on a trunk', () => {
    const r = ping(cfg(goalVlans, trunk()), 'PC2', 'PC5')
    expect(r).toMatchObject({ ok: true, tag: 20 })
    expect(r.text).toMatch(/802\.1Q tag with VLAN ID 20/)
  })

  it('sends the native VLAN untagged', () => {
    const r = ping(cfg(goalVlans, trunk({ native: { SW1: 10, SW2: 10 } })), 'PC1', 'PC4')
    expect(r).toMatchObject({ ok: true, tag: null })
  })

  it('blocks VLANs removed from the allowed list', () => {
    const r = ping(cfg(goalVlans, trunk({ removed: [30] })), 'PC3', 'PC6')
    expect(r).toMatchObject({ ok: false, reason: 'not-allowed' })
    expect(r.text).toMatch(/allowed vlan add 30/)
  })

  it('breaks the native VLAN on a native mismatch', () => {
    const c = cfg(goalVlans, trunk({ native: { SW1: 10, SW2: 1 } }))
    const r = ping(c, 'PC1', 'PC4')
    expect(r).toMatchObject({ ok: false, reason: 'native', leg: 'request', landsIn: 1 })
    expect(nativeMismatch(c)).toBe(true)
    expect(mismatchLog(c)).toMatch(/NATIVE_VLAN_MISMATCH.*\(10\).*\(1\)/)
  })

  it('a mismatch can break only the reply', () => {
    const c = cfg(goalVlans, trunk({ native: { SW1: 1, SW2: 10 } }))
    const r = ping(c, 'PC1', 'PC4')
    expect(r).toMatchObject({ ok: false, reason: 'native', leg: 'reply' })
    expect(r.text).toMatch(/request got through/)
  })

  it('other VLANs are fine during a mismatch', () => {
    const c = cfg(goalVlans, trunk({ native: { SW1: 10, SW2: 1 } }))
    expect(ping(c, 'PC2', 'PC5').ok).toBe(true)
  })

  it('crossLink reports where an untagged frame lands', () => {
    const c = cfg(goalVlans, trunk({ native: { SW1: 20, SW2: 30 } }))
    expect(crossLink(c, 'SW1', 20)).toMatchObject({ ok: false, tag: null, landsIn: 30 })
    expect(crossLink(c, 'SW1', 30)).toMatchObject({ ok: true, tag: 30, landsIn: 30 })
  })

  it('refuses a ping to itself', () => {
    expect(() => ping(defaultConfig(), 'PC1', 'PC1')).toThrow()
  })
})

describe('goalStatus', () => {
  it('needs the VLANs assigned and a working trunk', () => {
    expect(goalStatus(cfg(goalVlans))).toMatchObject({ assigned: true, trunk: false, reach: false, done: false })
    expect(goalStatus(cfg(goalVlans, trunk())).done).toBe(true)
    expect(goalStatus(cfg([30, 10, 20, 20, 30, 10], trunk())).done).toBe(true)
    expect(goalStatus(cfg([10, 10, 30, 10, 20, 30], trunk())).assigned).toBe(false)
    expect(goalStatus(cfg(goalVlans, trunk({ removed: [20] }))).done).toBe(false)
    expect(goalStatus(cfg(goalVlans, trunk({ native: { SW1: 10, SW2: 1 } }))).pairs.map((p) => p.ok)).toEqual([false, true, true])
  })
})

describe('show commands', () => {
  it('show vlan brief lists access ports and hides trunks', () => {
    const access = showVlanBrief(cfg(goalVlans), 'SW1').join('\n')
    expect(access).toMatch(/^1\s+default\s+active\s+Gi0\/1$/m)
    expect(access).toMatch(/^10\s+VLAN0010\s+active\s+Fa0\/1$/m)
    const trunked = showVlanBrief(cfg(goalVlans, trunk()), 'SW1').join('\n')
    expect(trunked).not.toContain('Gi0/1')
  })

  it('show interfaces trunk is empty unless trunking', () => {
    expect(showInterfacesTrunk(cfg(goalVlans), 'SW1')).toEqual([])
    const out = showInterfacesTrunk(cfg(goalVlans, trunk({ removed: [20], native: { SW1: 10, SW2: 10 } })), 'SW2').join('\n')
    expect(out).toMatch(/Gi0\/1\s+on\s+802\.1q\s+trunking\s+10/)
    expect(out).toContain('1-19,21-4094')
    expect(out).toMatch(/management domain\nGi0\/1\s+1,10,30/)
  })

  it('running config shows only non-default lines', () => {
    const out = runningConfig(cfg(goalVlans, trunk({ native: { SW1: 99 }, removed: [1] })), 'SW1').join('\n')
    expect(out).toContain('switchport access vlan 10')
    expect(out).toContain('switchport mode trunk')
    expect(out).toContain('switchport trunk native vlan 99')
    expect(out).toContain('switchport trunk allowed vlan 2-4094')
    const plain = runningConfig(defaultConfig(), 'SW2').join('\n')
    expect(plain).not.toContain('access vlan')
  })
})
