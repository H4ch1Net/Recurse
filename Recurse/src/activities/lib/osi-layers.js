// OSI layer sort: the seven layers, the TCP/IP model beside them, the cards to place,
// and a grader that gives a nudge (not the answer) for misplaced cards.

export const OSI_LAYERS = [
  { n: 7, name: 'Application', job: 'Services that apps use to talk over the network', down: 'All', up: 'Away' },
  { n: 6, name: 'Presentation', job: 'Formats, character sets, encryption', down: 'People', up: 'Pizza' },
  { n: 5, name: 'Session', job: 'Starts, manages and ends conversations', down: 'Seem', up: 'Sausage' },
  { n: 4, name: 'Transport', job: 'End to end delivery between apps', down: 'To', up: 'Throw' },
  { n: 3, name: 'Network', job: 'Logical addressing and routing between networks', down: 'Need', up: 'Not' },
  { n: 2, name: 'Data Link', job: 'Delivery on the local link', down: 'Data', up: 'Do' },
  { n: 1, name: 'Physical', job: 'Signals on copper, fiber or radio', down: 'Processing', up: 'Please' }
]

export const MNEMONICS = {
  down: { label: 'Top down', phrase: 'All People Seem To Need Data Processing' },
  up: { label: 'Bottom up', phrase: 'Please Do Not Throw Sausage Pizza Away' }
}

/** The five-layer TCP/IP model used on the CCNA, with the OSI layers each one covers. */
export const TCPIP_LAYERS = [
  { name: 'Application', covers: [7, 6, 5] },
  { name: 'Transport', covers: [4] },
  { name: 'Network', covers: [3], note: 'Internet in the original model' },
  { name: 'Data Link', covers: [2] },
  { name: 'Physical', covers: [1] }
]

export const OSI_CARDS = [
  { id: 'http', label: 'HTTP', kind: 'protocol', layer: 7, why: 'HTTP is how browsers and web servers talk, so it is an application layer protocol.' },
  { id: 'dns', label: 'DNS', kind: 'protocol', layer: 7, why: 'DNS turns names into IP addresses for applications. It is an application layer service that rides on UDP or TCP port 53.' },
  { id: 'tls', label: 'TLS encryption', kind: 'protocol', layer: 6, why: 'Encrypting data is a Presentation layer job in the OSI model. In the TCP/IP model TLS sits in the application layer, on top of TCP.' },
  { id: 'formats', label: 'JPEG and ASCII', kind: 'format', layer: 6, why: 'Data formats and character encoding belong to the Presentation layer, which makes sure both ends read the data the same way.' },
  { id: 'session', label: 'Opening and closing sessions', kind: 'job', layer: 5, why: 'Setting up, managing and tearing down a conversation between applications is what the Session layer is named for.' },
  { id: 'tcp', label: 'TCP', kind: 'protocol', layer: 4, why: 'TCP gives reliable, ordered delivery with sequence numbers and acknowledgments: Transport layer.' },
  { id: 'udp', label: 'UDP', kind: 'protocol', layer: 4, why: 'UDP is the connectionless Transport protocol: ports, a length and a checksum, nothing more.' },
  { id: 'port', label: 'Port number', kind: 'address', layer: 4, why: 'Port numbers (80, 443, 53) pick out the application on a host. They live in the TCP or UDP header at layer 4.' },
  { id: 'segment', label: 'Segment', kind: 'PDU', layer: 4, why: 'Segment is the layer 4 PDU: a TCP header plus data. (With UDP it is often called a datagram.)' },
  { id: 'ip', label: 'IP', kind: 'protocol', layer: 3, why: 'IP carries packets between networks using logical addresses: Network layer.' },
  { id: 'icmp', label: 'ICMP (ping)', kind: 'protocol', layer: 3, why: 'ICMP carries IP error and test messages such as echo (ping) and destination unreachable. It is a Network layer protocol carried inside IP.' },
  { id: 'ospf', label: 'OSPF', kind: 'protocol', layer: 3, why: 'OSPF is a routing protocol: it builds the routes that layer 3 forwarding uses, and it runs directly over IP as protocol 89.' },
  { id: 'router', label: 'Router', kind: 'device', layer: 3, why: 'A router forwards packets between networks by reading the destination IP address, so it is a layer 3 device.' },
  { id: 'ipaddr', label: 'IP address', kind: 'address', layer: 3, why: 'IP addresses are logical, routable addresses: layer 3.' },
  { id: 'packet', label: 'Packet', kind: 'PDU', layer: 3, why: 'Packet is the layer 3 PDU: an IP header with a segment inside.' },
  { id: 'switch', label: 'Switch', kind: 'device', layer: 2, why: 'A switch forwards frames by destination MAC address, so it is a layer 2 device. (A multilayer switch can also route.)' },
  { id: 'mac', label: 'MAC address', kind: 'address', layer: 2, why: 'MAC addresses are the hardware addresses used for delivery on the local link: layer 2.' },
  { id: 'frame', label: 'Ethernet frame', kind: 'PDU', layer: 2, why: 'A frame is the layer 2 PDU: an Ethernet header, the packet, and a trailer with the FCS.' },
  { id: 'bits', label: 'Bits', kind: 'PDU', layer: 1, why: 'At layer 1 everything is just bits, turned into electrical, light or radio signals.' },
  { id: 'hub', label: 'Hub', kind: 'device', layer: 1, why: 'A hub repeats electrical signals out every port and never reads an address: layer 1.' },
  { id: 'cable', label: 'UTP or fiber cable', kind: 'medium', layer: 1, why: 'Cables, connectors and the signals on them are the Physical layer.' }
]

