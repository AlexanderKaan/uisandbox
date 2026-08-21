/**
 * design.tokens.json — the W3C Design Tokens Format Module (2025.10).
 *
 * The interchange format: Tokens Studio imports it into Figma, Style
 * Dictionary builds it out to any platform, and a growing pile of tooling
 * reads it without a plugin. That is the whole reason it is here — it is the
 * one export nobody has to write an adapter for.
 *
 * It describes THE APP WE MEASURED, not a kit we invented: same source as
 * DESIGN.md (measured.ts), so the two files always agree.
 *
 * The format is strict about shapes — `$value`/`$type`, colours as sRGB
 * components, dimensions as `{value, unit}`. A value we cannot express in the
 * format is left out rather than bent into it: a token file that fails to
 * validate is worse than a shorter one that passes.
 */
import type { SubstitutionTable } from '../sandbox/table'
import type { Config } from '../tokens/types'
import { parseCssColor, toSrgb } from '../sandbox/cssColor'
import { measure, pxOf, type NamedRow, type Row } from './measured'
import type { PaintRoles } from '../sandbox/coverage'

type Json = Record<string, unknown>

function colorValue(css: string): Json | null {
  const c = parseCssColor(css)
  if (!c) return null
  const { components, alpha, hex } = toSrgb(c)
  const out: Json = { colorSpace: 'srgb', components, hex }
  if (alpha < 1) out.alpha = alpha
  return out
}

/** `{value, unit}`; the format allows px and rem, so everything else is
 *  converted to px rather than smuggled through as a string. */
function dimValue(css: string): Json | null {
  const v = css.trim()
  const m = v.match(/^(-?\d*\.?\d+)\s*(px|rem)$/i)
  if (m) return { value: parseFloat(m[1]!), unit: m[2]!.toLowerCase() }
  const px = pxOf(v)
  return px === null ? null : { value: Math.round(px * 1000) / 1000, unit: 'px' }
}

/** Split on commas that are not inside parentheses — `rgba(0, 0, 0, .1)` is
 *  one shadow, not four. */
function topLevelSplit(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === sep && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

function shadowValue(css: string): Json | Json[] | null {
  const parts = topLevelSplit(css, ',')
  const made: Json[] = []
  for (const p of parts) {
    // Inset shadows have no home in this shape; skip the whole value rather
    // than export half of a stack and change what it looks like.
    if (/\binset\b/i.test(p)) return null
    const words = topLevelSplit(p, ' ')
    const lengths: Json[] = []
    let color: Json | null = null
    for (const w of words) {
      const d = dimValue(w)
      if (d && lengths.length < 4) { lengths.push(d); continue }
      const c = colorValue(w)
      if (c && !color) { color = c; continue }
      return null // something we do not understand — do not guess
    }
    if (!color || lengths.length < 3) return null
    made.push({
      color,
      offsetX: lengths[0]!,
      offsetY: lengths[1]!,
      blur: lengths[2]!,
      spread: lengths[3] ?? { value: 0, unit: 'px' },
    })
  }
  if (!made.length) return null
  return made.length === 1 ? made[0]! : made
}

const desc = (r: Row, what: string): string =>
  `${what}; used ${r.count} time${r.count === 1 ? '' : 's'} in the build${r.changed ? `, was ${r.was}` : ''}`

export function genDtcg(
  table: SubstitutionTable,
  vars: Record<string, string>,
  cfg: Config,
  projectName: string,
  opts: { date?: string; painted?: Map<number, PaintRoles>; anchors?: { text?: string; background?: string } } = {},
): string {
  const m = measure(table, vars, cfg.cPrimary, { display: cfg.fontDisplay, body: cfg.fontBody }, { painted: opts.painted, anchors: opts.anchors })
  const date = opts.date ?? new Date().toISOString().slice(0, 10)
  const out: Json = {
    $description: `${projectName} — measured from the built app by UISandbox on ${date}. ${m.totals.moved} of ${m.totals.values} values changed in this pass. W3C Design Tokens Format Module 2025.10.`,
  }

  const color: Json = { $type: 'color' }
  for (const p of m.palette) {
    const v = colorValue(p.value)
    if (v) color[p.name] = { $value: v, $description: desc(p, p.name === 'primary' ? 'the brand colour' : `measured on ${p.props[0] ?? 'the build'}`) }
  }
  if (Object.keys(color).length > 1) out.color = color

  const font: Json = { $type: 'fontFamily' }
  font.display = { $value: splitStack(m.fonts.display), $description: 'headings' }
  font.body = { $value: splitStack(m.fonts.body), $description: 'body copy' }
  out.font = font

  const size: Json = { $type: 'dimension' }
  for (const [i, r] of m.sizes.slice(0, 8).entries()) {
    const v = dimValue(r.value)
    if (v) size[`step-${i + 1}`] = { $value: v, $description: desc(r, 'font size') }
  }
  if (Object.keys(size).length > 1) out.fontSize = size

  const weight: Json = { $type: 'fontWeight' }
  for (const r of m.weights.slice(0, 6)) {
    const n = parseInt(r.value, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 1000) weight[`w-${n}`] = { $value: n, $description: desc(r, 'font weight') }
  }
  if (Object.keys(weight).length > 1) out.fontWeight = weight

  const named = (rows: NamedRow[], what: string): Json | null => {
    const g: Json = { $type: 'dimension' }
    for (const r of rows) {
      const v = dimValue(r.value)
      if (v) g[r.name] = { $value: v, $description: desc(r, what) }
    }
    return Object.keys(g).length > 1 ? g : null
  }
  const radius = named(m.radii, 'corner radius')
  if (radius) out.radius = radius
  const spacing = named(m.spacing, 'spacing step')
  if (spacing) out.spacing = spacing

  const shadow: Json = { $type: 'shadow' }
  for (const [i, r] of m.shadows.slice(0, 6).entries()) {
    const v = shadowValue(r.value)
    if (v) shadow[`level-${i + 1}`] = { $value: v, $description: desc(r, 'elevation') }
  }
  if (Object.keys(shadow).length > 1) out.shadow = shadow

  return JSON.stringify(out, null, 2) + '\n'
}

/** `Inter, system-ui, sans-serif` → the array the format prefers for a stack. */
function splitStack(v: string): string | string[] {
  const parts = v.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  return parts.length > 1 ? parts : (parts[0] ?? v)
}
