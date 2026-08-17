/**
 * Shuffle — a random stand on every knob that exists in the sandbox, and only
 * those. Dials roll within their own range (biased toward the middle so a roll
 * is a variation, not a caricature); brand picks a theme; families pick a hue;
 * fonts pick from the lists. Colours the sheet does not contain are left
 * undefined — a picker that is not shown must not move.
 */
import type { Config } from '../tokens/types'
import { COLOR_THEMES } from '../tokens/stylesAndThemes'
import { BODY_FONTS, DISPLAY_GROUPS } from '../tokens/fonts'
import { DIALS, type Dials } from './dials'
import type { Baseline } from './mapping'
import { formatCssColor } from './cssColor'

export function shuffle(cur: Config, baseline: Baseline, rnd: () => number = Math.random): Config {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!
  const sb: Dials = { ...cur.sb }
  for (const d of DIALS) {
    // Triangular around the centre snap ("as is") — mostly small moves.
    const centre = d.snaps.find((s) => s.label === 'as is')?.at ?? (d.min + d.max) / 2
    const t = (rnd() + rnd()) / 2 // 0..1, peaked at .5
    const v = t < 0.5 ? centre - (centre - d.min) * (1 - t * 2) : centre + (d.max - centre) * ((t - 0.5) * 2)
    const snapped = Math.round(v / d.step) * d.step
    ;(sb as unknown as Record<string, number>)[d.key] = Math.min(d.max, Math.max(d.min, Math.round(snapped * 1000) / 1000))
  }
  const fams = baseline.families
  for (const [fam, key] of [['secondary', 'cSecondary'], ['accent', 'cAccent'], ['success', 'cSuccess'], ['warning', 'cWarning'], ['danger', 'cDanger'], ['info', 'cInfo']] as const) {
    const c = fams?.centre[fam]
    if (!c) continue
    // Same lightness/chroma, a new hue — a re-tint, not a different role.
    if (rnd() < 0.5) (sb as unknown as Record<string, string | undefined>)[key] = formatCssColor({ ...c, H: rnd() * 360, a: 1 })
    else (sb as unknown as Record<string, string | undefined>)[key] = undefined
  }
  const themeId = pick(Object.keys(COLOR_THEMES) as Array<keyof typeof COLOR_THEMES>)
  const fontBody = pick(BODY_FONTS.flatMap((g) => g.fonts))
  const fontDisplay = rnd() < 0.5 ? fontBody : pick(DISPLAY_GROUPS.flatMap((g) => g.fonts))
  return { ...cur, cPrimary: COLOR_THEMES[themeId].cPrimary, colorTheme: themeId, fontBody, fontDisplay, sb }
}
