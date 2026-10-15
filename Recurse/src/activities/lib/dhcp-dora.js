// DHCP DORA through a relay agent. The client and the DHCP server sit on different
// subnets, so router R1 relays with `ip helper-address`. The relay turns the client's
// broadcast into a unicast to the server (source = the interface it arrived on, giaddr
// = that same address), and turns the server's replies back into LAN broadcasts.
// Field values follow the CCNA 200-301 Official Cert Guide (Vol 2, Ch 7).

export const ADDR = {
  clientMac: '0050.7966.6801',
  pc2Mac: '0050.7966.6802',
  r1LanMac: '0011.2233.4401',
  r1WanMac: '0011.2233.4402',
  serverMac: '0050.5600.0010',
  r1Lan: '192.168.10.1',
  r1Wan: '10.0.0.1',
  server: '10.0.0.10',
  offered: '192.168.10.101',
  mask: '255.255.255.0',
  dns: '10.0.0.53',
  bcastMac: 'FFFF.FFFF.FFFF',
  bcastIp: '255.255.255.255',
  none: '0.0.0.0'
}

export const LEASE_SECONDS = 86400

/** Renewal timers: T1 at 50% of the lease, T2 (rebind) at 87.5%. */
export function leaseTimers(seconds = LEASE_SECONDS) {
  return { lease: seconds, t1: seconds * 0.5, t2: seconds * 0.875 }
}

/** "1 day", "12 hours", "21 hours", "90 minutes", "45 seconds". */
export function formatDuration(seconds) {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400
    return `${d} day${d === 1 ? '' : 's'}`
  }
  if (seconds % 3600 === 0) {
    const h = seconds / 3600
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  if (seconds % 60 === 0) {
    const m = seconds / 60
    return `${m} minute${m === 1 ? '' : 's'}`
  }
  return `${seconds} second${seconds === 1 ? '' : 's'}`
}

const LETTER = { Discover: 'D', Offer: 'O', Request: 'R', Ack: 'A' }

function step(fields) {
  return { letter: LETTER[fields.msg], giaddr: ADDR.none, yiaddr: ADDR.none, requested: null, flood: [], dropped: false, checkpoint: null, ...fields }
}

/**
 * The DORA steps, hop by hop. `relay` false means R1 has no ip helper-address, so the
 * Discover dies at R1. Each step has the path through the diagram (node ids), the
 * Ethernet and IP addressing, UDP ports, giaddr, yiaddr and a caption.
 */
