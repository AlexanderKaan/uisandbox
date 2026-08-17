# Traps — what cost real time in UIcockpit (verbatim from its CLAUDE.md, 2026-08-17)

> Read before building instruments, previews or token plumbing. Numbering and
> wording kept as-is; where a trap names UIcockpit files, read the PRINCIPLE.

## Traps (these have cost real time — read first)

1. **One source, no mirror (since the CDN Lane-A refactor).** Component CSS lives
   in ONE place: `src/kit/recipes/index.ts` (structured `Recipe[]`). `genCss.ts`
   bundles it into the export; `src/main.tsx` injects it into the live preview
   (`injectKit()`). Edit the recipe once — both surfaces update. The old
   `preview.css` + `componentRecipes.ts` mirror is **gone** (deleted). Pure
   scaffolding (gallery masonry, dashboard chrome, `.card__head/__row/__foot`,
   overlay scrollbars) lives in `src/styles/preview-only.css` (preview only). The
   global layer (keyframes/focus/disabled/::selection/validation) is single-sourced
   in `src/kit/globalLayer.ts` — `scope` param: `''` for export, `.cockpit-preview`
   for the preview (injected by `injectKit()`). Edit it once; both surfaces update.

2. **The preview element has NO view modifier class.** `Stage.tsx` renders bare
   `class="cockpit-preview"` for *both* views — so a `.cockpit-preview--gallery`
   selector would be **dead**. To target the **components wall only**, use
   `.cockpit-preview:has(.gallery)` (the app view has no `.gallery`).

3. **Gallery spacing is one concept in two adjacent CSS spots + JS:**
   - `.gallery` block (`--gallery-gap`, `grid`, `column-gap`, `grid-auto-rows: 1px`)
   - `.cockpit-preview:has(.gallery)` → wall padding = same `--gallery-gap`
   - the **masonry** `useLayoutEffect` in `ComponentGallery.tsx` computes each
     card's `grid-row-end: span N` from its measured height (vertical gap is baked
     into the span, NOT a `row-gap`). Touching gaps → check all three.

4. **Tokens emit OKLCH.** `hsl()` in `color.ts` authors in HSL but emits
   `oklch(...)` strings. Parse back with `oklchStrToHex()`. Don't compare raw hex.

5. **Dynamic class names** (`badge--${tone}`, `avatar--a${i}`, `card--${view}`)
   won't grep literally and the modifier-audit special-cases them — search the
   prefix, not the full class.

6. **🚨 THE INSTRUMENT IS AS LIKELY TO BE WRONG AS THE THING MEASURED.** The most
   expensive trap in this repo, hit roughly ten times in one arc. Every gate,
   probe and audit here has at some point reported confident nonsense. The tells,
   in order of how often they showed up:

   - **Impossible data, not merely surprising data.** Everything at exactly
     0.00%. A serif, a mono and four sans faces agreeing to the digit. Three
     known-good knobs reading dead. Surprising means think; *impossible* means
     your meter is broken. This caught more bugs than any other signal.
   - **A fallback that invents a plausible value.** `toHex()` returned
     `#000000` for anything it could not parse, so a `color-mix()` scored as
     black and body text "failed" at 1.08:1. `ringFloored` returned its input on
     the error path and had never floored anything.
   - **A comparison between incompatible types.** `Hex` is `string`; hand
     `contrast()` an oklch string and you get NaN, and `NaN >= 3` is quietly
     false. Bit us three times. `relLum()` now throws — keep it that way.
   - **A pass line narrower than the gate's name.** the old `audit:hit-target`
     printed "clean" over six real violations because it only inspected
     close/clear controls. Its docstring was honest; its output was not. (Retired
     in K; `a11y:matrix` measures every target.)
   - **Measuring the wrong surface.** A screenshot of the components wall cannot
     see chart colours below the fold, and a token test cannot see `iconSet`.
   - **Half a check.** The target-size scan measured height only and passed a
     30px-wide field. A target is an AREA.

   **The habit that works: include a control.** A no-CSS page, a sentinel font
   family, a known-good value. Two findings were withdrawn because the control
   reproduced them — a closed `<details>` and a `color-mix()` background. Without
   the control both would have shipped as bugs in our own kit.

