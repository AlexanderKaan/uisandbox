/**
 * Colour distance for the audit's near-duplicate detection.
 *
 * ── Why this file exists (and why it is hand-written) ────────────────────────
 * The cockpit already has OKLCH maths in `cockpit/src/tokens/color.ts`, but that
 * is TypeScript inside the app and this package is deliberately ZERO-DEPENDENCY
 * (it ships `bin`/`src`/`README.md` and nothing else). So there is no way to
 * import it, and pulling in a colour library would break the property that makes
 * `init`/`check` cheap to run via `npx`.
 *
 * That means a SECOND colour implementation exists in this repo — exactly the
 * duplication the audit briefing forbids for regexes. The mitigation is the same
 * one we demand elsewhere: it is pinned by the official **Sharma CIEDE2000 test
 * vectors** (`test/colorspace.test.mjs`), including the hue-wrap cases that a
 * naive implementation gets wrong. Two implementations that are both green on
 * shared vectors may coexist; two that never test each other may not.
 *
 * ── What "near-duplicate" means ──────────────────────────────────────────────
 * ΔE00 < 2 is roughly a just-noticeable difference. Two colours that close were
 * not *decided* to be different — that is evidence, not opinion. The metric and
 * the threshold are emitted in `--json` so anyone can recompute the number.
 */

import { TW_DEFAULTS, TW_DEFAULT_VERSIONS } from './tw-palette.mjs'

export const METRIC = 'CIEDE2000'
export const NEAR_DUPE_THRESHOLD = 2.0

/* ─────────────────────────────── parsing ─────────────────────────────────── */

const HEX_RX = /^#([0-9a-f]{3,8})$/i

/** Tailwind's grey ramps. Grey near-dupes across ramps (`gray-500` vs
 *  `zinc-500`) are the single most common finding in AI-generated UI, so the
 *  five ramps are resolvable. Other palette names are counted as events but are
 *  NOT ΔE-compared in v1 — stated here rather than silently skipped. */
export const TW_GRAYS = {
  'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb', 'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280', 'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-800': '#1f2937', 'gray-900': '#111827', 'gray-950': '#030712',
  'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0', 'slate-300': '#cbd5e1', 'slate-400': '#94a3b8', 'slate-500': '#64748b', 'slate-600': '#475569', 'slate-700': '#334155', 'slate-800': '#1e293b', 'slate-900': '#0f172a', 'slate-950': '#020617',
  'zinc-50': '#fafafa', 'zinc-100': '#f4f4f5', 'zinc-200': '#e4e4e7', 'zinc-300': '#d4d4d8', 'zinc-400': '#a1a1aa', 'zinc-500': '#71717a', 'zinc-600': '#52525b', 'zinc-700': '#3f3f46', 'zinc-800': '#27272a', 'zinc-900': '#18181b', 'zinc-950': '#09090b',
  'neutral-50': '#fafafa', 'neutral-100': '#f5f5f5', 'neutral-200': '#e5e5e5', 'neutral-300': '#d4d4d4', 'neutral-400': '#a3a3a3', 'neutral-500': '#737373', 'neutral-600': '#525252', 'neutral-700': '#404040', 'neutral-800': '#262626', 'neutral-900': '#171717', 'neutral-950': '#0a0a0a',
  'stone-50': '#fafaf9', 'stone-100': '#f5f5f4', 'stone-200': '#e7e5e4', 'stone-300': '#d6d3d1', 'stone-400': '#a8a29e', 'stone-500': '#78716c', 'stone-600': '#57534e', 'stone-700': '#44403c', 'stone-800': '#292524', 'stone-900': '#1c1917', 'stone-950': '#0c0a09',
  white: '#ffffff', black: '#000000',
}

