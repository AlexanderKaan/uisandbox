import { applyColorTheme } from '../tokens/stylesAndThemes'
import type { Config, ColorTheme } from '../tokens/types'

export type ConfigAction =
  | { type: 'SET'; patch: Partial<Config> }
  | { type: 'APPLY_COLOR_THEME'; id: ColorTheme }
  | { type: 'REPLACE'; cfg: Config }

/** Brand-color fields. Editing any while in Mono mode means the user is
 *  expressing intent to actually USE color — flip color to 'tone' so the
 *  rest of the system (theme dropdown label, preview rendering) reflects
 *  that. Without this the picker silently changes a hex that mono-mode
 *  then re-grays out, which feels broken. */
const BRAND_COLOR_FIELDS: ReadonlyArray<keyof Config> = ['cPrimary']
function patchTouchesBrandColor(patch: Partial<Config>): boolean {
  return BRAND_COLOR_FIELDS.some((f) => f in patch)
}

export function configReducer(state: Config, action: ConfigAction): Config {
  switch (action.type) {
    case 'SET': {
      // Picking a brand color in Mono auto-promotes to Tone — see comment
      // above patchTouchesBrandColor for why this lives here, not in the UI.
      const promotesMono =
        state.color === 'mono' &&
        patchTouchesBrandColor(action.patch) &&
        !('color' in action.patch)
      return {
        ...state,
        ...(promotesMono ? { color: 'tone' as const, colorTheme: 'mono' as const } : null),
        ...action.patch,
      }
    }
    /* Color theme — the one remaining preset axis (brand hue). applyColorTheme
     * merges the hue + handles the mono/tone color-mode auto-flip. (Style was
     * removed: form facets are individual controls now.) */
    case 'APPLY_COLOR_THEME':
      return applyColorTheme(state, action.id)
    case 'REPLACE':
      return action.cfg
  }
}
