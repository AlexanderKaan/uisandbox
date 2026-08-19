// The OG image from the LIVE landing (hero + door, zoomed to fit 1200×630), light and dark:
//   node scripts/og/site-shot2.mjs <outdir> [base]   then copy og-B2-light.png → public/og.png
import { chromium } from 'playwright'
import { join } from 'node:path'
const out = process.argv[2], base = process.argv[3] ?? 'http://localhost:5190'
const b = await chromium.launch()
const CSS = '.app__topbar{display:none!important}.intake{padding-top:28px!important}.hero__kicker{margin-top:0!important}.foot{display:none!important}.landing{display:none!important}'
// B2: zoomed to 0.78 so hero + drop zone fit in 1200×630
for (const scheme of ['light', 'dark']) {
  const p = await b.newPage({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2, colorScheme: scheme })
  await p.goto(base, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  await p.addStyleTag({ content: CSS + '.intake{zoom:.78}' })
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(out, `og-B2-${scheme}.png`), clip: { x: 0, y: 0, width: 1200, height: 630 } })
}
await b.close(); console.log('ok')
