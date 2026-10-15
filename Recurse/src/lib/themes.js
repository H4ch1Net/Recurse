// Color themes and accent colors. Theme palettes live in CSS (styles/themes.css) keyed by
// data-theme; this module lists them for the settings screen and computes accent colors.
// Accents are generated in OKLCH so any hue keeps the same perceived lightness, and so
// text in the accent color stays readable on both light and dark cards.

export const THEMES = [
  { id: 'light', label: 'Paper', mode: 'light', blurb: 'Warm cardstock and ink', swatch: ['#f2eee4', '#fdfbf6', '#2843c4', '#1c1a15'] },
  { id: 'dark', label: 'Ink', mode: 'dark', blurb: 'The library after hours', swatch: ['#14130f', '#1c1a16', '#8fa1ff', '#ece6d8'] },
  { id: 'midnight', label: 'Midnight', mode: 'dark', blurb: 'Deep navy, cool blue', swatch: ['#0b1020', '#121a2e', '#7c9cff', '#e6eaf5'] },
  { id: 'terminal', label: 'Terminal', mode: 'dark', blurb: 'Green phosphor console', swatch: ['#070a08', '#0c120e', '#3ddc84', '#d4f7dd'] },
  { id: 'nebula', label: 'Nebula', mode: 'dark', blurb: 'Violet night sky', swatch: ['#120d1e', '#1a1429', '#b794f6', '#ede8fb'] },
  { id: 'forest', label: 'Forest', mode: 'dark', blurb: 'Moss and pine', swatch: ['#0e1511', '#141e18', '#79d39b', '#e4efe7'] },
  { id: 'sakura', label: 'Sakura', mode: 'light', blurb: 'Blossom pink', swatch: ['#fbf0f2', '#fffafb', '#c2185b', '#2b1a20'] },
  { id: 'solar', label: 'Solar', mode: 'light', blurb: 'Solarized cream', swatch: ['#fdf6e3', '#fffcf2', '#1d6aa5', '#073642'] },
  { id: 'ocean', label: 'Ocean', mode: 'light', blurb: 'Sea glass and teal', swatch: ['#edf4f7', '#fbfdfe', '#0a6f94', '#10222b'] },
  { id: 'contrast', label: 'High contrast', mode: 'dark', blurb: 'Maximum legibility', swatch: ['#000000', '#0a0a0a', '#ffd60a', '#ffffff'] }
]

export const THEME_MAP = Object.fromEntries(THEMES.map((t) => [t.id, t]))

// Hue in OKLCH degrees.
export const ACCENTS = [
  { id: 'cobalt', label: 'Cobalt', hue: 268 },
  { id: 'violet', label: 'Violet', hue: 300 },
  { id: 'magenta', label: 'Magenta', hue: 340 },
  { id: 'crimson', label: 'Crimson', hue: 22 },
  { id: 'orange', label: 'Orange', hue: 50 },
  { id: 'amber', label: 'Amber', hue: 80 },
  { id: 'lime', label: 'Lime', hue: 125 },
  { id: 'emerald', label: 'Emerald', hue: 155 },
  { id: 'teal', label: 'Teal', hue: 190 },
  { id: 'sky', label: 'Sky', hue: 235 }
]

/** The theme actually shown: "system" follows the device's light or dark preference. */
export function resolveTheme(setting, systemDark = false) {
  if (THEME_MAP[setting]) return THEME_MAP[setting]
  return THEME_MAP[systemDark ? 'dark' : 'light']
}

/** Hue for an accent setting: a preset id, a number, or null for the theme's own accent. */
export function accentHue(accent) {
  if (accent === null || accent === undefined || accent === 'theme') return null
  const preset = ACCENTS.find((a) => a.id === accent)
  if (preset) return preset.hue
  const n = Number(accent)
  return Number.isFinite(n) ? ((n % 360) + 360) % 360 : null
}

const fmt = (l, c, h, alpha) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)}${alpha === undefined ? '' : ` / ${alpha}`})`

/**
 * CSS custom properties for an accent hue in a light or dark theme. Yellow-green hues
 * are perceptually lighter, so light themes darken them further to keep text contrast.
 */
export function accentVars(hue, mode) {
  if (hue === null) return null
  const yellowish = hue > 60 && hue < 140
  if (mode === 'dark') {
    return {
      '--accent': fmt(0.78, 0.14, hue),
      '--accent-hover': fmt(0.84, 0.12, hue),
      '--accent-text': fmt(0.82, 0.12, hue),
      '--on-accent': fmt(0.2, 0.05, hue),
      '--focus': fmt(0.78, 0.14, hue),
      '--info': fmt(0.78, 0.14, hue)
    }
  }
  const l = yellowish ? 0.46 : 0.5
  return {
    '--accent': fmt(l, 0.17, hue),
    '--accent-hover': fmt(l - 0.06, 0.17, hue),
    '--accent-text': fmt(l - 0.05, 0.16, hue),
    '--on-accent': '#ffffff',
    '--focus': fmt(l, 0.17, hue),
    '--info': fmt(l, 0.17, hue)
  }
}

export const ACCENT_VAR_NAMES = ['--accent', '--accent-hover', '--accent-text', '--on-accent', '--focus', '--info']

/** Browser chrome color for the theme (the <meta name="theme-color"> value). */
export function chromeColor(theme) {
  return theme.swatch[0]
}
