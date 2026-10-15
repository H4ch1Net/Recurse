// Scripts for the TCP and UDP sequence diagrams. Sequence and acknowledgment numbers
// come from a tiny TCP model (SYN and FIN each use one sequence number, data uses one
// per byte, and an ACK names the next byte expected), so the numbers are always right.

export const CLIENT = 'client'
export const SERVER = 'server'

const fmtFlags = (flags) => flags.join(', ')

/** Shuffle-free choice list: unique values in a fixed, sorted order. */
function numberChoices(answer, distractors) {
  return [...new Set([answer, ...distractors])].filter((n) => n >= 0).sort((a, b) => a - b).map(String)
}

/**
 * The TCP story: handshake, two data segments (one lost, then retransmitted), and the
 * four-way close. Options: client and server initial sequence numbers and segment size.
 */
export function buildTcpScript({ clientIsn = 100, serverIsn = 5000, bytes = 100 } = {}) {
  const c = { nxt: clientIsn }
  const s = { nxt: serverIsn }
  const events = []
  const add = (ev) => events.push({ id: events.length, kind: 'segment', len: 0, ...ev })

  // 1. SYN
  add({ from: CLIENT, flags: ['SYN'], seq: c.nxt, ack: null, title: 'SYN', states: { client: 'SYN-SENT', server: 'SYN-RECEIVED' },
    caption: `The client opens the connection. It picks an initial sequence number (ISN) of ${clientIsn} and sends a SYN. A SYN carries no data but still uses up one sequence number.` })
  c.nxt += 1
  // 2. SYN-ACK
  add({ from: SERVER, flags: ['SYN', 'ACK'], seq: s.nxt, ack: c.nxt, title: 'SYN-ACK', states: { client: 'ESTABLISHED', server: 'SYN-RECEIVED' },
    caption: `The server answers with SYN-ACK. Its own ISN is ${serverIsn}, and it acknowledges ${c.nxt}: "I got everything before ${c.nxt}, send ${c.nxt} next."`,
    question: { field: 'ack', prompt: 'What acknowledgment number does the server put in its SYN-ACK?', answer: String(c.nxt), choices: numberChoices(c.nxt, [clientIsn, serverIsn, serverIsn + 1]),
      hint: 'An ACK number is not the number just received. It names the next sequence number the receiver expects, and a SYN uses up one number.',
      explain: `An ACK number is the next sequence number expected. The SYN used ${clientIsn}, so the server expects ${c.nxt}.` } })
  s.nxt += 1
  // 3. ACK
  add({ from: CLIENT, flags: ['ACK'], seq: c.nxt, ack: s.nxt, title: 'ACK', states: { client: 'ESTABLISHED', server: 'ESTABLISHED' },
    caption: `The client acknowledges the server's SYN with ack ${s.nxt}. Three segments, and the connection is established in both directions.` })
  // 4. Data, delivered
  const firstData = c.nxt
  add({ from: CLIENT, flags: ['PSH', 'ACK'], seq: c.nxt, ack: s.nxt, len: bytes, title: 'Data', states: { client: 'ESTABLISHED', server: 'ESTABLISHED' },
    caption: `Now real data: ${bytes} bytes numbered ${firstData} to ${firstData + bytes - 1}. The sequence number is the number of the first byte.` })
  c.nxt += bytes
  // 5. ACK for data
  add({ from: SERVER, flags: ['ACK'], seq: s.nxt, ack: c.nxt, title: 'ACK', states: { client: 'ESTABLISHED', server: 'ESTABLISHED' },
    caption: `The server acknowledges with ${c.nxt}: every byte up to ${c.nxt - 1} arrived, and ${c.nxt} is the next one it wants.`,
    question: { field: 'ack', prompt: `The client sent ${bytes} bytes starting at ${firstData}. What acknowledgment number does the server send back?`, answer: String(c.nxt),
      choices: numberChoices(c.nxt, [firstData, c.nxt - 1, c.nxt + 1]),
      hint: `The data covered bytes ${firstData} to ${c.nxt - 1}. Which byte does the server want next?`,
      explain: `${firstData} + ${bytes} = ${c.nxt}. TCP acknowledges the next byte it expects, not the last byte it got.` } })
  // 6. Data, lost
  const lostSeq = c.nxt
  add({ from: CLIENT, flags: ['PSH', 'ACK'], seq: c.nxt, ack: s.nxt, len: bytes, lost: true, title: 'Data (lost)', states: { client: 'ESTABLISHED', server: 'ESTABLISHED' },
    caption: `The next ${bytes} bytes (seq ${lostSeq}) leave the client, but the segment is lost on the way. The server never sees it, so it sends no acknowledgment for those bytes. The client starts a retransmission timer whenever it sends.` })
  // 7. Timeout
  add({ kind: 'timeout', from: CLIENT, title: 'Timeout', states: { client: 'ESTABLISHED', server: 'ESTABLISHED' },
    caption: `No ACK for ${lostSeq + bytes} arrives before the retransmission timer (RTO) runs out. TCP treats the silence as a loss.` })
  // 8. Retransmission
  add({ from: CLIENT, flags: ['PSH', 'ACK'], seq: lostSeq, ack: s.nxt, len: bytes, retransmit: true, title: 'Retransmission', states: { client: 'ESTABLISHED', server: 'ESTABLISHED' },
    caption: `The client sends the very same bytes again, with the same sequence number ${lostSeq}. This is the reliability TCP adds on top of IP.`,
    question: { field: 'seq', prompt: `The segment with seq ${lostSeq} was lost and the timer expired. What does the client send next?`, answer: `The same ${bytes} bytes again, seq ${lostSeq}`,
      choices: [`The same ${bytes} bytes again, seq ${lostSeq}`, `New data, seq ${lostSeq + bytes}`, 'A new SYN to restart the connection', 'Nothing: the server will ask for it'],
      hint: 'The connection is fine; only one segment is missing. The server cannot ask for data it never knew was sent.',
      explain: `TCP retransmits unacknowledged data with its original sequence number, so the receiver can slot it into the right place.` } })
  c.nxt += bytes
  // 9. ACK
  add({ from: SERVER, flags: ['ACK'], seq: s.nxt, ack: c.nxt, title: 'ACK', states: { client: 'ESTABLISHED', server: 'ESTABLISHED' },
    caption: `This time it arrives. The server acknowledges ${c.nxt}: all ${2 * bytes} bytes are in, in order.` })
  // 10. FIN from client
  add({ from: CLIENT, flags: ['FIN', 'ACK'], seq: c.nxt, ack: s.nxt, title: 'FIN', states: { client: 'FIN-WAIT-1', server: 'CLOSE-WAIT' },
    caption: 'The client is done sending and sends FIN. Like SYN, a FIN uses up one sequence number.' })
  c.nxt += 1
  // 11. ACK of FIN
  add({ from: SERVER, flags: ['ACK'], seq: s.nxt, ack: c.nxt, title: 'ACK', states: { client: 'FIN-WAIT-2', server: 'CLOSE-WAIT' },
    caption: `The server acknowledges the FIN with ${c.nxt}. Its own direction is still open until it sends a FIN too.` })
  // 12. FIN from server
  add({ from: SERVER, flags: ['FIN', 'ACK'], seq: s.nxt, ack: c.nxt, title: 'FIN', states: { client: 'TIME-WAIT', server: 'LAST-ACK' },
    caption: 'The server finishes its side with its own FIN.' })
  s.nxt += 1
  // 13. Final ACK
  add({ from: CLIENT, flags: ['ACK'], seq: c.nxt, ack: s.nxt, title: 'ACK', states: { client: 'TIME-WAIT', server: 'CLOSED' },
    caption: `The client acknowledges with ${s.nxt}. Four segments close the connection (FIN, ACK, FIN, ACK). The client lingers in TIME-WAIT briefly in case its last ACK is lost.` })

  return events
}

