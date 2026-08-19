import { chromium } from 'playwright'
const list = process.argv.slice(2)
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
for (const f of list) {
  const p = await ctx.newPage()
  await p.goto(`http://localhost:5190/?load=/fixtures/${encodeURIComponent(f)}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => document.querySelector('.stage__foot') || document.querySelector('.intake__error'), null, { timeout: 150000 })
  const err = await p.$('.intake__error')
  console.log(f, err ? 'REFUSED: ' + (await err.textContent()).slice(0, 170) : 'LOADED: ' + (await p.textContent('.stage__foot')).replace(/\s+/g, ' ').slice(0, 80))
  await p.close()
}
await b.close()
