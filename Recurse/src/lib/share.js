// Downloadable artifacts: JSON exports, a progress card and a mastery certificate.
// Images are drawn on a canvas with fixed colors so they look the same in any theme.

const PAPER = '#f7f6f2'
const INK = '#1b1a17'
const MUTED = '#6b665b'
const ACCENT = '#12805c'

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

function drawMark(ctx, x, y, size) {
  const s = size / 32
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = ACCENT
  ctx.beginPath()
  ctx.roundRect(0, 0, 32, 32, 9)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D('M22.6 11.2A8 8 0 1 0 24 16'))
  ctx.stroke(new Path2D('M24.8 7.6v4.6h-4.6'))
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(16, 16, 2.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

async function fontsReady() {
  try {
    await document.fonts?.ready
  } catch {
    // Fall back to system fonts.
  }
}

/** Shareable summary: streak, reviews, memory, and the strongest topics. */
export async function downloadProgressCard({ name, level, streak, reviews, accuracy, memory, topics }) {
  await fontsReady()
  const { el, ctx } = canvas(1000, 560)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, 1000, 560)
  drawMark(ctx, 56, 52, 36)
  ctx.fillStyle = INK
  ctx.font = '600 22px "JetBrains Mono Variable", monospace'
  ctx.fillText('recurse', 104, 78)
  ctx.fillStyle = MUTED
  ctx.font = '16px "Inter Variable", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 944, 78)
  ctx.textAlign = 'left'

  ctx.fillStyle = INK
  ctx.font = '600 44px "Fraunces Variable", Georgia, serif'
  ctx.fillText(name ? `${name}’s progress` : 'My progress', 56, 156)

  const metrics = [
    ['Level', String(level)],
    ['Day streak', String(streak)],
    ['Reviews', reviews.toLocaleString()],
    ['Accuracy', `${accuracy}%`],
    ['Memory', memory === null ? '—' : `${Math.round(memory * 100)}%`]
  ]
  metrics.forEach(([label, value], i) => {
    const x = 56 + i * 180
    ctx.fillStyle = MUTED
    ctx.font = '600 13px "Inter Variable", sans-serif'
    ctx.fillText(label.toUpperCase(), x, 214)
    ctx.fillStyle = INK
    ctx.font = '600 36px "Fraunces Variable", Georgia, serif'
    ctx.fillText(value, x, 256)
  })

  ctx.fillStyle = MUTED
  ctx.font = '600 13px "Inter Variable", sans-serif'
  ctx.fillText('STRONGEST TOPICS', 56, 320)
  topics.slice(0, 4).forEach((topic, i) => {
    const y = 348 + i * 46
    ctx.fillStyle = INK
    ctx.font = '500 18px "Inter Variable", sans-serif'
    ctx.fillText(topic.name, 56, y + 14)
    ctx.fillStyle = '#e8e5dd'
    ctx.beginPath()
    ctx.roundRect(400, y, 460, 14, 7)
    ctx.fill()
    ctx.fillStyle = ACCENT
    ctx.beginPath()
    ctx.roundRect(400, y, Math.max(14, (topic.mastery / 100) * 460), 14, 7)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.font = '600 15px "JetBrains Mono Variable", monospace'
    ctx.fillText(`${topic.mastery}%`, 880, y + 13)
  })
  if (!topics.length) {
    ctx.fillStyle = MUTED
    ctx.font = '16px "Inter Variable", sans-serif'
    ctx.fillText('Just getting started.', 56, 362)
  }
  el.toBlob((blob) => blob && saveBlob('recurse-progress.png', blob))
}

export async function downloadCertificate({ name, topic, mastery }) {
  await fontsReady()
  const { el, ctx } = canvas(1200, 850)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, 1200, 850)
  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 3
  ctx.strokeRect(32, 32, 1136, 786)
  ctx.strokeStyle = '#d8d3c6'
  ctx.lineWidth = 1
  ctx.strokeRect(44, 44, 1112, 762)

  drawMark(ctx, 568, 110, 64)
  ctx.textAlign = 'center'
  ctx.fillStyle = MUTED
  ctx.font = '600 16px "Inter Variable", sans-serif'
  ctx.fillText('CERTIFICATE OF MASTERY', 600, 240)
  ctx.fillStyle = INK
  ctx.font = '600 64px "Fraunces Variable", Georgia, serif'
  ctx.fillText(topic, 600, 330, 1000)
  ctx.fillStyle = MUTED
  ctx.font = '22px "Inter Variable", sans-serif'
  ctx.fillText('This certifies that', 600, 410)
  ctx.fillStyle = INK
  ctx.font = 'italic 600 44px "Fraunces Variable", Georgia, serif'
  ctx.fillText(name || 'A dedicated learner', 600, 470, 1000)
  ctx.fillStyle = MUTED
  ctx.font = '22px "Inter Variable", sans-serif'
  ctx.fillText(`reached ${mastery}% mastery through spaced, active recall practice.`, 600, 530, 1000)

  ctx.font = '16px "Inter Variable", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 96, 740)
  ctx.textAlign = 'right'
  ctx.fillStyle = INK
  ctx.font = '600 18px "JetBrains Mono Variable", monospace'
  ctx.fillText('recurse', 1104, 740)
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  el.toBlob((blob) => blob && saveBlob(`recurse-${slug}-certificate.png`, blob))
}
