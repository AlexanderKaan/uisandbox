/**
 * How much of what you SEE is under the knobs — measured on the rendered
 * frame, not inferred from the sheet.
 *
 * For every visible element the painted values (text colour, background,
 * border colour, font family, font size, radius) are checked against the sheet's
 * CURRENT values: a match means a knob can move it; a miss is a literal the
 * sheet never saw (a raster logo's colour cannot be checked at all, so images,
 * canvases and videos are counted separately as "outside").
 *
 * The number this yields is the honest answer to "how realistically can I play
 * with my own screen here" — a percentage, not a feeling.
 */
import { parseCssColor } from './cssColor'
import type { SubstitutionTable } from './table'
import { varName } from './table'

export interface Coverage {
  colours: { hit: number; total: number }
  fonts: { hit: number; total: number }
  sizes: { hit: number; total: number }
  radii: { hit: number; total: number }
  outside: { images: number; canvas: number; video: number; backgroundImages: number }
  elements: number
}

const key = (r: number, g: number, b: number) => `${r},${g},${b}`
/** The browser's own paint, not theirs: the UA link blue, the form-control
 *  border grey, buttonface. A page that never styled a <select> did not miss
 *  a knob — there was nothing in its CSS to tokenise. (When the sheet DOES
 *  hold such a colour, it counts as usual.) */
const UA_COLOURS = new Set(['0,0,238', '85,26,139', '118,118,118', '239,239,239', '16,16,16', '133,133,133'])
const rgbKey = (css: string): string | null => {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (!m) return null
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return 'transparent'
  return key(+m[1]!, +m[2]!, +m[3]!)
}

export function measureCoverage(doc: Document, table: SubstitutionTable, vars: Record<string, string>): Coverage {
  const win = doc.defaultView!
  const colourSet = new Set<string>()
  const familySet = new Set<string>()
  const sizeSet = new Set<number>()
  const radiusSet = new Set<number>()
  // em-valued entries resolve against a font-size the meter only knows per
  // element: a radius against its own, a font-size against its parent's.
  const sizeEm = new Set<number>()
  const radiusEm = new Set<number>()
  const rootPx = parseFloat(win.getComputedStyle(doc.documentElement).fontSize) || 16
  const toPx = (v: string, ctxPx: number) => { const m = v.match(/^(-?\d*\.?\d+)(px|rem|em)$/); return m ? (m[2] === 'px' ? +m[1]! : m[2] === 'rem' ? +m[1]! * rootPx : +m[1]! * ctxPx) : null }
  for (const e of table.entries) {
    const cur = vars[varName(e.id)] ?? e.value
    if (e.kind === 'color') {
      const c = parseCssColor(cur)
      if (c) { const [r, g, b] = hexRgb(c.L, c.C, c.H); colourSet.add(key(r, g, b)) }
    } else if (e.kind === 'font-family') {
      familySet.add(cur.split(',')[0]!.trim().replace(/^["']|["']$/g, '').toLowerCase())
    } else if (e.kind === 'font-size') {
      const em = cur.match(/^(-?\d*\.?\d+)em$/)
      if (em) sizeEm.add(+em[1]!)
      else { const px = toPx(cur, 16); if (px) sizeSet.add(Math.round(px * 2) / 2) }
    } else if (e.kind === 'radius') {
      const em = cur.match(/^(-?\d*\.?\d+)em$/)
      if (em) radiusEm.add(+em[1]!)
      else { const px = toPx(cur, 16); if (px !== null) radiusSet.add(Math.round(px * 2) / 2) }
    }
  }
  const cov: Coverage = { colours: { hit: 0, total: 0 }, fonts: { hit: 0, total: 0 }, sizes: { hit: 0, total: 0 }, radii: { hit: 0, total: 0 }, outside: { images: 0, canvas: 0, video: 0, backgroundImages: 0 }, elements: 0 }
  const els = Array.from(doc.body.querySelectorAll('*')).slice(0, 4000)
  const near = (set: Set<number>, v: number) => { for (const s of set) if (Math.abs(s - v) <= 0.75) return true; return false }
  const nearEm = (set: Set<number>, v: number, base: number) => { for (const s of set) if (Math.abs(s * base - v) <= 0.75) return true; return false }
  for (const el of els) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
    const r = el.getBoundingClientRect()
    // A 1×1 clipped element is a screen-reader-only span, not paint.
    if (r.width < 2 || r.height < 2) continue
    cov.elements++
    if (el.tagName === 'IMG' || el.tagName === 'PICTURE') { cov.outside.images++; continue }
    if (el.tagName === 'CANVAS') { cov.outside.canvas++; continue }
    if (el.tagName === 'VIDEO') { cov.outside.video++; continue }
    const cs = win.getComputedStyle(el)
    const bg = rgbKey(cs.backgroundColor)
    if (bg && bg !== 'transparent' && (!UA_COLOURS.has(bg) || colourSet.has(bg))) { cov.colours.total++; if (colourSet.has(bg)) cov.colours.hit++ }
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && /url\((?!"data:image\/svg)/.test(cs.backgroundImage)) cov.outside.backgroundImages++
    // Text at font-size 0 (slick's dot buttons) is not painted: no ink to meter.
    const hasText = parseFloat(cs.fontSize) > 0 && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0)
    if (hasText) {
      const fg = rgbKey(cs.color)
      if (fg && fg !== 'transparent' && (!UA_COLOURS.has(fg) || colourSet.has(fg))) { cov.colours.total++; if (colourSet.has(fg)) cov.colours.hit++ }
      cov.fonts.total++
      const fam = cs.fontFamily.split(',')[0]!.trim().replace(/^["']|["']$/g, '').toLowerCase()
      if (familySet.has(fam) || familySet.size === 0) cov.fonts.hit++
      cov.sizes.total++
      const fs = parseFloat(cs.fontSize)
      const parentFs = el.parentElement ? parseFloat(win.getComputedStyle(el.parentElement).fontSize) : rootPx
      // A sheet with no font-size at all left the UA's sizes alone — nothing was
      // missed, there was nothing to move (as for families).
      if (near(sizeSet, fs) || nearEm(sizeEm, fs, parentFs) || (sizeSet.size === 0 && sizeEm.size === 0)) cov.sizes.hit++
    }
    if (parseFloat(cs.borderTopWidth) > 0) { const bc = rgbKey(cs.borderTopColor); if (bc && bc !== 'transparent' && (!UA_COLOURS.has(bc) || colourSet.has(bc))) { cov.colours.total++; if (colourSet.has(bc)) cov.colours.hit++ } }
    const rad = parseFloat(cs.borderTopLeftRadius)
    // A circle or a pill (radius ≥ half the box) is authored as 50 % / 999px —
    // kept out of the sheet on purpose, so not a miss here either.
    if (rad > 0 && rad < 100 && rad < Math.min(r.width, r.height) / 2 - 0.5) { cov.radii.total++; if (near(radiusSet, rad) || nearEm(radiusEm, rad, parseFloat(cs.fontSize))) cov.radii.hit++ }
  }
  return cov
}

/** OKLCH → 8-bit sRGB triple, the same quantisation the screen uses. */
function hexRgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return lin.map((v) => { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, c)) * 255) }) as [number, number, number]
}

export const pct = (x: { hit: number; total: number }) => (x.total ? Math.round((100 * x.hit) / x.total) : 100)
