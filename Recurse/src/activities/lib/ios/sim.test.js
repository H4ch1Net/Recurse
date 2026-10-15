import { describe, expect, it } from 'vitest'
import { complete, createSim, helpLines, interrupt, modeKey, promptFor, runLine } from './sim.js'
import { aclEval, aclRuleText } from './device.js'
import { canonicalIf, formatVlanList, ipv6ToStr, parseIPv6, parseVlanList, shortIf } from './addr.js'
import { explainCommand } from './help.js'

function clock() {
  let t = 1_700_000_000_000
  return () => (t += 1000)
}

function router(opts = {}) {
  return createSim({ kind: 'router', now: clock(), ...opts })
}

function sw(opts = {}) {
  return createSim({ kind: 'switch', now: clock(), ...opts })
}

/** Run several lines, answering any pending question with Enter. */
function run(sim, ...lines) {
  let last
  for (const l of lines) {
    last = runLine(sim, l)
    while (sim.pending && !['enable-pw', 'login-user', 'login-pass'].includes(sim.pending.kind)) runLine(sim, '')
  }
  return last
}

describe('modes and prompts', () => {
  it('walks user, privileged, global and interface config and back', () => {
    const sim = router()
    expect(promptFor(sim)).toBe('Router>')
    run(sim, 'enable')
    expect(promptFor(sim)).toBe('Router#')
    const r = run(sim, 'configure terminal')
    expect(r.output).toContain('Enter configuration commands, one per line.  End with CNTL/Z.')
    expect(promptFor(sim)).toBe('Router(config)#')
    run(sim, 'interface GigabitEthernet0/0')
    expect(promptFor(sim)).toBe('Router(config-if)#')
    run(sim, 'exit')
    expect(promptFor(sim)).toBe('Router(config)#')
    const end = run(sim, 'end')
    expect(promptFor(sim)).toBe('Router#')
    expect(end.output).toContain('%SYS-5-CONFIG_I: Configured from console by console')
    run(sim, 'disable')
    expect(promptFor(sim)).toBe('Router>')
  })

  it('shows the right prompt for every sub-mode', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'hostname R1')
    expect(promptFor(sim)).toBe('R1(config)#')
    run(sim, 'interface g0/0.10')
    expect(promptFor(sim)).toBe('R1(config-subif)#')
    run(sim, 'line vty 0 4')
    expect(promptFor(sim)).toBe('R1(config-line)#')
    run(sim, 'router ospf 1')
    expect(promptFor(sim)).toBe('R1(config-router)#')
    run(sim, 'ip dhcp pool LAN')
    expect(promptFor(sim)).toBe('R1(dhcp-config)#')
    run(sim, 'ip access-list standard MGMT')
    expect(promptFor(sim)).toBe('R1(config-std-nacl)#')
    run(sim, 'ip access-list extended WEB')
    expect(promptFor(sim)).toBe('R1(config-ext-nacl)#')
    const s = sw()
    run(s, 'en', 'conf t', 'interface range g0/1 - 4')
    expect(promptFor(s)).toBe('Switch(config-if-range)#')
    expect(modeKey(s)).toBe('if-range')
    run(s, 'vlan 10')
    expect(promptFor(s)).toBe('Switch(config-vlan)#')
  })

  it('runs a global command from a sub-mode and lands in global config', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'int g0/0', 'hostname EDGE')
    expect(sim.dev.hostname).toBe('EDGE')
    expect(promptFor(sim)).toBe('EDGE(config)#')
  })

  it('Ctrl+Z leaves configuration mode', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'int g0/0')
    const r = interrupt(sim, 'z')
    expect(promptFor(sim)).toBe('Router#')
    expect(r.output).toContain('%SYS-5-CONFIG_I')
  })

  it('asks for the enable secret once one is set', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'enable secret Cl4ss', 'end', 'disable')
    run(sim, 'enable')
    expect(promptFor(sim)).toBe('Password: ')
    expect(sim.pending.secret).toBe(true)
    runLine(sim, 'wrong')
    expect(promptFor(sim)).toBe('Password: ')
    runLine(sim, 'Cl4ss')
    expect(promptFor(sim)).toBe('Router#')
  })
})

