import type { Config, Borders } from './types'

/**
 * Foundation coherence — surface separation guard (clash-pair #2,
 * FOUNDATION-COHERENCE.md). A block (card, panel, sheet) MUST stand out from the
 * page by at least one channel. The three channels, and when each one actually
 * CARRIES the separation:
 *   • shadow — Elevation lifts the block            (surfaceDepth !== 'flat')
 *   • border — a real outline draws the edge        (surface 'outlined', or border ≥ subtle)
 *   • fill   — a surface-fill delta sets it apart   (surface 'filled')
 * A `faint` hairline ALONE is too weak to be the sole separator, so it doesn't
 * count unless the surface is explicitly outlined. The single fully-invisible
 * combination is therefore exactly Elevation:flat + Surface:plain + Border:faint —
 * the narrow corner this guard watches.
 *
 * Computed ONCE here so the engine floor (buildTokens) and the panel lock (Panel)
 * agree by construction — same rule, two surfaces.
 */
export interface SeparationChannels {
  shadow: boolean
  border: boolean
  fill: boolean
  count: number
}

type SepCfg = Pick<Config, 'surfaceDepth' | 'surface' | 'borders'>

export function separationChannels(cfg: SepCfg): SeparationChannels {
  const shadow = cfg.surfaceDepth !== 'flat'
  const border = cfg.surface === 'outlined' || cfg.borders !== 'faint'
  const fill = cfg.surface === 'filled'
  return { shadow, border, fill, count: Number(shadow) + Number(border) + Number(fill) }
}

/**
 * The border level the engine should USE for block edges — floored to a
 * perceptible hairline (`subtle`) when EVERY separation channel is off, so a block
 * is never invisible. This is the real guarantee: it holds for the CDN/agent export
 * too, not just the live panel. A no-op for every config except the flat+plain+faint
 * corner, so the blast radius is exactly the broken combination.
 */
export function guardedBorders(cfg: SepCfg): Borders {
  return separationChannels(cfg).count === 0 ? 'subtle' : cfg.borders
}

/**
 * Panel lock predicate: would this single-knob change zero ALL block separation?
 * The panel maps each separation-knob option through this to lock (padlock +
 * disable) the value that would dissolve the block — "make whatever you want, we
 * straighten it", shown honestly instead of silently corrected.
 */
export function wouldZeroSeparation(cfg: SepCfg, override: Partial<SepCfg>): boolean {
  return separationChannels({ ...cfg, ...override }).count === 0
}
