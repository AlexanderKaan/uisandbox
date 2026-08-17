/**
 * Parse and print CSS colours WITH alpha, in OKLCH.
 *
 * `audit/engine/colorspace.mjs` already parses every notation the reader meets
 * (hex, rgb, hsl, oklch, Tailwind names, bare triplets) — but it drops alpha,
 * because a census does not need it. The sandbox does: `rgba(0,0,0,.08)` is a
 * hairline that must stay a hairline after the brand hue moves. This wraps that
 * parser and adds the alpha back, so there is still one colour parser.
 */
// @ts-expect-error — plain .mjs, no types published
import { parseColor, rgbToOklch, oklchToRgb } from '../audit/engine/colorspace.mjs'

export interface Okla {
  L: number // 0..1
  C: number
  H: number // degrees
  a: number // 0..1
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function alphaOf(input: string): number {
  const s = input.trim().toLowerCase()
  const hex = s.match(/^#([0-9a-f]{8}|[0-9a-f]{4})$/)
  if (hex) {
    const h = hex[1]!
    const aa = h.length === 4 ? h[3]! + h[3]! : h.slice(6, 8)
    return parseInt(aa, 16) / 255
  }
  // rgba(…, a) / hsla(…, a) / rgb(r g b / a) / oklch(l c h / a)
  const slash = s.match(/\/\s*([\d.]+)(%?)\s*\)$/)
  if (slash) return slash[2] ? parseFloat(slash[1]!) / 100 : parseFloat(slash[1]!)
  const comma = s.match(/^(rgba|hsla)\(([^)]+)\)$/)
  if (comma) {
    const parts = comma[2]!.split(',').map((p) => p.trim())
    if (parts.length === 4) {
      const a = parts[3]!
      return a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a)
    }
  }
  if (s === 'transparent') return 0
  return 1
}

/** The three notations a sheet entry can be in. */
export type ColorShape = 'css' | 'rgb-triplet' | 'hsl-triplet'
export function colorShape(v: string): ColorShape {
  if (v.startsWith('hsl:')) return 'hsl-triplet'
  if (/^\d{1,3}(\s*,\s*|\s+)\d{1,3}(\s*,\s*|\s+)\d{1,3}$/.test(v.trim())) return 'rgb-triplet'
  return 'css'
}

/** Parse any CSS colour literal — or a bare rgb / `hsl:` triplet — to OKLCH + alpha, or null. */
export function parseCssColor(input: string): Okla | null {
  const s = input.trim().replace(/^hsl:/, '')
  if (/^transparent$/i.test(s)) return { L: 0, C: 0, H: 0, a: 0 }
  const rgb = parseColor(s) as [number, number, number] | null
  if (!rgb) return null
  const [L, C, H] = rgbToOklch(rgb[0], rgb[1], rgb[2]) as [number, number, number]
  const a = alphaOf(s)
  if (![L, C, H, a].every(Number.isFinite)) return null
  return { L, C: Math.max(0, C), H: ((H % 360) + 360) % 360, a: clamp01(a) }
}

/** Print in the SAME notation the original used — a triplet stays a triplet
 *  (with its separator), a bare hsl stays bare hsl; alpha is theirs to keep. */
export function formatLike(original: string, c: Okla): string {
  const shape = colorShape(original)
  if (shape === 'css') return formatCssColor(c)
  const [r, g, b] = (oklchToRgb(clamp01(c.L), Math.max(0, c.C), c.H) as [number, number, number]).map((v) => Math.round(Math.min(255, Math.max(0, v)))) as [number, number, number]
  if (shape === 'rgb-triplet') {
    const sep = /,/.test(original) ? (/,\s/.test(original) ? ', ' : ',') : ' '
    return [r, g, b].join(sep)
  }
  // hsl-triplet: back to h s% l%
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  let h = 0, sat = 0
  if (max !== min) {
    const d = max - min
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
    h *= 60
  }
  const f = (n: number) => Math.round(n * 10) / 10
  return `hsl:${f(h)} ${f(sat * 100)}% ${f(l * 100)}%`
}

/** Print as the plainest legal CSS: hex when opaque, `rgb(r g b / a)` otherwise. */
export function formatCssColor(c: Okla): string {
  const [r, g, b] = (oklchToRgb(clamp01(c.L), Math.max(0, c.C), c.H) as [number, number, number]).map((v) =>
    Math.round(Math.min(255, Math.max(0, v))),
  ) as [number, number, number]
  if (c.a >= 0.999) return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  return `rgb(${r} ${g} ${b} / ${Math.round(c.a * 1000) / 1000})`
}

/** Shortest hue delta, in degrees, from `from` to `to` (−180..180). */
export function hueDelta(from: number, to: number): number {
  let d = to - from
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}
