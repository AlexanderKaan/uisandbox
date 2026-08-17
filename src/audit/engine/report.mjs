/**
 * The local HTML report — `.uicockpit/audit.html`.
 *
 * A standalone file. **No upload, ever**: the buyer is letting you scan their
 * internal codebase, and one story about uploaded source costs the whole
 * channel. Nothing here fetches, posts, or links out.
 *
 * ── The one design decision that matters ─────────────────────────────────────
 * **Render the findings, don't list them.** Reading "47" is abstract; seeing 47
 * buttons side by side is the oh-god. So:
 *   · 23 shadows  → 23 squares wearing that shadow
 *   · 40 colours  → the swatches, near-dupes placed adjacent
 *   · 19 type triplets → the text actually set in each triplet
 *   · 47 buttons  → the wall
 *
 * The wall is the artefact; everything else is supporting cast. Each treatment
 * is reconstructed from the values the scanner extracted from that very element,
 * so what you see is the repo's own styling, not an illustration of it.
 */
import { extractClasses } from './patterns.mjs'
import { parseColor } from './colorspace.mjs'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const pct = (n) => `${Math.round(n * 100)}%`

/** Turn a value into something a browser can paint, or null if we can't.
 *  `palette` is the repo's resolved design palette, so a Tailwind name like
 *  `emerald-500` paints as the colour that repo actually renders. */
