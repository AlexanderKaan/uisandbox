import type { Hex, Neutral } from './types'

export type Hsl = [number, number, number]

export function hexToHsl(hex: Hex): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (mx + mn) / 2
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}

export type Oklch = [number, number, number] // L 0-1, C absolute, H degrees

/**
 * Accurate sRGB-hex → OKLCH using Björn Ottosson's matrices
 * (sRGB → linear → LMS → OKLab → OKLCH). OKLCH is the colour space the modern
 * field (Tailwind v4, shadcn, Radix) standardised on: it's *perceptually
 * uniform* — a fixed lightness step LOOKS like the same step across every hue,
 * which HSL cannot promise — and it can address the Display-P3 gamut. We author
 * palette values in HSL (tuned + WCAG-checked there) and emit in OKLCH.
 */
export function hexToOklch(hex: Hex): Oklch {
  const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const r = lin(parseInt(hex.slice(1, 3), 16) / 255)
  const g = lin(parseInt(hex.slice(3, 5), 16) / 255)
  const b = lin(parseInt(hex.slice(5, 7), 16) / 255)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const C = Math.sqrt(A * A + B * B)
  let H = (Math.atan2(B, A) * 180) / Math.PI
  if (H < 0) H += 360
  return [L, C, H]
}

/** OKLCH string emitter. L emitted as a percentage, C absolute (≈0–0.4),
 *  H in degrees. Optional alpha → `oklch(L% C H / a)`. */
export const oklch = (L: number, C: number, H: number, a?: number): string => {
  const Lp = (Math.max(0, Math.min(1, L)) * 100).toFixed(1)
  const Cs = Math.max(0, C).toFixed(4)
  const Hs = (((H % 360) + 360) % 360).toFixed(1)
  return a === undefined ? `oklch(${Lp}% ${Cs} ${Hs})` : `oklch(${Lp}% ${Cs} ${Hs} / ${a})`
}

/** Reverse of hexToOklch: OKLCH (L 0-1, C, H deg) → sRGB-hex. Used to run WCAG
 *  contrast on OKLCH-emitted values (and to verify the round-trip). */
export function oklchToHex(L: number, C: number, H: number): Hex {
  const hr = (H * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const enc = (v: number): string => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
    return Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')
  }
  return `#${enc(lr)}${enc(lg)}${enc(lb)}`
}

/**
 * The colour emitter. Inputs are an HSL triple (h 0-360, s/l 0-100) — the space
 * we author and WCAG-tune in — but the OUTPUT is OKLCH (same rendered colour,
 * P3-capable, perceptually-uniform syntax). Name kept because the INPUT contract
 * is still an HSL triple; only the emitted format changed (HSL → OKLCH).
 */
export const hsl = (h: number, s: number, l: number): string => {
  const [L, C, H] = hexToOklch(hslToHex(h, Math.max(0, s), Math.max(0, Math.min(100, l))))
  return oklch(L, C, H)
}

/** Translucent variant of `hsl()` — author HSL, emit `oklch(L C H / a)`. For the
 *  state-layer / selection washes that need an alpha channel. */
export const hslA = (h: number, s: number, l: number, a: number): string => {
  const [L, C, H] = hexToOklch(hslToHex(h, Math.max(0, s), Math.max(0, Math.min(100, l))))
  return oklch(L, C, H, a)
}

/** Parse an opaque `oklch(L% C H)` string back to hex (for readableInk on a
 *  ladder-derived tint). */
export const oklchStrToHex = (str: string): Hex => {
  const m = str.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)/)
  return m ? oklchToHex(parseFloat(m[1]!) / 100, parseFloat(m[2]!), parseFloat(m[3]!)) : '#000000'
}

/* ──────────────────────────────────────────────────────────────────────────
 * 12-step OKLCH ladder — the Radix-contract scale, generated natively in OKLCH
 * so the lightness steps are perceptually EVEN (a fixed step looks like the same
 * jump across every hue / mode — HSL can't promise that). Step number = role:
 *   1 app bg · 2 subtle bg · 3-5 component bg (rest/hover/active) ·
 *   6 subtle border · 7 interactive border + ring · 8 hovered border ·
 *   9 solid · 10 solid hover · 11 low-contrast text · 12 high-contrast text.
 * Our role tokens map onto fixed indices; swapping a hue can't break a layout
 * and dark mode is step-parity. L anchors are calibrated off Radix's gray/colour
 * scales (measured in OKLCH); chroma follows a curve that's quiet at the ends
 * and peaks at the solid. ── */

