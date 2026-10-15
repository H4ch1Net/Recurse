// Small synthesized sound effects. Web Audio only, no audio files, so they work offline
// and add nothing to the bundle. Every call is a no-op when sound is off or the browser
// has no AudioContext. Notes come from a major pentatonic scale so anything played in a
// row (a combo, an arpeggio) sounds pleasant.

let ctx = null
let master = null
let enabled = false
let volume = 0.6

const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]

export function configureSound({ on, level } = {}) {
  if (on !== undefined) enabled = Boolean(on)
  if (level !== undefined) volume = Math.max(0, Math.min(1, Number(level) || 0))
  if (master) master.gain.value = volume * 0.5
}

export function soundEnabled() {
  return enabled && volume > 0
}

function audio() {
  if (!soundEnabled() || typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  try {
    if (!ctx) {
      ctx = new AudioCtx()
      master = ctx.createGain()
      master.gain.value = volume * 0.5
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** One enveloped oscillator note. `at` is seconds from now. */
function note(ac, freq, { at = 0, dur = 0.14, type = 'sine', gain = 0.35, glide = null, attack = 0.008 } = {}) {
  const t = ac.currentTime + at
  const osc = ac.createOscillator()
  const env = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + dur)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(env).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/** A short burst of filtered noise, for soft percussive sounds. */
function noise(ac, { at = 0, dur = 0.06, gain = 0.12, freq = 2400 } = {}) {
  const t = ac.currentTime + at
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const env = ac.createGain()
  src.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = freq
  env.gain.value = gain
  src.connect(filter).connect(env).connect(master)
  src.start(t)
}

const play = (fn) => (...args) => {
  const ac = audio()
  if (ac) fn(ac, ...args)
}

export const sfx = {
  /** Bright two-note chime. Climbs the scale as the combo grows. */
  correct: play((ac, combo = 0) => {
    const step = Math.min(combo, SCALE.length - 3)
    note(ac, SCALE[step], { dur: 0.12, type: 'triangle', gain: 0.32 })
    note(ac, SCALE[step + 2], { at: 0.07, dur: 0.22, type: 'sine', gain: 0.3 })
    if (combo >= 4) note(ac, SCALE[step + 2] * 2, { at: 0.12, dur: 0.18, type: 'sine', gain: 0.08 })
  }),
  /** Soft, low and forgiving. Missing a card is part of learning, not a failure buzzer. */
  wrong: play((ac) => {
    note(ac, 196, { dur: 0.2, type: 'triangle', gain: 0.28, glide: 146.83 })
    noise(ac, { dur: 0.05, gain: 0.05, freq: 600 })
  }),
  tap: play((ac) => noise(ac, { dur: 0.025, gain: 0.08, freq: 3200 })),
  pop: play((ac) => note(ac, 660, { dur: 0.08, type: 'sine', gain: 0.22, glide: 990 })),
  flip: play((ac) => {
    noise(ac, { dur: 0.08, gain: 0.07, freq: 1800 })
    note(ac, 440, { at: 0.02, dur: 0.1, type: 'sine', gain: 0.12, glide: 660 })
  }),
  tick: play((ac) => note(ac, 1200, { dur: 0.03, type: 'square', gain: 0.04 })),
  /** Keyboard-like click for console typing. */
  key: play((ac) => noise(ac, { dur: 0.018, gain: 0.05, freq: 4200 })),
  error: play((ac) => {
    note(ac, 220, { dur: 0.09, type: 'square', gain: 0.07 })
    note(ac, 207.65, { at: 0.1, dur: 0.12, type: 'square', gain: 0.07 })
  }),
  /** Rising arpeggio for a finished step, check or lab task. */
  success: play((ac) => {
    ;[0, 2, 4].forEach((i, n) => note(ac, SCALE[i], { at: n * 0.06, dur: 0.16, type: 'triangle', gain: 0.26 }))
  }),
  /** Bigger fanfare for a finished session, lab or quiz. */
  complete: play((ac) => {
    ;[0, 2, 4, 5].forEach((i, n) => note(ac, SCALE[i], { at: n * 0.09, dur: 0.22, type: 'triangle', gain: 0.28 }))
    note(ac, SCALE[7], { at: 0.4, dur: 0.6, type: 'sine', gain: 0.24 })
    note(ac, SCALE[4], { at: 0.4, dur: 0.6, type: 'sine', gain: 0.14 })
  }),
  levelUp: play((ac) => {
    ;[0, 2, 4, 5, 7, 9].forEach((i, n) => note(ac, SCALE[i], { at: n * 0.07, dur: 0.2, type: 'triangle', gain: 0.25 }))
    note(ac, SCALE[9], { at: 0.45, dur: 0.8, type: 'sine', gain: 0.2 })
  }),
  achievement: play((ac) => {
    note(ac, SCALE[4], { dur: 0.18, type: 'sine', gain: 0.25 })
    note(ac, SCALE[7], { at: 0.12, dur: 0.5, type: 'sine', gain: 0.25 })
    note(ac, SCALE[9], { at: 0.12, dur: 0.5, type: 'sine', gain: 0.1 })
  })
}
