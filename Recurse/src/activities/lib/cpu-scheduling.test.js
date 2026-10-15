import { describe, expect, it } from 'vitest'
import { DEFAULT_PROCESSES, bestAlgorithms, cleanProcesses, explainBest, fcfs, randomProcesses, rr, simulateAll, sjf } from './cpu-scheduling'

// Classic textbook workload, worked out by hand.
const TEXTBOOK = [
  { name: 'P1', arrival: 0, burst: 5 },
  { name: 'P2', arrival: 1, burst: 3 },
  { name: 'P3', arrival: 2, burst: 8 },
  { name: 'P4', arrival: 3, burst: 6 }
]
const spans = (r) => r.segments.map((s) => `${s.name ?? 'idle'}:${s.start}-${s.end}`)
const waits = (r) => r.stats.map((s) => s.waiting)

describe('FCFS', () => {
  it('runs in arrival order', () => {
    const r = fcfs(TEXTBOOK)
    expect(spans(r)).toEqual(['P1:0-5', 'P2:5-8', 'P3:8-16', 'P4:16-22'])
    expect(waits(r)).toEqual([0, 4, 6, 13])
    expect(r.avgWaiting).toBe(5.75)
    expect(r.avgTurnaround).toBe(11.25)
  })

  it('idles until the first arrival', () => {
    const r = fcfs([{ name: 'P1', arrival: 2, burst: 3 }, { name: 'P2', arrival: 8, burst: 1 }])
    expect(spans(r)).toEqual(['idle:0-2', 'P1:2-5', 'idle:5-8', 'P2:8-9'])
    expect(waits(r)).toEqual([0, 0])
  })
})

describe('SJF (non-preemptive)', () => {
  it('picks the shortest ready job each time the CPU frees up', () => {
    const r = sjf(TEXTBOOK)
    expect(spans(r)).toEqual(['P1:0-5', 'P2:5-8', 'P4:8-14', 'P3:14-22'])
    expect(waits(r)).toEqual([0, 4, 12, 5])
    expect(r.avgWaiting).toBe(5.25)
  })

  it('breaks ties by arrival', () => {
    const r = sjf([{ name: 'P1', arrival: 0, burst: 2 }, { name: 'P2', arrival: 1, burst: 3 }, { name: 'P3', arrival: 1, burst: 3 }])
    expect(spans(r)).toEqual(['P1:0-2', 'P2:2-5', 'P3:5-8'])
  })
})

describe('round robin', () => {
  it('matches the hand-computed quantum 2 schedule', () => {
    const r = rr(TEXTBOOK, 2)
    expect(spans(r)).toEqual(['P1:0-2', 'P2:2-4', 'P3:4-6', 'P1:6-8', 'P4:8-10', 'P2:10-11', 'P3:11-13', 'P1:13-14', 'P4:14-16', 'P3:16-18', 'P4:18-20', 'P3:20-22'])
    expect(r.stats.map((s) => s.completion)).toEqual([14, 11, 22, 20])
    expect(waits(r)).toEqual([9, 7, 12, 11])
    expect(r.avgWaiting).toBe(9.75)
  })

  it('with a huge quantum behaves like FCFS', () => {
    expect(spans(rr(TEXTBOOK, 100))).toEqual(spans(fcfs(TEXTBOOK)))
  })

  it('handles gaps with no ready process', () => {
    const r = rr([{ name: 'P1', arrival: 0, burst: 1 }, { name: 'P2', arrival: 4, burst: 3 }], 2)
    expect(spans(r)).toEqual(['P1:0-1', 'idle:1-4', 'P2:4-6', 'P2:6-7'])
  })
})

describe('comparison', () => {
  it('round robin wins the convoy workload used by default', () => {
    const results = simulateAll(DEFAULT_PROCESSES, 2)
    expect(results.fcfs.avgWaiting).toBe(7.75)
    expect(results.sjf.avgWaiting).toBe(7)
    expect(results.rr.avgWaiting).toBe(4.25)
    expect(bestAlgorithms(results)).toEqual(['rr'])
    expect(explainBest(results)).toMatch(/Round robin wins/)
  })

  it('SJF wins the textbook workload', () => {
    const results = simulateAll(TEXTBOOK, 2)
    expect(bestAlgorithms(results)).toEqual(['sjf'])
  })

  it('reports ties', () => {
    const same = [{ name: 'P1', arrival: 0, burst: 2 }, { name: 'P2', arrival: 2, burst: 2 }]
    expect(bestAlgorithms(simulateAll(same, 2))).toEqual(['fcfs', 'sjf', 'rr'])
  })

  it('waiting time is always turnaround minus burst and never negative', () => {
    let seed = 3
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let k = 0; k < 40; k++) {
      const procs = randomProcesses(rng)
      for (const r of Object.values(simulateAll(procs, 1 + (k % 4)))) {
        const busy = r.segments.filter((s) => s.name).reduce((sum, s) => sum + s.end - s.start, 0)
        expect(busy).toBe(procs.reduce((sum, p) => sum + p.burst, 0))
        for (const s of r.stats) {
          expect(s.waiting).toBe(s.turnaround - s.burst)
          expect(s.waiting).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

describe('cleanProcesses', () => {
  it('renames, clamps and falls back to the defaults', () => {
    expect(cleanProcesses([{ arrival: -3, burst: 40 }, { arrival: '2', burst: 0 }])).toEqual([
      { name: 'P1', arrival: 0, burst: 12 },
      { name: 'P2', arrival: 2, burst: 1 }
    ])
    expect(cleanProcesses(null)).toEqual(DEFAULT_PROCESSES)
  })
})
