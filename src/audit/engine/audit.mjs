/**
 * `uicockpit audit` — the retroactive layer.
 *
 * ── The reframe ──────────────────────────────────────────────────────────────
 * `audit` is `check` with an INVERTED reference.
 *
 *   check:  code ⟷ YOUR contract                → violations
 *   audit:  code ⟷ the contract your code IMPLIES → incoherence
 *
 * It derives the implicit design system out of a codebase and measures how far
 * that codebase sits from its own implicit system. So it works before anyone has
 * chosen a kit — which is the whole point: today the product starts at a default
 * kit and exports outward, and has no answer to "I'm not at the start."
 *
 * ── What it actually returns ─────────────────────────────────────────────────
 * Not a score — a **Config**. `genContract.ts` already says "The Config IS the
 * kit's identity", so finding the dominant value per dimension fills the knobs
 * in. The score then means something better than "how bad are you": it is *how
 * many of your design decisions your codebase can answer by itself*.
 *
 * ── Two rules that keep it credible ──────────────────────────────────────────
 * 1. **100% static.** No model anywhere in the score path. A score that returns
 *    36 on the second run is worthless as a shareable artefact and can never be
 *    a CI gate. Naming clusters is a v1.5 `--explain` job; counting never is.
 * 2. **Report coverage, never go quiet.** Under 70% parsed we refuse to score
 *    rather than publish a number over code we could not read. An audit that
 *    shouts 34/100 while skipping half the source dies the first time someone
 *    notices.
 *
 * `auditFiles()` is PURE over `{path, content}[]` — no Node imports — so the
 * browser shell (PR 3) can bundle it untouched. `runAudit()` is the Node shell.
 */
import {
  GRID, AUDIT_SCAN_EXT, AUDIT_SKIP_FILE,
  extractCss, extractClasses, extractInline, classAttrs,
  extractClassStyles, extractCssVars, resolveVar, detectKinds, detectShell, detectVariants,
  cssModuleBindings, moduleClassAttrs, qualify, deepResolveVar, styledClassNames, walkElements,
  countUnreadable, countReadable, norm, TW_GRAY_RAMPS, UTILITY_RX, cssInJsBlocks,
  DOCS_PATH, ALT_THEME_PATH, THEME_FILE, extractPreprocessorVars, extractThemeObjectVars,
} from './patterns.mjs'
import {
  METRIC, NEAR_DUPE_THRESHOLD, colorDistance, pxDistance, clusterNear, parseColor, toLab, deltaE00,
  resolvePalette, stripAlpha, rgbToOklch, TW_DEFAULT_VERSIONS,
} from './colorspace.mjs'

/* ────────────────────────────── the constants ──────────────────────────────
 * REASONED, NOT YET MEASURED. The contract gives the ceiling and the order of
 * magnitude (a real shipped kit: 5 radii · 6 shadows · 9 type tiers · 13 spacing
 * steps · 62 distinct colour values); the budgets below are a deliberate
 * tightening for the internal-tool archetype — an admin panel does not need 62
 * colours. Calibrate against the with/without pairs under bench/runs before the
 * number goes anywhere public.
 * (NB: never write that glob with a star-slash inside a block comment — it ends
 * the comment early and the next word parses as code. It cost a run here.) */
export const BUDGETS = {
  internal: { color: 16, type: 8, spacing: 10, radius: 5, shadow: 5 },
  product: { color: 30, type: 12, spacing: 13, radius: 5, shadow: 6 },
}

/** Weights follow observed incoherence, not report readability: colour and type
 *  carry the most visual weight. Radius/shadow are the classic AI-slop tells and
 *  earn their keep in the smoking guns instead. */
export const WEIGHTS = { color: 0.25, type: 0.25, spacing: 0.20, radius: 0.15, shadow: 0.15 }

export const DIMENSIONS = ['color', 'type', 'spacing', 'radius', 'shadow']

/** 8× over budget scores 0 — past that, 20× and 40× are equally broken. */
const LOG_CEILING = Math.log2(8)

/** Coherence multiplies from 0.3 (none) to 1.0 (total). The floor is 0.3 and not
 *  0.6 deliberately: 31 greys that fall into 4 clusters get a fine cardinality
 *  and should still be punished hard. */
const COH_FLOOR = 0.3

/** Below this share of readable styled elements we refuse to score. */
export const MIN_PARSED = 0.70

/**
 * A dimension needs at least this many usage events before its score means
 * anything. Without it an ABSENCE of evidence scores as perfect coherence: a
 * repo on MUI/Ant (or any file that simply doesn't set shadows) has almost no
 * loose values, nEff lands at 0, and the curve happily returns 100 — the exact
 * "a design system the audit doesn't recognise scores clean" failure mode.
 * Under-supplied dimensions are reported as `insufficient` and DROPPED from the
 * weighted score, with the remaining weights renormalised.
 */
export const MIN_EVENTS = 12

/* ─────────────────────────────── the maths ─────────────────────────────────── */

/**
 * Effective variant count = perplexity of the usage distribution.
 *
 * Deliberately NOT a unique count: 8 radii where one is used 200× is nEff ≈ 1.3
 * (one system with noise); 8 radii used equally is nEff = 8 (eight systems).
 * And it is SCALE-FREE — multiply every count by 10 and nEff does not move,
 * which is the robustness-against-repo-size the whole design needs, delivered
 * mathematically instead of averaged away.
 */
export function effectiveCount(counts) {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let H = 0
  for (const c of counts) {
    if (c <= 0) continue
    const p = c / total
    H -= p * Math.log(p)
  }
  return Math.exp(H)
}

/** Cardinality score: how far over budget, on a log curve. */
export function cardinalityScore(nEff, budget) {
  if (nEff === 0) return 100
  const r = Math.max(1, nEff / budget)
  return 100 * Math.max(0, 1 - Math.log2(r) / LOG_CEILING)
}

