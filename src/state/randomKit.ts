import type { Config, ColorTheme, Harmony } from '../tokens/types'
import { applyColorTheme } from '../tokens/stylesAndThemes'
import { HARMONY_PRESETS } from '../tokens/harmony'
import { ALL_FONTS, SERIF_FONTS, SYSTEM_FONT } from '../tokens/fonts'

/* "Surprise me" (C4) — a guardrail-aware random kit. GUARDRAILS:
 *  - Colour comes from a vetted chromatic theme, and buildTokens clamps every
 *    derived colour to WCAG-AA regardless, so a random kit is ALWAYS legible.
 *  - Every other facet is picked from its enumerated, valid value set.
 *  - The user's light/dark mode is preserved (randomizing it is jarring).
 * Result: a fresh, usable, shareable kit on every roll — never a broken one. */

const pick = <T>(arr: readonly T[], rnd: () => number): T => arr[Math.floor(rnd() * arr.length)]!

const CHROMATIC_THEMES: readonly ColorTheme[] = ['cobalt', 'sky', 'teal', 'jade', 'ember', 'coral', 'indigo', 'violet', 'rose']
const SCALES = ['compact', 'default', 'comfortable'] as const
const RADII = ['none', 'subtle', 'soft', 'round'] as const
const TYPE_SCALES = ['sm', 'md', 'lg', 'xl'] as const
const SURFACE_DEPTHS = ['flat', 'soft', 'deep'] as const
const SURFACES = ['outlined', 'filled'] as const
const BORDERS = ['faint', 'subtle', 'medium', 'strong'] as const
const NEUTRALS = ['auto', 'neutral'] as const
// Harmony rolls a vetted PRESET (never random raw slider values) — each preset
// is a curated (spread, expression) pair, so the family always reads deliberate.
const HARMONIES = ['mono', 'tonal', 'complement', 'expressive'] as const satisfies readonly Exclude<Harmony, 'custom'>[]

export function randomKit(current: Config, rnd: () => number = Math.random, locked: Set<string> = new Set()): Config {
  // A knob the user pinned (per-row lock) keeps its current value through a roll.
  const keep = (k: string) => locked.has(k)
  const roll = <K extends keyof Config>(k: K, arr: readonly Config[K][]): Config[K] => (keep(k) ? current[k] : pick(arr, rnd))
  const bodyFonts = ALL_FONTS.filter((f) => f !== SYSTEM_FONT && !SERIF_FONTS.includes(f)) // body = sans only
  const displayFonts = ALL_FONTS.filter((f) => f !== SYSTEM_FONT) // display may be serif
  // Brand = colorTheme + cPrimary + color, moved together; pinned → keep all three.
  const themed = keep('colorTheme') ? current : applyColorTheme(current, pick(CHROMATIC_THEMES, rnd))
  // Harmony = harmony + spread + expression, moved together; pinned → keep all three.
  const harmonyVals = keep('harmony')
    ? { harmony: current.harmony, spread: current.spread, expression: current.expression }
    : (() => { const h = pick(HARMONIES, rnd); return { harmony: h, ...HARMONY_PRESETS[h] } })()
  return {
    ...themed,
    ...harmonyVals,
    scale: roll('scale', SCALES),
    radius: roll('radius', RADII),
    typeScale: roll('typeScale', TYPE_SCALES),
    fontDisplay: keep('fontDisplay') ? current.fontDisplay : pick(displayFonts, rnd),
    fontBody: keep('fontBody') ? current.fontBody : pick(bodyFonts, rnd),
    surfaceDepth: roll('surfaceDepth', SURFACE_DEPTHS),
    surface: roll('surface', SURFACES),
    borders: roll('borders', BORDERS),
    neutral: roll('neutral', NEUTRALS),
    mode: current.mode, // preserve light/dark — don't jar the user
  }
}