const CARD_MAP = Object.fromEntries(OSI_CARDS.map((c) => [c.id, c]))
export const cardById = (id) => CARD_MAP[id] || null
export const layerByNumber = (n) => OSI_LAYERS.find((l) => l.n === n) || null

/** TCP/IP layer name for an OSI layer number. */
export function tcpipFor(n) {
  return TCPIP_LAYERS.find((t) => t.covers.includes(n))?.name || null
}

const KIND_CLUES = {
  device: 'Ask what the device reads to decide where to send things: nothing at all (1), a MAC address (2), or an IP address (3).',
  PDU: 'The PDUs from the top: data (5 to 7), segment (4), packet (3), frame (2), bits (1).',
  address: 'Port numbers live at 4, IP addresses at 3, MAC addresses at 2.',
  medium: 'Think about what you could hold in your hand.',
  format: 'Which layer makes sure both ends understand the format of the data?',
  job: 'Which layer is named after a conversation between two apps?',
  protocol: 'Think about what the protocol is for: the app itself, moving data between apps, finding a path between networks, or the local link.'
}

/** A nudge for a card on the wrong layer. Never gives the answer away outright. */
export function hintFor(cardId, placedLayer) {
  const card = cardById(cardId)
  if (!card || placedLayer === card.layer) return ''
  const diff = card.layer - placedLayer
  if (card.layer >= 5 && placedLayer >= 5) {
    return `${card.label}: right area. In TCP/IP terms layers 5 to 7 are all Application, but OSI splits them. ${KIND_CLUES[card.kind] || ''}`.trim()
  }
  if (Math.abs(diff) === 1) return `${card.label}: close. It belongs one layer ${diff > 0 ? 'higher' : 'lower'}.`
  return `${card.label}: not layer ${placedLayer}. ${KIND_CLUES[card.kind] || ''}`.trim()
}

/**
 * Grade placements ({ cardId: layerNumber }). Cards missing from the object are
 * unplaced. Returns per-card results and totals.
 */
export function grade(placements, cards = OSI_CARDS) {
  const results = {}
  let correct = 0
  let wrong = 0
  for (const card of cards) {
    const at = placements[card.id]
    if (at == null) continue
    if (at === card.layer) {
      results[card.id] = 'correct'
      correct++
    } else {
      results[card.id] = 'wrong'
      wrong++
    }
  }
  const unplaced = cards.length - correct - wrong
  return { results, correct, wrong, unplaced, allCorrect: correct === cards.length }
}

/** Fisher-Yates shuffle with an injectable random source. */
export function shuffled(list, rng = Math.random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
