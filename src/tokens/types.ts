
/* Color theme preset — pure brand colors (3 hex values: primary, secondary,
 * accent). Decoupled from Style so every Style works with every Color theme.
 *   mono   → greyscale, no chroma (special — shown above divider in picker)
 *   cobalt → mineral blue
 *   jade   → mineral green
 *   ember  → glowing coal, warm orange/red
 *   coral  → reef pigment, pink/magenta
 *   indigo → deep purple-blue pigment */
export type ColorTheme =
  | 'mono'
  | 'cobalt'
  | 'sky'
  | 'teal'
  | 'jade'
  | 'indigo'
  | 'violet'
  | 'coral'
  | 'rose'
  | 'ember'

export type ColorMode = 'mono' | 'tone'
export type Mode = 'light' | 'dark'
// Removed 'pill' as a global radius — applying 999px to every surface (cards,
// dialogs, inputs) always produces an off-balance UI. Always-round elements
// (badges, status dots, slider tracks, progress bars) hardcode their own
// 999px regardless of this setting.
export type Radius = 'none' | 'subtle' | 'soft' | 'round'

// Button corner radius. 'match' (the default) FOLLOWS the global Radius so
// buttons and inputs/cards line up — the shadcn/Linear norm. The absolute
// values are explicit opt-OUTs for deliberate divergence: a pill button on a
// soft-corner card is a valid combo (think Airbnb: round cards, pill CTAs),
// or square buttons on rounded cards. 'none' = square.
/** Density (user-facing label; internal name kept as `Stature`/`stature`) —
 * the macro decision before all others. Cascades to --k-space, button/input/
 * toggle defaults, date picker cell size, row grammar default. ONE knob,
 * whole UI follows.
 *
 * Scale — ONE axis for the interface's SIZE + DENSITY. Replaces the former
 * Style + Density/Stature controls: drives control heights, --k-space and
 * row/toggle/cell sizing. Does NOT touch font-weight (UI weight is a fixed
 * system constant — keeping weight out of Scale avoids overlap with the
 * typography controls), nor Text size, radius, borders, depth or motion —
 * those are their own controls. 3 steps, default in the middle (one tighter,
 * one roomier) — the industry-standard density set (= Material 3's three named
 * tiers, = shadcn sm/default/lg control heights 32/36/40). Each tier maps onto a
 * real premium product so every step is independently polished:
 *    compact     → Linear / Cursor — dense pro-tool, small (32px controls)
 *    default     → shadcn / Stripe — clear and normalised, DEFAULT (36px)
 *    comfortable → Notion — calm, roomy, reading-friendly (40px)
 * (A 4th "spacious" tier was dropped: no premium-app ships controls beyond ~40px;
 * it inflated buttons/spacing and was the only tier with off-grid values.) */
/** Which bar the kit must clear.
 *
 * The only control in the panel that is not about how the kit LOOKS. AA is the
 * legal floor — EN 301 549 harmonises WCAG 2.1 AA and that is what the European
 * Accessibility Act enforces. AAA is not "better compliance", it is a different
 * bar that a few criteria can be raised to, and NL Design System raises exactly
 * two: 2.4.13 focus appearance and 2.5.5 target size. Defaulting to AAA would
 * claim a level the law does not ask for and inflate every kit to suit one
 * audience; hiding it would leave that audience unable to reach their own
 * baseline at any setting. So it is a choice, and it is the first one. */
export type Conformance = 'aa' | 'aaa'

export type Scale = 'compact' | 'default' | 'comfortable'
/* Text size — S/M/L/XL scales the whole 6-tier type scale (h1/h2/h3/body/
 * small/eyebrow) proportionally. md is the sensible default (body 14, nav 14,
 * h3 16 — aligned with shadcn/Material's 14px UI floor). */
