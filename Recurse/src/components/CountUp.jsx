import { useEffect, useRef, useState } from 'react'
import { effectsLevel } from '../lib/juice'

/** A number that counts up from zero when it first appears. */
export default function CountUp({ value, duration = 900, suffix = '' }) {
  const target = Math.round(Number(value) || 0)
  const animate = effectsLevel() !== 'off' && target > 0
  const [shown, setShown] = useState(animate ? 0 : target)
  const frame = useRef(0)
  useEffect(() => {
    if (!animate) return
    const start = performance.now()
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration)
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration, animate])
  return <span className="tabular">{animate ? shown : target}{suffix}</span>
}
