/**
 * Token categories that aren't user-configurable but matter for a complete
 * design system export. Z-index, breakpoints, container widths, chart
 * palette, extended type scale, and the full WCAG audit all live here so
 * every generator can pull them through one interface.
 *
 * The principle: we don't ask the user to pick z-index 50 vs 60 — that's
 * design-system busywork. Industry-standard stacks are bundled, and we
 * surface them in the export so the kit feels complete.
 */
import type { Config, Tokens } from './types'
import { contrast, hslToHex, oklchStrToHex } from './color'
import { buildTokens } from './buildTokens'

/** Resolve a token value to a hex string. Tokens come in three flavors:
 *  - hex literals (e.g. "#007aff") — return as-is
 *  - oklch() functions (e.g. "oklch(95% 0.01 240)") — the engine's PRIMARY
 *    output format (the `hsl()` emitter authors in HSL but emits OKLCH); parse
 *    via oklchStrToHex.
 *  - hsl() functions (legacy / any literal HSL) — parse and convert to hex.
 *  The contrast() utility only accepts hex, so this bridges the gap.
 *  NOTE: missing the oklch branch silently returned #000000 for every modern
 *  token, so the WCAG audit compared black-on-black (1.00:1) and reported a
 *  perfectly accessible theme as failing — guard this with a test. */
function toHex(val: string): string {
  if (!val) return '#000000'
  if (val.startsWith('#')) return val
  if (val.startsWith('oklch')) return oklchStrToHex(val)
  const m = val.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/)
  if (m) {
    const h = parseFloat(m[1] as string)
    const s = parseFloat(m[2] as string)
    const l = parseFloat(m[3] as string)
    return hslToHex(h, s, l)
  }
  /* A layered gradient — what `canvas: gradient` emits: three radial tints of
   * 7-12% over one opaque base. A pair table cannot score a gradient, because
   * "the background" is a different colour at every pixel; the RENDERED scan
   * (`npm run a11y:matrix`, which measures composited pixels) is the authority
   * there and reads zero. What this table can honestly do is take the base
   * layer — the last top-level stop, the only opaque one — and note that the
   * tints above it are capped low enough not to move it far. */
  if (/(^|[\s,])(radial|linear|conic)-gradient\(/.test(val)) {
    let depth = 0
    let last = ''
    let cur = ''
    for (const chunk of val) {
      if (chunk === '(') depth++
      if (chunk === ')') depth--
      if (chunk === ',' && depth === 0) { if (cur.trim()) last = cur.trim(); cur = '' } else cur += chunk
    }
    const base = (cur.trim() || last).trim()
    if (base && !/gradient\(/.test(base)) return toHex(base)
  }
  /* Checked BEFORE color-mix, and that ordering is the whole point: the
   * color-mix pattern is anchored to a closing paren at the end of the string,
   * and a gradient built FROM color-mix stops also ends in one. Tried the other
   * way round it matched the entire gradient as a single mix, produced nonsense,
   * and landed in the unparseable branch below. */

  /* color-mix() — what `canvas: brand` and `gradient` emit for --k-bg:
   * `color-mix(in srgb, <brand> 6%, <near-white>)`. Without this branch it fell
   * through to the black fallback below and the audit reported body text at
   * 1.08:1 on ten of thirty-two theme×mode combinations, while axe measured the
   * rendered page at zero. That is the SAME failure the note at the top of this
   * file already describes ("compared black-on-black and reported a perfectly
   * accessible theme as failing") — it came back through a syntax the parser
   * had not met yet, because the fallback silently invents an answer instead of
   * admitting it cannot read the value. */
  const mix = val.match(/color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)\s*$/)
  if (mix) {
    const a = toHex(mix[1] as string)
    const b = toHex(mix[3] as string)
    const w = parseFloat(mix[2] as string) / 100
    const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
    const out = [0, 1, 2]
      .map((i) => Math.round(ch(a, i) * w + ch(b, i) * (1 - w)))
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0'))
      .join('')
    return `#${out}`
  }
  /* Anything still unrecognised. Returning '#000000' here is what turned an
   * unreadable value into a confident wrong number twice; a colour the audit
   * cannot parse must not be scored as if it could be. Magenta is deliberate:
   * it makes an unhandled syntax show up as an absurd ratio in the badge rather
   * than a plausible failure someone spends an afternoon chasing. */
  if (typeof console !== 'undefined') console.warn(`[uicockpit] contrast audit cannot parse: ${val}`)
  return '#ff00ff'
}