export type TypeScale = 'sm' | 'md' | 'lg' | 'xl'
/** Label case — the UI-chrome label tier (eyebrows, table heads, tab/nav + button
 *  labels): 'sentence' = as-authored; 'caps' = uppercase + tracking (the industrial
 *  / terminal look). Body text, page headlines and numbers never transform. */
export type LabelCase = 'sentence' | 'caps'
/** Display weight — the heading/headline font-weight. 'semibold' is the house
 *  default (headings 600, hero 700). 'light' is the Stripe-style ultralight headline;
 *  'bold' the loud end. Only the display tier follows it; body + UI labels don't. */
export type DisplayWeight = 'light' | 'regular' | 'medium' | 'semibold' | 'bold'
export type IconSet = 'hairline' | 'line' | 'rounded' | 'bold' | 'solid'
/* UI text weight is a fixed system constant (semibold) — no control, not driven
 * by Scale or Text size. UI_WEIGHTS (fonts.ts) is the lookup; this stays as the
 * vocabulary for that table. */
export type UiWeight = 'medium' | 'semibold' | 'bold'
export type Elevation = 'flat' | 'soft' | 'sharp' | 'default'
/* Border prominence — its OWN control (pulled out of Surface depth): how visible
 * the 1px box edge is, as a tint on the neutral ladder. 4 steps centred on the
 * default 'subtle'. Independent of depth so a Layered card can still have a
 * quiet edge (or a Flat card a clearer one). */
export type Borders = 'faint' | 'subtle' | 'medium' | 'strong'
export type Motion = 'none' | 'snappy' | 'smooth' | 'playful'
/* Tempo — multiplier on the durations chosen by `motion`. Snappy reads
 * pro-tool fast, Generous reads consumer-app considered. Together with
 * motion this lets the user dial speed without giving up the curve. */
export type MotionTempo = 'snappy' | 'normal' | 'generous'
/* Curve character — which easing family populates --k-ease / -out / -in.
 *  standard   = current shadcn/Tailwind default (cubic-bezier(.4,0,.2,1))
 *  emphasized = Material 3 emphasized — slow-then-fast accelerate, decisive
 *               decelerate. Used for primary state changes, dialog enters.
 *  spring     = mild overshoot on decelerate — playful, Apple-style. */
export type MotionCurve = 'standard' | 'emphasized' | 'spring'
/* (The former StateLayer / "Emphasis" control was removed — hover/selected
 * overlay intensity is now a fixed subtle constant in buildTokens. The
 * --k-state-* tokens are still emitted + overridable in exports.) */
/* Background — contrast of the surface grey ramp (soft = flat canvas, crisp =
 * separated layers). Exposed in the panel as "Background". */
export type Contrast = 'soft' | 'balanced' | 'crisp'
/* Canvas — the PAGE background (--k-bg): white · a whisper brand tint · a
 * whisper neutral tint · or the brand gradient mesh. Exported as --k-bg and
 * usable tactically behind key blocks (a KPI strip, a hero). 'neutral' is the
 * house default (the muted near-white that makes crisp white cards pop). */
/* The page ground. `gradient` was removed with the gold-standard pass: it was the
 * only setting in the whole foundation whose output is not a COLOUR but three
 * layered radial stops, which means the contrast of text over it differs per
 * pixel. Our own pair-table could not read it (it scored the base as black and
 * "found" body text at 1.08:1 on ten theme/mode combinations), and more to the
 * point a value we cannot state in the contract is a value we cannot put in an
 * accessibility declaration. The whole proposition is provable, and a gradient
 * page is the one knob that is only defensible-in-practice. */
export type Canvas = 'white' | 'brand' | 'neutral'
/* === Interaction states (H2) — now a fixed house formula, no controls =====
 * Hover/selected/press are ONE neutral wash at stepped alphas. The two former
 * dials (States intensity · State tint) were removed: every benchmark (shadcn/
 * Radix/Linear/Vercel/Tailwind UI) bakes ONE subtle NEUTRAL wash and exposes
 * neither a global intensity nor a global tint. We bake the same:
 *   alpha  = whisper (0.05); selected steps +0.05, press +0.10.
 *   source = the Neutrals ramp ([t.h, t.s]) — so the wash temperature follows
 *            the Neutral control (auto/cool/warm) for free.
 * The --k-state-* tokens are still emitted + overridable in exports. */