export function buildSteps({ relay = true } = {}) {
  const discover = step({
    id: 'discover',
    msg: 'Discover',
    hop: 'Client to R1',
    path: ['client', 'sw', 'r1'],
    flood: ['pc2'],
    cast: 'broadcast',
    l2: { src: ADDR.clientMac, dst: ADDR.bcastMac },
    l3: { src: ADDR.none, dst: ADDR.bcastIp },
    udp: { src: 68, dst: 67 },
    caption: 'The client has no IP address yet, so it broadcasts a Discover from 0.0.0.0 to 255.255.255.255. The switch floods it out every port in the VLAN, so PC2 and R1 both get a copy. PC2 ignores it.',
    checkpoint: relay ? 'relay' : null
  })
  if (!relay) {
    return [
      discover,
      step({
        id: 'dropped',
        msg: 'Discover',
        hop: 'Stops at R1',
        path: ['r1'],
        cast: 'broadcast',
        dropped: true,
        l2: discover.l2,
        l3: discover.l3,
        udp: discover.udp,
        caption: 'R1 has no ip helper-address on Gi0/0. Routers do not forward broadcasts, so the Discover dies here. The client keeps retrying and, on many operating systems, gives itself a 169.254.x.x (APIPA) address that cannot reach anything off the LAN.'
      })
    ]
  }
  return [
    discover,
    step({
      id: 'relay-discover',
      msg: 'Discover',
      hop: 'R1 relays to the server',
      path: ['r1', 'server'],
      cast: 'unicast',
      l2: { src: ADDR.r1WanMac, dst: ADDR.serverMac },
      l3: { src: ADDR.r1Lan, dst: ADDR.server },
      udp: { src: 67, dst: 67 },
      giaddr: ADDR.r1Lan,
      caption: 'ip helper-address 10.0.0.10 makes R1 a relay agent. It changes the source IP to its own Gi0/0 address (192.168.10.1), the destination to the server (10.0.0.10), fills in giaddr with 192.168.10.1, and routes the now-unicast packet.',
      checkpoint: 'giaddr'
    }),
    step({
      id: 'offer',
      msg: 'Offer',
      hop: 'Server to R1',
      path: ['server', 'r1'],
      cast: 'unicast',
      l2: { src: ADDR.serverMac, dst: ADDR.r1WanMac },
      l3: { src: ADDR.server, dst: ADDR.r1Lan },
      udp: { src: 67, dst: 67 },
      giaddr: ADDR.r1Lan,
      yiaddr: ADDR.offered,
      caption: 'giaddr 192.168.10.1 tells the server which pool to use: 192.168.10.0/24. It offers 192.168.10.101 with mask 255.255.255.0, default gateway 192.168.10.1, a DNS server and a 1 day lease, and replies to 192.168.10.1 by reversing the addresses.'
    }),
    step({
      id: 'relay-offer',
      msg: 'Offer',
      hop: 'R1 to the client',
      path: ['r1', 'sw', 'client'],
      flood: ['pc2'],
      cast: 'broadcast',
      l2: { src: ADDR.r1LanMac, dst: ADDR.bcastMac },
      l3: { src: ADDR.server, dst: ADDR.bcastIp },
      udp: { src: 67, dst: 68 },
      giaddr: ADDR.r1Lan,
      yiaddr: ADDR.offered,
      caption: 'The Offer arrived addressed to R1 itself, so the relay changes the destination to 255.255.255.255 and sends it out Gi0/0. The client has no IP yet, so a broadcast is the way to reach it. PC2 sees another client ID in the message and ignores it.',
      checkpoint: 'request'
    }),
    step({
      id: 'request',
      msg: 'Request',
      hop: 'Client to R1',
      path: ['client', 'sw', 'r1'],
      flood: ['pc2'],
      cast: 'broadcast',
      l2: { src: ADDR.clientMac, dst: ADDR.bcastMac },
      l3: { src: ADDR.none, dst: ADDR.bcastIp },
      udp: { src: 68, dst: 67 },
      requested: ADDR.offered,
      caption: 'The client asks for 192.168.10.101 from server 10.0.0.10. It still has no confirmed address, so it broadcasts again. The broadcast also tells any other server that made an offer that its offer was declined.'
    }),
    step({
      id: 'relay-request',
      msg: 'Request',
      hop: 'R1 relays to the server',
      path: ['r1', 'server'],
      cast: 'unicast',
      l2: { src: ADDR.r1WanMac, dst: ADDR.serverMac },
      l3: { src: ADDR.r1Lan, dst: ADDR.server },
      udp: { src: 67, dst: 67 },
      giaddr: ADDR.r1Lan,
      requested: ADDR.offered,
      caption: 'Same relay trick as the Discover: new source 192.168.10.1, new destination 10.0.0.10, giaddr filled in.'
    }),
    step({
      id: 'ack',
      msg: 'Ack',
      hop: 'Server to R1',
      path: ['server', 'r1'],
      cast: 'unicast',
      l2: { src: ADDR.serverMac, dst: ADDR.r1WanMac },
      l3: { src: ADDR.server, dst: ADDR.r1Lan },
      udp: { src: 67, dst: 67 },
      giaddr: ADDR.r1Lan,
      yiaddr: ADDR.offered,
      caption: 'The server records the lease (192.168.10.101 belongs to MAC 0050.7966.6801 for 1 day) and sends the Acknowledgment back to the relay.'
    }),
    step({
      id: 'relay-ack',
      msg: 'Ack',
      hop: 'R1 to the client',
      path: ['r1', 'sw', 'client'],
      flood: ['pc2'],
      cast: 'broadcast',
      l2: { src: ADDR.r1LanMac, dst: ADDR.bcastMac },
      l3: { src: ADDR.server, dst: ADDR.bcastIp },
      udp: { src: 67, dst: 68 },
      giaddr: ADDR.r1Lan,
      yiaddr: ADDR.offered,
      caption: 'R1 broadcasts the Ack on the LAN. Only now may the client use 192.168.10.101/24 with gateway 192.168.10.1. Lease complete.',
      checkpoint: 'renew'
    })
  ]
}

