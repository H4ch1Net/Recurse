// Renders the PNG app icons in public/ from the brand mark. Usage: npm run icons
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))

// Maskable icons need the artwork inside the central 80% safe zone on a full-bleed background.
const mark = ({ size, maskable }) => {
  // The nested-card mark on a cobalt field. Maskable icons keep it inside the safe zone.
  const inset = maskable ? size * 0.14 : 0
  const scale = (size - inset * 2) / 32
  const radius = maskable ? 0 : size * 0.22
  return `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#2843c4"/>
  <g transform="translate(${inset} ${inset}) scale(${scale})">
    <rect x="6" y="6" width="20" height="20" rx="3" fill="none" stroke="#fdfbf6" stroke-width="2"/>
    <rect x="12.5" y="12.5" width="11.5" height="11.5" rx="2.5" fill="none" stroke="#fdfbf6" stroke-width="2"/>
    <rect x="17.5" y="17.5" width="4.5" height="4.5" rx="1.5" fill="#fdfbf6"/>
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
