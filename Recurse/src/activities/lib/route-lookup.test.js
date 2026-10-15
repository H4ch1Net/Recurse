import { describe, expect, it } from 'vitest'
import {
  QUESTIONS,
  ROUTES,
  andMath,
  classfulPrefix,
  exitInterface,
  explain,
  gatewayLine,
  gradePick,
  intToIp,
  lookup,
  maskString,
  networkOf,
  parseIp,
  prefixToMask,
  routeMatches,
  routeText,
  tableFor,
  tableRows,
  toBinaryOctets
} from './route-lookup'

const ip = (s) => parseIp(s)
const byId = (id) => ROUTES.find((r) => r.id === id)
const winnerOf = (dest, opts) => lookup(tableFor(opts), ip(dest))

describe('IPv4 helpers', () => {
  it('parses and prints addresses', () => {
    expect(parseIp('10.1.1.25')).toBe(167837977)
    expect(intToIp(parseIp('203.0.113.2'))).toBe('203.0.113.2')
    expect(intToIp(parseIp('255.255.255.255'))).toBe('255.255.255.255')
    expect(parseIp('0.0.0.0')).toBe(0)
  })
  it('rejects invalid addresses', () => {
    for (const bad of ['', '10.1.1', '10.1.1.1.1', '256.1.1.1', '10.1.1.x', '10..1.1', ' 1.2.3.-4', null]) {
      expect(parseIp(bad)).toBeNull()
    }
  })
  it('builds masks from prefixes', () => {
    expect(maskString(0)).toBe('0.0.0.0')
    expect(maskString(16)).toBe('255.255.0.0')
    expect(maskString(28)).toBe('255.255.255.240')
    expect(maskString(30)).toBe('255.255.255.252')
    expect(maskString(32)).toBe('255.255.255.255')
    expect(prefixToMask(32)).toBe(0xffffffff)
  })
  it('ANDs an address with a mask', () => {
    expect(intToIp(networkOf(ip('10.1.1.20'), 28))).toBe('10.1.1.16')
    expect(intToIp(networkOf(ip('172.16.200.9'), 16))).toBe('172.16.0.0')
    expect(intToIp(networkOf(ip('200.1.1.1'), 0))).toBe('0.0.0.0')
  })
  it('prints binary octets', () => {
    expect(toBinaryOctets(ip('10.1.1.25'))).toEqual(['00001010', '00000001', '00000001', '00011001'])
  })
  it('knows classful boundaries', () => {
    expect(classfulPrefix(ip('10.9.9.9'))).toBe(8)
    expect(classfulPrefix(ip('172.16.0.0'))).toBe(16)
    expect(classfulPrefix(ip('192.168.10.0'))).toBe(24)
    expect(classfulPrefix(ip('224.0.0.5'))).toBeNull()
  })
})

describe('route matching', () => {
  it('a default route matches everything', () => {
    expect(routeMatches(byId('default'), ip('8.8.8.8'))).toBe(true)
    expect(routeMatches(byId('default'), ip('0.0.0.0'))).toBe(true)
  })
  it('a host route matches exactly one address', () => {
    expect(routeMatches(byId('s-host'), ip('10.1.1.25'))).toBe(true)
    expect(routeMatches(byId('s-host'), ip('10.1.1.24'))).toBe(false)
  })
  it('a /28 covers 16 addresses', () => {
    const r = byId('o-10-1-1-16')
    expect(routeMatches(r, ip('10.1.1.16'))).toBe(true)
    expect(routeMatches(r, ip('10.1.1.31'))).toBe(true)
    expect(routeMatches(r, ip('10.1.1.32'))).toBe(false)
    expect(routeMatches(r, ip('10.1.1.15'))).toBe(false)
  })
})

