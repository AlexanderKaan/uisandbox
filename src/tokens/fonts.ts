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

/**
 * The list is not our taste; it is ALTERNATIVES for what their code has. Someone
 * whose app is set in Lato asks "what is close to this, what is different, and
 * what will not break my layout" — so the faces are grouped by CHARACTER, the
 * way a replacement is chosen, not alphabetically. Every face is a Google
 * variable font (or multi-weight) with a wght axis, so the Weight dial works
 * and one import fits all.
 *
 * "In your code" — the families the sheet itself carries — is not here: the
 * picker gets it from the project (SandboxPanel → FontPicker `inCode`).
 *
 * I/l confusion, re-measured on this list (glyphs I and l rendered at 64px,
 * pixel overlap of the union; controls: Manrope 98 % and Public Sans 68 %
 * match the old audit exactly, Lexend best at 14 %): Manrope 98, Inter 86,
 * Plus Jakarta 82, Roboto Flex 81, Albert Sans 81, DM Sans 80, Source Sans 75,
 * IBM Plex Mono 74, Nunito Sans 72, Hanken 69, Geist 68, Public Sans 68,
 * Geist Mono 68, Outfit 62, Urbanist 62, Fraunces 59, Source Serif 55,
 * JetBrains Mono 51, Figtree 50, Playfair 49, Lora 49, Fira Code 43,
 * Newsreader 42, IBM Plex Sans 20, Lexend 14. Manrope and DM Sans were once
 * dropped for a case-number dashboard; here they are back, because "replace
 * Poppins on my marketing site" is a real question and the sandbox shows their
 * app, not ours. The two above 85 % carry a hint in the picker, not a ban —
 * and that includes Inter, whose l has no tail by default.
 */
export const GROTESK = ['Inter', 'Geist', 'Public Sans', 'IBM Plex Sans', 'Roboto Flex']
export const HUMANIST = ['Source Sans 3', 'Nunito Sans', 'Figtree', 'Albert Sans', 'Hanken Grotesk', 'Lexend']
export const GEOMETRIC = ['Outfit', 'Plus Jakarta Sans', 'Manrope', 'Urbanist', 'DM Sans']
const GOOGLE_SANS = [...GROTESK, ...HUMANIST, ...GEOMETRIC]

// Display serifs — interface-usable ones (multi-weight, readable at heading
// sizes). Instrument Serif stays out: single-weight, hairline, only a logo face.
const GOOGLE_SERIF = ['Fraunces', 'Newsreader', 'Playfair Display', 'Lora', 'Source Serif 4']

// Monospace faces — the technical signal (Vercel sets headings in Geist Mono,
// Linear/Raycast use mono for IDs and numerics). Selectable as display OR body.
const GOOGLE_MONO = ['Geist Mono', 'JetBrains Mono', 'IBM Plex Mono', 'Fira Code']
export const MONO_FONTS: string[] = GOOGLE_MONO

/** Faces the audit flags for I/l confusion — shown as a hint in the picker. */
export const IL_HINT: Record<string, string> = { Manrope: 'Capital I and lowercase l are the same stroke (98 % overlap)', Inter: 'Capital I and lowercase l are near-identical (86 % overlap)' }

/** Body fonts — System, the sans groups by character, then mono. */
export const BODY_FONTS: FontGroup[] = [
  { group: 'System', fonts: [SYSTEM_FONT] },
  { group: 'Grotesk', fonts: GROTESK },
  { group: 'Humanist', fonts: HUMANIST },
  { group: 'Geometric', fonts: GEOMETRIC },
  { group: 'Mono', fonts: GOOGLE_MONO },
]

/** Display fonts — the same, plus serifs. */
export const DISPLAY_GROUPS: FontGroup[] = [
  { group: 'System', fonts: [SYSTEM_FONT] },
  { group: 'Grotesk', fonts: GROTESK },
  { group: 'Humanist', fonts: HUMANIST },
  { group: 'Geometric', fonts: GEOMETRIC },
  { group: 'Serif', fonts: GOOGLE_SERIF },
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
