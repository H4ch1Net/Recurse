// A ping from PC A (192.168.1.10) to PC B (192.168.2.20) through SW1, R1 and SW2,
// step by step: the subnet check, ARP for the gateway, encapsulation, switching,
// routing (TTL, lookup), ARP on the far side, re-encapsulation and delivery.
// Tables (ARP caches, MAC tables) are rebuilt from the step updates so every
// snapshot is consistent.
import { BROADCAST_MAC, intToIp, ipToInt, prefixToMaskInt } from './net'

export const DEVICES = {
  A: { id: 'A', kind: 'pc', name: 'PC A', ip: '192.168.1.10', mac: '0050.7966.680a', gateway: '192.168.1.1', port: 'Fa0/1' },
  C: { id: 'C', kind: 'pc', name: 'PC C', ip: '192.168.1.30', mac: '0050.7966.680c', gateway: '192.168.1.1', port: 'Fa0/2' },
  SW1: { id: 'SW1', kind: 'switch', name: 'SW1' },
  R1: {
    id: 'R1',
    kind: 'router',
    name: 'R1',
    ifaces: {
      'G0/0': { ip: '192.168.1.1', mac: '000c.85a1.0100' },
      'G0/1': { ip: '192.168.2.1', mac: '000c.85a1.0101' }
    }
  },
  SW2: { id: 'SW2', kind: 'switch', name: 'SW2' },
  B: { id: 'B', kind: 'pc', name: 'PC B', ip: '192.168.2.20', mac: '0050.7966.680b', gateway: '192.168.2.1', port: 'Fa0/1' },
  D: { id: 'D', kind: 'pc', name: 'PC D', ip: '192.168.2.40', mac: '0050.7966.680d', gateway: '192.168.2.1', port: 'Fa0/2' }
}
export const MASK = '255.255.255.0'
export const PREFIX = 24
export const LINKS = [
  ['A', 'SW1'],
  ['C', 'SW1'],
  ['SW1', 'R1'],
  ['R1', 'SW2'],
  ['SW2', 'B'],
  ['SW2', 'D']
]
export const START_TTL = 64

const { A, B, C, D, R1 } = DEVICES
const G0 = R1.ifaces['G0/0']
const G1 = R1.ifaces['G0/1']

export const ROUTES = [
  { code: 'C', prefix: '192.168.1.0/24', via: 'is directly connected, GigabitEthernet0/0' },
  { code: 'L', prefix: '192.168.1.1/32', via: 'is directly connected, GigabitEthernet0/0' },
  { code: 'C', prefix: '192.168.2.0/24', via: 'is directly connected, GigabitEthernet0/1' },
  { code: 'L', prefix: '192.168.2.1/32', via: 'is directly connected, GigabitEthernet0/1' }
]

/** The AND that tells A whether B is on its own subnet. */
export function localCheck(src = A.ip, dst = B.ip, prefix = PREFIX) {
  const mask = prefixToMaskInt(prefix)
  const srcNet = intToIp(ipToInt(src) & mask)
  const dstNet = intToIp(ipToInt(dst) & mask)
  return { src, dst, mask: intToIp(mask), srcNet, dstNet, local: srcNet === dstNet }
}

const icmp = (type) => ({ type, name: type === 8 ? 'Echo request' : 'Echo reply' })
const ipHeader = (src, dst, ttl) => ({ src, dst, ttl, proto: '1 (ICMP)' })
const eth = (dst, src, type) => ({ dst, src, type })
const arp = (op, senderMac, senderIp, targetMac, targetIp) => ({ op, senderMac, senderIp, targetMac, targetIp })

