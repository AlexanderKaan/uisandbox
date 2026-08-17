/**
 * Color theme table — the brand-hue presets. The former "Style" preset (a bundle
 * of form attrs) was removed: every form facet (radius, button shape, surface
 * depth, border, motion, scale) is now an individual control, and the curated
 * DEFAULT_CONFIG is the one house style. Color theme = a single brand hex
 * (secondary + accent are derived in buildTokens). 10 themes.
 *
 * applyColorTheme merges the hue onto the current Config; the user's subsequent
 * individual control changes overlay. buildTokens reads the flat resolved Config.
 */
import type { Config, ColorTheme } from './types'

/* === Color theme table ==================================================
 * Each theme is a triplet of brand hexes. Mono is special — it represents
 * "no chroma" and gets a divider in the picker UI to set it apart from
 * the chromatic 5.
 *
 * Hex anchors picked to align with familiar real-world brand territories:
 *   Cobalt → blue family (Apple-blue, Linear-blue, Microsoft-blue)
 *   Jade   → green family (Linear-green, GitHub-green)
 *   Ember  → warm orange/red (Vercel-orange, Stripe-orange)
 *   Coral  → pink/magenta (Stripe-pink, Snapgram-pink)
 *   Indigo → deep purple-blue (Stripe-gradient purple)
 *
 * NOT exact brand-cloning — these are mineral/natural-pigment family names
 * giving us our own IP-clean ownership of the slot. */
export const COLOR_THEMES: Record<ColorTheme, Pick<Config, 'cPrimary'>> = {
  /* Anchors are the MOST-LOVED, everyman version of each hue — tuned toward the
   * recognizable favourites (Apple system colours + the Tailwind-500 level) so
   * every theme reads instantly friendly, never "hard". buildTokens still clamps
   * each to WCAG-AA, so the hue + saturation carry the brand feel; lightness is
   * floored for on-white legibility (links/focus/icons). */

  /* Mono — greyscale. Matches DEFAULT_CONFIG's neutral charcoal so picking
   * Mono after a chromatic theme returns the user to a known baseline. */
  mono: { cPrimary: '#3b3b42' },
  /* Cobalt — the friendly Apple system blue (hue ~211, warmer than the old
   * indigo-leaning cobalt). The default "always-works" brand blue. */
  cobalt: { cPrimary: '#0A84FF' },
  /* Sky — fresh cyan-blue (Tailwind sky-500). A lighter, breezier alt to Cobalt. */
  sky: { cPrimary: '#0EA5E9' },
  /* Teal — fresh blue-green (Tailwind teal-500). */
  teal: { cPrimary: '#14B8A6' },
  /* Jade — fresh emerald (Tailwind emerald-500 / Vercel-Linear green). */
  jade: { cPrimary: '#10B981' },
  /* Ember — fresh, bright orange (Tailwind orange-500), not the old smoky
   * red-orange. The crowd-pleasing warm accent. */
  ember: { cPrimary: '#F97316' },
  /* Coral — fresh pink/magenta (Tailwind pink-500 / Stripe-pink). */
  coral: { cPrimary: '#EC4899' },
  /* Indigo — the beloved Tailwind/Stripe indigo-500. */
  indigo: { cPrimary: '#6366F1' },
  /* Violet — fresh AI-era purple (Tailwind violet-500). */
  violet: { cPrimary: '#8B5CF6' },
  /* Rose — fresh, clean red (Tailwind rose-500). */
  rose: { cPrimary: '#F43F5E' },
}

/* === Helpers =========================================================== */

/* Apply a Color theme to a Config. Sets the cfg.colorTheme metadata +
 * merges the 3 brand hex values. Auto-flips the legacy color mode field
 * (mono vs tone): picking Mono theme → color:'mono', picking any chromatic
 * theme → color:'tone'. Matches the existing brand-color auto-promote
 * behaviour from the SET action so user gets coherent state. */
export function applyColorTheme(cfg: Config, id: ColorTheme): Config {
  return {
    ...cfg,
    ...COLOR_THEMES[id],
    colorTheme: id,
    color: id === 'mono' ? 'mono' : 'tone',
  }
}
