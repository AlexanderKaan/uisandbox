import { buildTokens } from '../tokens/buildTokens'
import { nameColor } from '../tokens/color'
import type { Config } from '../tokens/types'
import { ICON_LIBS } from './iconLibs'
import {
  Z_INDEX,
  BREAKPOINTS,
  CONTAINER_WIDTHS,
  buildPalette,
  buildTypeScale,
  buildSpacingScale,
  auditContrast,
} from '../tokens/extras'

export function genJson(cfg: Config): string {
  const tk = buildTokens(cfg)
  const dk = buildTokens({ ...cfg, mode: 'dark' }).vars
  const V = tk.vars
  const col = (k: string) => ({ value: V[k] })

  const sysTokens = Object.fromEntries(
    tk.sysList.map((s) => [
      s.k,
      {
        value: V['--k-' + s.k],
        foreground: V['--k-' + s.k + '-fg'],
        soft: V['--k-' + s.k + '-soft'],
        'soft-foreground': V['--k-' + s.k + '-soft-fg'],
      },
    ]),
  )

  const out = {
    $schema: 'https://design-tokens.org/v1',
    name: 'cockpit-ui-kit',
    meta: { generator: 'Cockpit' },
    decisions: cfg,
    tokens: {
      color: {
        background: col('--k-bg'),
        foreground: col('--k-fg'),
        'foreground-muted': col('--k-fg-muted'),
        'foreground-faint': col('--k-fg-faint'),
        surface: col('--k-surface'),
        'surface-sunken': col('--k-surface-sunken'),
        'surface-2': col('--k-surface-2'),
        'surface-raised': col('--k-surface-raised'),
        'surface-overlay': col('--k-surface-overlay'),
        primary: { value: V['--k-primary'], name: nameColor(tk.primaryHex) },
        'primary-hover': col('--k-primary-hover'),
        'primary-foreground': col('--k-primary-fg'),
        'primary-soft': col('--k-primary-soft'),
        secondary: { value: V['--k-secondary'], name: nameColor(tk.secHex) },
        'secondary-foreground': col('--k-secondary-fg'),
        'secondary-soft': col('--k-secondary-soft'),
        accent: { value: V['--k-accent'], name: nameColor(tk.accentHex) },
        'accent-foreground': col('--k-accent-fg'),
        fill: { value: V['--k-fill'] },
        border: col('--k-border'),
        'input-border': col('--k-input-border'),
        ring: col('--k-ring'),
        'ring-soft': col('--k-ring-soft'),
        'secondary-soft-foreground': col('--k-secondary-soft-fg'),
        selection: col('--k-selection'),
      },
      system: sysTokens,
      state: {
        // Disabled fills + focus ring config. Pair with :disabled / :focus-visible.
        'disabled-bg': col('--k-disabled-bg'),
        'disabled-foreground': col('--k-disabled-fg'),
        'disabled-opacity': col('--k-disabled-opacity'),
        'focus-ring-width': col('--k-focus-ring-width'),
        'focus-ring-offset': col('--k-focus-ring-offset'),
        // Form validation border colors — derive from system colors so they
        // adapt with the user's mode/contrast choice.
        'input-error-border': col('--k-input-error-border'),
        'input-success-border': col('--k-input-success-border'),
        'input-warning-border': col('--k-input-warning-border'),
      },
      radius: {
        md: col('--k-radius-md'),
        lg: col('--k-radius-lg'),
        pill: col('--k-radius-pill'),
        button: col('--k-radius-button'),
      },
      shadow: { sm: col('--k-shadow-sm'), md: col('--k-shadow-md'), lg: col('--k-shadow-lg') },
      spacing: { base: col('--k-space') },
      border: { width: col('--k-bw') },
      typography: {
        'font-display': col('--k-font-display'),
        'font-body': col('--k-font-body'),
        'font-mono': col('--k-font-mono'),
        'size-h1': col('--k-type-h1'),
        'size-h2': col('--k-type-h2'),
        'size-h3': col('--k-type-h3'),
        'size-body': col('--k-type-body'),
        'size-small': col('--k-type-small'),
        'size-eyebrow': col('--k-type-eyebrow'),
        'ui-weight': col('--k-ui-weight'),
      },
      motion: {
        // Three-tier duration scale. Use fast for hover/toggle/tooltip,
        // normal for popover/menu/tabs, slow for dialog/sheet/page.
        'duration-fast': col('--k-dur-fast'),
        duration: col('--k-dur'),
        'duration-slow': col('--k-dur-slow'),
        // Direction-aware easings (Material 3 emphasized set).
        easing: col('--k-ease'),
        'easing-out': col('--k-ease-out'),
        'easing-in': col('--k-ease-in'),
        // Named animation shorthands — drop-in CSS animation values.
        animations: {
          'fade-in': col('--k-anim-fade-in'),
          'fade-out': col('--k-anim-fade-out'),
          'slide-up': col('--k-anim-slide-up'),
          'slide-down': col('--k-anim-slide-down'),
          'scale-in': col('--k-anim-scale-in'),
          'scale-out': col('--k-anim-scale-out'),
          spin: col('--k-anim-spin'),
        },
        'state-hover': col('--k-state-hover'),
      },
      icon: {
        style: { value: cfg.iconSet },
        library: { value: ICON_LIBS[cfg.iconSet].label },
        package: { value: ICON_LIBS[cfg.iconSet].pkg },
        install: { value: ICON_LIBS[cfg.iconSet].install },
        'stroke-width': {
          value: ICON_LIBS[cfg.iconSet].fill ? 'filled' : ICON_LIBS[cfg.iconSet].sw,
        },
      },
      // ───── Auto-derived categories (not user-configurable, but exported
      // so designers/AI tools have the full picture). ─────
      'z-index': Object.fromEntries(
        Object.entries(Z_INDEX).map(([k, v]) => [k, { value: v }]),
      ),
      breakpoint: Object.fromEntries(
        Object.entries(BREAKPOINTS).map(([k, v]) => [k, { value: v }]),
      ),
      container: Object.fromEntries(
        Object.entries(CONTAINER_WIDTHS).map(([k, v]) => [k, { value: v }]),
      ),
      palette: Object.fromEntries(
        Object.entries(buildPalette(cfg)).map(([k, v]) => [k, { value: v }]),
      ),
      'type-scale-extended': Object.fromEntries(
        Object.entries(buildTypeScale(cfg)).map(([k, v]) => [k, { value: v }]),
      ),
      'spacing-scale': Object.fromEntries(
        Object.entries(buildSpacingScale(cfg)).map(([k, v]) => [k, { value: v }]),
      ),
    },
    // Full WCAG contrast audit — every meaningful text-on-background pair,
    // not just the single button-on-primary check.
    accessibility: {
      pairs: auditContrast(tk).map((p) => ({
        label: p.label,
        ratio: p.ratio,
        required: p.required,
        passes: p.passes,
      })),
    },
    dark: Object.fromEntries(
      Object.keys(dk).filter((k) => dk[k] !== V[k]).map((k) => [k, dk[k]]),
    ),
  }

  return JSON.stringify(out, null, 2)
}
