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
import { formatCssColor, hueDelta, parseCssColor, type Okla } from './cssColor'
import { varName, type Entry, type SubstitutionTable } from './table'

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
const fromPx = (px: number, unit: string): string => {
  const n = unit === 'px' ? px : px / 16
  const r = Math.round(n * 1000) / 1000
  return `${r}${unit}`
}

// ─────────────────────────── colour families ───────────────────────────

export type Family = 'brand' | 'secondary' | 'accent' | 'neutral' | 'keep'

const FAMILY_TOKEN: Record<Exclude<Family, 'neutral' | 'keep'>, string> = {
  brand: '--k-primary',
  secondary: '--k-secondary',
  accent: '--k-accent',
}
const NEUTRAL_CHROMA = 0.035
const FAMILY_HUE_WINDOW = 32

/** Which family a colour belongs to, judged against the BASELINE tokens. */
export function classifyColor(c: Okla, base: Vars): Family {
  if (c.a === 0) return 'keep'
  if (c.C < NEUTRAL_CHROMA) return 'neutral'
  let best: Family = 'keep'
  let bestD = FAMILY_HUE_WINDOW
  for (const fam of ['brand', 'secondary', 'accent'] as const) {
    const t = parseCssColor(str(base[FAMILY_TOKEN[fam]]))
    if (!t || t.C < NEUTRAL_CHROMA) continue
    const d = Math.abs(hueDelta(c.H, t.H))
    if (d < bestD) { bestD = d; best = fam }
  }
  return best
}

/** Shift lightness by `dL`, scaled so 0 and 1 never move (a tint stays a tint). */
function shiftL(L: number, from: number, dL: number): number {
  if (dL === 0) return L
  const w = dL < 0 ? (from > 0 ? L / from : 0) : (from < 1 ? (1 - L) / (1 - from) : 0)
  return clamp(L + dL * clamp(w, 0, 1.5), 0, 1)
}

function mapChromatic(c: Okla, fam: Exclude<Family, 'neutral' | 'keep'>, base: Vars, now: Vars): Okla {
  const key = FAMILY_TOKEN[fam]
  const b = parseCssColor(str(base[key]))
  const n = parseCssColor(str(now[key]))
  if (!b || !n) return c
  const H = c.H + hueDelta(b.H, n.H)
  const C = clamp(c.C * (n.C / Math.max(b.C, 0.01)), 0, 0.4)
  const L = shiftL(c.L, b.L, n.L - b.L)
  return { L, C, H: ((H % 360) + 360) % 360, a: c.a }
}

function mapNeutral(c: Okla, base: Vars, now: Vars): Okla {
  const bTint = parseCssColor(str(base['--k-fg-muted']))
  const nTint = parseCssColor(str(now['--k-fg-muted']))
  const bBg = parseCssColor(str(base['--k-bg']))
  const nBg = parseCssColor(str(now['--k-bg']))
  const bFg = parseCssColor(str(base['--k-fg']))
  const nFg = parseCssColor(str(now['--k-fg']))
  let { L, C, H } = c
  if (bTint && nTint) {
    const dC = nTint.C - bTint.C
    const dH = hueDelta(bTint.H, nTint.H)
    if (dC !== 0 || dH !== 0) {
      C = clamp(C + dC, 0, 0.06)
      // A pure grey has no hue to rotate: it takes the tint's hue outright.
      H = c.C < 0.004 ? nTint.H : (((H + dH) % 360) + 360) % 360
    }
  }
  if (bBg && nBg && bFg && nFg) {
    // Light greys ride the page (--k-bg), dark greys ride the ink (--k-fg).
    const w = clamp((L - 0.5) / 0.5, 0, 1)
    const dL = w * (nBg.L - bBg.L) + (1 - w) * (nFg.L - bFg.L)
    if (dL !== 0) L = shiftL(L, w >= 0.5 ? bBg.L : bFg.L, dL)
  }
  return { L, C, H, a: c.a }
}

// ─────────────────────────── shadows ───────────────────────────

