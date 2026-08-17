# Knobs research — which of the 14 stay, go, or come (2026-08-17)

Three tracks, one question: is the foundation panel (inherited from UIcockpit,
built to configure OUR kit) the right knob system for someone tinkering with
THEIR app in the sandbox?

1. **Measured** on twelve real builds (`scripts/knob-effect.ts`): per knob, the
   share of their sheet values that move; and a census of literal-bearing CSS
   properties we do not tokenise.
2. **Surveyed** twenty token editors / theme configurators (tweakcn, shadcn,
   Realtime Colors, Material Theme Builder, Radix Themes, Tailwind v4, Figma
   variables, Tokens Studio, Mantine, Chakra/HyperTheme, DaisyUI, Coolors,
   Huemint, uicolors, Panda, WordPress theme.json, Webflow, Framer, Squarespace,
   Wix Studio, Geist/Untitled).
3. **Audited** each knob's path from `cfg` → `buildTokens` → the tokens
   `mapping.ts` actually reads → the kind it moves in their CSS.

## 1. What each knob does to THEIR app (measured, 12 builds, 1,628 values)

| knob | share of their values that move | path | verdict |
|---|---|---|---|
| Scale (compact/comfortable) | **27.9 %** | `--k-space` ratio on spacing **and** `--k-type-h1/body` on headings | strong — but two knobs move type (§3) |
| Brand | **26.4 %** | brand/secondary/accent families + neutral tint | strong |
| Neutrals | 14.6 % | grey tint hue/chroma (half delta) | weak-but-real |
| Background (canvas white) | 9.1 % | light greys ride `--k-bg` L | weak; **`canvas: brand` = 0 % and BREAKS neutral mapping** (color-mix unparsed → guard fails) |
| Text size | 8.5 % | `--k-type-body` + step ratio | strong |
| Elevation | 6.4 % | `--k-shadow-md` blur/alpha ratio | strong where shadows exist |
| Radius | 4.9 % (none) / 3.7 % (round) | `--k-radius-md` ratio | strong (few literals per site, all the right ones) |
| Harmony spread | 3.7 % | secondary/accent families | only if they have non-brand hues |
| Body font | 1.6 % | family entries, role body | strong (1–7 literals, but the whole page) |
| **Display font** | **0.0 %** | role `display` needs heading-only families — no real site had one | **dead in practice** |
| Harmony (preset) | 0.0 % | | dead on these builds |
| Conformance | 0.0 % | only kit control heights | **dead** |
| Label case | 0.0 % | `--k-label-transform/-tracking`, unmapped | **dead** |
| Surface | 0.0 % | `--k-field-*`, unmapped, kit concept | **dead** |
| Border | 0.0 % | `--k-border`, unmapped | **dead** (obvious fix) |

Literal-bearing declarations we do **not** tokenise (counts across the 12):
`width` 1827 · `font-weight` 985 · `height` 596 · `opacity` 456 · `max-width` 433
· `line-height` 350 · `transition` 174 · `border-width` 146 · `min-height` 82 ·
`letter-spacing` 44 · `text-transform` 39 · `animation-duration` 22.
(width/height/max-width are layout — leave them; the rest are design values.)

## 2. What the field exposes (survey)

Global knobs present in ≥ 3 tools, by frequency: **dark/light mode** (~14) ·
**corner radius** (10) · **per-role colours** primary/secondary/accent + status
(8) · **spacing base / density** (7 — Radix `scaling 90–110 %`, Tailwind
`--spacing`, Mantine `scale`) · **heading + body fonts** (7) · **shadow
strength** (5) · **letter-spacing** (6) · **type scale / base size** (4) ·
**border width** (3) · **contrast level** (3) · **line-height** (5).

Common elsewhere, missing from our 14: letter-spacing, line-height, dark-mode
toggle, status colours (success/warning/danger/info) and secondary/accent as
direct pickers, border width, type-scale *ratio*.