describe('abbreviations and errors', () => {
  it('accepts the usual IOS abbreviations', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'int g0/0', 'ip add 10.1.1.1 255.255.255.0', 'no shut', 'end')
    const i = sim.dev.interfaces['GigabitEthernet0/0']
    expect(i.ip).toBe('10.1.1.1')
    expect(i.shutdown).toBe(false)
    const r = run(sim, 'sh ip int br')
    expect(r.output).toMatch(/GigabitEthernet0\/0\s+10\.1\.1\.1\s+YES manual up\s+up/)
  })

  it('puts the caret under the bad word', () => {
    const sim = router()
    run(sim, 'en')
    const r = run(sim, 'show ip intr')
    const lines = r.output.split('\n')
    expect(lines[0]).toBe(`${' '.repeat('Router#show ip '.length)}^`)
    expect(lines[1]).toBe("% Invalid input detected at '^' marker.")
    expect(r.error).toBe(true)
  })

  it('reports incomplete and ambiguous commands', () => {
    const sim = router()
    run(sim, 'en')
    expect(run(sim, 's').output).toContain('% Ambiguous command: "s"')
    run(sim, 'conf t', 'int g0/0')
    expect(run(sim, 'ip address 10.0.0.1').output).toContain('% Incomplete command.')
  })

  it('treats an unknown single word in EXEC as a hostname to look up', () => {
    const sim = router()
    const r = run(sim, 'foo')
    expect(r.output).toContain('Translating "foo"...domain server (255.255.255.255)')
    expect(r.output).toContain('% Unknown command or computer name, or unable to find computer address')
    run(sim, 'en', 'conf t', 'no ip domain-lookup', 'end')
    expect(run(sim, 'foo').output).toContain('Translating "foo"\n')
  })

  it('suggests do when a show command is typed in config mode', () => {
    const sim = router()
    run(sim, 'en', 'conf t')
    const r = run(sim, 'show ip route')
    expect(r.output).toContain("% Invalid input detected at '^' marker.")
    expect(r.lines.some((l) => l.kind === 'dim' && l.text.includes('do show ip route'))).toBe(true)
    const ok = run(sim, 'do show ip interface brief')
    expect(ok.error).toBe(false)
    expect(ok.output).toContain('GigabitEthernet0/0')
    expect(promptFor(sim)).toBe('Router(config)#')
  })

  it('rejects bad masks, network addresses and overlapping subnets', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'int g0/0')
    expect(run(sim, 'ip address 10.0.0.1 255.0.255.0').output).toBe('Bad mask 0xFF00FF00 for address 10.0.0.1')
    expect(run(sim, 'ip address 10.0.0.0 255.255.255.252').output).toBe('Bad mask /30 for address 10.0.0.0')
    run(sim, 'ip address 10.0.0.1 255.255.255.252', 'int g0/1')
    expect(run(sim, 'ip address 10.0.0.2 255.255.255.0').output).toBe('% 10.0.0.0 overlaps with GigabitEthernet0/0')
    run(sim, 'exit')
    expect(run(sim, 'ip route 10.9.9.1 255.255.255.0 10.0.0.2').output).toBe('%Inconsistent address and mask')
  })
})

describe('context help and completion', () => {
  it('lists commands for ? at the prompt and after a word', () => {
    const sim = router()
    expect(helpLines(sim, '').join('\n')).toMatch(/enable\s+Turn on privileged commands/)
    run(sim, 'en')
    const ip = helpLines(sim, 'show ip ').join('\n')
    expect(ip).toMatch(/route\s+IP routing table/)
    expect(helpLines(sim, 'show ip route ').join('\n')).toContain('<cr>')
    expect(helpLines(sim, 'show ip route ').join('\n')).toMatch(/\|\s+Output modifiers/)
  })

  it('answers partial words and unknown words', () => {
    const sim = router()
    run(sim, 'en')
    expect(helpLines(sim, 'sh')).toEqual(['show'])
    expect(helpLines(sim, 'co').join(' ')).toMatch(/configure.*copy/)
    expect(helpLines(sim, 'xyz')).toEqual(['% Unrecognized command'])
    expect(helpLines(sim, 'show xyz ').join('\n')).toContain("% Invalid input detected at '^' marker.")
  })

  it('shows help for no and do', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'int g0/0')
    expect(helpLines(sim, 'no ').join('\n')).toMatch(/shutdown/)
    expect(helpLines(sim, 'no ').join('\n')).not.toMatch(/\bexit\b/)
    expect(helpLines(sim, 'do ').join('\n')).toMatch(/show\s+Show running system information/)
  })

  it('completes unambiguous words with Tab', () => {
    const sim = router()
    run(sim, 'en')
    expect(complete(sim, 'conf')).toBe('configure ')
    expect(complete(sim, 'configure t')).toBe('configure terminal ')
    expect(complete(sim, 's')).toBe('s')
    run(sim, 'conf t')
    expect(complete(sim, 'int g')).toBe('int GigabitEthernet')
    run(sim, 'int g0/0')
    expect(complete(sim, 'no shut')).toBe('no shutdown ')
  })
})

