/**
 * Knob → THEIR values. The other direction of the handoff, and the product.
 *
 * `configFromAudit` puts the knobs on the stand of their codebase; `buildTokens`
 * of that config is the BASELINE. Every entry of the substitution sheet is then
 * expressed RELATIVE to the baseline, and re-derived from the current tokens:
 *
 *   colour   their #4f39f6 in the brand family → hue rotated by the delta of
 *            --k-primary, lightness/chroma shifted by its delta (end-anchored,
 *            so tints stay tints and white stays white)
 *   neutral  their greys → tint hue/chroma follow --k-fg-muted, lightness of
 *            light greys follows --k-bg, of dark greys --k-fg
 *   radius   their 12px × (--k-radius-md now / --k-radius-md then)
 *   type     their 18px = body × step^k at the baseline; re-emitted at the
 *            current body size and step ratio, same k
 *   space    their 16px × (--k-space now / then)
 *   shadow   their geometry × the blur ratio of --k-shadow-md; alpha likewise
 *   family   identity until the font knob leaves their family; then the token
 *
 * With no knob turned every ratio is 1 and every delta 0, so the output IS the
 * identity sheet — 1:1 by construction, and `mapping.test.ts` pins that with the
 * REAL buildTokens output on both sides (never a mirrored table — notes/traps.md
 * #7). The trade: values SNAP to nothing. Their scale keeps its own shape; the
 * knobs bend it. That is what "we don't redesign, we tokenise" has to mean.
 */
import type { Config, Tokens } from '../tokens/types'
import { formatLike, hueDelta, parseCssColor, type Okla } from './cssColor'
import { cssValue, varName, type Entry, type SubstitutionTable } from './table'
import type { Dials } from './dials'

type Vars = Record<string, string | number>

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const str = (v: string | number | undefined) => (v === undefined ? '' : String(v))

/** A CSS length in px, from `12px` / `0.75rem` / `1.2em`; null when not one. */
export function toPx(v: string): { px: number; unit: string } | null {
  const m = v.trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/)
  if (!m) return null
  const n = parseFloat(m[1]!)
  return { px: m[2] === 'px' ? n : n * 16, unit: m[2]! }
}
const fromPx = (px: number, unit: string, original?: string): string => {
  const n = unit === 'px' ? px : px / 16
  const r = Math.round(n * 1000) / 1000
  // A numeric no-op keeps its original spelling (`.9em` stays `.9em`), so
  // "identity" is byte-identity and nothing is reported as moved.
  if (original !== undefined) {
    const o = toPx(original)
    if (o && Math.abs(o.px - px) < 1e-6) return original
  }
  return `${r}${unit}`
}

// ─────────────────────────── colour families ───────────────────────────
//
// Beyond the brand, the roles are THEIRS: the sheet's own chromatic hues,
// clustered — the largest non-brand cluster is `secondary`, the next `accent`;
// the classic status hues (green/red/amber/blue) are their own families when
// they are not the brand's neighbours. Each family has a CENTRE (its most-used
// colour); a picker for that family moves every member by the delta between
// centre and pick — same maths as the brand.

export type Family = 'brand' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'keep'
export interface Families {
  /** entry id → family */
  of: Map<number, Family>
  /** family → its centre colour (most-used member) */
  centre: Partial<Record<Family, Okla>>
}
const NEUTRAL_CHROMA = 0.035
const FAMILY_HUE_WINDOW = 32
// OKLCH hues: red ≈ 20–30, amber ≈ 60–85, green ≈ 140–160, blue ≈ 240–260
const STATUS: Array<[Family, number, number]> = [['success', 110, 175], ['danger', 335, 40], ['warning', 45, 100], ['info', 215, 265]]
const inHue = (h: number, lo: number, hi: number) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi)

/** The family of one loose colour (an SVG fill inside a data URI), by the same rules. */
export function familyOfColor(c: Okla, fams: Families): Family {
  if (c.a === 0) return 'keep'
  if (c.C < NEUTRAL_CHROMA) return 'neutral'
  const b = fams.centre.brand
  if (b && Math.abs(hueDelta(c.H, b.H)) <= FAMILY_HUE_WINDOW) return 'brand'
  const st = STATUS.find(([, lo, hi]) => inHue(c.H, lo, hi))
  if (st) return st[0]
  for (const fam of ['secondary', 'accent'] as const) { const ce = fams.centre[fam]; if (ce && Math.abs(hueDelta(c.H, ce.H)) <= FAMILY_HUE_WINDOW) return fam }
  return 'keep'
}