export function grade(score) {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

/* ─────────────────────────── layer A + B per dimension ─────────────────────── */

function tally(events) {
  const byValue = new Map()
  for (const e of events) {
    let entry = byValue.get(e.value)
    if (!entry) { entry = { value: e.value, count: 0, at: [] }; byValue.set(e.value, entry) }
    entry.count++
    if (entry.at.length < 25) entry.at.push(e.at) // cap: a codemod needs addresses, not all 4000
  }
  return [...byValue.values()].sort((a, b) => b.count - a.count)
}

/** Near-duplicates: values nobody MEANT to be different. Colour uses ΔE00 < 2;
 *  lengths < 1px; shadow blur < 2px. This is evidence, not opinion. */
function findNearDupes(dim, values, palette) {
  const names = values.map((v) => v.value)
  if (dim === 'color') return clusterNear(names, colorPairDistance(palette), NEAR_DUPE_THRESHOLD)
  if (dim === 'radius' || dim === 'spacing') return clusterNear(names, pxDistance, 1)
  if (dim === 'shadow') return clusterNear(names, blurDistance, 2)
  return []
}

/**
 * Colour distance for near-duplicate clustering — with one refusal built in.
 *
 * A translucent colour is NOT comparable: `emerald-500/10` renders as whatever
 * it sits on, and we do not know the backdrop. Resolving it to its base (which
 * is right for counting) makes it look identical to `emerald-500`, so a naive
 * comparison reports `emerald-500 · /10 · /20 · /30` as four near-duplicates.
 * They are one deliberate colour used at four opacities — the kind of false
 * positive that loses the first argument with a good engineer. So: if either
 * side carries an alpha modifier, we decline to judge.
 */
const hasAlpha = (v) => /\/[\d.]+%?$/.test(String(v))
const colorPairDistance = (palette) => (a, b) => {
  if (hasAlpha(a) || hasAlpha(b)) return null
  return colorDistance(a, b, palette)
}

/** Compare shadows on their blur radius — the perceptually dominant term. */
function blurDistance(a, b) {
  const blur = (s) => {
    const nums = String(s).match(/-?[\d.]+px/g)
    return nums && nums.length >= 3 ? parseFloat(nums[2]) : nums ? parseFloat(nums[nums.length - 1]) : null
  }
  const ba = blur(a), bb = blur(b)
  return ba !== null && bb !== null ? Math.abs(ba - bb) : null
}

function analyseDimension(dim, events, budget, palette) {
  const values = tally(events)
  const counts = values.map((v) => v.count)
  const total = counts.reduce((a, b) => a + b, 0)
  const nEff = effectiveCount(counts)
  const C = cardinalityScore(nEff, budget)

  // ── coherence: only these three signals may touch the score.
  const tokenised = total ? events.filter((e) => e.tokenized).length / total : 1

  const nearDupes = findNearDupes(dim, values, palette)
  const dupeValues = new Set(nearDupes.flat())
  const dupeMass = total ? events.filter((e) => dupeValues.has(e.value)).length / total : 0

  // Off-grid only means anything for spacing; elsewhere it is not part of the mix.
  let offGrid = null
  if (dim === 'spacing') {
    const px = events.filter((e) => /^-?[\d.]+px$/.test(e.value))
    const off = px.filter((e) => {
      const n = Math.abs(parseFloat(e.value))
      return n > 0 && n % GRID !== 0
    })
    offGrid = px.length ? off.length / px.length : 0
  }

  const parts = [tokenised, 1 - dupeMass]
  if (offGrid !== null) parts.push(1 - offGrid)
  const coherence = parts.reduce((a, b) => a + b, 0) / parts.length

  const score = C * (COH_FLOOR + (1 - COH_FLOOR) * coherence)
  const insufficient = total < MIN_EVENTS

  return {
    insufficient,
    events: total,
    distinct: values.length,
    nEff: round(nEff, 1),
    budget,
    cardinalityScore: round(C, 1),
    coherence: round(coherence, 3),
    tokenisedRate: round(tokenised, 3),
    offGridRate: offGrid === null ? null : round(offGrid, 3),
    nearDupeMass: round(dupeMass, 3),
    score: insufficient ? null : round(score, 1),
    grade: insufficient ? null : grade(score),
    values: values.slice(0, 200),
    // Reported, never scored — too sensitive to repo quirks to carry a number,
    // and it works better as a flat unarguable line in the report.
    singletons: values.filter((v) => v.count === 1).map((v) => v.value),
    nearDupes,
  }
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d

/* ─────────────────────── layer C — component signatures ─────────────────────
 * "47 button variants" has a fatal comeback — "we NEED more than one" — and it
 * is correct: our own contract defines 16. So the measure is not the variant
 * count, it is whether the variants fall on AXES.
 *
 *   A design system is a PRODUCT of small axes.
 *   Drift is a SUM of one-off cases.
 *
 * 16 buttons = {primary, secondary, ghost, outline, danger, link} × {xs…xl}:
 * two axes, fully enumerable. 47 buttons that are each their own class soup is
 * 47 axes of length 1. Hence the line that actually converts:
 *   "47 button treatments — 31 occur exactly once."
 * Layer C NEVER enters the score. It is the conversion sentence, reported apart. */

/** Layout and positioning carry no style identity — drop them from signatures. */
const LAYOUT_RX = /^(flex|inline-flex|grid|inline-grid|block|inline|inline-block|hidden|table|contents|flow-root|list-item|absolute|relative|fixed|sticky|static|isolate|float-\w+|clear-\w+|items-|justify-|content-|self-|place-|order-|col-|row-|basis-|grow|shrink|w-|h-|min-w-|min-h-|max-w-|max-h-|top-|right-|bottom-|left-|inset-|z-|overflow-|object-|aspect-|container|mx-auto|space-[xy]-|divide-)/

const BUTTONISH = /<(button|a)\b([^>]*)>/gi
const INPUTISH = /<(input|select|textarea)\b([^>]*)>/gi

/**
 * Buttons that go through a COMPONENT rather than being hand-rolled.
 *
 * Measured on real code: shadcn-ui/ui has 80 raw `<button>` against 3,070
 * `<Button/>`; cal.com 98 against 536. Counting only raw elements meant the
 * headline artefact was reading a small minority of the buttons in any modern
 * React codebase — and then describing that minority as "134 button
 * treatments", a number the reader cannot reconcile with their own app.
 *
 * The fix is NOT to add component usages to the treatment count: 3,070 usages
 * of one component is not 3,070 treatments, it is the ABSENCE of sprawl. What
 * matters is the ratio between the two, because they describe opposite worlds —
 * a repo that routes every button through one component has already solved this,
 * and a repo where 112 of 134 treatments occur once has not.
 */
const COMPONENTISH = {
  button: /^(?:\w*Button|Btn|\w*Btn|IconButton|ToggleButton|SubmitButton|LinkButton|Cta)$/,
  input: /^(?:\w*Input|TextField|\w*Field|Textarea|TextArea|Select|Combobox|Checkbox|Radio|Switch|Toggle)$/,
  card: /^(?:\w*Card|Panel|Tile|Surface)$/,
}
/** Names that LOOK like the component but are containers or plurals. */
const NOT_A_CONTROL = /^(?:ButtonGroup|Buttons|InputGroup|Inputs|CardGroup|CardHeader|CardTitle|CardContent|CardFooter|CardDescription|FieldGroup|Fieldset|SelectGroup|SelectLabel|SelectContent|SelectItem|SelectTrigger|SelectValue|RadioGroup|CheckboxGroup|ToggleGroup)$/

/** Count `<Xxx …>` usages of control-like components, per kind. */
function countComponentUsages(content) {
  const found = { button: 0, input: 0, card: 0 }
  const names = { button: new Set(), input: new Set(), card: new Set() }
  for (const m of content.matchAll(/<([A-Z][\w.]*)[\s/>]/g)) {
    const name = m[1].split('.').pop()
    if (NOT_A_CONTROL.test(name)) continue
    for (const kind of Object.keys(COMPONENTISH)) {
      if (COMPONENTISH[kind].test(name)) { found[kind]++; names[kind].add(name); break }
    }
  }
  return { found, names }
}

function attrClasses(attrs, bindings = {}, path = '') {
  const m = attrs.match(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/)
  if (m) return (m[1] ?? m[2] ?? m[3] ?? '').split(/\s+/).filter(Boolean)
  // CSS-module binding: `<button className={styles.primary}>`. Without this the
  // wall silently under-reports — a 312-file app showed 4 button treatments.
  const expr = attrs.match(/class(?:Name)?\s*=\s*\{([^}]*)\}/)
  if (!expr) return null
  const found = moduleClassAttrs(path, `className={${expr[1]}}`, bindings)
  return found.length ? found[0].classes : null
}

/** Normalised style signature: style-bearing classes only, sorted, deduped.
 *  Case is folded for plain classes but PRESERVED for module-qualified ones —
 *  those carry a file path, and lower-casing it breaks the lookup that lets the
 *  report paint the swatch. */
function signature(classes) {
  const style = classes
    .map((c) => c.trim())
    .filter((c) => c && !LAYOUT_RX.test(c))
    .map((c) => (c.includes('#') ? c : c.toLowerCase()))
  return [...new Set(style)].sort().join(' ')
}

function collectComponents(files) {
  const kinds = {
    button: new Map(),
    input: new Map(),
    card: new Map(),
  }

  const record = (kind, sig, at) => {
    if (!sig) return
    let e = kinds[kind].get(sig)
    if (!e) { e = { sig, count: 0, at: [] }; kinds[kind].set(sig, e) }
    e.count++
    if (e.at.length < 25) e.at.push(at)
  }

  const lineAt = (content, idx) => content.slice(0, idx).split('\n').length
  const viaComponent = { button: 0, input: 0, card: 0 }
  const componentNames = { button: new Set(), input: new Set(), card: new Set() }

  for (const { path, content } of files) {
    if (/\.(css|scss|less)$/.test(path)) continue
    const bindings = cssModuleBindings(path, content)

    const usages = countComponentUsages(content)
    for (const kind of Object.keys(viaComponent)) {
      viaComponent[kind] += usages.found[kind]
      for (const n of usages.names[kind]) componentNames[kind].add(n)
    }

    for (const m of content.matchAll(BUTTONISH)) {
      const tag = m[1].toLowerCase()
      const attrs = m[2] || ''
      const cls = attrClasses(attrs, bindings, path)
      const isRoleButton = /role\s*=\s*["']button["']/.test(attrs)
      // An <a> only counts when it is styled LIKE a button (background + padding),
      // otherwise every link in the app pollutes the count.
      const looksButton = cls && cls.some((c) => /^bg-/.test(c)) && cls.some((c) => /^p[xytrbl]?-/.test(c))
      if (tag === 'button' || isRoleButton || (tag === 'a' && looksButton)) {
        record('button', signature(cls || []), { file: path, line: lineAt(content, m.index), col: 1 })
      }
    }

    for (const m of content.matchAll(INPUTISH)) {
      const cls = attrClasses(m[2] || '', bindings, path)
      record('input', signature(cls || []), { file: path, line: lineAt(content, m.index), col: 1 })
    }

    // Card-ish container: background + padding + (radius or border/shadow).
    // Walked as ELEMENTS rather than raw class attributes so the tag is known —
    // a `<button className="bg-x p-2 rounded">` satisfies the card test too, and
    // counting it twice inflated the sprawl total by roughly double.
    walkElements(content, (el) => {
      if (controlKind(el.tag)) return
      const classes = attrClasses(el.attrs, bindings, path)
      if (!classes) return
      const has = (rx) => classes.some((c) => rx.test(c))
      if (has(/^bg-/) && has(/^p[xytrbl]?-/) && (has(/^rounded/) || has(/^(border|shadow)/))) {
        record('card', signature(classes), { file: path, line: el.line, col: 1 })
      }
    })
  }

  const out = {}
  for (const [kind, map] of Object.entries(kinds)) {
    const sigs = [...map.values()].sort((a, b) => b.count - a.count)
    const handRolled = sigs.reduce((a, s) => a + s.count, 0)
    const throughComponent = viaComponent[kind]
    const total = handRolled + throughComponent
    out[kind] = {
      // `treatments` counts DISTINCT hand-rolled signatures — the sprawl.
      treatments: sigs.length,
      singletons: sigs.filter((s) => s.count === 1).length,
      // …and these say how much of the codebase never hand-rolls at all.
      handRolled,
      throughComponent,
      componentNames: [...componentNames[kind]].sort().slice(0, 12),
      // The ratio IS the finding: high means this repo already solved it.
      componentShare: total ? round(throughComponent / total, 3) : null,
      signatures: sigs.slice(0, 100),
    }
  }
  return out
}

/* ──────────────────────────── the second headline ────────────────────────────
 * `AUDIT-HEURISTIC.md` §2.5 says two numbers, not one: the consistency score is
 * value-level and CI-gateable, variant sprawl is component-level and is the
 * sentence that converts. They were already separate — but one was rendered as
 * a big 82/100 and the other as a footnote, and that asymmetry is what let a
 * repo read as healthy while holding 82 one-off buttons.
 *
 * So sprawl gets equal billing. Deliberately NOT expressed as a 0-100 score:
 * there is no budget for "how many button treatments is acceptable", and
 * inventing one would fake a calibration we do not have. A count of things that
 * exist exactly once needs no scale to be damning.
 *
 * It also stays OUT of the consistency score, and the reason got stronger today
 * rather than weaker: layer C's numbers moved twice in one session as the
 * detector improved (blind to `<Button/>`, then the ratio). A number that shifts
 * when we improve our own scanner cannot sit behind a CI gate.
 */
function summariseSprawl(components) {
  const kinds = ['button', 'input', 'card']
  let treatments = 0, singletons = 0, handRolled = 0, throughComponent = 0
  const byKind = {}
  for (const k of kinds) {
    const c = components[k]
    if (!c) continue
    treatments += c.treatments
    singletons += c.singletons
    handRolled += c.handRolled
    throughComponent += c.throughComponent
    byKind[k] = { treatments: c.treatments, singletons: c.singletons, componentShare: c.componentShare }
  }
  const total = handRolled + throughComponent
  return {
    treatments,
    singletons,
    singletonRate: treatments ? round(singletons / treatments, 3) : null,
    componentShare: total ? round(throughComponent / total, 3) : null,
    byKind,
  }
}

/**
 * The two headlines disagree — which is the most interesting thing the report
 * can say. It means values are under control and components are not, and it is
 * the normal state of a Tailwind codebase: utilities constrain the values and
 * do nothing about how many one-off treatments get written.
 */
function headlinesContradict(score, sprawl) {
  return score !== null && score >= 70
    && sprawl.treatments >= 10 && sprawl.singletonRate !== null && sprawl.singletonRate >= 0.5
}

/* ────────────────────── relational coherence (sibling rows) ──────────────────
 * The failure this catches, in Alexander's words: a row of buttons at the top —
 * account on the left, sign-in on the right — where the two are not the same
 * height, because nothing in the codebase says they belong together.
 *
 * It is the first RELATIONAL check we have. Every other rule judges one value
 * against the contract; this one judges two siblings against each other, which
 * is the class of mistake a generator makes constantly and a per-value rule can
 * never see.
 *
 * Two deliberate restraints:
 *  · **Reported, never scored.** It rides on an approximate tag scanner and on
 *    a height model that cannot see every source of height. A number that can
 *    be wrong does not belong in a score that has to survive a CI gate.
 *  · **Declines to judge when it cannot read both sides.** Same rule as the
 *    translucent colours: if either sibling's height is unreadable, say nothing
 *    rather than guess. A false "your buttons don't line up" is far more
 *    expensive than a missed one.                                             */

/** Class utilities that decide how tall a control ends up. */
const HEIGHT_RX = /^(?:[\w-]+:)*(h|min-h|size|py|pt|pb|p|text|leading)-/
/** …and the CSS declarations that do the same job in a stylesheet. */
const HEIGHT_PROPS = ['padding', 'font-size', 'line-height']

/**
 * Only the VERTICAL half of a padding shorthand changes a control's height.
 * Comparing the whole string flagged `9px 16px` against `9px 18px` — identical
 * height, different width — which is exactly the false positive that would lose
 * the first argument about this feature.
 */
function verticalPadding(value) {
  const parts = String(value).trim().split(/\s+/)
  if (!parts.length) return null
  if (parts.length === 1) return parts[0]              // all sides
  if (parts.length === 2) return parts[0]              // vertical horizontal
  return `${parts[0]}/${parts[2] ?? parts[0]}`         // top / bottom
}

/** Is this element a control whose height a reader would expect to match? */
function controlKind(tag) {
  const t = tag.toLowerCase()
  if (t === 'button') return 'button'
  if (t === 'input' || t === 'select' || t === 'textarea') return 'input'
  if (/^[A-Z]/.test(tag) && !NOT_A_CONTROL.test(tag)) {
    for (const kind of ['button', 'input']) if (COMPONENTISH[kind].test(tag)) return kind
  }
  return null
}

/**
 * The height-determining facts we can read off this control, as a map.
 *
 * A MAP rather than a string, because two siblings may declare different
 * PROPERTIES rather than different values: if one sets `font-size: 14px` and
 * the other sets none, the second inherits something we cannot see, and calling
 * that a mismatch would be a guess. Comparison happens only on facets both
 * siblings actually declare.
 */
function heightFacets(el, classStyles, bindings, path) {
  const facets = {}

  const cls = attrClasses(el.attrs, bindings, path)
  if (cls) {
    for (const c of cls) {
      const bare = c.replace(/^(?:[\w-]+:)*/, '')
      const m = bare.match(HEIGHT_RX)
      if (m) facets[`class:${bare.split('-')[0]}`] = bare
    }
    for (const c of cls) {
      const decls = classStyles[c]
      if (!decls) continue
      for (const p of HEIGHT_PROPS) {
        if (!decls[p]) continue
        facets[p] = p === 'padding' ? verticalPadding(decls[p]) : decls[p]
      }
    }
  }

  // `<Button size="sm">` — a component's size prop IS its declared height.
  const size = el.attrs.match(/\bsize\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["']([^"']*)["']\s*\})/)
  if (size) facets.size = size[1] ?? size[2] ?? size[3]
  else if (/^[A-Z]/.test(el.tag)) facets.size = 'default'

  return Object.keys(facets).length ? facets : null
}

