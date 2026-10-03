// Captures the README screenshots from a production build with realistic demo data,
// and fails if any page throws. Usage: npm run build && npm run screenshots
// Requires a Playwright Chromium build (npx playwright install chromium).
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { Rating, schedule } from '../src/lib/memory.js'
import { dayKey } from '../src/lib/dates.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'docs', 'screenshots')
const port = 4179
const base = `http://localhost:${port}`
mkdirSync(outDir, { recursive: true })

// ---- Demo data -----------------------------------------------------------------
const packs = Object.fromEntries(
  readdirSync(join(root, 'src/data/packs')).map((f) => {
    const pack = JSON.parse(readFileSync(join(root, 'src/data/packs', f), 'utf8'))
    return [pack.id, pack]
  })
)

let seed = 42
const rand = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

function studyHistory(reviews, now) {
  // Replay a few reviews per card so stability and due dates look lived-in.
  let card = null
  let at = new Date(now.getTime() - reviews.daysAgo * 86400000)
  for (let i = 0; i < reviews.count; i++) {
    const rating = rand() < reviews.missRate ? Rating.Again : rand() < 0.2 ? Rating.Easy : Rating.Good
    card = schedule(card, rating, { now: at, fuzz: false })
    const next = new Date(card.due)
    if (next > now) break
    at = new Date(next.getTime() + rand() * 86400000)
    if (at > now) break
  }
  return card
}

function demoData() {
  const now = new Date()
  const plan = {
    'python-basics': { share: 1, daysAgo: 60, count: 6, missRate: 0.1, lesson: true },
    'loops-functions': { share: 0.9, daysAgo: 40, count: 5, missRate: 0.15, lesson: true },
    'git-basics': { share: 1, daysAgo: 50, count: 6, missRate: 0.1, lesson: true },
    'spanish-basics': { share: 0.8, daysAgo: 30, count: 4, missRate: 0.2, lesson: true },
    'algebra-essentials': { share: 0.7, daysAgo: 25, count: 4, missRate: 0.25, lesson: true },
    'learning-science': { share: 1, daysAgo: 45, count: 5, missRate: 0.1, lesson: true },
    'networking-basics': { share: 0.5, daysAgo: 20, count: 3, missRate: 0.3, lesson: true },
    'world-geography': { share: 0.6, daysAgo: 15, count: 3, missRate: 0.2, lesson: false }
  }
  const progress = {}
  for (const [id, p] of Object.entries(plan)) {
    const pack = packs[id]
    const cards = {}
    const mistakes = {}
    pack.questions.slice(0, Math.round(pack.questions.length * p.share)).forEach((q, i) => {
      const card = studyHistory({ ...p, daysAgo: p.daysAgo - (i % 5) }, now)
      if (card) cards[q.id] = card
      if (card?.lapses && rand() < 0.4) mistakes[q.id] = { date: new Date(now.getTime() - rand() * 5 * 86400000).toISOString(), given: '', count: card.lapses }
    })
    const checks = Object.fromEntries((pack.lesson.sections || []).map((_, i) => [i, true]).filter(() => p.lesson))
    progress[id] = { cards, mistakes, lessonRead: p.lesson, checks, feynman: [], lastStudied: new Date(now.getTime() - rand() * 2 * 86400000).toISOString() }
  }
  const days = {}
  let totalReviews = 0
  for (let i = 0; i < 300; i++) {
    if (rand() < (i < 70 ? 0.85 : 0.35)) {
      const reviews = Math.round(5 + rand() * 40)
      totalReviews += reviews
      days[dayKey(new Date(now.getTime() - i * 86400000))] = { reviews, correct: Math.round(reviews * 0.86), newCards: Math.round(reviews * 0.2), seconds: reviews * 14, xp: reviews * 11 }
    }
  }
  for (let i = 0; i < 12; i++) days[dayKey(new Date(now.getTime() - i * 86400000))] ||= { reviews: 18, correct: 15, newCards: 4, seconds: 260, xp: 190 }
  const stats = {
    xp: 18450,
    totalReviews,
    totalCorrect: Math.round(totalReviews * 0.86),
    totalSeconds: totalReviews * 14,
    byType: { mcq: { total: 1820, correct: 1601 }, 'code-fill': { total: 410, correct: 347 }, debug: { total: 380, correct: 301 }, typed: { total: 940, correct: 771 }, recall: { total: 260, correct: 238 } },
    days,
    streak: 12,
    longestStreak: 31,
    lastStudyDay: dayKey(now),
    sessions: [],
    achievements: ['First Blood', 'Centurion', 'Thousand', 'Streak Week', 'Iron Mind', 'Debugger', 'Memory Palace', 'Relearner', 'Scholar', 'Polyglot', 'Polymath', 'Feynman', 'Mastered'],
    feynmanCount: 4
  }
  const user = { name: 'Sam', interests: ['programming', 'languages', 'math'], onboardingComplete: true, createdAt: now.toISOString() }
  return { progress, stats, user }
}