/** The UDP story: no handshake, no acknowledgments, and a loss nobody notices. */
export function buildUdpScript({ srcPort = 50000, dstPort = 5004, payload = 160 } = {}) {
  const events = []
  const add = (ev) => events.push({ id: events.length, kind: 'datagram', from: CLIENT, srcPort, dstPort, len: payload, ...ev })
  add({ title: 'Datagram 1', states: { client: 'no connection', server: 'no connection' },
    caption: `No handshake at all: the client just starts sending. This could be a voice call, ${payload} bytes of audio every 20 ms. The whole UDP header is 8 bytes: source port, destination port, length, checksum.` })
  add({ title: 'Datagram 2', states: { client: 'no connection', server: 'no connection' },
    caption: 'Another datagram. The server does not acknowledge anything, and there are no sequence numbers to put things back in order.' })
  add({ title: 'Datagram 3 (lost)', lost: true, states: { client: 'no connection', server: 'no connection' },
    caption: 'Datagram 3 is lost on the way. Watch what happens next.' })
  add({ title: 'Datagram 4', states: { client: 'no connection', server: 'no connection' },
    caption: 'Datagram 4 arrives as if nothing happened. At the transport layer nobody noticed the loss: no timer, no retransmission. If the application cares, it must deal with it (a voice call just skips a few milliseconds; DNS asks again).',
    question: { field: 'loss', prompt: 'Datagram 3 was lost. What does UDP do about it?', answer: 'Nothing: UDP never retransmits',
      choices: ['Nothing: UDP never retransmits', 'The sender retransmits after a timeout', 'The receiver sends a request for datagram 3', 'UDP closes the connection'],
      hint: 'Look at the diagram: did any acknowledgment ever travel back to the client?',
      explain: 'UDP has no acknowledgments, timers or sequence numbers. That is why it is fast and light, and why apps like voice and video prefer it: late audio is useless anyway.' } })
  add({ kind: 'note', title: 'Done', states: { client: 'no connection', server: 'no connection' },
    caption: 'The client simply stops. No FIN, no teardown, because there was never a connection. Compare: TCP used 3 segments to open, an ACK for every delivery, and 4 to close.' })
  return events
}

