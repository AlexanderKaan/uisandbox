/**
 * What the sheet MEASURED, sorted into the roles a design system names.
 *
 * DESIGN.md, the W3C token file and the zip's README all describe the same
 * app to somebody else. They read this one function, so they can never
 * disagree about what was found — a design doc that says "primary #e11d48"
 * next to a token file that says something else is worse than neither.
 *
 * A value's ROLE comes from the SCREEN: the coverage walk records whether an
 * element painted it as text, as a surface or on a border, and that decides.
 * Only for values off the current screen does the stylesheet's own property
 * name stand in — and it is the weaker reading, because a sample of sites for
 * Bootstrap's body ink is mostly `.bg-dark` and would file the ink as a
 * background. The ink and the ground are not ranked for at all; they are read
 * off `body` and they win.
 *
 * A value we cannot place stays in `other` rather than being given a name it
 * never earned — the same rule as the rest of the app: never claim more than
 * the meter shows.
 */
import type { Entry, SubstitutionTable } from '../sandbox/table'
import { cssValue, varName } from '../sandbox/table'
import { colorShape, formatCssColor, parseCssColor } from '../sandbox/cssColor'
import type { PaintRoles } from '../sandbox/coverage'

export type Role = 'text' | 'surface' | 'border' | 'icon' | 'other'

export interface Row {
  /** The value as it stands NOW (what the sandbox is painting). */
  value: string
  /** The literal it replaced. Equal to `value` when the knob never moved it. */
  was: string
  changed: boolean
  /** How often the built CSS uses it. */
  count: number
  /** Sampled property names, most frequent first — the evidence for the role. */
  props: string[]
  /** How many elements on the rendered screen carry it. 0 = declared only. */
  painted: number
  /** Where the screen saw it, when it saw it. null = off this screen. */
  paintRole?: Role | null
}

export interface MeasureOptions {
  /** Sheet entry → where on screen it was seen (see Coverage.painted). Roles
   *  and ranking both come from here when it is available: a census of the
   *  stylesheet gets Bootstrap's body ink wrong, and the screen does not. */
  painted?: Map<number, PaintRoles>
  /** The page's own ink and ground, off `body` (see Coverage.anchors). These
   *  two are not ranked for — they are read, and they win. */
  anchors?: { text?: string; background?: string }
}

export interface NamedRow extends Row { name: string }

export interface Measured {
  /** The brand, as the panel holds it (declared in their code, or painted). */
  brand: string
  colors: Record<Role, Row[]>
  /** Colours given a role name: primary, text, surface, border … */
  palette: NamedRow[]
  fonts: { display: string; body: string; stacks: Row[] }
  /** font-size entries, largest first. */
  sizes: Row[]
  radii: NamedRow[]
  spacing: NamedRow[]
  shadows: Row[]
  lineHeights: Row[]
  weights: Row[]
  totals: { values: number; moved: number }
  /** True when the ranking could use the rendered screen. The prose says so —
   *  a reader has to know whether "most used" means painted or merely declared. */
  fromScreen: boolean
}

/** px for anything we can compare; null for calc(), var(), % and friends. */
export function pxOf(v: string): number | null {
  const m = v.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em|pt)?$/i)
  if (!m) return null
  const n = parseFloat(m[1]!)
  if (!Number.isFinite(n)) return null
  const unit = (m[2] ?? 'px').toLowerCase()
  return unit === 'rem' || unit === 'em' ? n * 16 : unit === 'pt' ? (n * 4) / 3 : n
}

function roleOf(e: Entry): Role {
  const tally: Record<Role, number> = { text: 0, surface: 0, border: 0, icon: 0, other: 0 }
  for (const s of e.sites) {
    const p = s.prop.toLowerCase()
    if (p === 'color') tally.text++
    else if (p.startsWith('background')) tally.surface++
    else if (p.includes('border') || p.includes('outline')) tally.border++
    else if (p === 'fill' || p === 'stroke') tally.icon++
    else tally.other++
  }
  const best = (Object.entries(tally) as Array<[Role, number]>).sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? best[0] : 'other'
}

