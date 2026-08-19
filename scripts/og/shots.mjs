// Landing-page screenshots from the real app, in BOTH colour schemes (the page
// follows the visitor's scheme, so its pictures do too): public/shot-stage.png
// (stage + knobs, Brand turned), shot-verify.png (the 1:1 card), shot-reach.png
// (the reach card), shot-refusal.png (a refusal at the door) — and the same
// four as *-dark.png.   node scripts/og/shots.mjs [base]
import { chromium } from 'playwright'
const base = process.argv[2] ?? 'http://localhost:5190'
const b = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const sfx = scheme === 'dark' ? '-dark' : ''
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme })
  const p = await ctx.newPage()
  const closeCards = () => p.evaluate(() => { document.querySelectorAll('.popcard button, .verify button').forEach((b) => { if (/^Close$/.test(b.textContent || '')) b.click() }) })
  await p.goto(`${base}/?load=/fixtures/acme-dist.zip`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('.stage__foot', { timeout: 60000 }); await p.waitForTimeout(2500)
  await closeCards()
  // Brand → crimson via the row
  await p.evaluate(() => { const rows = Array.from(document.querySelectorAll('.fmrow')); const brand = rows.find((x) => /^Brand/.test(x.textContent || '')); (brand.querySelector('button') || brand).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await p.waitForTimeout(300)
  await p.evaluate(() => { const inp = document.querySelector('.fmrow__colorinput'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(inp, '#e11d48'); inp.dispatchEvent(new Event('input', { bubbles: true })) })
  await p.waitForTimeout(800)
  await p.screenshot({ path: `public/shot-stage${sfx}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } })
  await p.evaluate(() => document.body.click())
  // the 1:1 card
  await p.evaluate(() => { const c = document.querySelectorAll('.stage__foot .chip'); const k = Array.from(c).find((x) => /Check 1:1/.test(x.textContent || '')); k.click() })
  await p.waitForFunction(() => /✓|✗/.test(document.querySelector('.verify[aria-label="1:1 check"]')?.textContent || ''), null, { timeout: 60000 }); await p.waitForTimeout(300)
  await p.locator('.verify[aria-label="1:1 check"]').screenshot({ path: `public/shot-verify${sfx}.png` })
  await closeCards(); await p.waitForTimeout(200)
  // the reach card
  await p.click('.stage__foot .chip:has-text("reach")'); await p.waitForTimeout(400)
  await p.locator('.popcard').screenshot({ path: `public/shot-reach${sfx}.png` })
  // a refusal at the door
  await p.setViewportSize({ width: 900, height: 900 })
  await p.goto(`${base}/?load=/fixtures/twentytwentyfour-trunk.zip`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('.intake__error', { timeout: 60000 }); await p.waitForTimeout(300)
  const err = p.locator('.intake__error'); await err.scrollIntoViewIfNeeded(); await err.screenshot({ path: `public/shot-refusal${sfx}.png` })
  await ctx.close(); console.log(`wrote ${scheme}: shot-stage, shot-verify, shot-reach, shot-refusal`)
}
await b.close()