// OKLCH L anchors (0-1), index 0 = step 1.
// Step 12 (the text anchor → --k-fg) is near-black (0.16, was 0.244): primary
// titles/values/numbers now read crisp like shadcn/Linear (~0.15) instead of
// medium-grey. Muted (step 11, 0.503) + faint (step 9, 0.64) stay put so the
// three text tiers gain real separation. Surfaces/borders use steps 1-8, so
// this only crisps text (+ a hair on --k-track). [BEAUTY-SPEC §1.2]
const SCALE_L_LIGHT = [0.995, 0.98, 0.958, 0.937, 0.916, 0.892, 0.858, 0.8, 0.64, 0.605, 0.503, 0.16]
const SCALE_L_DARK = [0.176, 0.213, 0.254, 0.285, 0.317, 0.355, 0.423, 0.536, 0.64, 0.693, 0.775, 0.945]
// Chroma multipliers (× peak). Quiet backgrounds → peak at the solid (9) → ease
// back for text. Neutrals pass a tiny peak so this stays a whisper of tint.
const SCALE_C_ACCENT = [0.07, 0.13, 0.22, 0.33, 0.44, 0.55, 0.68, 0.84, 1.0, 0.97, 0.79, 0.55]
// Neutral chroma is QUIETEST at the light surface + border band (steps 1-8) and
// only carries real temperature in the dark text steps (11-12). A border (step 6)
// is light, so any chroma there reads as a coloured line — it must be the calmest,
// NOT a mid-curve peak (the old curve peaked 1.0 at steps 5-8 → blue/warm borders).
const SCALE_C_NEUTRAL = [0.4, 0.45, 0.5, 0.55, 0.55, 0.55, 0.6, 0.65, 0.8, 0.85, 1.0, 1.0]

/**
 * Neutral 12-step grey ladder. `tHue`/`tSat` are the Neutrals temperature (HSL),
 * carried through as a whisper of OKLCH chroma so greys are never dead-flat
 * `#808080` — the "premium tinted neutral" trick. Mono / zero-sat → pure grey.
 * `tintMul` (H1 Expression) scales the whisper: 0 = pure grey surfaces, 1 = the
 * calibrated default, up to 2 = perceivably CHROMATIC surfaces (the M3-2025
 * "Expressive" direction; absolute ceiling keeps a surface a surface).
 */
export function okNeutralScale(tHue: number, tSat: number, dark: boolean, mono: boolean, tintMul = 1): string[] {
  const L = dark ? SCALE_L_DARK : SCALE_L_LIGHT
  if (mono || tSat <= 0 || tintMul <= 0) return L.map((l) => oklch(l, 0, 0))
  const [, cRef, hRef] = hexToOklch(hslToHex(tHue, Math.max(tSat, 8), 50))
  // Cap LOW so even Cool/Warm neutrals stay a whisper — a tinted grey, never a
  // coloured surface. (Was 0.03 → borders read as a faint blue/warm line.)
  // Expression multiplies the whisper but a hard 0.04 ceiling keeps the most
  // expressive surface well under "this background is a color".
  const baseC = Math.min(Math.min(cRef * 0.65, 0.014) * tintMul, 0.04)
  return L.map((l, i) => oklch(l, baseC * (SCALE_C_NEUTRAL[i] ?? 1), hRef))
}

/**
 * Chromatic 12-step ladder anchored on an EXISTING solid colour. Step 9 (the
 * solid fill) is pinned to exactly `solidHex` — so a brand/accent/system main
 * that's already WCAG-tuned is preserved byte-for-byte — and the rest of the
 * ladder (pale backgrounds, hover, borders, text) is rebuilt around it on the
 * perceptually-even anchors. Light/dark pick the matching anchors (step-parity).
 * Returns 12 `oklch()` strings; index 8 == the solid.
 */
export function okAccentScale(solidHex: Hex, dark: boolean): string[] {
  const [Ls, Cs, Hs] = hexToOklch(solidHex)
  const L = (dark ? SCALE_L_DARK : SCALE_L_LIGHT).slice()
  L[8] = Ls // step 9 = the exact provided solid
  L[9] = dark ? Math.min(Ls + 0.05, 0.99) : Math.max(Ls - 0.05, 0.05) // step 10 hover
  return L.map((l, i) => oklch(l, Cs * (SCALE_C_ACCENT[i] ?? 1), Hs))
}

