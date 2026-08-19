// The launch montage: 16 hold-out builds, each as loaded → a brand theme → Shuffle (three stills per site); brand/marketing/README.md says how it is cut.
import { chromium } from 'playwright'
const list = [
  ['bootstrap-53','violet'], ['s11-vitepress','ember'], ['startbootstrap-sb-admin-2-master','teal'], ['s12-material-tailwind-dashboard-react','rose'],
  ['s12-vue-element-admin','coral'], ['s9-spectrum','indigo'], ['s8-NES.css','jade'], ['astro-dist','sky'], ['next-out','ember'], ['s12-visx','cobalt'],
  ['groove-dist','violet'], ['startbootstrap-agency-master','sky'], ['s11-metro','indigo'], ['s8-anime','rose'], ['s7-50projects50days','teal'], ['s12-sveltekit-static','coral'],
]
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
let i = 0
for (const [f, theme] of list) {
  i++; const p = await ctx.newPage(); const tag = String(i).padStart(2, '0')
  try {
    await p.goto(`http://localhost:5190/?load=/fixtures/${encodeURIComponent(f + '.zip')}`, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('.stage__foot', { timeout: 90000 }); await p.waitForTimeout(2500)
    const cl = p.locator('.popcard button:has-text("Close")'); if (await cl.count()) await cl.first().click()
    await p.waitForTimeout(400)
    await p.screenshot({ path: `.holdouts/montage/${tag}-${f}-a.png` })
    await p.evaluate((t) => window.__us.dispatch({ type: 'APPLY_COLOR_THEME', id: t }), theme); await p.waitForTimeout(1000)
    await p.screenshot({ path: `.holdouts/montage/${tag}-${f}-b.png` })
    await p.click('.panel__shuffle'); await p.waitForTimeout(1100)
    await p.screenshot({ path: `.holdouts/montage/${tag}-${f}-c.png` })
    console.log('ok', f)
  } catch (e) { console.log(f, 'ERR', String(e).slice(0, 80)) }
  await p.close()
}
await b.close()