/** Which fields changed from the previous step, so the widget can highlight them. */
export function changedFields(prev, cur) {
  if (!prev) return new Set()
  const out = new Set()
  if (prev.l2.src !== cur.l2.src) out.add('l2src')
  if (prev.l2.dst !== cur.l2.dst) out.add('l2dst')
  if (prev.l3.src !== cur.l3.src) out.add('l3src')
  if (prev.l3.dst !== cur.l3.dst) out.add('l3dst')
  if (prev.giaddr !== cur.giaddr) out.add('giaddr')
  if (prev.yiaddr !== cur.yiaddr) out.add('yiaddr')
  if (prev.udp.src !== cur.udp.src || prev.udp.dst !== cur.udp.dst) out.add('udp')
  return out
}

/** Checkpoint questions asked after the step that names them. */
export const CHECKPOINTS = {
  relay: {
    question: 'The Discover just reached R1 as a broadcast, and Gi0/0 has ip helper-address 10.0.0.10. What does R1 do with it?',
    options: [
      { text: 'Floods it out every interface', correct: false, why: 'Routers never forward broadcasts. That is the whole problem a relay solves.' },
      { text: 'Sends it to 10.0.0.10 as a unicast, with 192.168.10.1 in giaddr', correct: true, why: 'Right. The relay rewrites the broadcast into a unicast the network can route.' },
      { text: 'Answers it from its own DHCP pool', correct: false, why: 'Only if R1 were the DHCP server. Here the server is 10.0.0.10, and R1 is just the relay.' }
    ]
  },
  giaddr: {
    question: 'The server serves many subnets. How does it know to offer an address from 192.168.10.0/24?',
    options: [
      { text: 'From the client’s source IP', correct: false, why: 'The client has no address yet. Its Discover came from 0.0.0.0.' },
      { text: 'From giaddr, 192.168.10.1, which sits in the 192.168.10.0/24 pool', correct: true, why: 'Right. The relay’s giaddr names the client’s subnet, so the server picks the matching pool.' },
      { text: 'From the client’s MAC address', correct: false, why: 'A MAC address says nothing about which subnet the client is on.' }
    ]
  },
  request: {
    question: 'The client knows the server’s address from the Offer. Why does it still broadcast the Request?',
    options: [
      { text: 'Broadcasts are faster than unicasts', correct: false, why: 'Speed has nothing to do with it.' },
      { text: 'It has no confirmed address yet, and the broadcast tells every server which offer it took', correct: true, why: 'Right. Until the Ack arrives the client cannot use the address, and other servers learn their offers were declined.' },
      { text: 'Routers only relay broadcasts', correct: false, why: 'The relay acts on broadcasts, but the reason the client broadcasts is that it has no confirmed address.' }
    ]
  },
  renew: {
    question: 'The lease is 1 day. When does the client first try to renew it?',
    options: [
      { text: 'After 12 hours (T1, 50% of the lease), with a unicast Request to the server', correct: true, why: 'Right. At T1 it unicasts straight to the server it got the lease from. It has an address now, so no broadcast is needed.' },
      { text: 'After 21 hours', correct: false, why: 'That is T2, 87.5% of the lease. If renewal has failed by then, the client broadcasts to rebind with any server.' },
      { text: 'Only when the lease runs out', correct: false, why: 'Waiting until expiry would cut the client off. It starts renewing halfway through.' }
    ]
  }
}

/** The relay configuration on R1. */
export function relayConfig(relay = true) {
  const lines = ['interface GigabitEthernet0/0', ` ip address ${ADDR.r1Lan} ${ADDR.mask}`]
  if (relay) lines.push(` ip helper-address ${ADDR.server}`)
  return lines
}
