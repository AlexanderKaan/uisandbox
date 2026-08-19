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
