#!/usr/bin/env node
/**
 * The export sweep: real builds through the real app, then every file the
 * export hands over is READ BACK and checked.
 *
 *   pnpm exec node scripts/export-sweep.mjs
 *   … --only mantine          one fixture (substring)
 *   … --base http://localhost:5190   use a running dev server
 *
 * The hold-out runner asks "does it still render 1:1". This asks the other
 * half: "is what comes OUT of it true, and would the thing it is handed to
 * accept it". So each fixture is loaded, two knobs are turned (so there is a
 * real change to describe), and then:
 *
 *   DESIGN.md            front matter shape, the spec's section order, no
 *                        duplicate keys or headings, every colour quoted
 *   design.tokens.json   the W3C shapes — $value/$type, srgb components,
 *                        {value, unit} dimensions, shadow parts
 *   AGENTS.snippet.md    a block to append, pointing at DESIGN.md
 *   patch / files        the change actually names the value that moved
 *
 * A finding is a line; the exit code is 1 if any fixture has one. Output per
 * fixture lands in .holdouts/export/<fixture>/ so a failure can be read.
 *
 * DEV ONLY: the knobs are turned through `window.__us.dispatch`, which the app
 * exposes in dev builds. Against a production base the sweep still runs, but
 * with nothing turned (it says so).
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
// A comma list, so a run can be narrowed to the fixtures a change touches.
const only = opt('--only', '').split(',').map((x) => x.trim()).filter(Boolean)
const perMs = Number(opt('--timeout', '150000'))

/** A spread wide enough that one shared assumption cannot carry them all:
 *  a token-first React kit, a docs site, a Vue system, a jQuery-era admin,
 *  classless serif CSS, shadow-DOM web components, a Bootstrap 4 admin with a
 *  custom face, and a build that IS a token system. Plus two that should
 *  degrade honestly rather than invent: greyscale, and a canvas app. */
/* Smallest first: a sweep should report its first verdict in seconds, not
   after the 48 MB one has finished loading.

   Plain, hand-written CSS is its own population and it is the one a framework
   build tells you nothing about: colours by NAME, `border: 1px solid grey`,
   `font-weight: bold`. Tacit, MVP, new.css, water.css, holiday.css and
   github-markdown are classless sheets of exactly that kind. */
const PICKS = [
  'edge-mono.zip',
  's16-tacit.zip',
  's16-mvp.zip',
  's16-newcss.zip',
  's16-water-latest.zip',
  's16-holiday-css.zip',
  's16-gh-markdown-css.zip',
  's11-open-props.zip',
  's16-tufte.zip',
  'startbootstrap-sb-admin-2-master.zip',
  's13-flutter-bmi.zip',
  's13-adminlte.zip',
  's11-spectrum-web-components.zip',
].filter((f) => !only.length || only.some((o) => f.includes(o)))