/** Sum of blur radii and mean alpha of a shadow list — enough to say "how much". */
function shadowMeasure(shadow: string): { blur: number; alpha: number } | null {
  if (!shadow || /^none$/i.test(shadow.trim())) return { blur: 0, alpha: 0 }
  const layers = shadow.split(/,(?![^(]*\))/)
  let blur = 0
  let alpha = 0
  let n = 0
  for (const layer of layers) {
    const lengths = [...layer.matchAll(/(-?\d*\.?\d+)(px|rem|em)/g)].map((m) => (m[2] === 'px' ? parseFloat(m[1]!) : parseFloat(m[1]!) * 16))
    // x y blur spread — blur is the third length when present
    blur += Math.abs(lengths[2] ?? 0) + Math.abs(lengths[1] ?? 0) * 0.5
    const a = layer.match(/\/\s*([\d.]+)\s*\)|,\s*([\d.]+)\s*\)$/)
    alpha += a ? parseFloat(a[1] ?? a[2] ?? '1') : 1
    n++
  }
  return { blur, alpha: n ? alpha / n : 0 }
}

function mapShadow(value: string, base: Vars, now: Vars): string {
  const b = shadowMeasure(str(base['--k-shadow-md']))
  const n = shadowMeasure(str(now['--k-shadow-md']))
  if (!b || !n) return value
  if (n.blur === 0 && n.alpha === 0) return 'none'
  if (b.blur === 0) return value
  const rL = n.blur / b.blur
  const rA = b.alpha > 0 ? n.alpha / b.alpha : 1
  if (Math.abs(rL - 1) < 1e-6 && Math.abs(rA - 1) < 1e-6) return value
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

function mapFontSize(value: string, base: Vars, now: Vars): string {
  const v = toPx(value)
  const bBody = toPx(str(base['--k-type-body']))
  const nBody = toPx(str(now['--k-type-body']))
  const bH1 = toPx(str(base['--k-type-h1']))
  const nH1 = toPx(str(now['--k-type-h1']))
  if (!v || !bBody || !nBody || !bH1 || !nH1) return value
  const bStep = bH1.px / bBody.px
  const nStep = nH1.px / nBody.px
  if (v.px <= 0 || bStep <= 1 || nStep <= 1) return value
  const k = Math.log(v.px / bBody.px) / Math.log(bStep)
  // Below body (captions, labels) only the body size scales — a step ratio has
  // no business shrinking a 12px caption to 9px because headings got taller.
  const px = k >= 0 ? nBody.px * Math.pow(nStep, k) : v.px * (nBody.px / bBody.px)
  return fromPx(px, v.unit)
}

// ─────────────────────────── the sheet ───────────────────────────

export interface Baseline {
  cfg: Config
  tokens: Tokens
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
  const out: Record<string, string> = {}
  for (const e of table.entries) {
    out[varName(e.id)] = mapEntry(e, base, now, baseline.cfg, cfg)
  }
  return out
}

export function mapEntry(e: Entry, base: Vars, now: Vars, baseCfg: Config, cfg: Config): string {
  switch (e.kind) {
    case 'color': {
      const c = parseCssColor(e.value)
      if (!c) return e.value
      const fam = classifyColor(c, base)
      if (fam === 'keep') return e.value
      const mapped = fam === 'neutral' ? mapNeutral(c, base, now) : mapChromatic(c, fam, base, now)
      if (same(mapped, c)) return e.value
      return formatCssColor(mapped)
    }
    case 'radius': {
      const v = toPx(e.value)
      const b = toPx(str(base['--k-radius-md']))
      const n = toPx(str(now['--k-radius-md']))
      if (!v || !b || !n) return e.value
      if (b.px === n.px) return e.value
      if (b.px === 0) return fromPx(n.px, v.unit)
      return fromPx(v.px * (n.px / b.px), v.unit)
    }
    case 'space': {
      const v = toPx(e.value)
      const b = toPx(str(base['--k-space']))
      const n = toPx(str(now['--k-space']))
      if (!v || !b || !n || b.px === 0 || b.px === n.px) return e.value
      return fromPx(v.px * (n.px / b.px), v.unit)
    }
    case 'font-size':
      return mapFontSize(e.value, base, now)
    case 'shadow':
      return mapShadow(e.value, base, now)
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

const same = (a: Okla, b: Okla) =>
  Math.abs(a.L - b.L) < 1e-4 &&
  Math.abs(a.C - b.C) < 1e-4 &&
  // Two colours with (near) no chroma have no hue to disagree on.
  (Math.abs(hueDelta(a.H, b.H)) < 1e-3 || (a.C < 1e-4 && b.C < 1e-4)) &&
  Math.abs(a.a - b.a) < 1e-4
