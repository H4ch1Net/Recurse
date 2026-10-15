import { describe, expect, it } from 'vitest'
import {
  addressClass,
  binaryOctets,
  bitsForSubnets,
  compareMac,
  explainMaskBits,
  interestingOctetIndex,
  intToIp,
  ipToInt,
  isGroupMac,
  isPrivate,
  magicSteps,
  maskIntToPrefix,
  maskToPrefix,
  normalizeMac,
  octetToBinary,
  parseIp,
  parsePrefixOrMask,
  popcount,
  prefixForHosts,
  prefixToMask,
  sameSubnet,
  subnetFacts,
  toDottedBinary,
  wildcardFromPrefix,
  wildcardToPrefix
} from './net'

describe('parsing and formatting addresses', () => {
  it('round-trips dotted decimal', () => {
    for (const ip of ['0.0.0.0', '10.1.2.3', '172.16.254.1', '192.168.1.255', '255.255.255.255']) {
      expect(intToIp(ipToInt(ip))).toBe(ip)
    }
  })

  it('treats high addresses as unsigned', () => {
    expect(ipToInt('255.255.255.255')).toBe(4294967295)
    expect(ipToInt('128.0.0.0')).toBe(2147483648)
  })

  it('rejects invalid text', () => {
    for (const bad of ['', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.-4', 'a.b.c.d', '1..2.3', ' 1.2.3.4x', null, 42]) {
      expect(parseIp(bad)).toBeNull()
    }
    expect(() => ipToInt('300.1.1.1')).toThrow()
  })

  it('tolerates surrounding spaces and leading zeros', () => {
    expect(parseIp(' 192.168.001.010 ')).toBe(ipToInt('192.168.1.10'))
  })
})

describe('masks and prefixes', () => {
  it('converts prefixes to masks and wildcards', () => {
    expect(prefixToMask(0)).toBe('0.0.0.0')
    expect(prefixToMask(8)).toBe('255.0.0.0')
    expect(prefixToMask(19)).toBe('255.255.224.0')
    expect(prefixToMask(26)).toBe('255.255.255.192')
    expect(prefixToMask(30)).toBe('255.255.255.252')
    expect(prefixToMask(32)).toBe('255.255.255.255')
    expect(wildcardFromPrefix(26)).toBe('0.0.0.63')
    expect(wildcardFromPrefix(20)).toBe('0.0.15.255')
    expect(wildcardFromPrefix(32)).toBe('0.0.0.0')
    expect(wildcardFromPrefix(0)).toBe('255.255.255.255')
  })

  it('converts masks back to prefixes and rejects non-contiguous masks', () => {
    for (let p = 0; p <= 32; p++) expect(maskToPrefix(prefixToMask(p))).toBe(p)
    expect(maskToPrefix('255.0.255.0')).toBeNull()
    expect(maskToPrefix('255.255.255.1')).toBeNull()
    expect(maskIntToPrefix(ipToInt('255.255.254.0'))).toBe(23)
  })

  it('parses either notation', () => {
    expect(parsePrefixOrMask('/26')).toBe(26)
    expect(parsePrefixOrMask('26')).toBe(26)
    expect(parsePrefixOrMask('/ 9')).toBe(9)
    expect(parsePrefixOrMask('255.255.240.0')).toBe(20)
    expect(parsePrefixOrMask('/33')).toBeNull()
    expect(parsePrefixOrMask('255.255.0.255')).toBeNull()
    expect(parsePrefixOrMask('')).toBeNull()
  })

  it('reads wildcard masks', () => {
    expect(wildcardToPrefix('0.0.0.255')).toBe(24)
    expect(wildcardToPrefix('0.0.3.255')).toBe(22)
    expect(wildcardToPrefix('0.0.0.5')).toBeNull()
  })

  it('counts bits and explains a mask', () => {
    expect(popcount(0)).toBe(0)
    expect(popcount(0xffffffff)).toBe(32)
    expect(explainMaskBits(20)).toBe('255.255.240.0 has 8 + 8 + 4 + 0 = 20 one bits, so it is /20.')
  })
})

describe('subnetFacts', () => {
  it('works in the last octet', () => {
    const f = subnetFacts(ipToInt('192.168.1.77'), 26)
    expect(f.network).toBe('192.168.1.64')
    expect(f.broadcast).toBe('192.168.1.127')
    expect(f.firstHost).toBe('192.168.1.65')
    expect(f.lastHost).toBe('192.168.1.126')
    expect(f.usableHosts).toBe(62)
    expect(f.totalAddresses).toBe(64)
    expect(f.mask).toBe('255.255.255.192')
    expect(f.wildcard).toBe('0.0.0.63')
  })

  it('works when the interesting octet is the third', () => {
    const f = subnetFacts(ipToInt('172.16.77.200'), 19)
    expect(f.network).toBe('172.16.64.0')
    expect(f.broadcast).toBe('172.16.95.255')
    expect(f.firstHost).toBe('172.16.64.1')
    expect(f.lastHost).toBe('172.16.95.254')
    expect(f.usableHosts).toBe(8190)
  })

  it('works when the interesting octet is the second', () => {
    const f = subnetFacts(ipToInt('10.141.7.9'), 12)
    expect(f.network).toBe('10.128.0.0')
    expect(f.broadcast).toBe('10.143.255.255')
    expect(f.usableHosts).toBe(2 ** 20 - 2)
  })

  it('handles octet boundaries, /30, /31 and /32', () => {
    expect(subnetFacts(ipToInt('10.20.30.40'), 24).network).toBe('10.20.30.0')
    expect(subnetFacts(ipToInt('10.20.30.40'), 16).broadcast).toBe('10.20.255.255')
    const p30 = subnetFacts(ipToInt('10.0.0.6'), 30)
    expect([p30.network, p30.firstHost, p30.lastHost, p30.broadcast, p30.usableHosts]).toEqual(['10.0.0.4', '10.0.0.5', '10.0.0.6', '10.0.0.7', 2])
    const p31 = subnetFacts(ipToInt('10.0.0.7'), 31)
    expect([p31.firstHost, p31.lastHost, p31.usableHosts, p31.special]).toEqual(['10.0.0.6', '10.0.0.7', 2, 'p2p'])
    const p32 = subnetFacts(ipToInt('10.0.0.7'), 32)
    expect([p32.network, p32.firstHost, p32.usableHosts, p32.special]).toEqual(['10.0.0.7', '10.0.0.7', 1, 'host'])
  })

  it('handles the top of the address space without overflow', () => {
    const f = subnetFacts(ipToInt('255.255.255.200'), 25)
    expect(f.network).toBe('255.255.255.128')
    expect(f.broadcast).toBe('255.255.255.255')
  })

  it('tells whether two hosts share a subnet', () => {
    expect(sameSubnet(ipToInt('192.168.1.10'), ipToInt('192.168.1.200'), 24)).toBe(true)
    expect(sameSubnet(ipToInt('192.168.1.10'), ipToInt('192.168.2.20'), 24)).toBe(false)
    expect(sameSubnet(ipToInt('192.168.1.10'), ipToInt('192.168.1.200'), 25)).toBe(false)
  })
})

describe('sizing', () => {
  it('finds the smallest subnet for a host count', () => {
    expect(prefixForHosts(2)).toBe(30)
    expect(prefixForHosts(3)).toBe(29)
    expect(prefixForHosts(30)).toBe(27)
    expect(prefixForHosts(31)).toBe(26)
    expect(prefixForHosts(62)).toBe(26)
    expect(prefixForHosts(63)).toBe(25)
    expect(prefixForHosts(500)).toBe(23)
  })

  it('finds the bits needed for a subnet count', () => {
    expect(bitsForSubnets(1)).toBe(0)
    expect(bitsForSubnets(2)).toBe(1)
    expect(bitsForSubnets(5)).toBe(3)
    expect(bitsForSubnets(8)).toBe(3)
    expect(bitsForSubnets(50)).toBe(6)
  })
})

describe('binary', () => {
  it('pads octets to 8 bits', () => {
    expect(octetToBinary(5)).toBe('00000101')
    expect(octetToBinary(192)).toBe('11000000')
    expect(binaryOctets(ipToInt('192.168.1.10'))).toEqual(['11000000', '10101000', '00000001', '00001010'])
    expect(toDottedBinary(ipToInt('255.255.255.0'))).toBe('11111111.11111111.11111111.00000000')
  })
})

describe('magic number method', () => {
  it('picks the interesting octet', () => {
    expect(interestingOctetIndex(26)).toBe(3)
    expect(interestingOctetIndex(24)).toBe(3)
    expect(interestingOctetIndex(19)).toBe(2)
    expect(interestingOctetIndex(9)).toBe(1)
    expect(interestingOctetIndex(32)).toBe(3)
  })

  it('works the method for a last-octet subnet', () => {
    const m = magicSteps(ipToInt('192.168.1.77'), 26)
    expect(m.magic).toBe(64)
    expect(m.networkOctet).toBe(64)
    expect(m.broadcastOctet).toBe(127)
    expect(m.multiples).toEqual([0, 64, 128, 192])
    expect(m.steps.join(' ')).toContain('256 - 192 = 64')
    expect(m.steps.join(' ')).not.toMatch(/\u2014/)
  })

  it('works the method in the third octet and at the end of an octet', () => {
    const m = magicSteps(ipToInt('172.16.77.200'), 19)
    expect(m.index).toBe(2)
    expect(m.magic).toBe(32)
    expect(m.networkOctet).toBe(64)
    expect(m.nextOctet).toBe(96)
    const top = magicSteps(ipToInt('10.0.0.250'), 27)
    expect(top.networkOctet).toBe(224)
    expect(top.broadcastOctet).toBe(255)
    expect(top.steps.join(' ')).toContain('past the end of the octet')
  })

  it('explains boundary prefixes without a magic number', () => {
    const m = magicSteps(ipToInt('10.20.30.40'), 16)
    expect(m.boundary).toBe(true)
    expect(m.steps[1]).toContain('10.20.0.0')
    expect(m.steps[1]).toContain('10.20.255.255')
  })

  it('agrees with subnetFacts for many random addresses', () => {
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let i = 0; i < 500; i++) {
      const addr = Math.floor(rand() * 2 ** 32)
      const prefix = 1 + Math.floor(rand() * 30)
      const m = magicSteps(addr, prefix)
      const f = subnetFacts(addr, prefix)
      const netOctets = f.network.split('.').map(Number)
      expect(netOctets[m.index]).toBe(m.networkOctet)
      const bcOctets = f.broadcast.split('.').map(Number)
      expect(bcOctets[m.index]).toBe(m.broadcastOctet)
    }
  })
})

