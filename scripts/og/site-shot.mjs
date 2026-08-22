// Screenshots of the live landing for the OG proposal: `node scripts/og/site-shot.mjs <outdir> [base]`
import { chromium } from 'playwright'
import { join } from 'node:path'
const out = process.argv[2], base = process.argv[3] ?? 'http://localhost:5190'
const b = await chromium.launch()
// A: the hero, light, 1440 wide
const p = await b.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, colorScheme: 'light' })
await p.goto(base, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
await p.screenshot({ path: join(out, 'site-hero-light.png'), clip: { x: 0, y: 0, width: 1440, height: 960 } })
// B: OG 1200×630 — the hero composed tight: a 1200-wide viewport, crop from under the top bar
const og = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' })
await og.goto(base, { waitUntil: 'networkidle' }); await og.waitForTimeout(1500)
await og.addStyleTag({ content: '.app__topbar{display:none!important}.intake{padding-top:34px!important}' })
await og.waitForTimeout(300)
await og.screenshot({ path: join(out, 'og-from-site-light.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } })
// C: the same in dark
const d = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
await d.goto(base, { waitUntil: 'networkidle' }); await d.waitForTimeout(1500)
await d.addStyleTag({ content: '.app__topbar{display:none!important}.intake{padding-top:34px!important}' })
await d.waitForTimeout(300)
await d.screenshot({ path: join(out, 'og-from-site-dark.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } })
await b.close(); console.log('ok')