/** Compare siblings only where they all declare the same facet. */
function facetMismatch(all) {
  const common = Object.keys(all[0]).filter((k) => all.every((f) => k in f))
  if (!common.length) return null
  const differing = common.filter((k) => new Set(all.map((f) => f[k])).size > 1)
  return differing.length ? differing : null
}

/**
 * Find rows of sibling controls whose heights disagree.
 * @returns {{rows:number, mismatched:number, findings:object[]}}
 */
function findControlClusters(files, classStyles) {
  let rows = 0
  const findings = []

  for (const { path, content } of files) {
    if (/\.(css|scss|less)$/.test(path)) continue
    const bindings = cssModuleBindings(path, content)

    // Group controls by the element that contains them.
    const byParent = new Map()
    walkElements(content, (el) => {
      const kind = controlKind(el.tag)
      if (!kind || !el.parent) return
      if (!byParent.has(el.parent)) byParent.set(el.parent, [])
      byParent.get(el.parent).push({ el, kind })
    })

    for (const [parent, kids] of byParent) {
      for (const kind of ['button', 'input']) {
        const group = kids.filter((k) => k.kind === kind)
        if (group.length < 2) continue
        rows++

        const read = group.map((k) => ({
          tag: k.el.tag,
          line: k.el.line,
          facets: heightFacets(k.el, classStyles, bindings, path),
        }))
        // Decline unless every sibling's height is readable at all.
        if (read.some((r) => r.facets === null)) continue
        const differing = facetMismatch(read.map((r) => r.facets))
        if (!differing) continue

        findings.push({
          kind,
          file: path,
          line: parent.line,
          container: parent.tag,
          // Name WHICH facet disagrees — "these two buttons differ on padding"
          // is actionable; "these two buttons differ" is an accusation.
          differsOn: differing,
          controls: read.map((r) => ({
            tag: r.tag,
            line: r.line,
            height: differing.map((k) => `${k}:${r.facets[k]}`).join(' '),
          })),
        })
      }
    }
  }

  return { rows, mismatched: findings.length, findings: findings.slice(0, 50) }
}

/* ───────────────────────────── the smoking guns ─────────────────────────────
 * Binary findings, their own section, NEVER in the score. They convert better
 * than any number because they cannot be relativised. */

/* ──────────────────────────── what we detected ──────────────────────────────
 * Shown BEFORE the verdict, on purpose. A score arriving out of a black box is
 * just an assertion; a score arriving after "React · Tailwind v4 · 1,284
 * utilities across 15 files · 97% read" arrives once the reader has already
 * thought *that is exactly my codebase*. Recognition first, judgement second —
 * and it doubles as an honest disclosure of what the scan could and could not
 * see. Every number here is COUNTED, never inferred from a dependency alone: a
 * package.json entry proves an install, not a usage. */

const FRAMEWORKS = [
  [/^react$/, 'React'], [/^vue$/, 'Vue'], [/^svelte$/, 'Svelte'],
  [/^@angular\/core$/, 'Angular'], [/^solid-js$/, 'Solid'], [/^preact$/, 'Preact'],
]
const META_FRAMEWORKS = [
  [/^next$/, 'Next.js'], [/^nuxt$/, 'Nuxt'], [/^astro$/, 'Astro'],
  [/^@remix-run\/react$/, 'Remix'], [/^@sveltejs\/kit$/, 'SvelteKit'], [/^vite$/, 'Vite'],
]
const CSS_IN_JS = [
  ['styled-components', 'styled-components'], ['@emotion/styled', 'Emotion'],
  ['@stitches/react', 'Stitches'], ['@vanilla-extract/css', 'vanilla-extract'],
]
const COMPONENT_LIBS = ['@mui/material', 'antd', '@chakra-ui/react', '@mantine/core', 'react-bootstrap', '@radix-ui/themes']

const major = (range) => (String(range).match(/(\d+)/) || [])[1] || null

export function detectStack(files, pkg, counts) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const hit = (table) => {
    for (const [rx, name] of table) {
      const key = Object.keys(deps).find((d) => rx.test(d))
      if (key) return { name, version: major(deps[key]) }
    }
    return null
  }

  const byExt = {}
  for (const f of files) {
    const ext = (f.path.match(/\.(\w+)$/) || [, '?'])[1]
    byExt[ext] = (byExt[ext] || 0) + 1
  }

  const plural = (n, one, many = `${one}s`) => `${nf(n)} ${n === 1 ? one : many}`

  const styling = []
  const add = (kind, version, weight, detail) => styling.push({ kind, version, weight, detail })

  if (counts.utilities) add('Tailwind CSS', deps.tailwindcss ? major(deps.tailwindcss) : null, counts.utilities, plural(counts.utilities, 'utility class', 'utility classes'))
  if (counts.moduleFiles) add('CSS Modules', null, counts.moduleBindings, `${plural(counts.moduleFiles, 'module')}, ${plural(counts.moduleRules, 'rule')}, ${plural(counts.moduleBindings, 'binding')}`)
  if (counts.plainCssFiles) add('Plain CSS', null, counts.cssRules, `${plural(counts.plainCssFiles, 'file')}, ${plural(counts.cssRules, 'rule')}`)
  if (counts.inlineStyles) add('Inline styles', null, counts.inlineStyles, plural(counts.inlineStyles, 'declaration'))
  for (const [dep, label] of CSS_IN_JS) {
    if (!deps[dep]) continue
    add(label, null, counts.cssInJsBlocks || 1,
      counts.cssInJsBlocks ? plural(counts.cssInJsBlocks, 'styled block') : 'installed, none found')
  }

  // Sort by how much of the codebase actually uses it, and drop the trace
  // amounts. A dependency that is installed but barely used would otherwise be
  // announced as "your stack" — the fastest way to lose the reader's trust in
  // the very block that exists to earn it.
  styling.sort((a, b) => b.weight - a.weight)
  const dominant = styling.length ? styling[0].weight : 0
  const kept = styling.filter((s, i) => i === 0 || s.weight >= 10 || s.weight >= dominant * 0.02)

  return {
    framework: hit(FRAMEWORKS),
    meta: hit(META_FRAMEWORKS),
    typescript: Boolean(deps.typescript || byExt.tsx || byExt.ts),
    styling: kept,
    // A component library changes what "few loose values" MEANS. Say it out loud
    // rather than quietly scoring a themed repo as clean (AUDIT-HEURISTIC §7.1).
    componentLibraries: COMPONENT_LIBS.filter((d) => deps[d]),
    files: files.length,
    byExt,
  }
}

function smokingGuns(files, pkg, events) {
  const flags = []
  const paths = files.map((f) => f.path)

  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    const iconLibs = Object.keys(deps).filter((d) =>
      /^(lucide-react|react-icons|@heroicons\/|@tabler\/icons|react-feather|@phosphor-icons\/|@radix-ui\/react-icons|iconoir-react|@fortawesome\/)/.test(d))
    if (iconLibs.length >= 2) flags.push({ id: 'multiple-icon-libs', severity: 'high', detail: iconLibs })

    const styleSystems = Object.keys(deps).filter((d) =>
      /^(tailwindcss|styled-components|@emotion\/styled|@stitches\/|sass|less|@vanilla-extract\/)/.test(d))
    if (styleSystems.length >= 2) flags.push({ id: 'multiple-styling-systems', severity: 'high', detail: styleSystems })

    const fontPkgs = Object.keys(deps).filter((d) => /^(@fontsource|next\/font)/.test(d))
    if (fontPkgs.length >= 2) flags.push({ id: 'multiple-font-packages', severity: 'low', detail: fontPkgs })
  }

  // Duplicate components: several Button.tsx / Card.tsx on different paths.
  const byBase = new Map()
  for (const p of paths) {
    const base = p.split(/[/\\]/).pop().replace(/\.\w+$/, '').toLowerCase()
    if (!/^(button|card|input|modal|dialog|badge|avatar|select)$/.test(base)) continue
    if (!byBase.has(base)) byBase.set(base, [])
    byBase.get(base).push(p)
  }
  const dupes = [...byBase.entries()].filter(([, v]) => v.length > 1)
  if (dupes.length) {
    flags.push({ id: 'duplicate-components', severity: 'high', detail: dupes.map(([k, v]) => `${k}: ${v.join(' · ')}`) })
  }

  // ≥3 Tailwind grey ramps side by side — extremely common in AI output and
  // immediately lethal in a report.
  const ramps = new Set()
  for (const e of events) {
    if (e.dim !== 'color') continue
    const m = String(e.value).match(/^(gray|slate|zinc|neutral|stone)-\d{2,3}$/)
    if (m) ramps.add(m[1])
  }
  if (ramps.size >= 3) flags.push({ id: 'mixed-gray-ramps', severity: 'high', detail: [...ramps] })

  // ≥2 non-mono font families.
  const fams = new Set()
  for (const { path, content } of files) {
    if (!/\.(css|scss|less)$/.test(path)) continue
    for (const m of content.matchAll(/font-family\s*:\s*([^;]+);/gi)) {
      const first = m[1].split(',')[0].trim().replace(/["']/g, '').toLowerCase()
      if (first && !/mono|courier|consolas|menlo|var\(/.test(first)) fams.add(first)
    }
  }
  if (fams.size >= 2) flags.push({ id: 'multiple-font-families', severity: 'medium', detail: [...fams] })

  return flags
}

/* ─────────────────────────── the hinge: inferredConfig ──────────────────────
 * The audit does not hand over a score, it hands over a Config — so the
 * configurator opens on the design system the app was already unconsciously
 * trying to be. `confidence: null` means no dominant value, i.e. nobody ever
 * decided this, so the questionnaire (PR 4) must ask. */

const THEME_ANCHORS = {
  mono: '#3b3b42', cobalt: '#0A84FF', sky: '#0EA5E9', teal: '#14B8A6', jade: '#10B981',
  ember: '#F97316', coral: '#EC4899', indigo: '#6366F1', violet: '#8B5CF6', rose: '#F43F5E',
}

/** The share the most-used value holds — our confidence that it was a decision. */
function dominance(values) {
  const total = values.reduce((a, v) => a + v.count, 0)
  if (!total || !values.length) return { value: null, share: null }
  return { value: values[0].value, share: values[0].count / total }
}

const px = (v) => {
  const m = String(v).match(/^(-?[\d.]+)(px|rem)?$/)
  if (!m) return null
  return m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1])
}