describe('lookup', () => {
  it('longest prefix wins across overlapping /16, /24 and /28', () => {
    expect(winnerOf('10.1.1.200').winners).toEqual(['s-10-1-1'])
    expect(winnerOf('10.1.1.20').winners).toEqual(['o-10-1-1-16'])
    expect(winnerOf('10.1.77.5').winners).toEqual(['o-10-1'])
    expect(winnerOf('10.1.1.20').decidedBy).toBe('prefix')
  })
  it('a host route beats everything else', () => {
    const r = winnerOf('10.1.1.25')
    expect(r.matches).toHaveLength(5)
    expect(r.winners).toEqual(['s-host'])
    expect(r.longest).toBe(32)
  })
  it('falls back to the default route', () => {
    const r = winnerOf('8.8.8.8')
    expect(r.winners).toEqual(['default'])
    expect(r.decidedBy).toBe('only')
    expect(r.longest).toBe(0)
  })
  it('drops when nothing matches and there is no default', () => {
    const r = winnerOf('8.8.8.8', { noDefault: true })
    expect(r.decidedBy).toBe('drop')
    expect(r.winners).toEqual([])
  })
  it('same prefix: lower administrative distance wins', () => {
    const ospfVsFloat = winnerOf('172.16.4.4')
    expect(ospfVsFloat.winners).toEqual(['o-172'])
    expect(ospfVsFloat.decidedBy).toBe('ad')
    const staticAd5 = winnerOf('192.168.50.9')
    expect(staticAd5.winners).toEqual(['s-50'])
    expect(staticAd5.decidedBy).toBe('ad')
  })
  it('same prefix and AD: lower metric wins', () => {
    const r = winnerOf('10.2.3.4')
    expect(r.winners).toEqual(['o-10-2-a'])
    expect(r.decidedBy).toBe('metric')
  })
  it('a full tie is equal-cost load balancing', () => {
    const routes = [
      { id: 'a', code: 'O', network: '10.9.0.0', prefix: 16, ad: 110, metric: 30, via: '10.0.12.2', iface: 'GigabitEthernet0/1' },
      { id: 'b', code: 'O', network: '10.9.0.0', prefix: 16, ad: 110, metric: 30, via: '10.0.13.2', iface: 'GigabitEthernet0/2' }
    ]
    const r = lookup(routes, ip('10.9.1.1'))
    expect(r.winners).toEqual(['a', 'b'])
    expect(r.decidedBy).toBe('ecmp')
  })
  it('prefix length beats administrative distance', () => {
    // The OSPF /28 (AD 110) beats the static /24 (AD 1): specificity first, always.
    expect(winnerOf('10.1.1.17').winners).toEqual(['o-10-1-1-16'])
  })
  it('local routes win for the router’s own address', () => {
    expect(winnerOf('192.168.10.1').winners).toEqual(['l-lan'])
    expect(winnerOf('192.168.10.77').winners).toEqual(['c-lan'])
  })
  it('every drill question has exactly one sensible answer', () => {
    for (const q of QUESTIONS) {
      const r = winnerOf(q.ip, q)
      expect(r.winners.length <= 1).toBe(true)
    }
  })
})

describe('recursive lookup for static routes', () => {
  it('finds the exit interface of a static route through its next hop', () => {
    expect(exitInterface(ROUTES, byId('s-host'))).toBe('GigabitEthernet0/2')
    expect(exitInterface(ROUTES, byId('default'))).toBe('GigabitEthernet0/3')
    expect(exitInterface(ROUTES, byId('o-172'))).toBe('GigabitEthernet0/1')
  })
})