/** Build the journey. Each step carries a snapshot of every table after it. */
export function buildJourney() {
  const local = localCheck()
  const echo = icmp(8)
  const steps = [
    {
      id: 'start',
      title: 'A wants to ping B',
      where: 'A',
      hops: [],
      pdu: { ip: ipHeader(A.ip, B.ip, START_TTL), icmp: echo },
      changed: ['ip', 'icmp'],
      caption: `You type ping ${B.ip} on PC A. A builds an ICMP echo request and puts it inside an IP packet: source ${A.ip}, destination ${B.ip}, TTL ${START_TTL}. Before it can send anything, it has to decide who gets the frame.`
    },
    {
      id: 'local',
      title: 'Is B on my subnet?',
      where: 'A',
      hops: [],
      pdu: { ip: ipHeader(A.ip, B.ip, START_TTL), icmp: echo },
      changed: [],
      and: local,
      caption: `A ANDs both addresses with its mask ${MASK}: ${local.srcNet} for itself, ${local.dstNet} for B. They differ, so B is on another subnet and the packet must go to A's default gateway, ${A.gateway}.`,
      checkpoint: {
        prompt: `A ANDs ${B.ip} with its mask ${MASK}. What does A conclude?`,
        choices: [
          `B is on another subnet, so A sends to its default gateway ${A.gateway}`,
          'B is on the same subnet, so A sends straight to B',
          'A has to ask a DNS server where B is',
          'A broadcasts the ping to every host'
        ],
        answer: 0,
        hint: 'Compare the network parts: the first three octets with a /24 mask.',
        explain: `${local.srcNet} is not ${local.dstNet}. Anything off the local subnet goes to the default gateway.`
      }
    },
    {
      id: 'arp-request',
      title: 'ARP request for the gateway',
      where: 'SW1',
      tone: 'warn',
      hops: [[['A', 'SW1']], [['SW1', 'R1'], ['SW1', 'C']]],
      pdu: { eth: eth(BROADCAST_MAC, A.mac, '0x0806 (ARP)'), arp: arp('Request', A.mac, A.ip, '0000.0000.0000', G0.ip) },
      changed: ['eth', 'arp'],
      learn: { SW1: [[A.mac, 'Fa0/1']], R1: [[A.ip, A.mac]] },
      caption: `A's ARP cache has no MAC for ${G0.ip}, so it broadcasts an ARP request: "Who has ${G0.ip}? Tell ${A.ip}." SW1 learns A's MAC on Fa0/1 and floods the broadcast out every other port. PC C sees a question that is not about its address and ignores it. R1 recognizes its own address and notes A's MAC.`
    },
    {
      id: 'arp-reply',
      title: 'ARP reply from R1',
      where: 'A',
      hops: [[['R1', 'SW1']], [['SW1', 'A']]],
      pdu: { eth: eth(A.mac, G0.mac, '0x0806 (ARP)'), arp: arp('Reply', G0.mac, G0.ip, A.mac, A.ip) },
      changed: ['eth.dst', 'eth.src', 'arp'],
      learn: { SW1: [[G0.mac, 'Gi0/1']], A: [[G0.ip, G0.mac]] },
      caption: `R1 answers with a unicast ARP reply: "${G0.ip} is at ${G0.mac}." SW1 learns R1's MAC on Gi0/1, and since it already knows A is on Fa0/1, it forwards the reply out that one port. A stores the answer in its ARP cache.`
    },
    {
      id: 'frame',
      title: 'A builds the frame',
      where: 'A',
      hops: [],
      pdu: { eth: eth(G0.mac, A.mac, '0x0800 (IPv4)'), ip: ipHeader(A.ip, B.ip, START_TTL), icmp: echo },
      changed: ['eth.dst', 'eth.src', 'eth.type'],
      caption: `Encapsulation: the ICMP message sits inside the IP packet, which sits inside an Ethernet frame. The destination IP is still B (${B.ip}), but the destination MAC is the router's (${G0.mac}). IP addresses say where the packet is finally going; MAC addresses only say who receives it on this link.`,
      checkpoint: {
        prompt: 'Which destination MAC address does A put on the frame?',
        choices: [`R1 G0/0: ${G0.mac}`, `PC B: ${B.mac}`, `Broadcast: ${BROADCAST_MAC}`, `R1 G0/1: ${G1.mac}`],
        answer: 0,
        hint: 'A frame only travels across one link. Who is the next device that must receive it?',
        explain: `The frame only has to reach the default gateway, so the destination MAC is R1 G0/0 (${G0.mac}). A never learns B's MAC: B is not on its link.`
      }
    },
    {
      id: 'switch1',
      title: 'SW1 forwards the frame',
      where: 'R1',
      hops: [[['A', 'SW1']], [['SW1', 'R1']]],
      pdu: { eth: eth(G0.mac, A.mac, '0x0800 (IPv4)'), ip: ipHeader(A.ip, B.ip, START_TTL), icmp: echo },
      changed: [],
      caption: `SW1 looks up ${G0.mac} in its MAC table, finds Gi0/1, and forwards the frame out that port only. A switch reads the frame but never changes it.`
    },
    {
      id: 'decap',
      title: 'R1 strips the frame',
      where: 'R1',
      hops: [],
      pdu: { ip: ipHeader(A.ip, B.ip, START_TTL), icmp: echo, stripped: true },
      changed: ['eth'],
      caption: `The destination MAC is R1's own G0/0 address, so R1 accepts the frame, checks the FCS, and throws away the Ethernet header and trailer. What is left is the IP packet. Layer 2 headers never cross a router.`
    },
    {
      id: 'route',
      title: 'TTL and route lookup',
      where: 'R1',
      hops: [],
      pdu: { ip: ipHeader(A.ip, B.ip, START_TTL - 1), icmp: echo },
      changed: ['ip.ttl'],
      route: 2,
      caption: `R1 lowers the TTL from ${START_TTL} to ${START_TTL - 1} (a TTL of 0 would mean drop the packet and send back ICMP Time Exceeded). Then it looks up ${B.ip} in its routing table: the best match is 192.168.2.0/24, directly connected out GigabitEthernet0/1.`
    },
    {
      id: 'arp-far',
      title: 'ARP on the far side',
      where: 'SW2',
      tone: 'warn',
      hops: [[['R1', 'SW2']], [['SW2', 'B'], ['SW2', 'D']]],
      pdu: { eth: eth(BROADCAST_MAC, G1.mac, '0x0806 (ARP)'), arp: arp('Request', G1.mac, G1.ip, '0000.0000.0000', B.ip) },
      changed: ['eth', 'arp'],
      learn: { SW2: [[G1.mac, 'Gi0/1']], B: [[G1.ip, G1.mac]] },
      caption: `R1 has no MAC for ${B.ip} yet, so it ARPs out G0/1: "Who has ${B.ip}? Tell ${G1.ip}." SW2 learns R1's G0/1 MAC and floods the broadcast. B notes R1's MAC as it reads the request. Real routers often drop the packet that triggered ARP, which is why the first ping in a series can time out; here we hold it so you can follow along.`
    },
    {
      id: 'arp-far-reply',
      title: 'B answers the ARP',
      where: 'R1',
      hops: [[['B', 'SW2']], [['SW2', 'R1']]],
      pdu: { eth: eth(G1.mac, B.mac, '0x0806 (ARP)'), arp: arp('Reply', B.mac, B.ip, G1.mac, G1.ip) },
      changed: ['eth.dst', 'eth.src', 'arp'],
      learn: { SW2: [[B.mac, 'Fa0/1']], R1: [[B.ip, B.mac]] },
      caption: `B replies with a unicast ARP reply: "${B.ip} is at ${B.mac}." SW2 learns B on Fa0/1 and forwards the reply to R1, which caches it.`
    },
    {
      id: 'reencap',
      title: 'R1 builds a new frame',
      where: 'R1',
      hops: [],
      pdu: { eth: eth(B.mac, G1.mac, '0x0800 (IPv4)'), ip: ipHeader(A.ip, B.ip, START_TTL - 1), icmp: echo },
      changed: ['eth.dst', 'eth.src'],
      caption: `R1 wraps the same IP packet in a brand new Ethernet frame for the G0/1 link: destination ${B.mac} (B), source ${G1.mac} (R1 G0/1). The IP addresses have not changed at all since A sent the packet; only the TTL dropped by one.`,
      checkpoint: {
        prompt: 'R1 forwards the packet out G0/1. Compared with the frame A sent, what changed?',
        choices: [
          'New source and destination MACs, and the TTL is one lower. The IP addresses stay the same.',
          'New source and destination IP addresses. The MACs stay the same.',
          'Nothing. Routers pass frames along unchanged.',
          'Only the destination IP, which becomes R1 G0/1.'
        ],
        answer: 0,
        hint: 'Which header is rebuilt for every link, and which one travels end to end?',
        explain: 'MAC addresses are rewritten at every router hop; IP addresses stay end to end (without NAT). The TTL goes down by one per router.'
      }
    },
    {
      id: 'switch2',
      title: 'SW2 forwards to B',
      where: 'B',
      hops: [[['R1', 'SW2']], [['SW2', 'B']]],
      pdu: { eth: eth(B.mac, G1.mac, '0x0800 (IPv4)'), ip: ipHeader(A.ip, B.ip, START_TTL - 1), icmp: echo },
      changed: [],
      caption: `SW2 already learned that ${B.mac} is on Fa0/1 (from B's ARP reply), so it forwards the frame out Fa0/1 only.`
    },
    {
      id: 'deliver',
      title: 'Delivered',
      where: 'B',
      hops: [],
      pdu: { ip: ipHeader(A.ip, B.ip, START_TTL - 1), icmp: echo, stripped: true },
      changed: ['eth'],
      caption: `B sees its own MAC, strips the frame, sees its own IP, and hands the ICMP echo request up. The ping made it across two subnets.`
    },
    {
      id: 'reply',
      title: 'The echo reply goes home',
      where: 'A',
      tone: 'good',
      hops: [[['B', 'SW2']], [['SW2', 'R1']], [['R1', 'SW1']], [['SW1', 'A']]],
      pdu: { eth: eth(G1.mac, B.mac, '0x0800 (IPv4)'), ip: ipHeader(B.ip, A.ip, START_TTL), icmp: icmp(0) },
      changed: ['ip.src', 'ip.dst', 'icmp'],
      caption: `B sends an echo reply to ${A.ip} through its own gateway. Every ARP cache and MAC table it needs is already filled, so there is no ARP this time. R1 lowers the TTL again, and A prints: Reply from ${B.ip}: TTL=${START_TTL - 1}.`
    }
  ]

  // Replay the learning to give every step a full snapshot of the tables.
  const tables = { A: [], SW1: [], R1: [], SW2: [], B: [] }
  return steps.map((step, index) => {
    const fresh = {}
    for (const [owner, rows] of Object.entries(step.learn || {})) {
      for (const row of rows) {
        if (!tables[owner].some((r) => r[0] === row[0])) tables[owner] = [...tables[owner], row]
        fresh[`${owner}:${row[0]}`] = true
      }
    }
    return { ...step, index, tables: { ...tables }, fresh }
  })
}