/* Neutral temperature. 'auto' (default) tints the grey ladder toward the BRAND
 * hue — the Linear/Vercel "the greys carry a whisper of the brand" trick, pure
 * OKLCH. cool/neutral/warm are explicit overrides; mono falls back to pure grey. */
/* TWO, not four (2026-08-15). The real question a house style asks is "do my
   greys carry my brand, or stay neutral" — one line, and defensible to a buyer.
   Cool and warm were taste on top of taste: anyone who genuinely needs a warm
   grey sets a warm brand hue and 'auto' derives it. */
export type Neutral = 'auto' | 'neutral'
/* Harmony — how the DERIVED color family (secondary · accent · decoratives ·
 * the neutral tint) relates to the brand hue. Two continuous dials (H1):
 *   spread     0–180  — hue rotation of the derived family, in degrees.
 *                       PRIMARY NEVER ROTATES (our deliberate deviation from
 *                       M3 Expressive): the user's brand color stays the brand
 *                       color; the dial only governs the relatives. 0 = mono-
 *                       chrome family, 60 = M3-TonalSpot (tertiary +60°),
 *                       180 = complementary accent.
 *   expression 0–200  — chroma multiplier (%) on the derived family INCLUDING
 *                       the neutral surface tint (chromatic surfaces at the
 *                       high end — the M3-2025 "Expressive" direction).
 * The named modes are PRESETS of those two dials (see HARMONY_PRESETS in
 * harmony.ts); 'custom' = the dials were moved by hand. */
export type Harmony = 'mono' | 'tonal' | 'complement' | 'expressive' | 'custom'
/* Decorative palette character — the 6-swatch set used for charts AND the
 * decorative layer (avatars, category tiles, cover art, preload placeholders).
 * Exposed as --k-accent-1..6 (flat) + --k-accent-N-ink + --k-grad-1..6
 * (gradient pairs); --k-chart-1..6 share the same colours.
 * All three are MULTI-HUE and derived from (not copies of) the brand hue, so
 * avatars / chart series get distinct colours:
 *   pastel = soft & light · bright = Material-style clear/legible/modern ·
 *   vivid = saturated & punchy. All three rotate with the brand colour. */
/* Surface — the STRUCTURE of how every contained/separated surface (fields,
 * menus, popovers, the sidebar seam) distinguishes itself from its background.
 * One axis, three archetypes (= shadcn's three field states, generalised). It
 * replaces the over-specific "Sidebar/chrome" control. Border (faint→strong)
 * tunes the INTENSITY of whatever line each mode uses; Elevation = the LIFT
 * (shadow). Those stay separate — Surface never touches shadow or button/tab
 * component choice (scope kept tight on purpose).
 *  outlined → a box drawn by a border (+ a light recessed fill). For the sidebar
 *             this is the flush-with-a-hairline-seam look (the clean default).
 *  filled   → a box drawn by the tonal fill, border transparent. Sidebar = a
 *             sunken recessed well (--k-chrome-bg = surf.sunken).
 *  plain    → no box: a single bottom hairline (underline) on fields, radius 0;
 *             seamless menus/sidebar that lean on the shadow. Linear/Vercel-clean.
 * Drives --k-field-* + --k-menu-* tokens + --k-chrome-bg. */
/* 'plain' removed (2026-08-15). It took the boundary off a field, which is the
   thing WCAG 1.4.11 is about. The floor kept it legal, so this is a positioning
   argument rather than a compliance one — but it was the one setting in the
   panel that let a reader of our conformance report then take the edge off their
   own inputs. Outlined vs filled is a real style choice; "no boundary" is not. */
export type Surface = 'outlined' | 'filled'