/**
 * The CSS named colours.
 *
 * Not decoration: a hand-written stylesheet is full of them. Measured on a
 * plain-HTML sheet, seven of eleven colours were `navy`, `blue`, `purple`,
 * `grey`, `silver`, `lightgray`, `red` — and every one of them failed to
 * parse, which put it in the `keep` family: frozen while the hex colours next
 * to it moved. Turning the hue dial on such a page shifted half of it.
 *
 * `white` and `black` were already reachable through TW_GRAYS, which is why
 * the gap read as "some colours do not move" rather than "none do".
 *
 * `currentColor` is deliberately absent: it has no value of its own.
 */
export const CSS_NAMED = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff',
  beige: '#f5f5dc', bisque: '#ffe4c4', blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2',
  brown: '#a52a2a', burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff',
  darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9',
  darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b', darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000',
  darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b', darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493',
  deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff',
  firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22', fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4',
  indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6',
  magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd',
  mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
  midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5',
  navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23',
  orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98',
  paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9',
  peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080',
  rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee',
  sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090',
  slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c',
  teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee',
  wheat: '#f5deb3', whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
}

/**
 * oklch() → sRGB. Tailwind v4 writes its entire palette in oklch, so without
 * this the resolution chain would read the theme and still not be able to paint
 * a single swatch.
 *
 * Unlike a hardcoded palette table — where every one of ~242 entries is an
 * independent chance to be silently wrong — this is one transform with known
 * anchors (white, black, sRGB primaries), so it is verifiable. Coefficients are
 * Ottosson's OKLab matrices; the tests pin them.
 */
export function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3

  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
  return lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055
    return Math.round(Math.max(0, Math.min(1, c)) * 255)
  })
}

/**
 * sRGB → OKLCH — the inverse of oklchToRgb, same matrices, so a round trip is
 * exact to rounding (the tests pin it). Used to group a ramp's shades into ONE
 * hue family: Tailwind builds its ramps at near-constant OKLCH hue (blue 260°,
 * indigo 277°, violet 293°…), so hue is the honest axis on which `indigo-500`,
 * `indigo-600` and `indigo-700` are one decision and `blue-500` is another.
 */
export function rgbToOklch(r, g, b) {
  const lin = [r, g, b].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) })
  const [R, G, B] = lin
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  const C = Math.hypot(a, bb)
  const H = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
  return [L, C, H]
}

/** Strip a Tailwind opacity modifier: `zinc-200/80` is still zinc-200. */
export const stripAlpha = (name) => String(name).replace(/\/[\d.]+%?$/, '')

/**
 * Parse a CSS colour into [r,g,b] 0–255, or null when we can't. Null means
 * "skip in near-dupe", never "pretend it matched".
 *
 * `palette` is the resolved design-token palette for the repo under audit
 * (Tailwind's theme, the project's own @theme overrides) — see resolvePalette().
 */
