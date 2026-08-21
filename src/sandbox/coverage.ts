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
import { allElements, inFlatTree } from './verify'

export interface Coverage {
  colours: { hit: number; total: number }
  fonts: { hit: number; total: number }
  sizes: { hit: number; total: number }
  radii: { hit: number; total: number }
  outside: { images: number; canvas: number; video: number; backgroundImages: number }
  elements: number
  /** Sheet entry → where on screen it was found, and on how many elements.
   *
   *  A stylesheet census cannot tell a component's colour from a utility class
   *  nobody used: Bootstrap declares `#000` 366 times and paints it never, and
   *  the sample of sites for its body ink `#212529` is mostly `.bg-dark`, so a
   *  census calls the ink a background. The screen does not have that problem —
   *  it knows an element painted the colour as TEXT. Anything that has to
   *  DESCRIBE the design (DESIGN.md, the token file) reads roles from here. */
  painted: Map<number, PaintRoles>
  /** What the page itself computes for its ink, its ground and its type — the
   *  readings a census gets wrong most often, taken straight off the elements
   *  instead. A type level read here is COHERENT: one element's own family,
   *  size, weight and leading. Composing those from three separate rankings of
   *  the stylesheet produces a level that exists nowhere (measured on the
   *  Mantine docs: body came out 11px/700/1). */
  anchors: Anchors
}

export interface PaintRoles { text: number; surface: number; border: number; total: number }
export interface TypeLevel { fontFamily: string; fontSize: string; fontWeight: string; lineHeight: string }
export interface Anchors { text?: string; background?: string; type?: { body?: TypeLevel; display?: TypeLevel; heading?: TypeLevel } }
type PaintRole = 'text' | 'surface' | 'border' | null

const key = (r: number, g: number, b: number) => `${r},${g},${b}`
/** Every entry that resolves to a paint, not just the first. `#ffffff` and
 *  `rgba(255,255,255,.15)` quantise to the same key here (the meter compares
 *  channels, not alpha), and binding the key to whichever came first meant a
 *  rare literal could claim the paint and the busy one would read as never
 *  shown. Measured on the Bootstrap docs: white lost its own paint to a 15 %
 *  overlay, and the design doc then called a callout green the page surface. */