describe('grading', () => {
  it('accepts the winner and drop when right', () => {
    expect(gradePick(ROUTES, ip('10.1.1.25'), 's-host').correct).toBe(true)
    expect(gradePick(tableFor({ noDefault: true }), ip('8.8.8.8'), 'drop').correct).toBe(true)
  })
  it('explains a less specific pick', () => {
    const g = gradePick(ROUTES, ip('10.1.1.25'), 'o-10-1')
    expect(g.correct).toBe(false)
    expect(g.why).toMatch(/less specific/)
  })
  it('explains a pick that does not match with the AND result', () => {
    const g = gradePick(ROUTES, ip('10.1.1.200'), 'o-10-1-1-16')
    expect(g.correct).toBe(false)
    expect(g.why).toContain('10.1.1.192')
  })
  it('explains an AD loss and a metric loss', () => {
    expect(gradePick(ROUTES, ip('172.16.4.4'), 's-172-float').why).toMatch(/administrative distance/)
    expect(gradePick(ROUTES, ip('10.2.3.4'), 'o-10-2-b').why).toMatch(/metric/)
  })
  it('rejects drop when a route matches', () => {
    expect(gradePick(ROUTES, ip('8.8.8.8'), 'drop').correct).toBe(false)
  })
})

describe('explanations', () => {
  it('mentions longest prefix and the floating static', () => {
    expect(explain(ROUTES, ip('10.1.1.25')).join(' ')).toMatch(/Longest prefix wins/)
    expect(explain(ROUTES, ip('172.16.4.4')).join(' ')).toMatch(/floating static/)
    expect(explain(ROUTES, ip('8.8.8.8')).join(' ')).toMatch(/gateway of last resort/)
    expect(explain(tableFor({ noDefault: true }), ip('8.8.8.8')).join(' ')).toMatch(/drops the packet/)
  })
  it('never uses em dashes', () => {
    for (const q of QUESTIONS) expect(explain(tableFor(q), ip(q.ip)).join(' ')).not.toMatch(/—/)
  })
})

describe('AND math', () => {
  it('shows the working for a match and a miss', () => {
    const hit = andMath(byId('o-10-1-1-16'), ip('10.1.1.20'))
    expect(hit.matches).toBe(true)
    expect(hit.rows[2].dotted).toBe('10.1.1.16')
    const miss = andMath(byId('s-host'), ip('10.1.1.20'))
    expect(miss.matches).toBe(false)
  })
})

describe('show ip route layout', () => {
  it('prints lines the way IOS does', () => {
    expect(routeText(byId('c-lan'))).toBe('192.168.10.0/24 is directly connected, GigabitEthernet0/0')
    expect(routeText(byId('s-50'))).toBe('192.168.50.0/24 [5/0] via 10.0.13.2')
    expect(routeText(byId('o-10-1'))).toMatch(/^10\.1\.0\.0\/16 \[110\/20\] via 10\.0\.12\.2, .*GigabitEthernet0\/1$/)
  })
  it('builds classful group headers with correct counts', () => {
    const headers = tableRows(ROUTES).filter((r) => r.type === 'header').map((r) => r.text)
    expect(headers).toContain('10.0.0.0/8 is variably subnetted, 9 subnets, 5 masks')
    expect(headers).toContain('192.168.10.0/24 is variably subnetted, 2 subnets, 2 masks')
    expect(headers).toContain('203.0.113.0/24 is variably subnetted, 2 subnets, 2 masks')
    expect(headers.some((h) => h.startsWith('172.16'))).toBe(false)
  })
  it('uses "is subnetted" when every subnet shares one mask', () => {
    const routes = [
      { id: 'x', code: 'C', network: '172.16.1.0', prefix: 24, iface: 'GigabitEthernet0/0' },
      { id: 'y', code: 'C', network: '172.16.2.0', prefix: 24, iface: 'GigabitEthernet0/1' }
    ]
    expect(tableRows(routes)[0].text).toBe('172.16.0.0/24 is subnetted, 2 subnets')
  })
  it('reports the gateway of last resort', () => {
    expect(gatewayLine(ROUTES)).toBe('Gateway of last resort is 203.0.113.1 to network 0.0.0.0')
    expect(gatewayLine(tableFor({ noDefault: true }))).toBe('Gateway of last resort is not set')
  })
})