/** Six chart-series colors derived from ONE brand hue. The strategy controls
 *  how far the series spread around the wheel — from cohesive to categorical:
 *   - 'brand'     → tints of the single hue (sequential, cohesive)
 *   - 'analogous' → neighbouring hues (harmonious but distinguishable)
 *   - 'spectrum'  → wide spread (maximum categorical distinction)
 *  Mono (s === 0) collapses every strategy to a greyscale lightness ramp —
 *  there's no hue to spread. Returns 6 hsl() strings (chart-1 … chart-6). */
/**
 * Decorative / categorical palette — 6 swatches that drive BOTH charts AND
 * the decorative layer (avatars, category tiles, cover art, preload
 * placeholders). Returns, per swatch: a flat colour, a readable ink for text
 * on top of it, and a soft 2-stop gradient. Three characters:
 * All three are MULTI-HUE and derived FROM the brand hue (not copies of it) —
 * categorical/identity use (avatars, chart series) needs distinct colours,
 * never six tints of one hue.
 *   pastel → soft, light, low chroma (friendly / consumer)
 *   bright → Material-inspired: evenly spaced hues at a consistent tone +
 *            moderate chroma → clear, legible, modern (not neon)
 *   vivid  → saturated, deeper tone (bold / punchy)
 * Mono / zero-saturation themes collapse every character to a neutral ramp.
 * Anchored on the brand hue so the whole set rotates when the brand colour
 * changes — no more disconnected magic-hex gradients.
 */
/* ONE STRATEGY (2026-08-15). The Palette knob offered pastel/vivid/bright, and
 * measuring it settled the question: pastel and vivid differ only in saturation
 * and lightness — which is what `expression` already scales — so they were two
 * controls on one axis. `bright` was the odd one out for a different reason: its
 * distinction was evenly-spaced 60-degree hues, and hue GEOMETRY belongs to
 * Harmony, which already owns it.
 *
 * So the geometry is the organic set, and expression now carries the full range:
 * at 1 it is the old vivid, and as it falls the family lightens toward what
 * pastel used to be. Folding saturation alone would have lost that lightness,
 * which is most of what made pastel feel different. */