/** Anything of ours that leaked into a file meant for somebody else. */
const JUNK = /var\(--us-v|undefined|NaN|\[object |Infinity/

const outRoot = join(root, '.holdouts', 'export')
mkdirSync(outRoot, { recursive: true })
// Only a real run starts a new log; `--recheck` reads the saved exports and
// must not erase the record of the run that produced them.
if (!args.includes('--recheck')) writeFileSync(join(outRoot, 'sweep.log'), `export sweep · ${PICKS.length} fixtures\n`)

// The checks are pure functions of the four files, and the files are on disk
// from the last run: `--recheck` re-reads them without a browser. Fixing a
// check should not cost twenty minutes of reloading builds that did not change.
if (args.includes('--recheck')) {
  let bad = 0
  for (const dir of readdirSync(outRoot).filter((d) => existsSync(join(outRoot, d, 'DESIGN.md')))) {
    const at = (n) => readFileSync(join(outRoot, dir, n), 'utf8')
    const patch = at('sandbox-patch.txt')
    const findings = [
      ...checkDesign(at('DESIGN.md')),
      ...checkTokens(at('design.tokens.json')),
      ...checkAgents(at('AGENTS.snippet.md')),
      ...checkPatch(patch, !/Nothing changed/.test(patch)),
    ]
    console.log(`${findings.length ? '✗' : '✓'} ${dir}`)
    for (const f of findings) console.log(`    ${f}`)
    if (findings.length) bad++
  }
  console.log(`\nrechecked ${readdirSync(outRoot).filter((d) => existsSync(join(outRoot, d, 'DESIGN.md'))).length} saved exports · ${bad} with findings`)
  process.exit(bad ? 1 : 0)
}

let server = null
let base = opt('--base', '')
if (!base) {
  const port = 5198
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
const results = []

for (const [i, f] of PICKS.entries()) {
  const started = Date.now()
  const r = { fixture: f, findings: [], note: '' }
  const page = await context.newPage()
  try {
    await page.goto(`${base}/?load=${encodeURIComponent(`/fixtures/${f}`)}&r=${i}`, { waitUntil: 'domcontentloaded' })
    const state = await page.waitForFunction(() => {
      const err = document.querySelector('.intake__error')
      if (err) return { refused: err.textContent }
      if (document.querySelector('.stage__foot')) return { loaded: true }
      return null
    }, null, { timeout: perMs }).then((h) => h.jsonValue())
    if (state.refused) { r.note = `refused at the door: ${String(state.refused).slice(0, 90)}`; results.push(r); await page.close(); report(r); continue }
    // Let the frame paint and the coverage walk run — the export reads its
    // roles from that walk, so measuring before it lands measures the wrong app.
    await page.waitForTimeout(6000)
    const turned = await page.evaluate(() => {
      const u = window.__us
      if (!u || !u.dispatch) return null
      u.dispatch({ type: 'SET', patch: { cPrimary: '#e11d48', sb: { ...u.cfg.sb, radius: 1.6 } } })
      return true
    })
    if (!turned) r.note = 'no dev hook: nothing turned (run against a dev server for the full check)'
    await page.waitForTimeout(2500)
    // The "what we read from your code" card sits over the chrome on load.
    await page.evaluate(() => {
      const pc = document.querySelector('.popcard')
      const c = pc && Array.from(pc.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Close')
      if (c) c.click()
    })
    await page.waitForTimeout(200)
    const opened = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Export')
      if (!btn) return 'no Export button: ' + Array.from(document.querySelectorAll('.app__bar button, header button')).map((b) => b.textContent.trim()).join('|')
      btn.click()
      return ''
    })
    if (opened) throw new Error(opened)
    await page.waitForSelector('.exp__card', { timeout: 15000 })

    const grab = async (card, tab) => {
      // Back to the overview FIRST, in its own step: React re-renders after the
      // handler returns, so a click and a query in one evaluate see the old DOM.
      await page.evaluate(() => {
        const back = document.querySelector('.dialog__pane') && document.querySelector('.dialog__head .btn--ghost')
        if (back) back.click()
      })
      await page.waitForSelector('.exp__card', { timeout: 15000 })
      const miss = await page.evaluate((c) => {
        const k = Array.from(document.querySelectorAll('.exp__card')).find((x) => x.textContent.includes(c))
        if (!k) return `no destination card "${c}" — cards: ` + Array.from(document.querySelectorAll('.exp__card .exp__label')).map((x) => x.textContent.trim()).join(' | ')
        k.click()
        return ''
      }, card)
      if (miss) throw new Error(miss)
      // The patched-files pass is async and its tab reads "Preparing…" until it
      // lands. A sweep that recorded the number underneath would be reporting
      // its own impatience, not the app.
      await page.waitForFunction(
        () => { const t = Array.from(document.querySelectorAll('.exp__tab')).map((x) => x.textContent) ; return t.length > 0 && !t.some((x) => /Preparing/.test(x)) },
        null, { timeout: 90000 },
      )
      const missTab = await page.evaluate((t) => {
        const tabs = Array.from(document.querySelectorAll('.exp__tab'))
        const tb = tabs.find((x) => x.textContent.trim() === t)
        if (!tb) return `no tab "${t}" — tabs: ` + tabs.map((x) => x.textContent.trim()).join(' | ')
        tb.click()
        return ''
      }, tab)
      if (missTab) throw new Error(missTab)
      await page.waitForTimeout(250)
      return page.evaluate(() => document.querySelector('.dialog__pane pre')?.textContent ?? '')
    }
    // The source card first: it is the one that has to finish preparing, and
    // everything after it then reads a settled dialog.
    const patch = await grab('Patch your own files', 'Find and replace')
    const design = await grab('Hand it to your agent', 'DESIGN.md')
    const agents = await grab('Hand it to your agent', 'AGENTS.md')
    const tokens = await grab('Hand it to your agent', 'Design tokens')
    await page.evaluate(() => {
      const back = document.querySelector('.dialog__pane') && document.querySelector('.dialog__head .btn--ghost')
      if (back) back.click()
    })
    await page.waitForSelector('.exp__stat', { timeout: 15000 })
    r.stats = await page.evaluate(() => Array.from(document.querySelectorAll('.exp__stat')).map((s) => s.textContent.replace(/\s+/g, ' ').trim()))
    const dir = join(outRoot, f.replace(/\.zip$/, ''))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'DESIGN.md'), design)
    writeFileSync(join(dir, 'AGENTS.snippet.md'), agents)
    writeFileSync(join(dir, 'design.tokens.json'), tokens)
    writeFileSync(join(dir, 'sandbox-patch.txt'), patch)
    // A build with no brand colour and no corner radius does not move when the
    // brand and radius knobs turn. The patch is only wrong to say "nothing
    // changed" when the app itself counted something as moved.
    const moved = Number(((r.stats ?? [])[0] || '').match(/^(\d+)/)?.[1] ?? 0)
    r.moved = moved
    r.findings.push(...checkDesign(design), ...checkTokens(tokens), ...checkAgents(agents), ...checkPatch(patch, moved > 0))
  } catch (e) {
    r.findings.push(`sweep error: ${String(e).split('\n')[0].slice(0, 140)}`)
  }
  r.seconds = Math.round((Date.now() - started) / 1000)
  results.push(r)
  report(r)
  await page.close().catch(() => {})
}

