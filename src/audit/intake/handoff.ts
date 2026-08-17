import { DEFAULT_CONFIG } from '../../tokens/defaults'
import { applyColorTheme, COLOR_THEMES } from '../../tokens/stylesAndThemes'
import type { Config, ColorTheme, Radius, Scale, TypeScale } from '../../tokens/types'

/**
 * Carrying an audit from `/audit` into `/app`.
 *
 * The bridge used to be a lie: "Build the kit that fixes this" dropped you into
 * a blank configurator, throwing away everything the scan had just derived from
 * your code. This is what makes it true.
 *
 * Deliberately NARROW. The full audit result holds every file path it touched,
 * and none of that has any business outliving the tab it was produced in — this
 * carries counts and names only. sessionStorage, not localStorage: one tab, gone
 * when it closes. The visitor's code never left their machine and the handoff
 * must not be the thing that starts hoarding traces of it.
 */

const KEY = 'uicockpit.audit.handoff.v1'
const REPORT_KEY = 'uicockpit.audit.report.v1'

/** Which of the 19 controls the scan actually decided, and how sure it was. */
export interface Provenance {
  /** `null` = the codebase never settled this; we are using our default. */
  confidence: number | null
  /** Human phrase for colour: "declared as --brand" vs "most-used literal". */
  source?: string
}

export interface AuditHandoff {
  /** The folder the visitor pointed at — the only string here they'd recognise. */
  rootName: string
  filesRead: number
  parsed: number
  /** kind → how many of their files build it. Zero-count kinds are kept: an
   *  absent kind is a finding, and dropping it would imply we found everything. */
  kinds: Record<string, number>
  /** The skeleton: region → how many of their files build it. Regions only —
   *  never an arrangement, which a static read genuinely cannot recover. */
  shell: Record<string, number>
  /** Which flavour of each kind — `table.sortable` and friends, per file. */
  variants: Record<string, number>
  /** Their real values, resolved to CSS by the engine. This is what makes an
   *  honest "before" possible: we cannot reconstruct any single component of
   *  theirs, but we know their values exactly, and drift IS having nineteen
   *  radii with nothing deciding between them. */
  spread: {
    radius: string[]; shadow: string[]; spacing: string[]; color: string[]
    neutral: string[]; type: string[]
    /** Measured by ROLE and checked for legibility — not inferred from
     *  luminance, which is a guess wearing a measurement's clothes. */
    bg: string | null; fg: string | null; border: string | null
    polarity: 'light' | 'dark' | null
  }
  /** What the drift actually amounts to — measured, for the tally. */
  distinct: { radius: number; shadow: number; color: number; spacing: number }
  treatments: number
  singletons: number
  score: number | null
  provenance: Record<string, Provenance>
  /** The config fields the scan actually set. Kept so the app can tell whether
   *  a control STILL says what their code said — the moment they drag it
   *  somewhere else, "from your code" stops being true and must stop claiming
   *  to be. A badge that outlives its evidence is worse than no badge. */
  derived: Partial<Record<DerivedKey, string>>
  /** The derived kit, encoded. The kit lives in the URL, but the URL is easy to
   *  lose — leaving /app and coming back drops the hash by design (it belongs to
   *  the configurator, not to every route). Without this, the config silently
   *  reverts to our default while the provenance still remembers what was
   *  derived, and every row starts claiming "you changed this" about a change
   *  nobody made. Keeping the hash lets the app put the kit back. */
  hash: string
}

export type DerivedKey = 'colorTheme' | 'radius' | 'scale' | 'typeScale'

/* The audit's own vocabulary → the panel control it maps to, so the app can say
 * "this control came from your code" against the right row. */
const CONTROL_LABEL: Record<string, string> = {
  colorTheme: 'Brand',
  radius: 'Box radius',
  scale: 'Scale',
  typeScale: 'Text size',
  elevation: 'Elevation',
}

/** Config fields the scan can set, and the panel row each one drives. */
export const DERIVED_FIELDS: Array<{ key: DerivedKey; label: string }> = [
  { key: 'colorTheme', label: 'Brand' },
  { key: 'radius', label: 'Box radius' },
  { key: 'scale', label: 'Scale' },
  { key: 'typeScale', label: 'Text size' },
]

/** What a panel row should say about where its value came from. */
export type ProvenanceState = 'derived' | 'changed' | 'default'

/**
 * Compare the live config against what the scan derived.
 *
 * Done here rather than in the panel because the panel renders DISPLAY strings
 * ("Teal", "Soft") while the audit speaks config values — matching those two by
 * eye is exactly the sort of thing that works until someone renames a label.
 */
export function provenanceState(
  cfg: Record<string, unknown>,
  audit: AuditHandoff | null,
): Record<string, ProvenanceState> {
  if (!audit) return {}
  const out: Record<string, ProvenanceState> = {}
  for (const { key, label } of DERIVED_FIELDS) {
    const was = audit.derived[key]
    if (was == null) { out[label] = 'default'; continue }
    out[label] = String(cfg[key]) === was ? 'derived' : 'changed'
  }
  return out
}

export interface RawInferred {
  values?: Record<string, unknown>
  confidence?: Record<string, unknown>
}

/** Accept a value only if the kit actually offers it — a stored handoff or a
 *  future engine could name something this build has never heard of. */
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null

const RADII = ['none', 'subtle', 'soft', 'round'] as const
const SCALES = ['compact', 'default', 'comfortable'] as const
const TYPE_SCALES = ['sm', 'md', 'lg', 'xl'] as const

