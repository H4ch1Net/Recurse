// CPU scheduling simulators for the cpu-scheduling widget: FCFS, non-preemptive SJF and
// round robin. Processes are { name, arrival, burst } with whole-number times.
// Each simulator returns { segments, stats, avgWaiting, avgTurnaround, end }.
// segments: [{ name (null when idle), start, end, reason }] in time order.

export const ALGORITHMS = {
  fcfs: { label: 'FCFS', name: 'First come, first served' },
  sjf: { label: 'SJF', name: 'Shortest job first' },
  rr: { label: 'Round robin', name: 'Round robin' }
}
export const ALGORITHM_KEYS = Object.keys(ALGORITHMS)

export const DEFAULT_PROCESSES = [
  { name: 'P1', arrival: 0, burst: 10 },
  { name: 'P2', arrival: 1, burst: 2 },
  { name: 'P3', arrival: 2, burst: 3 },
  { name: 'P4', arrival: 3, burst: 1 }
]

const byArrival = (procs) => procs.map((p, index) => ({ ...p, index })).sort((a, b) => a.arrival - b.arrival || a.index - b.index)

function finish(procs, segments) {
  const completion = {}
  for (const s of segments) if (s.name) completion[s.name] = s.end
  const stats = procs.map((p) => {
    const turnaround = completion[p.name] - p.arrival
    return { name: p.name, arrival: p.arrival, burst: p.burst, completion: completion[p.name], turnaround, waiting: turnaround - p.burst }
  })
  const n = stats.length || 1
  return {
    segments,
    stats,
    avgWaiting: stats.reduce((sum, s) => sum + s.waiting, 0) / n,
    avgTurnaround: stats.reduce((sum, s) => sum + s.turnaround, 0) / n,
    end: segments.length ? segments[segments.length - 1].end : 0
  }
}

const idle = (start, end) => ({ name: null, start, end, reason: `No process is ready, so the CPU sits idle until t = ${end}.` })

export function fcfs(procs) {
  const order = byArrival(procs)
  const segments = []
  let t = 0
  order.forEach((p, k) => {
    if (p.arrival > t) {
      segments.push(idle(t, p.arrival))
      t = p.arrival
    }
    const reason = k === 0 ? `${p.name} arrived first, so it runs all ${p.burst} units without interruption.` : `${p.name} is next in arrival order (it came at t = ${p.arrival}), so it runs all ${p.burst} units.`
    segments.push({ name: p.name, start: t, end: t + p.burst, reason })
    t += p.burst
  })
  return finish(procs, segments)
}

export function sjf(procs) {
  const pending = byArrival(procs)
  const segments = []
  let t = 0
  while (pending.length) {
    let ready = pending.filter((p) => p.arrival <= t)
    if (!ready.length) {
      const next = pending[0].arrival
      segments.push(idle(t, next))
      t = next
      ready = pending.filter((p) => p.arrival <= t)
    }
    const pick = ready.reduce((best, p) => (p.burst < best.burst ? p : best))
    const reason =
      ready.length === 1
        ? `Only ${pick.name} is ready, so it runs all ${pick.burst} units.`
        : `Ready: ${ready.map((p) => `${p.name} (${p.burst})`).join(', ')}. ${pick.name} has the shortest burst, so it runs all ${pick.burst} units.`
    segments.push({ name: pick.name, start: t, end: t + pick.burst, reason })
    t += pick.burst
    pending.splice(pending.indexOf(pick), 1)
  }
  return finish(procs, segments)
}

/**
 * Round robin. A process that uses its whole quantum goes to the back of the queue, behind any
 * process that arrived while it was running.
 */
export function rr(procs, quantum = 2) {
  const q = Math.max(1, Math.round(quantum))
  const incoming = byArrival(procs)
  const left = Object.fromEntries(procs.map((p) => [p.name, p.burst]))
  const queue = []
  const segments = []
  let t = 0
  const admit = (until) => {
    while (incoming.length && incoming[0].arrival <= until) queue.push(incoming.shift())
  }
  admit(0)
  while (queue.length || incoming.length) {
    if (!queue.length) {
      const next = incoming[0].arrival
      segments.push(idle(t, next))
      t = next
      admit(t)
    }
    const p = queue.shift()
    const run = Math.min(q, left[p.name])
    left[p.name] -= run
    const start = t
    t += run
    admit(t)
    let reason
    if (left[p.name] > 0) {
      queue.push(p)
      reason = `${p.name} runs for one quantum (${run}), still needs ${left[p.name]}, and goes to the back of the queue: ${queue.map((x) => x.name).join(', ')}.`
    } else {
      reason = run < q ? `${p.name} needs only ${run} more, so it finishes before its quantum runs out.` : `${p.name} runs its last ${run} units and finishes.`
    }
    segments.push({ name: p.name, start, end: t, reason })
  }
  return finish(procs, segments)
}

export function simulateAll(procs, quantum = 2) {
  return { fcfs: fcfs(procs), sjf: sjf(procs), rr: rr(procs, quantum) }
}

/** Keys of the algorithms tied for the lowest average waiting time. */
export function bestAlgorithms(results) {
  const min = Math.min(...ALGORITHM_KEYS.map((k) => results[k].avgWaiting))
  return ALGORITHM_KEYS.filter((k) => Math.abs(results[k].avgWaiting - min) < 1e-9)
}

/** Why the winner won, in one or two sentences. */
export function explainBest(results) {
  const best = bestAlgorithms(results)
  if (best.length === 3) return 'All three tie here: the processes already arrive in a friendly order, so no strategy can do better.'
  const names = best.map((k) => ALGORITHMS[k].label).join(' and ')
  if (best.includes('sjf')) return `${names} ${best.length > 1 ? 'tie' : 'wins'}. Running short jobs first means fewer processes sit waiting behind a long one.`
  if (best.includes('rr')) return `${names} ${best.length > 1 ? 'tie' : 'wins'}. Short jobs did not have to wait for the long first job to finish: they got a turn after one quantum. SJF cannot help here because it never interrupts a running job.`
  return `${names} ${best.length > 1 ? 'tie' : 'wins'}. The jobs arrive roughly in order of length, so plain arrival order already runs short jobs early, and round robin only adds extra waiting.`
}

/** Random workload: 3 to 5 processes, the first arriving at 0. */
export function randomProcesses(rng = Math.random, count) {
  const n = count || 3 + Math.floor(rng() * 3)
  const out = []
  let arrival = 0
  for (let k = 0; k < n; k++) {
    out.push({ name: `P${k + 1}`, arrival, burst: 1 + Math.floor(rng() * 9) })
    arrival += Math.floor(rng() * 4)
  }
  return out
}

/** Keeps edited values sane: whole numbers, arrival 0 to 20, burst 1 to 12. */
export function cleanProcesses(list) {
  const src = Array.isArray(list) && list.length >= 2 ? list.slice(0, 6) : DEFAULT_PROCESSES
  return src.map((p, k) => ({
    name: `P${k + 1}`,
    arrival: Math.max(0, Math.min(20, Math.round(Number(p.arrival)) || 0)),
    burst: Math.max(1, Math.min(12, Math.round(Number(p.burst)) || 1))
  }))
}
