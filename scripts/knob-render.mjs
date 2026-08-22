#!/usr/bin/env node
/**
 * What each knob does to the SCREEN, and what it must leave alone.
 *
 *   node scripts/knob-render.mjs            all picks, own dev server
 *   … --only sb-admin,tacit                 a subset (comma list)
 *   … --base http://localhost:5190          a running server
 *
 * `scripts/knob-effect.ts` already counts how many SHEET values a knob moves.
 * That is not the same question: a value can move and never reach the screen,
 * or reach something it does not own. Colour knobs are checked by eye every
 * day because colour is loud; elevation, motion, tracking and border width are
 * not, and that is exactly where a fault can sit for months.
 *
 * So: load a build, snapshot the computed styles of every visible element,
 * turn ONE knob to its extreme, snapshot again, and hold the result to a
 * contract — `owns` must move, `mustNotMove` must not.
 *
 * Two rules that keep this honest:
 *
 *  - A knob that moves nothing is only a finding when the build HAS what it
 *    moves. A page with no shadow cannot fail an elevation test, so the
 *    population is counted first and the verdict is `n/a` when it is zero.
 *  - `margin`, `padding` and `gap` are never in `mustNotMove`. Their computed
 *    values are layout-derived (percentages resolve against a container, and
 *    `margin: auto` is free space), so ANY knob that changes a box size moves
 *    them as a consequence. AdminLTE taught us that one: a navbar's `ms-auto`
 *    reported a difference that belonged to something else entirely.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const only = opt('--only', '').split(',').map((x) => x.trim()).filter(Boolean)
const perMs = Number(opt('--timeout', '180000'))

/* Builds that differ in what they are made of: a Bootstrap admin (shadows,
   radii, transitions), a jQuery-era admin, a token system, classless CSS with
   almost no chrome, and shadow-DOM web components. */
const PICKS = [
  'startbootstrap-sb-admin-2-master.zip',
  's11-open-props.zip',
  's16-tacit.zip',
  's11-spectrum-web-components.zip',
  's13-adminlte.zip',
].filter((f) => !only.length || only.some((o) => f.includes(o)))

/* Everything a knob could plausibly touch. Read once per snapshot. */
const PROPS = [
  'box-shadow', 'transition-duration', 'animation-duration',
  'border-top-left-radius', 'border-bottom-right-radius',
  'border-top-width', 'border-left-width',
  'font-size', 'line-height', 'letter-spacing', 'font-weight', 'font-family',
  'color', 'background-color', 'border-top-color',
  'padding-top', 'padding-left', 'margin-top', 'margin-left', 'row-gap', 'column-gap',
]

/* Geometry-derived: never used as evidence that a knob overreached, because
   any knob that changes a box changes these as a consequence.
   `border-radius` belongs here for a reason worth remembering: AdminLTE writes
   `border-radius: 50%` eighty times (`.rounded-circle`, avatars), and a
   percentage resolves against the box, so widening the border moved the
   computed radius on three elements. That is CSS doing its job, and reporting
   it as a knob reaching too far would be the instrument lying. */
const DERIVED = new Set([
  'padding-top', 'padding-left', 'margin-top', 'margin-left', 'row-gap', 'column-gap',
  'border-top-left-radius', 'border-bottom-right-radius',
])

/* `kind` is the sheet kind the knob consumes, and it is HALF the precondition:
   if the build declares no shadow, the elevation dial has nothing to move and
   that is not a fault. An earlier version guessed that population from the
   computed styles instead and counted the BROWSER's own defaults, so `weight`
   appeared to have 1411 chances to move on a page that declares none. The
   sheet knows exactly, so ask the sheet.

   The other half is the SCREEN, and leaving it out made this sweep overreport.
   Spectrum's sheet holds twelve shadows and its demo page paints none — the
   components that use them (dialogs, menus, popovers) are not on it — so
   "twelve in the sheet and none reached the screen" was read out as a fault
   for months when the honest answer is that there was nothing to reach.
   A finding needs both: the sheet must hold the kind AND the screen must
   already paint at least one. Reading the population off the BEFORE snapshot
   is safe here for the reason the browser defaults were not: that snapshot is
   the build at its own stand, and the 1:1 gate separately proves that stand is
   identical to the untouched control. So a zero means their page paints none,
   not that we erased them. Where a default is not filtered out (font-weight's
   400), the population only comes out too HIGH, which keeps a finding visible
   rather than hiding one. */