function inferConfig(dims, palette, cssVars = {}, varRefs = new Map(), project = '', docsOnly = new Set()) {
  const values = {}
  const confidence = {}
  const MIN_DOMINANCE = 0.4 // below this, nobody decided anything

  // radius → Radius = 'none' | 'subtle' | 'soft' | 'round'
  const r = dominance(dims.radius.values)
  if (r.value && r.share >= MIN_DOMINANCE) {
    const n = px(r.value)
    values.radius = n === null ? 'soft' : n === 0 ? 'none' : n <= 5 ? 'subtle' : n <= 10 ? 'soft' : 'round'
    confidence.radius = round(r.share, 2)
  } else confidence.radius = null

  // shadow presence/softness → Elevation = 'flat' | 'soft' | 'sharp' | 'default'
  const shadowDistinct = dims.shadow.distinct
  if (dims.shadow.events === 0) {
    // "No shadow anywhere" is a real, certain finding, not a failure to decide.
    values.elevation = 'flat'
    confidence.elevation = 1
  } else {
    const s = dominance(dims.shadow.values)
    // Same floor radius and typeScale already respected. Without it this set an
    // elevation off a 14%-dominant shadow — a confident answer to a question the
    // codebase never actually settled.
    if (s.share >= MIN_DOMINANCE) values.elevation = shadowDistinct <= 3 ? 'soft' : 'default'
    confidence.elevation = s.share ? round(s.share, 2) : null
  }

  // body font-size → TypeScale = 'sm' | 'md' | 'lg' | 'xl'
  const t = dominance(dims.type.values)
  if (t.value && t.share >= MIN_DOMINANCE) {
    const size = px(String(t.value).split('/')[0])
    values.typeScale = size === null ? 'md' : size <= 13 ? 'sm' : size <= 15 ? 'md' : size <= 17 ? 'lg' : 'xl'
    confidence.typeScale = round(t.share, 2)
  } else confidence.typeScale = null

  // spacing rhythm → Scale = 'compact' | 'default' | 'comfortable'
  const spacings = dims.spacing.values.map((v) => ({ n: px(v.value), c: v.count })).filter((x) => x.n)
  if (spacings.length) {
    const weighted = spacings.reduce((a, x) => a + x.n * x.c, 0) / spacings.reduce((a, x) => a + x.c, 0)
    values.scale = weighted <= 10 ? 'compact' : weighted <= 18 ? 'default' : 'comfortable'
    confidence.scale = round(Math.min(1, spacings.length / dims.spacing.distinct), 2)
  } else confidence.scale = null

  // dominant brand colour → nearest ColorTheme anchor by ΔE00
  // A DECLARED brand outranks a counted one: naming a colour `--primary` is the
  // decision itself, so it needs no dominance share to be believed. Only when
  // nobody named one do we fall back to counting literals — and that fallback is
  // gated, because ungated it christened our own cobalt product "ember".
  const named = pickNamedBrand(cssVars, palette, varRefs, project, docsOnly)
  const brand = named || pickBrandColor(dims.color.values, palette)
  if (brand) {
    let best = null
    for (const [name, hex] of Object.entries(THEME_ANCHORS)) {
      const d = colorDistance(brand.value, hex, palette)
      if (d !== null && (!best || d < best.d)) best = { name, d }
    }
    // A brand declared only by a docs site is a weak claim about the app: reported,
    // never with the confidence a declaration in the app itself earns. And a
    // COUNTED brand is only as sure as its sample: a share of 1.0 over three
    // literals is not certainty (plausible: #9ae6b4, three chart fills, "1.00").
    const counted = named ? null : Math.min(1, (brand.count ?? 0) / 20)
    confidence.colorTheme = named ? (named.docs ? 0.5 : 1) : round(Math.min(brand.share, counted), 2)
    confidence.colorThemeSource = named ? `declared as ${named.name}${named.docs ? ' — in a docs site, not the app' : ''}` : 'most-used literal colour'
    if (best && (named || brand.share >= MIN_DOMINANCE)) {
      // The nearest anchor names the starting point...
      values.colorTheme = best.name
      /* ...but the EXACT colour is the one they actually declared, and we have
       * it. Snapping documenso's #a2e771 to our jade would hand them a kit that
       * is merely near their brand — which is precisely the drift this tool
       * exists to end. The configurator takes a custom hex, so give it theirs. */
      const exact = toHex(brand.value, palette, 'saturated')
      if (exact) values.brandHex = exact
    }
  }
  if (confidence.colorTheme === undefined) confidence.colorTheme = null

  return { values, confidence }
}

/** The brand colour is the most-used SATURATED colour — greys and near-whites
 *  are surface, not identity.
 *
 *  `share` is measured against the OTHER SATURATED colours, not against every
 *  colour in the codebase. Greys are not candidates for the brand, so counting
 *  them in the denominator made every share look tiny and incomparable between
 *  a grey-heavy admin panel and a colourful marketing page. What we want to know
 *  is narrower and answerable: among the colours that could be an identity, does
 *  one dominate? */
/** Names a codebase gives its own identity. Deliberately narrow: `--primary`
 *  and `--brand` are declarations, while `--primary-hover` or `--accent-border`
 *  are derivations OF one, and `--primary-foreground` (shadcn) is the ink that
 *  goes ON it — usually near-white, and never the brand. */
/*  A trailing `-default` / `-base` / `-main` is a RAMP POSITION, not a scope:
 *  plane's brand lives in `--brand-default`, and requiring the name to end in
 *  the brand word left only `--txt-link-primary` — an alias of it — as the
 *  candidate, so their identity came back as the colour of a hyperlink. */
// `--primary`, `--color-primary`, `--brand`, `--app-accent` — and the same names
// as SCSS/Less variables (`$primary`, `@brand`) or theme-object keys.
const BRAND_VAR = /^(?:--?|[$@])(?:[\w-]*?-)?(?:brand|primary|accent)(?:-(?:default|base|main))?$/i

/* Component-SCOPED tokens that happen to end in a brand-ish word. shadcn ships
 * every one of these with a default, and most apps never touch them — so
 * `--sidebar-primary` is not a declaration of anything, it is the colour of one
 * widget that came with the library. Reading it as a brand made two entirely
 * different products report the same indigo, which is what gave it away.
 *
 * A prefix like `--color-` or `--app-` is a NAMESPACE and stays allowed; these
 * are the fixed set of shadcn component scopes. */
const SCOPED_VAR = /^--?(?:sidebar|card|popover|muted|destructive|input|ring|chart|border|secondary)-/i

/** A name that says WHERE a colour is painted rather than WHAT it is. plane
 *  aliases its identity onto `--txt-link-primary`; read as a declaration, their
 *  brand became the colour of a hyperlink. Applies to every picker: a link, an
 *  icon or a hover state is a USE of a decision, never the decision. */
const USAGE_VAR = /^--?(?:[\w-]*?-)?(?:txt|text|link|icon|fill|stroke|shadow|outline|hover|active|focus|disabled|selected|placeholder|caret|scrollbar|gradient)-/i

/** And the ROLE scopes, which only the surface picker excludes:
 *  `--primary-foreground` is the ink that goes ON the brand, and reading it as
 *  the page's ink handed documenso a near-black GREEN for their body text —
 *  their lime, darkened until it was legible on itself. The brand picker must
 *  NOT exclude these, or `--brand-primary` stops being a brand declaration. */
const ROLE_VAR = /^--?(?:primary|accent|brand|success|warning|error|danger|info)-/i

/** A status colour anywhere in the name disqualifies it. `--bg-danger-primary`
 *  ends in `primary` and is a red; nobody's identity is their error state. */
const STATUS_VAR = /(?:^|-)(?:danger|success|warning|error|info|destructive|critical|positive|negative)(?:-|$)/i

/**
 * A colour the codebase NAMED as its identity, which beats one it merely used
 * often. This matters more the better the codebase is: tokenise your brand
 * properly and the only literal colours left are incidental — status ambers,
 * chart series — so counting literals reliably picks the wrong colour on
 * exactly the repos that did the most things right. Asking "what did you call
 * your brand" is the question a human would ask first.
 */
/* The theme namespaces of documentation frameworks — a `--ifm-*` (Docusaurus),
 * `--vp-*` (VitePress), `--sl-*` (Starlight), `--md-*` (mkdocs-material)
 * variable describes the docs site's look. Never a brand candidate while any
 * other declaration exists. */
/* Tailwind generation markers — see auditFiles. Single or double quotes, both
 * appear in the wild (plausible writes `@import 'tailwindcss'`). */