/**
 * Fold what the scan derived onto the default kit.
 *
 * Only the fields it actually set are applied — an inference the engine refused
 * to make (below its dominance floor) must arrive here as OUR default, not as a
 * confident guess wearing the visitor's name.
 */
export function configFromAudit(inferred: RawInferred): Config {
  const v = inferred.values || {}
  let cfg: Config = { ...DEFAULT_CONFIG }
  const theme = typeof v.colorTheme === 'string' ? (v.colorTheme as ColorTheme) : null
  if (theme && theme in COLOR_THEMES) cfg = applyColorTheme(cfg, theme)
  /* Then their EXACT colour on top. The named theme is only the nearest anchor
   * — snapping documenso's #a2e771 to our jade would hand them a kit that is
   * merely near their brand, which is the drift this tool exists to end. The
   * configurator accepts a custom hex, so the kit they land on is genuinely
   * theirs rather than ours in their neighbourhood. */
  if (typeof v.brandHex === 'string' && /^#[0-9a-f]{6}$/i.test(v.brandHex)) {
    // The theme stays the nearest NAMED anchor — that is what the panel row
    // reads — while cPrimary carries their exact hex, which is what actually
    // drives the tokens. There is no 'custom' theme to set; inventing one would
    // have put an invalid value straight into the shareable URL.
    cfg = { ...cfg, cPrimary: v.brandHex as Config['cPrimary'] }
  }
  const radius = oneOf<Radius>(v.radius, RADII)
  if (radius) cfg = { ...cfg, radius }
  const scale = oneOf<Scale>(v.scale, SCALES)
  if (scale) cfg = { ...cfg, scale }
  const typeScale = oneOf<TypeScale>(v.typeScale, TYPE_SCALES)
  if (typeScale) cfg = { ...cfg, typeScale }
  return cfg
}

/** Which panel rows to badge, and how. Rows absent from this map say nothing —
 *  silence is correct for the controls the audit never looks at. */
/** The values the scan committed to, as strings, for the comparison above. */
export function derivedFromAudit(inferred: RawInferred): Partial<Record<DerivedKey, string>> {
  const cfg = configFromAudit(inferred) as unknown as Record<string, unknown>
  const v = inferred.values || {}
  const out: Partial<Record<DerivedKey, string>> = {}
  for (const { key } of DERIVED_FIELDS) {
    // Only record what the ENGINE set — a field it declined to infer is our
    // default, and must not be badged as theirs.
    if (v[key] != null) out[key] = String(cfg[key])
  }
  return out
}

export function provenanceFromAudit(inferred: RawInferred): Record<string, Provenance> {
  const values = (inferred.values || {}) as Record<string, unknown>
  const conf = inferred.confidence || {}
  const out: Record<string, Provenance> = {}
  for (const [key, label] of Object.entries(CONTROL_LABEL)) {
    const raw = conf[key]
    const confidence = typeof raw === 'number' ? raw : null
    // Derived means the ENGINE committed to a value, not merely that it looked.
    out[label] = values[key] != null
      ? { confidence, source: typeof conf.colorThemeSource === 'string' && key === 'colorTheme' ? conf.colorThemeSource : undefined }
      : { confidence: null }
  }
  return out
}

export function saveHandoff(h: AuditHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h))
  } catch {
    /* private mode, quota, anything — the configurator still works without it */
  }
}

/**
 * Read a stored handoff, and DISCARD one written by an older build.
 *
 * The shape grows — spread and distinct arrived after the first version — and a
 * visitor who scanned before a deploy still has the old object in their tab.
 * Reading it optimistically crashed the whole app on `spread.color` for exactly
 * the people who had already used the feature. Anything missing a field we now
 * rely on is dropped, which lands them on the drop zone instead of a white
 * screen: losing an audit is a nuisance, losing the app is not survivable.
 */
export function readHandoff(): AuditHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const h = JSON.parse(raw) as Partial<AuditHandoff>
    const ok =
      h && typeof h.rootName === 'string' &&
      !!h.kinds && !!h.shell && !!h.variants && !!h.provenance && !!h.derived &&
      // Check every field the view actually reads, not a representative one:
      // `spread` grew `neutral` and `type` after the first version, and testing
      // only `color` let a half-shaped object through — it rendered, silently
      // wearing our neutrals, which is precisely the bug this guard exists for.
      !!h.spread && Array.isArray(h.spread.color) &&
      Array.isArray(h.spread.neutral) && Array.isArray(h.spread.type) &&
      Array.isArray(h.spread.radius) && Array.isArray(h.spread.shadow) &&
      !!h.distinct
    if (!ok) { clearHandoff(); return null }
    return h as AuditHandoff
  } catch {
    return null
  }
}

/**
 * The rendered report, kept for the tab's lifetime.
 *
 * "See the evidence →" used to land people back on the empty door and ask them
 * to scan again — a link that promises a document and delivers a form. The
 * report is ~120 KB against a ~5 MB budget, so keeping it costs nothing.
 *
 * It DOES contain their file paths, which the handoff deliberately excludes.
 * That is not a contradiction: the handoff is the thing we hold while they work
 * in the configurator, and the report is a document already rendered on their
 * screen. Neither leaves the machine, and both die with the tab.
 */
export function clearHandoff(): void {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(REPORT_KEY)
  } catch { /* nothing to clear */ }
}

export function saveReport(html: string): void {
  try { sessionStorage.setItem(REPORT_KEY, html) } catch { /* over quota → the link just re-scans */ }
}

export function readReport(): string | null {
  try { return sessionStorage.getItem(REPORT_KEY) } catch { return null }
}
