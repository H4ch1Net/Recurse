// Small animation helpers shared by the networking widgets: packets ("tokens") that
// glide along links phase by phase, plus a width hook so diagrams can switch to a
// taller layout on phones. Pure requestAnimationFrame, no dependencies.
import { useCallback, useEffect, useRef, useState } from 'react'

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const lerp = (a, b, t) => a + (b - a) * t

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/** Point at fraction t (0..1) along a polyline of {x, y} points. */
export function pointAlong(points, t) {
  if (points.length === 1) return { ...points[0] }
  const lengths = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    lengths.push(d)
    total += d
  }
  let target = Math.max(0, Math.min(1, t)) * total
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] === 0 ? 1 : Math.min(1, target / lengths[i])
      return { x: lerp(points[i].x, points[i + 1].x, k), y: lerp(points[i].y, points[i + 1].y, k) }
    }
    target -= lengths[i]
  }
  return { ...points[points.length - 1] }
}

/**
 * Where a token is at eased progress t. A segment is
 * { from, to } or { points }, plus optional { id, tone, label, drop } where `drop`
 * (0..1) makes the packet fall and fade at that point, as if lost on the wire.
 */
export function tokenAt(segment, t, index = 0) {
  const points = segment.points || [segment.from, segment.to]
  const base = { id: segment.id ?? index, tone: segment.tone, label: segment.label, kind: segment.kind }
  if (segment.drop != null && t >= segment.drop) {
    const at = pointAlong(points, segment.drop)
    const k = segment.drop >= 1 ? 1 : (t - segment.drop) / (1 - segment.drop)
    return { ...base, x: at.x, y: at.y + k * 26, opacity: Math.max(0, 1 - k), dropped: true }
  }
  const p = pointAlong(points, t)
  return { ...base, x: p.x, y: p.y, opacity: 1, dropped: false }
}

/**
 * Runs token animations. `play(phases, { duration, onPhase })` animates each phase
 * (an array of segments that move together) one after another and resolves to true
 * when finished, or false when stopped. Reduced motion shortens every phase.
 */
export function useTokens() {
  const [tokens, setTokens] = useState([])
  const [busy, setBusy] = useState(false)
  const frame = useRef(0)
  const run = useRef(0)
  const pending = useRef(null)

  const halt = useCallback(() => {
    run.current += 1
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame.current)
    if (pending.current) {
      pending.current(false)
      pending.current = null
    }
  }, [])

  const stop = useCallback(() => {
    halt()
    setTokens([])
    setBusy(false)
  }, [halt])

  useEffect(() => halt, [halt])

  const play = useCallback(
    (phases, { duration = 700, onPhase } = {}) => {
      halt()
      const id = run.current
      const list = phases.filter(Boolean)
      if (!list.length || typeof requestAnimationFrame === 'undefined') return Promise.resolve(true)
      const dur = prefersReducedMotion() ? Math.min(duration, 140) : duration
      setBusy(true)
      return new Promise((resolve) => {
        pending.current = resolve
        let phase = 0
        let start = null
        const tick = (now) => {
          if (id !== run.current) return
          if (start === null) start = now
          const raw = Math.min(1, (now - start) / dur)
          const eased = easeInOut(raw)
          setTokens(list[phase].map((seg, i) => tokenAt(seg, eased, i)))
          if (raw >= 1) {
            onPhase?.(phase)
            phase += 1
            start = null
            if (phase >= list.length) {
              pending.current = null
              setTokens([])
              setBusy(false)
              resolve(true)
              return
            }
          }
          frame.current = requestAnimationFrame(tick)
        }
        frame.current = requestAnimationFrame(tick)
      })
    },
    [halt]
  )

  return { tokens, play, stop, busy }
}

/** Width of an element in CSS pixels, updated on resize. */
export function useWidth(ref, fallback = 640) {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setWidth(el.getBoundingClientRect().width || fallback)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, fallback])
  return width
}

/** Promise that resolves after ms, shortened under reduced motion. */
export function wait(ms) {
  const d = prefersReducedMotion() ? Math.min(ms, 80) : ms
  return new Promise((resolve) => setTimeout(resolve, d))
}

export const SPEEDS = [0.5, 1, 2]