const TW_V4_MARK = /@import\s+["']tailwindcss(?:\/[\w-]+)?["']|@theme\b|@utility\b|@custom-variant\b/
const TW_V3_MARK = /@tailwind\s+(?:base|components|utilities)\b/

const DOCS_FRAMEWORK_VAR = /^--(?:ifm|vp|sl|md|docsearch|docusaurus|vitepress|starlight|mkdocs)-/i
function pickNamedBrand(cssVars, palette, varRefs = new Map(), project = '', docsOnly = new Set()) {
  const hits = []
  for (const [name, raw] of Object.entries(cssVars)) {
    if (!BRAND_VAR.test(name) || SCOPED_VAR.test(name) || USAGE_VAR.test(name) || STATUS_VAR.test(name)) continue
    const value = deepResolveVar(raw, cssVars)
    const lab = toLab(value, palette)
    if (!lab) continue
    if (Math.hypot(lab[1], lab[2]) <= 25 || lab[0] <= 15 || lab[0] >= 92) continue
    hits.push({
      name,
      value,
      refs: varRefs.get(name) || 0,
      // A token that carries the product's own name is the product saying so.
      mine: project.length > 2 && name.toLowerCase().includes(project) ? 1 : 0,
      // A docs-framework token, or one declared only under docs/, answers last.
      docs: DOCS_FRAMEWORK_VAR.test(name) || docsOnly.has(name) ? 1 : 0,
    })
  }
  if (!hits.length) return null
  hits.sort((a, b) => a.docs - b.docs || b.refs - a.refs || b.mine - a.mine || a.name.length - b.name.length)
  if (hits[0].docs) return { value: hits[0].value, name: hits[0].name, docs: true }
  /* Reach, then self-naming, then length.
   *
   * Reach first: n8n's `--color--primary` is read in 347 places and `--accent`
   * in nine, and shortest-name-wins handed their users a periwinkle identity
   * for an orange product.
   *
   * Self-naming settles what reach cannot. formbricks declares three brand-ish
   * tokens that nothing references — two tealsvand an indigo — and the indigo is
   * the overridable placeholder inside their embeddable survey widget. Between
   * `--brand-default` and `--formbricks-brand`, only one of them claims to be
   * anyone's in particular. `--cal-*` and `--n8n-*` are the same convention. */
  return { value: hits[0].value, name: hits[0].name }
}

function pickBrandColor(values, palette) {
  const saturated = []
  for (const v of values) {
    const lab = toLab(v.value, palette)
    if (!lab) continue
    if (Math.hypot(lab[1], lab[2]) > 25 && lab[0] > 15 && lab[0] < 92) {
      const rgb = parseColor(stripAlpha(String(v.value)), palette)
      saturated.push({ ...v, hue: rgb ? rgbToOklch(...rgb)[2] : null })
    }
  }
  if (!saturated.length) return null
  const total = saturated.reduce((a, v) => a + v.count, 0)
  /* A ramp is ONE decision. `indigo-600` ×29, `indigo-500` ×27 and `indigo-700`
   * ×9 are the brand, its hover and its active — counted as three rivals no
   * shade reached dominance and plausible was reported as having decided
   * nothing (share 0.25). Shades are grouped into hue FAMILIES on OKLCH hue,
   * the axis Tailwind holds constant along a ramp (indigo 277° through
   * 400–700; blue sits at 260°, violet at 293°): ±10° keeps every default ramp
   * apart from its neighbours and holds a ramp together. The family's most-used
   * shade is the brand it reports — the exact colour they wrote most. Seeded
   * greedily by count, so the biggest decision claims its neighbourhood first. */
  const HUE_TOL = 10
  const near = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) <= HUE_TOL }
  const families = []
  for (const v of [...saturated].sort((a, b) => b.count - a.count)) {
    const fam = v.hue == null ? null : families.find((f) => f.hue != null && near(f.hue, v.hue))
    if (fam) { fam.count += v.count; fam.members.push(v) } else families.push({ hue: v.hue, count: v.count, top: v, members: [v] })
  }
  const best = families.reduce((a, f) => (f.count > a.count ? f : a), families[0])
  return { value: best.top.value, share: total ? best.count / total : 0, count: best.count, shades: best.members.length }
}

/** A length a browser will accept verbatim. */
function isCssLength(v) {
  return typeof v === 'string' && /^-?[\d.]+(px|rem|em|%)$/.test(v)
}

/** Resolve a measured colour to a hex a browser can render, keeping only the
 *  SATURATED ones — greys are an app's surfaces, not its decisions. */
function toHex(value, palette, want = 'saturated') {
  const rgb = parseColor(stripAlpha(String(value)), palette)
  if (!rgb) return null
  const [r, g, b] = rgb
  // 60, not 30: slate spans 39, and slate is a surface decision rather than an
  // identity one. The two lists are used for different jobs and must not mix.
  const spread = Math.max(r, g, b) - Math.min(r, g, b)
  if (want === 'saturated' ? spread < 60 : spread >= 60) return null
  return '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
}

const hexLum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

/** Decide an app's polarity from its backgrounds, then take the page from the
 *  end of the ramp that polarity implies. */
function pageSurface(bgs) {
  if (!bgs.length) return { bg: null, polarity: null }
  const dark = bgs.filter((h) => hexLum(h) < 0.5).length
  const polarity = dark > bgs.length / 2 ? 'dark' : 'light'
  const sorted = [...bgs].sort((a, b) => hexLum(b) - hexLum(a))
  return { bg: polarity === 'dark' ? sorted[sorted.length - 1] : sorted[0], polarity }
}