/* Elevation — purely the SHADOW LADDER: how much surfaces lift off the page.
 * Decoupled (June 2026) from the neutral-ramp contrast (now owned by Borders +
 * Surface) — so changing Elevation only changes shadow, never the grey ramp.
 * 3 honest steps (the old 'raised' duplicated 'soft'; collapsed). Shadows
 * auto-tint toward the brand. Does NOT touch app-chrome or border prominence.
 *   flat → Linear/Vercel: ZERO shadow (the border carries it)
 *   soft → shadcn/Stripe: subtle two-layer shadow (DEFAULT)
 *   deep → Notion/Material: real drop shadows.
 *   (Contrast/Elevation are INTERNAL resolution types, not user-facing.) */
export type SurfaceDepth = 'flat' | 'soft' | 'deep'

export type Hex = string

import type { Dials } from '../sandbox/dials'

export interface Config {
  /** The sandbox's own dials — continuous, centred on THEIR code (see sandbox/dials.ts). */
  sb: Dials
  /* Orthogonal preset axes (#184 May 2026): Style = form/shape language
   * only, ColorTheme = 3 brand hex values only. The two are picked
   * independently in the panel; helpers in stylesAndThemes.ts apply the
   * underlying tokens. Typography (fonts + scale + UI text micro-decisions)
   * is a third independent axis exposed via individual controls. */
  colorTheme: ColorTheme
  color: ColorMode
  radius: Radius
  /* Scale — interface size + presence macro (drives sizing, spacing AND UI
   * weight; replaces Style + Density + the separate UI-weight control). */
  scale: Scale
  conformance: Conformance
  typeScale: TypeScale
  labelCase: LabelCase
  fontDisplay: string
  fontBody: string
  iconSet: IconSet
  /* Surface depth macro — purely elevation (shadow + ramp contrast); see
   * SurfaceDepth. */
  surfaceDepth: SurfaceDepth
  /* Surface separation structure — outlined/filled/plain; see Surface. Replaces
   * the old over-specific "chrome" (Sidebar) axis. */
  surface: Surface
  /* Border prominence — standalone (see Borders). */
  borders: Borders
  /* Single brand hue. Secondary + accent are DERIVED from this in buildTokens
   * — one color in, a harmonious family out (shadcn/Linear model). */
  cPrimary: Hex
  /* Harmony dials (H1) — see the Harmony type. `harmony` is the preset label
   * the panel shows; `spread`/`expression` are the actual continuous values
   * buildTokens consumes (presets are just (spread, expression) pairs). */
  harmony: Harmony
  spread: number
  expression: number
  neutral: Neutral
  /* Page canvas / background — see Canvas. Drives --k-bg (exported). */
  canvas: Canvas
  /* Fill — the tactical tint for the SUMMARY BAND (the one top-of-screen
   * state-at-a-glance zone: KPI strips, hero metric, amount card). Same palette
   * as Canvas; drives --k-fill (exported). House rule: apply only to the focal
   * summary block, never to working surfaces (tables/forms/lists stay white). */
  /* The summary-band wash (--k-surface-fill) — the ONE focal block per screen.
   * Typed as Canvas but only ever 'brand': no panel row sets it, randomKit does
   * not roll it, and every Style preset takes the base value. Three values, one
   * reachable. Kept as a field rather than hard-coded because it IS a real token
   * a consumer may override in their own CSS — but it is no longer pretending to
   * be a configurator choice. */
  fill: Extract<Canvas, 'brand' | 'white'>
  mode: Mode
}

export interface SystemColor {
  k: 'success' | 'warning' | 'danger' | 'info'
  hex: Hex
  soft: Hex
}

export interface Tokens {
  mode: Mode
  primaryHex: Hex
  secHex: Hex
  accentHex: Hex
  iconSet: IconSet
  sysList: SystemColor[]
  vars: Record<string, string | number>
  cc: { primaryOnBg: number; inkOnPrimary: number }
}

