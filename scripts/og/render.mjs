// Renders public/og.png (1200×630), icon-512.png and apple-touch-icon.png (180)
// from the HTML templates beside this file. `node scripts/og/render.mjs`.
import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', '..', 'public')
const b = await chromium.launch()
const og = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await og.goto('file://' + join(here, 'og.html')); await og.waitForTimeout(800)
await og.screenshot({ path: join(out, 'og.png') })
const icon = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
await icon.goto('file://' + join(here, 'icon.html'))
await icon.screenshot({ path: join(out, 'icon-512.png'), omitBackground: true })
const touch = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 180 / 512 })
await touch.goto('file://' + join(here, 'icon.html'))
await touch.screenshot({ path: join(out, 'apple-touch-icon.png') })
await b.close()
console.log('wrote og.png, icon-512.png, apple-touch-icon.png')
