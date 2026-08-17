export interface FontGroup {
  group: string
  fonts: string[]
}

/** Sentinel font name — picks the OS's native font stack instead of loading
 *  a webfont. SF Pro on Apple, Roboto on Android, Segoe UI on Windows.
 *  Resolves to the SYSTEM_STACK constant at render time, no Google Fonts
 *  request needed. Used by Apple-feel themes and minimal apps. */
export const SYSTEM_FONT = 'System'
export const SYSTEM_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

/** Prefix used in font names to identify custom user-uploaded fonts.
 *  e.g. 'Custom: BrandSans'. The picker / export branch on this prefix to
 *  emit a @font-face placeholder instead of a Google Fonts import. */
export const CUSTOM_FONT_PREFIX = 'Custom: '
export const isCustomFont = (name: string): boolean => name.startsWith(CUSTOM_FONT_PREFIX)
export const customFontFamily = (name: string): string =>
  isCustomFont(name) ? name.slice(CUSTOM_FONT_PREFIX.length) : name

/** All Google Fonts in alphabetical order — one combined group keeps the
 *  picker scannable. Categorical sub-grouping (grotesk/humanist/geometric)
 *  was nice meta-info but most users don't need that distinction. */
/* Two faces were removed after `npm run audit:fonts` measured glyph confusion
 * and a side-by-side render confirmed it:
 *
 *   Manrope  — I/l at 98%. Capital i and lowercase L are the same vertical
 *              stroke; "Il1" renders as "ll1". For a system whose content is
 *              names, postcodes and case numbers that is disqualifying.
 *   DM Sans  — I/l at 90% and 0/O at 50%, same failure one notch less extreme.
 *
 * The rest of the list holds, and the metric calibrates itself on two faces it
 * had no way to know about: Lexend, designed for reading proficiency, scores
 * best of every sans (49%), and Public Sans, the US government's own face, sits
 * solidly in the clear band (68%). */
const GOOGLE_SANS = [
  'Albert Sans',
  'Archivo',
  'Figtree',
  'Geist',
  'Hanken Grotesk',
  'IBM Plex Sans',
  'Inter',
  'Lexend',
  'Outfit',
  'Plus Jakarta Sans',
  'Public Sans',
]

// Display serifs — only interface-usable ones (multi-weight, readable at heading
// sizes). Instrument Serif was dropped: single-weight 400, hairline high-contrast,
// only legible as huge hero/logo type — not a usable interface face.
const GOOGLE_SERIF = ['Fraunces', 'Newsreader']

// Monospace faces — the technical/terminal signal (Vercel sets headings in Geist
// Mono, Linear/Raycast use mono for IDs & numerics). All three are multi-weight on
// Google Fonts so the generic weight spec works. Selectable as display OR body.
const GOOGLE_MONO = ['Geist Mono', 'IBM Plex Mono', 'JetBrains Mono']
export const MONO_FONTS: string[] = GOOGLE_MONO

/** Body fonts — sans only (serifs are display-only by design choice).
 *  System sits in its own group at top; Google fonts in one combined group. */
export const BODY_FONTS: FontGroup[] = [
  { group: 'System', fonts: [SYSTEM_FONT] },
  { group: 'Google fonts', fonts: GOOGLE_SANS },
  { group: 'Mono', fonts: GOOGLE_MONO },
]

/** Display fonts — includes serifs + mono. Same shape: System + combined Google. */
export const DISPLAY_GROUPS: FontGroup[] = [
  { group: 'System', fonts: [SYSTEM_FONT] },
  { group: 'Google fonts', fonts: [...GOOGLE_SANS, ...GOOGLE_SERIF].sort() },
  { group: 'Mono', fonts: GOOGLE_MONO },
]

/** Kept for backwards-compat with existing presets / snapshot tests that
 *  reference DISPLAY_ONLY explicitly. */
export const DISPLAY_ONLY: FontGroup[] = [{ group: 'Serif', fonts: GOOGLE_SERIF }]

export const ALL_FONTS: string[] = [SYSTEM_FONT, ...GOOGLE_SANS, ...GOOGLE_SERIF, ...GOOGLE_MONO]
export const SERIF_FONTS: string[] = GOOGLE_SERIF

export const UI_MONO = 'JetBrains Mono'

export const UI_WEIGHTS: Record<'medium' | 'semibold' | 'bold', number> = {
  medium: 500,
  semibold: 600,
  bold: 700,
}

/**
 * Build a Google Fonts CSS @import line for the chosen typefaces.
 * Used by every CSS export so dropped-in files render in the chosen
 * fonts without further setup. Includes JetBrains Mono (Kbd & code).
 */
export function googleFontsImport(fontDisplay: string, fontBody: string): string {
  const seen = new Set<string>([fontDisplay, fontBody])
  // Drop System + custom fonts — they don't load from Google Fonts.
  // System uses the OS stack (no request needed). Custom fonts get their
  // own @font-face block emitted below the @import, not in it.
  seen.delete(SYSTEM_FONT)
  for (const name of [...seen]) {
    if (isCustomFont(name)) seen.delete(name)
  }
  // Every remaining family is multi-weight, so one spec fits all.
  const sansSpec = (name: string) => `${name.replace(/\s+/g, '+')}:wght@400;500;600;700`
  const families = [...seen].map(sansSpec)
  // JetBrains Mono is always loaded for kbd/code — unless it's already a chosen
  // face above (which loads it at full weights), in which case don't duplicate it.
  if (!seen.has(UI_MONO)) families.push('JetBrains+Mono:wght@400;500')
  const url = `https://fonts.googleapis.com/css2?family=${families.join('&family=')}&display=swap`
  return `@import url('${url}');`
}

/** Build a @font-face placeholder block for a custom uploaded font.
 *  Consumer drops their .woff2 next to tokens.css and edits the path. */
export function customFontFaceBlock(name: string): string {
  const family = customFontFamily(name)
  return `/* ===== Custom font: "${family}" =====
   You uploaded this font in Cockpit. Drop the actual file alongside
   this tokens.css (or whichever folder you serve from) and update the
   path below. Use .woff2 for best browser support. */
@font-face {
  font-family: '${family}';
  src: url('./${family.replace(/\s+/g, '-')}.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}`
}