const keep = <K,>(m: Map<K, number[]>, k: K, id: number) => {
  const at = m.get(k)
  if (at) at.push(id); else m.set(k, [id])
}
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
  // Value → the sheet entry it came from, so a hit can name what it hit.
  const colourSet = new Map<string, number[]>()
  const familySet = new Map<string, number[]>()
  const sizeSet = new Map<number, number[]>()
  const radiusSet = new Map<number, number[]>()
  const painted = new Map<number, PaintRoles>()
  const rootPx = parseFloat(win.getComputedStyle(doc.documentElement).fontSize) || 16
  // The FRAME resolves every sheet value — a probe element computes `calc(.875rem
  // * var(--mantine-scale))`, `color-mix()`, `oklch()` exactly as the page does;
  // the meter's own arithmetic could not (Mantine read 82 % type for that).
  // em stays symbolic: it resolves against a font-size the meter only knows
  // per element — a radius against its own, a font-size against its parent's.
  const sizeEm = new Map<number, number[]>()
  const radiusEm = new Map<number, number[]>()
  const probe = doc.createElement('i')
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden'
  ;(doc.body ?? doc.documentElement).appendChild(probe)
  const pcs = win.getComputedStyle(probe)
  try {
    for (const e of table.entries) {
      const raw = vars[varName(e.id)] ?? e.value
      const cur = raw.replace(/^hsl:/, '')
      if (e.kind === 'color') {
        // Bare channels (`--bs-primary-rgb: 13,110,253`, `--spectrum-gray-800-rgb:
        // 34, 34, 34`, shadcn's `222.2 47.4% 11.2%`) are colours only once wrapped.
        const asCss = raw.startsWith('hsl:') ? `hsl(${cur})` : /^\d{1,3}(\s*,\s*|\s+)\d{1,3}(\s*,\s*|\s+)\d{1,3}$/.test(cur) ? `rgb(${cur})` : cur
        probe.style.color = ''
        probe.style.color = asCss
        const k = rgbKey(pcs.color)
        if (k && k !== 'transparent') keep(colourSet, k, e.id)
        else { const c = parseCssColor(cur); if (c) { const [r, g, b] = hexRgb(c.L, c.C, c.H); keep(colourSet, key(r, g, b), e.id) } }
      } else if (e.kind === 'font-family') {
        keep(familySet, cur.split(',')[0]!.trim().replace(/^["']|["']$/g, '').toLowerCase(), e.id)
      } else if (e.kind === 'font-size') {
        const em = cur.match(/^(-?\d*\.?\d+)em$/)
        if (em) { keep(sizeEm, +em[1]!, e.id); continue }
        probe.style.fontSize = ''
        probe.style.fontSize = cur
        const px = parseFloat(pcs.fontSize)
        if (px) keep(sizeSet, Math.round(px * 2) / 2, e.id)
      } else if (e.kind === 'radius') {
        const em = cur.match(/^(-?\d*\.?\d+)em$/)
        if (em) { keep(radiusEm, +em[1]!, e.id); continue }
        probe.style.borderTopLeftRadius = ''
        probe.style.borderTopLeftRadius = cur
        const px = parseFloat(pcs.borderTopLeftRadius)
        if (Number.isFinite(px)) keep(radiusSet, Math.round(px * 2) / 2, e.id)
      }
    }
  } finally { probe.remove() }
  const cov: Coverage = { colours: { hit: 0, total: 0 }, fonts: { hit: 0, total: 0 }, sizes: { hit: 0, total: 0 }, radii: { hit: 0, total: 0 }, outside: { images: 0, canvas: 0, video: 0, backgroundImages: 0 }, elements: 0, painted, anchors: readAnchors(doc, win) }
  // Shadow trees included (Spectrum, Lit: what you see is mostly in them);
  // unslotted light DOM excluded (never painted).
  const els = allElements(doc.body).filter(inFlatTree).slice(0, 4000)
  // Same tolerance as before; they now hand back the entry so a hit can be
  // recorded against it, and `null` where they used to say false.
  const near = (set: Map<number, number[]>, v: number): number[] | null => { for (const [s, ids] of set) if (Math.abs(s - v) <= 0.75) return ids; return null }
  const nearEm = (set: Map<number, number[]>, v: number, base: number): number[] | null => { for (const [s, ids] of set) if (Math.abs(s * base - v) <= 0.75) return ids; return null }
  const hit = (ids: number[] | null | undefined, role: PaintRole = null): boolean => {
    if (!ids) return false
    for (const id of ids) {
      let at = painted.get(id)
      if (!at) { at = { text: 0, surface: 0, border: 0, total: 0 }; painted.set(id, at) }
      at.total++
      if (role) at[role]++
    }
    return true
  }
  for (const el of els) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
    const r = el.getBoundingClientRect()
    // A 1×1 clipped element is a screen-reader-only span, not paint.
    if (r.width < 2 || r.height < 2) continue
    cov.elements++
    if (el.tagName === 'IMG' || el.tagName === 'PICTURE') { cov.outside.images++; continue }
    if (el.tagName === 'CANVAS') { cov.outside.canvas++; continue }
    if (el.tagName === 'VIDEO') { cov.outside.video++; continue }
    const ew = el.ownerDocument.defaultView ?? win
    const cs = ew.getComputedStyle(el)
    const bg = rgbKey(cs.backgroundColor)
    if (bg && bg !== 'transparent' && (!UA_COLOURS.has(bg) || colourSet.has(bg))) { cov.colours.total++; if (hit(colourSet.get(bg), 'surface')) cov.colours.hit++ }
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && /url\((?!"data:image\/svg)/.test(cs.backgroundImage)) cov.outside.backgroundImages++
    // Text at font-size 0 (slick's dot buttons) is not painted: no ink to meter.
    const hasText = parseFloat(cs.fontSize) > 0 && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0)
    if (hasText) {
      const fg = rgbKey(cs.color)
      if (fg && fg !== 'transparent' && (!UA_COLOURS.has(fg) || colourSet.has(fg))) { cov.colours.total++; if (hit(colourSet.get(fg), 'text')) cov.colours.hit++ }
      const fam = cs.fontFamily.split(',')[0]!.trim().replace(/^["']|["']$/g, '').toLowerCase()
      // A bare generic (`monospace` on <code>, `serif`) the sheet never named is
      // the UA's default, not a family their CSS chose: not counted.
      const uaGeneric = /^(monospace|serif|sans-serif|system-ui|ui-monospace|cursive|fantasy)$/.test(fam) && !familySet.has(fam)
      if (!uaGeneric) { cov.fonts.total++; if (hit(familySet.get(fam)) || familySet.size === 0) cov.fonts.hit++ }
      cov.sizes.total++
      const fs = parseFloat(cs.fontSize)
      const parentFs = el.parentElement ? parseFloat(ew.getComputedStyle(el.parentElement).fontSize) : rootPx
      // A sheet with no font-size at all left the UA's sizes alone — nothing was
      // missed, there was nothing to move (as for families).
      if (hit(near(sizeSet, fs)) || hit(nearEm(sizeEm, fs, parentFs)) || (sizeSet.size === 0 && sizeEm.size === 0)) cov.sizes.hit++
    }
    if (parseFloat(cs.borderTopWidth) > 0) { const bc = rgbKey(cs.borderTopColor); if (bc && bc !== 'transparent' && (!UA_COLOURS.has(bc) || colourSet.has(bc))) { cov.colours.total++; if (hit(colourSet.get(bc), 'border')) cov.colours.hit++ } }
    const rad = parseFloat(cs.borderTopLeftRadius)
    // A circle or a pill (radius ≥ half the box) is authored as 50 % / 999px —
    // kept out of the sheet on purpose, so not a miss here either.
    if (rad > 0 && rad < 100 && rad < Math.min(r.width, r.height) / 2 - 0.5) { cov.radii.total++; if (hit(near(radiusSet, rad)) || hit(nearEm(radiusEm, rad, parseFloat(cs.fontSize)))) cov.radii.hit++ }
  }
  return cov
}

/** The ink and the ground, as the page computes them. `body` may leave the
 *  background to `html`; a transparent one is not an answer, so it falls
 *  through. Same rule the baseline uses for the canvas. */
function readAnchors(doc: Document, win: Window): Anchors {
  try {
    if (!doc.body) return {}
    const b = win.getComputedStyle(doc.body)
    const h = win.getComputedStyle(doc.documentElement)
    const opaque = (c: string) => c && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(c) ? c : undefined
    const level = (el: Element | null): TypeLevel | undefined => {
      if (!el) return undefined
      const r = el.getBoundingClientRect()
      // A heading with no box is not the page's heading — it is a hidden one.
      if (el !== doc.body && (r.width < 2 || r.height < 2)) return undefined
      const cs = win.getComputedStyle(el)
      if (!parseFloat(cs.fontSize)) return undefined
      return { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight }
    }
    const biggest = (sel: string): Element | null => {
      let best: Element | null = null, px = 0
      for (const el of Array.from(doc.querySelectorAll(sel)).slice(0, 40)) {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        const s = parseFloat(win.getComputedStyle(el).fontSize)
        if (s > px) { px = s; best = el }
      }
      return best
    }
    return {
      text: opaque(b.color),
      background: opaque(b.backgroundColor) ?? opaque(h.backgroundColor),
      type: { body: level(doc.body), display: level(biggest('h1')), heading: level(biggest('h2, h3')) },
    }
  } catch { return {} }
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