describe('running and startup configuration', () => {
  it('keeps startup separate until the config is saved', () => {
    const sim = router()
    run(sim, 'en')
    expect(run(sim, 'show startup-config').output).toBe('startup-config is not present')
    run(sim, 'conf t', 'hostname R1', 'end')
    expect(run(sim, 'show running-config').output).toContain('hostname R1')
    const copy = runLine(sim, 'copy running-config startup-config')
    expect(copy.prompt).toBe('Destination filename [startup-config]? ')
    const done = runLine(sim, '')
    expect(done.output).toBe('Building configuration...\n[OK]')
    expect(run(sim, 'show startup-config').output).toContain('hostname R1')
    run(sim, 'conf t', 'hostname R9', 'end')
    expect(run(sim, 'show startup-config').output).not.toContain('hostname R9')
    expect(run(sim, 'write memory').output).toContain('[OK]')
    expect(run(sim, 'show startup-config').output).toContain('hostname R9')
  })

  it('loses unsaved changes on reload', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'hostname KEEP', 'end', 'wr', 'conf t', 'hostname LOSE', 'end')
    runLine(sim, 'reload')
    expect(sim.pending.prompt).toBe('System configuration has been modified. Save? [yes/no]: ')
    runLine(sim, 'no')
    expect(sim.pending.prompt).toBe('Proceed with reload? [confirm]')
    const boot = runLine(sim, '')
    expect(boot.output).toContain('%SYS-5-RELOAD')
    runLine(sim, '')
    expect(promptFor(sim)).toBe('KEEP>')
  })

  it('renders a realistic running-config', () => {
    const sim = router()
    const out = run(sim, 'en', 'show running-config').output
    expect(out.split('\n')[0]).toBe('Building configuration...')
    expect(out).toMatch(/Current configuration : \d+ bytes/)
    expect(out).toContain('interface GigabitEthernet0/0\n no ip address\n shutdown\n duplex auto\n speed auto\n!')
    expect(out).toContain('line vty 0 4\n login')
    expect(out.trim().endsWith('end')).toBe(true)
  })

  it('filters output with a pipe', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'hostname R1', 'end')
    expect(run(sim, 'show running-config | include hostname').output).toBe('hostname R1')
    expect(run(sim, 'show run | section interface GigabitEthernet0/1').output).toBe('interface GigabitEthernet0/1\n no ip address\n shutdown\n duplex auto\n speed auto')
  })

  it('encrypts passwords with service password-encryption and hashes secrets', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'line con 0', 'password cisco', 'exit', 'service password-encryption', 'enable secret Cl4ss', 'end')
    const out = run(sim, 'show run').output
    expect(out).toContain('service password-encryption')
    expect(out).toMatch(/ password 7 [0-9A-F]+/)
    expect(out).toMatch(/enable secret 5 \$1\$/)
    expect(out).not.toContain('cisco')
  })

  it('takes a multi-line banner', () => {
    const sim = router()
    run(sim, 'en', 'conf t')
    const r = runLine(sim, 'banner motd #')
    expect(r.output).toContain("Enter TEXT message.  End with the character '#'.")
    runLine(sim, 'Authorized access only')
    runLine(sim, 'Line two#')
    expect(sim.dev.banner).toBe('Authorized access only\nLine two')
  })
})

