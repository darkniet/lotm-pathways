// Screenshots the running dev server with Playwright and fails on any console or page error.
//   npm run dev            (in another terminal)
//   node scripts/shoot.mjs screen1|screen2|reduced|all
// Env: BASE_URL (default http://localhost:5173/), SHOTS_DIR (default ./shots)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = process.env.SHOTS_DIR ?? 'shots'
const which = process.argv[2] ?? 'screen1'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const errors = []
const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

async function openPage(opts, label, { enter = true } = {}) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] console: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`))
  await page.goto(BASE)
  if (enter) await enterExplorer(page)
  return page
}
/** Leave the title screen. */
const enterExplorer = (page) => page.getByRole('button', { name: 'Explore the pathways' }).click({ force: true })
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) }).then(() => console.log(`  ${name}.png`))
const ready = (page) => page.waitForFunction(() => window.__explorerReady === true, null, { timeout: 60_000 })
const wait = (page, ms) => page.waitForTimeout(ms)
const emblem = (page, name) => page.locator(`button[aria-label^="${name} pathway"]`)

async function screen1() {
  console.log('screen1')
  const p = await openPage(DESKTOP, 'desktop', { enter: false })
  await wait(p, 3500)
  await shot(p, 's0-title')
  await enterExplorer(p)
  await wait(p, 600)
  await shot(p, 's0-enter-mid')
  await wait(p, 1700)
  await shot(p, 's1-intro-mid')
  await ready(p)
  await p.mouse.move(4, 4)
  await wait(p, 900)
  await shot(p, 's1-settled')
  const box = await emblem(p, 'Fool').boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await wait(p, 900)
  await shot(p, 's1-hover-fool')
  await p.mouse.move(5, 5)
  await p.keyboard.press('Tab')
  await p.keyboard.press('Tab')
  await wait(p, 700)
  await shot(p, 's1-focus')
  await p.context().close()

  const m = await openPage(MOBILE, 'mobile', { enter: false })
  await wait(m, 3500)
  await shot(m, 's0-title-mobile')
  await enterExplorer(m)
  await ready(m)
  await wait(m, 500)
  await shot(m, 's1-mobile-top')
  await m.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await wait(m, 1200)
  await shot(m, 's1-mobile-bottom')
  await m.context().close()
}

async function screen2() {
  console.log('screen2')
  const p = await openPage(DESKTOP, 'desktop')
  await ready(p)
  await emblem(p, 'Fool').click({ force: true })
  await wait(p, 300)
  await shot(p, 's2-fly-300')
  await wait(p, 600)
  await shot(p, 's2-fly-900')
  await wait(p, 1600)
  await shot(p, 's2-seq9')
  for (let i = 0; i < 4; i++) {
    await p.keyboard.press('ArrowUp')
    await wait(p, 450)
  }
  await wait(p, 900)
  await shot(p, 's2-seq5')
  await p.getByRole('tab', { name: 'Advancement' }).click()
  await wait(p, 500)
  await shot(p, 's2-seq5-advancement')
  await p.getByRole('tab', { name: 'Potion & characteristic' }).click()
  await wait(p, 500)
  await shot(p, 's2-seq5-lore')
  await p.getByRole('tab', { name: 'Abilities' }).click()
  await p.keyboard.press('End')
  await wait(p, 1600)
  await shot(p, 's2-seq0')
  await p.locator('button[aria-label^="Switch to Error"]').click()
  await wait(p, 220)
  await shot(p, 's2-swap-mid')
  await wait(p, 1200)
  await shot(p, 's2-swap-done')
  await p.keyboard.press('Escape')
  await wait(p, 650)
  await shot(p, 's2-back-mid')
  await wait(p, 1800)
  await shot(p, 's2-back-done')
  await p.context().close()

  const m = await openPage(MOBILE, 'mobile')
  await ready(m)
  await emblem(m, 'Sun').click({ force: true })
  await wait(m, 2600)
  await shot(m, 's2-mobile-seq9')
  await m.evaluate(() => window.__explorer.getState().setSeq(4))
  await wait(m, 1500)
  await shot(m, 's2-mobile-seq4')
  await m.getByRole('button', { name: 'Read the full record' }).click()
  await wait(m, 600)
  await shot(m, 's2-mobile-sheet')
  await m.context().close()
}

async function reduced() {
  console.log('reduced')
  const p = await openPage({ ...DESKTOP, reducedMotion: 'reduce' }, 'reduced')
  await ready(p)
  await shot(p, 'r-starfield')
  await emblem(p, 'Moon').click({ force: true })
  await wait(p, 220)
  await shot(p, 'r-fade-mid')
  await wait(p, 900)
  await shot(p, 'r-pathway')
  await p.context().close()
}

try {
  if (which === 'screen1' || which === 'all') await screen1()
  if (which === 'screen2' || which === 'all') await screen2()
  if (which === 'reduced' || which === 'all') await reduced()
} finally {
  await browser.close()
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):\n${errors.join('\n')}`)
  process.exit(1)
}
console.log('no console errors')