const KNOBS = [
  { name: 'elevation → flat', kind: 'shadow', patch: { sb: { shadow: 0 } }, owns: ['box-shadow'],
    mustNotMove: ['color', 'background-color', 'font-size', 'border-top-width'] },
  { name: 'elevation → deep', kind: 'shadow', patch: { sb: { shadow: 2.5 } }, owns: ['box-shadow'],
    mustNotMove: ['color', 'background-color', 'font-size', 'border-top-width'] },
  { name: 'motion → none', kind: 'duration', patch: { sb: { motion: 0 } }, owns: ['transition-duration', 'animation-duration'],
    mustNotMove: ['color', 'background-color', 'font-size', 'box-shadow', 'letter-spacing'] },
  { name: 'radius → none', kind: 'radius', patch: { sb: { radius: 0 } }, owns: ['border-top-left-radius', 'border-bottom-right-radius'],
    mustNotMove: ['color', 'background-color', 'font-size', 'box-shadow', 'border-top-width'] },
  { name: 'radius → 2x', kind: 'radius', patch: { sb: { radius: 2 } }, owns: ['border-top-left-radius', 'border-bottom-right-radius'],
    mustNotMove: ['color', 'background-color', 'font-size', 'box-shadow', 'border-top-width'] },
  { name: 'border width → 3x', kind: 'border-width', patch: { sb: { borderWidth: 3 } }, owns: ['border-top-width', 'border-left-width'],
    mustNotMove: ['border-top-color', 'color', 'font-size'] },
  { name: 'spacing → 1.5x', kind: 'space', patch: { sb: { space: 1.5 } }, owns: ['padding-top', 'padding-left'],
    mustNotMove: ['font-size', 'color', 'border-top-width'] },
  { name: 'line height → 1.35x', kind: 'line-height', patch: { sb: { lineHeight: 1.35 } }, owns: ['line-height'],
    mustNotMove: ['font-size', 'letter-spacing', 'font-weight', 'color'] },
  { name: 'letter spacing → .15em', kind: 'letter-spacing', patch: { sb: { tracking: 0.15 } }, owns: ['letter-spacing'],
    mustNotMove: ['font-size', 'line-height', 'font-weight', 'color'] },
  { name: 'weight → +2', kind: 'font-weight', patch: { sb: { weight: 2 } }, owns: ['font-weight'],
    mustNotMove: ['font-size', 'font-family', 'color', 'letter-spacing'] },
  // A unitless `line-height` is a MULTIPLE of font-size, so it moves with the
  // text by definition. That is the CSS working, not the knob overreaching.
  { name: 'text size → 1.4x', kind: 'font-size', patch: { sb: { type: 1.4 } }, owns: ['font-size'],
    mustNotMove: ['font-weight', 'font-family', 'color'] },
]

const outDir = join(root, '.holdouts')
mkdirSync(outDir, { recursive: true })
const LOG = join(outDir, 'knob-render.log')
writeFileSync(LOG, `knob render sweep · ${PICKS.length} builds × ${KNOBS.length} knobs\n`)
const say = (s) => { process.stdout.write(s + '\n'); appendFileSync(LOG, s + '\n') }

let server = null
let base = opt('--base', '')
if (!base) {
  const port = 5196
  server = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  base = `http://localhost:${port}`
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite did not start')), 30000)
    server.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); setTimeout(resolve, 600) } })
    server.on('exit', (c) => reject(new Error(`vite exited ${c}`)))
  })
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
let findings = 0

