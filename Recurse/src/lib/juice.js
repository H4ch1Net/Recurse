// Visual feedback: particle bursts, confetti, floating "+XP" text and a gentle shake.
// Framework-free so pages, widgets and the study screen can all call it directly.
// Effects levels: 'full' (everything), 'calm' (no particles or shake, small text pops),
// 'off'. Reduced-motion users get 'calm' even when 'full' is chosen.
import { sfx } from './sfx'

let level = 'full'

export function configureEffects(value) {
  level = ['full', 'calm', 'off'].includes(value) ? value : 'full'
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function effectsLevel() {
  if (level === 'full' && reducedMotion()) return 'calm'
  return level
}

// ---- Particle canvas -----------------------------------------------------------

let canvas = null
let c2d = null
let particles = []
let frame = 0

function ensureCanvas() {
  if (canvas || typeof document === 'undefined') return Boolean(canvas)
  canvas = document.createElement('canvas')
  canvas.className = 'juice-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  c2d = canvas.getContext('2d')
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
    c2d?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)
  return Boolean(c2d)
}

function cssColor(name, fallback) {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function palette() {
  return [
    cssColor('--accent', '#2843c4'),
    cssColor('--good', '#2b6e36'),
    cssColor('--warn', '#b07812'),
    cssColor('--stamp', '#bf3a2c'),
    cssColor('--mem-steady', '#2c6f73'),
    '#f5c542'
  ]
}

function step() {
  if (!c2d) return
  c2d.clearRect(0, 0, canvas.width, canvas.height)
  particles = particles.filter((p) => p.life > 0)
  for (const p of particles) {
    p.vx *= p.drag
    p.vy = p.vy * p.drag + p.gravity
    p.x += p.vx
    p.y += p.vy
    p.rot += p.spin
    p.life -= 1
    const alpha = Math.min(1, p.life / 24)
    c2d.save()
    c2d.globalAlpha = alpha
    c2d.translate(p.x, p.y)
    c2d.rotate(p.rot)
    c2d.fillStyle = p.color
    if (p.shape === 'rect') c2d.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
    else if (p.shape === 'star') {
      c2d.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = (i * 4 * Math.PI) / 5 - Math.PI / 2
        c2d.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size)
      }
      c2d.closePath()
      c2d.fill()
    } else {
      c2d.beginPath()
      c2d.arc(0, 0, p.size / 2, 0, Math.PI * 2)
      c2d.fill()
    }
    c2d.restore()
  }
  frame = particles.length ? requestAnimationFrame(step) : 0
  if (!particles.length) c2d.clearRect(0, 0, canvas.width, canvas.height)
}

/**
 * Burst particles from a point (viewport coordinates).
 * kind: 'sparks' (small, quick, radial), 'confetti' (paper, falls), 'stars'.
 */
export function burst(x, y, { kind = 'sparks', count = 18, colors, power = 1 } = {}) {
  if (effectsLevel() !== 'full' || !ensureCanvas()) return
  const list = colors || palette()
  for (let i = 0; i < count; i++) {
    const angle = kind === 'confetti' ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2
    const speed = (kind === 'confetti' ? 7 + Math.random() * 7 : 2 + Math.random() * 4.5) * power
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: kind === 'sparks' ? 0.08 : 0.22,
      drag: kind === 'sparks' ? 0.92 : 0.975,
      size: kind === 'confetti' ? 7 + Math.random() * 6 : kind === 'stars' ? 4 + Math.random() * 4 : 3 + Math.random() * 3,
      color: list[i % list.length],
      shape: kind === 'confetti' ? 'rect' : kind === 'stars' ? 'star' : 'dot',
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      life: kind === 'sparks' ? 34 + Math.random() * 16 : 80 + Math.random() * 40
    })
  }
  if (!frame) frame = requestAnimationFrame(step)
}

function centerOf(el) {
  if (!el?.getBoundingClientRect) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

export function burstFrom(el, options) {
  if (typeof window === 'undefined') return
  const { x, y } = centerOf(el)
  burst(x, y, options)
}

/** Full-screen confetti from both bottom corners. */
export function celebrate({ big = false } = {}) {
  if (effectsLevel() !== 'full' || typeof window === 'undefined') return
  const w = window.innerWidth
  const h = window.innerHeight
  const count = big ? 70 : 40
  burst(w * 0.15, h * 0.95, { kind: 'confetti', count, power: big ? 1.3 : 1.1 })
  burst(w * 0.85, h * 0.95, { kind: 'confetti', count, power: big ? 1.3 : 1.1 })
  if (big) setTimeout(() => burst(w / 2, h * 0.4, { kind: 'stars', count: 30, power: 1.5 }), 250)
}

// ---- DOM effects ------------------------------------------------------------------

/** Float a short label (like "+12 XP") up from an element. */
export function floatText(el, text, { tone = 'accent' } = {}) {
  if (effectsLevel() === 'off' || typeof document === 'undefined') return
  const { x, y } = centerOf(el)
  const node = document.createElement('div')
  node.className = `juice-float tone-${tone}`
  node.textContent = text
  node.style.left = `${x}px`
  node.style.top = `${y}px`
  node.setAttribute('aria-hidden', 'true')
  document.body.appendChild(node)
  setTimeout(() => node.remove(), 1100)
}

/** Brief horizontal shake, for a wrong answer. */
export function shake(el) {
  if (effectsLevel() !== 'full' || !el?.animate) return
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
    { duration: 360, easing: 'ease-out' }
  )
}

/** A quick scale pop with a glow ring, for a correct choice or a completed task. */
export function pop(el) {
  if (effectsLevel() === 'off' || !el?.animate) return
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'cubic-bezier(.3,1.6,.5,1)' })
}

// ---- One-call feedback bundles ---------------------------------------------------

/** Right answer: chime, sparks from the element, a pop. Combos get louder and bigger. */
export function feedbackCorrect(el, { combo = 0, xp = null } = {}) {
  sfx.correct(combo)
  pop(el)
  burstFrom(el, { kind: combo >= 5 ? 'stars' : 'sparks', count: Math.min(14 + combo * 4, 40), power: 1 + Math.min(combo, 6) * 0.08 })
  if (xp) floatText(el, `+${xp} XP`, { tone: 'good' })
}

export function feedbackWrong(el) {
  sfx.wrong()
  shake(el)
}

/** A finished goal: lab check, activity goal, lesson check. */
export function feedbackSuccess(el, label) {
  sfx.success()
  pop(el)
  burstFrom(el, { kind: 'stars', count: 22 })
  if (label) floatText(el, label, { tone: 'good' })
}

/** A finished session, quiz, lab or path stage. */
export function feedbackComplete({ big = false } = {}) {
  sfx.complete()
  celebrate({ big })
}
