# Decisions — UISandbox sprint 1 (2026-08-17)

Short, with the reason. Add to this file when a decision costs something.

1. **Identity by construction, not by comparison.** Every literal in their CSS
   becomes `var(--us-vN)` and the root block defines `--us-vN` as that literal.
   Nothing turned = nothing changed, provably; `verify.ts` measures it anyway
   (raw vs identity build, computed styles per element, 18 properties). Found a
   real gap on the first real build (see 5) — the instrument earned its keep on
   day one.

2. **Values are RELATIVE to the baseline, they snap to nothing.** The knobs at
   their stand → `buildTokens` → baseline. A knob move is a delta (hue rotation,
   L/C shift, a ratio for radius/space/type, a blur ratio for shadow) applied to
   THEIR literal. Their scale keeps its shape; the knobs bend it. The one
   exception: their exact brand hex becomes the new `--k-primary` exactly — a
   visitor who picks Rose expects Rose.

3. **The rewriter is a byte-preserving text splice, not a parser.** Selectors,
   order, specificity, comments and browser-tolerated hacks stay as they were.
   Skipped on purpose: `@font-face`, `@keyframes`, at-rule preludes, `url()`,
   strings, keywords, `0`, `%`, pill radii (≥100px), and anything that already
   reads a `var()`.

4. **The service worker serves, the page owns.** Files never leave the tab; the
   worker asks the page for each one over a MessageChannel. Root-relative URLs
   their build wrote (`/assets/x.css`) are resolved to the sandbox the requesting
   document lives in (client URL, then referrer). Live vars are injected into
   every HTML response so first paint has them; later changes are written into
   the frame's `<style id="us-vars">` directly (same origin).

5. **Never hoist a value that references THEIR variable to `:root`.**
   `box-shadow: inset 0 0 0 1px var(--accD)` as a `--us-vN` on `:root` resolves
   `--accD` on `:root`, where a theme-scoped variable is undefined → the whole
   shadow computes to `none`. Measured by the 1:1 check on a real Vite build.
   Inner literals (`#000` inside the shadow) are still tokenised; the whole is
   left in place when a foreign `var(` remains.

6. **Neutrals follow the brand at half strength.** The engine's `neutral: auto`
   tints greys toward the brand; their greys carry a tint already, so we add
   half of the engine's chroma delta, and rotate the hue only for greys that
   have one (C ≥ 0.004). A pure grey takes the tint hue outright.

7. **Fonts: body vs display from where they are used.** A family whose every
   site is a heading-ish selector (`h1`–`h6`, `.title`, `.hero`…) is display;
   everything else is body; mono is left alone. The knob is identity until it
   leaves their family; then the token's stack, and the frame gets the webfont
   (`@import` for Google, `@font-face` on the blob URL for an upload).

8. **Chrome is static.** The panel's `--app-*` and the few `--k-*` it composes
   are constants (set once from the default kit). The knobs are for THEIR app in
   the frame; our shell must not move when a knob does.

9. **The flyout is portalled and fixed beside its row.** A short viewport
   scrolls the menu column; an absolutely positioned child could never escape
   that column's overflow. Closes on scroll/resize; clamps to the viewport.

Known gaps carried forward: CSSOM `insertRule` (speedy CSS-in-JS), SPA route
enumeration, cross-origin stylesheets, iOS render, MCP shell.

## Hold-out round 1 (2026-08-17, five public repos vs. their live sites)

Method: computed-style census (10 props × every element) of the LIVE page in
one tab, the same census of the sandbox frame, diffed; plus the in-app 1:1
check (raw vs identity). Repos: water.css, Simple.css, SB Admin 2 (Bootstrap
admin), Bootstrap 5.3 docs (getbootstrap.com), react-gh-pages (CRA build).
Findings, all fixed and pinned by a test:

10. **`.9em` → `0.9em` counted as "moved".** A numeric no-op now keeps the
    author's spelling (`fromPx(px, unit, original)`), so identity is byte-identity.
11. **A near-brand literal snapped to the brand at rest** (`#0d47a1` next to a
    `#10489e` brand — Simple.css v1/v2 accents). The "exact brand → new token"
    shortcut fires only after the knob has actually moved.
12. **Font families lost their quotes** — `"Font Awesome 5 Free"` unquoted is
    invalid CSS and the icons fell back to Nunito (SB Admin 2). Normalisation
    keeps the author's quoting.
13. **The baseline chose an icon font as body font** (declaration count).
    Icon fonts are excluded; the family on `body`/`html` wins.
14. **Subresource Integrity dropped the rewritten CSS** (getbootstrap.com's
    docs). `integrity` is stripped from `<link>` in both variants — a transport
    guarantee, not a style; the raw control had drifted from its own hash too.
15. **A brand declared as `--bd-accent` beat `--bs-primary`** in the audit.
    A variable named `primary`/`brand` in the built CSS now outranks the audit.
16. **Sub-path deploys rendered blank** (CRA `homepage`, gh-pages project
    sites): `/react-gh-pages/static/…` → retried with leading segments stripped.
17. **Caching sandbox assets by URL served the REWRITTEN sheet to the RAW
    control** (same root-relative URL, different sandbox). Everything is
    `no-store`; the raw control was unstyled until this was found.
18. **The 1:1 check pairs elements by a stable path key**, not by position, so
    ads/widgets that differ between two loads are reported as unpaired instead
    of refusing the page (Bootstrap home: 1191 paired, 1 unpaired, 0 diffs).
19. **`loadHidden` waits for every `<link rel=stylesheet>` to have a sheet**
    before comparing — `load` can fire while a worker-served sheet is pending.