// ---- Server --------------------------------------------------------------------
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
const stop = () => server.kill()
process.on('exit', stop)
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(base)).ok) break
  } catch {
    await new Promise((r) => setTimeout(r, 200))
  }
}

// ---- Capture -------------------------------------------------------------------
const errors = []
const browser = await chromium.launch()
const data = demoData()

async function open({ width = 1280, height = 820, theme = 'light', mobile = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, colorScheme: theme })
  await context.addInitScript(([d, t]) => {
    if (localStorage.getItem('recurse_version')) return
    localStorage.setItem('recurse_version', '2')
    localStorage.setItem('recurse_progress', JSON.stringify(d.progress))
    localStorage.setItem('recurse_stats', JSON.stringify(d.stats))
    localStorage.setItem('recurse_user', JSON.stringify(d.user))
    localStorage.setItem('recurse_settings', JSON.stringify({ theme: t }))
  }, [data, theme])
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`))
  return page
}

async function shot(page, name, { full = false } = {}) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: full })
  console.log(`  ${name}.png`)
}

async function answerCurrent(page, correct = true) {
  const choices = page.locator('.choice:not([disabled])')
  if (await choices.count()) {
    await choices.nth(correct ? 0 : 1).click()
  } else if (await page.locator('.typed-form input').count()) {
    await page.fill('.typed-form input', 'not sure')
    await page.keyboard.press('Enter')
  } else {
    await page.getByRole('button', { name: /Show answer/ }).click()
  }
}

console.log('Capturing screenshots')
let page = await open()
await page.goto(`${base}/`)
await shot(page, 'today')
await page.goto(`${base}/library`)
await shot(page, 'library')
await page.goto(`${base}/topic/python-basics`)
await shot(page, 'topic')
await page.goto(`${base}/topic/algebra-essentials/lesson#section-2`)
await page.waitForTimeout(300)
const check = page.locator('#section-2 .lesson-check')
await check.locator('.choice').first().click()
await check.scrollIntoViewIfNeeded()
await page.evaluate(() => window.scrollBy(0, -260))
await shot(page, 'lesson')
await page.goto(`${base}/stats`)
await shot(page, 'progress')
await page.goto(`${base}/create`)
await page.fill('#p-name', 'Organic chemistry')
await shot(page, 'create')
await page.context().close()

page = await open({ theme: 'dark' })
await page.goto(`${base}/study/practice/javascript-basics`)
await page.waitForTimeout(300)
await shot(page, 'study-dark')
// Find a choice question with code for the feedback shot.
for (let i = 0; i < 12; i++) {
  const hasCode = await page.locator('.study-card .code').count()
  const isChoice = await page.locator('.choice:not([disabled])').count()
  if (hasCode && isChoice) break
  await answerCurrent(page)
  if (await page.getByRole('button', { name: /^Continue/ }).count()) await page.getByRole('button', { name: /^Continue/ }).click()
  else await page.locator('.grade-good').click()
  await page.waitForTimeout(150)
}
await answerCurrent(page, true)
await page.waitForTimeout(500)
await page.evaluate(() => window.scrollTo(0, 0))
await shot(page, 'feedback-dark')
await page.goto(`${base}/`)
await shot(page, 'today-dark')
await page.context().close()

page = await open({ width: 390, height: 844, mobile: true })
await page.goto(`${base}/`)
await shot(page, 'mobile-today')
await page.goto(`${base}/study/review`)
await page.waitForTimeout(300)
await page.evaluate(() => window.scrollTo(0, 0))
await shot(page, 'mobile-study')
await page.context().close()

await browser.close()
stop()
if (errors.length) {
  console.error('\nPage errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log(`\nSaved to ${outDir}`)
