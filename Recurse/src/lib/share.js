// Downloadable artifacts: JSON exports, a progress card and a mastery certificate.
// Both images are drawn as library catalog cards (cardstock, red heading rule, blue
// ruled lines, a rubber stamp) with fixed colors so they look the same in any theme.

const PAPER = '#f2eee4'
const CARD = '#fdfbf6'
const INK = '#1c1a15'
const MUTED = '#6b6558'
const RULE = '#e1dacb'
const RULE_RED = '#d65f4b'
const RULE_BLUE = '#d3dff0'
const ACCENT = '#2843c4'
const STAMP = '#bf3a2c'

const SERIF = '"Instrument Serif", Georgia, serif'
const SANS = '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif'
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace'

function saveBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadJSON(filename, data) {
  saveBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
}

function canvas(width, height) {
  const el = document.createElement('canvas')
  const scale = 2
  el.width = width * scale
  el.height = height * scale
  const ctx = el.getContext('2d')
  ctx.scale(scale, scale)
  return { el, ctx }
}

/** The nested-card mark on a cobalt square. */
function drawMark(ctx, x, y, size) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 32, size / 32)
  ctx.fillStyle = ACCENT
  ctx.beginPath()
  ctx.roundRect(0, 0, 32, 32, 7)
  ctx.fill()
  ctx.strokeStyle = CARD
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(6, 6, 20, 20, 3)
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(12.5, 12.5, 11.5, 11.5, 2.5)
  ctx.stroke()
  ctx.fillStyle = CARD
  ctx.beginPath()
  ctx.roundRect(17.5, 17.5, 4.5, 4.5, 1.5)
  ctx.fill()
  ctx.restore()
}

/** Desk background, a card with a shadow and a second card peeking out behind it. */
function drawCard(ctx, x, y, w, h) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.fillStyle = 'rgba(28, 26, 21, 0.10)'
  ctx.beginPath()
  ctx.roundRect(x + 4, y + 12, w, h, 10)
  ctx.fill()
  for (const offset of [12, 6]) {
    ctx.fillStyle = CARD
    ctx.strokeStyle = '#c9bfab'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x + offset, y + offset, w, h, 10)
    ctx.fill()
    ctx.stroke()
  }
  ctx.fillStyle = CARD
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 10)
  ctx.fill()
  ctx.stroke()
}

function drawStamp(ctx, text, cx, cy, color = STAMP, angle = -0.06) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.font = `700 15px ${MONO}`
  const w = ctx.measureText(text).width + 28
  const h = 34
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, 5)
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 3)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 1)
  ctx.restore()
}

async function fontsReady() {
  try {
    await document.fonts?.ready
  } catch {
    // Fall back to system fonts.
  }
}

const monoLabel = (ctx, text, x, y, color = MUTED) => {
  ctx.fillStyle = color
  ctx.font = `600 12px ${MONO}`
  ctx.fillText(text.toUpperCase(), x, y)
}