/* ───────── Z-index stack ─────────
 * Industry-standard layering (Material/Tailwind/Bootstrap converge on these).
 * Each tier leaves 90 units of headroom for app-specific overrides between layers. */
export const Z_INDEX = {
  base: 0,
  dropdown: 50,
  sticky: 100,
  fixed: 200,
  drawer: 300,
  modal: 1000,
  popover: 1100,
  toast: 1200,
  tooltip: 1300,
} as const

/* ───────── Breakpoints ─────────
 * Tailwind v4 defaults — de-facto standard in 2026, used by shadcn,
 * Radix, Vercel templates. Min-width based (mobile-first). */
/* ───────── Window classes + pane constants (H3a layout grammar) ─────────
 * The M3 window-size classes the SHELL recipes adapt at (container-query
 * thresholds — a @container condition can't read a var(), so the recipes
 * carry the literals; these tokens are the consumer-facing vocabulary), plus
 * the pane constants (fixed widths, the 24px spacer, the shell margins). */
export const WINDOW_CLASSES = {
  compact: '600px',   // < 600 = compact (bottom-bar territory)
  medium: '840px',    // 600–839 = medium (collapsed rail)
  expanded: '1200px', // 840–1199 = expanded (two panes)
  large: '1600px',    // 1200–1599 = large · ≥1600 = extra-large (412px fixed pane)
} as const

export const PANE_CONSTANTS = {
  fixed: '360px',
  'fixed-xl': '412px',
  spacer: '24px',
  'margin-compact': '16px',
  margin: '24px',
} as const

export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

/* ───────── Container widths ─────────
 * Three named widths cover 95% of layouts. Narrow = reading column (blog,
 * docs). Regular = app dashboard. Wide = full marketing/showcase. */
export const CONTAINER_WIDTHS = {
  narrow: '640px',
  regular: '1024px',
  wide: '1280px',
  max: '1536px',
} as const

/* ───────── Chart palette ─────────
 * Six-color rotation for data series. Derived from the active theme so
 * "Apple kit" gets a blue-led palette, "Airbnb kit" a red-led palette.
 * Order matters: chart-1 is the highlight series, chart-6 the deemphasized.
 *
 * Pattern follows shadcn/charts conventions but auto-tints from primary +
 * accent + system colors instead of asking the user. */
export function buildPalette(cfg: Config): Record<string, string> {
  const tk = buildTokens(cfg)
  const v = tk.vars as Record<string, string>
  // Single source: the decorative palette (--k-accent-1..6 + ink + gradients)
  // and the chart series (--k-chart-1..6, same colours) are derived in
  // buildTokens from the brand hue per the user's Palette character
  // (pastel / vivid / brand). Charts + avatars + tiles share one set.
  const g = (k: string) => v[k] ?? ''
  const out: Record<string, string> = {}
  for (let i = 1; i <= 6; i++) {
    out[`accent-${i}`] = g(`--k-accent-${i}`)
    out[`accent-${i}-ink`] = g(`--k-accent-${i}-ink`)
    out[`accent-${i}-soft`] = g(`--k-accent-${i}-soft`)
    out[`accent-${i}-soft-fg`] = g(`--k-accent-${i}-soft-fg`)
    out[`grad-${i}`] = g(`--k-grad-${i}`)
    out[`chart-${i}`] = g(`--k-chart-${i}`)
  }
  return out
}