/** Classify every colour entry of the sheet against the brand hex, once. */
export function familiesOf(table: SubstitutionTable, brandHex: string): Families {
  const brand = parseCssColor(brandHex)
  const of = new Map<number, Family>()
  const chroma: Array<{ e: Entry; c: Okla }> = []
  const rest: Array<{ e: Entry; c: Okla }> = []
  for (const e of table.ofKind('color')) {
    const c = parseCssColor(e.value)
    if (!c || c.a === 0) { of.set(e.id, 'keep'); continue }
    if (c.C < NEUTRAL_CHROMA) { of.set(e.id, 'neutral'); continue }
    if (brand && Math.abs(hueDelta(c.H, brand.H)) <= FAMILY_HUE_WINDOW) { of.set(e.id, 'brand'); chroma.push({ e, c }); continue }
    rest.push({ e, c })
  }
  const centre: Partial<Record<Family, Okla>> = {}
  if (brand) centre.brand = brand
  // status by hue window
  const remaining: typeof rest = []
  for (const x of rest) {
    const st = STATUS.find(([, lo, hi]) => inHue(x.c.H, lo, hi))
    if (st) of.set(x.e.id, st[0]); else remaining.push(x)
  }
  // secondary / accent: the two largest hue clusters (30° bins) among what is left
  const bins = new Map<number, typeof rest>()
  for (const x of remaining) { const b = Math.round(x.c.H / 30) % 12; if (!bins.has(b)) bins.set(b, []); bins.get(b)!.push(x) }
  const ranked = [...bins.values()].sort((a, b) => b.reduce((n, x) => n + x.e.count, 0) - a.reduce((n, x) => n + x.e.count, 0))
  ranked.forEach((cluster, i) => { const fam: Family = i === 0 ? 'secondary' : i === 1 ? 'accent' : 'keep'; for (const x of cluster) of.set(x.e.id, fam) })
  // centres = most-used member per family
  const best = new Map<Family, { c: Okla; n: number }>()
  for (const e of table.ofKind('color')) {
    const fam = of.get(e.id)
    if (!fam || fam === 'keep' || fam === 'neutral' || fam === 'brand') continue
    const c = parseCssColor(e.value)!
    const cur = best.get(fam)
    if (!cur || e.count > cur.n) best.set(fam, { c, n: e.count })
  }
  for (const [fam, v] of best) centre[fam] = v.c
  return { of, centre }
}

/** Shift lightness by `dL`, scaled so 0 and 1 never move (a tint stays a tint). */
function shiftL(L: number, from: number, dL: number): number {
  if (dL === 0) return L
  const w = dL < 0 ? (from > 0 ? L / from : 0) : (from < 1 ? (1 - L) / (1 - from) : 0)
  return clamp(L + dL * clamp(w, 0, 1.5), 0, 1)
}

/** Move `c` by the delta from family centre `b` to its new value `n`. */
function mapByDelta(c: Okla, b: Okla, n: Okla): Okla {
  const moved = !(Math.abs(b.L - n.L) < 1e-4 && Math.abs(b.C - n.C) < 1e-4 && Math.abs(hueDelta(b.H, n.H)) < 1e-3)
  if (!moved) return c
  // The centre itself becomes the pick exactly — a visitor who picks Rose
  // expects Rose. Everything near it moves by delta.
  if (Math.abs(c.L - b.L) < 0.03 && Math.abs(c.C - b.C) < 0.03 && Math.abs(hueDelta(c.H, b.H)) < 4) return { ...n, a: c.a }
  const H = c.H + hueDelta(b.H, n.H)
  const C = clamp(c.C * (n.C / Math.max(b.C, 0.01)), 0, 0.4)
  const L = shiftL(c.L, b.L, n.L - b.L)
  return { L, C, H: ((H % 360) + 360) % 360, a: c.a }
}