await browser.close()
if (server) server.kill()

const bad = results.filter((r) => r.findings.length)
console.log(`\n${results.length} fixtures · ${bad.length} with findings · output in .holdouts/export/`)
process.exit(bad.length ? 1 : 0)

/** Straight to the log as each fixture lands: a sweep whose output only
 *  appears at the end is one you cannot tell from a hung one. */
function report(r) {
  const lines = [`${r.findings.length ? '✗' : '✓'} ${r.fixture}${r.note ? `  (${r.note})` : ''}${r.stats ? `  [${r.stats.join(' · ')}]` : ''}${r.seconds ? `  ${r.seconds}s` : ''}`]
  for (const f of r.findings) lines.push(`    ${f}`)
  const text = lines.join('\n') + '\n'
  process.stdout.write(text)
  appendFileSync(join(outRoot, 'sweep.log'), text)
}

// ---------------------------------------------------------------- checks ---

/** The DESIGN.md spec: front matter between exact `---` lines, `##` sections
 *  in a fixed order, no duplicate heading (the spec says: reject the file). */
function checkDesign(md) {
  const out = []
  if (!md.trim()) return ['DESIGN.md is empty']
  const lines = md.split('\n')
  if (lines[0] !== '---') out.push('DESIGN.md: front matter does not open with exactly ---')
  const end = lines.indexOf('---', 1)
  if (end < 0) return [...out, 'DESIGN.md: front matter never closes']
  const fm = lines.slice(1, end)
  if (JUNK.test(md)) out.push(`DESIGN.md: leaked internals (${(md.match(JUNK) || [])[0]})`)

  // Scalars: a `#` that is not inside quotes starts a YAML comment, so every
  // colour has to be quoted or the token silently becomes empty.
  for (const l of fm) {
    const m = l.match(/^(\s*)([\w-]+):\s*(\S.*)$/)
    if (!m) continue
    const val = m[3].trim()
    if (val.includes('#') && !/^["']/.test(val)) out.push(`DESIGN.md: unquoted # in \`${l.trim()}\` — YAML reads the rest as a comment`)
    if (/^[\d.]+$/.test(val) === false && /,/.test(val) && !/^["']/.test(val) && !val.startsWith('{')) out.push(`DESIGN.md: unquoted comma in \`${l.trim()}\``)
  }
  // Duplicate keys WITHIN one mapping silently drop a token. The path has to
  // be tracked by indent: `typography.display.fontFamily` and
  // `typography.body.fontFamily` are two different mappings, not a clash.
  // Duplicate keys WITHIN one mapping silently drop a token. The path is
  // tracked by indent, because `typography.display.fontFamily` and
  // `typography.body.fontFamily` are two mappings, not a clash.
  //
  // Sequence blocks (`omitted:` is the only one we emit) are lifted out first:
  // every `- ` opens its own mapping, so `reason` repeating across entries is
  // the format working, not a bug. They get their own check below.
  const plain = [], seq = []
  let inSeq = false
  for (const l of fm) {
    if (/^\s*-/.test(l)) { inSeq = true; seq.push(l); continue }
    if (inSeq && /^\s{3,}\S/.test(l)) { seq.push(l); continue }
    inSeq = false
    plain.push(l)
  }
  const seen = new Set()
  const stack = []
  for (const l of plain) {
    const m = l.match(/^(\s*)([\w-]+):/)
    if (!m) continue
    const indent = m[1].length
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const path = [...stack.map((x) => x.key), m[2]].join('.')
    if (seen.has(path)) out.push(`DESIGN.md: duplicate key \`${path}\` — one of them is dropped`)
    seen.add(path)
    stack.push({ indent, key: m[2] })
  }
  // Every omitted entry names a section, and says why — a bare list of names
  // would tell an agent what is missing but not that we chose to leave it out.
  const entries = seq.join('\n').split(/^\s*-\s*/m).filter((x) => x.trim())
  for (const e of entries) {
    if (!/\bsection:/.test(e)) out.push(`DESIGN.md: omitted entry with no \`section:\` (${e.split('\n')[0].trim()})`)
    if (!/\breason:/.test(e)) out.push(`DESIGN.md: omitted \`${(e.match(/section:\s*(\S+)/) || [])[1]}\` with no reason`)
  }

  // A token reference has to point at something that exists.
  for (const ref of md.matchAll(/\{([a-z][\w.-]*)\}/gi)) {
    const path = ref[1].split('.')
    if (path.length < 2) continue
    if (!fm.some((l) => l.trim().startsWith(`${path[0]}:`)) && !fm.some((l) => l.trim().startsWith(`${path[1]}:`))) {
      out.push(`DESIGN.md: reference {${ref[1]}} points at nothing in the front matter`)
    }
  }
  const ORDER = ['## Overview', '## Colors', '## Typography', '## Layout', '## Elevation & Depth', '## Shapes', '## Components', "## Do's and Don'ts"]
  const at = []
  for (const h of ORDER) {
    const n = md.split(`\n${h}\n`).length - 1
    if (n > 1) out.push(`DESIGN.md: duplicate heading ${h} — the spec says reject the file`)
    if (n === 1) at.push([h, md.indexOf(`\n${h}\n`)])
  }
  const sorted = [...at].sort((a, b) => a[1] - b[1]).map((x) => x[0])
  if (sorted.join('|') !== at.map((x) => x[0]).join('|')) out.push(`DESIGN.md: sections out of the spec order (${sorted.join(' → ')})`)
  if (!at.some((x) => x[0] === '## Overview')) out.push('DESIGN.md: no Overview section')
  // A section we did not measure must be DECLARED, not silently missing.
  for (const [key, head] of [['rounded', '## Shapes'], ['spacing', '## Layout']]) {
    const has = fm.some((l) => l.startsWith(`${key}:`))
    const declared = md.includes(`- section: ${key}`)
    if (!has && !declared) out.push(`DESIGN.md: no \`${key}:\` tokens and no \`omitted:\` entry for it (${head} claims something it did not measure)`)
  }
  if (!md.includes('- section: components')) out.push('DESIGN.md: components neither present nor declared omitted')
  return out
}

/** The W3C Design Tokens Format Module: groups carry $type, tokens carry
 *  $value, and each type has one legal shape. A file that fails here is one
 *  Style Dictionary or Tokens Studio would reject. */
function checkTokens(text) {
  const out = []
  let j
  try { j = JSON.parse(text) } catch (e) { return [`design.tokens.json: not JSON (${String(e).slice(0, 80)})`] }
  if (JUNK.test(text)) out.push(`design.tokens.json: leaked internals (${(text.match(JUNK) || [])[0]})`)
  const walk = (node, path, type) => {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue
      if (!v || typeof v !== 'object') { out.push(`design.tokens.json: ${path}${k} is not a token or group`); continue }
      const t = v.$type ?? type
      if ('$value' in v) {
        if (!t) { out.push(`design.tokens.json: ${path}${k} has no $type and none to inherit`); continue }
        out.push(...shapeOf(v.$value, t, `${path}${k}`))
      } else walk(v, `${path}${k}.`, t)
    }
  }
  walk(j, '', undefined)
  return out
}

function shapeOf(v, type, where) {
  const out = []
  const dim = (d, what) => {
    if (!d || typeof d !== 'object') return [`${where}: ${what} is not a dimension object`]
    if (typeof d.value !== 'number' || !Number.isFinite(d.value)) return [`${where}: ${what}.value is not a number (${JSON.stringify(d.value)})`]
    if (!['px', 'rem'].includes(d.unit)) return [`${where}: ${what}.unit is ${JSON.stringify(d.unit)}, the format allows px and rem`]
    return []
  }
  const col = (c, what) => {
    if (!c || typeof c !== 'object') return [`${where}: ${what} is not a colour object`]
    const e = []
    if (c.colorSpace !== 'srgb') e.push(`${where}: ${what}.colorSpace is ${JSON.stringify(c.colorSpace)}`)
    if (!Array.isArray(c.components) || c.components.length !== 3) e.push(`${where}: ${what}.components is not three channels`)
    else for (const n of c.components) if (typeof n !== 'number' || n < 0 || n > 1 || !Number.isFinite(n)) e.push(`${where}: ${what} channel out of 0..1 (${n})`)
    if (c.alpha !== undefined && (typeof c.alpha !== 'number' || c.alpha < 0 || c.alpha > 1)) e.push(`${where}: ${what}.alpha out of range`)
    if (c.hex !== undefined && !/^#[0-9a-f]{6}$/i.test(c.hex)) e.push(`${where}: ${what}.hex is ${JSON.stringify(c.hex)}`)
    return e
  }
  if (type === 'color') return col(v, '$value')
  if (type === 'dimension') return dim(v, '$value')
  if (type === 'fontFamily') {
    if (typeof v === 'string') return v.trim() ? [] : [`${where}: empty font family`]
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' && x.trim())) return []
    return [`${where}: $value is not a family or a list of families`]
  }
  if (type === 'fontWeight') {
    if (typeof v === 'number' && v >= 1 && v <= 1000) return []
    if (typeof v === 'string') return []
    return [`${where}: $value is not a weight (${JSON.stringify(v)})`]
  }
  if (type === 'shadow') {
    const one = (s, n) => {
      if (!s || typeof s !== 'object') return [`${where}[${n}]: not a shadow object`]
      return [...col(s.color, 'color'), ...dim(s.offsetX, 'offsetX'), ...dim(s.offsetY, 'offsetY'), ...dim(s.blur, 'blur'), ...dim(s.spread, 'spread')]
    }
    return Array.isArray(v) ? v.flatMap(one) : one(v, 0)
  }
  if (type === 'number') return typeof v === 'number' ? [] : [`${where}: $value is not a number`]
  out.push(`${where}: unchecked $type ${type}`)
  return out
}

function checkAgents(md) {
  const out = []
  if (!md.includes('Append this to AGENTS.md')) out.push('AGENTS.snippet.md: does not say it is a block to append')
  if (!md.includes('DESIGN.md')) out.push('AGENTS.snippet.md: never names DESIGN.md')
  if (!md.includes('CLAUDE.md')) out.push('AGENTS.snippet.md: no CLAUDE.md alternative')
  if (JUNK.test(md)) out.push(`AGENTS.snippet.md: leaked internals (${(md.match(JUNK) || [])[0]})`)
  return out
}

function checkPatch(text, moved) {
  const out = []
  if (JUNK.test(text)) out.push(`sandbox-patch.txt: leaked internals (${(text.match(JUNK) || [])[0]})`)
  if (!moved) return out
  if (/Nothing changed/.test(text)) out.push('sandbox-patch.txt: says nothing changed, but the app counted values as moved')
  else if (!/→/.test(text)) out.push('sandbox-patch.txt: no replacement lines, but the app counted values as moved')
  return out
}
