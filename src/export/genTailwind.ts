import { buildTokens } from '../tokens/buildTokens'
import { customFontFaceBlock, googleFontsImport, isCustomFont } from '../tokens/fonts'
import type { Config } from '../tokens/types'
import { ICON_LIBS } from './iconLibs'
import {
  Z_INDEX,
  BREAKPOINTS,
  CONTAINER_WIDTHS,
  buildPalette,
  buildTypeScale,
  buildSpacingScale,
} from '../tokens/extras'

/**
 * Standalone Tailwind v4 globals.css.
 *
 * Drop into your project as e.g. `src/app/globals.css` (Next.js) or
 * `src/styles/globals.css` (Vite). It imports Tailwind v4 itself and
 * registers the Cockpit theme via @theme — utilities like
 * bg-primary / text-muted / shadow-md become available system-wide.
 */
export function genTailwind(cfg: Config): string {
  const L = buildTokens({ ...cfg, mode: 'light' })
  const D = buildTokens({ ...cfg, mode: 'dark' }).vars
  const v = L.vars

  const colorMap: Array<[string, string]> = [
    ['background', '--k-bg'],
    ['foreground', '--k-fg'],
    ['muted', '--k-fg-muted'],
    ['faint', '--k-fg-faint'],
    ['surface', '--k-surface'],
    ['surface-sunken', '--k-surface-sunken'],
    ['surface-2', '--k-surface-2'],
    ['surface-raised', '--k-surface-raised'],
    ['surface-overlay', '--k-surface-overlay'],
    ['primary', '--k-primary'],
    ['primary-hover', '--k-primary-hover'],
    ['primary-foreground', '--k-primary-fg'],
    ['primary-soft', '--k-primary-soft'],
    ['secondary', '--k-secondary'],
    ['secondary-foreground', '--k-secondary-fg'],
    ['secondary-soft', '--k-secondary-soft'],
    ['accent', '--k-accent'],
    ['accent-foreground', '--k-accent-fg'],
    ['fill', '--k-fill'],
    ['border', '--k-border'],
    ['input-border', '--k-input-border'],
    ['ring', '--k-ring'],
    ['ring-soft', '--k-ring-soft'],
    ['secondary-soft-foreground', '--k-secondary-soft-fg'],
    ['selection', '--k-selection'],
    ['disabled-bg', '--k-disabled-bg'],
    ['disabled-foreground', '--k-disabled-fg'],
    ['input-error-border', '--k-input-error-border'],
    ['input-success-border', '--k-input-success-border'],
    ['input-warning-border', '--k-input-warning-border'],
  ]
  L.sysList.forEach((s) => {
    colorMap.push(
      [s.k, '--k-' + s.k],
      [s.k + '-foreground', '--k-' + s.k + '-fg'],
      [s.k + '-soft', '--k-' + s.k + '-soft'],
    )
  })

  const colors = colorMap.map(([n, k]) => `  --color-${n}: ${v[k]};`).join('\n')

  const rest = `  --radius-sm: calc(${v['--k-radius-md']} * 0.6);
  --radius-md: ${v['--k-radius-md']};
  --radius-lg: ${v['--k-radius-lg']};
  --radius-pill: ${v['--k-radius-pill']};
  --radius-button: ${v['--k-radius-button']};
  --shadow-sm: ${v['--k-shadow-sm']};
  --shadow-md: ${v['--k-shadow-md']};
  --shadow-lg: ${v['--k-shadow-lg']};
  --spacing-base: ${v['--k-space']};
  --font-display: ${v['--k-font-display']};
  --font-sans: ${v['--k-font-body']};
  --font-mono: ${v['--k-font-mono']};
  --text-h1: ${v['--k-type-h1']};
  --text-h2: ${v['--k-type-h2']};
  --text-h3: ${v['--k-type-h3']};
  --text-body: ${v['--k-type-body']};
  --text-small: ${v['--k-type-small']};
  --text-eyebrow: ${v['--k-type-eyebrow']};
  /* Motion — three-tier durations + direction-aware easings.
     Use duration-fast / duration / duration-slow for transition-duration utils,
     ease-out for enter animations, ease-in for exit. */
  --default-transition-duration: ${v['--k-dur']};
  --default-transition-timing-function: ${v['--k-ease']};
  --duration-fast: ${v['--k-dur-fast']};
  --duration: ${v['--k-dur']};
  --duration-slow: ${v['--k-dur-slow']};
  --ease: ${v['--k-ease']};
  --ease-out: ${v['--k-ease-out']};
  --ease-in: ${v['--k-ease-in']};
  /* Named animation shorthands — use with: animate-[var(--animate-fade-in)] */
  --animate-fade-in: ${v['--k-anim-fade-in']};
  --animate-fade-out: ${v['--k-anim-fade-out']};
  --animate-slide-up: ${v['--k-anim-slide-up']};
  --animate-slide-down: ${v['--k-anim-slide-down']};
  --animate-scale-in: ${v['--k-anim-scale-in']};
  --animate-scale-out: ${v['--k-anim-scale-out']};
  --animate-spin-default: ${v['--k-anim-spin']};
  /* Menu "roll-down" signature — panel + staggered items (see tokens.css keyframes) */
  --animate-menu: ${v['--k-anim-menu']};
  --animate-menu-item: ${v['--k-anim-menu-item']};
  --menu-stagger: ${v['--k-menu-stagger']};
  /* UI text — applies to buttons, badges, tabs, nav rows, form labels.
     Sentence case at the 14px body floor; uppercase only via the eyebrow role. */
  --ui-font-weight: ${v['--k-ui-weight']};
  /* State + focus ring + disabled opacity */
  --opacity-disabled: ${v['--k-disabled-opacity']};
  --width-focus-ring: ${v['--k-focus-ring-width']};
  --offset-focus-ring: ${v['--k-focus-ring-offset']};
  /* Z-index stack (Tailwind utilities: z-dropdown, z-modal, etc.) */
${Object.entries(Z_INDEX).map(([k, val]) => `  --z-${k}: ${val};`).join('\n')}
  /* Breakpoints (mobile-first, Tailwind defaults) */
${Object.entries(BREAKPOINTS).map(([k, val]) => `  --breakpoint-${k}: ${val};`).join('\n')}
  /* Container widths */
${Object.entries(CONTAINER_WIDTHS).map(([k, val]) => `  --container-${k}: ${val};`).join('\n')}
  /* Decorative + chart palette — accent-1..6 (avatars/tiles/labels) and
     chart-1..6 (same colours). Gradient pairs ship in tokens.css as
     --k-grad-1..6. */
${Object.entries(buildPalette(cfg))
  .filter(([k]) => !k.startsWith('grad-') && !k.endsWith('-ink'))
  .map(([k, val]) => `  --color-${k}: ${val};`)
  .join('\n')}
  /* Extended type scale — h3/h4/h5/caption/eyebrow + display */
${Object.entries(buildTypeScale(cfg)).map(([k, val]) => `  --text-${k}: ${val};`).join('\n')}
  /* Spacing scale — s-0 through s-12 (multiples of --k-space) */
${Object.entries(buildSpacingScale(cfg)).map(([k, val]) => `  --spacing-${k.replace('s-', '')}: ${val};`).join('\n')}`

  const darkColors = colorMap
    .filter(([, k]) => D[k] !== v[k])
    .map(([n, k]) => `  --color-${n}: ${D[k]};`)
    .join('\n')

  const lib = ICON_LIBS[cfg.iconSet]
  return `/* globals.css — UIcockpit design system, Tailwind v4
 *
 * Standalone: imports Tailwind v4 and registers the Cockpit theme.
 * Place in src/app/globals.css (Next) or src/styles/globals.css (Vite),
 * then import once from your root layout.
 *
 * Dark mode: add the class .dark to a parent element. Tailwind v4 reads
 * the @theme block at build time, so every utility (bg-primary, text-muted,
 * shadow-md, font-display, …) resolves to the current values.
 *
 * Icons (this kit uses ${lib.label}):
 *   ${lib.install}
 */

@import "tailwindcss";

${googleFontsImport(cfg.fontDisplay, cfg.fontBody)}
${[cfg.fontDisplay, cfg.fontBody]
  .filter((f, i, a) => isCustomFont(f) && a.indexOf(f) === i)
  .map(customFontFaceBlock)
  .join('\n\n')}

@custom-variant dark (&:is(.dark *));

@theme {
${colors}
${rest}
}

/* Dark mode — apply class="dark" to <html> or any parent element */
.dark {
${darkColors}
}
`
}