export function paletteSet(
  h: number,
  s: number,
  mono: boolean,
  dark: boolean,
  harmony?: { spreadFactor?: number; exprMul?: number },
): { base: string[]; ink: string[]; soft: string[]; softFg: string[]; grad: string[] } {
  /* Harmony dials (H1). spreadFactor scales the hue offsets: 1 = the calibrated
   * full-wheel set (Spread 60° — the Tonal default, byte-identical to before),
   * 0 = a single-hue family, >1 widens slightly (capped — the wheel is cyclic).
   * exprMul multiplies every saturation. */
  const factor = Math.max(0, Math.min(1.5, harmony?.spreadFactor ?? 1))
  const xm = Math.max(0, Math.min(2, harmony?.exprMul ?? 1))
  const soften = 1 - Math.min(1, xm)   // 0 at full colour, 1 at none
  const xs = (v: number): number => Math.min(96, Math.round(v * xm))
  let hsls: Array<[number, number, number]>
  if (mono || s === 0 || xm === 0) {
    const ls = dark ? [78, 68, 58, 49, 40, 32] : [30, 42, 52, 61, 70, 78]
    hsls = ls.map((l) => [h, 0, l])
  } else {
    /* Saturated multi-hue at full expression; lightening toward the old pastel
       tone as expression falls, so ONE dial spans what two knobs used to. */
    const dh = [0, 42, 96, 168, 220, 292]
    const baseL = dark ? 56 : 54
    const softL = dark ? 56 : 80                     // where pastel used to sit
    hsls = dh.map((d, i) => [
      (h + d * factor) % 360,
      xs(dark ? 74 : 76),
      baseL + (softL - baseL) * soften - (soften > 0.5 && !dark && i % 2 ? 3 : 0),
    ])
  }
  if (!(mono || s === 0 || xm === 0)) {
    // Low Spread collapses the hues together — restore CATEGORICAL distinction
    // by blending each swatch's lightness toward the mono ramp in proportion
    // to the lost spread: at Spread 0 the set is a clean sequential light→dark
    // family of ONE hue (avatars/chart series stay tellable-apart), at the
    // default it's untouched.
    if (factor < 0.999) {
      const ls = dark ? [78, 68, 58, 49, 40, 32] : [30, 42, 52, 61, 70, 78]
      hsls = hsls.map(([H, S, L], i) => [H, S, L + ((ls[i] ?? L) - L) * (1 - factor)])
    }
    // Dislike guardrail: a rotated swatch must never land on the dark
    // saturated yellow-green "bile" zone (see dislikeFix).
    hsls = hsls.map(([H, S, L]) => dislikeFix(H, S, L))
  }
  // Distinction order — Material's categorical rule: consecutive swatches
  // should be FAR apart in hue, so a 2/3-series chart (or adjacent avatars)
  // never reads as one cohesive arc. ORDER picks every-other hue first
  // (accent-1/2/3 ≈ thirds of the wheel). Mono keeps its light→dark ramp.
  if (!(mono || s === 0)) {
    const ORDER = [0, 2, 4, 1, 3, 5]
    hsls = ORDER.map((i) => hsls[i] as [number, number, number])
  }
  const base = hsls.map(([H, S, L]) => hsl(H, S, L))
  // Perceptual ink (relative-luminance based) — fixes white-on-yellow/green
  // at high lightness, where a raw L threshold picks the wrong polarity.
  /* aaInk, not readableInk. readableInk is a LUMINANCE THRESHOLD (>0.42 → dark
   * ink), which is a perceptual guess and not a contrast check: an accent
   * sitting just under the line takes white at 3.6:1. Measured on the default
   * kit, the avatar ramp produced seven such failures. aaInk makes the same
   * perceptual pick and then verifies it, flipping polarity when it cannot make
   * AA — the docstring on it says this is exactly what derived, rotated hues
   * need, and the avatar ramp is derived and rotated. */
  const ink = hsls.map(([H, S, L]) => aaInk(hslToHex(H, S, L)))
  // Soft chip pair (Material container / on-container): a light tint and a
  // DEEP, contrast-safe hue for icons/text on top of it. Guards the
  // legibility of light hues (yellow/green) used as a foreground colour.
  //
  // CHARACTER-AWARE: the tint deepens + saturates with the character's
  // intensity, so Pastel / Bright / Vivid produce VISIBLY different chips.
  // (Previously fixed at L93 + min(S,64) → Bright & Vivid collapsed to the
  // SAME chip and Pastel was nearly identical, so everything using -soft —
  // quick-action chips, avatars, badges — ignored the palette character.)
  // softFg stays a contrast-safe L30 ink (light mode) / L82 (dark); the
  // deepest light chip is Vivid at L87, which still clears 4.5:1 against L30.
  /* The soft-chip tier follows expression the same way the base family does:
     at full colour it is the old Vivid chip, and it lightens as expression falls.
     softFg stays a contrast-safe ink, and the sweep proves the pair holds at
     every point on the dial rather than at three named stops. */
  const softL = dark ? 26 + 6 * soften : 87 + 7 * soften
  const softSCap = 80 - 22 * soften
  const soft = hsls.map(([H, S]) =>
    hsl(H, mono || s === 0 ? 0 : Math.min(S, softSCap), softL))
  // on-container INK deepens in step with the container so text/icons stay
  // legible as the chip gets richer (Vivid's deeper chip → darker ink). Keeps
  // badge/pill TEXT — not just graphical glyphs — comfortably above AA.
  const softFgL = dark ? 82 : 22 + 6 * soften   // ink lightens with its chip
  const softFg = hsls.map(([H, S]) =>
    hsl(H, mono || s === 0 ? 0 : Math.min(S + 10, 84), softFgL))
  const grad = hsls.map(([H, S, L]) => {
    const partner = hsl((H + 18) % 360, Math.max(S - 6, 0), Math.min(L + (dark ? 10 : 12), 92))
    return `linear-gradient(135deg, ${hsl(H, S, L)}, ${partner})`
  })
  return { base, ink, soft, softFg, grad }
}