function propsOf(e: Entry): string[] {
  const n = new Map<string, number>()
  for (const s of e.sites) n.set(s.prop, (n.get(s.prop) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
}

/** Where the screen actually painted a colour, when it saw it at all. */
function paintRoleOf(at: PaintRoles | undefined): Role | null {
  if (!at) return null
  const best = ([['text', at.text], ['surface', at.surface], ['border', at.border]] as Array<[Role, number]>)
    .sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? best[0] : null
}

/** Ladder names for a scale of N steps — the vocabulary DESIGN.md recommends. */
const LADDER = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl']

export function measure(
  table: SubstitutionTable,
  vars: Record<string, string>,
  brand: string,
  fonts: { display: string; body: string },
  opts: MeasureOptions = {},
): Measured {
  const painted = opts.painted && opts.painted.size ? opts.painted : null
  // A compound value holds its parts as variables of their own — a shadow is
  // `0 1px 2px var(--us-v7)` so the hue dial can move the shadow's colour
  // without touching its blur. Anything describing the sheet to a HUMAN (or to
  // an agent, or to Figma) has to put those back: `0 1px 2px var(--us-v7)` in
  // a design doc is a broken sentence.
  const expand = (v: string, at: (e: Entry) => string, depth = 0): string => {
    if (depth > 4 || !v.includes('var(--us-v')) return v
    return v.replace(/var\(--us-v(\d+)\)/g, (whole, n: string) => {
      const e = table.get(Number(n))
      return e ? expand(at(e), at, depth + 1) : whole
    })
  }
  const now = (e: Entry) => vars[varName(e.id)] ?? cssValue(e.value)
  const then = (e: Entry) => cssValue(e.value)

  const rowOf = (e: Entry): Row => {
    const was = expand(then(e), then)
    const value = expand(now(e), now)
    const show = (v: string) => (e.kind === 'color' ? printable(v) : v)
    return { value: show(value), was: show(was), changed: value !== was, count: e.count, props: propsOf(e), painted: painted?.get(e.id)?.total ?? 0 }
  }
  /** By how much of the SCREEN carries it, then by how often the build writes
   *  it. Bootstrap declares `#000` 366 times and paints it never, and names its
   *  success green as often as its body ink; a doc that called either one the
   *  text colour because it counted highest would be confidently wrong. */
  const rank = (a: Row, b: Row) => (painted && a.painted !== b.painted ? b.painted - a.painted : b.count - a.count)
  const of = (kind: Entry['kind']) => table.ofKind(kind).map(rowOf)

  // --- colours, by the role they were seen in -------------------------------
  // The SCREEN decides when it saw the colour; the stylesheet's own property
  // names are the fallback for anything off this screen.
  const colors: Record<Role, Row[]> = { text: [], surface: [], border: [], icon: [], other: [] }
  for (const e of table.ofKind('color')) {
    const pr = paintRoleOf(painted?.get(e.id))
    colors[pr ?? roleOf(e)].push({ ...rowOf(e), paintRole: pr })
  }
  for (const k of Object.keys(colors) as Role[]) colors[k].sort(rank)

  // The named palette: the brand, then the busiest colour in each role. Two
  // steps per role at most — a design doc with forty greys is not a design doc.
  //
  // Only OPAQUE colours can take a role. `rgba(255,255,255,.5)` is what the
  // Bootstrap docs paint their navbar links, and it outranked everything on
  // this screen — but a value with alpha is a different colour over every
  // backdrop, so it cannot stand alone as "the text colour". It stays in
  // `colors.text`, out of the named palette.
  const named = (rows: Row[]) => rows.filter((r) => { const c = parseCssColor(r.value); return !c || c.a >= 0.999 })
  const palette: NamedRow[] = []
  const seen = new Set<string>()
  const push = (name: string, r: Row | undefined) => {
    if (!r || seen.has(r.value.toLowerCase())) return
    seen.add(r.value.toLowerCase())
    palette.push({ ...r, name })
  }
  const all = [...colors.text, ...colors.surface, ...colors.border, ...colors.icon, ...colors.other]
  const text = named(colors.text), surface = named(colors.surface), border = named(colors.border)
  // The ink and the ground are READ off the page, not ranked for. Every census
  // heuristic gets these two wrong somewhere, and they are the two a design
  // system cannot afford to be wrong about. `anchorRow` prefers the sheet entry
  // that carries the colour (so it keeps its count and its "was"), and falls
  // back to the bare computed value when no entry matches.
  const anchorRow = (css: string | undefined): Row | undefined => {
    if (!css) return undefined
    // The screen reports `rgb(33, 37, 41)`; the sheet holds `#212529`. Both go
    // through the one printer so the match is on the colour, not the spelling.
    const c = parseCssColor(css)
    const want = c ? formatCssColor(c) : printable(css)
    const at = all.find((r) => canonical(r.value) === want.toLowerCase())
    return at ?? { value: want, was: want, changed: false, count: 0, props: [], painted: 0 }
  }
  const brandRow = all.find((r) => r.value.toLowerCase() === brand.toLowerCase())
  push('primary', brandRow ?? { value: brand, was: brand, changed: false, count: 0, props: [], painted: 0 })
  push('text', anchorRow(opts.anchors?.text) ?? text[0])
  push('surface', anchorRow(opts.anchors?.background) ?? surface[0])
  push('text-muted', text.find((r) => !seen.has(r.value.toLowerCase())))
  push('surface-alt', surface.find((r) => !seen.has(r.value.toLowerCase())))
  push('border', border[0])

  // --- scales ---------------------------------------------------------------
  /** A step of a scale has to be a length somebody else can reuse. `em` is
   *  relative to whatever font-size the element happens to inherit, and `%` to
   *  its box, so neither is a token — they stay out of the ladders. */
  const scaleable = (rows: Row[]) => dedupePx(rows.filter((r) => /^-?\d*\.?\d+\s*(px|rem|pt)?$/i.test(r.value.trim()) && pxOf(r.value) !== null))
  const bigFirst = (a: Row, b: Row) => pxOf(b.value)! - pxOf(a.value)!
  const smallFirst = (a: Row, b: Row) => pxOf(a.value)! - pxOf(b.value)!
  const sizes = scaleable(of('font-size')).sort(bigFirst)

  const radiiRows = scaleable(of('radius')).sort(rank).slice(0, 5).sort(smallFirst)
  const radii: NamedRow[] = radiiRows.map((r, i) => {
    const px = pxOf(r.value)!
    const name = px === 0 ? 'none' : px >= 999 ? 'full' : LADDER[Math.min(i, LADDER.length - 1)]!
    return { ...r, name }
  })

  const spaceRows = scaleable(of('space')).sort(rank).slice(0, 6).sort(smallFirst)
  const spacing: NamedRow[] = spaceRows.map((r, i) => ({ ...r, name: LADDER[Math.min(i, LADDER.length - 1)]! }))

  const moved = table.entries.filter((e) => (vars[varName(e.id)] ?? cssValue(e.value)) !== cssValue(e.value)).length
  const stacks = of('font-family').sort(rank)
  // The knob's label ("System", "Custom: Nunito") names a font for OUR panel;
  // a design doc needs the stack a browser can actually resolve.
  const stackFor = (label: string, want: 'display' | 'body'): string => {
    const first = (s: string) => s.split(',')[0]!.trim().replace(/^["']|["']$/g, '').toLowerCase()
    const named = label.replace(/^Custom:\s*/, '').toLowerCase()
    const hit = stacks.find((s) => first(s.value) === named)
    if (hit) return hit.value
    if (/^system$/i.test(label)) return stacks.find((s) => /^(system-ui|-apple-system|ui-sans-serif)/i.test(s.value))?.value
      ?? (want === 'display' ? stacks[0]?.value : stacks[0]?.value)
      ?? 'system-ui, sans-serif'
    return label
  }

  return {
    brand,
    colors,
    palette: dedupeNames(palette),
    fonts: { display: stackFor(fonts.display, 'display'), body: stackFor(fonts.body, 'body'), stacks },
    sizes,
    radii: dedupeNames(radii),
    spacing: dedupeNames(spacing),
    shadows: of('shadow').sort(rank),
    lineHeights: of('line-height').sort(rank),
    weights: of('font-weight').sort(rank),
    fromScreen: painted !== null,
    totals: { values: table.entries.length, moved },
  }
}

/** `.5rem` and `0.5rem` are one step of the scale spelled two ways. The sheet
 *  keeps them apart on purpose (they are separate literals in separate files
 *  and each must move on its own); a ladder must not. Highest count wins. */
function dedupePx(rows: Row[]): Row[] {
  const best = new Map<number, Row>()
  for (const r of rows) {
    const k = Math.round(pxOf(r.value)! * 100) / 100
    const cur = best.get(k)
    if (!cur || r.count > cur.count) best.set(k, cur ? { ...r, count: r.count + cur.count, painted: r.painted + cur.painted } : r)
    else { cur.count += r.count; cur.painted += r.painted }
  }
  return [...best.values()]
}

/** A bare triplet (`13, 110, 253`, Bootstrap's `--bs-primary-rgb`) is a colour
 *  only once wrapped. Exports hand their values to other tools, and every one
 *  of them expects a CSS colour, so print it as one. */
function printable(v: string): string {
  const shape = colorShape(v)
  if (shape === 'css') return v
  // Wrap before parsing: `86, 94, 100` on its own is not a colour to any
  // parser, and `hsl:222 47% 11%` is our own marker for bare hsl channels.
  const wrapped = shape === 'hsl-triplet' ? `hsl(${v.replace(/^hsl:/, '')})` : `rgb(${v})`
  const c = parseCssColor(wrapped)
  return c ? formatCssColor(c) : v
}

/** One colour, one spelling — `#212529`, `rgb(33,37,41)` and `#212529ff` all
 *  land on the same string before anything is compared. */
function canonical(v: string): string {
  const c = parseCssColor(v)
  return (c ? formatCssColor(c) : v).toLowerCase()
}

/** Two steps of a scale can round to the same ladder name; a duplicate key in
 *  YAML or JSON silently drops one of them, so make them unique here. */
function dedupeNames<T extends { name: string }>(rows: T[]): T[] {
  const used = new Map<string, number>()
  return rows.map((r) => {
    const n = used.get(r.name) ?? 0
    used.set(r.name, n + 1)
    return n === 0 ? r : { ...r, name: `${r.name}-${n + 1}` }
  })
}