/** How a neutral is USED decides which dial moves it. */
type NeutralUse = 'bg' | 'border' | 'ink'
function neutralUse(e: Entry): NeutralUse {
  let bg = 0, border = 0, ink = 0
  for (const s of e.sites) {
    if (/^(border|outline|column-rule|--.*(border|outline|divider|stroke))/.test(s.prop) && !/-radius|-width/.test(s.prop)) border++
    else if (/^(background|--.*(bg|background|surface|canvas))/.test(s.prop)) bg++
    else ink++
  }
  return border >= bg && border >= ink ? 'border' : bg >= ink ? 'bg' : 'ink'
}

function mapNeutral(c: Okla, e: Entry, base: Vars, now: Vars, sb: Dials): Okla {
  const bTint = parseCssColor(str(base['--k-fg-muted']))
  const nTint = parseCssColor(str(now['--k-fg-muted']))
  let { L, C, H } = c
  if (bTint && nTint) {
    const dC = nTint.C - bTint.C
    const dH = hueDelta(bTint.H, nTint.H)
    if (dC !== 0 || dH !== 0) {
      // Half the engine's tint delta: their greys carry their own tint already,
      // and adding ours in full doubles it.
      C = clamp(C + dC * 0.5, 0, 0.05)
      // A pure grey has no hue to rotate: it takes the tint's hue outright.
      H = c.C < 0.004 ? nTint.H : (((H + dH) % 360) + 360) % 360
    }
  }
  // The dials: Background moves LIGHT neutrals painted as backgrounds; Border
  // tone moves neutrals used as borders/outlines. Ink is left alone.
  const use = neutralUse(e)
  if (use === 'bg' && sb.bgTone !== 0 && L >= 0.6) L = shiftL(L, L, sb.bgTone)
  if (use === 'border' && sb.borderTone !== 0) L = shiftL(L, L, sb.borderTone)
  return { L, C, H, a: c.a }
}

// ─────────────────────────── shadows ───────────────────────────

function mapShadow(value: string, x: number): string {
  if (x === 1) return value
  if (x <= 0) return 'none'
  // Geometry grows with the square root, alpha linearly — a "deeper" shadow is
  // mostly darker and a little wider, which is what elevation looks like.
  const rL = Math.sqrt(x)
  const rA = x
  let out = value.replace(/(-?\d*\.?\d+)(px|rem|em)/g, (_m, num: string, unit: string) => {
    const v = parseFloat(num)
    // Inset/spread of 0 stays 0; a 1px hairline ring should not shrink away.
    if (v === 0) return `0${unit}`
    return `${Math.round(v * rL * 100) / 100}${unit}`
  })
  out = out.replace(/(\/\s*|,\s*)(0?\.\d+|1(?:\.0+)?)(\s*\))/g, (_m, pre: string, a: string, post: string) => `${pre}${Math.round(clamp(parseFloat(a) * rA, 0, 1) * 1000) / 1000}${post}`)
  return out
}

// ─────────────────────────── type ───────────────────────────

/** A length × factor, spelling and unit kept; unitless numbers scale too. */
function scaleLength(value: string, x: number): string {
  if (x === 1) return value
  const v = toPx(value)
  if (v) return fromPx(v.px * x, v.unit, value)
  const n = value.trim().match(/^(\d*\.?\d+)$/)
  if (n) return String(Math.round(parseFloat(n[1]!) * x * 1000) / 1000)
  return value
}

// ─────────────────────────── the sheet ───────────────────────────

export interface Baseline {
  cfg: Config
  tokens: Tokens
  /** The sheet's own colour families, classified once against the brand. */
  families?: Families
}

/** Font entries are classified once, from where they are used. */
export type FontRole = 'body' | 'display' | 'mono'
export function fontRole(e: Entry): FontRole {
  if (/mono|courier|consolas|menlo|code/i.test(e.value)) return 'mono'
  const sel = e.sites.map((s) => s.selector ?? '').filter(Boolean)
  if (sel.length && sel.every((s) => /(^|[\s,>+~])h[1-6]\b|heading|title|display|hero/i.test(s))) return 'display'
  return 'body'
}

/**
 * The live sheet: every variable's value for the CURRENT config, given the
 * baseline. Pure — same inputs, same output — so the iframe writer, the export
 * and the tests all read this one function.
 */
