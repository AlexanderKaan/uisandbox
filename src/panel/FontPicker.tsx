import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, Upload, AlertCircle } from 'lucide-react'
import {
  customFontFamily,
  IL_HINT,
  isCustomFont,
  SERIF_FONTS,
  SYSTEM_FONT,
  SYSTEM_STACK,
} from '../tokens/fonts'
import { addCustomFont, isCustomFontLoaded, listCustomFonts, subscribeCustomFonts } from '../tokens/customFonts'
import type { FontGroup } from '../tokens/fonts'

interface FontPickerProps {
  value: string
  groups: FontGroup[]
  onChange: (next: string) => void
  /** Sample sentence shown under the picker in the currently selected font */
  sample?: string
  /** Size variant — 'display' (20px, headline character) or 'body' (14px,
   *  reading character). Makes the display↔body hierarchy visible in the
   *  picker itself, mirroring how the choice plays out in the preview. */
  sampleSize?: 'display' | 'body'
  /** Inline mode — render just the always-open font LIST (no trigger button,
   *  no sample), statically positioned to fill a parent popover. Used by the
   *  flat menu's flyout. */
  inline?: boolean
  /** The families THEIR code carries — shown first, as "In your code", so a
   *  switch away is a switch back too (a Custom: name is theirs, not an upload). */
  inCode?: string[]
}

/** The list's Google faces, loaded once into the HOST document (weight 400
 *  only) so every option renders in its own letter. Their own families are not
 *  fetched: those live in the frame, and a name is not proof of a Google face. */