/** WCAG-ish relative contrast between two hexes. */
function ratio(a, b) {
  const l = (h) => {
    const n = parseInt(h.slice(1), 16)
    const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
  }
  const [x, y] = [l(a), l(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * The page's INK, and an edge that separates on it.
 *
 * Ink is not the busiest legible text colour — it is the FURTHEST one from the
 * page that still has real usage. Frequency picks the muted grey every time,
 * because every card carries one heading and three secondary lines: formbricks'
 * busiest legible fg is slate-500 at 407 uses, and their actual body ink is
 * slate-900 at 257. Taking the extreme is not a tiebreak dressed up as a rule —
 * an app's muted greys are DERIVED from its ink by fading toward the page, so
 * the far end of the legible ramp is the ink by construction, and it is exactly
 * the input the palette then re-derives the muted steps from.
 *
 * The support floor is what keeps a single `#000000` in an SVG from winning.
 */
function inkAndEdge(fgs, borders, bg) {
  const hexes = fgs.map(([h]) => h)
  if (!bg) return { fg: hexes[0] || null, border: borders[0] || null }
  const legible = (bar) => fgs.filter(([h]) => ratio(h, bg) >= bar)
  const pool = legible(4.5).length ? legible(4.5) : legible(3)
  let fg = null
  if (pool.length) {
    const floor = Math.max(2, pool[0][1] * 0.1)
    const supported = pool.filter(([, n]) => n >= floor)
    fg = (supported.length ? supported : pool)
      .reduce((a, c) => (ratio(c[0], bg) > ratio(a[0], bg) ? c : a))[0]
  }
  return {
    fg,
    // A border only has to separate, not to be read — a lower bar, but it still
    // has to be visible, and the busiest one often is not.
    border: borders.find((h) => ratio(h, bg) >= 1.2 && ratio(h, bg) <= 6) || borders[0] || null,
  }
}

/**
 * The page, ink and edge a codebase NAMED, which beats the ones it happened to
 * use most — the same reason a declared brand beats a counted one, and it bites
 * harder here: documenso's literal fg colours number eleven in total, because
 * everything real lives in `--foreground`. Component-scoped names are excluded
 * for the same reason as the brand (`--card-foreground` ships with shadcn), and
 * a declared pair still has to be legible against itself before it is believed.
 */
const SURFACE_VAR = {
  bg: /^--?(?:[\w-]*?-)?(?:background|bg|canvas|page|surface)$/i,
  fg: /^--?(?:[\w-]*?-)?(?:foreground|fg|text|ink|body-color)$/i,
  border: /^--?(?:[\w-]*?-)?(?:border|border-color|divider|outline)$/i,
}
function declaredSurface(cssVars, palette, varRefs) {
  const out = { bg: null, fg: null, border: null }
  for (const role of ['bg', 'fg', 'border']) {
    const hits = []
    for (const [name, raw] of Object.entries(cssVars)) {
      if (!SURFACE_VAR[role].test(name) || SCOPED_VAR.test(name) || ROLE_VAR.test(name) || USAGE_VAR.test(name)) continue
      const hex = toHex(deepResolveVar(raw, cssVars), palette, 'neutral')
      if (hex) hits.push({ name, hex, refs: varRefs.get(name) || 0 })
    }
    /* Authority is how much of the codebase actually READS a token, not how
     * short its name is. n8n declares `--bg: #0d1117` inside a script that
     * generates HTML evaluation reports, and `--color-*` throughout the design
     * system its editor is built from; name length crowned the report, and the
     * app came back as a GitHub-dark canvas it has never rendered. Length still
     * breaks ties, where `--background` beats `--color-app-background`. */
    hits.sort((a, b) => b.refs - a.refs || a.name.length - b.name.length)
    out[role] = hits.length ? hits[0].hex : null
  }
  // A declared page with unreadable declared ink is not a theme we understood —
  // most likely two halves of different blocks. Keep neither.
  if (out.bg && out.fg && ratio(out.bg, out.fg) < 3) { out.bg = null; out.fg = null }
  return out
}

/** Most-used colours for one measured ROLE with their counts, busiest first. */
function roleTally(events, role, palette, want) {
  const raw = new Map()
  for (const e of events) {
    if (e.dim !== 'color' || e.role !== role) continue
    raw.set(e.value, (raw.get(e.value) || 0) + 1)
  }
  // Merge AFTER conversion: `#fff`, `white` and `rgb(255,255,255)` are one
  // decision counted three ways, and splitting them understates the real one.
  const byHex = new Map()
  for (const [v, n] of raw) {
    const hex = toHex(v, palette, want)
    if (hex) byHex.set(hex, (byHex.get(hex) || 0) + n)
  }
  return [...byHex.entries()].sort((a, b) => b[1] - a[1])
}

/** Just the hexes, busiest first. */
const roleHexes = (events, role, palette, want) => roleTally(events, role, palette, want).map(([h]) => h)

/* ──────────────────────────────── the engine ───────────────────────────────── */

/**
 * Audit a set of files. PURE — no Node imports, no I/O, no clock.
 *
 * @param {{path:string, content:string}[]} files
 * @param {{profile?: 'internal'|'product', vocabulary?: object, pkg?: object}} [opts]
 */
export function auditFiles(files, opts = {}) {
  const profile = opts.profile === 'product' ? 'product' : 'internal'
  const budgets = BUDGETS[profile]
  const vocab = opts.vocabulary?.classes || {}
  const vocabVersion = opts.vocabulary?.vocabVersion || null

  const events = []
  let readable = 0
  const unreadable = {}
  const expressible = { recipe: 0, tokensOnly: 0, layout: 0, none: 0 }
  const elements = []
  const styledClasses = new Set()
  // Collected so the report can PAINT plain-CSS components instead of printing
  // their class names — the wall only converts if you can see the buttons.
  const classStyles = {}
  const cssVars = {}
  // Counted evidence for the detected-stack summary (never inferred from deps).
  const tally = { utilities: 0, moduleFiles: 0, moduleBindings: 0, moduleRules: 0, plainCssFiles: 0, cssRules: 0, inlineStyles: 0, cssInJsBlocks: 0 }

  /* A monorepo often carries a second product: a docs site (Docusaurus,
   * VitePress, Starlight, mkdocs), a marketing website, a Storybook. Their
   * theme variables are THEIR design system, not the app's — immich's docs
   * declared `--ifm-color-primary` and the reader crowned it the brand of a
   * photo app. Variables from those paths are kept, but merged UNDER the app's:
   * they answer only when nothing else does, and the brand pick says so. */
  const docsVars = {}
  /* And a theme FILE — `themes/_dark.scss`, `theme/dark.ts` — is the alternate
   * scope by path, where extractCssVars can only see it by selector: directus
   * redeclares `$purple: #86f` for dark in a file of its own, and last-file-wins
   * reported the dark purple as the brand. Alternate-theme files merge UNDER
   * the base, exactly as a `.dark {}` block does. */
  const altVars = {}
  const isDocsPath = (p) => DOCS_PATH.test(p)
  const isAltThemePath = (p) => ALT_THEME_PATH.test(p)
  const bagFor = (p) => (isDocsPath(p) ? docsVars : isAltThemePath(p) ? altVars : cssVars)
  /* Which Tailwind generation the CSS says it is on — decides which SHIPPED
   * defaults stand in for the palette when the repo has no node_modules to read
   * (a shallow clone, a browser drop, a Phoenix app with a standalone binary).
   * v4 declares itself in CSS (`@import "tailwindcss"`, `@theme`, `@utility`,
   * `@custom-variant`); v3 with `@tailwind base|components|utilities`. */
  const twMarks = { v4: 0, v3: 0 }
  const absorbCss = (path, css) => {
    if (TW_V4_MARK.test(css)) twMarks.v4++
    if (TW_V3_MARK.test(css)) twMarks.v3++
    events.push(...extractCss(path, css))
    Object.assign(bagFor(path), extractCssVars(css))
    // SCSS/Less variables are token sources too: `$purple: #64f;` is a
    // declaration exactly like `--purple: #64f`, in an older notation.
    if (/\.(scss|less)$/.test(path)) Object.assign(bagFor(path), extractPreprocessorVars(css))
    // CSS Modules are file-scoped, so their classes are stored qualified —
    // `Card.module.css#title` — and never merged with an identically named
    // class from another module.
    const isModule = /\.module\.(css|scss|less)$/.test(path)
    for (const [cls, decls] of Object.entries(extractClassStyles(css))) {
      const key = isModule ? qualify(path, cls) : cls
      classStyles[key] = { ...(classStyles[key] || {}), ...decls }
    }
    for (const cls of styledClassNames(css)) styledClasses.add(isModule ? qualify(path, cls) : cls)
  }

  // ── Pass 0: theme OBJECTS. A theme.ts / tokens.js declares values by key —
  // `accent: "#0366d6"` — that CSS-in-JS then reads by name (`s("accent")`,
  // `theme.accent`). Read first, into the same bag as custom properties, so the
  // declaration is known before any reference asks for it.
  for (const { path, content } of files) {
    if (!THEME_FILE.test(path)) continue
    const vars = extractThemeObjectVars(content)
    if (Object.keys(vars).length) Object.assign(bagFor(path), vars)
  }

  // ── Pass 1: stylesheets first. A component file can be walked before the
  // module it imports, so every class must be known before any element asks
  // whether the class it points at actually paints anything.
  for (const { path, content } of files) {
    if (!/\.(css|scss|less)$/.test(path)) continue
    const rules = countReadable(path, content)
    readable += rules
    // Attribute rules to the idiom that owns them, or "9 plain CSS files" ends
    // up reporting a rule count that includes every CSS module.
    if (/\.module\.(css|scss|less)$/.test(path)) { tally.moduleFiles++; tally.moduleRules += rules }
    else { tally.plainCssFiles++; tally.cssRules += rules }
    for (const [k, n] of Object.entries(countUnreadable(path, content))) {
      unreadable[k] = (unreadable[k] || 0) + n
    }
    absorbCss(path, content)
  }

  // ── Pass 2: everything that carries markup.
  for (const { path, content } of files) {
    if (/\.(css|scss|less)$/.test(path)) continue

    // Elements styled through a CSS-module binding are READABLE: their values
    // live in the .module.css we scanned. Counting them as a blind spot is what
    // pushed a real repo to 72% coverage and nearly triggered a false refusal.
    const bindings = cssModuleBindings(path, content)
    const moduleEls = moduleClassAttrs(path, content, bindings)

    readable += countReadable(path, content, moduleEls.length)
    for (const [k, n] of Object.entries(countUnreadable(path, content, moduleEls.length))) {
      unreadable[k] = (unreadable[k] || 0) + n
    }

    tally.moduleBindings += moduleEls.length

    // Every styled element is collected now and BUCKETED LATER — an element's
    // styling may live in a stylesheet the walker has not reached yet, and for
    // a CSS/SCSS codebase that stylesheet is where all of it lives.
    for (const { classes, at } of classAttrs(path, content)) {
      const evs = extractClasses(classes, at)
      events.push(...evs)
      for (const c of classes) if (UTILITY_RX.test(c)) tally.utilities++
      elements.push({ classes, valueCarrying: evs.length > 0 })
    }
    for (const { classes } of moduleEls) elements.push({ classes, valueCarrying: false })

    // CSS-in-JS: the template body IS css once interpolations are rewritten, so
    // it goes through the same extractor as a stylesheet. A theme path becomes a
    // var()-shaped token reference, which is what it actually is.
    const cssInJs = cssInJsBlocks(content)
    for (const css of cssInJs) absorbCss(path, css)
    if (cssInJs.length) {
      tally.cssInJsBlocks += cssInJs.length
      readable += cssInJs.length
    }

    const inline = extractInline(path, content)
    tally.inlineStyles += inline.length
    events.push(...inline)
    // HTML files also carry CSS-ish styling in <style> blocks.
    for (const m of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) absorbCss(path, m[1])
  }

  /* ── expressibility, decided once every stylesheet has been read ────────────
   * The question §9 needs answered is "can this vocabulary say what this element
   * is doing" — NOT "does this element's class attribute happen to carry values".
   * The first version asked the second question, so any CSS or SCSS codebase came
   * back at ~100% `none` regardless of what it actually rendered: Excalidraw
   * scored 99% and it looked like beautiful evidence for the chrome-vs-canvas
   * thesis, when it was only measuring that the values live in a stylesheet.
   * An instrument that returns the desired answer for the wrong reason is worse
   * than no instrument.
   *
   * So an element is judged on the styling that REACHES it, wherever authored:
   *   recipe     — a class root the kit already has a component for
   *   tokensOnly — bespoke, but it paints (colour · type · spacing · radius ·
   *                shadow · border) and every one of those is token-expressible
   *   none       — styled, yet nothing our vocabulary can express: pure layout,
   *                transforms, cursors, canvas positioning
   * That last bucket is now a real reading of the chrome/canvas line rather than
   * a restatement of which file the CSS sits in. */
  const rootOf = (c) => c.split('#').pop().split('--')[0].split('__')[0].replace(/^.*:/, '')
  for (const el of elements) {
    const hasRecipe = el.classes.some((c) => Object.prototype.hasOwnProperty.call(vocab, rootOf(c)))
    const painted = el.valueCarrying
      || el.classes.some((c) => classStyles[c] && Object.keys(classStyles[c]).length)
    if (hasRecipe) { expressible.recipe++; continue }
    if (painted) { expressible.tokensOnly++; continue }
    // Styled somewhere, but in ways no token can say — transforms, cursors,
    // clip-paths, canvas positioning. THIS is the §9 signal.
    if (el.classes.some((c) => styledClasses.has(c))) { expressible.none++; continue }
    // Never styled at all: a flex wrapper is structure, not a failure of our
    // vocabulary, and lumping it in with the canvas case inflates `none` by
    // 20-40% on any normal React app.
    expressible.layout++
  }

  // Collapse token chains now that every definition has been seen. Done as a
  // post-pass on purpose: a custom property is regularly defined in a file the
  // walker reaches after the one that uses it.
  for (const e of events) {
    if (typeof e.value === 'string' && e.value.startsWith('--')) {
      const literal = deepResolveVar(e.value, cssVars)
      if (literal !== e.value) e.value = norm(literal)
    }
  }

  // The palette the repo actually uses: its own @theme / :root overrides beat the
  // Tailwind build installed alongside it (that version's numbers, read from
  // node_modules), which beats the defaults Tailwind ships for the generation
  // its CSS declares — generated from Tailwind's published files, never typed
  // (src/tw-palette.mjs) — which beat our grey ramps. Which source answered is
  // said in meta.palette, because a default is a fallback and the report should
  // not dress it up as a reading of the repo.
  const installed = opts.palette && Object.keys(opts.palette).length ? opts.palette : null
  const generation = opts.tailwind === null ? null : opts.tailwind || (twMarks.v4 ? 'v4' : twMarks.v3 ? 'v3' : 'v4')
  const palette = resolvePalette(cssVars, installed || {}, installed ? null : generation)
  const paletteSource = installed
    ? 'installed'
    : !generation
      ? 'none'
      : !tally.utilities && !twMarks.v4 && !twMarks.v3
        ? 'none needed (no Tailwind utilities read)'
        : `tailwind ${generation} defaults (${TW_DEFAULT_VERSIONS[generation]}${twMarks.v4 || twMarks.v3 ? `, ${twMarks.v4 ? '@import "tailwindcss"/@theme' : '@tailwind'} seen` : ', assumed — no marker seen'})`

  // Flatten var() once, so the report never has to know about the cascade.
  const resolvedStyles = {}
  for (const [cls, decls] of Object.entries(classStyles)) {
    const flat = {}
    for (const [p, v] of Object.entries(decls)) flat[p] = resolveVar(v, cssVars)
    resolvedStyles[cls] = flat
  }

  const unreadableTotal = Object.values(unreadable).reduce((a, b) => a + b, 0)
  const styledElements = readable + unreadableTotal
  const parsed = styledElements ? readable / styledElements : 1

  const dimensions = {}
  for (const dim of DIMENSIONS) {
    dimensions[dim] = analyseDimension(dim, events.filter((e) => e.dim === dim), budgets[dim], palette)
  }

  // Only dimensions with enough evidence may move the number; the rest are
  // reported as insufficient and their weight is redistributed, so "we found
  // nothing here" can never be mistaken for "this is perfect".
  const scored = DIMENSIONS.filter((d) => !dimensions[d].insufficient)
  const weightSum = scored.reduce((a, d) => a + WEIGHTS[d], 0)
  const score = weightSum
    ? scored.reduce((a, d) => a + WEIGHTS[d] * dimensions[d].score, 0) / weightSum
    : null

  const expressibleTotal = expressible.recipe + expressible.tokensOnly + expressible.layout + expressible.none
  const share = (n) => (expressibleTotal ? round(n / expressibleTotal, 3) : null)

  /* What the product calls itself, from its own package.json — `@acme/web`
   *  becomes `web`, and a scope-only name is ignored. Used for one thing: a
   *  token named after the product is the product claiming it. */
  const projectName = String(opts.pkg?.name || '').split('/').pop().replace(/[^a-z0-9]/gi, '').toLowerCase()

  // How often each custom property is READ. A token's authority is its reach.
  // A read inside a docs-site path counts for a docs token only, so a Docusaurus
  // theme cannot out-reach the app by being referenced all over its own docs.
  const varRefs = new Map()
  const docsRefs = new Map()
  for (const { path, content } of files) {
    const bag = isDocsPath(path) ? docsRefs : varRefs
    for (const m of content.matchAll(/var\(\s*(--[\w-]+)/g)) {
      bag.set(m[1], (bag.get(m[1]) || 0) + 1)
    }
  }
  const docsOnly = new Set(Object.keys(docsVars).filter((k) => !(k in cssVars) && !(k in altVars)))
  Object.assign(cssVars, { ...docsVars, ...altVars, ...cssVars })
  for (const [k, n] of docsRefs) if (!varRefs.has(k) && docsOnly.has(k)) varRefs.set(k, 0)   // reach 0: it answers last

  /* The page, its ink and its edge — declared first, counted where nothing was
   * declared. Per role rather than all-or-nothing: a repo can name its page and
   * still leave its borders to literals, and taking the pair as a unit would
   * throw away the half it did name. Polarity always follows whichever page we
   * ended up believing, so the two can never disagree. */
  const counted = {
    ...pageSurface(roleHexes(events, 'bg', palette, 'neutral')),
    ...inkAndEdge(
      roleTally(events, 'fg', palette, 'neutral'),
      roleHexes(events, 'border', palette, 'neutral'),
      pageSurface(roleHexes(events, 'bg', palette, 'neutral')).bg,
    ),
  }
  const named = declaredSurface(cssVars, palette, varRefs)
  const surfaces = {
    bg: named.bg || counted.bg,
    fg: named.fg || counted.fg,
    border: named.border || counted.border,
  }
  surfaces.polarity = surfaces.bg ? (hexLum(surfaces.bg) < 0.5 ? 'dark' : 'light') : null

  const result = {
    meta: {
      files: files.length,
      elements: styledElements,
      profile,
      // Recognition before judgement — see detectStack().
      stack: detectStack(files, opts.pkg, tally),
      parsed: round(parsed, 3),
      unreadable,
      // parsed = "could I read it" (a scanner problem).
      // expressible = "can my vocabulary even say this" (a product question —
      // the biggest open one in the plan; this field is how it gets answered
      // with data instead of opinion). Low expressible is a FINDING, not a fault.
      expressible: {
        recipe: share(expressible.recipe),
        tokensOnly: share(expressible.tokensOnly),
        layout: share(expressible.layout),
        none: share(expressible.none),
        counts: { ...expressible },
      },
      vocabVersion,
      // Where the colour behind a Tailwind NAME came from: 'installed' (that
      // repo's node_modules), 'tailwind v4 defaults (…)' (shipped, generated) or
      // 'none'. A default is honest only when it is labelled one.
      palette: paletteSource,
      nearDupeMetric: { color: METRIC, threshold: NEAR_DUPE_THRESHOLD, length: 'px', lengthThreshold: 1, shadow: 'blur-px', shadowThreshold: 2 },
    },
    score: score === null ? null : round(score, 0),
    grade: score === null ? null : grade(score),
    scoredDimensions: scored,
    insufficientDimensions: DIMENSIONS.filter((d) => dimensions[d].insufficient),
    refused: parsed < MIN_PARSED || score === null,
    dimensions,
    components: collectComponents(files),
    /* WHICH kinds of UI this codebase builds. Deliberately separate from
     * `components` above: that one measures sprawl inside a kind (117 button
     * treatments), this one measures the app's vocabulary (does it have a
     * dialog at all). Structural, so it holds up on codebases whose values we
     * cannot read — and it is what lets the result be shown as the visitor's
     * OWN component set rather than our catalogue. */
    kinds: detectKinds(files),
    /* Their real value SPREAD, resolved to CSS.
     *
     * This is what an honest "before" is made of. Not a reconstruction of any
     * one component — we measured that ceiling and it is about half a codebase
     * with a guess on top — but the values themselves, which we know exactly.
     * Nineteen radii is not an opinion; showing what nineteen radii look like
     * when nothing decides between them is not a claim about any single
     * element, it is the definition of drift.
     *
     * Resolved HERE because this is where the palette lives: `slate-500` means
     * nothing to a browser, and the consumer must never have to guess. */
    spread: {
      radius: dimensions.radius.values.map((v) => v.value).filter(isCssLength).slice(0, 12),
      shadow: dimensions.shadow.values.map((v) => v.value).filter((v) => !/var\(/.test(v)).slice(0, 8),
      spacing: dimensions.spacing.values.map((v) => v.value).filter(isCssLength).slice(0, 10),
      // The decisions: saturated colours, the ones an app chose on purpose.
      color: dimensions.color.values
        .map((v) => toHex(v.value, palette, 'saturated'))
        .filter(Boolean)
        .slice(0, 10),
      /* And the greys, which matter just as much: an app's surfaces, borders and
       * text are what make it FEEL like a different app.
       *
       * By measured ROLE, not by guessing. The events carry bg/fg/border and
       * aggregation was throwing that away, leaving the consumer to infer role
       * from luminance — which says "the lightest grey is the page", and that is
       * simply a guess wearing the clothes of a measurement. A light grey can be
       * text on a dark panel. Now we report the most-used colour that the code
       * actually USES as a background. */
      /* The PAGE background, which is not simply the most-used one.
       *
       * Measured across four real apps: cal.com's busiest bg-role neutral is
       * #262626 and Zero's second is #313131 — their black buttons and dark-mode
       * tokens, not their pages. "Most used" answers a different question than
       * "what is the canvas".
       *
       * A page is the EXTREME of the ramp: the lightest thing in a light app,
       * the darkest in a dark one. Which of those an app is gets decided by
       * where the mass of its backgrounds sits, rather than assumed. */
      /* Text and borders are chosen against the page we just settled, not by
       * frequency. cal.com's busiest fg-role neutral is #ffffff — the label on
       * their black buttons — which on their white page renders invisible. What
       * makes something body text is that you can READ it on the canvas.
       *
       * Whatever the app DECLARED outranks all of it, per role: a repo that
       * tokenised its surfaces properly has almost no literals left to count. */
      ...surfaces,
      neutral: dimensions.color.values
        .map((v) => toHex(v.value, palette, 'neutral'))
        .filter(Boolean)
        .slice(0, 8),
      /* Their type sizes. Typography is half of what makes an interface
       * recognisable, and ours would otherwise leak straight through. */
      type: dimensions.type.values
        .map((v) => String(v.value).split('/')[0])
        .filter((v) => /^[\d.]+(px|rem)$/.test(v))
        .slice(0, 6),
    },

    /* The skeleton, as opposed to the parts. Which regions — never how they are
     * arranged; see the note on SHELL_REGIONS for why that is unknowable from a
     * static read, and why anything rendering this must say so. */
    shell: detectShell(files),
    /* Not which kinds, but which FLAVOUR of them — a table that sorts, a dialog
     * with a destructive action. Same structural signal, one level finer. */
    variants: detectVariants(files),
    // Not part of the measurement — purely so the report can render a real
    // swatch for a class-based component instead of quoting its class list.
    classStyles: resolvedStyles,
    // The first RELATIONAL finding: sibling controls whose heights disagree.
    // Reported, never scored — see findControlClusters().
    clusters: findControlClusters(files, resolvedStyles),
    // Only the entries this codebase actually uses, so `--json` stays readable
    // instead of carrying a few hundred palette rows nobody referenced.
    palette: Object.fromEntries(
      dimensions.color.values
        .map((v) => [stripAlpha(v.value), palette[stripAlpha(v.value)]])
        .filter(([, hex]) => hex),
    ),
    flags: smokingGuns(files, opts.pkg, events),
    // Emitted but unused in PR 1 — it is the hinge to the configurator (PR 4),
    // and computing it now is cheaper than a second pass later.
    inferredConfig: inferConfig(dimensions, palette, cssVars, varRefs, projectName, docsOnly),
  }

  // The second headline, given equal billing rather than a footnote.
  result.sprawl = summariseSprawl(result.components)
  result.headlinesDisagree = headlinesContradict(result.score, result.sprawl)

  if (result.refused) {
    result.score = null
    result.grade = null
    result.refusal = parsed < MIN_PARSED
      ? `Only ${Math.round(parsed * 100)}% of styled elements could be read (minimum ${Math.round(MIN_PARSED * 100)}%). Scoring code we could not read would be contestable, so no score is given.`
      : `Too little styling to measure — every dimension is under ${MIN_EVENTS} usage events. This is not a clean bill of health; it means the values live somewhere this scan cannot see (a component library, a theme file, or another stack).`
  }

  return result
}

/* ─────────────────────── arbitrary + ramp signals (reported) ───────────────── */

/** Share of Tailwind utilities written as arbitrary values. Every one is a
 *  DELIBERATE step outside the system — the cheapest strong signal we have. */
export function arbitraryRate(files) {
  let total = 0, arbitrary = 0
  for (const { path, content } of files) {
    if (/\.(css|scss|less)$/.test(path)) continue
    for (const { classes } of classAttrs(path, content)) {
      for (const c of classes) {
        total++
        if (/-\[[^\]]+\]$/.test(c)) arbitrary++
      }
    }
  }
  return { total, arbitrary, rate: total ? round(arbitrary / total, 3) : 0 }
}

export { GRID, AUDIT_SCAN_EXT, AUDIT_SKIP_FILE, TW_GRAY_RAMPS, norm, parseColor, deltaE00 }

/* ────────────────────────────── terminal output ─────────────────────────────
 * MAX 15 LINES. The viral unit is a screenshot, not a scroll buffer — anything
 * that does not fit does not belong. No tips, no call to action, no sell: every
 * sales line makes it less shareable. The number does the work. */

const LABEL = { color: 'Colour', type: 'Type', spacing: 'Spacing', radius: 'Radius', shadow: 'Shadow' }

const pct = (n) => `${Math.round(n * 100)}%`
const nf = (n) => n.toLocaleString('en-US')

/** Soft-wrap a sentence so the refusal stays inside the 15-line frame. */
function wrap(text, width) {
  const out = []
  let line = ''
  for (const word of String(text).split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) { out.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

/**
 * The button sentence, told honestly for both worlds.
 *
 * A repo where 3,070 of 3,150 buttons go through one component has SOLVED
 * sprawl — the handful of hand-rolled leftovers are a footnote, not a verdict.
 * A repo where 112 of 134 treatments occur exactly once has not. Reporting only
 * the hand-rolled count describes those two with the same sentence.
 */
export function buttonLine(b) {
  if (!b || (!b.treatments && !b.throughComponent)) return ''
  const share = b.componentShare
  const sprawl = b.treatments
    ? `${nf(b.treatments)} hand-rolled button treatment${b.treatments === 1 ? '' : 's'}${b.singletons ? `, ${nf(b.singletons)} used once` : ''}`
    : 'no hand-rolled buttons'
  if (share !== null && b.throughComponent) {
    return `  ${sprawl} · ${pct(share)} of buttons go through a component`
  }
  return `  ${sprawl}`
}

/** One line of "this is your codebase" — the recognition beat before the verdict. */
export function stackLine(stack) {
  const bits = []
  if (stack.framework) bits.push(stack.framework.name + (stack.framework.version ? ` ${stack.framework.version}` : ''))
  if (stack.meta) bits.push(stack.meta.name)
  if (stack.typescript) bits.push('TypeScript')
  for (const s of stack.styling.slice(0, 3)) {
    bits.push(s.version ? `${s.kind} v${s.version}` : s.kind)
  }
  for (const lib of stack.componentLibraries) bits.push(lib)
  return bits.join(' · ')
}

/** The kinds a codebase actually builds, busiest first. */
export function kindsFound(kinds) {
  return Object.entries(kinds || {})
    .filter(([, v]) => v.files > 0)
    .sort((a, b) => b[1].files - a[1].files)
}

export function renderTerminal(r, { reportPath = null } = {}) {
  const L = []
  const s = r.meta.stack
  L.push(`  uicockpit audit — ${nf(r.meta.files)} files · ${nf(r.meta.elements)} styled elements · ${pct(r.meta.parsed)} read`)
  const line = stackLine(s)
  if (line) L.push(`  ${line}`)
  const detail = s.styling.map((x) => x.detail).filter(Boolean).slice(0, 2).join(' · ')
  if (detail) L.push(`  ${detail}`)
  L.push('')

  if (r.refused) {
    L.push('  No score')
    L.push('')
    for (const line of wrap(r.refusal, 76)) L.push(`  ${line}`)

    // Refusing to SCORE is not the same as having nothing to say. What we did
    // read still counts, as a floor — twentyhq/twenty refuses on coverage while
    // holding 31 of 32 treatments used exactly once, and throwing that away
    // leaves a fifth of repos with nothing at all.
    const sp = r.sprawl
    if (sp && sp.treatments) {
      L.push('')
      L.push(`  Sprawl       at least ${nf(sp.singletons)} used once of ${nf(sp.treatments)} hand-rolled treatments`)
      L.push(`               a floor, counted over the ${pct(r.meta.parsed)} we could read`)
    }

    const kf = kindsFound(r.kinds)
    if (kf.length) {
      L.push('')
      L.push(`  Builds       ${kf.length} of ${Object.keys(r.kinds).length} component kinds`)
      L.push(`               ${kf.slice(0, 8).map(([k]) => k).join(' · ')}`)
    }

    const un = Object.entries(r.meta.unreadable)
    if (un.length) {
      L.push('')
      L.push(`  Unreadable: ${un.map(([k, n]) => `${n} ${k}`).join(' · ')}`)
    }
    return L.join('\n')
  }

  const filled = Math.round(r.score / 10)
  L.push(`  Consistency  ${String(r.score).padStart(3)}/100  ${'█'.repeat(filled)}${'░'.repeat(10 - filled)}   values`)

  // The second headline, level with the first. A repo can hold both a healthy
  // score and a pile of one-off components; that pairing IS the finding.
  const sp = r.sprawl
  if (sp && sp.treatments) {
    const via = sp.componentShare ? ` · ${pct(sp.componentShare)} via components` : ''
    L.push(`  Sprawl       ${nf(sp.singletons)} used once of ${nf(sp.treatments)} hand-rolled treatments${via}`)
    if (r.headlinesDisagree) {
      L.push('               values are in hand, components are not — the score cannot see this')
    }
  }

  // Not a score and never one: a vocabulary. It is what lets the report show
  // YOUR component set rather than our catalogue, and unlike the two headlines
  // above it holds up on codebases whose values we could not read.
  const kf = kindsFound(r.kinds)
  if (kf.length) {
    L.push(`  Builds       ${kf.length} of ${Object.keys(r.kinds).length} component kinds · ${kf.slice(0, 6).map(([k]) => k).join(' · ')}`)
  }
  // The brand, with its provenance — so the one line a reader can check against
  // their own screen in five seconds says where it came from and how sure we
  // are. A counted colour resolved through shipped Tailwind defaults says so.
  const ic = r.inferredConfig
  if (ic?.values?.brandHex) {
    const conf = ic.confidence?.colorTheme
    const via = /^tailwind /.test(r.meta.palette || '') ? ` · names via ${r.meta.palette}` : ''
    L.push(`  Brand        ${ic.values.brandHex}${ic.values.colorTheme ? ` (${ic.values.colorTheme})` : ''} · ${ic.confidence?.colorThemeSource || 'inferred'}${conf != null && conf < 1 ? `, confidence ${conf}` : ''}${via}`)
  }
  L.push('')

  for (const dim of DIMENSIONS) {
    const d = r.dimensions[dim]
    if (d.insufficient) {
      L.push(`  ${LABEL[dim].padEnd(9)} –  ${String(d.events).padStart(5)} uses — too few to score`)
      continue
    }
    // The column is N_eff, and the label must carry that. Raw count and
    // effective count under one heading is exactly the confusion the whole
    // measurement principle exists to remove: 23 shadows with 18 singletons
    // means the mass sits on a handful of values, so nEff ≈ 10, not 23.
    const head = `  ${LABEL[dim].padEnd(9)} ${d.grade}  ${String(d.nEff).padStart(5)} eff. (budget ${d.budget})`
    const notes = []
    if (d.nearDupes.length) notes.push(`${d.distinct} values, ${d.nearDupes.flat().length} near-dupes`)
    else if (d.distinct) notes.push(`${d.distinct} values`)
    if (d.tokenisedRate < 0.9) notes.push(`${pct(1 - d.tokenisedRate)} hardcoded`)
    if (d.offGridRate) notes.push(`${pct(d.offGridRate)} off-grid`)
    const singles = d.singletons.length
    if (singles > 2) notes.push(`${singles} occur once`)
    L.push(notes.length ? `${head.padEnd(46)}·  ${notes.slice(0, 2).join(', ')}` : head)
  }
  L.push('')


  // The first relational finding — the one a per-value rule can never see.
  const cl = r.clusters
  if (cl && cl.mismatched) {
    L.push(`  ${nf(cl.mismatched)} of ${nf(cl.rows)} control rows have siblings at different heights`)
  }

  const guns = []
  for (const f of r.flags) {
    if (f.id === 'multiple-icon-libs') guns.push(`${f.detail.length} icon libraries`)
    if (f.id === 'mixed-gray-ramps') guns.push(`${f.detail.length} grey ramps`)
    if (f.id === 'duplicate-components') guns.push(`${f.detail.length} duplicated components`)
    if (f.id === 'multiple-styling-systems') guns.push(`${f.detail.length} styling systems`)
    if (f.id === 'multiple-font-families') guns.push(`${f.detail.length} font families`)
  }
  if (guns.length) L.push(`  ${guns.join(' · ')}`)

  if (r.meta.parsed < 1) {
    L.push(`  Unread: ${Object.entries(r.meta.unreadable).map(([k, n]) => `${n} ${k}`).join(' · ')}`)
  }
  if (reportPath) {
    L.push('')
    L.push(`  Report → ${reportPath}`)
  }
  return L.join('\n')
}

/* ─────────────────────────────── the CLI shell ─────────────────────────────── */

/**
 * Read the colour palette from the Tailwind build installed in the repo under
 * audit. Node-only, best-effort: a repo with no dependencies installed simply
 * gets fewer resolved colours, and the report says so rather than pretending.
 *
 * We read the INSTALLED copy first, so the numbers are that repo's real
 * palette — including its version. When nothing is installed (a shallow clone,
 * a browser drop, a Phoenix app whose Tailwind is a standalone binary) the
 * engine falls back to the defaults Tailwind SHIPS for the generation the CSS
 * declares — src/tw-palette.mjs, GENERATED from Tailwind's published files by
 * scripts/gen-tw-palette.mjs, never typed — and says so in meta.palette.
 */
async function loadInstalledPalette(fs, pathMod, dir) {
  const roots = [dir, '.']
  const out = {}

  for (const root of roots) {
    // Tailwind v4 — the whole palette lives in theme.css as `--color-*`.
    const themeCss = pathMod.join(root, 'node_modules', 'tailwindcss', 'theme.css')
    try {
      if (fs.existsSync(themeCss)) {
        const css = fs.readFileSync(themeCss, 'utf8')
        for (const m of css.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
        if (Object.keys(out).length) return out
      }
    } catch { /* unreadable → fall through */ }

    // Tailwind v3 — colors.js exports nested { hue: { shade: hex } }.
    for (const rel of [['node_modules', 'tailwindcss', 'colors.js'], ['node_modules', 'tailwindcss', 'lib', 'public', 'colors.js']]) {
      const p = pathMod.join(root, ...rel)
      try {
        if (!fs.existsSync(p)) continue
        const mod = await import(`file://${pathMod.resolve(p)}`)
        const colors = mod.default ?? mod
        for (const [hue, val] of Object.entries(colors)) {
          if (typeof val === 'string') out[hue] = val
          else if (val && typeof val === 'object') {
            for (const [shade, hex] of Object.entries(val)) {
              if (typeof hex === 'string') out[`${hue}-${shade}`] = hex
            }
          }
        }
        if (Object.keys(out).length) return out
      } catch { /* not importable → fall through */ }
    }
  }
  return out
}

/**
 * Discover files under `dir`, audit them, print (or emit JSON).
 * Node-only; the pure engine above stays importable in a browser bundle.
 *
 * Exit codes: 0 = audited · 2 = setup error / refused for coverage.
 */
export async function runAudit(argv = []) {
  const fs = await import('node:fs')
  const pathMod = await import('node:path')

  const args = argv.filter((a) => !a.startsWith('-'))
  const flag = (name) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  const flagVal = (name, dflt) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : dflt
  }

  const dir = args[0] || '.'
  const profile = flagVal('profile', 'internal')
  const asJson = flag('json')
  const wantReport = !flag('no-report')

  if (!fs.existsSync(dir)) {
    console.error(`uicockpit audit: no such directory: ${dir}`)
    return 2
  }

  const SKIP_DIR = /(^|[/\\])(node_modules|\.git|dist|build|\.next|out|coverage|\.uicockpit)([/\\]|$)/
  const files = []
  const walk = (d) => {
    let entries
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = pathMod.join(d, e.name)
      if (e.isDirectory()) { if (!SKIP_DIR.test(p)) walk(p); continue }
      if (!AUDIT_SCAN_EXT.test(e.name) || AUDIT_SKIP_FILE.test(p)) continue
      try {
        const content = fs.readFileSync(p, 'utf8')
        files.push({ path: pathMod.relative(dir, p) || e.name, content })
      } catch { /* unreadable file — skip, it can't carry style either */ }
    }
  }
  walk(dir)

  if (!files.length) {
    console.error(`uicockpit audit: no scannable files under ${dir}`)
    return 2
  }

  // The kit vocabulary that powers `expressible` — shipped with the package, so
  // the audit works on a codebase that has no kit yet (which is the whole point).
  let vocabulary = null
  try {
    vocabulary = JSON.parse(fs.readFileSync(new URL('./vocabulary.json', import.meta.url), 'utf8'))
  } catch { /* absent → expressible.recipe simply stays 0 */ }

  let pkg = null
  for (const c of [pathMod.join(dir, 'package.json'), 'package.json']) {
    try { if (fs.existsSync(c)) { pkg = JSON.parse(fs.readFileSync(c, 'utf8')); break } } catch { /* malformed */ }
  }

  const palette = await loadInstalledPalette(fs, pathMod, dir)

  const result = auditFiles(files, { profile, vocabulary, pkg, palette })
  result.meta.arbitrary = arbitraryRate(files)

  // Write the report even on a refusal — the wall, the sprawl floor and the
  // smoking guns are all still valid, and a fifth of real repos refuse.
  let reportPath = null
  if (wantReport) {
    const { renderReport } = await import('./report.mjs')
    const outDir = pathMod.join(dir, '.uicockpit')
    try {
      fs.mkdirSync(outDir, { recursive: true })
      reportPath = pathMod.join(outDir, 'audit.html')
      fs.writeFileSync(reportPath, renderReport(result))
    } catch { reportPath = null }
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
    return result.refused ? 2 : 0
  }

  console.log(renderTerminal(result, { reportPath }))
  return result.refused ? 2 : 0
}
