/**
 * Harmony presets (H1) — the named modes of the two continuous harmony dials.
 *
 * The dials (see types.ts → Harmony):
 *   spread     0–180°  hue rotation of the DERIVED family (secondary · accent ·
 *                      decoratives). The brand primary NEVER rotates — our
 *                      deliberate deviation from M3 Expressive (which rotates
 *                      the seed itself by +240°): a user's brand color is
 *                      sacred; harmony governs the relatives only.
 *   expression 0–150%  chroma multiplier on the derived family INCLUDING the
 *                      neutral surface tint (→ chromatic surfaces at the high
 *                      end, the M3-2025 direction). CP-guardrail caps it at 150%
 *                      (boldest preset = 140%); beyond ~150 it goes neon/garish.
 *                      Enforced in BOTH the slider AND resolveHarmony (so a
 *                      hand-edited URL hash can't escape the band).
 *
 * The presets are pre-enumerated harmony space (M3 ships 9 scheme variants as
 * constants; we ship 4 presets + the live dials underneath):
 *   mono       — single-hue family, slightly muted: the restrained Linear look.
 *   tonal      — the M3-TonalSpot recipe (tertiary = seed + 60°). THE DEFAULT.
 *   complement — accent at the full complement (180°): editorial, two-tone.
 *   expressive — wide rotation + boosted chroma incl. tinted surfaces.
 * 'custom' is not in this table: it means "the dials were moved by hand" and
 * keeps whatever values cfg.spread/cfg.expression carry.
 */
import type { Config, Harmony } from './types'

export const HARMONY_PRESETS: Record<Exclude<Harmony, 'custom'>, { spread: number; expression: number }> = {
  mono:       { spread: 0,   expression: 85 },
  tonal:      { spread: 60,  expression: 100 },
  complement: { spread: 180, expression: 100 },
  expressive: { spread: 120, expression: 140 },
}

/** Panel/⌘K helper: the patch a preset pick applies. */
export function applyHarmonyPreset(id: Exclude<Harmony, 'custom'>): Partial<Config> {
  return { harmony: id, ...HARMONY_PRESETS[id] }
}

/** Resolve the dials with stale-hash guards (old shared URLs / saved kits may
 *  lack the fields entirely — degrade to the Tonal default, never NaN). */
export function resolveHarmony(cfg: Pick<Config, 'spread' | 'expression'>): { spreadDeg: number; exprMul: number } {
  const spread = Number.isFinite(cfg.spread) ? cfg.spread : HARMONY_PRESETS.tonal.spread
  const expression = Number.isFinite(cfg.expression) ? cfg.expression : HARMONY_PRESETS.tonal.expression
  return {
    spreadDeg: Math.max(0, Math.min(180, spread)),
    // CP-guardrail: cap chroma at 1.5×. The boldest preset (expressive) is 1.4×;
    // beyond ~1.5 the derived family + tinted surfaces go neon/garish. Clamped
    // HERE (not just the slider) so a hand-edited URL hash can't escape the band.
    exprMul: Math.max(0, Math.min(1.5, expression / 100)),
  }
}