7. **🚨 A TOKEN IS SUBSTITUTED, NOT READ — so a gate that reads SOURCE is blind
   to it.** Two whole classes of defect live in the gap a `var()` opens between
   what the CSS says and what the browser computes:
   - **The invalid shorthand.** `animation: var(--k-anim-scale-in, …) backwards`
     where the token already ends in `both` → two fill modes → the browser drops
     the declaration. `.lightbox`, `.toast`, `.popover` and `.navmenu__panel` had
     therefore NEVER animated, for anyone, including every consumer of the export.
   - **The ghost token.** `padding: 0 0 var(--k-s-24) var(--k-s-40)` where
     `--k-s-40` is never emitted and there is no fallback → the whole shorthand is
     invalid → `.processlist` had no left padding and its number badge sat on top
     of the heading, rendering "Send your application" as "end your application".
   Both are caught by `src/kit/__tests__/tokenSubstitution.test.ts`, which
   substitutes the **real** `buildTokens` output — never a mirrored table, which
   is how the originals were possible.

8. **The chrome adjusts a recipe THROUGH a token the recipe already reads —
   never by out-specifying it.** `injectKit` appends the kit AFTER the bundled
   stylesheets, so at equal specificity **the kit wins every tie**. A bare
   `.fmenu { gap: 0 }` over a composed `.card` is silently INERT. If the recipe
   has no hook for what you need, ADD one to the recipe (`--k-card-gap` exists
   because of exactly this).
   ⚠️ **`@layer kit` was tried and is WRONG — do not re-propose it.** Measured by
   toggling it on the live page: 1709 of 5390 elements moved, and
   `.topbar__icon-btn` (which composes `btn--ghost`) stopped being a ghost because
   the chrome's leftover background beat the modifier. The cascade is not the
   mechanism behind the duplication — the duplicate declarations are, and flipping
   the cascade only hands the win to the unreviewed copy.

10. **A GLOBAL CHANGE IS A MIGRATION, NOT AN ADDITION.** A `:where()` floor loses
   to whatever a component DECLARES — but what a component OMITS, the floor
   silently fills in, and every component omits something. `.toggle` never sets a
   height, so a `min-block-size: 40px` made a 36×20 switch 32×36; `.processlist__title`
   never sets a size, so a heading rule took it to 22px; `<th>` took
   `overflow-wrap: anywhere` and rendered SERVICE vertically. All three passed
   every gate, and all three were found by eye on a screenshot. Run
   `audit:shape` before and after anything that touches `globalLayer.ts` — and if
   you are adding a rule to the floor, exempt the repurposed element
   (`button:not([role])`), because an explicit `role` says this element is no
   longer doing its default job.
   ⚠️ **The card's `data-card` heading is human prose, so it is not an identity.**
   Four headings were duplicated on the wall and two unrelated cards shared a key.
   A card that anything measures per-component wants `docId` (its recipe id) →
   `data-recipe`. `audit:shape` fails loudly on a shared name rather than
   averaging over it.

11. **🚨 A DRIVER THAT CANNOT DRIVE MUST THROW.** `a11y-matrix` set the density by
   writing to `.fmrow input[type="range"]`. The panel was refactored to one row
   shape on 2026-08-15 and that input stopped existing. The setter returned
   `false`, nobody read it, and the matrix printed three density lines while
   measuring ONE density three times — so **"0 violations across 6
   configurations", the headline of the conformance report, was 0 across two**.
   Nothing was wrong with the page; everything was wrong with the instrument, and
   it looked exactly like success. Drive the panel through
   `scripts/lib/drive-panel.mjs`, which throws when it cannot find the control
   AND verifies a witness actually moved. ⚠️ Pick the witness carefully: the
   first one read `.cockpit-preview .btn`, and the first button on the wall is a
   `btn--sm` with its own height, so it sat at 28px through every density and the
   driver called its own successful click a failure. Watch the TOKEN the control
   moves.

12. **🚨 `el.className` IS NOT A STRING ON AN SVG ELEMENT.** It is an
   `SVGAnimatedString`, so `String(el.className)` yields
   `"[object SVGAnimatedString]"` and every SVG node reads as UNCLASSED. All six
   DOM-reading call sites in `scripts/lib/rules.browser.js` had this, plus the
   evidence generator: 740 SVG nodes on the wall were invisible, and with them the
   17 that carry a kit class — `.chart__svg`, `.sparkline`, `.sparkline__path`,
   `.sparkline--good`, `.stat-tile__spark`, `.rating__star--empty`. `audit:shape`
   had never measured a chart or a trend line. Use `classesOf(el)` (it reads
   `getAttribute('class')`, correct for both element kinds); there was never a
   reason to read `className` at all.

13. **Verify in the live DOM, not by assumption.** The preview MCP's
   `getBoundingClientRect` / `window.innerWidth` are **unreliable** (scaled iframe
   reports a tiny/wrong width). Use `preview_inspect` for computed styles, or
   `preview_resize` to a known width first. The rendered element's classes can
   differ from what the CSS expects (see Trap 2) — inspect before editing.

---