/** Field rows for one header, with "changed" flags from the step. */
export function headerRows(pdu, changed = []) {
  const hit = (key) => changed.includes(key) || changed.includes(key.split('.')[0])
  const rows = {}
  if (pdu.eth) {
    rows.eth = [
      { key: 'eth.dst', label: 'Destination MAC', value: pdu.eth.dst, changed: hit('eth.dst') },
      { key: 'eth.src', label: 'Source MAC', value: pdu.eth.src, changed: hit('eth.src') },
      { key: 'eth.type', label: 'Type', value: pdu.eth.type, changed: hit('eth.type') }
    ]
  }
  if (pdu.arp) {
    rows.arp = [
      { key: 'arp.op', label: 'Operation', value: pdu.arp.op, changed: hit('arp') },
      { key: 'arp.sha', label: 'Sender MAC', value: pdu.arp.senderMac, changed: hit('arp') },
      { key: 'arp.spa', label: 'Sender IP', value: pdu.arp.senderIp, changed: hit('arp') },
      { key: 'arp.tha', label: 'Target MAC', value: pdu.arp.targetMac, changed: hit('arp') },
      { key: 'arp.tpa', label: 'Target IP', value: pdu.arp.targetIp, changed: hit('arp') }
    ]
  }
  if (pdu.ip) {
    rows.ip = [
      { key: 'ip.src', label: 'Source IP', value: pdu.ip.src, changed: hit('ip.src') },
      { key: 'ip.dst', label: 'Destination IP', value: pdu.ip.dst, changed: hit('ip.dst') },
      { key: 'ip.ttl', label: 'TTL', value: String(pdu.ip.ttl), changed: hit('ip.ttl') },
      { key: 'ip.proto', label: 'Protocol', value: pdu.ip.proto, changed: false }
    ]
  }
  if (pdu.icmp) rows.icmp = [{ key: 'icmp.type', label: 'ICMP', value: `Type ${pdu.icmp.type}, ${pdu.icmp.name}`, changed: hit('icmp') }]
  return rows
}

export const checkpointCount = (steps) => steps.filter((s) => s.checkpoint).length

/** Device name for table headings. */
export const TABLE_TITLES = { A: "PC A's ARP cache", SW1: 'SW1 MAC table', R1: "R1's ARP cache", SW2: 'SW2 MAC table', B: "PC B's ARP cache" }
export const DEVICE_LIST = [A, C, B, D]