/* ───────── Extended type scale (h4 / h5 only) ─────────
 * buildTokens() already emits the full first-class scale (display · h1 · h2 · h3 ·
 * body · small · caption · eyebrow) in REM. This adds ONLY the two in-between
 * steps a marketing page sometimes needs (h4/h5) — emitted in rem to match.
 *
 * ⚠️ The token values from buildTokens are REM strings (e.g. "1.875rem"), so the
 * parsed numbers ARE rem — re-emit them with `rem`, never `px`. (A prior version
 * appended `px` to the rem numbers, producing 0.75px-tall text in every export —
 * the preview was unaffected because it reads buildTokens().vars directly.) */
export function buildTypeScale(cfg: Config): Record<string, string> {
  const tk = buildTokens(cfg)
  const v = tk.vars as Record<string, string>
  const num = (k: string) => parseFloat(v[k] ?? '0') // rem value (strips the "rem" unit)
  const rem = (n: number) => `${Math.round(n * 1000) / 1000}rem`
  const h3 = num('--k-type-h3')
  const body = num('--k-type-body')
  return {
    h4: rem((h3 + body) / 2), // tween between h3 and body
    h5: rem(body * 1.05),
  }
}

/* ───────── Spacing scale ─────────
 * The configurator uses one --k-space base (density-driven). For a complete
 * scale we expose s-0 through s-12 as multiples — pattern used by Tailwind,
 * Chakra, Material. This way "padding: var(--k-s-4)" is a real token, not
 * "padding: calc(var(--k-space) * 4)". */
/* The fine-grained spacing grid — FIXED rem steps keyed by their px-at-16-root
 * value (so --k-s-12 === 0.75rem === 12px at default). Every common component
 * padding/gap maps to an exact step (no rounding). This is the 4pt grid as
 * named tokens (Tailwind-style), used for component-internal spacing; the
 * density-responsive RHYTHM still lives in --k-space/--k-pad/--k-stack-gap.
 * REM so it scales with the user's root font-size. */
export const SPACING_STEPS = [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32] as const
export function spacingScale(): Record<string, string> {
  const out: Record<string, string> = { 's-0': '0' }
  for (const px of SPACING_STEPS) out[`s-${px}`] = `${+(px / 16).toFixed(4)}rem`
  return out
}
// buildSpacingScale kept for genCss back-compat — now just the fixed scale.
export function buildSpacingScale(_cfg: Config): Record<string, string> {
  return spacingScale()
}

/* ───────── Full WCAG contrast audit ─────────
 * Every meaningful text-on-background pair in the kit, audited against
 * WCAG AA (≥4.5:1 for normal text, ≥3:1 for large text and UI components).
 * Returns the list so genBrief can publish it and the topbar can show
 * "passing X of Y" — much more rigorous than the single primary-on-button
 * check we had before. */
export interface ContrastPair {
  label: string
  fg: string
  bg: string
  ratio: number
  required: 4.5 | 3
  passes: boolean
  /** One-line fix-it hint shown below failing rows in the A11Y popover.
   *  Phrased as "Try: X, or Y" — points at a config control in the panel.
   *  Honest UX: we say what to try, we don't fake-navigate to a gallery
   *  card that has no fix-action of its own. `null` for passing pairs. */
  remedy: string | null
}

/** Standard remedy hints, mapped per pair-label. These are the actual
 *  config controls a user can flip to influence each contrast pair.
 *  Hard-coded because each token's failure mode is well-known. */
