#!/usr/bin/env node
/**
 * The live site, held to what the repo says it should be.
 *
 *   node scripts/live-check.mjs [https://uisandbox.org]
 *
 * Every check is something a visitor would notice: the page it serves, the
 * bytes it serves with it, the headers, and one real build carried all the way
 * to a rendered screen. Exits non-zero on anything failed.
 */
import { chromium } from 'playwright'

const base = (process.argv[2] ?? 'https://uisandbox.org').replace(/\/$/, '')
const rows = []
const ok = (name, pass, detail = '') => { rows.push({ name, pass, detail }); return pass }

const head = async (path) => {
  const r = await fetch(base + path, { redirect: 'follow' })
  const buf = await r.arrayBuffer()
  return { status: r.status, type: r.headers.get('content-type') ?? '', kb: Math.round(buf.byteLength / 1024), h: r.headers }
}

// 1 — the document, its headers, and the redirects in front of it
const root = await fetch(base + '/', { redirect: 'follow' })
const html = await root.text()
ok('page 200', root.status === 200, `${root.status}`)
ok('HSTS', /max-age=\d{7,}/.test(root.headers.get('strict-transport-security') ?? ''), root.headers.get('strict-transport-security') ?? 'absent')
ok('nosniff', root.headers.get('x-content-type-options') === 'nosniff', root.headers.get('x-content-type-options') ?? 'absent')
ok('title is current', /Play with your app's design/.test(html), (html.match(/<title>([^<]*)/) ?? [])[1] ?? '')
ok('no "free forever" in the document', !/free forever/i.test(html))

// 2 — the assets the new page needs
for (const [path, minKb, type] of [
  ['/how-it-works.mp4', 400, 'video'],
  ['/how-it-works-poster.png', 50, 'image'],
  ['/og.png', 50, 'image'],
  ['/shot-stage.png', 50, 'image'],
]) {
  const r = await head(path)
  ok(`${path}`, r.status === 200 && r.kb >= minKb && r.type.startsWith(type), `${r.status} · ${r.type} · ${r.kb} KB`)
}
const sw = await head('/sw.js')
ok('sw.js uncached', r0(sw.h.get('cache-control')), sw.h.get('cache-control') ?? 'absent')
function r0(v) { return !!v && /no-cache|no-store|max-age=0/.test(v) }

// 3 — the rendered page: what a visitor actually gets
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

const dom = await page.evaluate(() => ({
  h2: [...document.querySelectorAll('.landing h2')].map((h) => h.textContent),
  wideClip: !!document.querySelector('.clip--wide'),
  clipWidth: Math.round(document.querySelector('.clip')?.getBoundingClientRect().width ?? 0),
  staticShot: !!document.querySelector('.shot:not(.shot--stack)'),
  doorTop: Math.round(document.querySelector('.door')?.getBoundingClientRect().top ?? -1),
  hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  firstPerson: /I'm .*Alexander Kaan|I build open-source tooling/.test(document.body.innerText),
  promise: /Find out in about a minute/.test(document.body.innerText),
  stale: (document.body.innerText.match(/free forever|Honest by construction|Don't take our word/g) ?? []),
}))
ok('the clip is on the page, wide', dom.wideClip && dom.clipWidth > 900, `${dom.clipWidth}px`)
ok('the static shot is gone', !dom.staticShot)
ok('the drop zone is above the fold', dom.doorTop > 0 && dom.doorTop < 700, `top ${dom.doorTop}px`)
ok('no sideways scroll', !dom.hScroll)
ok('headings are the new ones', dom.h2.includes('How to check it yourself'), dom.h2.join(' · '))
ok('the promise is in the lead', dom.promise)
ok('"Who made this" is first person', dom.firstPerson)
ok('no retired copy on screen', dom.stale.length === 0, dom.stale.join(', '))

// the video: does it actually decode and start?
const vid = await page.evaluate(async () => {
  const v = document.querySelector('.clip__vid')
  if (!v) return null
  v.scrollIntoView({ block: 'center' })
  await new Promise((r) => setTimeout(r, 2500))
  return { w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration * 10) / 10, paused: v.paused, err: v.error?.code ?? null }
})
ok('the clip decodes and plays', !!vid && vid.videoWidth !== 0 && !vid.paused && !vid.err, vid ? `${vid.w}×${vid.h} · ${vid.dur}s · paused ${vid.paused}` : 'no video element')

// 4 — one real build, all the way to a rendered screen, and one knob turned
// on it. The build is the site's OWN admin-dashboard sample rather than a repo
// off GitHub: it exercises the sample route a visitor actually clicks, it does
// not depend on a third party being up, and it has a brand colour that paints
// half the screen. An earlier version of this check used tufte-css, whose
// brand family holds exactly ONE value and does not paint it on the first
// screen — the knob moved it, correctly, and the check called that a failure.
const t0 = Date.now()
await page.goto(`${base}/?load=${encodeURIComponent('/samples/sb-admin-dashboard.zip')}`, { waitUntil: 'domcontentloaded' })
const loaded = await page.waitForFunction(() => {
  if (document.querySelector('.intake__error')) return { refused: document.querySelector('.intake__error').textContent }
  if (document.querySelector('.stage__foot')) return { ok: true }
  return null
}, null, { timeout: 120000 }).then((h) => h.jsonValue()).catch((e) => ({ err: String(e).split('\n')[0] }))
ok('a real build loads end to end', !!loaded.ok, loaded.refused ?? loaded.err ?? `${Math.round((Date.now() - t0) / 1000)}s`)
if (loaded.ok) {
  await page.waitForTimeout(2500)
  // Counted as CHANGED COMPUTED STYLES, not as elements landing on the pick.
  // The first version of this check looked for the pick's own rgb on the page
  // and found none, which is correct and useless: the mapping is a DELTA from
  // their brand, so only a value that started at the centre lands exactly on
  // it. Tufte is nearly monochrome besides. What matters is whether turning a
  // knob reaches the screen at all.
  const snap = () => page.evaluate(() => {
    const d = document.querySelector('.stage__frame iframe').contentDocument
    return [...d.querySelectorAll('*')].slice(0, 1200).map((el) => {
      const cs = d.defaultView.getComputedStyle(el)
      return cs.color + '|' + cs.backgroundColor + '|' + cs.borderTopColor
    })
  })
  //
  // And it is driven through the REAL UI, not `window.__us`: that hook is a dev
  // convenience and does not exist in the production bundle, so the version of
  // this check that called it did nothing at all and reported the nothing as a
  // failing knob. A probe that cannot tell "it did not work" from "I did not
  // run it" is worse than no probe, so the click is asserted first.
  const before = await snap()
  const clicked = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.fmrow')].find((r) => /^Brand/.test(r.textContent || ''))
    if (!row) return 'no Brand row'
    ;(row.querySelector('button') || row).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return 'ok'
  })
  ok('the Brand row opens', clicked === 'ok', clicked)
  await page.waitForTimeout(500)
  const picked = await page.evaluate(() => {
    const inp = document.querySelector('.fmrow__colorinput')
    if (!inp) return 'no colour input'
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, '#e11d48')
    inp.dispatchEvent(new Event('input', { bubbles: true }))
    return 'ok'
  })
  ok('the Brand picker takes a colour', picked === 'ok', picked)
  await page.waitForTimeout(1600)
  const after = await snap()
  const turned = { moved: before.length === after.length ? before.filter((v, i) => v !== after[i]).length : -1, seen: before.length }
  ok('a knob reaches the screen', turned.moved > 0, `${turned.moved} of ${turned.seen} elements changed`)
}
ok('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const bad = rows.filter((r) => !r.pass)
for (const r of rows) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`)
console.log(`\n${rows.length} checks · ${bad.length} failed · ${base}`)
process.exit(bad.length ? 1 : 0)