export function hslToHex(h: number, s: number, l: number): Hex {
  const H = h / 360
  const S = s / 100
  const L = l / 100
  const f = (n: number): string => {
    const k = (n + H * 12) % 12
    const a = S * Math.min(L, 1 - L)
    const c = L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/* Every hex-expecting entry point goes through here, which makes it the one
 * place worth guarding.
 *
 * `Hex` is `string`, so TypeScript cannot tell a hex from an oklch string, a
 * `var(--x)` or a `color-mix(...)`. Hand it one of those and `parseInt` yields
 * NaN, `contrast()` returns NaN, and `NaN >= 3` is quietly false — a floor that
 * never engages while every test stays green. That exact failure shipped three
 * times: `ringFloored` never floored a ring for any kit, the primary-hover floor
 * did nothing on its first version, and `toHex` scored a gradient as black.
 *
 * So the silent path is closed. In dev and in tests this throws with the value
 * that reached it; in production it falls back to mid-grey rather than taking a
 * page down over a colour. Loud where it can be fixed, safe where it cannot. */
function assertHex(hex: string, fn: string): void {
  if (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)) return
  const msg = `${fn}() needs a 6-digit hex and got: ${String(hex).slice(0, 60)}`
  if (import.meta.env?.DEV || import.meta.env?.MODE === 'test') throw new TypeError(msg)
  else if (typeof console !== 'undefined') console.error(`[uicockpit] ${msg}`)
}

export function relLum(hex: Hex): number {
  assertHex(hex, 'relLum')
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number)
}