describe('switching', () => {
  it('creates VLANs, assigns ports and shows them', () => {
    const s = sw({ env: { connected: ['Gi0/1', 'Gi0/2'] } })
    run(s, 'en', 'conf t', 'vlan 10', 'name SALES', 'int g0/1', 'switchport mode access', 'switchport access vlan 10')
    const auto = run(s, 'int g0/2', 'switchport access vlan 30')
    expect(auto.output).toBe('% Access VLAN does not exist. Creating vlan 30')
    run(s, 'end')
    const out = run(s, 'show vlan brief').output
    expect(out).toMatch(/10\s+SALES\s+active\s+Gi0\/1/)
    expect(out).toMatch(/30\s+VLAN0030\s+active\s+Gi0\/2/)
    expect(out).toContain('1002 fddi-default')
  })

  it('shows trunks with allowed and native VLANs', () => {
    const s = sw({ env: { connected: ['Gi0/24'], neighbors: [{ port: 'Gi0/24', device: 'SW2', remotePort: 'GigabitEthernet0/24', trunk: { mode: 'trunk', native: 99 } }] } })
    run(s, 'en', 'conf t', 'vlan 10,20,99', 'int g0/24', 'sw mode trunk', 'sw trunk native vlan 99', 'sw trunk allowed vlan 10,20', 'sw trunk allowed vlan add 99', 'end')
    const out = run(s, 'show interfaces trunk').output
    expect(out).toMatch(/Gi0\/24\s+on\s+802\.1q\s+trunking\s+99/)
    expect(out).toContain('Gi0/24      10,20,99')
  })

  it('logs a native VLAN mismatch from CDP when the trunk comes up', () => {
    const env = { connected: ['Gi0/24'], neighbors: [{ port: 'Gi0/24', device: 'SW2', remotePort: 'GigabitEthernet0/24', trunk: { mode: 'trunk', native: 99 } }] }
    const s = sw({ env, startingConfig: ['interface g0/24', 'switchport mode access'] })
    const r = run(s, 'en', 'conf t', 'int g0/24', 'switchport mode trunk')
    expect(r.output).toContain('%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0/24 (1), with SW2 GigabitEthernet0/24 (99).')
    const fixed = run(s, 'switchport trunk native vlan 99')
    expect(fixed.output).not.toContain('NATIVE_VLAN_MISMATCH')
  })

  it('refuses port security on a dynamic port', () => {
    const s = sw()
    run(s, 'en', 'conf t', 'int g0/1')
    expect(run(s, 'switchport port-security').output).toBe('Command rejected: GigabitEthernet0/1 is a dynamic port.')
    run(s, 'switchport mode access', 'switchport port-security')
    expect(s.dev.interfaces['GigabitEthernet0/1'].portSecurity.enabled).toBe(true)
  })

  it('bundles an EtherChannel and reports it', () => {
    const s = sw({ env: { connected: ['Gi0/1', 'Gi0/2'], neighbors: [{ port: 'Gi0/1', device: 'SW2', channel: 'passive' }, { port: 'Gi0/2', device: 'SW2', channel: 'passive' }] } })
    const r = run(s, 'en', 'conf t', 'interface range g0/1 - 2')
    expect(r.error).toBe(false)
    expect(runLine(s, 'channel-group 1 mode active').output).toContain('Creating a port-channel interface Port-channel 1')
    run(s, 'end')
    expect(run(s, 'show etherchannel summary').output).toMatch(/1\s+Po1\(SU\)\s+LACP\s+Gi0\/1\(P\)\s+Gi0\/2\(P\)/)
  })

  it('stores root primary as a priority', () => {
    const s = sw({ env: { connected: ['Gi0/24'], neighbors: [{ port: 'Gi0/24', device: 'SW2', trunk: { mode: 'trunk' }, stp: { priority: 32768, mac: '0000.0000.0001' } }] } })
    run(s, 'en', 'conf t', 'int g0/24', 'switchport mode trunk', 'exit', 'spanning-tree vlan 1 root primary', 'end')
    expect(run(s, 'show run | include spanning-tree vlan').output).toBe('spanning-tree vlan 1 priority 24576')
    expect(run(s, 'show spanning-tree vlan 1').output).toContain('This bridge is the root')
    expect(run(s, 'conf t', 'spanning-tree vlan 1 priority 1000').output).toContain('% Bridge Priority must be in increments of 4096.')
  })
})