const loadedLists = new Set<string>()
function preloadListFonts(groups: FontGroup[]): void {
  const names = groups.flatMap((g) => g.fonts).filter((f) => f !== SYSTEM_FONT && !isCustomFont(f) && !loadedLists.has(f))
  if (!names.length) return
  for (const n of names) loadedLists.add(n)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${names.map((n) => `family=${n.replace(/\s+/g, '+')}:wght@400`).join('&')}&display=swap`
  document.head.appendChild(link)
}

/**
 * Custom font picker — replaces the native <select> so each option can be
 * rendered in its own typeface. Three font sources:
 *   1. System — OS native stack, zero load, native feel (top of list)
 *   2. Google Fonts — preloaded eagerly in index.html so options render in
 *      their real face right in the dropdown
 *   3. Custom uploads — .woff2/.woff/.ttf/.otf loaded via FontFace API,
 *      session-only (no storage, no upload to server)
 */
export function FontPicker({ value, groups, onChange, sample, sampleSize = 'display', inline = false, inCode = [] }: FontPickerProps) {
  const [open, setOpen] = useState(false)
  const showMenu = inline || open
  useEffect(() => { if (showMenu) preloadListFonts(groups) }, [showMenu, groups])
  const ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Re-render whenever a new custom font is added.
  // useSyncExternalStore plays nicely with React 19's concurrent rendering.
  const customFonts = useSyncExternalStore(
    subscribeCustomFonts,
    listCustomFonts,
    () => [] as string[],
  )

  // Their families first; a face that is also in our list is theirs to keep
  // there. The CURRENT value is always listed — the rendered page can name a
  // family the sheet never spelled out (a UA default, an inline style).
  const ours = new Set(groups.flatMap((g) => g.fonts))
  const theirs = inCode.includes(value) || ours.has(value) || !isCustomFont(value) || customFonts.includes(value) ? inCode : [value, ...inCode]
  const listed = new Set(theirs)
  const shown: FontGroup[] = [
    ...groups.slice(0, 1),
    ...(theirs.length ? [{ group: 'In your code', fonts: theirs }] : []),
    ...groups.slice(1).map((g) => ({ ...g, fonts: g.fonts.filter((f) => !listed.has(f)) })).filter((g) => g.fonts.length),
  ]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isSerif = SERIF_FONTS.includes(value)
  /** Resolve a font name to a real CSS font-family string for the dropdown. */
  const fontStyle = (name: string): string => {
    if (name === SYSTEM_FONT) return SYSTEM_STACK
    if (isCustomFont(name)) return `'${customFontFamily(name)}', sans-serif`
    return `'${name}', ${SERIF_FONTS.includes(name) ? 'serif' : 'sans-serif'}`
  }

  /** Friendly label for the trigger — strip the "Custom: " prefix. */
  const triggerLabel = (name: string): string => {
    if (isCustomFont(name)) return customFontFamily(name)
    return name
  }

  /** Did the user pick a custom font that's no longer loaded (post-reload)? */
  const missingCustom = isCustomFont(value) && !isCustomFontLoaded(value)

  /** Shared font-file handler — same code path for click-to-pick and drop. */
  const acceptFontFile = async (file: File) => {
    setError(null)
    // Sanity-check extension. Browsers do allow any MIME, so we fall back
    // to checking the filename suffix which is reliable for font files.
    if (!/\.(woff2|woff|ttf|otf)$/i.test(file.name)) {
      setError('Pick a .woff2 / .woff / .ttf / .otf file.')
      return
    }
    try {
      const prefixedName = await addCustomFont(file)
      onChange(prefixedName)
      setOpen(false)
    } catch {
      setError('Could not load font. Try a .woff2 file.')
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await acceptFontFile(file)
    // Reset input so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = ''
  }

  /** Drag-and-drop — accept a font file dropped onto the upload area. */
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    // Must preventDefault on dragover for drop to fire — that's the HTML5 spec.
    e.preventDefault()
    e.stopPropagation()
    if (!dragOver) setDragOver(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await acceptFontFile(file)
  }

  return (
    <div className={`fp ${inline ? 'fp--inline' : ''}`} ref={ref}>
      {!inline && (
        <button
          type="button"
          className="fp__btn"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="fp__name" style={{ fontFamily: fontStyle(value) }}>
            {triggerLabel(value)}
          </span>
          {/* Tag sits OUTSIDE .fp__name so it doesn't inherit the custom font
              styling — stays in the chrome's neutral type. */}
          {isCustomFont(value) && <span className="fp__tag">Custom</span>}
          <span className="fp__chev" aria-hidden>
            <ChevronDown size={14} strokeWidth={1.75} />
          </span>
        </button>
      )}
      {!inline && sample && (
        <div
          className={`fp__sample fp__sample--${sampleSize}`}
          style={{ fontFamily: fontStyle(value), fontStyle: isSerif ? 'normal' : undefined }}
        >
          {sample}
        </div>
      )}
      {!inline && missingCustom && (
        <div className="fp__warn" role="status">
          <AlertCircle size={12} strokeWidth={1.75} />
          Custom font was lost on reload. Re-upload to preview.
        </div>
      )}
      {showMenu && (
        <div className={`menu fp__menu ${inline ? 'fp__menu--inline' : ''}`} role="listbox">
          {/* Order: System → Custom (already-uploaded fonts) → Upload CTA →
              Google fonts. Custom sits HIGH so when a user opens a second
              font field they immediately see what they've already uploaded
              — no re-upload needed, no scrolling required to discover it. */}
          {shown.map((g, gi) => (
            <div key={g.group} className="fp__group">
              <div className="fp__group-label">{g.group}</div>
              {g.fonts.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="option"
                  aria-selected={f === value}
                  className={`fp__item ${f === value ? 'fp__item--on' : ''}`}
                  onClick={() => {
                    onChange(f)
                    setOpen(false)
                  }}
                  style={{ fontFamily: fontStyle(f) }}
                  title={IL_HINT[f]}
                >
                  {triggerLabel(f)}
                  {IL_HINT[f] && <span className="fp__hint" aria-hidden>Il</span>}
                </button>
              ))}
              {/* After the FIRST group (System), inject the Custom list (if any)
                  and the Upload CTA — both before the long Google fonts list. */}
              {gi === 0 && (
                <>
                  {customFonts.length > 0 && (
                    <div className="fp__subgroup">
                      <div className="fp__group-label">Custom (this session)</div>
                      {customFonts.map((f) => (
                        <button
                          key={f}
                          type="button"
                          role="option"
                          aria-selected={f === value}
                          className={`fp__item ${f === value ? 'fp__item--on' : ''}`}
                          onClick={() => {
                            onChange(f)
                            setOpen(false)
                          }}
                          style={{ fontFamily: fontStyle(f) }}
                        >
                          {customFontFamily(f)}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Non-inline (legacy dropdown) keeps the upload CTA high in
                      the list. Inline (flyout) mode moves it to a pinned grey
                      footer instead — see below. */}
                  {!inline && (
                    <div className="fp__upload fp__upload--inline">
                      <button
                        type="button"
                        className={`fp__upload-btn ${dragOver ? 'fp__upload-btn--over' : ''}`}
                        onClick={() => fileRef.current?.click()}
                        onDragEnter={onDragEnter}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        aria-describedby={error ? 'font-upload-error' : undefined}
                      >
                        <Upload size={13} strokeWidth={1.75} />
                        <span>
                          {dragOver
                            ? 'Drop to upload'
                            : customFonts.length > 0
                              ? 'Upload another font'
                              : 'Upload or drop a font'}
                        </span>
                        <span className="fp__upload-hint">.woff2 / .woff / .ttf / .otf</span>
                      </button>
                      {error && <div id="font-upload-error" className="fp__error">{error}</div>}
                      <div className="fp__upload-disclaimer">
                        Stays in this browser session, never sent to a server.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Inline flyout — the "upload your own font" action as a pinned grey
          footer, mirroring the Brand-colour footer in the theme flyout. */}
      {inline && (
        <div
          className={`fp__foot ${dragOver ? 'fp__foot--over' : ''}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <button
            type="button"
            className="fp__foot-btn"
            onClick={() => fileRef.current?.click()}
            aria-describedby={error ? 'font-upload-error-foot' : undefined}
          >
            <Upload size={14} strokeWidth={1.75} />
            <span className="fp__foot-label">
              {dragOver ? 'Drop to upload' : 'Upload your own font'}
            </span>
            <span className="fp__foot-hint">.woff2 / .ttf</span>
          </button>
          {error && (
            <div id="font-upload-error-foot" className="fp__error fp__error--foot">
              {error}
            </div>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
        hidden
        aria-label="Upload a font file"
        onChange={handleUpload}
      />
    </div>
  )
}