export function computeVars(table: SubstitutionTable, baseline: Baseline, cfg: Config, tokens: Tokens): Record<string, string> {
  const base = baseline.tokens.vars as Vars
  const now = tokens.vars as Vars
  const fams = baseline.families ?? familiesOf(table, baseline.cfg.cPrimary)
  const out: Record<string, string> = {}
  for (const e of table.entries) {
    out[varName(e.id)] = cssValue(mapEntry(e, base, now, baseline.cfg, cfg, fams))
  }
  return out
}

/** The global colour dials: every colour, family or not. */
function applyGlobal(c: Okla, sb: Dials): Okla {
  let { L, C, H } = c
  if (sb.hue !== 0 && C >= NEUTRAL_CHROMA) H = ((H + sb.hue) % 360 + 360) % 360
  if (sb.sat !== 1) C = clamp(C * sb.sat, 0, 0.4)
  if (sb.contrast !== 0) L = clamp(0.5 + (L - 0.5) * (1 + sb.contrast * 2), 0, 1)
  return { L, C, H, a: c.a }
}

/** One colour through its family mapping, then the global dials. */
function mapColor(c: Okla, fam: Family, e: Entry | null, base: Vars, now: Vars, sb: Dials, fams: Families): Okla {
  let mapped: Okla
  if (fam === 'keep') mapped = c
  else if (fam === 'neutral') mapped = e ? mapNeutral(c, e, base, now, sb) : c
  else if (fam === 'brand') {
    const b = parseCssColor(str(base['--k-primary'])), n = parseCssColor(str(now['--k-primary']))
    mapped = b && n ? mapByDelta(c, b, n) : c
  } else {
    const pick = sb[FAMILY_DIAL[fam]!] as string | undefined
    const centre = fams.centre[fam]
    const n = pick ? parseCssColor(pick) : null
    mapped = centre && n ? mapByDelta(c, centre, n) : c
  }
  return applyGlobal(mapped, sb)
}

const FAMILY_DIAL: Partial<Record<Family, keyof Dials>> = { secondary: 'cSecondary', accent: 'cAccent', success: 'cSuccess', warning: 'cWarning', danger: 'cDanger', info: 'cInfo' }

