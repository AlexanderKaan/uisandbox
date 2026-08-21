import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
const fixtures = readdirSync('fixtures').filter((f) => f.startsWith('s16-') && f.endsWith('.zip')).sort()
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
for (const f of fixtures) {
  const p = await ctx.newPage()
  try {
    await p.goto(`http://localhost:5190/?load=/fixtures/${encodeURIComponent(f)}`, { waitUntil: 'domcontentloaded' })
    await p.waitForFunction(() => document.querySelector('.stage__foot') || document.querySelector('.intake__error'), null, { timeout: 150000 })
    const err = await p.$('.intake__error')
    if (err) { console.log(f, 'REFUSED:', (await err.textContent()).slice(0, 140)); await p.close(); continue }
    await p.waitForTimeout(1500)
    const info = await p.evaluate(() => { const u = window.__us; const c = u.baseline.cfg; const notes = Array.from(document.querySelectorAll('.popcard li')).map((l) => l.textContent).filter((t) => /Brand|Fonts/.test(t)); return { brand: c.cPrimary, body: c.fontBody, display: c.fontDisplay, notes } })
    console.log(f, JSON.stringify(info))
    await p.evaluate(() => { document.querySelectorAll('.popcard button').forEach((b) => { if (/^Close$/.test(b.textContent || '')) b.click() }) })
    await p.screenshot({ path: `.holdouts/bf-${f.replace('.zip', '')}.png` })
  } catch (e) { console.log(f, 'ERR', String(e).slice(0, 100)) }
  await p.close()
}
await b.close()
