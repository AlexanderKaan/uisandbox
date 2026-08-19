#!/usr/bin/env node
/**
 * The hold-out regression runner: every fixture zip through the real app in a
 * real browser — load, "Check 1:1", reach — and a verdict per fixture against
 * `scripts/holdouts.expect.json`.
 *
 *   pnpm holdouts                 all fixtures, own dev server on :5199
 *   pnpm holdouts -- --only s11   a subset (substring of the file name)
 *   pnpm holdouts -- --record     write the current verdicts as the expectations
 *   pnpm holdouts -- --base http://localhost:5190   use a running server
 *   pnpm holdouts -- --base https://uisandbox.org
 *                                 the live site (fixtures served by the test browser itself)
 *   pnpm holdouts -- --base http://localhost:5191 --fixtures http://localhost:5190/fixtures
 *                                 a production preview, fixtures from the dev server
 *
 * The verdict is what the app itself says: `ok` (1:1 verified), `differs`
 * (mismatches — a rewriter gap), `refused` (the check declined: worker gone,
 * page left), `unmeasured` (shell), `no-load` (intake refused the archive),
 * `timeout`. Fixtures are gitignored (notes/decisions.md says where each came
 * from); the expectations file is not — it is the record of what held.
 *
 * Exit 1 when any fixture expected `ok` is not `ok` — that is the regression.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const only = opt('--only', '')
const record = args.includes('--record')
const baseArg = opt('--base', '')
// Where the fixture zips are served from — the app origin by default (the dev
// server serves /fixtures); a production build or the live site has none, so
// point at a dev server (CORS is on) with --fixtures http://localhost:5190/fixtures
const fixturesBase = opt('--fixtures', '')
const perFixtureMs = Number(opt('--timeout', '150000'))
const expectPath = join(root, 'scripts', 'holdouts.expect.json')
const outDir = join(root, '.holdouts')
mkdirSync(outDir, { recursive: true })

const fixtures = readdirSync(join(root, 'fixtures')).filter((f) => f.endsWith('.zip') && f.includes(only)).sort()
if (!fixtures.length) { console.error('no fixtures match'); process.exit(2) }

let server = null
let base = baseArg
if (!base) {
  const port = 5199
  server = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  base = `http://localhost:${port}`
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite did not start')), 30000)
    server.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); setTimeout(resolve, 500) } })
    server.stderr.on('data', () => {})
    server.on('exit', (c) => reject(new Error(`vite exited ${c}`)))
  })
}

let browser = await chromium.launch()
let context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
// Against an https site (a production build, the live site) the fixtures are
// served by the TEST BROWSER itself on a fictitious https origin, with CORS —
// no mixed content, no local-network request, nothing outside this process.
const FIX_ORIGIN = 'https://fixtures.uisandbox.invalid'
const routed = /^https:/.test(base) && !fixturesBase
// A route answer travels through the DevTools protocol in one message: 90 MB
// killed the browser. Larger fixtures are skipped against an https target
// (they are measured against a local server; the verdict says so).
const ROUTE_MAX = 64 * 1024 * 1024
async function installRoute(ctx) {
  await ctx.route(`${FIX_ORIGIN}/**`, async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1))
    const file = join(root, 'fixtures', name)
    if (!existsSync(file)) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'no such fixture' })
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/zip', 'access-control-allow-origin': '*' }, body: readFileSync(file) })
  })
}
if (routed) await installRoute(context)
const results = []
const t0 = Date.now()

for (const [i, f] of fixtures.entries()) {
  const started = Date.now()
  const r = { fixture: f, verdict: 'timeout', paired: 0, reach: '', note: '' }
  if (routed && statSync(join(root, 'fixtures', f)).size > ROUTE_MAX) {
    r.verdict = 'skipped'; r.note = `${Math.round(statSync(join(root, 'fixtures', f)).size / 1024 / 1024)} MB — too large to serve from the test browser; measured against a local server only`
    results.push(r); log(r, i); continue
  }
  // A crashed browser (a huge page) must not end the run: relaunch and go on.
  if (!browser.isConnected()) {
    browser = await chromium.launch(); context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    if (routed) await installRoute(context)
  }
  const page = await context.newPage()
  try {
    const zipUrl = routed ? `${FIX_ORIGIN}/${encodeURIComponent(f)}` : fixturesBase ? `${fixturesBase.replace(/\/$/, '')}/${encodeURIComponent(f)}` : `/fixtures/${encodeURIComponent(f)}`
    await page.goto(`${base}/?load=${encodeURIComponent(zipUrl)}&r=${i}`, { waitUntil: 'domcontentloaded' })
    // Loaded, or refused at the door.
    const state = await page.waitForFunction(() => {
      const err = document.querySelector('.intake__error')
      if (err) return { refused: err.textContent }
      // The stage foot exists only once a project is loaded (no dev-only hook needed:
      // the runner must measure a production build the same way).
      if (document.querySelector('.stage__foot')) return { loaded: true }
      return null
    }, null, { timeout: perFixtureMs }).then((h) => h.jsonValue())
    if (state.refused) { r.verdict = 'no-load'; r.note = String(state.refused).slice(0, 160); results.push(r); await page.close(); log(r, i); continue }
    await page.waitForTimeout(2500)
    // Check 1:1 — the last chip in the foot.
    await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.stage__foot .chip')); (c.find((x) => /Check 1:1|1:1 /.test(x.textContent || '')) ?? c[c.length - 1]).click() })
    const verifyText = await page.waitForFunction(() => {
      // The 1:1 card specifically — a warning card shares the .verify class.
      const v = document.querySelector('.verify[aria-label="1:1 check"]')
      const t = v ? v.textContent || '' : ''
      return /✓|✗|⚠|shell|not what your users/.test(t) ? t : null
    }, null, { timeout: perFixtureMs }).then((h) => h.jsonValue())
    const foot = await page.evaluate(() => (document.querySelector('.stage__foot')?.textContent || '').replace(/\s+/g, ' '))
    const paired = Number((verifyText.match(/(\d[\d,]*) elements paired/) || [])[1]?.replace(/,/g, '') || 0)
    r.paired = paired
    r.reach = (foot.match(/reach \d+% colours · \d+% type · \d+% radii(?: · \d+ outside)?/) || [''])[0].trim()
    if (/✓/.test(verifyText)) r.verdict = 'ok'
    else if (/✗/.test(verifyText)) { r.verdict = 'differs'; r.note = (verifyText.match(/✗[^\n]{0,200}/) || [''])[0] }
    else if (/⚠/.test(verifyText)) { r.verdict = 'refused'; r.note = (verifyText.match(/⚠[^\n]{0,200}/) || [''])[0] }
    else r.verdict = 'unmeasured'
    const warn = await page.evaluate(() => Array.from(document.querySelectorAll('.popcard--low h3')).map((h) => h.textContent).join(' · '))
    if (warn) r.note = (r.note ? r.note + ' — ' : '') + warn
    // The host must come through untouched: same origin, our own title, our
    // worker still registered (a hostile build tries all three — fixtures/sec-*).
    const host = await page.evaluate(async () => ({ origin: location.origin, title: document.title, regs: (await navigator.serviceWorker.getRegistrations()).length }))
    if (host.regs !== 1) { r.verdict = 'host-tampered'; r.note = `${host.regs} worker(s) registered` }
    else if (!host.title.startsWith('UISandbox')) r.note = (r.note ? r.note + ' — ' : '') + `host DOM touched by the page (title "${host.title}") — same-origin by design, see notes/security.md`
  } catch (e) {
    let url = ''
    try { url = page.url() } catch { url = '' }
    if (url && !url.startsWith(base)) { r.verdict = 'host-tampered'; r.note = `navigated away to ${url.slice(0, 80)}` }
    else { r.verdict = /Timeout/i.test(String(e)) ? 'timeout' : 'error'; r.note = String(e).split('\n')[0].slice(0, 160) }
  }
  r.ms = Date.now() - started
  results.push(r)
  log(r, i)
  try { await page.close() } catch { /* browser gone; relaunched next round */ }
}

