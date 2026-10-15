import { useEffect, useState } from 'react'

/**
 * Width of an element in CSS pixels, kept current with a ResizeObserver.
 * Null until the first measurement (and always null where ResizeObserver is missing, as in tests),
 * so callers fall back to their desktop layout.
 */
export function useWidth(ref) {
  const [width, setWidth] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width)
      setWidth((prev) => (prev === next ? prev : next))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** Diagrams switch to their phone layout below this width (the stage, not the window). */
export const PHONE_STAGE = 480

/** True when the element is narrower than `limit`: time for the phone layout of a diagram. */
export function useNarrow(ref, limit = PHONE_STAGE) {
  const width = useWidth(ref)
  return width !== null && width < limit
}