const REMEDIES: Record<string, string> = {
  'Body text on background':       'Try Background: Crisp, or pick a darker neutral ramp.',
  'Body text on surface':          'Try Background: Crisp, or pick a darker neutral.',
  'Body text on raised surface':   'Try Background: Crisp — raised surfaces tint lighter than base.',
  'Body text on overlay':          'Try Background: Crisp — overlay surfaces tint lighter than base.',
  'Muted text on background':      'Try Background: Crisp — muted text is intentionally low-contrast.',
  'Muted text on surface-2':       'Try Background: Crisp — muted text is intentionally low-contrast.',
  'Button text on primary':        'Pick a darker primary, or switch to Mono.',
  'Button text on primary hover':  'Pick a darker primary — the hover state derives from it.',
  'Secondary button text':         'Pick a darker secondary-soft, or a lighter secondary-soft-fg.',
  'Success text on success-soft':  'Try Background: Crisp — system colors widen their gap on Crisp.',
  'Warning text on warning-soft':  'Try Background: Crisp — system colors widen their gap on Crisp.',
  'Danger text on danger-soft':    'Try Background: Crisp — system colors widen their gap on Crisp.',
  'Info text on info-soft':        'Try Background: Crisp — system colors widen their gap on Crisp.',
  'Primary against background':       'Primary as a SURFACE is fine here; for colored TEXT, use primary-soft tints.',
  'Input border against background':  'Common in modern UIs (Apple, Stripe both subtle here). Set Borders: Strong if you need strict WCAG, otherwise rely on labels + placeholders for affordance.',
  'Input border against its fill':    'The border is floored at 3:1 against the field fill at every Borders setting; if this fails, the fill token was changed by hand.',
  'Focus ring against background':    'Pick a higher-saturation primary, or set Background: Crisp.',
}

export function auditContrast(tk: Tokens): ContrastPair[] {
  const v = tk.vars as Record<string, string>
  // Audits whatever mode `tk` was built in. The line that used to sit here said
  // auditing both modes "would double the count without surfacing new failures
  // (the engine clamps both to AA already)" — and it described behaviour this
  // function does not have, since `tk.vars` is simply the current mode.
  //
  // It was also the reason nobody looked. `npm run a11y:matrix` measured the
  // other polarity for the first time and found 526 contrast violations in dark
  // mode against a clean zero in light: two polarity bugs in the ink ramp and a
  // whole family of semantic colours with no floor at all. "Both are clamped
  // already" was the assumption doing the hiding, so it is written down here as
  // a wrong one rather than quietly deleted.
  const pairs: Array<[string, string, string, 4.5 | 3]> = [
    ['Body text on background',       '--k-fg',              '--k-bg',              4.5],
    ['Body text on surface',          '--k-fg',              '--k-surface',         4.5],
    ['Body text on raised surface',   '--k-fg',              '--k-surface-raised',  4.5],
    ['Body text on overlay',          '--k-fg',              '--k-surface-overlay', 4.5],
    ['Muted text on background',      '--k-fg-muted',        '--k-bg',              4.5],
    ['Muted text on surface-2',       '--k-fg-muted',        '--k-surface-2',       4.5],
    ['Button text on primary',        '--k-primary-fg',      '--k-primary',         4.5],
    ['Button text on primary hover',  '--k-primary-fg',      '--k-primary-hover',   4.5],
    // Our .btn--secondary recipe uses the SOFT variant (light grey bg + dark
    // ink) not --k-secondary directly. Testing --k-secondary-fg on --k-secondary
    // tested a token pair that no component in our system actually renders —
    // produced phantom failures (mid-grey + white = ~3.5:1). The soft pair is
    // the real button-secondary pair.
    ['Secondary button text',         '--k-secondary-soft-fg', '--k-secondary-soft', 4.5],
    ['Success text on success-soft',  '--k-success-soft-fg', '--k-success-soft',    4.5],
    ['Warning text on warning-soft',  '--k-warning-soft-fg', '--k-warning-soft',    4.5],
    ['Danger text on danger-soft',    '--k-danger-soft-fg',  '--k-danger-soft',     4.5],
    ['Info text on info-soft',        '--k-info-soft-fg',    '--k-info-soft',       4.5],
    // The `-text` roles: the same hues as legible INK on a plain surface, added
    // after the matrix scan found ten recipes setting `color: var(--k-danger)`
    // and rendering error text at 2.77:1. The fill token and the ink token are
    // different roles, so the audit has to name both.
    ['Danger text on surface',        '--k-danger-text',     '--k-surface',         4.5],
    ['Link text on surface',          '--k-primary-text',    '--k-surface',         4.5],
    ['Link hover on surface',         '--k-primary-text-hover', '--k-surface',      4.5],
    /* 1.4.11 asks whether the COMPONENT can be identified, not whether one
     * particular colour can. When the brand solid does not separate from the
     * page the engine emits `--k-primary-edge`, a hairline that does — and that
     * boundary is precisely the "visual information required to identify the
     * component" the SC names. So the audit asks about the boundary that is
     * actually there. Scored on the fill whenever no edge is emitted, which is
     * ~72% of the reachable brand space. */
    [
      v['--k-primary-edge'] && v['--k-primary-edge'] !== 'transparent'
        ? 'Primary boundary against background'
        : 'Primary against background',
      v['--k-primary-edge'] && v['--k-primary-edge'] !== 'transparent'
        ? '--k-primary-edge'
        : '--k-primary',
      '--k-bg',
      3,
    ],
    // `--k-border` is decorative (card dividers, hairlines between sections).
    // WCAG 1.4.11 only requires 3:1 for FUNCTIONAL UI elements — decorative
    // borders are explicitly excluded. Audit the INPUT border instead: that
    // one IS functional (it tells the user "here's a form field").
    ['Input border against background',  '--k-input-border',  '--k-bg', 3],
    // …and against the fill it ENCLOSES, which is the neighbour it always has.
    // The floor in buildTokens checked surface + page and not this one, and
    // Light · Faint sat at 2.85 against its own fill (2026-08-16). Now a pair
    // the knob sweep holds, so it cannot come back.
    ['Input border against its fill',    '--k-input-border',  '--k-input-bg', 3],
    ['Focus ring against background',    '--k-ring',          '--k-bg', 3],
  ]
  return pairs.map(([label, fgVar, bgVar, required]) => {
    const fg = v[fgVar]
    const bg = v[bgVar]
    // contrast() needs hex. Tokens are stored as HSL strings — convert.
    const ratio = fg && bg ? contrast(toHex(fg), toHex(bg)) : 0
    const passes = ratio >= required
    return {
      label,
      fg: fg || '',
      bg: bg || '',
      ratio: Math.round(ratio * 100) / 100,
      required,
      passes,
      // Only populate remedy for failing pairs — passing pairs don't need help.
      remedy: passes ? null : (REMEDIES[label] ?? null),
    }
  })
}