export function parseColor(input, palette = null) {
  if (typeof input !== 'string') return null
  const s = input.trim().toLowerCase()

  if (palette) {
    const named = palette[stripAlpha(s)]
    if (named && named !== s) return parseColor(named, null)
  }

  /* shadcn/ui writes its tokens as BARE HSL components — `--primary: 95.08
   * 71.08% 67.45%` — and wraps them at the point of use with hsl(var(--primary)).
   * Without this, every shadcn codebase looks like it declares no brand at all:
   * documenso's --primary (a lime green) failed to parse, so the scan fell
   * through to --sidebar-primary and reported their product as indigo. Since
   * shadcn is the dominant convention in exactly the codebases this tool is for,
   * that one gap mis-read a whole class of app.
   *
   * The shape is specific enough to be safe: a hue number, then two percentages,
   * nothing else. */
  const bareHsl = s.match(/^(-?[\d.]+)(?:deg)?\s+(-?[\d.]+)%\s+(-?[\d.]+)%$/)
  if (bareHsl) return parseColor(`hsl(${bareHsl[1]} ${bareHsl[2]}% ${bareHsl[3]}%)`, null)
  /* And the RGB twin of that convention — Tailwind's `<alpha-value>` idiom:
   * `--immich-primary: 66 80 175`, wrapped as rgb(var(--immich-primary) / 0.5)
   * at the point of use. Three integers 0–255, nothing else; immich's brand
   * (#4250af) was invisible for want of it, and the reader confidently reported
   * the docs site's colour instead. */
  const bareRgb = s.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/)
  if (bareRgb) { const p = [bareRgb[1], bareRgb[2], bareRgb[3]].map(Number); return p.every((n) => n <= 255) ? p : null }


  const ok = s.match(/^oklch\(([^)]+)\)$/)
  if (ok) {
    const p = ok[1].split(/[\s,/]+/).filter(Boolean)
    const L = p[0].endsWith('%') ? parseFloat(p[0]) / 100 : parseFloat(p[0])
    const C = parseFloat(p[1])
    const H = parseFloat(p[2]) || 0
    return [L, C].every(Number.isFinite) ? oklchToRgb(L, C, H) : null
  }

  const hex = s.match(HEX_RX)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }

  const rgb = s.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map((v) =>
      v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : parseFloat(v))
    return p.length === 3 && p.every(Number.isFinite) ? p : null
  }

  const hsl = s.match(/^hsla?\(([^)]+)\)$/)
  if (hsl) {
    const p = hsl[1].split(/[\s,/]+/).filter(Boolean)
    const h = parseFloat(p[0]), sat = parseFloat(p[1]) / 100, l = parseFloat(p[2]) / 100
    if (![h, sat, l].every(Number.isFinite)) return null
    return hslToRgb(h, sat, l)
  }

  const grey = TW_GRAYS[stripAlpha(s)]
  if (grey) return parseColor(grey)
  const css = CSS_NAMED[stripAlpha(s)]
  if (css) return parseColor(css)
  return null
}

/**
 * Build the palette for the repo under audit, most specific source winning:
 *   1. the project's own `@theme` / `:root` custom properties (a project that
 *      overrides `emerald` means ITS emerald, not Tailwind's)
 *   2. the Tailwind build actually installed in that repo — that version's
 *      exact numbers, read from node_modules
 *   3. the defaults Tailwind SHIPS for the generation the repo is on
 *      (`generation` = 'v4' | 'v3', decided by the audit from the CSS it read:
 *      `@import "tailwindcss"` / `@theme` → v4, `@tailwind base` → v3), from
 *      src/tw-palette.mjs — GENERATED from Tailwind's published files, never
 *      typed. Pass `null` to opt out (a test that wants a name unresolved).
 *   4. our grey ramps, as the last resort
 *
 * A shallow clone, a folder dropped in the browser and a Phoenix app whose
 * Tailwind is a standalone binary all have no node_modules — and each of them
 * writes `bg-indigo-600` meaning exactly what Tailwind means by it. Before (3)
 * existed no Tailwind colour could compete for the brand in any of those cases:
 * plausible's 29 `indigo-600` lost to three literal green chart fills.
 *
 * @param {Record<string,string>} cssVars  custom properties seen while scanning
 * @param {Record<string,string>} [installed]  name → colour, from node_modules
 * @param {'v3'|'v4'|null} [generation]  which shipped defaults to fall back to
 */
export function resolvePalette(cssVars = {}, installed = {}, generation = 'v3') {
  const defaults = generation && TW_DEFAULTS[generation] ? TW_DEFAULTS[generation] : {}
  const palette = { ...TW_GRAYS, ...defaults, ...installed }
  // `--color-emerald-500: oklch(...)` → `emerald-500`
  for (const [k, v] of Object.entries(cssVars)) {
    const m = k.match(/^--color-(.+)$/)
    if (m && v) palette[m[1]] = v.trim()
  }
  return palette
}
export { TW_DEFAULTS, TW_DEFAULT_VERSIONS }

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255].map((v) => Math.round(Math.max(0, Math.min(255, v))))
}

/* ───────────────────────── sRGB → linear → XYZ → Lab ─────────────────────── */

