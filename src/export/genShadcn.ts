import { buildTokens } from '../tokens/buildTokens'
import { customFontFaceBlock, googleFontsImport, isCustomFont } from '../tokens/fonts'
import type { Config } from '../tokens/types'
import { ICON_LIBS } from './iconLibs'

/**
 * Standalone shadcn/ui globals.css — drop-in replacement for the file
 * `npx shadcn@latest init` generates. Contains everything shadcn needs:
 *
 *   1. @import "tailwindcss"          (Tailwind v4 itself)
 *   2. @plugin "tailwindcss-animate"  (shadcn uses this for animations)
 *   3. @custom-variant dark            (shadcn's dark-mode selector)
 *   4. @theme inline { … }             (maps --background → bg-background utility)
 *   5. :root + .dark blocks            (actual values — Cockpit-mapped)
 *   6. @layer base { … }               (border-border + bg-background reset)
 *
 * Mapping notes (lossy on purpose):
 *   shadcn secondary  → Cockpit secondary-soft (shadcn's secondary is a
 *                       muted button surface, not a saturated brand color).
 *   shadcn muted      → Cockpit surface-2 (the quiet panel background).
 *   shadcn destructive→ Cockpit danger (system color, fixed hue).
 *   shadcn radius     → Cockpit radius-md (shadcn expects one number;
 *                       components multiply for larger surfaces).
 */

export interface ShadcnMapping {
  shadcn: string
  cockpit: string
}

/** shadcn semantic var ← UIcockpit `--k-*` token. The single source of truth for
 *  BOTH the standalone globals.css (genShadcn) and the registry-theme JSON
 *  (genRegistry) — so the two shadcn surfaces can never drift. */
export const MAP: ShadcnMapping[] = [
  { shadcn: 'background', cockpit: '--k-bg' },
  { shadcn: 'foreground', cockpit: '--k-fg' },
  { shadcn: 'card', cockpit: '--k-surface' },
  { shadcn: 'card-foreground', cockpit: '--k-fg' },
  { shadcn: 'popover', cockpit: '--k-surface-overlay' },
  { shadcn: 'popover-foreground', cockpit: '--k-fg' },
  { shadcn: 'primary', cockpit: '--k-primary' },
  { shadcn: 'primary-foreground', cockpit: '--k-primary-fg' },
  { shadcn: 'secondary', cockpit: '--k-secondary-soft' },
  { shadcn: 'secondary-foreground', cockpit: '--k-secondary-soft-fg' },
  { shadcn: 'muted', cockpit: '--k-surface-2' },
  { shadcn: 'muted-foreground', cockpit: '--k-fg-muted' },
  { shadcn: 'accent', cockpit: '--k-accent' },
  { shadcn: 'accent-foreground', cockpit: '--k-accent-fg' },
  { shadcn: 'destructive', cockpit: '--k-danger' },
  { shadcn: 'destructive-foreground', cockpit: '--k-danger-fg' },
  { shadcn: 'border', cockpit: '--k-border' },
  { shadcn: 'input', cockpit: '--k-input-border' },
  { shadcn: 'ring', cockpit: '--k-ring' },
  // Chart colors — shadcn expects 5. Mapped to the derived chart palette
  // (chart-1..5), generated from the brand hue per the Chart palette strategy.
  { shadcn: 'chart-1', cockpit: '--k-chart-1' },
  { shadcn: 'chart-2', cockpit: '--k-chart-2' },
  { shadcn: 'chart-3', cockpit: '--k-chart-3' },
  { shadcn: 'chart-4', cockpit: '--k-chart-4' },
  { shadcn: 'chart-5', cockpit: '--k-chart-5' },
  // Sidebar tokens — shadcn's Sidebar component uses these. Mirror the
  // main palette but with a sunken background so the sidebar reads quieter.
  { shadcn: 'sidebar', cockpit: '--k-surface-sunken' },
  { shadcn: 'sidebar-foreground', cockpit: '--k-fg' },
  { shadcn: 'sidebar-primary', cockpit: '--k-primary' },
  { shadcn: 'sidebar-primary-foreground', cockpit: '--k-primary-fg' },
  { shadcn: 'sidebar-accent', cockpit: '--k-primary-soft' },
  { shadcn: 'sidebar-accent-foreground', cockpit: '--k-primary' },
  { shadcn: 'sidebar-border', cockpit: '--k-border' },
  { shadcn: 'sidebar-ring', cockpit: '--k-ring' },
]

function valuesBlock(vars: Record<string, string | number>): string {
  const lines = MAP
    .filter(({ cockpit }) => vars[cockpit] !== undefined)
    .map(({ shadcn, cockpit }) => `  --${shadcn}: ${vars[cockpit]};`)
  const radius = vars['--k-radius-md']
  if (radius) lines.push(`  --radius: ${radius};`)
  return lines.join('\n')
}

function themeInlineBlock(): string {
  // shadcn's @theme inline block — maps each --X variable to its
  // corresponding --color-X / --radius-X utility class so that
  // `bg-background`, `text-foreground`, `rounded-md` etc. work.
  const colors = MAP.map(({ shadcn }) => `  --color-${shadcn}: var(--${shadcn});`).join('\n')
  return `${colors}
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);`
}

export function genShadcn(cfg: Config): string {
  const light = buildTokens({ ...cfg, mode: 'light' }).vars
  const dark = buildTokens({ ...cfg, mode: 'dark' }).vars
  const lib = ICON_LIBS[cfg.iconSet]

  return `/* globals.css — UIcockpit theme for shadcn/ui (Tailwind v4)
 *
 * Standalone: replaces the globals.css that \`npx shadcn@latest init\`
 * generates. Drop into src/app/globals.css (Next.js) or your equivalent,
 * then \`npx shadcn@latest add button card …\` — every component will
 * theme itself from this file without further config.
 *
 * Dark mode: add class="dark" to <html> or a parent.
 *
 * Icons (this kit uses ${lib.label}):
 *   ${lib.install}${lib.pkg === 'lucide-react' ? '\n *   (shadcn defaults to lucide-react — no overrides needed)' : '\n *\n * shadcn defaults to lucide-react. Override icon imports in shadcn\n * components by search & replacing "lucide-react" → "' + lib.pkg + '".'}
 */

@import "tailwindcss";
@plugin "tailwindcss-animate";

${googleFontsImport(cfg.fontDisplay, cfg.fontBody)}
${[cfg.fontDisplay, cfg.fontBody]
  .filter((f, i, a) => isCustomFont(f) && a.indexOf(f) === i)
  .map(customFontFaceBlock)
  .join('\n\n')}

@custom-variant dark (&:is(.dark *));

@theme inline {
${themeInlineBlock()}
}

:root {
${valuesBlock(light)}
}

.dark {
${valuesBlock(dark)}
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: ${light['--k-font-body']};
  }
}
`
}