/** Shareable summary: level, streak, reviews, memory, and the strongest topics. */
export async function downloadProgressCard({ name, level, streak, reviews, accuracy, memory, topics }) {
  await fontsReady()
  const W = 1000
  const H = 580
  const { el, ctx } = canvas(W, H)
  const x = 40
  const y = 36
  const w = W - 92
  const h = H - 96
  drawCard(ctx, x, y, w, h)

  drawMark(ctx, x + 36, y + 30, 30)
  ctx.fillStyle = INK
  ctx.font = `400 30px ${SERIF}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Recurse', x + 78, y + 55)
  ctx.textAlign = 'right'
  monoLabel(ctx, new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }), x + w - 36, y + 50)
  ctx.textAlign = 'left'
  ctx.strokeStyle = RULE_RED
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y + 80)
  ctx.lineTo(x + w, y + 80)
  ctx.stroke()

  ctx.fillStyle = INK
  ctx.font = `400 58px ${SERIF}`
  ctx.fillText(name ? `${name}’s progress` : 'My progress', x + 36, y + 150)

  const metrics = [
    ['Level', String(level)],
    ['Reviews', reviews.toLocaleString()],
    ['Accuracy', `${accuracy}%`],
    ['Memory', memory === null ? '—' : `${Math.round(memory * 100)}%`]
  ]
  metrics.forEach(([label, value], i) => {
    const mx = x + 36 + i * 170
    monoLabel(ctx, label, mx, y + 200)
    ctx.fillStyle = INK
    ctx.font = `400 46px ${SERIF}`
    ctx.fillText(value, mx, y + 246)
    if (i) {
      ctx.strokeStyle = RULE
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(mx - 18, y + 184)
      ctx.lineTo(mx - 18, y + 252)
      ctx.stroke()
    }
  })
  drawStamp(ctx, `${streak}-DAY STREAK`, x + w - 130, y + 222)

  monoLabel(ctx, 'Strongest topics', x + 36, y + 302)
  topics.slice(0, 4).forEach((topic, i) => {
    const ty = y + 322 + i * 34
    ctx.strokeStyle = RULE_BLUE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x + 36, ty + 26)
    ctx.lineTo(x + w - 36, ty + 26)
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.font = `500 17px ${SANS}`
    ctx.fillText(topic.name, x + 36, ty + 18)
    ctx.fillStyle = '#e8e2d4'
    ctx.fillRect(x + 380, ty + 8, 420, 8)
    ctx.fillStyle = ACCENT
    ctx.fillRect(x + 380, ty + 8, Math.max(6, (topic.mastery / 100) * 420), 8)
    ctx.fillStyle = INK
    ctx.font = `700 14px ${MONO}`
    ctx.textAlign = 'right'
    ctx.fillText(`${topic.mastery}%`, x + w - 36, ty + 18)
    ctx.textAlign = 'left'
  })
  if (!topics.length) {
    ctx.fillStyle = MUTED
    ctx.font = `400 17px ${SANS}`
    ctx.fillText('Just getting started.', x + 36, y + 342)
  }
  el.toBlob((blob) => blob && saveBlob('recurse-progress.png', blob))
}

export async function downloadCertificate({ name, topic, mastery, callNumber = '' }) {
  await fontsReady()
  const W = 1200
  const H = 820
  const { el, ctx } = canvas(W, H)
  const x = 60
  const y = 50
  const w = W - 132
  const h = H - 120
  drawCard(ctx, x, y, w, h)

  // Catalog card heading line, ruled in red, and blue lines below.
  monoLabel(ctx, callNumber || 'Recurse', x + 48, y + 52, INK)
  ctx.textAlign = 'right'
  monoLabel(ctx, 'Certificate of mastery', x + w - 48, y + 52)
  ctx.textAlign = 'left'
  ctx.strokeStyle = RULE_RED
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y + 78)
  ctx.lineTo(x + w, y + 78)
  ctx.stroke()
  ctx.strokeStyle = RULE_BLUE
  ctx.lineWidth = 1.2
  for (let ly = y + 130; ly < y + h - 40; ly += 44) {
    ctx.beginPath()
    ctx.moveTo(x + 24, ly)
    ctx.lineTo(x + w - 24, ly)
    ctx.stroke()
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = MUTED
  ctx.font = `400 26px ${SERIF}`
  ctx.fillText('This card certifies that', W / 2 - 6, y + 208)
  ctx.fillStyle = INK
  ctx.font = `italic 400 64px ${SERIF}`
  ctx.fillText(name || 'a dedicated learner', W / 2 - 6, y + 290, w - 120)
  ctx.fillStyle = MUTED
  ctx.font = `400 26px ${SERIF}`
  ctx.fillText('has mastered', W / 2 - 6, y + 350)
  ctx.fillStyle = INK
  ctx.font = `400 92px ${SERIF}`
  ctx.fillText(topic, W / 2 - 6, y + 456, w - 120)
  ctx.fillStyle = MUTED
  ctx.font = `400 19px ${SANS}`
  ctx.fillText(`${mastery}% mastery, earned through spaced, active recall practice.`, W / 2 - 6, y + 512, w - 120)

  ctx.textAlign = 'left'
  drawMark(ctx, x + 48, y + h - 92, 40)
  ctx.fillStyle = INK
  ctx.font = `400 30px ${SERIF}`
  ctx.fillText('Recurse', x + 100, y + h - 63)
  drawStamp(ctx, `MASTERED ${new Date().toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()}`, x + w - 200, y + h - 74)

  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  el.toBlob((blob) => blob && saveBlob(`recurse-${slug}-certificate.png`, blob))
}