const toLinear = (v) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** D65 reference white (the sRGB illuminant). */
const WHITE = [95.047, 100.0, 108.883]

export function rgbToXyz([r, g, b]) {
  const R = toLinear(r) * 100, G = toLinear(g) * 100, B = toLinear(b) * 100
  return [
    R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
    R * 0.2126729 + G * 0.7151522 + B * 0.0721750,
    R * 0.0193339 + G * 0.1191920 + B * 0.9503041,
  ]
}

const EPS = 216 / 24389
const KAPPA = 24389 / 27
const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116)

export function xyzToLab([x, y, z]) {
  const fx = f(x / WHITE[0]), fy = f(y / WHITE[1]), fz = f(z / WHITE[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Full pipeline: a CSS colour string → CIE Lab, or null if unparseable. */
export function toLab(input, palette = null) {
  const rgb = parseColor(input, palette)
  return rgb ? xyzToLab(rgbToXyz(rgb)) : null
}

/* ──────────────────────────────── CIEDE2000 ───────────────────────────────── */

const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI
const pow7 = (x) => x ** 7

/**
 * CIEDE2000 colour difference (kL = kC = kH = 1).
 * Pinned by the Sharma et al. reference vectors in test/colorspace.test.mjs —
 * in particular the hue-wrap pairs, which is where naive versions break.
 */
export function deltaE00([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2

  const G = 0.5 * (1 - Math.sqrt(pow7(Cbar) / (pow7(Cbar) + pow7(25))))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)

  const hp = (b, ap) => {
    if (b === 0 && ap === 0) return 0
    const h = deg(Math.atan2(b, ap))
    return h >= 0 ? h : h + 360
  }
  const h1p = hp(b1, a1p)
  const h2p = hp(b2, a2p)

  const dLp = L2 - L1
  const dCp = C2p - C1p

  let dhp
  if (C1p * C2p === 0) dhp = 0
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360
  else dhp = h2p - h1p + 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2)

  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2

  let hbp
  if (C1p * C2p === 0) hbp = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2
  else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2
  else hbp = (h1p + h2p - 360) / 2

  const T = 1
    - 0.17 * Math.cos(rad(hbp - 30))
    + 0.24 * Math.cos(rad(2 * hbp))
    + 0.32 * Math.cos(rad(3 * hbp + 6))
    - 0.20 * Math.cos(rad(4 * hbp - 63))

  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(pow7(Cbp) / (pow7(Cbp) + pow7(25)))
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2)
  const SC = 1 + 0.045 * Cbp
  const SH = 1 + 0.015 * Cbp * T
  const RT = -Math.sin(rad(2 * dTheta)) * Rc

  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH),
  )
}

/** Convenience: distance between two CSS colour strings, or null if either is
 *  unparseable (a var(), a palette name outside the resolved palette). */
export function colorDistance(a, b, palette = null) {
  const la = toLab(a, palette), lb = toLab(b, palette)
  return la && lb ? deltaE00(la, lb) : null
}

/* ───────────────────── generic near-duplicate clustering ──────────────────── */

/**
 * Group values whose pairwise distance is under `threshold` (single-linkage).
 * Used for all three near-dupe families — colour (ΔE00 < 2), length (< 1px),
 * shadow blur (< 2px) — by swapping the distance function.
 *
 * Returns clusters of size ≥ 2 only; a value alone is not a near-duplicate.
 */
export function clusterNear(values, distance, threshold) {
  const parent = values.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b }

  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const d = distance(values[i], values[j])
      if (d !== null && d < threshold) union(i, j)
    }
  }

  const groups = new Map()
  for (let i = 0; i < values.length; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(values[i])
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

/** Numeric px distance for the length/blur families. */
export function pxDistance(a, b) {
  const na = parseFloat(a), nb = parseFloat(b)
  return Number.isFinite(na) && Number.isFinite(nb) ? Math.abs(na - nb) : null
}
