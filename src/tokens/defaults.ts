import type { Config } from './types'

// The ONE curated default — our opinionated "house style" (no Style presets;
// every facet is an individual control). Tune these for the best out-of-box look.
// C1: new visitors land on a CHROMATIC kit (Cobalt), never greyscale — the first
// impression must read "designed", not "blank template". Mono is still one click
// away in the Brand flyout as the neutral reset/baseline.
import { DEFAULT_DIALS } from '../sandbox/dials'

export const DEFAULT_CONFIG: Config = {
  sb: DEFAULT_DIALS,
  colorTheme: 'cobalt',        // friendly Apple system blue (#0A84FF) — the always-works brand
  color: 'tone',               // chromatic mode (brand hue drives primary/links/focus + auto-tints neutrals)
  radius: 'soft',
  // AA, because AA is what the law actually requires — see the Conformance type.
  // 'aaa' raises the target-size floor to 44 for the teams whose own baseline
  // demands it (public services, NLDS), without inflating everyone else's kit.
  conformance: 'aa',
  scale: 'default',            // size + presence macro (drives ui-weight too)
  typeScale: 'md',
  labelCase: 'sentence',       // UI labels as-authored; 'caps' = the industrial/terminal look
  fontDisplay: 'Inter',
  fontBody: 'Inter',
  /* LUCIDE, and no longer a panel knob (2026-08-15).
     Five icon libraries was five ways to feel different, and one of them was
     literally called "hairline" — the same shape of offer as the two typefaces
     the glyph measurement removed, except we had never measured icons at all.
     An icon set is not a setting a buyer can defend; it is a property of the
     primitive, with a documented way to swap it (the adapter in kit/icons).
     'line' IS Lucide: ISC-licensed, a 24px/2px grid, and what the ecosystem
     already reaches for. */
  iconSet: 'line',
  // 'soft' = the shadcn/Stripe subtle two-layer shadow on a balanced ramp — the
  // former default combo, unchanged. (Elevation is now shadow-only; 'raised' was
  // a dead duplicate of 'soft' and is retired, old hashes fall back to it.)
  surfaceDepth: 'soft',
  surface: 'outlined',         // box-with-border fields + flush hairline-seam sidebar (= the previous default look)
  borders: 'subtle',
  // Interaction (H2): the state wash is a fixed house formula — whisper alpha
  // (0.05) on a NEUTRAL source that follows the Neutrals ramp, 0.96 press squish.
  // The States/State-tint AND Springs(motionScheme) dials were removed (knob-cull):
  // the spring physics are fixed to the composed 'standard' sampling in buildTokens.
  cPrimary: '#0A84FF',      // Cobalt — matches COLOR_THEMES.cobalt (keep in sync)
  // Harmony (H1): Tonal is the house default — the M3-TonalSpot recipe (accent
  // = brand + 60°, secondary drifts +15°, neutrals carry the brand tint at 1×).
  // Primary itself never rotates. Values mirror HARMONY_PRESETS.tonal.
  harmony: 'tonal',
  spread: 60,
  expression: 100,
  neutral: 'auto',          // greys auto-tint toward the brand hue (Linear/Vercel)
  canvas: 'neutral',        // muted near-white page bg (= the prior --k-bg = nStep(1))
  fill: 'brand',            // subtle brand wash on the summary band (KPI strip etc.)
  mode: 'light',
}

export const CONFIG_VERSION = 1
