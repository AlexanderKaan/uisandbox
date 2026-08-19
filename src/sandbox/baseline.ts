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
import { formatCssColor, parseCssColor } from './cssColor'
import { familiesOf, fontRole, toPx, type Baseline } from './mapping'
import type { Site, SubstitutionTable } from './table'

export interface BaselineReport {
  baseline: Baseline
  /** The code names its brand (`--bs-primary`) — the paint never overrides that. */
  brandDeclared: boolean
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
/* `--bs-primary`, `--color-primary`, `md_theme_light_primary`, `colorPrimary`,
 * `brandColor`, `Brand.primary` — not `on_primary`, `primary_container`,
 * `primary-foreground`. */
const BRAND_NAME = /^(?:--)?(?![\w-]*\bon[_-]?primary)(?:[\w.-]*?[-_.])?(primary|brand)(?:[-_]?(color|colour|base|default|500|600|main|hex))?$/i
export function brandDeclared(table: SubstitutionTable): string | null {
  // Among the colours NAMED as brand, the one the build paints with most: Ant
  // Design's site declares `--ant-color-primary: #1677ff` once, in the sheet
  // every page loads (28,828 uses), and `#00b96b` in ten theme-demo pages —
  // the count of declaration sites crowned the demo green.
  // The cascade counts too: Docusaurus ships Infima's `--ifm-color-primary:
  // #3578e5` and the site's own `:root { --ifm-color-primary: #ef4242 }` later
  // in the same sheet — the blue is declared, the red is painted. A later
  // declaration of the same property on the same selector in the same file
  // overrides the earlier; only the surviving declaration names a brand.
  const isBrand = (s: Site) => BRAND_NAME.test(s.prop) || BRAND_NAME.test(s.prop.replace(/-(rgb|hsl|channels)$/i, ''))
  const latest = new Map<string, number>()
  for (const e of table.ofKind('color')) for (const s of e.sites) {
    if (!isBrand(s) || s.seq === undefined) continue
    const k = `${s.file}\n${s.selector ?? ''}\n${s.prop}`
    latest.set(k, Math.max(latest.get(k) ?? 0, s.seq))
  }
  const survives = (s: Site) => s.seq === undefined || latest.get(`${s.file}\n${s.selector ?? ''}\n${s.prop}`) === s.seq
  let best: { hex: string; n: number; count: number } | null = null
  for (const e of table.ofKind('color')) {
    const c = parseCssColor(e.value)
    if (!c || c.a < 0.99 || c.C < 0.05) continue
    const named = e.sites.filter((s) => isBrand(s) && survives(s))
    const n = named.length
    // What the build leans on: the literal's own paint count plus every
    // `var(--ifm-color-primary)` read of the properties that name it (Metro:
    // the red `--ifm-color-primary` is written twice and read 22 times; the
    // DocSearch widget's `--docsearch-primary-color` literal is painted 20
    // times and read once).
    const props = new Set(named.map((s) => s.prop))
    let count = e.count
    for (const p of props) count += table.refs.get(p) ?? 0
    if (n && (!best || count > best.count || (count === best.count && n > best.n))) best = { hex: formatCssColor({ ...c, a: 1 }), n, count }
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
    if (!best || score > best.score) best = { hex: formatCssColor({ ...c, a: 1 }), score }
  }
  return best?.hex ?? null
}

/** The family a knob should show for a font-family stack: a known name, System, or Custom. */
export function knobFont(stack: string): string {
  const first = stack.split(',')[0]!.trim().replace(/^["']|["']$/g, '')
  if (!first) return SYSTEM_FONT
  if (/^(system-ui|-apple-system|blinkmacsystemfont|ui-sans-serif|sans-serif|serif|monospace|ui-monospace|ui-serif|inherit)$/i.test(first)) return SYSTEM_FONT
  const known = ALL_FONTS.find((f) => f.toLowerCase() === first.toLowerCase())
  // A build tool's content hash on a self-hosted family (`Atkinson-c7f4c4e8…`,
  // `__Inter_abc123`) is not part of the name a person would recognise.
  const label = first.replace(/[-_][0-9a-f]{6,}$/i, '').replace(/^__/, '').replace(/_[0-9a-f]{6}$/i, '')
  return known ?? CUSTOM_FONT_PREFIX + label
}

/** Icon fonts are glyph carriers, never a typeface choice. */
const ICON_FONT = /awesome|icon|glyph|material symbols|fontello|ionicons|feather|dashicons|simple-line/i
const SITE_SELECTOR = /^(html|body|:root)(\s*,\s*(html|body|:root))*$/i

/** Every family their sheet carries, as knob names, most-used first — the
 *  picker's "In your code" group. Icon fonts and the system stack are not a
 *  choice, so not listed. */
export function codeFonts(table: SubstitutionTable): string[] {
  const seen = new Map<string, number>()
  for (const e of table.ofKind('font-family')) {
    if (ICON_FONT.test(e.value)) continue
    const name = knobFont(e.value)
    if (name === SYSTEM_FONT) continue
    seen.set(name, (seen.get(name) ?? 0) + e.count)
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
}

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

  // Their greys are their greys: the brand knob moves the brand family only.
  // ('auto' — greys taking a whisper of the brand — stays available as a knob.)
  cfg = { ...cfg, neutral: 'neutral' }
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

  const baseline: Baseline = { cfg, tokens: buildTokens(cfg), families: familiesOf(table, cfg.cPrimary) }
  const derived = inferred ? derivedFromAudit(inferred) : {}
  const report: BaselineReport = {
    baseline,
    brandDeclared: Boolean(declared),
    notes,
    audit,
    // Reads report.baseline.cfg at CALL time, so a later correction from the
    // rendered page (refineFromDocument) keeps the badges honest.
    provenance: (live: Config) => {
      const base = report.baseline.cfg
      const out = provenanceState(live as unknown as Record<string, unknown>, inferred ? ({ derived } as never) : null)
      for (const [key, label] of [['fontBody', 'Body font'], ['fontDisplay', 'Display font']] as const) {
        const cameFromUs = key === 'fontBody' ? !fonts.body && base.fontBody === DEFAULT_FONT : !fonts.display && !fonts.body && base.fontDisplay === DEFAULT_FONT
        out[label] = cameFromUs ? 'default' : live[key] === base[key] ? 'derived' : 'changed'
      }
      if (declared || (typeof v.brandHex !== 'string' && brandFromTable(table))) out['Brand'] = live.cPrimary === base.cPrimary ? 'derived' : 'changed'
      if (v.radius == null && radiusFromTable(table)) out['Box radius'] = live.radius === base.radius ? 'derived' : 'changed'
      if (bodySize) out['Text size'] = live.typeScale === base.typeScale ? 'derived' : 'changed'
      return out
    },
  }
  return report
}

const DEFAULT_FONT = configFromAudit({}).fontBody

/**
 * The truth is the screen (notes/lessons.md): once the page has rendered, the
 * COMPUTED font of <body> and of the first heading beat any reading of the
 * stylesheets — a `body { font-family: Arial }` in globals.css loses to the
 * `next/font` class on <body>, and only the browser knows. Returns the fields
 * that differ from the current baseline, or null.
 */
export function refineFromDocument(doc: Document, cfg: Config, opts: { brand?: boolean } = {}): Partial<Config> | null {
  const win = doc.defaultView
  if (!win || !doc.body) return null
  const mode = (els: Element[]) => {
    const tally = new Map<string, number>()
    for (const el of els) {
      // Only elements that carry text of their own — the body's font is what
      // most words are set in, not what <body> declares (Next's globals.css says
      // Arial while every paragraph is Geist through a utility class).
      const words = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent?.trim().length ?? 0).reduce((a, b) => a + b, 0)
      if (words < 3) continue
      const fam = win.getComputedStyle(el).fontFamily
      tally.set(fam, (tally.get(fam) ?? 0) + words)
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const out: Partial<Config> = {}
  // A brand is what the interface is PAINTED with: buttons, links, an app bar —
  // area-weighted, so one big CTA or header outranks ten tiny chips, and full-
  // page backgrounds (> 60 % of the viewport) don't count. When the code's
  // most-used colour never fills anything but another chromatic colour does
  // (a tag's text vs the primary button — twice on small sites), the paint
  // wins. Never over a brand the code DECLARES (`--bs-primary`), and only on
  // the first screen (`opts.brand`): a later screen whose only button is the
  // secondary must not re-decide.
  if (opts.brand) {
    const vw = win.innerWidth || 1200, vh = win.innerHeight || 800
    const fills = new Map<string, number>()
    for (const el of Array.from(doc.querySelectorAll('body *')).slice(0, 1500)) {
      const cs = win.getComputedStyle(el)
      const c = parseCssColor(cs.backgroundColor)
      if (!c || c.a < 0.9 || c.C < 0.08 || c.L < 0.2 || c.L > 0.85) continue
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8 || r.width * r.height > vw * vh * 0.6) continue
      const hex = formatCssColor({ ...c, a: 1 })
      const weight = r.width * r.height * (/^(BUTTON|A)$/.test(el.tagName) || el.getAttribute('role') === 'button' ? 3 : 1)
      fills.set(hex, (fills.get(hex) ?? 0) + weight)
    }
    const top = [...fills.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top && top[0].toLowerCase() !== cfg.cPrimary.toLowerCase() && !fills.has(cfg.cPrimary.toLowerCase())) out.cPrimary = top[0] as Config['cPrimary']
  }
  const bodyFam = mode(Array.from(doc.querySelectorAll('p, li, td, th, span, a, label, dd, dt, small, div, section, article, main, body')).slice(0, 600))
  if (bodyFam) {
    const k = knobFont(bodyFam)
    if (k !== cfg.fontBody) out.fontBody = k
  }
  const headFam = mode(Array.from(doc.querySelectorAll('h1, h2, h3, [class*="title"], [class*="heading"]')).slice(0, 100))
  if (headFam) {
    const k = knobFont(headFam)
    if (k !== cfg.fontDisplay) out.fontDisplay = k
  } else if (out.fontBody && cfg.fontDisplay === cfg.fontBody) {
    out.fontDisplay = out.fontBody
  }
  return Object.keys(out).length ? out : null
}

/**
 * A sheet that GREW after the baseline was derived (styled-components, Emotion,
 * a Tailwind CDN — every rule arrives through the CSSOM at runtime) can now
 * answer what the archive could not: brand, radius, text size, fonts. Only the
 * knobs still on OUR default are touched — a value the audit decided stands.
 */
export function refineFromTable(table: SubstitutionTable, cfg: Config): Partial<Config> | null {
  const def = configFromAudit({})
  const out: Partial<Config> = {}
  if (cfg.cPrimary === def.cPrimary) {
    const brand = brandDeclared(table) ?? brandFromTable(table)
    if (brand && brand.toLowerCase() !== def.cPrimary.toLowerCase()) out.cPrimary = brand as Config['cPrimary']
  }
  if (cfg.radius === def.radius) { const r = radiusFromTable(table); if (r && r !== def.radius) out.radius = r }
  if (cfg.typeScale === def.typeScale) { const t = bodySizeFromTable(table); if (t && t !== def.typeScale) out.typeScale = t }
  if (cfg.fontBody === def.fontBody || cfg.fontDisplay === def.fontDisplay) {
    const f = fontsFromTable(table)
    if (cfg.fontBody === def.fontBody && f.body && f.body !== def.fontBody) out.fontBody = f.body
    if (cfg.fontDisplay === def.fontDisplay && (f.display ?? f.body) && (f.display ?? f.body) !== def.fontDisplay) out.fontDisplay = f.display ?? f.body!
  }
  return Object.keys(out).length ? out : null
}
