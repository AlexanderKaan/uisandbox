// A before/after of one build, side by side, for a post:
//   node scripts/og/before-after.mjs <out.png> <?load= url> ['{"cPrimary":"#e11d48"}'] [base]
//
// Shoots the FRAME, not the tool: a "show a build" picture is about the build.
// Before is the baseline the app read from the code, after is the same screen
// with the patch applied, so the two differ only by what was turned.
import { chromium } from 'playwright'
const [out, load, patchJson = '{}', base = 'http://localhost:5190'] = process.argv.slice(2)
if (!out || !load) { console.error('usage: before-after.mjs <out.png> <load-url> [patch] [base]'); process.exit(2) }

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' })
await p.goto(`${base}/?load=${encodeURIComponent(load)}`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('.stage__foot', { timeout: 180000 })
await p.waitForTimeout(6000)
// The notes card sits over the stage on load.
await p.evaluate(() => { const c = document.querySelector('.popcard'); const b = c && [...c.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Close'); if (b) b.click() })
await p.waitForTimeout(400)

const shot = async () => (await p.locator('.stage__frame').screenshot()).toString('base64')
const before = await shot()
const applied = await p.evaluate((patch) => {
  const u = window.__us
  if (!u) return null
  const { sb = {}, ...rest } = patch
  u.dispatch({ type: 'SET', patch: { ...rest, sb: { ...u.cfg.sb, ...sb } } })
  return true
}, JSON.parse(patchJson))
if (!applied) { console.error('no dev hook on that base — run against the dev server'); process.exit(1) }
await p.waitForTimeout(2500)
const after = await shot()

// Compose: two frames, one label each, on the site's own canvas colour.
const page = await b.newPage({ viewport: { width: 1600, height: 620 }, deviceScaleFactor: 2 })
await page.setContent(`<style>
  body{margin:0;background:#f4f5f8;font:600 13px/1.4 Inter,system-ui,sans-serif;color:#6b6b73}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px}
  figure{margin:0}
  img{width:100%;display:block;border:1px solid #e3e5ea;border-radius:10px}
  figcaption{padding:8px 2px 0}
</style><div class="row">
  <figure><img src="data:image/png;base64,${before}"><figcaption>Before: as it ships</figcaption></figure>
  <figure><img src="data:image/png;base64,${after}"><figcaption>After: brand to crimson, radius x1.6</figcaption></figure>
</div>`)
await page.waitForTimeout(500)
await page.locator('.row').screenshot({ path: out })
await b.close()
console.log('wrote', out)