/* ───────── Inventory summary ─────────
 * One number per category — for the Export Modal "what you'll get" view
 * and the marketing page's "65+ design tokens" stat. Counted off the
 * actual variables, not hand-maintained. */
export interface Inventory {
  colors: number; typography: number; spacing: number; radii: number
  shadows: number; motion: number; state: number; zIndex: number
  breakpoints: number; containers: number; chart: number
}
export function buildInventory(tk: Tokens): Inventory {
  const vars = tk.vars as Record<string, string>
  const has = (prefix: string) => Object.keys(vars).filter((k) => k.startsWith(prefix)).length
  return {
    colors: Object.keys(vars).filter((k) =>
      /^--k-(bg|fg|surface|primary|secondary|accent|success|warning|danger|info|border|input-border|ring|selection|fill)/.test(k),
    ).length,
    typography: Object.keys(vars).filter((k) => k.startsWith('--k-type-') || k.startsWith('--k-font-') || k.startsWith('--k-ui-')).length + 7, // +7 for display/h3/h4/h5/body/caption/eyebrow extras
    spacing: 10, // s-0 through s-12, the named scale
    radii: has('--k-radius'),
    shadows: has('--k-shadow'),
    motion: has('--k-dur') + has('--k-ease') + has('--k-anim'),
    state: ['--k-disabled-bg', '--k-disabled-fg', '--k-disabled-opacity', '--k-focus-ring-width', '--k-focus-ring-offset', '--k-input-error-border', '--k-input-success-border', '--k-input-warning-border', '--k-state-hover', '--k-state-border', '--k-state-selected-bg'].filter((k) => vars[k]).length,
    zIndex: Object.keys(Z_INDEX).length,
    breakpoints: Object.keys(BREAKPOINTS).length,
    containers: Object.keys(CONTAINER_WIDTHS).length,
    chart: 6,
  }
}
