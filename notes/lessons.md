# Lessons that transfer — distilled from UIcockpit's memory (2026-06 → 2026-08)

Short, in the order they matter for UISandbox. Each one was paid for.

## Tokens and knobs

- **A token that serves a FILL cannot also serve INK.** The a11y arc found body
  text at 1.08:1 on ten theme/mode combinations because one token did both.
  Every knob position must be swept against every floor (`knobSweep`): the
  "0 violations" headline once covered ONE configuration while claiming six.
- **Every knob must move something, and nothing may break a floor.** UIcockpit
  culled 19 knobs to 14: a knob that only makes you DIFFERENT rather than YOURS
  is a liability. Removed: Style, heading weight, motion, icon set, palette;
  Elevation was decoupled to shadow-only. Two knob families clashed
  (Scale × Text-size, surface-separation) — the answer was to COUPLE/CLAMP the
  combinations, not to remove knobs (`coherence.ts`).
- **The chrome adjusts a recipe THROUGH a token the recipe already reads, never
  by out-specifying it.** `@layer` was tried and measured: 1709 of 5390 elements
  moved. For UISandbox this becomes: override THEIR values through variables,
  never by fighting their cascade.
- **A token is SUBSTITUTED, not read.** Two classes of bug live in the gap a
  `var()` opens: the invalid shorthand (`animation: var(--x) backwards` when the
  token already ends in `both` → the browser drops the whole declaration; four
  components had never animated for anyone) and the ghost token (a `--k-s-40`
  that is never emitted → the whole `padding` shorthand invalid). Test with the
  REAL `buildTokens` output, never a mirrored table.
- **Tokens emit OKLCH.** Parse back with `oklchStrToHex()`; never compare raw
  hex to an oklch string (`NaN >= 3` is quietly false — bit us three times).

## The audit (the reader UISandbox tokenises with)

- **Coverage ≠ correctness.** The reader read 95 %+ of eight repos and was
  still wrong about the brand on fresh ones. Keep a hold-out with KNOWN answers
  from day one — and the truth that matters is the SCREEN of the running app,
  not the source. Four live repos are the meter now (mastodon · umami ·
  plausible · home-assistant), all exact.
- **Declared beats counted, per role.** A codebase that NAMES its identity
  (`--primary`, `$brand`, `theme.accent`) is believed over the most-used colour;
  reach (how often a token is referenced) beats name length. A docs site's
  theme (`--ifm-*`, `docs/`) never speaks for the app; a dark/contrast/override
  block never overwrites the base; a ramp's shades are ONE hue family.
- **A file cap enforced in directory-walk order is a cap at random.** n8n's
  budget ran out inside `packages/cli` and the whole frontend was never
  opened — the reader described a backend as a dark app. `selectFiles` ranks:
  stylesheets → components → rest. Keep that.
- **The answer depended on FILE ORDER once** (folder vs zip of the same repo →
  two brands). Ties break on the path now. Any intake you add must be
  order-independent.
- **`webkitdirectory` is a desktop affordance** — it does nothing on iOS/Android
  Chrome and cannot be feature-detected. A zip is not a convenience, it is the
  only intake a phone has. `readZip.ts` handles ZIP64 (past 65,535 entries a zip
  writes 0xFFFF as a marker; trusting it reads a fraction of a monorepo while
  still answering confidently).
- Tailwind names (`bg-indigo-600`) are colours only through a palette: the
  repo's own `--color-*` overrides > the installed build in node_modules >
  the shipped defaults for the generation the CSS declares (v3 hex / v4 oklch,
  GENERATED from Tailwind's published files — never hand-typed).

## Previews and instruments

- **The instrument is as likely to be wrong as the thing measured.** Impossible
  data (everything at exactly 0.00 %) means the meter is broken, not the
  subject. Include a CONTROL: a no-CSS page, a sentinel font, a known-good value.
- **A driver that cannot drive must throw.** The a11y matrix once set density by
  writing to an input that no longer existed, returned `false`, nobody read it,
  and "0 across 6 configurations" was 0 across two. Verify a witness moved.
- **Verify in the live DOM, not by assumption.** Scaled iframes report wrong
  widths; the rendered classes can differ from what the CSS expects.
- **`el.className` is not a string on an SVG element** (`SVGAnimatedString`) —
  740 SVG nodes were invisible to every DOM-reading gate. Read `getAttribute('class')`.

## Mobile (from the configurator study, 28 tools compared)

- Every serious token editor (tweakcn · Realtime Colors · Coolors · shadcn
  /create) keeps the **preview live on mobile**; a drawer that hides it is the
  outlier. Controls belong in a bottom sheet / edge bar OVER the live wall, with
  progressive disclosure. Showcases scale-to-fit.

## Product lessons

- **The "Your app" sandbox that was retired (2026-06).** It re-drew the visitor's
  app on OUR components with a model (block-board + Opus extraction). Retired
  for cost and focus. UISandbox is the inverse: their app, 1:1, values swapped —
  no model in the render path.
- **The moat was never the configurator.** Controlled experiment (Opus 4.8,
  seven agents, same screen): without a contract the model drifts on details
  (h1 26↔30, padding 32↔40) and defaults to its own indigo; with tokens = 0 raw
  values, exact. What holds is a checkable contract, not taste. For UISandbox:
  the export must be that contract — exact, exportable, checkable.
- Distribution that worked: one export engine → two tracks (agent-native
  MCP/CLI, and per-tool quick-paste for web builders); everything free.