/**
 * Label lines for a segment arrow. `hide` names a field ('ack' or 'seq') to show as "?",
 * used while the learner is answering a question about it.
 */
export function segmentLabel(ev, hide = null) {
  if (ev.kind === 'datagram') return [`UDP ${ev.title.replace(' (lost)', '')}`, `${ev.srcPort} > ${ev.dstPort} len=${ev.len + 8}`]
  if (ev.kind !== 'segment') return [ev.title]
  const parts = [`seq=${hide === 'seq' ? '?' : ev.seq}`]
  if (ev.ack != null) parts.push(`ack=${hide === 'ack' ? '?' : ev.ack}`)
  if (ev.len) parts.push(`len=${ev.len}`)
  return [fmtFlags(ev.flags) + (ev.retransmit ? ' (again)' : ''), parts.join(' ')]
}

/** Header fields of an event for the details panel. */
export function headerFields(ev, hide = null) {
  if (ev.kind === 'datagram') {
    return [
      ['Source port', String(ev.srcPort)],
      ['Destination port', String(ev.dstPort)],
      ['Length', `${ev.len + 8} (8 header + ${ev.len} data)`],
      ['Checksum', 'present (optional in IPv4)']
    ]
  }
  if (ev.kind !== 'segment') return []
  const flagNames = ['SYN', 'ACK', 'PSH', 'FIN']
  return [
    ['Flags', flagNames.filter((f) => ev.flags.includes(f)).join(' ') || 'none'],
    ['Sequence number', hide === 'seq' ? '?' : String(ev.seq)],
    ['Acknowledgment number', ev.ack == null ? 'not set (no ACK flag)' : hide === 'ack' ? '?' : String(ev.ack)],
    ['Data length', ev.len ? `${ev.len} bytes (${ev.seq} to ${ev.seq + ev.len - 1})` : '0']
  ]
}

export function checkAnswer(question, choice) {
  return String(choice) === String(question.answer)
}

/** Counts used by the widget: how many questions a script asks. */
export const questionCount = (events) => events.filter((e) => e.question).length
