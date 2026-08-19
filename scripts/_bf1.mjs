import { chromium } from 'playwright'
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
for (const f of process.argv.slice(2)) {
  const p = await ctx.newPage()
  await p.goto(`http://localhost:5190/?load=/fixtures/${encodeURIComponent(f)}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => document.querySelector('.stage__foot') || document.querySelector('.intake__error'), null, { timeout: 150000 }); await p.waitForTimeout(2500)
  if (await p.$('.intake__error')) { console.log(f, 'REFUSED'); await p.close(); continue }
  console.log(f, await p.evaluate(() => { const c = window.__us.baseline.cfg; return `${c.cPrimary} body=${c.fontBody} display=${c.fontDisplay}` }))
  await p.close()
}
await b.close()