const cssColor = (v, palette = null) => {
  const rgb = parseColor(v, palette)
  return rgb ? `rgb(${rgb.join(',')})` : (/^(#|rgb|hsl|oklch)/.test(String(v)) ? String(v) : null)
}

/* ─────────────────────────────── the button wall ───────────────────────────── */

/**
 * Rebuild one treatment from its own signature. The classes are re-run through
 * the SAME extractor the audit used, so the swatch is the repo's real values —
 * not an approximation drawn by hand.
 */
function reconstruct(sig, classStyles = {}, palette = null) {
  const classes = sig.split(/\s+/).filter(Boolean)

  // Plain-CSS repos: the values live in the stylesheet, not the class name.
  // Merge the declarations the scan already harvested for these classes.
  const fromCss = {}
  for (const c of classes) Object.assign(fromCss, classStyles[c] || {})
  if (Object.keys(fromCss).length) {
    const style = Object.entries(fromCss)
      .filter(([p, v]) => v && !/^\s*$/.test(v))
      .map(([p, v]) => `${p}:${v}`)
      .concat(['line-height:1.1', 'display:inline-block'])
      .join(';')
    return { style, resolved: true }
  }

  const evs = extractClasses(classes, { file: '', line: 0, col: 0 })
  const pick = (dim, role = null) => {
    const hit = evs.find((e) => e.dim === dim && (role === null || e.role === role))
    return hit ? hit.value : null
  }
  const bg = cssColor(pick('color', 'bg'), palette)
  const fg = cssColor(pick('color', 'fg'), palette)
  const radius = pick('radius')
  const shadow = pick('shadow')
  const padding = evs.filter((e) => e.dim === 'spacing')
  const py = padding.find((e) => e.side === 'top')?.value
  const px = padding.find((e) => e.side === 'left')?.value
  const type = pick('type')
  const [size, , weight] = type ? type.split('/') : []

  const style = [
    bg ? `background:${bg}` : 'background:#e9e9ee',
    fg ? `color:${fg}` : 'color:#1a1a1f',
    radius ? `border-radius:${radius}` : '',
    shadow && shadow !== 'none' ? `box-shadow:${shadow}` : '',
    `padding:${py || '8px'} ${px || '14px'}`,
    size ? `font-size:${size}` : 'font-size:14px',
    weight && weight !== 'auto' ? `font-weight:${weight}` : 'font-weight:500',
  ].filter(Boolean).join(';')

  // Did we resolve enough to be showing the real thing?
  const resolved = Boolean(bg || radius || shadow || py || size)
  return { style, resolved }
}

function buttonWall(components, classStyles, palette) {
  const b = components.button
  if (!b || !b.treatments) return ''
  const cells = b.signatures.map((s) => {
    const { style, resolved } = reconstruct(s.sig, classStyles, palette)
    const label = s.count === 1 ? 'once' : `${s.count}×`
    const files = [...new Set(s.at.map((a) => a.file))].slice(0, 2).join(' · ')
    return `<figure class="wall__cell${s.count === 1 ? ' is-singleton' : ''}">
      <div class="wall__stage">${resolved
        ? `<span class="wall__btn" style="${esc(style)}">Button</span>`
        : `<span class="wall__unresolved" title="Styled by CSS this report can't resolve">${esc(s.sig.split(' ').slice(0, 3).join(' ')) || '(no classes)'}</span>`}</div>
      <figcaption><b>${label}</b>${files ? `<span title="${esc(files)}">${esc(files)}</span>` : ''}</figcaption>
    </figure>`
  }).join('')

  // Qualify the count. "89 button treatments" over a codebase that routes 3,070
  // buttons through <Button/> is a number the reader cannot match to their own
  // app — and once one number fails that test, the rest of the report goes with it.
  const via = b.throughComponent
    ? `<p class="lead">${b.throughComponent.toLocaleString('en-US')} more buttons go through a
       component (${b.componentNames.map((n) => `<code>&lt;${esc(n)}/&gt;</code>`).join(', ')}) —
       <strong>${pct(b.componentShare)}</strong> of all buttons. Those are not sprawl; they are the
       system this codebase already has. The wall below is what sits outside it.</p>`
    : ''

  return section(
    'The button wall',
    `<strong>${b.treatments} hand-rolled button treatment${b.treatments === 1 ? '' : 's'}</strong> —
     ${b.singletons} occur exactly once. A treatment used once was never designed; it is the
     migration worklist. Each swatch is rebuilt from that element's own extracted values.`,
    `${via}<div class="wall">${cells}</div>`,
  )
}

/* ────────────────────────────── rendered dimensions ────────────────────────── */

function colorSwatches(d, palette) {
  if (!d.values.length) return ''
  const dupeIndex = new Map()
  d.nearDupes.forEach((group, gi) => group.forEach((v) => dupeIndex.set(v, gi)))
  // Near-dupes are placed adjacent — the comparison IS the evidence.
  const ordered = [...d.values].sort((a, b) => {
    const ga = dupeIndex.has(a.value) ? dupeIndex.get(a.value) : 999 + a.count * -1
    const gb = dupeIndex.has(b.value) ? dupeIndex.get(b.value) : 999 + b.count * -1
    return ga - gb
  })
  const cells = ordered.map((v) => {
    const c = cssColor(v.value, palette)
    const dupe = dupeIndex.has(v.value)
    return `<figure class="sw${dupe ? ' is-dupe' : ''}">
      <div class="sw__chip" style="background:${c ? esc(c) : 'repeating-linear-gradient(45deg,#ddd,#ddd 4px,#eee 4px,#eee 8px)'}"></div>
      <figcaption><code>${esc(v.value)}</code><span>${v.count}×</span></figcaption>
    </figure>`
  }).join('')
  const dupeNote = d.nearDupes.length
    ? `<p class="note">${d.nearDupes.length} near-duplicate cluster${d.nearDupes.length > 1 ? 's' : ''} (ΔE00 &lt; 2, outlined) — nobody chose to have both.</p>`
    : ''
  // Say WHY a swatch is hatched. An unexplained placeholder reads as a bug; the
  // truth is that we only resolve the grey ramps, so a named palette colour has
  // no hex to paint — and it is also excluded from near-duplicate detection,
  // which the reader deserves to know before trusting the count.
  const unresolved = ordered.filter((v) => !cssColor(v.value, palette)).length
  const unresolvedNote = unresolved
    ? `<p class="note">${unresolved} of ${d.distinct} values are palette names this scan cannot resolve to a colour (hatched) — they are counted, but excluded from near-duplicate detection.</p>`
    : ''
  return section('Colour', `${d.distinct} distinct values across ${d.events} applications · nEff ${d.nEff} against a budget of ${d.budget}.`, `${dupeNote}${unresolvedNote}<div class="grid grid--sw">${cells}</div>`)
}

function shadowSquares(d) {
  if (!d.values.length) return ''
  const cells = d.values.map((v) => `<figure class="sh">
      <div class="sh__box" style="box-shadow:${esc(v.value)}"></div>
      <figcaption><span>${v.count}×</span><code>${esc(v.value.slice(0, 48))}${v.value.length > 48 ? '…' : ''}</code></figcaption>
    </figure>`).join('')
  return section('Shadow', `${d.distinct} distinct shadows · nEff ${d.nEff} against a budget of ${d.budget}. ${d.singletons.length} occur exactly once.`, `<div class="grid grid--sh">${cells}</div>`)
}

function radiusSquares(d) {
  if (!d.values.length) return ''
  const cells = d.values.map((v) => `<figure class="rd">
      <div class="rd__box" style="border-radius:${esc(v.value)}"></div>
      <figcaption><code>${esc(v.value)}</code><span>${v.count}×</span></figcaption>
    </figure>`).join('')
  return section('Radius', `${d.distinct} distinct radii · nEff ${d.nEff} against a budget of ${d.budget}.`, `<div class="grid grid--rd">${cells}</div>`)
}

function typeSpecimens(d) {
  if (!d.values.length) return ''
  const rows = d.values.slice(0, 40).map((v) => {
    const [size, lh, weight] = v.value.split('/')
    const style = [
      /^[\d.]+(px|rem|em)$/.test(size) ? `font-size:${size}` : '',
      lh && lh !== 'auto' ? `line-height:${lh}` : '',
      weight && weight !== 'auto' ? `font-weight:${weight}` : '',
    ].filter(Boolean).join(';')
    return `<div class="ty">
      <span class="ty__spec" style="${esc(style)}">The quick brown fox</span>
      <code>${esc(v.value)}</code><span class="ty__n">${v.count}×</span>
    </div>`
  }).join('')
  return section('Type', `${d.distinct} distinct size/leading/weight triplets · nEff ${d.nEff} against a budget of ${d.budget}. Counting font-size alone would understate this by roughly half.`, `<div class="tystack">${rows}</div>`)
}

function spacingBars(d) {
  if (!d.values.length) return ''
  const cells = d.values.slice(0, 60).map((v) => {
    const n = parseFloat(v.value)
    const w = Number.isFinite(n) ? Math.min(160, Math.max(2, n)) : 2
    const off = Number.isFinite(n) && n > 0 && n % 4 !== 0
    return `<div class="sp${off ? ' is-off' : ''}">
      <span class="sp__bar" style="width:${w}px"></span>
      <code>${esc(v.value)}</code><span>${v.count}×</span>
    </div>`
  }).join('')
  const note = d.offGridRate ? `<p class="note">${pct(d.offGridRate)} of spacing sits off the 4px grid (highlighted).</p>` : ''
  return section('Spacing', `${d.distinct} distinct values · nEff ${d.nEff} against a budget of ${d.budget}.`, `${note}<div class="grid grid--sp">${cells}</div>`)
}

/* ──────────────────────────────── page assembly ────────────────────────────── */

const section = (title, lead, body) => `<section class="sec">
  <h2>${esc(title)}</h2>
  ${lead ? `<p class="lead">${lead}</p>` : ''}
  ${body}
</section>`

/**
 * "This is your codebase" — deliberately the FIRST thing on the page, above the
 * score. A verdict from a black box is an assertion; a verdict that arrives after
 * the reader has recognised their own stack is evidence. It is also the honest
 * disclosure of what the scan could not see.
 */
function detectedBlock(r) {
  const s = r.meta.stack
  if (!s) return ''
  const chips = []
  if (s.framework) chips.push(s.framework.name + (s.framework.version ? ` ${s.framework.version}` : ''))
  if (s.meta) chips.push(s.meta.name)
  if (s.typescript) chips.push('TypeScript')
  for (const lib of s.componentLibraries) chips.push(lib)

  const rows = s.styling.map((x) => `<li>
      <b>${esc(x.kind)}${x.version ? ` v${esc(x.version)}` : ''}</b>
      <span>${esc(x.detail)}</span>
    </li>`).join('')

  const exts = Object.entries(s.byExt).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([e, n]) => `${n} <code>.${esc(e)}</code>`).join(' · ')

  const unread = Object.entries(r.meta.unreadable)
  return `<section class="detected">
    <h2>Detected</h2>
    ${chips.length ? `<div class="chips">${chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
    ${rows ? `<ul class="stack">${rows}</ul>` : ''}
    <p class="detected__files">${s.files.toLocaleString('en-US')} files scanned — ${exts}</p>
    <p class="detected__cov"><b>${pct(r.meta.parsed)}</b> of styled elements read${
      unread.length ? ` · not readable: ${unread.map(([k, n]) => `${n} ${esc(k)}`).join(' · ')}` : ' — nothing skipped'}</p>
    ${s.componentLibraries.length ? `<p class="note">A component library is in use, so much of the styling may live inside it. Few loose values here does not by itself mean a coherent system.</p>` : ''}
  </section>`
}

/**
 * The two headlines, side by side and equal in weight.
 *
 * They were already two numbers (`AUDIT-HEURISTIC.md` §2.5) — but one was set as
 * a 56px score and the other as a footnote, and that asymmetry let a repo read
 * as healthy while holding 234 one-off treatments. Sprawl is a COUNT, not a
 * score out of 100: there is no calibrated budget for "how many treatments is
 * acceptable", and inventing a scale would fake a precision we do not have.
 */
function headlines(r) {
  const sp = r.sprawl || {}

  // A refusal is a refusal to SCORE, not a refusal to report. Everything we did
  // read still holds as a floor — and it can be the whole finding: twentyhq/twenty
  // refuses on coverage while 31 of its 32 treatments occur exactly once.
  if (r.refused) {
    const floor = sp.treatments
      ? `<div class="hl">
          <div class="hl__n">≥${sp.singletons.toLocaleString('en-US')}</div>
          <div class="hl__lbl">used exactly once<span>of ${sp.treatments.toLocaleString('en-US')} hand-rolled treatments seen</span></div>
        </div>`
      : ''
    return `<section class="headlines">
      <div class="hl__row">
        <div class="hl">
          <div class="hl__n hl__n--none">no score</div>
          <div class="hl__lbl">Consistency<span>withheld — see below</span></div>
        </div>
        ${floor}
      </div>
      <p class="hl__clash"><b>${esc(r.refusal)}</b>
        Everything below is still real, but read it as a <b>floor</b>: it is what we found in the
        ${pct(r.meta.parsed)} of styled elements we could parse, so the true numbers are higher, never lower.</p>
    </section>`
  }

  const sprawlCell = sp.treatments
    ? `<div class="hl">
        <div class="hl__n">${sp.singletons.toLocaleString('en-US')}</div>
        <div class="hl__lbl">used exactly once<span>of ${sp.treatments.toLocaleString('en-US')} hand-rolled treatments${
          sp.componentShare ? ` · ${pct(sp.componentShare)} via components` : ''}</span></div>
      </div>`
    : ''

  const clash = r.headlinesDisagree
    ? `<p class="hl__clash"><b>These two disagree, and that is the finding.</b> The values are under
       control and the components are not — the usual shape of a utility-first codebase, where the
       framework constrains what colours and sizes exist and does nothing about how many one-off
       treatments get written. The consistency score cannot see this; the wall below can.</p>`
    : ''

  return `<section class="headlines">
    <div class="hl__row">
      <div class="hl">
        <div class="hl__n">${r.score}<small>/100</small></div>
        <div class="hl__lbl">Consistency<span>value-level · deterministic · CI-gateable</span></div>
      </div>
      ${sprawlCell}
    </div>
    ${clash}
  </section>`
}

function scoreBoard(r) {
  const DIMS = ['color', 'type', 'spacing', 'radius', 'shadow']
  const rows = DIMS.map((k) => {
    const d = r.dimensions[k]
    const label = { color: 'Colour', type: 'Type', spacing: 'Spacing', radius: 'Radius', shadow: 'Shadow' }[k]
    if (d.insufficient) {
      return `<tr class="is-thin">
        <th>${label}</th><td class="g">–</td><td class="num" colspan="5">only ${d.events} uses — too few to score</td>
      </tr>`
    }
    return `<tr>
      <th>${label}</th>
      <td class="g g--${d.grade}">${d.grade}</td>
      <td class="num">${d.nEff}</td>
      <td class="num dim">${d.budget}</td>
      <td class="num">${d.distinct}</td>
      <td class="num">${d.singletons.length}</td>
      <td class="num">${pct(d.coherence)}</td>
    </tr>`
  }).join('')

  // Framing: not "your score is 34, you're bad" but "your code implies a system
  // of N values; one complete system has M". Both numbers computed, never
  // hardcoded — a wrong sum here would be the easiest thing to catch us on.
  const counted = DIMS.filter((k) => !r.dimensions[k].insufficient)
  const impliedTotal = Math.round(counted.reduce((a, k) => a + r.dimensions[k].nEff, 0))
  const budgetTotal = counted.reduce((a, k) => a + r.dimensions[k].budget, 0)

  return `<section class="board">
    <p class="board__framing">Your code implies a design system of <b>${impliedTotal} values</b>.
      One complete system has <b>${budgetTotal}</b>.</p>
    <table class="tbl">
      <thead><tr><th></th><th>Grade</th><th>nEff</th><th>Budget</th><th>Values</th><th>Once</th><th>Coherence</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`
}

/**
 * The first RELATIONAL finding. Every other section judges values against a
 * budget; this one judges two siblings against each other — the mistake a
 * generator makes constantly and a per-value rule can never see.
 */
function clustersBlock(r) {
  const c = r.clusters
  if (!c || !c.mismatched) return ''
  const rows = c.findings.map((f) => `<li>
      <div class="cl__head"><code>${esc(f.file)}:${f.line}</code>
        <span>differs on ${f.differsOn.map((d) => `<b>${esc(d.replace('class:', ''))}</b>`).join(', ')}</span></div>
      <div class="cl__kids">${f.controls.map((x) =>
        `<span><code>&lt;${esc(x.tag)}&gt;</code> L${x.line} · ${esc(x.height)}</span>`).join('')}</div>
    </li>`).join('')

  return section(
    'Rows that do not line up',
    `<strong>${c.mismatched} of ${c.rows} control rows</strong> hold siblings whose height is set
     differently. A row of controls reads as one object, so the eye catches a few pixels of
     disagreement even when no single value is wrong — which is why no per-value rule finds this.
     Only facets BOTH siblings declare are compared, and only vertical padding counts toward height.`,
    `<ul class="clusters">${rows}</ul>`,
  )
}

function gunsBlock(r) {
  if (!r.flags.length) return ''
  const NAMES = {
    'multiple-icon-libs': 'Multiple icon libraries',
    'multiple-styling-systems': 'Multiple styling systems',
    'duplicate-components': 'Duplicated components',
    'mixed-gray-ramps': 'Mixed grey ramps',
    'multiple-font-families': 'Multiple font families',
    'multiple-font-packages': 'Multiple font packages',
  }
  const items = r.flags.map((f) => `<li><b>${esc(NAMES[f.id] || f.id)}</b><span>${esc(f.detail.join(' · '))}</span></li>`).join('')
  return section('Findings that need no score', 'Binary, and hard to argue with — which is why they are reported separately and never folded into the number.', `<ul class="guns">${items}</ul>`)
}

/**
 * The app's VOCABULARY — which kinds of UI it builds. Deliberately not a score:
 * there is no right number of component kinds, and an app that has no calendar
 * is not worse than one that does. It answers a different question from the
 * headlines above ("how consistent are you") — namely "what are you made of" —
 * and it is the one measurement here that survives a codebase whose values we
 * could not read, because nobody renames <table>.
 *
 * The absent kinds are shown too. A list of only what we found looks like a
 * complete inventory; showing the gaps makes it a measurement.
 */
function kindsBlock(r) {
  if (!r.kinds) return ''
  const all = Object.entries(r.kinds)
  const found = all.filter(([, v]) => v.files > 0).sort((a, b) => b[1].files - a[1].files)
  if (!found.length) return ''
  const absent = all.filter(([, v]) => v.files === 0).map(([k]) => k)
  return section(
    'What this app is made of',
    `<strong>${found.length} of ${all.length} component kinds.</strong> Detected structurally — an element,
     an ARIA role or a component named after the thing — so it holds up whether you style with
     utilities, modules or plain CSS.`,
    `<div class="kinds">${found.map(([k, v]) =>
      `<span class="kind" title="${esc(v.at.join(' · '))}">${esc(k)}<b>${v.files}</b></span>`).join('')}
     </div>${absent.length ? `<p class="kinds__absent">Not found: ${absent.map(esc).join(' · ')}</p>` : ''}`,
  )
}

function coverageBlock(r) {
  const un = Object.entries(r.meta.unreadable)
  const e = r.meta.expressible
  return section('What this covers', '', `<div class="cov">
    <div><b>${pct(r.meta.parsed)}</b><span>of styled elements read</span>
      ${un.length ? `<em>${un.map(([k, n]) => `${n} ${esc(k)}`).join(' · ')} — not supported</em>` : ''}</div>
    <div><b>${e.recipe === null ? '—' : pct(e.recipe)}</b><span>maps onto a kit recipe</span></div>
    <div><b>${e.tokensOnly === null ? '—' : pct(e.tokensOnly)}</b><span>bespoke, but expressible in tokens</span></div>
    <div><b>${e.none === null ? '—' : pct(e.none)}</b><span>no analogue in the vocabulary</span></div>
  </div>
  <p class="note">Scan coverage answers <i>could I read it</i>; expressibility answers <i>can this vocabulary say it</i>.
     Low expressibility is a finding about scope, not a fault in the code.</p>`)
}

const CSS = `
:root{--bg:#fbfbfc;--fg:#16161a;--muted:#6b6b76;--line:#e6e6ec;--card:#fff;--warn:#c2410c;--accent:#0a84ff}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e11;--fg:#f2f2f5;--muted:#9a9aa6;--line:#26262e;--card:#16161b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:48px 24px 96px}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 32px;font-size:14px}
h2{font-size:18px;letter-spacing:-.01em;margin:0 0 6px}
.sec{margin:44px 0;padding-top:28px;border-top:1px solid var(--line)}
.lead{color:var(--muted);margin:0 0 18px;max-width:64ch;font-size:14px}
.note{color:var(--warn);font-size:13px;margin:0 0 14px}
code{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.detected{margin:0 0 40px;padding:20px 22px;background:var(--card);border:1px solid var(--line);border-radius:12px}
.detected h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 12px;font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.chips span{font-size:12px;padding:3px 9px;border:1px solid var(--line);border-radius:999px;background:var(--bg)}
.stack{list-style:none;padding:0;margin:0 0 14px;display:grid;gap:7px}
.stack li{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:14px}
.stack b{font-weight:600}
.stack span{color:var(--muted);font-size:13px}
.detected__files,.detected__cov{margin:0;font-size:13px;color:var(--muted)}
.detected__cov{margin-top:5px}
.detected__cov b{color:var(--fg)}
.headlines{margin:0 0 36px}
.hl__row{display:flex;flex-wrap:wrap;gap:40px}
.hl{min-width:180px}
.hl__n{font-size:56px;font-weight:650;letter-spacing:-.03em;line-height:1}
.hl__n--none{font-size:34px;color:var(--muted);font-weight:600}
.hl__n small{font-size:20px;color:var(--muted);font-weight:400}
.hl__lbl{margin-top:4px;font-size:15px;font-weight:600;display:flex;flex-direction:column;gap:2px}
.hl__lbl span{font-weight:400;font-size:12.5px;color:var(--muted)}
.hl__clash{margin:22px 0 0;padding:13px 15px;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:8px;font-size:13.5px;max-width:76ch}
.board{display:grid;gap:20px}
.board__score{display:flex;align-items:baseline;gap:12px}
.board__n{font-size:56px;font-weight:650;letter-spacing:-.03em;line-height:1}
.board__n small{font-size:20px;color:var(--muted);font-weight:400}
.board__lbl{color:var(--muted);font-size:14px}
.board__framing{margin:0;font-size:15px;max-width:60ch}
.tbl{border-collapse:collapse;width:100%;font-size:14px}
.tbl th,.tbl td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line)}
.tbl thead th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:500}
.num{text-align:right!important;font-variant-numeric:tabular-nums}
.dim{color:var(--muted)}
.g{font-weight:650;text-align:center!important}
.g--A{color:#15803d}.g--B{color:#4d7c0f}.g--C{color:#a16207}.g--D{color:#c2410c}.g--F{color:#b91c1c}
.grid{display:flex;flex-wrap:wrap;gap:14px}
.sw{margin:0;width:92px}
.sw__chip{height:56px;border-radius:8px;border:1px solid var(--line)}
.sw.is-dupe .sw__chip{outline:2px solid var(--warn);outline-offset:2px}
.sw figcaption,.rd figcaption,.sh figcaption{display:flex;flex-direction:column;gap:1px;margin-top:6px;font-size:11px;color:var(--muted)}
.sh{margin:0;width:118px}
.sh__box{height:56px;border-radius:10px;background:var(--card);border:1px solid var(--line)}
.grid--sh{gap:22px;padding:8px 4px}
.rd{margin:0;width:76px}
.rd__box{height:56px;background:var(--card);border:1.5px solid var(--fg);opacity:.85}
.tystack{display:grid;gap:10px}
.ty{display:flex;align-items:baseline;gap:14px;padding:7px 0;border-bottom:1px dotted var(--line)}
.ty__spec{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ty__n{color:var(--muted);font-size:12px;min-width:44px;text-align:right;font-variant-numeric:tabular-nums}
.ty code{color:var(--muted)}
.grid--sp{flex-direction:column;gap:4px}
.sp{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)}
.sp__bar{height:12px;background:var(--accent);opacity:.75;border-radius:2px;flex:none}
.sp.is-off .sp__bar{background:var(--warn)}
.wall{display:flex;flex-wrap:wrap;gap:16px}
.wall__cell{margin:0;width:150px}
.wall__stage{height:64px;display:flex;align-items:center;justify-content:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px;overflow:hidden}
.wall__cell.is-singleton .wall__stage{border-color:var(--warn);border-style:dashed}
.wall__btn{display:inline-block;font-family:inherit;line-height:1;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.wall__unresolved{font:11px/1.3 ui-monospace,Menlo,monospace;color:var(--muted);text-align:center;word-break:break-all}
.wall figcaption{margin-top:6px;font-size:11px;color:var(--muted);display:flex;flex-direction:column;gap:1px;min-width:0}
.wall figcaption b{color:var(--fg);font-weight:600}
/* Paths are long and the cells are narrow — clip instead of letting captions
   run under their neighbours. The full path stays available on hover. */
.wall figcaption span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.clusters{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.clusters li{padding:12px 14px;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:8px}
.cl__head{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;font-size:13px}
.cl__head span{color:var(--muted)}
.cl__head b{color:var(--warn);font-weight:600}
.cl__kids{display:flex;flex-wrap:wrap;gap:14px;margin-top:6px;font-size:12px;color:var(--muted)}
.guns{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.guns li{display:flex;flex-direction:column;gap:2px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:8px}
.guns span{color:var(--muted);font-size:13px}
.kinds{display:flex;flex-wrap:wrap;gap:7px}
.kind{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:550;padding:5px 10px;
  border:1px solid var(--line);border-radius:99px;background:var(--card)}
.kind b{font-weight:650;font-variant-numeric:tabular-nums;color:var(--muted);font-size:11px}
.kinds__absent{margin:12px 0 0;font-size:12px;color:var(--faint)}
.cov{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:14px}
.cov div{padding:14px;background:var(--card);border:1px solid var(--line);border-radius:10px}
.cov b{display:block;font-size:24px;letter-spacing:-.02em}
.cov span{color:var(--muted);font-size:13px}
.cov em{display:block;margin-top:6px;color:var(--warn);font-size:12px;font-style:normal}
footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
`

/** Render the full standalone report. Pure string in, pure string out. */
export function renderReport(r) {
  const d = r.dimensions
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>uicockpit audit — ${r.refused ? 'no score' : `${r.score}/100`}</title>
<style>${CSS}</style></head>
<body><div class="wrap">
<h1>uicockpit audit</h1>
<p class="sub">${r.meta.files.toLocaleString('en-US')} files · ${r.meta.elements.toLocaleString('en-US')} styled elements · profile ${r.meta.profile}${r.meta.vocabVersion ? ` · vocabulary ${r.meta.vocabVersion}` : ''}</p>
${detectedBlock(r)}
${headlines(r)}
${buttonWall(r.components, r.classStyles || {}, r.palette || null)}
${r.refused ? '' : scoreBoard(r)}
${colorSwatches(d.color, r.palette || null)}
${typeSpecimens(d.type)}
${shadowSquares(d.shadow)}
${radiusSquares(d.radius)}
${spacingBars(d.spacing)}
${clustersBlock(r)}
${kindsBlock(r)}
${gunsBlock(r)}
${coverageBlock(r)}
<footer>
  Generated locally by <b>uicockpit audit</b>. Nothing in this file was uploaded — no network calls, no source leaves your machine.<br>
  This measures <b>coherence, not quality</b>: one global button reused everywhere scores perfectly even if it is ugly.
  Near-duplicate metric: ${esc(r.meta.nearDupeMetric.color)} &lt; ${r.meta.nearDupeMetric.threshold}.
</footer>
</div></body></html>
`
}
