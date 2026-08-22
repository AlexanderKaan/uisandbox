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
/** One spelling of a bare rgb triplet, read by `colorShape` and `parseCssColor`
 *  both, so the two can never disagree about what a triplet is. */
const RGB_TRIPLET = /^\d{1,3}(\s*,\s*|\s+)\d{1,3}(\s*,\s*|\s+)\d{1,3}$/

export type ColorShape = 'css' | 'rgb-triplet' | 'hsl-triplet'
export function colorShape(v: string): ColorShape {
  if (v.startsWith('hsl:')) return 'hsl-triplet'
  if (RGB_TRIPLET.test(v.trim())) return 'rgb-triplet'
  return 'css'
}

/** Parse any CSS colour literal — or a bare rgb / `hsl:` triplet — to OKLCH + alpha, or null. */
export function parseCssColor(input: string): Okla | null {
  let s = input.trim().replace(/^hsl:/, '')
  if (/^transparent$/i.test(s)) return { L: 0, C: 0, H: 0, a: 0 }
  // A bare channel triplet with COMMAS. `colorShape` and `formatLike` both
  // already know this spelling; only the reader did not, so Bootstrap 5's
  // whole `-rgb` family (`--bs-primary-rgb: 13, 110, 253`, and the
  // `--bs-tertiary-bg-rgb` that paints AdminLTE's page) parsed to null and
  // `mapEntry` handed the literal straight back. Frozen for every dial: brand,
  // background, hue, contrast, dark mode. The space-separated form parsed all
  // along, which is what hid it — Tailwind and shadcn use spaces.
  if (RGB_TRIPLET.test(s)) s = s.replace(/,/g, ' ')
  const rgb = parseColor(s) as [number, number, number] | null
  if (!rgb) return null
  const [L, C, H] = rgbToOklch(rgb[0], rgb[1], rgb[2]) as [number, number, number]
  const a = alphaOf(s)
  if (![L, C, H, a].every(Number.isFinite)) return null
  return { L, C: Math.max(0, C), H: ((H % 360) + 360) % 360, a: clamp01(a) }
}

/** Linear sRGB of an OKLCH triple, unclamped — to know whether it fits. */
function linear(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, sv = s_ ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * sv, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * sv, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * sv]
}
/** Bring a colour into sRGB by REDUCING CHROMA at the same lightness and hue —
 *  the hue must survive a rotation, which per-channel clipping does not give
 *  (a lime rotated +90° clipped 12° off its target). Binary search on C. */
export function toGamut(c: Okla): Okla {
  const fits = (C: number) => linear(c.L, C, c.H).every((v) => v >= -0.0005 && v <= 1.0005)
  if (fits(c.C)) return c
  let lo = 0, hi = c.C
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid }
  return { ...c, C: lo }
}

/** Print in the SAME notation the original used — a triplet stays a triplet
 *  (with its separator), a bare hsl stays bare hsl; alpha is theirs to keep. */
export function formatLike(original: string, c0: Okla): string {
  const c = toGamut(c0)
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
export function formatCssColor(c0: Okla): string {
  const c = toGamut(c0)
  const [r, g, b] = (oklchToRgb(clamp01(c.L), Math.max(0, c.C), c.H) as [number, number, number]).map((v) =>
    Math.round(Math.min(255, Math.max(0, v))),
  ) as [number, number, number]
  if (c.a >= 0.999) return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  return `rgb(${r} ${g} ${b} / ${Math.round(c.a * 1000) / 1000})`
}

/** sRGB channels on 0..1 plus the hex, for exports that name a colour space
 *  (the W3C token format asks for components, not a string). Same parser. */
export function toSrgb(c0: Okla): { components: [number, number, number]; alpha: number; hex: string } {
  const c = toGamut(c0)
  const raw = oklchToRgb(clamp01(c.L), Math.max(0, c.C), c.H) as [number, number, number]
  const ch = raw.map((v) => Math.min(1, Math.max(0, v / 255))) as [number, number, number]
  const round = (v: number) => Math.round(v * 10000) / 10000
  return {
    components: [round(ch[0]), round(ch[1]), round(ch[2])],
    alpha: Math.round(c.a * 1000) / 1000,
    hex: '#' + ch.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join(''),
  }
}

/** Shortest hue delta, in degrees, from `from` to `to` (−180..180). */
export function hueDelta(from: number, to: number): number {
  let d = to - from
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}