for (const [i, f] of PICKS.entries()) {
  const page = await context.newPage()
  const t0 = Date.now()
  try {
    await page.goto(`${base}/?load=${encodeURIComponent(`/fixtures/${f}`)}&r=${i}`, { waitUntil: 'domcontentloaded' })
    const state = await page.waitForFunction(() => {
      const err = document.querySelector('.intake__error')
      if (err) return { refused: err.textContent }
      if (document.querySelector('.stage__foot')) return { loaded: true }
      return null
    }, null, { timeout: perMs }).then((h) => h.jsonValue())
    if (state.refused) { say(`— ${f}: refused at the door`); await page.close(); continue }
    await page.waitForTimeout(5000)

    // One snapshot function, installed once, reading the frame's own window.
    await page.evaluate((props) => {
      // Open Props' docs page carries 3941 elements and its only shadows sit
      // past the four-thousandth. A cap that silently drops the tail reports
      // "this screen paints none" about a screen that paints six.
      const CAP = 8000
      window.__snap = () => {
        const fr = document.querySelector('.stage__frame iframe')
        const d = fr && fr.contentDocument
        if (!d || !d.body) return null
        // Every element in DOM order, visible or not, so the two snapshots
        // pair by position. Filtering by size here would change the array
        // length whenever a knob changes layout (border width x3 did exactly
        // that), and a shifted array compares unrelated elements.
        const out = []
        // Into shadow roots as well, in document order. Spectrum is in the
        // picks BECAUSE it is web components, and reading only the light DOM
        // meant every one of its readings was of the hosts, not the parts —
        // 437 visible elements, of which the light DOM holds a fraction.
        const walk = (root, into) => {
          for (const el of root.children ? root.querySelectorAll('*') : []) {
            into.push(el)
            if (el.shadowRoot) walk(el.shadowRoot, into)
          }
          return into
        }
        const all = walk(d, [])
        window.__snapTruncated = all.length > CAP
        const els = all.slice(0, CAP)
        for (const el of els) {
          if (el.id === 'us-vars' || el.id === 'us-fonts' || el.id === 'us-guard') { out.push(null); continue }
          const r = el.getBoundingClientRect()
          const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el)
          const row = { _seen: r.width >= 2 && r.height >= 2 }
          for (const p of props) row[p] = cs.getPropertyValue(p)
          out.push(row)
        }
        return out
      }
    }, PROPS)

    const read = await page.evaluate(() => {
      const u = window.__us
      if (!u) return null
      const kinds = {}
      for (const e of u.project.table.entries) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
      return { cfg: JSON.parse(JSON.stringify(u.baseline.cfg)), kinds, values: u.project.table.entries.length }
    })
    if (!read) { say(`— ${f}: no dev hook (run against the dev server)`); await page.close(); continue }
    const baseline = read.cfg, kinds = read.kinds

    say(`\n${f}`)
    for (const k of KNOBS) {
      // Always start from the build's own stand, so knobs cannot stack.
      await page.evaluate((cfg) => window.__us.dispatch({ type: 'REPLACE', cfg }), baseline)
      await page.waitForTimeout(900)
      const before = await page.evaluate(() => window.__snap())
      await page.evaluate((patch) => {
        const u = window.__us
        const { sb = {}, ...rest } = patch
        u.dispatch({ type: 'SET', patch: { ...rest, sb: { ...u.cfg.sb, ...sb } } })
      }, k.patch)
      await page.waitForTimeout(1200)
      const after = await page.evaluate(() => window.__snap())
      if (!before || !after || before.length !== after.length) { say(`  ? ${k.name}: the frame changed shape between snapshots, skipped`); continue }
      if (await page.evaluate(() => window.__snapTruncated)) say(`  ! ${k.name}: the page is larger than the snapshot cap, the tail was not read`)

      const moved = {}
      const population = {}
      for (const p of PROPS) { moved[p] = 0; population[p] = 0 }
      for (let n = 0; n < before.length; n++) {
        // Only elements the reader could actually see, in both states.
        if (!before[n] || !after[n] || !before[n]._seen || !after[n]._seen) continue
        for (const p of PROPS) {
          const a = before[n][p], b = after[n][p]
          if (a && a !== 'none' && a !== '0px' && a !== 'normal' && a !== '0s') population[p]++
          if (a !== b) moved[p]++
        }
      }
      const inSheet = kinds[k.kind] ?? 0
      const ownMoved = k.owns.map((p) => `${p} ${moved[p]}`).join(' · ')
      const over = k.mustNotMove.filter((p) => !DERIVED.has(p) && moved[p] > 0)

      const onScreen = k.owns.reduce((n, p) => n + population[p], 0)
      if (!inSheet) say(`  – ${k.name}: n/a, the sheet holds no ${k.kind}`)
      else if (!onScreen) say(`  – ${k.name}: n/a, the sheet holds ${inSheet} ${k.kind} and this screen paints none`)
      else if (!k.owns.some((p) => moved[p] > 0)) { findings++; say(`  ✗ ${k.name}: the sheet holds ${inSheet} ${k.kind}, ${onScreen} on screen, and none of it moved`) }
      else if (over.length) { findings++; say(`  ✗ ${k.name}: also moved ${over.map((p) => `${p} on ${moved[p]}`).join(', ')} — ${ownMoved}`) }
      else say(`  ✓ ${k.name}: ${ownMoved} (sheet: ${inSheet})`)
    }
    say(`  (${Math.round((Date.now() - t0) / 1000)}s)`)
  } catch (e) {
    findings++
    say(`  ✗ ${f}: sweep error ${String(e).split('\n')[0].slice(0, 120)}`)
  }
  await page.close().catch(() => {})
}

await browser.close()
if (server) server.kill()
say(`\n${PICKS.length} builds · ${findings} finding${findings === 1 ? '' : 's'} · log in .holdouts/knob-render.log`)
process.exit(findings ? 1 : 0)