describe('routing', () => {
  it('builds C, L and S routes and installs only the best floating static', () => {
    const sim = router({ env: { connected: ['Gi0/0', 'Gi0/1'] } })
    run(sim, 'en', 'conf t', 'int g0/0', 'ip add 10.0.12.1 255.255.255.252', 'no shut', 'int g0/1', 'ip add 10.0.13.1 255.255.255.252', 'no shut', 'exit')
    run(sim, 'ip route 192.168.2.0 255.255.255.0 10.0.12.2', 'ip route 192.168.2.0 255.255.255.0 10.0.13.2 200', 'ip route 0.0.0.0 0.0.0.0 10.0.12.2', 'end')
    const out = run(sim, 'show ip route').output
    expect(out).toContain('Gateway of last resort is 10.0.12.2 to network 0.0.0.0')
    expect(out).toContain('S*    0.0.0.0/0 [1/0] via 10.0.12.2')
    expect(out).toContain('C        10.0.12.0/30 is directly connected, GigabitEthernet0/0')
    expect(out).toContain('L        10.0.12.1/32 is directly connected, GigabitEthernet0/0')
    expect(out).toContain('S     192.168.2.0/24 [1/0] via 10.0.12.2')
    expect(out).not.toContain('10.0.13.2 200')
    expect(out).not.toMatch(/\[200\/0\]/)
    run(sim, 'conf t', 'int g0/0', 'shutdown', 'end')
    expect(run(sim, 'show ip route static').output).toContain('S     192.168.2.0/24 [200/0] via 10.0.13.2')
  })

  it('forms a simulated OSPF adjacency and learns routes', () => {
    const env = { connected: ['Gi0/0'], neighbors: [{ port: 'Gi0/0', device: 'R2', ip: '10.0.0.2', ospf: { rid: '2.2.2.2', area: 0, routes: [{ prefix: '192.168.2.0/24', cost: 1 }] } }] }
    const sim = router({ env })
    run(sim, 'en', 'conf t', 'int g0/0', 'ip add 10.0.0.1 255.255.255.252', 'no shut', 'router ospf 1')
    const bad = run(sim, 'network 10.0.0.0 0.0.0.3 area 1')
    expect(bad.output).toContain('%OSPF-4-ERRRCV')
    run(sim, 'no network 10.0.0.0 0.0.0.3 area 1')
    const good = run(sim, 'network 10.0.0.0 0.0.0.3 area 0')
    expect(good.output).toContain('%OSPF-5-ADJCHG: Process 1, Nbr 2.2.2.2 on GigabitEthernet0/0 from LOADING to FULL, Loading Done')
    run(sim, 'end')
    expect(run(sim, 'show ip ospf neighbor').output).toMatch(/2\.2\.2\.2\s+1\s+FULL\/BDR\s+00:00:\d\d\s+10\.0\.0\.2\s+GigabitEthernet0\/0/)
    expect(run(sim, 'show ip route').output).toMatch(/O {5}192\.168\.2\.0\/24 \[110\/2\] via 10\.0\.0\.2, \d\d:\d\d:\d\d, GigabitEthernet0\/0/)
  })

  it('needs encapsulation before a subinterface takes an address', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'int g0/0.10')
    expect(run(sim, 'ip address 192.168.10.1 255.255.255.0').output).toContain('% Configuring IP routing on a LAN subinterface is only allowed')
    run(sim, 'encapsulation dot1q 10', 'ip address 192.168.10.1 255.255.255.0')
    expect(sim.dev.interfaces['GigabitEthernet0/0.10'].ip).toBe('192.168.10.1')
  })

  it('pings hosts the lab defines and fails otherwise', () => {
    const sim = router({ env: { connected: ['Gi0/0'], neighbors: [{ port: 'Gi0/0', kind: 'host', ip: '192.168.1.10' }] } })
    run(sim, 'en', 'conf t', 'int g0/0', 'ip add 192.168.1.1 255.255.255.0', 'no shut', 'end')
    const first = run(sim, 'ping 192.168.1.10').output
    expect(first).toContain('.!!!!')
    expect(first).toContain('Success rate is 80 percent (4/5)')
    expect(run(sim, 'ping 192.168.1.10').output).toContain('Success rate is 100 percent (5/5)')
    expect(run(sim, 'ping 192.168.1.99').output).toContain('Success rate is 0 percent (0/5)')
    expect(sim.op.pingOk).toEqual(['192.168.1.10'])
  })

  it('needs an exit interface for a link-local IPv6 next hop', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'ipv6 unicast-routing')
    expect(run(sim, 'ipv6 route ::/0 fe80::2').output).toBe('% Interface has to be specified for a link-local nexthop')
    run(sim, 'ipv6 route ::/0 g0/0 fe80::2')
    expect(sim.dev.ipv6Routes[0]).toMatchObject({ prefix: '::/0', iface: 'GigabitEthernet0/0', nextHop: 'FE80::2' })
  })
})