Instrument note: in the automation browser, form controls' computed style is
frozen at first paint (an inline `!important` cannot move it, live or sandbox) —
the census excludes them. Live-vs-sandbox differences that remained were all
viewport-dependent (`vw`/`vmin` sizes) or version drift (repo ≠ deployed page).

## Hold-out round 2 (2026-08-17, Next.js static export + Tailwind v4 · Astro blog · styled-components production build)

Built locally from the official starters (no public repo ships these builds);
compared raw vs identity in the sandbox. Findings, fixed and pinned:

20. **CSSOM rules were invisible** — styled-components/Emotion in production
    insert every rule through `insertRule` (14 rules, 0 characters of text).
    `hookScriptTag()` is injected before their bundle and wraps `insertRule` /
    `replace` / `replaceSync`; each rule goes through the SAME rewriter in the
    parent (`host.rewriteRuleFor`), new variables are defined in that frame at
    once, and the app re-maps on a coalesced tick. Raw keeps no hook.
21. **A CSS-wide keyword INSIDE a value** (`font: 600 14px inherit`) is invalid
    and dropped by the browser; rewritten with a var() it parses and fails at
    computed-value time = `unset` — a different result. Never rewritten (#7).
22. **The baseline is corrected by the screen and by the grown sheet**, only
    while every knob still stands on it: body font = the family most WORDS are
    set in (Next's `globals.css` says Arial, every paragraph is Geist), heading
    font from h1–h3; brand/radius/fonts from rules that arrived at runtime.
    Provenance reads the live baseline, so badges stay honest.
23. Error pages (`404`, `_not-found`) are not screens; inline `<style>` counts
    as CSS; build-tool hashes are dropped from font labels (`Atkinson-c7f4…`).

Result: Next/Tailwind v4 (2 screens), Astro (8 screens) and styled-components
all verify 1:1 with 0 differences; the brand knob reaches insertRule'd rules live.

## Hold-out round 3 (2026-08-17, MUI/Emotion + react-router · Lit/Shadow DOM · redirect pages)

24. **A sandbox document opens at its REAL path** — `/projects?__sb=<sid>` —
    and the worker BINDS the resulting client to the sandbox (public/sw.js
    `boundClients`, then referrer, then the last bound sandbox for framed
    navigations). Under `/__sb/<sid>/index.html` a BrowserRouter matched no
    route (7 elements, nav only); now it sees `/` and `/projects` as deployed.
    `/__sb/<sid>/…` still works. The hook script carries the sid.
25. **SPA screens come from the rendered page's links** (`discoverRoutes`:
    same-origin, extension-less `<a href>`), plus a pin button for the route the
    frame is on. The archive cannot list an SPA's routes; the page can.
26. **Emotion (MUI) rules arrive through the same insertRule hook** — brand
    `#6d28d9` read from them; `/projects` verifies 1:1.
27. **Lit's adopted stylesheets** go through the `replaceSync` hook; custom
    properties inherit into shadow roots, so nothing more was needed for the
    render — but the 1:1 check now WALKS shadow roots (`allElements`, keys
    cross the boundary as `host>#shadow>…`).
28. **A `<meta http-equiv=refresh>` page is not a screen** (Bootstrap's docs
    /about redirects to getbootstrap.com and the frame left the origin); the
    stage says so when a frame navigates away.

## Hold-out round 4 (2026-08-17, Tailwind Play CDN · Svelte + Vue scoped · lazy routes · the round-trip)

29. **Channel triplets are colours.** Tailwind v3 and the Play CDN write every
    colour as `rgb(124 58 237 / var(--tw-bg-opacity))`; Bootstrap declares
    `--bs-primary-rgb: 13,110,253`; shadcn `--primary: 222.2 47.4% 11.2%`.
    All were skipped as "already tokenised" — the brand of a Tailwind site was
    unreachable. Now the channels are the literal, kept in their own notation
    (`rgb-triplet` with its separator, bare `hsl:` marker that never reaches
    CSS), and mapped values print back in that notation.
30. **New variables are defined in the frame the instant the observer rewrites
    a runtime `<style>`** (`defineNewVars`, shared with the CSSOM hook). In the
    gap before React's next render every rewritten rule was invalid, and the
    baseline sampled "Times" as the body font. Same fix as #20, other path.
31. **The paint decides a weak brand once**: area-weighted chromatic
    backgrounds (buttons/links ×3, full-page backgrounds excluded), only when
    the code does not DECLARE a brand and only on the first screen — the tag's
    text colour lost to the button on Svelte and Vue; a later screen whose only
    button is the secondary must not re-decide (MUI /settings did, once).
32. **Their files, patched in place** (`rewriteCss` in `values` mode; Export →
    "Your files, patched"): the same scanner writes the CURRENT value at the
    exact span, so a `12px` radius becomes `0px` while a `12px` padding becomes
    `9px` — the find-and-replace list could not tell them apart. A chosen font's
    `@import` is prepended (after `@charset`), or the patched site would fall
    back to sans-serif. Runtime literals set from JS stay on the patch list for
    the developer.
33. **A colour that comes back the same 8-bit rgb+alpha in another spelling is
    identity** (`rgba(0,0,0,.05)` was reported "moved" to `rgb(0 0 0 / .05)`).
34. **The round-trip holds**: knobs turned (rose · radius none · compact ·
    Manrope) → patched files → the "next release" loaded raw → census diff
    against the knob-turned sandbox: 0 differences on 61 elements × 8 props;
    the patched build reads its own brand and font back. What you see is what
    you get. (`scripts/roundtrip-acme.ts` regenerates the patched fixture.)
35. Two NUL bytes had crept into `table.ts` key strings — consistent for `add`,
    so invisible until `find`. Cleaned; a reminder that a diff of bytes is a
    thing worth looking at when a lookup "cannot" fail.
