import { chromium } from 'playwright'
import { readdirSync, writeFileSync } from 'node:fs'
const out = process.argv[2]
const fixtures = readdirSync('fixtures').filter((f) => f.endsWith('.zip') && !f.startsWith('s13-')).sort()
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
const res = {}
for (const f of fixtures) {
  const p = await ctx.newPage()
  try {
    await p.goto(`http://localhost:5190/?load=/fixtures/${encodeURIComponent(f)}`, { waitUntil: 'domcontentloaded' })
    await p.waitForFunction(() => document.querySelector('.stage__foot') || document.querySelector('.intake__error'), null, { timeout: 90000 }); await p.waitForTimeout(2500)
    res[f] = await p.evaluate(() => window.__us?.baseline?.cfg?.cPrimary ?? 'refused')
  } catch (e) { res[f] = 'timeout' }
  await p.close()
}
await b.close(); writeFileSync(out, JSON.stringify(res, null, 1))
