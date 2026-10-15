import { describe, expect, it } from 'vitest'
import { CLIENT, SERVER, buildTcpScript, buildUdpScript, checkAnswer, headerFields, questionCount, segmentLabel } from './tcp-handshake'

describe('TCP script', () => {
  const events = buildTcpScript({ clientIsn: 100, serverIsn: 5000, bytes: 100 })
  const segs = events.filter((e) => e.kind === 'segment')

  it('opens with SYN, SYN-ACK, ACK and the right numbers', () => {
    const [syn, synAck, ack] = segs
    expect(syn).toMatchObject({ from: CLIENT, flags: ['SYN'], seq: 100, ack: null })
    expect(synAck).toMatchObject({ from: SERVER, flags: ['SYN', 'ACK'], seq: 5000, ack: 101 })
    expect(ack).toMatchObject({ from: CLIENT, flags: ['ACK'], seq: 101, ack: 5001 })
  })

  it('acknowledges data with the next byte expected', () => {
    const data = segs[3]
    const dataAck = segs[4]
    expect(data).toMatchObject({ seq: 101, len: 100 })
    expect(dataAck).toMatchObject({ from: SERVER, ack: 201 })
  })

  it('loses a segment, times out and retransmits it with the same sequence number', () => {
    const lostIndex = events.findIndex((e) => e.lost)
    const lost = events[lostIndex]
    expect(lost.seq).toBe(201)
    expect(events[lostIndex + 1].kind).toBe('timeout')
    const again = events[lostIndex + 2]
    expect(again).toMatchObject({ retransmit: true, seq: 201, len: 100 })
    expect(events[lostIndex + 3]).toMatchObject({ from: SERVER, ack: 301 })
  })

  it('closes with FIN, ACK, FIN, ACK where each FIN uses one number', () => {
    const tail = segs.slice(-4)
    expect(tail.map((s) => s.flags.join('+'))).toEqual(['FIN+ACK', 'ACK', 'FIN+ACK', 'ACK'])
    expect(tail[0]).toMatchObject({ from: CLIENT, seq: 301 })
    expect(tail[1]).toMatchObject({ from: SERVER, ack: 302 })
    expect(tail[2]).toMatchObject({ from: SERVER, seq: 5001 })
    expect(tail[3]).toMatchObject({ from: CLIENT, seq: 302, ack: 5002 })
  })

  it('walks the RFC 793 states', () => {
    expect(events[0].states).toEqual({ client: 'SYN-SENT', server: 'SYN-RECEIVED' })
    expect(events[2].states).toEqual({ client: 'ESTABLISHED', server: 'ESTABLISHED' })
    expect(events.at(-1).states).toEqual({ client: 'TIME-WAIT', server: 'CLOSED' })
    expect(events.map((e) => e.states.client)).toContain('FIN-WAIT-2')
    expect(events.map((e) => e.states.server)).toContain('LAST-ACK')
  })

  it('asks three questions whose answers are among the choices and match the numbers', () => {
    expect(questionCount(events)).toBe(3)
    for (const e of events.filter((x) => x.question)) {
      expect(e.question.choices).toContain(e.question.answer)
      expect(new Set(e.question.choices).size).toBe(e.question.choices.length)
      if (e.question.field === 'ack') expect(e.question.answer).toBe(String(e.ack))
    }
  })

  it('follows other starting numbers and sizes', () => {
    const other = buildTcpScript({ clientIsn: 7000, serverIsn: 300, bytes: 500 }).filter((e) => e.kind === 'segment')
    expect(other[1].ack).toBe(7001)
    expect(other[4].ack).toBe(7501)
    expect(other.at(-1)).toMatchObject({ seq: 8002, ack: 302 })
  })

  it('writes captions without em dashes', () => {
    for (const e of events) expect(e.caption).not.toMatch(/—/)
  })
})

describe('UDP script', () => {
  const events = buildUdpScript()

  it('has no handshake, no ACKs, and a silent loss', () => {
    expect(events.every((e) => e.from === CLIENT)).toBe(true)
    expect(events.filter((e) => e.lost)).toHaveLength(1)
    expect(events.some((e) => e.kind === 'segment')).toBe(false)
    expect(questionCount(events)).toBe(1)
  })

  it('reports the UDP length as header plus data', () => {
    const fields = Object.fromEntries(headerFields(events[0]))
    expect(fields.Length).toMatch(/^168 /)
    expect(segmentLabel(events[0])[1]).toBe('50000 > 5004 len=168')
  })
})

describe('labels and answers', () => {
  const events = buildTcpScript()

  it('hides the asked field', () => {
    expect(segmentLabel(events[1], 'ack')).toEqual(['SYN, ACK', 'seq=5000 ack=?'])
    expect(segmentLabel(events[1])).toEqual(['SYN, ACK', 'seq=5000 ack=101'])
    expect(segmentLabel(events[0])).toEqual(['SYN', 'seq=100'])
    const retrans = events.find((e) => e.retransmit)
    expect(segmentLabel(retrans)[0]).toBe('PSH, ACK (again)')
  })

  it('describes header fields', () => {
    const fields = Object.fromEntries(headerFields(events[3]))
    expect(fields.Flags).toBe('ACK PSH')
    expect(fields['Data length']).toBe('100 bytes (101 to 200)')
    expect(Object.fromEntries(headerFields(events[0]))['Acknowledgment number']).toMatch(/not set/)
  })

  it('checks answers by value', () => {
    const q = events[1].question
    expect(checkAnswer(q, '101')).toBe(true)
    expect(checkAnswer(q, 101)).toBe(true)
    expect(checkAnswer(q, '100')).toBe(false)
  })
})
