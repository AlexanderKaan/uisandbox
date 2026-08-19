import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 200)) })
p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)))
await p.goto('http://localhost:5190/?load=/fixtures/s10-Skeleton.zip', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('.stage__foot', { timeout: 60000 })
await p.evaluate(() => window.__us.dispatch({ type: 'SET', patch: { cPrimary: '#e11d48' } })); await p.waitForTimeout(1200)
const hash = await p.evaluate(() => location.hash); console.log('hash', hash.slice(0, 80), hash.length)
await p.goto('http://localhost:5190/?load=/fixtures/s10-Skeleton.zip' + hash, { waitUntil: 'domcontentloaded' })
try { await p.waitForSelector('.stage__foot', { timeout: 30000 }); console.log('loaded WITH hash ok; brand', await p.evaluate(() => window.__us.cfg.cPrimary), 'hash now', (await p.evaluate(() => location.hash)).length) }
catch { console.log('NOT loaded with hash; body:', (await p.evaluate(() => document.body.innerText)).slice(0, 400)) }
await b.close()
