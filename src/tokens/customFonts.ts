import { CUSTOM_FONT_PREFIX } from './fonts'

/**
 * Session-only custom font registry — users upload a .woff2/.woff/.ttf/.otf
 * and we register it with the document via the FontFace API. NOTHING IS
 * STORED on the server (this is an anonymous tool) and nothing persists
 * past tab close — that's intentional for privacy. After a page reload
 * the cfg.fontDisplay name may still reference "Custom: BrandSans" but
 * the file is gone; the fallback (sans-serif) kicks in and the picker
 * shows a small "re-upload to use" hint.
 */
interface CustomFontEntry {
  family: string
  blobUrl: string
  fontFace: FontFace
}

const fonts = new Map<string, CustomFontEntry>()
const listeners = new Set<() => void>()

/** Cached snapshot for useSyncExternalStore — MUST be a stable reference
 *  between renders or React 19 throws "getSnapshot should be cached to avoid
 *  an infinite loop". We rebuild this ONLY when fonts actually change. */
let cachedNames: string[] = []
function refreshCache(): void {
  cachedNames = Array.from(fonts.keys()).map((f) => CUSTOM_FONT_PREFIX + f)
}

/** Strip extension + non-safe chars from a filename to derive the font-family. */
function familyFromFilename(filename: string): string {
  return filename
    .replace(/\.(woff2|woff|ttf|otf)$/i, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .slice(0, 40) || 'CustomFont'
}

/**
 * Upload a font file and register it with the document.
 * Returns the prefixed family name (e.g. 'Custom: BrandSans') to set in
 * cfg.fontDisplay / cfg.fontBody.
 */
export async function addCustomFont(file: File): Promise<string> {
  const family = familyFromFilename(file.name)
  const blobUrl = URL.createObjectURL(file)
  const fontFace = new FontFace(family, `url(${blobUrl})`)
  await fontFace.load()
  document.fonts.add(fontFace)

  // If a font with the same family was previously uploaded, clean it up
  // so we don't leak blob URLs or stack duplicate FontFace registrations.
  const prev = fonts.get(family)
  if (prev) {
    document.fonts.delete(prev.fontFace)
    URL.revokeObjectURL(prev.blobUrl)
  }

  fonts.set(family, { family, blobUrl, fontFace })
  refreshCache()
  listeners.forEach((fn) => fn())
  return CUSTOM_FONT_PREFIX + family
}

/** Returns the list of currently-loaded custom font names (with prefix).
 *  Returns a STABLE reference between calls — required by useSyncExternalStore. */
export function listCustomFonts(): string[] {
  return cachedNames
}

/** True if a custom font with this prefixed name is currently loaded. */
export function isCustomFontLoaded(prefixedName: string): boolean {
  const family = prefixedName.startsWith(CUSTOM_FONT_PREFIX)
    ? prefixedName.slice(CUSTOM_FONT_PREFIX.length)
    : prefixedName
  return fonts.has(family)
}

/** Subscribe to changes — picker re-renders when new fonts are added. */
export function subscribeCustomFonts(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