await browser.close()
if (server) server.kill()

function log(r, i) {
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`${pad(i + 1, 3)} ${pad(r.fixture, 44)} ${pad(r.verdict, 11)} ${pad(r.paired, 6)} ${pad(r.reach, 44)} ${r.note || ''}`)
}

// Expectations: the verdict each fixture is held to.
let expect = {}
if (existsSync(expectPath)) expect = JSON.parse(readFileSync(expectPath, 'utf8'))
if (record) {
  for (const r of results) expect[r.fixture] = r.verdict
  writeFileSync(expectPath, JSON.stringify(Object.fromEntries(Object.entries(expect).sort()), null, 2) + '\n')
  console.log(`\nrecorded ${results.length} expectations → scripts/holdouts.expect.json`)
}
const regressions = results.filter((r) => expect[r.fixture] === 'ok' && r.verdict !== 'ok' && r.verdict !== 'skipped')
const unknown = results.filter((r) => !(r.fixture in expect))

const md = [
  `# Hold-outs — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  '',
  `${results.length} fixtures in ${Math.round((Date.now() - t0) / 1000)} s · ok ${results.filter((r) => r.verdict === 'ok').length} · differs ${results.filter((r) => r.verdict === 'differs').length} · refused ${results.filter((r) => r.verdict === 'refused').length} · unmeasured ${results.filter((r) => r.verdict === 'unmeasured').length} · no-load ${results.filter((r) => r.verdict === 'no-load').length} · timeout/error ${results.filter((r) => r.verdict === 'timeout' || r.verdict === 'error').length}`,
  '',
  '| # | fixture | verdict | paired | reach | note |',
  '|---|---|---|---|---|---|',
  ...results.map((r, i) => `| ${i + 1} | ${r.fixture} | ${r.verdict}${expect[r.fixture] && expect[r.fixture] !== r.verdict ? ` (expected ${expect[r.fixture]})` : ''} | ${r.paired} | ${r.reach} | ${(r.note || '').replace(/\|/g, '/')} |`),
]
writeFileSync(join(outDir, 'latest.md'), md.join('\n') + '\n')
writeFileSync(join(outDir, 'latest.json'), JSON.stringify(results, null, 2) + '\n')

console.log(`\n${md[2]}`)
if (unknown.length) console.log(`${unknown.length} fixture(s) without an expectation (run with --record to hold them): ${unknown.map((r) => r.fixture).join(', ')}`)
if (regressions.length) {
  console.log(`\nREGRESSION — expected ok, got:`)
  for (const r of regressions) console.log(`  ${r.fixture}: ${r.verdict} ${r.note}`)
  process.exit(1)
}
console.log('no regressions against scripts/holdouts.expect.json')
