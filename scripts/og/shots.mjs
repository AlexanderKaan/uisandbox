// Landing-page screenshots from the real app on the in-repo acme fixture:
// public/shot-stage.png (stage + knobs, a knob turned) and public/shot-verify.png (the 1:1 card).
import { chromium } from 'playwright'
const base = process.argv[2] ?? 'http://localhost:5190'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await p.goto(`${base}/?load=/fixtures/acme-dist.zip`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('.stage__foot', { timeout: 60000 }); await p.waitForTimeout(2500)
// close the notes card, turn Brand via the row so the page shows a change
await p.evaluate(() => { document.querySelectorAll('.popcard button').forEach((b) => { if (/^Close$/.test(b.textContent || '')) b.click() }) })
await p.evaluate(() => { const rows = Array.from(document.querySelectorAll('.fmrow')); const brand = rows.find((x) => /^Brand/.test(x.textContent || '')); (brand.querySelector('button') || brand).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
await p.waitForTimeout(300)
await p.evaluate(() => { const inp = document.querySelector('.fmrow__colorinput'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(inp, '#e11d48'); inp.dispatchEvent(new Event('input', { bubbles: true })) })
await p.waitForTimeout(800)
await p.screenshot({ path: 'public/shot-stage.png', clip: { x: 0, y: 0, width: 1440, height: 900 } })
// the 1:1 check
await p.evaluate(() => { document.querySelectorAll('.fmrow__pop button').forEach(() => {}); document.body.click() })
await p.evaluate(() => { const c = document.querySelectorAll('.stage__foot .chip'); c[c.length - 1].click() })
await p.waitForFunction(() => /✓|✗/.test(document.querySelector('.verify[aria-label="1:1 check"]')?.textContent || ''), null, { timeout: 60000 })
await p.waitForTimeout(300)
const card = await p.$('.verify[aria-label="1:1 check"]')
const box = await card.boundingBox()
await p.screenshot({ path: 'public/shot-verify.png', clip: { x: box.x - 16, y: box.y - 16, width: box.width + 32, height: box.height + 32 } })
await b.close(); console.log('wrote shot-stage.png, shot-verify.png')

// --- The other two artefacts in "Honest by construction": the reach card and a refusal at the door.
{
  const b2 = await chromium.launch(); const p2 = await b2.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await p2.goto(`${base}/?load=/fixtures/acme-dist.zip`, { waitUntil: 'domcontentloaded' })
  await p2.waitForSelector('.stage__foot', { timeout: 60000 }); await p2.waitForTimeout(2000)
  await p2.evaluate(() => { document.querySelectorAll('.popcard button').forEach((b) => { if (/^Close$/.test(b.textContent || '')) b.click() }) })
  await p2.click('.stage__foot .chip:has-text("reach")'); await p2.waitForTimeout(400)
  const bb = await (await p2.$('.popcard')).boundingBox()
  await p2.screenshot({ path: 'public/shot-reach.png', clip: { x: bb.x - 14, y: bb.y - 14, width: bb.width + 28, height: bb.height + 28 } })
  await p2.setViewportSize({ width: 900, height: 900 })
  await p2.goto(`${base}/?load=/fixtures/twentytwentyfour-trunk.zip`, { waitUntil: 'domcontentloaded' })
  await p2.waitForSelector('.intake__error', { timeout: 60000 }); await p2.waitForTimeout(300)
  const err = p2.locator('.intake__error'); await err.scrollIntoViewIfNeeded(); await err.screenshot({ path: 'public/shot-refusal.png' })
  await b2.close(); console.log('wrote shot-reach.png, shot-refusal.png')
}
