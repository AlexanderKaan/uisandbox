/**
 * The knobs on the stand of THEIR codebase — the baseline every mapping is
 * relative to.
 *
 * Two readers feed it, in this order of trust:
 *   1. the audit (`auditFiles` over the archive's source selection):
 *      brand hex, radius, scale, type size — with confidence and provenance
 *   2. the substitution sheet itself (built from the CSS the browser paints):
 *      the font families in use, and a brand fallback when the audit declined
 *
 * The audit sees the SOURCE (a Tailwind class, a theme.ts); the sheet sees the
 * BUILD. When both are present they agree on a real project — and when they
 * don't, the sheet is closer to the screen. Fonts come only from the sheet: the
 * audit never inferred a family, and the sheet knows exactly which `font-family`
 * every rule declares.
 */
import { auditFiles } from '../audit/intake/engine'
import { configFromAudit, provenanceState, derivedFromAudit, type ProvenanceState, type RawInferred } from '../audit/intake/handoff'
import type { Archive } from '../audit/intake/readZip'
import { scanArchive } from '../audit/intake/readZip'
import { buildTokens } from '../tokens/buildTokens'
import { ALL_FONTS, CUSTOM_FONT_PREFIX, SYSTEM_FONT } from '../tokens/fonts'
import type { Config } from '../tokens/types'
import { parseCssColor } from './cssColor'
import { fontRole, toPx, type Baseline } from './mapping'
import type { SubstitutionTable } from './table'

export interface BaselineReport {
  baseline: Baseline
  /** Row label → derived / changed / default, for the panel badges. */
  provenance: (cfg: Config) => Record<string, ProvenanceState>
  /** Plain words about what was read — the visitor should know what we saw. */
  notes: string[]
  audit: { filesRead: number; parsed: number | null; refused: boolean } | null
}

interface AuditLike {
  meta?: { files?: number; parsed?: number }
  refused?: boolean
  inferredConfig?: RawInferred
}

/** A colour DECLARED as the brand — `--primary`, `--bs-primary`, `--brand`,
 *  `--color-primary` — outranks any count and any softer name (`accent`,
 *  `highlight`): getbootstrap.com's docs declare `--bd-accent: #ffe484` (a
 *  yellow) and the audit crowned it while `--bs-primary` sat right there. */
