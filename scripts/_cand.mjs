import { chromium } from 'playwright'
const list = ['bootstrap-53','s11-vitepress','s12-material-tailwind-dashboard-react','s12-vue-element-admin','s9-spectrum','s8-NES.css','startbootstrap-agency-master','startbootstrap-sb-admin-2-master','s8-reveal.js','s11-material-components-web','astro-dist','next-out','s11-open-props','groove-dist','s12-visx']
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
for (const f of list) {
  const p = await ctx.newPage()
  try {
    await p.goto(`http://localhost:5190/?load=/fixtures/${encodeURIComponent(f + '.zip')}`, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('.stage__foot', { timeout: 90000 }); await p.waitForTimeout(2500)
    const cl = p.locator('.popcard button:has-text("Close")'); if (await cl.count()) await cl.first().click()
    await p.waitForTimeout(300)
    const info = await p.evaluate(() => { const u = window.__us; return { brand: u.baseline.cfg.cPrimary, entries: u.project.table.entries.length, screens: u.project.screens.length, foot: document.querySelector('.stage__foot')?.textContent?.replace(/\s+/g, ' ') } })
    console.log(f, JSON.stringify(info))
    await p.screenshot({ path: `.holdouts/cand-${f}.png` })
  } catch (e) { console.log(f, 'ERR', String(e).slice(0, 80)) }
  await p.close()
}
await b.close()