export const contrast = (a: Hex, b: Hex): number => {
  const l1 = relLum(a)
  const l2 = relLum(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export const readableInk = (hex: Hex): Hex => (relLum(hex) > 0.42 ? '#16160c' : '#ffffff')

/**
 * AA-guarded ink: readableInk's perceptual pick, but if that pick can't make
 * WCAG AA (4.5:1) against the fill, flip to whichever polarity contrasts more.
 * Needed since H1: harmonization/spread ROTATE derived hues, and near the
 * luminance threshold a rotated orange can flip readableInk to white at ~3:1
 * (white-on-amber). Status/derived fills route through this instead.
 */
export const aaInk = (hex: Hex): Hex => {
  const pick = readableInk(hex)
  if (contrast(hex, pick) >= 4.5) return pick
  // Flip ONLY when the other polarity actually clears AA — a flip to a merely
  // less-bad ink would churn calibrated visuals without buying compliance.
  const alt = pick === '#ffffff' ? '#16160c' : '#ffffff'
  return contrast(hex, alt) >= 4.5 ? alt : pick
}

/**
 * Dislike guardrail (M3's DislikeAnalyzer, ported to our HSL authoring space).
 * Peer-reviewed disgust research (Palmer & Schloss 2010): dark saturated
 * yellow-greens (the "biological waste" zone) are universally disliked. M3
 * fixes any color that lands there by lifting it to tone 70; we do the same on
 * DERIVED colors (accent, decorative swatches) — a Spread rotation should never
 * park the family on bile. The user's own brand hex is exempt (their call).
 */
export const dislikeFix = (h: number, s: number, l: number): [number, number, number] =>
  h >= 90 && h <= 111 && s > 16 && l < 65 ? [h, s, 70] : [h, s, l]

/**
 * Semantic harmonization (M3's Blend.harmonize): rotate a fixed semantic hue
 * (success/warning/danger/info) TOWARD the brand hue by half the angular
 * distance, capped at 15°. Keeps the status colors unmistakably themselves
 * while making them family with the brand — the reason M3 semantics never
 * clash with any seed. Always-on machinery, not a dial.
 */
export const harmonizeHue = (h: number, toward: number): number => {
  const d = ((toward - h + 540) % 360) - 180 // signed shortest-path delta
  const rot = Math.min(Math.abs(d) / 2, 15) * Math.sign(d)
  return (h + rot + 360) % 360
}

/**
 * Pick a lightness for a brand primary that guarantees button-text-on-primary
 * passes WCAG AA (4.5:1). Iterates down from requestedL until contrast clears.
 *
 * Some popular brand hues (Spotify green, Cloudflare orange, Facebook blue at
 * full saturation) fall in the "mid-luminance" zone where white text doesn't
 * have enough contrast — this picker darkens just enough to escape that zone,
 * preserving as much brand character as possible.
 */
export function clampToAA(hue: number, sat: number, requestedL: number): number {
  for (let l = requestedL; l > 8; l--) {
    const hex = hslToHex(hue, sat, l)
    const fg = readableInk(hex)
    if (contrast(hex, fg) >= 4.6) return l
  }
  return 25
}

// Explicit neutral-temperature overrides. 'auto' is resolved from the brand hue
// in buildTokens (not a fixed entry here), so this table only carries the manual
// cool/neutral/warm anchors.
export const TEMP: Record<Exclude<Neutral, 'auto'>, { h: number; s: number }> = {
  neutral: { h: 255, s: 3 },
}

const HUE_FAMILIES: Array<{ max: number; name: string }> = [
  { max: 14, name: 'Red' },
  { max: 30, name: 'Coral' },
  { max: 45, name: 'Orange' },
  { max: 60, name: 'Amber' },
  { max: 75, name: 'Yellow' },
  { max: 95, name: 'Lime' },
  { max: 150, name: 'Green' },
  { max: 170, name: 'Emerald' },
  { max: 190, name: 'Teal' },
  { max: 205, name: 'Cyan' },
  { max: 240, name: 'Blue' },
  { max: 265, name: 'Indigo' },
  { max: 290, name: 'Violet' },
  { max: 320, name: 'Purple' },
  { max: 345, name: 'Magenta' },
  { max: 360, name: 'Red' },
]

/* The CSS named colours for the light and grey end — the vocabulary every
 * browser knows ("Snow", "Ghost White", "Gainsboro"). A colour close to one of
 * these is called by that name; chromatic colours keep the descriptive names
 * ("Vivid Blue"), which say more about a brand than "Medium Slate Blue" would. */
const CSS_NEUTRALS: Array<[string, string]> = [
  ['White', '#ffffff'], ['Snow', '#fffafa'], ['Ivory', '#fffff0'], ['Floral White', '#fffaf0'], ['Ghost White', '#f8f8ff'],
  ['White Smoke', '#f5f5f5'], ['Sea Shell', '#fff5ee'], ['Old Lace', '#fdf5e6'], ['Linen', '#faf0e6'], ['Alice Blue', '#f0f8ff'],
  ['Honeydew', '#f0fff0'], ['Mint Cream', '#f5fffa'], ['Azure', '#f0ffff'], ['Lavender Blush', '#fff0f5'], ['Beige', '#f5f5dc'],
  ['Antique White', '#faebd7'], ['Lavender', '#e6e6fa'], ['Gainsboro', '#dcdcdc'], ['Light Gray', '#d3d3d3'], ['Silver', '#c0c0c0'],
  ['Dark Gray', '#a9a9a9'], ['Gray', '#808080'], ['Dim Gray', '#696969'], ['Light Slate Gray', '#778899'], ['Slate Gray', '#708090'],
  ['Dark Slate Gray', '#2f4f4f'], ['Black', '#000000'],
]
function nearCssNeutral(hex: Hex): string | null {
  const [, s, l] = hexToHsl(hex)
  if (s >= 8 && l < 90) return null // chromatic: descriptive names
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  let best: { name: string; d: number } | null = null
  for (const [name, h] of CSS_NEUTRALS) {
    const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const d = Math.max(Math.abs(r! - r2!), Math.abs(g! - g2!), Math.abs(b! - b2!))
    if (!best || d < best.d) best = { name, d }
  }
  // Within 3/255 per channel — the same colour for any eye; #fafafa is not White.
  return best && best.d <= 3 ? best.name : null
}

export function nameColor(hex: Hex): string {
  const [h, s, l] = hexToHsl(hex)
  const css = nearCssNeutral(hex)
  if (css) return css
  if (s < 8) {
    if (l < 10) return 'Near Black'
    if (l < 26) return 'Charcoal'
    if (l < 45) return 'Slate Gray'
    if (l < 62) return 'Gray'
    if (l < 80) return 'Light Gray'
    if (l < 94) return 'Mist'
    return 'Near White'
  }
  let fam = (HUE_FAMILIES.find((f) => h <= f.max) ?? HUE_FAMILIES[0]!).name
  // Coral is a LIGHT red-orange (#ff7f50); the same hue at full depth is what
  // people call vermilion (#ff4400) — "Coral" for it reads wrong on sight.
  if (fam === 'Coral' && l < 58) fam = 'Vermilion'
  let light = ''
  if (l < 22) light = 'Deep'
  else if (l < 38) light = 'Dark'
  else if (l > 82) light = 'Pale'
  else if (l > 66) light = 'Light'
  let sat = ''
  if (s < 32) sat = 'Muted'
  else if (s > 78 && l > 40 && l < 70) sat = 'Vivid'
  return [sat, light, fam].filter(Boolean).join(' ')
}
