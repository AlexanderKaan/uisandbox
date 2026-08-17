import { buildTokens } from '../tokens/buildTokens'
import { customFontFaceBlock, googleFontsImport, isCustomFont } from '../tokens/fonts'
import type { Config } from '../tokens/types'
import {
  Z_INDEX,
  BREAKPOINTS,
  CONTAINER_WIDTHS,
  WINDOW_CLASSES,
  PANE_CONSTANTS,
  buildTypeScale,
} from '../tokens/extras'

/**
 * Standalone tokens.css. Drop into any project, link in <head> before
 * your own stylesheet (so component CSS resolves the vars), and the
 * fonts load via Google Fonts @import. Switch to dark mode by toggling
 * the `.dark` class on a parent.
 */
export function genCss(cfg: Config): string {
  const light = buildTokens({ ...cfg, mode: 'light' }).vars
  const dark = buildTokens({ ...cfg, mode: 'dark' }).vars
  const block = (v: Record<string, string | number>) =>
    Object.entries(v)
      .map(([k, val]) => `  ${k}: ${val};`)
      .join('\n')

  // Auto-derived token categories — not user-configurable but essential for
  // a complete design system. See src/tokens/extras.ts for the rationale.
  const typeScale = buildTypeScale(cfg)
  // NB: the spacing grid (--k-s-0 … --k-s-32) is already emitted in the :root
  // block via buildTokens().vars, so it is NOT repeated here (would duplicate).
  const extrasBlock = [
    '\n  /* --- Z-index stack --- */',
    ...Object.entries(Z_INDEX).map(([k, v]) => `  --k-z-${k}: ${v};`),
    '\n  /* --- Breakpoints --- */',
    ...Object.entries(BREAKPOINTS).map(([k, v]) => `  --k-bp-${k}: ${v};`),
    '\n  /* --- Container widths --- */',
    ...Object.entries(CONTAINER_WIDTHS).map(([k, v]) => `  --k-container-${k}: ${v};`),
    '\n  /* --- Window classes (shell thresholds) + pane constants --- */',
    ...Object.entries(WINDOW_CLASSES).map(([k, v]) => `  --k-win-${k}: ${v};`),
    ...Object.entries(PANE_CONSTANTS).map(([k, v]) => `  --k-pane-${k}: ${v};`),
    '\n  /* --- Extended type scale: h4/h5 in-between steps (the rest ship in :root above) --- */',
    ...Object.entries(typeScale).map(([k, v]) => `  --k-type-${k}: ${v};`),
  ].join('\n')

  // Material-3 compatibility aliases (H1) — a 1:1 bridge for codebases (and
  // agents) written against the M3 sys-color vocabulary. Values are var()
  // references, so they re-resolve under `.dark` automatically — one block,
  // both modes, zero duplicated bytes. Material refugees plug a kit in 1:1.
  const m3Aliases: Array<[string, string]> = [
    ['primary', '--k-primary'],
    ['on-primary', '--k-primary-fg'],
    ['primary-container', '--k-primary-soft'],
    ['on-primary-container', '--k-primary-soft-fg'],
    ['secondary', '--k-secondary'],
    ['on-secondary', '--k-secondary-fg'],
    ['secondary-container', '--k-secondary-soft'],
    ['on-secondary-container', '--k-secondary-soft-fg'],
    ['tertiary', '--k-accent'],
    ['on-tertiary', '--k-accent-fg'],
    ['tertiary-container', '--k-accent-soft'],
    ['on-tertiary-container', '--k-accent-soft-fg'],
    ['error', '--k-danger'],
    ['on-error', '--k-danger-fg'],
    ['error-container', '--k-danger-soft'],
    ['on-error-container', '--k-danger-soft-fg'],
    ['surface', '--k-bg'],
    ['on-surface', '--k-fg'],
    ['on-surface-variant', '--k-fg-muted'],
    ['surface-dim', '--k-surface-sunken'],
    ['surface-bright', '--k-surface-raised'],
    ['surface-container-lowest', '--k-surface-container-lowest'],
    ['surface-container-low', '--k-surface-container-low'],
    ['surface-container', '--k-surface-container'],
    ['surface-container-high', '--k-surface-container-high'],
    ['surface-container-highest', '--k-surface-container-highest'],
    ['outline', '--k-input-border'],
    ['outline-variant', '--k-border'],
    ['inverse-surface', '--k-inverse-surface'],
    ['inverse-on-surface', '--k-inverse-fg'],
    ['inverse-primary', '--k-inverse-primary'],
    ['scrim', '--k-scrim'],
  ]
  const m3Block = m3Aliases.map(([m3, k]) => `  --md-sys-color-${m3}: var(${k});`).join('\n')

  return `/* tokens.css — UISandbox tokens
 *
 * Drop-in usage:
 *   <link rel="stylesheet" href="tokens.css">  (or @import in your CSS)
 *
 * Dark mode:
 *   <html class="dark"> or any ancestor element — the .dark block
 *   re-resolves every --k-* token.
 *
 * Fonts are pulled from Google Fonts. To self-host, remove the @import
 * and add your own @font-face declarations.
 */

${googleFontsImport(cfg.fontDisplay, cfg.fontBody)}
${[cfg.fontDisplay, cfg.fontBody]
  .filter((f, i, a) => isCustomFont(f) && a.indexOf(f) === i)
  .map(customFontFaceBlock)
  .join('\n\n')}

:root {
${block(light)}
${extrasBlock}
}

.dark {
${block(dark)}
}

/* --- Material 3 compatibility aliases (optional bridge) ---
 * For codebases/agents written against the M3 sys-color vocabulary:
 * every --md-sys-color-* resolves to its --k-* counterpart. The
 * aliases are var() references, so they follow light/dark automatically.
 * Safe to delete if you don't need them. */
:root {
${m3Block}
}
`
}