export function mapEntry(e: Entry, base: Vars, now: Vars, baseCfg: Config, cfg: Config, fams: Families): string {
  const sb = cfg.sb
  switch (e.kind) {
    case 'color': {
      const c = parseCssColor(e.value)
      if (!c) return e.value
      const fam = fams.of.get(e.id) ?? 'keep'
      const mapped = mapColor(c, fam, e, base, now, sb, fams)
      if (same(mapped, c)) return e.value
      const printed = formatLike(e.value, mapped)
      // The same pixels in another spelling are not a change (a black hairline
      // "moved" to rgb(0 0 0 / .05) — the L shift rounded away).
      const back = parseCssColor(printed)
      if (back && sameRgb(back, c)) return e.value
      return printed
    }
    case 'radius': return scaleLength(e.value, sb.radius)
    case 'space': return scaleLength(e.value, sb.space)
    case 'font-size': return scaleLength(e.value, sb.type)
    case 'line-height': return scaleLength(e.value, sb.lineHeight)
    case 'border-width': return scaleLength(e.value, sb.borderWidth)
    case 'angle': {
      const add = sb.gradAngle ?? 0
      if (!add) return e.value
      const deg = angleDeg(e.value)
      if (deg === null) return e.value
      return `${Math.round((((deg + add) % 360) + 360) % 360 * 100) / 100}deg`
    }
    case 'duration': {
      if (sb.motion === 1) return e.value
      const m = e.value.match(/^(\d*\.?\d+)(ms|s)$/)
      if (!m) return e.value
      const n = parseFloat(m[1]!) * sb.motion
      return `${Math.round(n * (m[2] === 'ms' ? 1 : 1000)) / (m[2] === 'ms' ? 1 : 1000)}${m[2]}`
    }
    case 'letter-spacing': {
      if (sb.tracking === 0) return e.value
      const v = e.value.trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/)
      if (!v) return e.value
      const unit = v[2]!
      const add = unit === 'px' ? sb.tracking * 16 : sb.tracking
      return `${Math.round((parseFloat(v[1]!) + add) * 1000) / 1000}${unit}`
    }
    case 'font-weight': {
      if (sb.weight === 0) return e.value
      const w = /^bold$/i.test(e.value) ? 700 : /^normal$/i.test(e.value) ? 400 : parseInt(e.value, 10)
      if (!Number.isFinite(w)) return e.value
      return String(clamp(Math.round(w / 100) * 100 + sb.weight * 100, 100, 900))
    }
    case 'shadow': return mapShadow(e.value, sb.shadow)
    case 'svg': {
      // Colours inside a data-URI SVG, percent-encoded (`%23fff`) or bare;
      // each goes through the same colour path, then back into the URI.
      let changed = false
      let out = e.value.replace(/(%23|#)([0-9a-f]{3,8})\b/gi, (m0, hash: string, hex: string) => {
        const c = parseCssColor('#' + hex)
        if (!c) return m0
        const mapped = mapColor(c, familyOfColor(c, fams), null, base, now, sb, fams)
        if (same(mapped, c)) return m0
        changed = true
        const printed = formatLike('#000000', { ...mapped, a: 1 })
        return hash + printed.slice(1)
      })
      // rgb()/rgba(), plain or percent-encoded (`rgba%28255, 255, 255, 0.55%29`)
      out = out.replace(/(rgba?)(\(|%28)([^)%]*?)(\)|%29)/gi, (m0, fn: string, open: string, inner: string, closeP: string) => {
        const c = parseCssColor(`${fn}(${inner.replace(/%2c/gi, ',')})`)
        if (!c) return m0
        const mapped = mapColor(c, familyOfColor(c, fams), null, base, now, sb, fams)
        if (same(mapped, c)) return m0
        changed = true
        const printed = formatLike('rgb(0 0 0 / 0.5)', mapped) // → rgb(r g b / a) or #hex
        const back = parseCssColor(printed)!
        const [r, g, b] = formatLike('#000000', { ...back, a: 1 }).slice(1).match(/../g)!.map((h) => parseInt(h, 16))
        const body = back.a < 0.999 ? `${r}, ${g}, ${b}, ${Math.round(back.a * 1000) / 1000}` : `${r}, ${g}, ${b}`
        return `${back.a < 0.999 ? 'rgba' : 'rgb'}${open}${body}${closeP}`
      })
      return changed ? out : e.value
    }
    case 'font-family': {
      const role = fontRole(e)
      if (role === 'mono') return e.value
      const knob = role === 'display' ? 'fontDisplay' : 'fontBody'
      if (cfg[knob] === baseCfg[knob]) return e.value
      const token = str(now[role === 'display' ? '--k-font-display' : '--k-font-body'])
      return token || e.value
    }
  }
}

/** Equal once quantised to 8-bit sRGB (what the screen can show). */
const sameRgb = (a: Okla, b: Okla) => formatLike('#000000', { ...a, a: 1 }) === formatLike('#000000', { ...b, a: 1 }) && Math.abs(a.a - b.a) < 0.002

const same = (a: Okla, b: Okla) =>
  Math.abs(a.L - b.L) < 1e-4 &&
  Math.abs(a.C - b.C) < 1e-4 &&
  // Two colours with (near) no chroma have no hue to disagree on.
  (Math.abs(hueDelta(a.H, b.H)) < 1e-3 || (a.C < 1e-4 && b.C < 1e-4)) &&
  Math.abs(a.a - b.a) < 1e-4

/** A gradient direction in degrees: `135deg`, `.25turn`, `to right` (= 90deg). */
export function angleDeg(v: string): number | null {
  const t = v.trim().toLowerCase()
  const side: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 }
  const kw = t.match(/^to\s+(top|right|bottom|left)$/)
  if (kw) return side[kw[1]!]!
  const m = t.match(/^(-?\d*\.?\d+)(deg|turn|rad|grad)$/)
  if (!m) return null
  const n = parseFloat(m[1]!)
  return m[2] === 'deg' ? n : m[2] === 'turn' ? n * 360 : m[2] === 'rad' ? (n * 180) / Math.PI : n * 0.9
}