Ours that no comparable tool exposes as a global: Label case; Harmony
spread/expression dials (others use named variants); Surface/Background/Border
as three separate top-level knobs; Conformance as a *setting* (others badge or
offer a contrast level).

Continuous vs preset: the strongest analogue for "×1.0 = as in your code" is
Radix `scaling` (100 % centre) / Mantine `scale` / Tailwind `--spacing`;
tweakcn does radius/spacing/tracking/shadow as fine sliders (.01–.025 steps)
with typed input; radius keeps snap presets almost everywhere.

## 3. Couplings that would surprise someone editing THEIR app (audit)

- **Scale moves headings** (`HIER_CONTRAST` 0.85/1/1.08 into `--k-type-h1`,
  which `mapFontSize` reads for the step ratio) — density and text size both
  move type.
- **Neutrals `auto` and Harmony `expression` re-tint greys** when Brand moves.
- `canvas: 'brand'` emits `color-mix(...)`, which the colour parser cannot read
  → `nBg` null → the whole neutral-lightness branch stops (bug).
- `guardedBorders` can never fire (no `surface: plain` in the panel).
- Shuffle rolls fields the panel can't see (canvas/labelCase/conformance) and
  moves colour and harmony as triples under one lock.

## 4. Recommendation

**Drop (kit concepts, dead in their app):** Label case · Surface · Conformance
(keep contrast as a *badge/check*, not a knob) · Harmony preset row (keep spread
as a dial only if we add secondary/accent pickers; else drop). Display font
stays only if we give it a real path (see below).

**Fix (small, makes a dead knob strong):**
- Border → `--k-border` delta on low-chroma colours *used in border/outline
  props* (site prop is already recorded); plus tokenise `border-width` (146
  literals) so Border can also be a width dial.
- Background → parse `color-mix` (or emit a flat oklch for `canvas: brand`);
  route their page/surface backgrounds (bg props, high L) through `--k-bg`.
- Display font → not by literal but by *selector*: apply the display family to
  headings (`h1–h6`, `[class*=title|heading|hero]`) as an injected rule — the
  one place a semantic override is honest, because "which font do headings use"
  is a real question in every app.
- Decouple: Scale must not move type (drop `HIER_CONTRAST` from the mapping's
  step ratio; keep body/step in Text size only). Neutrals `auto` → default
  `neutral` in the sandbox so Brand moves only chromatic families.

**Add (present in the field, literals present in their CSS):**
- **Line-height** dial (350 literals) and **letter-spacing** dial (44 + the
  ex-Label-case tracking) — new kinds `line-height`, `letter-spacing`.
- **Font weight** — 985 literals; a "weight" dial (−1/0/+1 step) is the most
  requested-and-cheapest missing knob.
- **Border width** (with Border), **motion** (durations: 196 literals) as
  ×0/×1/×2, **status colours** as direct pickers (success/warning/danger/info
  families already classified as `keep` — give them a picker each),
  **secondary/accent** pickers instead of Harmony maths.
- **Dark-mode toggle** — only when their CSS carries a scheme
  (`prefers-color-scheme` / `[data-theme]`): flip by emulating the scheme
  in the frame is impossible, but toggling their own `[data-theme]`/class
  hook is cheap when present. Show the knob only then.

**Shape of the controls:** continuous dials with snap points and **×1.0 =
your code** at the centre (Radix/Mantine pattern) for radius · spacing · text
size · line-height · letter-spacing · weight · shadow · motion; pickers for
brand · secondary · accent · status · fonts; a stateless "as in your code" dot
at rest, "changed" after. Undo/redo, shuffle (only over knobs that exist) and
reset-to-your-code stay.

Resulting panel (proposal, 14 → 15, but every one moves their app):
Brand · Secondary · Accent · Status (4 mini pickers) · Neutrals · Background ·
Border (colour + width) · Display font · Body font · Text size · Line-height ·
Letter-spacing · Weight · Spacing · Radius · Elevation · Motion · (Dark mode
when present).
