// The demo clip for launch posts: home → a sample build → Brand twice → Radius → Check 1:1. Records a webm; cut to mp4/gif with ffmpeg (see brand/marketing/README.md).
import { chromium } from 'playwright'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, recordVideo: { dir: '.holdouts/gif', size: { width: 1280, height: 800 } } })
const p = await ctx.newPage()
const t = []; const mark = (n) => t.push([n, Date.now()])
await p.goto('http://localhost:5190/', { waitUntil: 'networkidle' }); await p.waitForTimeout(300)
mark('start'); await p.waitForTimeout(1200)
await p.click('.intake__sample >> nth=1'); mark('click-sample')
await p.waitForSelector('.stage__foot', { timeout: 120000 }); await p.waitForTimeout(900); const cl = p.locator('.popcard button:has-text("Close"), .card button:has-text("Close")'); if (await cl.count()) await cl.first().click(); await p.waitForTimeout(1200); mark('stage')
// Brand row → open → pick a theme
await p.click('.fmrow:has-text("Brand")'); await p.waitForTimeout(700); mark('brand-open')
const items = p.locator('.menu__item.fmopt'); const n = await items.count(); console.log('themes', n)
await items.nth(Math.min(2, n - 1)).click(); await p.waitForTimeout(1500); mark('brand-1')
await p.click('.fmrow:has-text("Brand")'); await p.waitForTimeout(500)
await items.nth(Math.min(5, n - 1)).click(); await p.waitForTimeout(1500); mark('brand-2')
// Radius
await p.click('.fmrow:has-text("Radius")'); await p.waitForTimeout(600)
const radiusOpts = p.locator('.fmrow--open .menu__item, .fmrow--open .fmopt'); if (await radiusOpts.count()) { await radiusOpts.last().click(); await p.waitForTimeout(1200) } else { await p.keyboard.press('Escape') }
mark('radius')
// Check 1:1
await p.click('.stage__foot .chip:has-text("Check 1:1")'); await p.waitForFunction(() => /verified|differs|unmeasured/.test(document.querySelector('.stage__foot')?.textContent || ''), null, { timeout: 60000 }); await p.waitForTimeout(1800); mark('verified')
console.log(JSON.stringify(t.map(([n, ts], i) => [n, ((ts - t[0][1]) / 1000).toFixed(1)])))
const v = p.video(); await ctx.close(); console.log('video', await v.path()); await b.close()
