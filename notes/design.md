# The chrome's design system — one card language

The app around the sandbox (the "chrome") has its own quiet design system.
The sandbox shows THEIR design; ours must never compete with it. Everything
below is measured from the stylesheets (`src/styles/chrome.css`,
`src/styles/panel.css`); change those and this document together.

## Tokens (`:root`, dark under `prefers-color-scheme` + `[data-theme]`)

| token | light | dark | role |
|---|---|---|---|
| `--app-bg` | `#f4f5f8` | `#121216` | the canvas |
| `--app-surface` | `#ffffff` | `#1b1b21` | cards, pills, inputs |
| `--app-fg` | `#1a1a1d` | `#ececf1` | headings, primary text |
| `--app-fg-muted` | `#6b6b73` | `#a3a3ad` | body copy, values |
| `--app-fg-faint` | `#6e6e78` | `#8a8a96` | kickers, hints, captions (AA on bg) |
| `--app-border` | `#e3e5ea` | `#2b2b34` | hairlines, rings |
| `--app-hover` | black 4% | white 6% | hover fills, code chips |

Never a colour literal in a component rule; always a token. The footer is the
one deliberate exception (the brand's dark bar in both schemes).

## Type scale

| px | weight | use |
|---|---|---|
| 11.5 | 400 | fine print (footer, hints under inputs) |
| 12 – 12.5 | 400 | card body, chips, samples row, hero proof |
| 13 – 13.5 | 400–500 | panel rows, buttons, stage foot |
| **15** | **650, -0.01em** | **every card/dialog title** (popcard h3, dialog h2, privacy h3, MCP head) |
| 20 | 650 | landing section h2 |
| clamp(34–56) | 700, -0.03em | the hero H1 |

One title scale for every floating surface. A card heading is 15px/650 — no
card invents its own.

## Surfaces

- `.card` — surface, border, radius 12–16, `--app-shadow-sm`.
- `.popcard` — a card anchored to the stage (notes, 1:1, reach, warnings):
  width `min(480px, 90vw)`, padding **24px 26px**, title 15px, body 12.5px
  muted, actions row `margin-top: 14px`. On ≤560px it spans the viewport.
- `.dialog` — modal over a backdrop (Export): head row with title + icon-X.
- `.privacy` — fixed overlay card, padding 26/28, closable by Esc/backdrop/X.
- `.mcp__pop` — the flyout: same title scale, padding 20/22 (denser: it hangs
  from the top bar).
- The stages checklist (`.intake__stages`): `min(360px, 100%)` centred, NO
  border of its own — the card is the surface; a box inside a box is the
  tell of a component that missed the system.

## Buttons

- `btn--primary` — the one true action on a surface (Export, Choose a zip).
- `btn--secondary` — bordered on surface: **every Close/dismiss on a card**,
  Run again, Report this build, Everything (zip). A dismiss is a button, not
  grey text.
- `btn--ghost` — quiet chrome actions (topbar Read/Close, panel Reset).
- `btn--icon` — square icon-only (undo/redo, dialog X, panel collapse).
- `--sm` variant on cards and the top bar. Radius 8; pills (install, star,
  MCP) radius 999/8 at height 28.

## Dots and chips

- `fmrow__dot` 14px round: Brand shows the knob's own value; status/palette/
  background dots read the LIVE var (the page's truth). `--ring` for
  near-white, `--none` (hollow) when the CSS has no such family.
- `.chip` — stage-foot pills; `chip--ok` green dot, `chip--warn` amber.

## Motion

Durations `--app-dur(-md)`; ants/shimmer/corona/flow ~1.4–14s, all under
`prefers-reduced-motion: reduce` → none. Dots flow, nothing bounces.

## Rules that keep it one system

1. New floating surface? It is a `.popcard` or a `.dialog` — don't invent.
2. Title = 15px/650. Body = 12.5px muted. Fine print = 11.5px faint.
3. Dismiss = `btn--secondary btn--sm` labelled Close, or an icon-X top-right
   (dialogs/overlays) — never bare grey text.
4. Copy: plain sentences, colons and semicolons over em dashes; `·` as the
   separator in metadata rows and titles.
5. Every colour through a token; both schemes ride along automatically.
6. Padding: cards 24–28px, flyouts 20–22px; lists get `gap`, not `<br>`.
7. A panel that hands over a FILE says what to do with it, in two or three
   plain sentences, above the file (`.exp__how`: numbers in the flow, no box).
   A pane with a Copy button and no instructions only works for somebody who
   already knew, and they are not the one who needed the panel.
8. The wash behind an overlay is `--app-scrim`, never a mix of `--app-fg`.
   That variable is near-black in light and near-white in dark, so a backdrop
   built from it LIGHTENS the page in dark mode. The privacy card did exactly
   that and read as a grey haze. One token, defined per scheme (dark needs more,
   because a dim over an already dark page has less to work with).
9. A label may not promise more than the thing does. "Drop-in" on a stylesheet
   nothing references is a bug in the copy, not a shortcut — say what it is
   and point at the format that does land.
10. A row that REPORTS a setting is one line: the knob's name at a fixed 104px,
    then `from → to`. The two-line form (value on top, name under it, an icon
    tile beside) was tried and rejected — at this density the icons are noise
    and the arrow column stops lining up. A settings list is read by scanning
    the names, so the names hold the left edge.
11. The name in that row is the PANEL's name, read from `DIALS`, never spelled
    again at the reporting end. Splitting a config key on its capitals gave
    "Border Tone", "Grad Angle", "Sat" and "C Accent" for knobs the panel calls
    Border tone, Gradient angle, Saturation and Accent. A row nobody can find
    again is worse than no row.
12. And its unit is the dial's own. Weight moves in steps, hue and gradient
    angle in degrees, contrast and the tones in lightness; only the scales are
    multipliers. `×-1` for a weight one step lighter is not shorthand, it is a
    different claim.