describe('classes and private ranges', () => {
  it('classifies first octets', () => {
    expect(addressClass(ipToInt('10.0.0.1'))).toBe('A')
    expect(addressClass(ipToInt('172.16.0.1'))).toBe('B')
    expect(addressClass(ipToInt('192.168.0.1'))).toBe('C')
    expect(addressClass(ipToInt('224.0.0.5'))).toBe('D')
    expect(addressClass(ipToInt('240.0.0.1'))).toBe('E')
  })

  it('knows the RFC 1918 ranges', () => {
    expect(isPrivate(ipToInt('172.31.255.255'))).toBe(true)
    expect(isPrivate(ipToInt('172.32.0.1'))).toBe(false)
    expect(isPrivate(ipToInt('192.169.0.1'))).toBe(false)
  })
})

describe('MAC helpers', () => {
  it('normalizes the common formats', () => {
    expect(normalizeMac('00:1A:2b:3c:4d:5e')).toBe('001a.2b3c.4d5e')
    expect(normalizeMac('001a-2b3c-4d5e')).toBe('001a.2b3c.4d5e')
    expect(normalizeMac('001A.2B3C.4D5E')).toBe('001a.2b3c.4d5e')
    expect(normalizeMac('001a.2b3c.4d5')).toBeNull()
    expect(normalizeMac('zz1a.2b3c.4d5e')).toBeNull()
  })

  it('compares numerically and spots group addresses', () => {
    expect(compareMac('0001.0000.0000', '0000.ffff.ffff')).toBe(1)
    expect(compareMac('00:00:00:00:00:01', '0000.0000.0001')).toBe(0)
    expect(isGroupMac('ffff.ffff.ffff')).toBe(true)
    expect(isGroupMac('0100.5e00.0005')).toBe(true)
    expect(isGroupMac('00aa.aaaa.aaaa')).toBe(false)
  })
})