describe('services and security', () => {
  it('evaluates ACLs top down with the implicit deny', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'access-list 10 deny 192.168.20.0 0.0.0.255', 'access-list 10 permit any')
    run(sim, 'access-list 100 permit tcp 192.168.1.0 0.0.0.255 any eq 80', 'end')
    const acl = sim.dev.acls['10']
    expect(aclEval(acl, { src: '192.168.20.9' })).toMatchObject({ action: 'deny', seq: 10 })
    expect(aclEval(acl, { src: '10.1.1.1' })).toMatchObject({ action: 'permit', seq: 20 })
    const ext = sim.dev.acls['100']
    expect(aclEval(ext, { proto: 'tcp', src: '192.168.1.5', dst: '8.8.8.8', dport: 80 }).action).toBe('permit')
    expect(aclEval(ext, { proto: 'tcp', src: '192.168.1.5', dst: '8.8.8.8', dport: 23 })).toMatchObject({ action: 'deny', implicit: true })
    expect(aclRuleText(ext.rules[0], 'extended')).toBe('permit tcp 192.168.1.0 0.0.0.255 any eq www')
    const out = run(sim, 'show access-lists').output
    expect(out).toContain('Standard IP access list 10\n    10 deny   192.168.20.0, wildcard bits 0.0.0.255\n    20 permit any')
    expect(out).toContain('Extended IP access list 100')
  })

  it('needs a hostname and domain before generating RSA keys', () => {
    const sim = router()
    run(sim, 'en', 'conf t')
    expect(run(sim, 'crypto key generate rsa modulus 2048').output).toBe('% Please define a hostname other than Router.')
    run(sim, 'hostname R1')
    expect(run(sim, 'crypto key generate rsa modulus 2048').output).toBe('% Please define a domain-name first.')
    run(sim, 'ip domain-name lab.local')
    const ok = run(sim, 'crypto key generate rsa modulus 2048').output
    expect(ok).toContain('The name for the keys will be: R1.lab.local')
    expect(ok).toContain('%SSH-5-ENABLED: SSH 1.99 has been enabled')
    expect(sim.dev.rsaModulus).toBe(2048)
  })

  it('logs in on the console with a local account after exit', () => {
    const sim = router()
    run(sim, 'en', 'conf t', 'username admin secret Adm1n', 'line con 0', 'login local', 'end')
    expect(runLine(sim, 'exit').output).toContain('Press RETURN to get started.')
    expect(sim.pending.kind).toBe('press-return')
    const r = runLine(sim, '')
    expect(r.output).toContain('User Access Verification')
    expect(promptFor(sim)).toBe('Username: ')
    runLine(sim, 'admin')
    expect(promptFor(sim)).toBe('Password: ')
    runLine(sim, 'Adm1n')
    expect(promptFor(sim)).toBe('Router>')
  })
})

describe('helpers', () => {
  it('normalizes interface names and VLAN lists', () => {
    expect(canonicalIf('gi0/1')).toBe('GigabitEthernet0/1')
    expect(canonicalIf('Gig 0/0.10')).toBe('GigabitEthernet0/0.10')
    expect(canonicalIf('po1')).toBe('Port-channel1')
    expect(shortIf('GigabitEthernet0/24')).toBe('Gi0/24')
    expect(parseVlanList('1,10-12,20')).toEqual([1, 10, 11, 12, 20])
    expect(formatVlanList([1, 10, 11, 12, 20, 21])).toBe('1,10-12,20,21')
    expect(ipv6ToStr(parseIPv6('2001:db8:0:12:0:0:0:1'))).toBe('2001:DB8:0:12::1')
  })

  it('explains common commands in plain words', () => {
    expect(explainCommand('R1(config-if)#no shutdown')).toMatch(/brings it up/)
    expect(explainCommand('switchport trunk allowed vlan add 10')).toMatch(/Adds VLANs/)
    expect(explainCommand('cisco')).toBeNull()
  })
})
