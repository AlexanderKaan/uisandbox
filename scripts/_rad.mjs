import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
await p.goto('http://localhost:5190/?load=/fixtures/s15-hover-fx.zip', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('.stage__foot', { timeout: 90000 }); await p.waitForTimeout(2000)
const info = await p.evaluate(() => {
  const u = window.__us
  const radii = u.project.table.ofKind('radius').map((e) => ({ v: e.value, n: e.count, sites: e.sites.slice(0, 2).map((s) => s.prop + '@' + (s.selector || '').slice(0, 40)) }))
  const d = document.querySelector('.stage__iframe').contentDocument
  const btn = d.querySelector('a[class*=hvr], .button, a.button')
  return { radii, btnCls: btn?.className, btnRad: btn ? d.defaultView.getComputedStyle(btn).borderTopLeftRadius : null }
})
console.log(JSON.stringify(info, null, 1).slice(0, 1500))
await p.evaluate(() => window.__us.dispatch({ type: 'SET', patch: { radius: 2 } })); await p.waitForTimeout(900)
console.log('after x2:', await p.evaluate(() => { const d = document.querySelector('.stage__iframe').contentDocument; const btn = d.querySelector('a[class*=hvr], .button, a.button'); return d.defaultView.getComputedStyle(btn).borderTopLeftRadius }))
await b.close()
