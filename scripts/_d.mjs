import { chromium } from 'playwright'
const f = process.argv[2]
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
await p.goto(`http://localhost:5190/?load=/fixtures/${encodeURIComponent(f)}`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('.stage__foot', { timeout: 150000 }); await p.waitForTimeout(2000)
await p.evaluate(() => { const c = Array.from(document.querySelectorAll('.stage__foot .chip')); c.find((x) => /Check 1:1/.test(x.textContent || '')).click() })
await p.waitForFunction(() => /✓|✗|⚠/.test(document.querySelector('.verify[aria-label="1:1 check"]')?.textContent || ''), null, { timeout: 150000 })
const html = await p.$eval('.verify[aria-label="1:1 check"]', (e) => e.innerHTML)
console.log(html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').slice(0, 1800))
await b.close()
