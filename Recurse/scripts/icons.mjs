// Renders the PNG app icons in public/ from the brand mark. Usage: npm run icons
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))

// Maskable icons need the artwork inside the central 80% safe zone on a full-bleed background.
const mark = ({ size, maskable }) => {
  const inset = maskable ? size * 0.18 : 0
  const inner = size - inset * 2
  const radius = maskable ? 0 : size * 0.28
  return `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#12805c"/>
  <g transform="translate(${inset} ${inset}) scale(${inner / 32})">
    <path d="M22.6 11.2A8 8 0 1 0 24 16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M24.8 7.6v4.6h-4.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="16" cy="16" r="2.6" fill="#fff"/>
  </g>
</svg></body></html>`
}

const targets = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'pwa-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true }
]

const browser = await chromium.launch()
for (const target of targets) {
  const page = await browser.newPage({ viewport: { width: target.size, height: target.size } })
  await page.setContent(mark(target))
  await page.locator('svg').screenshot({ path: join(publicDir, target.file), omitBackground: !target.maskable })
  await page.close()
  console.log(`  public/${target.file}`)
}
await browser.close()