const BRAND_NAME = /^--([\w-]*-)?(primary|brand)(-(color|base|default|500|600|main|hex))?$/i
export function brandDeclared(table: SubstitutionTable): string | null {
  let best: { hex: string; n: number } | null = null
  for (const e of table.ofKind('color')) {
    const c = parseCssColor(e.value)
    if (!c || c.a < 0.99 || c.C < 0.05 || !/^#[0-9a-f]{6}$/i.test(e.value)) continue
    const n = e.sites.filter((s) => BRAND_NAME.test(s.prop)).length
    if (n && (!best || n > best.n)) best = { hex: e.value, n }
  }
  return best?.hex ?? null
}

/** Their most-used chromatic colour, when the audit could not name a brand. */
export function brandFromTable(table: SubstitutionTable): string | null {
  let best: { hex: string; score: number } | null = null
  for (const e of table.ofKind('color')) {
    const c = parseCssColor(e.value)
    if (!c || c.a < 0.99 || c.C < 0.08 || c.L < 0.25 || c.L > 0.8) continue
    // Weight backgrounds over text: a brand is what a button is painted with.
    const bg = e.sites.filter((s) => /background/.test(s.prop)).length
    const score = e.count + bg * 2
    if (!best || score > best.score) best = { hex: e.value, score }
  }
  if (!best) return null
  const c = parseCssColor(best.hex)!
  // Config wants a 6-digit hex.
  return c.a >= 0.99 && /^#[0-9a-f]{6}$/i.test(best.hex) ? best.hex : null
}

/** The family a knob should show for a font-family stack: a known name, System, or Custom. */
export function knobFont(stack: string): string {
  const first = stack.split(',')[0]!.trim().replace(/^["']|["']$/g, '')
  if (!first) return SYSTEM_FONT
  if (/^(system-ui|-apple-system|blinkmacsystemfont|ui-sans-serif|sans-serif|serif|monospace|ui-monospace|ui-serif|inherit)$/i.test(first)) return SYSTEM_FONT
  const known = ALL_FONTS.find((f) => f.toLowerCase() === first.toLowerCase())
  return known ?? CUSTOM_FONT_PREFIX + first
}

/** Icon fonts are glyph carriers, never a typeface choice. */
const ICON_FONT = /awesome|icon|glyph|material symbols|fontello|ionicons|feather|dashicons|simple-line/i
const SITE_SELECTOR = /^(html|body|:root)(\s*,\s*(html|body|:root))*$/i

/** The body/display families: what `body`/`html` declares wins; else the most-used. */
export function fontsFromTable(table: SubstitutionTable): { body: string | null; display: string | null } {
  let body: { v: string; n: number; site: boolean } | null = null
  let display: { v: string; n: number } | null = null
  for (const e of table.ofKind('font-family')) {
    if (ICON_FONT.test(e.value)) continue
    const role = fontRole(e)
    if (role === 'mono') continue
    if (role === 'display') {
      if (!display || e.count > display.n) display = { v: e.value, n: e.count }
      continue
    }
    const site = e.sites.some((s) => SITE_SELECTOR.test(s.selector ?? ''))
    // A family set on the page root beats any count; among equals, count.
    if (!body || (site && !body.site) || (site === body.site && e.count > body.n)) body = { v: e.value, n: e.count, site }
  }
  return { body: body ? knobFont(body.v) : null, display: display ? knobFont(display.v) : null }
}

/** The most-used corner radius, by the audit's own thresholds, when the audit declined. */
export function radiusFromTable(table: SubstitutionTable): Config['radius'] | null {
  let best: { px: number; n: number } | null = null
  for (const e of table.ofKind('radius')) {
    const v = toPx(e.value)
    if (!v) continue
    if (!best || e.count > best.n) best = { px: v.px, n: e.count }
  }
  if (!best) return null
  return best.px === 0 ? 'none' : best.px <= 5 ? 'subtle' : best.px <= 10 ? 'soft' : 'round'
}

/** The size declared on body/html/:root — the one the audit's dominance count cannot see. */
export function bodySizeFromTable(table: SubstitutionTable): Config['typeScale'] | null {
  for (const e of table.ofKind('font-size')) {
    if (!e.sites.some((s) => /^(html|body|:root)(\s*,\s*(html|body|:root))*$/i.test(s.selector ?? ''))) continue
    const v = toPx(e.value)
    if (!v) continue
    return v.px <= 13 ? 'sm' : v.px <= 15 ? 'md' : v.px <= 17 ? 'lg' : 'xl'
  }
  return null
}

export async function deriveBaseline(archive: Archive, table: SubstitutionTable): Promise<BaselineReport> {
  const notes: string[] = []
  let cfg: Config
  let inferred: RawInferred | null = null
  let audit: BaselineReport['audit'] = null
  try {
    const scan = await scanArchive(archive)
    const result = auditFiles(scan.files, { pkg: scan.pkg }) as AuditLike
    inferred = result.inferredConfig ?? null
    audit = { filesRead: result.meta?.files ?? scan.files.length, parsed: result.meta?.parsed ?? null, refused: Boolean(result.refused) }
    cfg = configFromAudit(inferred ?? {})
    notes.push(`Read ${audit.filesRead} source files${audit.parsed != null ? ` (${Math.round(audit.parsed * 100)}% parsed)` : ''}.`)
  } catch (err) {
    cfg = configFromAudit({})
    notes.push(`The source scan failed (${(err as Error).message}); the knobs start from the stylesheet census only.`)
  }

  const v = (inferred?.values ?? {}) as Record<string, unknown>
  const declared = brandDeclared(table)
  if (declared) {
    cfg = { ...cfg, cPrimary: declared as Config['cPrimary'] }
    notes.push(`Brand declared in the built CSS as a primary/brand variable: ${declared}${typeof v.brandHex === 'string' && v.brandHex !== declared ? ` (the source scan said ${v.brandHex})` : ''}.`)
  } else if (typeof v.brandHex !== 'string') {
    const brand = brandFromTable(table)
    if (brand) { cfg = { ...cfg, cPrimary: brand as Config['cPrimary'] }; notes.push(`Brand taken from the most-painted colour in the built CSS: ${brand}.`) }
    else notes.push('No brand colour could be told from the code — the Brand knob starts at our default.')
  } else notes.push(`Brand from the code: ${v.brandHex}.`)

  if (v.radius == null) {
    const r = radiusFromTable(table)
    if (r) { cfg = { ...cfg, radius: r }; notes.push(`Radius from the most-used corner in the built CSS: ${r}.`) }
  }
  const bodySize = bodySizeFromTable(table)
  if (bodySize) { cfg = { ...cfg, typeScale: bodySize }; notes.push(`Text size from the body font-size in the built CSS: ${bodySize}.`) }

  const fonts = fontsFromTable(table)
  if (fonts.body) cfg = { ...cfg, fontBody: fonts.body }
  if (fonts.display) cfg = { ...cfg, fontDisplay: fonts.display }
  else if (fonts.body) cfg = { ...cfg, fontDisplay: fonts.body }
  if (fonts.body || fonts.display) notes.push(`Fonts from the stylesheets: body ${fonts.body ?? '—'}, display ${fonts.display ?? fonts.body ?? '—'}.`)

  const baseline: Baseline = { cfg, tokens: buildTokens(cfg) }
  const derived = inferred ? derivedFromAudit(inferred) : {}
  const provenance = (live: Config) => {
    const out = provenanceState(live as unknown as Record<string, unknown>, inferred ? ({ derived } as never) : null)
    // Fonts came from the sheet, not the audit — badge them the same way.
    for (const [key, label] of [['fontBody', 'Body font'], ['fontDisplay', 'Display font']] as const) {
      const was = cfg[key]
      const camefromUs = key === 'fontBody' ? !fonts.body : !fonts.display && !fonts.body
      out[label] = camefromUs ? 'default' : live[key] === was ? 'derived' : 'changed'
    }
    if (declared || (typeof v.brandHex !== 'string' && brandFromTable(table))) out['Brand'] = live.cPrimary === cfg.cPrimary ? 'derived' : 'changed'
    if (v.radius == null && radiusFromTable(table)) out['Box radius'] = live.radius === cfg.radius ? 'derived' : 'changed'
    if (bodySize) out['Text size'] = live.typeScale === cfg.typeScale ? 'derived' : 'changed'
    return out
  }
  return { baseline, provenance, notes, audit }
}
