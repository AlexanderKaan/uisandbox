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

## Round 5 — where the bar is (2026-08-17: iOS · Android · Flutter · Kivy · Raspberry Pi HMI · marketing site · WordPress · odd archives)

36. **The intake TRIAGES instead of refusing.** `platform.ts` names what was
    dropped (web-build · web-source · ios · android · flutter · qt · kivy ·
    python-gui · electron · unknown) and says whether it renders. A WordPress
    theme's `templates/index.html` is a block template, not a page: root
    detection is skipped for it.
37. **Non-web sources are tokenised by `sourceScan.ts`** into the SAME sheet:
    hex (quoted, between tags, bare) · `0xAARRGGBB` (alpha kept) · Android XML
    `#AARRGGBB` (ARGB!) · Swift `Color(red:green:blue:)` floats · xcassets
    components (`0x66` or `0.400`, each channel in its notation) · Kivy float
    tuples · `R.font.karla_regular` / `@font/x` / `Font.custom("X")` /
    `fontFamily:` · WordPress theme.json escaped families · W3C design-tokens
    JSON (the key names the role) · `cornerRadius(12)` / `RoundedCornerShape` /
    `BorderRadius.circular` / QML `radius:` · `fontSize`, `.sp`, `pixelSize`.
    Each span carries a PRINTER, so the patched export writes the value back
    in that file's notation. The identifier a colour is bound to
    (`md_theme_light_primary`, `colorPrimary`, a theme.json `slug`) is the
    site's `prop`, so `brandDeclared` hears it.
38. **Art is not palette**: `drawable*/`, `mipmap*/`, `ic_*.xml`, imagesets,
    SVGs are skipped — a launcher icon's orange was crowned the brand of
    compose-samples. Tests, mocks, fixtures, Preview Content too.
39. **The stage for what no browser draws is a values board** (`ValuesBoard`):
    every literal painted with its CURRENT value, labelled as a legend, never
    as their app. Knobs work; export writes the values back (patched files) and
    also as Swift + asset catalog and, new, Android `colors.xml` (+night) and a
    Compose `DesignTokens.kt`.
40. **Root switcher**: other index.html roots in an archive are one click away
    (a monorepo with `site-a/` and `site-b/dist/`); test/mock pages are not
    screens; a bare `index.html` zip works; images-only and empty zips fail
    with a sentence, not a stack.

Where the bar is, measured on real repos: web builds render 1:1 (16 hold-outs,
0 diffs); Electron/HMI shells render what the archive contains (MagicMirror:
its black shell, fonts served, modules need the server); iOS/Android/Flutter/
Kivy/WordPress/tokens-JSON tokenise-and-export with knobs on their stand but
NO render; a monorepo of many apps has no single brand (compose-samples) —
the knob is theirs to set; a design-tokens JSON alone is a valid input.
Not readable yet: system-colour references (`Color.blue`, `MaterialTheme.
colorScheme.primary`), Interface Builder .storyboard RGB, Qt stylesheets
(`.qss` — plain CSS, would work if the extension were allowed), PDF/Figma
files, nested zips, tar.gz.

## The door (2026-08-17, after round 5)

41. **Only what renders 1:1 comes in.** The values board for iOS/Android/
    Flutter/Kivy/WordPress was honest, but "a legend of your colours" is not
    "tinkering with your own app", and half a promise weakens the whole one.
    Non-renderable platforms are refused with one sentence each
    (`platform.refusalFor`): what we recognised, why no browser can show it,
    what would work (a Flutter WEB build, a static export). The source reader
    (`sourceScan.ts`), the Android/Swift exports and the tests stay as modules
    for a later "tokens without a render" track — deliberately not wired.
42. **A shell is called a shell.** After the first load, a screen with fewer
    than 6 elements, fewer than 3 style rules, or no visible text and no media
    gets a warning card at the bottom of the frame ("Is this the built app?").
    MagicMirror — a Raspberry-Pi HMI whose modules come from the server —
    renders a black page with 41 empty elements; the card says so.

43. **Screens: one searchable, folder-grouped picker** (`ScreenPicker`) instead
    of a tab strip — the same shape for 3 screens and for Bootstrap's 114.
    Type to filter, arrows + Enter, `[` / `]` step from anywhere; each entry
    labelled by origin (file · route found on a page · pinned); "pin current
    route" in its foot. A tab strip stops working around a dozen; a grouped
    list with search never does.

## The knobs, rebuilt for someone else's app (2026-08-17, after notes/knobs-research.md)

44. **Dials, ×1 = your code.** `sandbox/dials.ts` (inside `Config.sb`, so it
    rides the reducer, undo and share-hash): radius · spacing · text size ·
    line-height · letter-spacing (+em) · weight (±steps) · border width ·
    background tone · border tone · elevation · motion — continuous, with the
    old preset names as snap points and "as in your code" at the centre. The
    mapping reads the dial, not a token ratio (`scaleLength`, `mapShadow(x)`),
    which also removes the Scale→headings coupling.
45. **Colour roles from THEIR sheet.** `familiesOf(table, brand)`: brand by
    hue window; status by OKLCH hue windows (green/red/amber/blue); the two
    largest remaining hue clusters = secondary, accent; each family has a
    CENTRE (most-used member). A picker row appears only when the family
    exists; the pick moves every member by centre→pick delta (`mapByDelta`);
    the centre becomes the pick exactly.
46. **Neutrals by USE**: background tone moves light greys painted as
    backgrounds, border tone moves greys used in border/outline props, ink is
    left alone. Baseline `neutral` is 'neutral' in the sandbox (greys don't
    follow the brand unless "Grey tint: Follows brand" is chosen).
47. **New sheet kinds**: line-height (unitless too, and in the `font`
    shorthand), letter-spacing, font-weight (numbers, bold/normal, in `font`),
    border-width (own props and the first length of `border`/`outline`
    shorthands), duration (`transition`/`animation` and their `-duration`).
48. **Display font speaks by selector** — most apps set one family and let
    headings inherit, so there is no heading literal to move; the knob injects
    `h1–h6,[class*=title|heading|hero|display]{font-family: … !important}`
    (also into the patched export). The one honest semantic override.
49. **Gone**: Conformance, Label case, Surface, Harmony rows, per-row locks,
    saved slots, UIcockpit's `randomKit`; **Shuffle** now rolls only knobs that
    exist (`sandbox/shuffle.ts`, triangular around "as is"). `Panel.tsx`,
    `vizFactories`, `SavedKits`, `Seg` deleted.
50. **The badge**: a quiet dot at rest ("as in your code"), amber once turned
    ("changed"); the orange "your code didn't decide this" is gone — in the
    sandbox every knob at rest IS their code.
Measured (`scripts/knob-effect.ts`, 10 builds, 1,835 values): every knob moves
values on real builds; the sheet-only meter cannot see the display-font rule.

## Reach (2026-08-17)

51. **The per-knob percentage was a share of the whole sheet, not of what the
    knob can touch.** Split (`scripts/kind-share.ts`): every size dial already
    reached 100 % of its kind; colour was the gap — neutrals 49 % of colours
    (ink untouched), `keep` 8 % (chart palettes, gradients, illustration tints).
52. **Three global colour dials** — Hue (° for every chromatic colour, family
    or not), Saturation (× chroma), Contrast (± lightness stretch around the
    middle, greys and ink included) — applied AFTER the family mapping. 100 %
    of colours are now under some knob. Gamut by chroma reduction (`toGamut`),
    never per-channel clipping: a lime rotated +90° must land on its hue.
53. **CSS-drawn icons follow**: `url("data:image/svg+xml,…%23fff…")` becomes one
    `svg` entry whose colours are mapped through the same colour path and
    re-encoded (Bootstrap's chevrons, checks, close buttons: 19 on the home).
54. **Inline SVG presentation attributes** (`fill`, `stroke`, `stop-color`) are
    put under the knobs by the live observer with a `style` property that
    outranks the attribute (raw stays raw); currentColor/none/url(#) skipped.
55. **`@keyframes` are in** — var()-valued colours interpolate; a hard-coded
    pulse must not stay behind after a brand change.
56. **The reach meter** (`sandbox/coverage.ts`): on the rendered frame, painted
    colours/families/sizes/radii of visible elements are checked against the
    sheet's CURRENT values; images, canvas, video and raster backgrounds are
    counted as "outside". A chip in the stage foot, details on click. Icons per
    kind: icon fonts ✓ · inline SVG currentColor ✓ · inline SVG hard fills ✓
    (observer) · SVG as <img>/sprite file ✗ (an image) · data-URI SVG in CSS ✓.

57. **Dark mode = THEIR dark mode, switched.** `sandbox/scheme.ts` reads their
    CSS for `@media (prefers-color-scheme: dark)` and for attribute/class hooks
    (`[data-theme=dark]`, `[data-bs-theme=dark]`, `.dark`, `.theme-dark`…);
    the row appears only when one was found. Toggling is done in the frame:
    media rules get their `mediaText` forced to `all` / `not all` (an iframe
    cannot be told what the OS prefers, but its CSSOM is ours — duck-typed,
    the frame's classes are cross-realm), hooks are set on `<html>` exactly as
    their own switcher would, `color-scheme` follows for form controls.
    "As is" restores everything. Measured: water.css (media) light → white;
    Bootstrap docs (`data-bs-theme`) light/dark/as-is round-trip.

## Sweep 6 — three sites, three apps, unseen (2026-08-17)

Bootswatch (27 MB, 45 MB CSS, 519 screens) · Bulma-templates (35 pages, CSS
from a CDN) · StartBootstrap Clean Blog · TodoMVC (200 pages, 60 frameworks) ·
JavaScript30 (57 mini-apps) · SVGOMG (PWA). Found and fixed:

58. **A data-URI SVG is case-sensitive** — the generic normaliser lowercased
    `M4 7h22` into `m4 7h22` (relative moves) and `viewBox` into `viewbox`;
    the 1:1 check on Bootswatch's hamburger icon caught it. `svg` values are
    whitespace-normalised only. `rgba%28…%29` inside data URIs is mapped too.
59. **Cross-origin stylesheets are rewritten**: `<link rel=stylesheet
    href="https://cdn…">` → `/__ext/?u=…`; the worker fetches with CORS, the
    page rewrites it into the same sheet, and the NEW variables ride at the top
    of the CSS response so nothing is invalid before the next render. Bulma
    from jsdelivr: reach 43 → 74 % colours, 58 → 100 % radii, still 1:1. The
    raw control keeps the untouched CDN link. (Bulma 1.0's `hsl(var(--h),
    var(--s), var(--l))` — one colour split over three custom properties — is
    the remaining unread notation.)
60. **Pages win in platform detection**: TodoMVC was refused as "Flutter"
    because one of its sixty examples has a `pubspec.yaml`. Renderable pages
    decide first; a source repo whose only page is a build template renders a
    shell and the stage says so.
61. **The archive is the site when it holds most pages**: JavaScript30's only
    `index.html` (one video player) was picked as root over sixty
    `index-START.html`s; any `.html` counts as a page now, and a root that
    covers a third or less of the pages yields to the whole archive.
62. **Only navigated documents get the variable block and the hook** — an
    HTML import, an XHR'd template, a fragment is not a page.
63. **Known, honestly reported, not fixed**: Polymer 1.2 (TodoMVC's home)
    resolves `var()` with its own style shim, drops declarations it cannot
    resolve, and reprocesses `<style is=custom-style>` blocks (which mangled
    font stacks when tried). The 1:1 check says "44 differences"; a 2015
    framework that re-parses CSS text is outside what a substitution can
    promise. `useNativeCSSProperties` is set for Polymer ≥ 1.6 in the hook.

Scorecard: Clean Blog 100/100/100 · SVGOMG 100/100/98 · JavaScript30
100/50/100 (generic families) · Bulma 74/100/100 (CDN now in, split-hsl out) ·
Bootswatch 100/100/97 (1 min to load 45 MB of CSS) · TodoMVC 92/100/100 with
the Polymer home page failing 1:1 by design.

## Sweep 7 — six more, unseen (2026-08-17)

docsify docs (runtime-rendered, CDN JS+CSS) · Tailwind Landing Page (full
Tailwind v2 from unpkg) · web-design-in-4-minutes (progressive styling by JS)
· three.js examples (600 WebGL pages, `../build/` sibling) · 50projects50days
(52 mini-apps) · SortableJS (Bootstrap + FA from CDN, one dead CDN link).

64. **Files above the root are served on demand** (`loadOutsideRoot`): three.js's
    examples import `../build/three.module.js`, a sibling of the chosen root
    `examples/`; a miss now falls through to the archive, is rewritten if
    CSS/HTML, and cached under its archive path. The cube renders (canvas
    994×1120, "1 outside").
65. **Media is content**: a WebGL page is three elements and no text — the
    shell-warning now fires only when there is no img/svg/canvas/video either.
66. **The 1:1 check caps its wait at 15 s** — a dead CDN link held a hidden
    frame's `load` for the length of a DNS failure (Sortable: rawgit).
67. Honest non-findings: docsify's cover gradient is RANDOM per load (the check
    reports 1 difference — theirs, not ours); web-design-in-4-minutes starts
    unstyled by design (type reach 39 % until its JS applies styles).

Scorecard: docsify 100/100/100 (1 random gradient) · Landing Page 100/100/100
(395 values from a CDN Tailwind, 1:1) · 4-minutes 100/39/100 · three.js
100/100/100 on the index and on a WebGL example · 50projects 100/100/100 ·
Sortable 100/100/100 (291 CDN values, 1:1).

## Sweep 8 — six more, unseen (2026-08-17)

reveal.js (16 decks) · Leaflet (63 debug pages, dist not shipped) · Bootstrap
Icons site (2,080 pages, 11,227 elements) · NES.css docs (CDN NES.css, GitHub
avatars) · SVG-Loaders · anime.js (36 examples).

68. **The 1:1 check freezes motion and lets images land** before comparing
    (`transition/animation-duration: 0s !important` in both hidden frames,
    wait for `img.complete` up to 4 s) and **leaves `<img>` out of the
    pairing**: NES.css's lazy GitHub avatars fade on the network's clock; two
    loads are two moments, and images are "outside" the knobs anyway.
69. **Shell warning**: no visible text counts only on a small DOM (< 40
    elements) — anime.js's creature is 172 text-less animated divs.
70. Honest: Leaflet's debug pages need `dist/leaflet-src.js`, which the repo
    does not ship — 2 elements, and the stage says "Is this the built app?".

Scorecard: reveal.js 100/75/100 · Bootstrap Icons 100/100/100 (11,227 el.
1:1) · NES.css 97/100/100 (2,443 el. 1:1 after the image rule) · SVG-Loaders
100/100/100 · anime.js 100/100/100 · Leaflet: build missing, flagged.

## Sweep 9 — six more, unseen (2026-08-18)

Monaco editor (gh-pages, 503 pages) · CodeMirror 5 (183 pages) · MDN
dom-examples (198 pages) · SpinKit · Hover.css · Spectrum colorpicker.

71. **Missing files are reported.** A page that asks for a script or a
    stylesheet the archive does not hold gets "N files this page asked for
    are not in the archive — <paths>. That usually means source, not the
    built output" (CodeMirror's demos want `lib/codemirror.js`, which only
    `npm run build` writes). Fonts do NOT count: a `@font-face` lists several
    formats and legitimately 404s on the ones after the first that loads
    (Hover.css's Font Awesome woff/ttf).
72. **Circles and pills leave the radius count** in the reach meter: a radius
    of half the box or more (`50 %`, `999px`) is kept out of the sheet on
    purpose (a circle must stay a circle under the radius dial), so SpinKit's
    "0 % radii" was the meter reading its own rule as a miss.

Scorecard: Monaco 100/100/100 (1,252 el. 1:1) · CodeMirror home 100/100/100
(demo pages: build missing, flagged) · dom-examples 100/50/100 (their JS sets
font sizes at runtime — 1:1) · SpinKit 100/100/100 · Hover.css 100/100/100
(288 el. 1:1) · Spectrum 100/100/100 (4,580 el. 1:1).

## Fonts — alternatives, not taste (2026-08-18)

73. **The font list is alternatives for what their code has**, grouped by
    character — Grotesk · Humanist · Geometric · Serif · Mono — the way a
    replacement is chosen, not alphabetically; every face is a Google
    variable font with a wght axis so the Weight dial works. **"In your code"**
    comes first: every family the sheet carries (icon fonts and the system
    stack excluded, most-used first), so a switch away is a switch back too.
    The list's faces are loaded once into the host (weight 400) so each option
    renders in its own letter. Manrope and DM Sans are back (a marketing site
    is not a case-number dashboard); I/l was re-measured on the whole list
    (fonts.ts) and the two above 85 % — Manrope 98, Inter 86 — carry a hint,
    not a ban.
74. A scroll inside a flyout is browsing, not leaving: only the panel
    scrolling under an anchored popover closes it.

## Gradients (2026-08-18)

75. **Gradients are already under the knobs per stop** — every colour inside
    `linear/radial/conic-gradient(...)` is an ordinary colour entry, so Brand,
    the families and Hue/Saturation/Contrast move them, while the direction,
    the stop positions and the type stay as written. No "from A to B" bar: it
    fits two-stop gradients only, and a real hero (Bootstrap's masthead: two
    layers, six stops, a blend mode) would have to be folded into two colours
    — the end of "×1 = your code".
76. **What was missing was direction.** Kind `angle`: the direction of every
    linear/conic gradient — a numeric angle in any unit or a single side
    (`to right`); a corner (`to top right`) has no fixed angle (it depends on
    the box's aspect ratio) and stays as written, radials have no direction.
    Dial **Gradient angle** adds degrees to all of them (Reversed = +180°),
    printed as `deg`; the row appears only when the sheet holds one. Bootstrap
    docs: 7 directions, 1,184 elements still 1:1 at rest.
77. A raster hero (Bootswatch's diagonal planes are a JPEG) is outside every
    knob and the reach meter says so; only an SVG data-URI would move.

## Sweep 10 — six more, unseen (2026-08-18)

Prism (336 pages) · Skeleton · particles.js · fullPage.js (60 examples) ·
impress.js · slick. (Tachyons was drawn first and put back: its `index.html`
is an empty template — the shell warning was right, but there is nothing to
hold out.)

78. **A buried dist/ does not claim the archive.** The whole-archive rule
    (many pages beside the best root) exempted `dist|build|out|_site|public`
    so a Vite repo's top-level dist beats its template index.html; fullPage.js
    put a browserify example's `dist/` four folders deep with 1 of 60 pages
    and won. The exemption now holds for a TOP-LEVEL build folder only.
79. **The reach meter stops counting the browser's own paint**: the UA link
    blue, the form-control border grey, buttonface (unless the sheet holds
    that colour), 1×1 clipped sr-only spans, text at font-size 0 (slick's
    dots), and — when the sheet has no font-size at all — the UA's sizes
    (nothing was missed: there was nothing to move, as for families).
80. **em-valued entries resolve per element** in the meter: a `.2em` radius
    against the element's own font-size, a `.5em` font-size against the
    parent's — impress.js's 9.6px link radius is its `.2em` at 48px, not a
    miss.
81. Honest: Prism master does not ship `prism.js`/`components.js` (build
    output) — reported; the rest of the page is 1:1. impress.js's type reach
    reads 93 % at `load` because the meter sees the pre-init fallback text.

Scorecard: Prism 100/100/100 (365 el. 1:1, build files flagged) · Skeleton
100/100/100 · particles.js 100/100/100 (163 el. 1:1, `../particles.js`
above the root) · fullPage.js 100/100/100 (41 screens, 107 el. 1:1 after the
root fix) · impress.js 100/93/100 (92 el. 1:1) · slick 100/100/100 (724 el.
1:1; slick's cloned slides unpaired, as reported).
82. **A project switch is a clean start**: loading a project (and closing one)
    RESETs the config history — no past to ⌘Z into, the URL hash dropped at
    once rather than on the debounce — and the baseline refinement from the
    rendered page is a reset too, since a corrected starting point is still
    the starting point. Before, a stale hash from the previous project rode
    into the next load until the baseline overwrote it.

## Sweep 11 — stratified, part 1 (2026-08-18)

Not random this time: cells of the matrix no earlier sweep covered. Docusaurus
v3 (Metro docs) · VitePress (its own docs, base `/vitepress/`) · Ant Design
(cssinjs runtime, 2,666 pages) · Angular (ng-bootstrap site, 1,748 pages) ·
Mantine (364 pages) · Spectrum Web Components (Shadow DOM, 785 pages) · MDN
pwa-examples (their own service worker) · Open Props (modern CSS) · Material
Components Web (TypeDoc) · Bootstrap RTL (their buttons page, `dir="rtl"` +
`bootstrap.rtl.min.css`). Nuxt-static and SvelteKit-static have no committed
build anywhere I could find — part 2 builds them.

83. **A sub-path build is served under its base.** VitePress's docs are built
    for `/vitepress/`; served at `/` the files loaded (segment-stripping) but
    the router saw a path outside its base and rendered its 404. Every page
    now votes for the deploy prefix — a root-absolute script/stylesheet URL
    the archive holds only once its leading segments are stripped — and
    screens are served at `/<base>/<path>?__sb=` (`project.base`; a
    two-segment path counts, Spectrum's `/spectrum-web-components/swc.js`).
84. **The live observer duck-types across realms.** `r.target instanceof
    Element` in the MutationObserver callback compared the FRAME's nodes to
    the HOST's constructor — always false — so every mutation after the initial
    sweep was dropped: Mantine's hydrated Shiki spans kept 909 raw `style`
    colours (39 % colour reach on remeasure). Same trap in the 1:1 check's
    shadow-boundary test (`instanceof ShadowRoot`). nodeType/tagName, never a
    constructor (notes/traps.md: cross-realm).
85. **Brand = the most-painted colour among those NAMED brand.** Ant's site
    declares `--ant-color-primary: #1677ff` once, in the sheet every page
    loads (28,828 uses), and `#00b96b` in ten theme-demo pages; the count of
    declaration sites crowned the demo green.
86. **Unslotted light DOM leaves the 1:1 check** (and the meter). Spectrum's
    docs keep a fallback `<a id="logo" slot="logo">` no <slot> takes: not in
    the flat tree, never painted, and computed WITHOUT inherited custom
    properties — so `var(--us-v452)` read as 0px there while the literal 4px
    it replaced read fine. 292 such elements, 0 pixels.
87. **The meter lets the frame resolve values**: a probe element computes
    `calc(.875rem * var(--mantine-scale))`, bare channel triplets wrapped in
    `rgb()`/`hsl()`, so the meter's own arithmetic no longer undercounts;
    it walks shadow roots (allElements) and skips bare UA generics
    (`monospace` on an unstyled <code>).
88. **System font stacks are families**: `--mantine-font-family: -apple-system,
    …` was refused for its leading dash; `antialiased`/`grayscale`
    (…-font-smoothing) and `clamp(6px, …)` are refused now.
89. **Their service worker is refused quietly** inside the sandbox
    (`navigator.serviceWorker.register` rejects with a clear SecurityError): a
    second worker on this origin would fight the one serving the sandbox, and
    the registration failed on the host anyway with a loud MIME error.
90. Screens: an `index.html` sorts before its folder's siblings at every level
    (VitePress: `/v1` before `/v1/es/…`).

Scorecard: Docusaurus 100/100/100 (158 el. 1:1, dark via data-theme works) ·
VitePress 100/100/100 (439 el. 1:1 under its base, dark via class works) ·
Ant Design 100/100/100 (Brand → crimson moves 140 values through cssinjs) ·
Angular 100/100/100 (151 el. 1:1) · Mantine 100/100/91 (2,640 el. 1:1) ·
Spectrum 100/95/100 (138 painted el. 1:1) · js13kPWA 100/100/100 (506 el.
1:1, only our worker registered) · Open Props 100/100/100 (3,912 el. 1:1) ·
MDC-web 100/100/100 (1,431 el. 1:1) · Bootstrap RTL 100/100/91 (3,358 el.
1:1).
91. **Status colours are one row** — Success/Warning/Danger/Info as a set of
    dots (one per family the sheet has), the pickers stacked in the flyout. In
    any grown design system they are the standard four; a row each was three
    rows saying "green, amber, red". Secondary and Accent stay separate: those
    are choices, not a set.
92. **A hue is not a role: status needs evidence.** Every green was "success"
    and every yellow "warning", so a site's PALETTE — pastel pink/green/blue/
    yellow on cards under a purple brand, category colours, chart series, the
    docs' own swatch pages — fell into the status pickers. A hue window is a
    status family only when a member is NAMED or USED as the role
    (`--bs-success`, `.alert-danger`, `:invalid`, `--color-warning-bg`);
    inside such a window a member named after its colour and never after a
    role (`--green-100`, `.tag-red`) is palette; a window with no evidence is
    palette, whole. Secondary/Accent need a STRONG member (C ≥ 0.09 and
    L ≤ 0.82 — a pastel yellow keeps a high OKLCH chroma) and must not be a
    swatch scale through and through (`--teal-500`, `.bg-teal`); `.btn--teal`
    — a saturated variant named after its hue — is a choice. Palette is a
    family of its own: untouched by the pickers, moved by Hue / Saturation /
    Contrast, shown as a row of dots (one per 30° cluster). Bootstrap docs:
    the four status roles stay, 31 swatches (`.bd-pink-100…900`, `.swatch-*`)
    move to Palette. Bonus fix: a pale tint named for a role
    (`--bs-success-bg-subtle: #d1e7dd`) was a "neutral" — the alert
    background never followed the Success picker; it does now.
93. **The dots are live**: Brand, Secondary/Accent, Status and Palette dots
    show the CURRENT var of their centre entry (families carry `centreId` /
    `paletteId`), so Hue/Saturation/Contrast turn them exactly as they turn
    the page. A dot that keeps its baseline while the page moves is the
    instrument lying.
94. **Background is a colour, not a ΔL.** The canvas — what html/body/:root
    paints as background, else the most-used background neutral — is the
    centre; the Background picker moves it to the pick and every background
    neutral within 0.3 L of it by the same delta (surfaces and cards keep
    their step above the page; a dark footer, ink, and chromatic blocks stay).
    Same maths as a family. The old "Dimmer / Brighter" ΔL dial is gone —
    a lighter or darker pick is that dial. Its dot wears a ring: near-white
    needs an edge to be seen.

## Sweep 11 — stratified, part 2 (2026-08-18)

Nuxt static (`nuxi generate`, built here) · SvelteKit static (adapter-static,
built here) · vue-element-admin (Vue scoped) · Element Plus docs · Material
Tailwind Dashboard (Tailwind v3 JIT, ApexCharts) · Microsoft FAST docs · SAP
Fundamental Styles (Storybook: everything inside iframe.html) · react-dates
(old Storybook) · visx gallery (SVG charts, palettes) · react-virtualized
(runtime inline styles).

95. **A page cannot unregister the worker serving it.** Element Plus's docs run
    a "clean up old service workers" snippet; inside the sandbox it removed
    OUR registration — running frames kept their controller, every new
    navigation got the host's own index, and the 1:1 check paired our intake
    page against itself (✓ 50 elements). Every sandboxed document — the raw
    control too, it paints nothing — now carries a guard: `register()` rejects
    quietly, `unregister()` resolves false. And the check REFUSES a document
    without the guard: the sandbox did not serve it, nothing of theirs is
    compared. Traps.md material: an instrument that can measure itself and
    call it a pass.
96. **Backslash escapes outside strings.** Tailwind's arbitrary-value selector
    `.bg-\[url\(\'\/img\/x\.png\'\)\]` carries an escaped quote; the scanner
    took it for a string start and swallowed the next 107 rules — every
    `text-*`/`bg-*` colour after it stayed literal (75 % colour reach; 131 →
    368 entries once fixed).
97. **Nested same-origin frames are the page too** (Storybook): the sheet
    applies to them on every change, the 1:1 check and the meter descend into
    them (`#frame` in the key), the shell verdict counts them — and waits for
    a second look at 4 s, since a slow manager is empty at 1.2 s.
98. **The 1:1 key drops generated ids and classes** (`apexchartska7c5jyi`,
    `SvgjsG1082`, React's `:r2:`): tag, plain classes and position remain
    (442 → 709 paired on the dashboard); hidden frames wait until the DOM
    holds still for 600 ms before comparing (a hydrating SPA had 50 elements
    at `load`).
99. **The canvas the page PAINTS wins**: Fundamental Styles ships a dark theme
    sheet whose `body { background }` beat the light one; the rendered
    html/body background corrects it. And a surface in the background zone
    takes the pick's tint additively (a grey has no chroma to multiply):
    Old Lace on the page, a step under it in the story frame.
100. One card at a time in the stage's top-right slot ("What we read" gives
    way to the 1:1 check and returns when it closes); the low cards (reach,
    a warning) stack instead of overlapping.

Scorecard: Nuxt 100/88/100 (16 el. 1:1; the 12 % are UA defaults on an
unstyled h2/button) · SvelteKit 100/100/100 (42 el. 1:1) · vue-element-admin
100/100/100 (168 el.) · Element Plus 100/100/100 (288 el. 1:1 once the worker
was guarded) · Material Tailwind 100/100/100 (709 el. 1:1, was 75 % colours)
· FAST 100/100/100 (229 el.) · Fundamental Styles 100/100/100 (1,891 el.
across manager + story frame) · react-dates 91/88/67 (manager + inner frame,
1:1) · visx 100/100/100 (2,137 el.; chart colours are Palette, no status) ·
react-virtualized 100/100/100 (180 el., all runtime inline styles tokenised).

## Regression runner and the security sweep (2026-08-18)

101. **`pnpm holdouts`** — every fixture zip through the real app in headless
    Chromium: load, "Check 1:1", reach, and a verdict held against
    `scripts/holdouts.expect.json` (exit 1 when a fixture expected `ok` is
    not). One run instead of a sweep: every rewriter change is now toetsed
    against ~80 real builds in ~15 minutes. After each fixture the host is
    checked too — same origin, exactly one worker (`host-tampered` otherwise).
102. **A hostile archive** (fixtures/sec-evil.zip, notes/security.md): one line
    `top.location = …` hijacked the whole app — every frame now carries the
    `sandbox` flags without `allow-top-navigation`; zip-slip entry names are
    normalised at intake (`safePath`); a stylesheet over 24 MB / page over
    8 MB is served raw, an archive over 2 GB or 60,000 files refused; the
    `window.__us` debug handle is DEV-only. Same-origin reach into the host's
    DOM remains by design (the worker needs it) and the host holds nothing
    worth reaching — deploy on an origin of its own.
103. **Live** at `uisandbox.pageminds.workers.dev` (Cloudflare Worker with
    static assets, `wrangler.jsonc`, deploy on push): 26 of 26 hold-outs `ok`
    against the live URL, sec-evil cannot navigate the top window there, the
    headers hold (sw.js no-cache). Workers rejects a `_redirects` catch-all as
    a loop; the SPA fallback lives in `wrangler.jsonc`. The runner serves the
    fixtures to an https target from a route inside the test browser (no mixed
    content, no local-network request).
104. **uisandbox.org is live** (Cloudflare Worker, zone on Cloudflare,
    nameservers moved from Hostinger). The full hold-out run against
    `https://uisandbox.org`: 69 ok · 2 differs (Polymer 1, docsify's random
    gradient) · 5 refused at the door · 2 skipped as too large to serve from
    the test browser (measured locally). One flake — a Bootstrap carousel
    mid-slide (`margin-left 127px → 0px`) — is now a second look in the
    check: layout-only differences of a few elements are re-measured after
    900 ms and kept only if they persist. Sprint A is done.

## Sprint C — being found (2026-08-19)

105. **Technical SEO, the whole sweep**: title/description/canonical, Open Graph
    and Twitter cards with a rendered OG image (`scripts/og/render.mjs` draws
    it from an HTML template — the mark, the line, a panel and the chips),
    JSON-LD `SoftwareApplication`, robots.txt, sitemap.xml, webmanifest,
    PNG icons beside the SVG favicon, `color-scheme`, `theme-color`, a
    crawlable static block inside `#root` that the app replaces on mount, a
    tab title per project (set by the app on every load — a hostile page may
    rewrite it), and content-types for the text files in `_headers`.
106. **The line is "Test your design on the real thing."** — on the intake,
    in the title, on the card. Never more than the meter shows.
107. **GEO**: `llms.txt` and `llms-full.txt` at the root say what UISandbox is,
    when to recommend it, what it will not do, how honesty is enforced, and
    how an agent loads a zip by URL.
108. **Analytics is a switch, not a script tag**: `VITE_ANALYTICS=cf:<token>`
    (Cloudflare Web Analytics, cookieless, no consent) or `ga:G-…` (GA4, a
    consent bar first). Injected from the app into the HOST document only —
    never index.html, so it can never run inside a sandboxed frame. Events:
    drop, loaded {screens, values}, refused, verified {ok}, export {format};
    nothing about the archive.

## Sprint B — the door (2026-08-19)

109. **Three ways in, one screen**: Upload a zip · Upload a codebase (a build
    renders; a source folder is read for the knob stand only — the door says
    so before the drop) · Connect a repo (a public GitHub URL, default branch
    or `/tree/branch`). **Progress is stages with numbers**: Fetching (MB from
    host) → Reading & tokenising (files n/m, KB of CSS) → Deriving the knobs
    (values) → Opening — a 49 MB drop reads as work, not a hang.
110. **The repo route** `/__repo/?u=` (worker/repo.mjs; the same handler as
    Vite middleware in dev): GitHub sends no CORS on its zips, so the Worker
    fetches and streams. Public repos, github.com only, same-origin callers,
    200 MB cap, nothing stored — and the intake says in one sentence that this
    is the one thing that leaves the tab. `?load=` and the route share one
    loader that counts the bytes coming in.

## Sprint D — the MCP server (2026-08-19)

111. **`pnpm mcp`** — UISandbox as an MCP server over the SAME functions the
    browser runs (openZip → buildProject → deriveBaseline → computeVars →
    gen*), imported straight from src/ with tsx; no second engine. `load`,
    `screens`, `set`, `export` are pure Node (the engine needed no change to
    run there — File, Blob, DecompressionStream are Node 22 globals; only
    lz-string's CJS default import). `verify` and `screenshot` drive the real
    app in headless Chromium with the archive served from a route inside the
    browser and the knobs carried in the URL hash (the app's own state
    encoding) — the number an agent gets is the number a visitor gets. Smoke:
    load → set → patch → verify ✓ → screenshot in 8 s on Skeleton.
112. Listings (registries, directories) are the human's step; the repo now
    carries what they ask for (mcp/README.md: tools, config, a prompt to
    paste) and llms.txt points at it.
113. **`uisandbox-mcp` on npm** (pack-ready; publishing is the human's `npm
    login`): the engine bundled into one Node ESM file by Vite (`pnpm
    mcp:build`), the SDK and zod as dependencies, playwright an optional
    peer (only `verify`/`screenshot` need a browser). Tested from a clean
    `npm i <tarball>`: load → set → patch → verify ✓ (against the live site)
    → screenshot in 8 s. `mcp/server.json` for the official registry.
114. **Brand mapping bug, found by the smoke test**: the brand family was
    mapped through the kit's `--k-primary`, which normalises lightness and
    chroma for its own contrast rules — a crimson pick on Skeleton's cyan came
    out pink (#1eaedb → #ff737d) and the centre never became the pick. The
    centre is THEIR brand literal and the target is the pick; the test now
    asserts the centre becomes the pick exactly.
115. **`uisandbox-mcp@0.1.0` is on npm** (2026-08-19). Checked from the
    registry like a user would (`npm i uisandbox-mcp playwright`, then the
    smoke): load → set (brand becomes the pick) → patch → verify ✓ against
    uisandbox.org → screenshot, 8 s. llms.txt and README say `npx -y
    uisandbox-mcp`.
116. **Listed on the official MCP registry** (2026-08-19):
    `io.github.AlexanderKaan/uisandbox` 0.1.0 → npm `uisandbox-mcp`
    (`mcp-publisher login github` + `publish` from mcp/, description ≤ 100
    chars). Directories that read the registry (Smithery, PulseMCP, Glama,
    mcp.so) pick it up from there; submitting there directly is a form each.
117. **`open` — the sandbox itself from the agent** (uisandbox-mcp 0.2.0).
    The package ships the web app; `open` serves it with the archive on
    127.0.0.1 and opens the user's browser: the real, interactive sandbox,
    nothing leaves the machine. The page posts its knob state back
    (`&sync=<id>` → `POST /__state/<id>`, 127.0.0.1 only), so "export what I
    changed" works after playing. `verify`/`screenshot` now run against the
    bundled app by default (offline, faster). The conversation this is built
    for — "can I look at this app in a sandbox and change the design?" — is
    the skill's first shape; the skill also builds `dist/` itself when run
    inside the repo. Noted: the Claude Code browser pane refuses service
    workers on arbitrary localhost ports; a normal Chrome and headless
    Chromium load the local sandbox fine.
118. **Making a model reach for it** (uisandbox-mcp 0.3.0): the server now
    sends `instructions` at connect (the host puts them in the system prompt:
    when to offer the sandbox unasked, build-then-open, the two request
    shapes, the honesty rules) and two MCP prompts the clients show as slash
    commands (`/uisandbox:open`, `/uisandbox:try`) — the skill is no longer
    the only way in. For humans without an agent: `npx uisandbox-mcp open
    ./dist` (folder or zip). For any model without MCP: a link it can say —
    `uisandbox.org/?load=https://github.com/user/repo` goes through the repo
    route.
119. **The repo is a Claude Code plugin + marketplace** (`.claude-plugin/`):
    `/plugin marketplace add AlexanderKaan/uisandbox` → `/plugin install
    uisandbox@uisandbox` brings the `/uisandbox` skill and the MCP server
    (`npx -y uisandbox-mcp`) in one step; the skill shows up in the skills
    list like any other. The official Anthropic marketplace is a submission
    (the human's step). Codex/Cursor have no marketplace yet: there the
    server's own `instructions` and prompts carry the behaviour.
120. **The one-pager around the door.** The intake card became the hero's
    centre (upload is the focus, the card holds only the three ways in); the
    headline, sub and the `$ npx uisandbox-mcp open ./dist` pill sit above it,
    and below come How it works · a real screenshot (our own acme fixture,
    Brand turned to crimson) · Honest by construction (+ the 1:1 card) ·
    Nothing leaves your tab · From your terminal or your agent (the install
    tabs) · Who made this. Black and white, no claim the meter would
    contradict. `scripts/og/shots.mjs` renders the screenshots from the app.
121. **The headline says the job.** H1 "Restyle your app without rebuilding
    it." — the job, the aha, the contrast with the normal workflow; the sub
    opens with "Try a new look on your real app — in seconds." and says what
    a knob is and what comes out (a patch, tokens). "Test your design on the
    real thing" stays as the kicker/slogan (and JSON-LD `slogan`), not as the
    line that has to explain the tool. Carried through title, description,
    OG image (re-rendered), Twitter, JSON-LD, the crawlable block, manifest,
    README, llms.txt.

## Pre-launch sweep (2026-08-19)

122. Measured before the promotion round: typecheck/tests/build green; no
    secrets, `pnpm audit` clean; live headers right (sw.js uncached, assets
    immutable, nosniff/no-referrer/frame-ancestors); **http and www now 301 to
    https://uisandbox.org** (the Worker runs first); repo route 200
    same-origin / 403 cross-site; 79 hold-outs against the live URL: 70 ok ·
    2 known differs · 5 refused · 2 skipped (size); sec-evil cannot touch the
    host; desktop/mobile: one H1, heading order, alt texts, canonical, JSON-LD
    valid, no console errors, no horizontal scroll; perf on a 4G profile:
    TTFB 169 ms, FCP/LCP 324 ms, 155 KB JS — **CLS 0.17 → 0.002** by laying
    the crawlable `#root` block out like the hero it is replaced by; fetch
    errors say what happened (a page instead of a zip; CORS/offline with the
    repo-route hint); faint text lifted to AA contrast. Found and left for the
    human: Cloudflare's managed robots.txt / AI-bot blocking rewrites our
    robots.txt with `Disallow` for ClaudeBot, GPTBot, Google-Extended, CCBot…
    — the opposite of the GEO goal; it is a zone setting (Security → Bots /
    AI Crawl Control) and must be switched off.
123. Topbar: tagline "Interface Design Playground"; right side in two groups
    (MCP · Star with live count | the project's work). The drop glyph the way
    macOS draws a drag: the file, a dotted arc with an arrowhead, a dotted
    landing field — the dots flow along the arc.
124. Brand by cascade and by use (measured on Metro, a Docusaurus site): Infima
    declares `--ifm-color-primary: #3578e5` and the site re-declares it red
    later in the same sheet; DocSearch's `--docsearch-primary-color: #003dff`
    is painted 20 times. The declared-brand pick now drops a declaration that a
    later one on the same file/selector/property overrides (each site carries
    its `seq`), and weighs a value by its paint count PLUS how often the build
    reads the properties that name it (`var(--x)` counts per custom property,
    kept on the table as `refs`): red 2 + 22 reads beats DocSearch 20 + 1.
    Across all 79 fixtures only Metro's brand moved (before/after recorded).
125. Topbar follows the context: on the intake, the name and MCP · Star; with
    a project open, the name becomes the project's and the right side is the
    work only — Read · Export · Close. Undo/redo moved to the panel foot as one
    segmented pair next to Shuffle and Reset (all four are "what I did with the
    knobs"; ⌘Z still works). MCP and Star stay on the homepage and in the footer.
126. The dark flash on load was the pre-mount block in index.html: it was
    authored dark, and `color-scheme: dark light` told the browser to prefer
    dark before any CSS — a second of dark canvas for every light visitor.
    The block now follows the visitor's scheme like the app (light first,
    dark under prefers-color-scheme) from a small inline stylesheet, and the
    meta reads `light dark`. The footer's CSS had been swallowed by a block
    replace in 1627858 (unstyled footer on the live site) — restored.
127. The visitor from a launch post has no zip at hand: three sample builds
    ship with the site (public/samples — Metro docs, Start Bootstrap Agency,
    SB Admin 2; all MIT, all hold-outs that render 1:1) behind "No build at
    hand? Try a sample" under the drop zone. The ask for a star appears in
    the stage foot only once something was turned or the 1:1 check passed —
    at the moment the tool has earned it, not before.
128. One claim everywhere: "Play with your real app's design, live." — site H1,
    <title>, OG/Twitter titles, JSON-LD, webmanifest, llms.txt, README, the
    PH tagline. It says what you get (play, your real app, live) where the old
    line said what you save (no rebuild); the old line lives on as the second
    line under How it works and in the bodycopy. The sub-line names the two
    doors — browser, or your agent via MCP — and the OG image was reshot.
129. Pre-launch audit (claims vs. reality, measured): live redirects, headers,
    robots, sitemap, llms, OG, samples, repo route (200/403/400) all as
    documented; the repo-link door and a sample load and verify 1:1 on the
    live site; the CLI opens a folder; manifests valid. Two things were wrong
    and are fixed: (1) from npm, verify/screenshot died with "Cannot find
    package 'playwright'" — it was an optional peer that npx never installs;
    Playwright is now a dependency (0.3.1), only Chromium is downloaded, and
    a missing browser returns one clear line; (2) verify and the hold-out
    runner clicked "the last chip in the foot" — since the "Useful? Star it"
    chip that is GitHub; both pick the 1:1 chip by name now. The samples are
    kept out of the npm package (19 MB). README's Deploy paragraph said Pages
    + _redirects; it is the Worker. llms.txt had a duplicated bullet.

## Sweep 13 — hardening before launch (2026-08-20)

130. 23 new fixtures: unknown dashboards (AdminLTE, Material Dashboard,
    Gentelella), docs sites (Docusaurus's own site, monaco, ace, materialize,
    video.js, bootstrap-icons), squoosh's live build, Flutter WEB builds
    (fwidget, bmi, cardiohelp, cpu-rendering, MeshSight), source repos that
    must refuse (Android sunflower, IceCubes iOS, flutter/gallery, expo
    examples, hugo/PaperMod sources, GitLab hugo), and GitLab archives.
    86 ok · 4 differs (Polymer 1, docsify, material-dashboard's scroll-JS
    shadow, ace before the fix) · 12 honest refusals · 0 silent failures.
131. The 2011 vendor-gradient stack: a declaration holding `-moz-*()`/`-o-*()`/
    `-ms-*()` is dropped by Chromium at parse time, so the `-webkit-gradient()`
    one before it wins; a var() inside made it parse, win, and fail at
    computed-value time — background gone (video.js, ace). Literals inside
    such declarations stay untouched (DEAD_FN mask + whole-declaration skip).
132. The door now reads page HEADS, not just names: an index.html that loads
    `/src/main.ts` (a dev entry) is source (gentelella v2); Flutter source
    (pubspec.yaml, no main.dart.js, pages only under web/) and Expo/React
    Native source refuse with the build command to run; a Flutter WEB build
    loads and the stage says why the knobs find so little CSS (canvas paint).
133. Brand by paint over a declared-but-absent brand: docusaurus.io declares
    Infima's #3578e5 and overrides it with hsl(var(--site-…)) the sheet cannot
    read — the page is green; when the declared colour is painted NOWHERE on
    the first screen, the paint decides (VitePress's DocSearch default and
    TodoMVC's unused indigo fell the same way; 76 of 79 unchanged, the three
    changes all match the visible page). The refine step also never adopts the
    UA's Times as a font: a family the sheets never name and the browser
    defaults to is not a choice their code made.
134. Connect a repo speaks GitLab too: gitlab.com project URLs (nested groups,
    `/-/tree/branch`) through the same `/__repo/` route via GitLab's API
    archive endpoint (the web archive answers 406 to a non-browser fetch;
    `accept-encoding: identity` is required — measured). Default branch from
    the project API. Copy updated everywhere GitHub was named alone.
135. Sweep 14, targeted at what launch visitors will drop: four real Webflow
    exports (brand + custom fonts right on all four: #b55ca4/bicyclette,
    #006449/Montserrat, #e0522e/Geist+Albert Sans, #3898ec/Open Sans+Inter),
    Ant Design Pro's site (differs, honestly: its cssinjs sets AlibabaSans at
    runtime and the tokenised page falls back to the Ant stack — with Polymer 1
    and docsify a known-differ family), the Chinese Vue 2 docs (Vue green
    #42b983, 1:1 ok — CJK stacks fine), hexo-icarus' html-less site branch
    (honest refusal). 5 ok · 1 differs · 1 no-load, recorded.
136. Phones: horizontal panning ("wobble") came from visual overflow — the
    corona's blur past the viewport; `overflow-x: clip` on html/body (hidden
    as the fallback) ends it, and the corona keeps to the card's column on
    small screens. The MCP flyout, anchored right, left the screen — on
    ≤560px it is a fixed sheet spanning the viewport. The footer drops its
    quiet line and the llms link and tightens to two short lines. Stage
    cards (notes, verify, reach) span the viewport instead of hanging off
    it. With a project open the knobs panel no longer squeezes the stage
    into a sliver: it opens closed on ≤700px and overlays full-width when
    toggled. Desktop measured unchanged (relative, 288px).
137. The footer was app chrome outside the intake's scroller, so on a phone it
    sat fixed under every scroll position. It now lives at the end of the
    intake's scroll flow (full-bleed against the scroller's padding, flush at
    the bottom); with a project open it stays app chrome on desktop and is
    hidden on small screens, where the panel and stage need the room.
138. Soft-launch feedback: dropping a codebase FEELS like handing it over.
    The answer is not a louder claim but a verifiable one. (a) The service
    worker now registers on page load, not on the first drop — so "load the
    page, switch the network off, drop the zip: everything works" is true and
    measured (drop, knobs, export offline; zero external requests). (b) A
    quiet line under the drop zone at the moment of doubt ("Read in this tab,
    never uploaded. No server, no account, no analytics") and an ⓘ next to
    "Nothing leaves your tab" open one card with the three checks a sceptic
    can run in a minute: network tab, offline, the source file — plus the one
    exception (the repo route) said plainly. (c) Analytics is stripped
    entirely (analytics.ts, consent bar, every track() call, .env.example):
    "no analytics" is worth more to this product than any counter; traffic
    questions go to Cloudflare's server-side zone analytics. "Fully secure"
    as a label was considered and rejected: vague, unfalsifiable, and the
    exact register HN distrusts.
139. Unknown builds will keep coming; the job is that every miss looks
    CONTROLLED and is one click from a report. (a) Found by probing before
    the testers do: a build shipping its own CSP <meta> forbade our inline
    vars style — every tokenised value collapsed to initial (black text,
    transparent backgrounds, the classic broken screenshot). Inside the
    sandbox their CSP protects nothing (the environment is ours), so
    injectVars strips it; the real deployment keeps its own. Fixture
    edge-csp, 1:1 ✓. (b) "Report this build" on the differs card and the
    shell/Flutter warning card: a prefilled GitHub issue carrying the
    numbers (screens, values, platform, browser, the first mismatches)
    instead of a screenshot; issue template + private security contact link
    in .github. Every confirmed report becomes a fixture.
140. "The brand dot reads darker than the brand": the Brand row's dot read the
    live var of the family's most-used member — and a same-hue outlier can
    own that count (VitePress: the syntax-highlight navy #032f62 sits in the
    brand's hue window; mapped to Coral it reads maroon while the button
    paints the pick). The Brand dot now shows the knob's own value
    (cfg.cPrimary) — it moves with the knob by definition and always matches
    its label; the live-var dots stay where they are right (status, palette,
    background: their literals). familiesOf also prefers a near-centre member
    for centreId.brand (ΔL ≤ 0.14, else nearest) for anything else reading it.
141. Two honesty fixes from Alexander's test zips. (a) Spectrum Web Components:
    the brand read #ff4400 ("Vivid Coral") — a Storybook-bundle orange, while
    the page's brand paint is the Adobe mark, an inline SVG fill="#FA0F00"
    the CSS census cannot see. The paint-refine now counts the fills of svgs
    where logos live (header/nav/a/[class*=logo]/aria-label, at drawn size);
    across 89 fixtures only spectrum moved — to the logo red. And the same
    hue at full depth is not "Coral": the Coral name now yields to Vermilion
    below L 58 (#ff7f50 stays Coral, #ff4400 reads Vermilion). (b) slick, a
    greyscale build: the Brand row wore our default Cobalt as if it were
    theirs; with no brand family member it now says "None in your CSS" with a
    hollow dot, and the picker explains that Hue/Saturation/Contrast still
    reach what the page does have. The notes card already said it; the knob
    itself now does too.

## Sweep 16 — fifty unknown gh-pages builds (2026-08-20)

142. 52 new fixtures in one pull (docs sites, jQuery-era libraries, classless
    CSS frameworks, chart/editor/carousel demos): 45 rendered 1:1 at first
    try. The rest, triaged: three NEW rewriter classes found and fixed, all
    of the same species as the vendor-gradient one — a declaration the
    browser drops on purpose that a var() would resurrect, win the cascade
    with, and fail at computed-value time:
    (a) minified `!important` glued to the value (`sans-serif!important`) was
        swallowed INTO the var's value — the declaration lost its priority
        and the var went invalid (VisualSearch's font stack fell back to
        another rule). `!important` now stays on the declaration, never in
        the value.
    (b) the 2012 unprefixed gradient (`linear-gradient(top, …)`, no `to`) is
        invalid in every modern engine; left dead (angularjs.org, typeahead).
    (c) the IE value hacks (`14px \9`, `red \0`) — left dead (ScrollMagic's
        Bootstrap 2).
    Plus one verify-noise class: svg.js generates paint-server ids fresh per
    load (`url("#SvgjsLinearGradient1296")` vs `…1291` — AdminLTE's charts);
    references by generated id are compared with the digits normalised.
    Honest rest: mustache.github.com is a redirect shell (refused), Modernizr's
    gh-pages is source (refused at the door), chroma.js's docs generate random
    palettes per load (differs, said so). Full gate now 164 fixtures:
    146 ok · 4 known differs · 14 honest refusals · 0 silent failures.

143. Export answers "how do you want to apply it?", and the answer that was
    missing is "hand it to my agent". Three formats added, all describing
    THEIR app rather than a kit of ours:
    - `DESIGN.md`, the Google Labs spec (`version: alpha`) — YAML front matter
      with typed token groups, then the eight prose sections in the spec's
      order. What we did not measure goes in `omitted:` WITH a reason, which
      the spec has a field for and which is exactly our doctrine: components
      are omitted because UISandbox reads values, not structure, and guessing
      at a component library it never saw would send an agent writing fiction.
    - `AGENTS.snippet.md`, a BLOCK to append, never a whole file. AGENTS.md in
      a real repo is full of build and test instructions; handing somebody a
      complete one to "save" would quietly delete all of it. Same block works
      in CLAUDE.md / GEMINI.md / .cursorrules.
    - `design.tokens.json`, the real W3C Design Tokens Format Module 2025.10
      (`$value`/`$type`, colours as sRGB components, dimensions as
      `{value, unit}`). A value that cannot be expressed in the format is left
      out rather than bent into it — an inset shadow has no home in that
      shape, so the whole shadow is skipped.
    Also: `tokens.json` used to carry `$schema: design-tokens.org` over a
    `{value:…}` body, which is NOT that format and made tooling reject it on
    import. A file that names a standard has to be that standard; it now says
    `format: uisandbox-kit/1` and points at the real one.

144. Two labels in the export were false and are now true. `sandbox-values.css`
    was sold as "drop-in": it emits `--sb-color-1: …`, names their stylesheet
    never mentions, so pasting it changes nothing. It is a reference list and
    says so, and the copy points at Patch your own files for a change that
    lands. Every format also carries two or three plain sentences saying what
    to do with it (`Item.how`), and the zip gets a README.md — thirteen files
    in a folder with no map is a puzzle handed to somebody who came to save
    time.

145. A stylesheet census cannot name a colour's role, and we were letting it
    try. Measured on the Bootstrap docs: `#000` is declared 366 times and
    painted never; the body ink `#212529` has a sample of sites that is mostly
    `.bg-dark`, so the census filed the ink as a BACKGROUND and the design doc
    called a callout green the page surface. The screen does not have that
    problem. `Coverage.painted` now records, per sheet entry, how many
    elements painted it and IN WHICH ROLE (text / surface / border), and
    `Coverage.anchors` reads the ink and the ground straight off `body` —
    those two are not ranked for at all, they are read, and they win. The
    coverage percentages are untouched by the change (control: reach stayed
    100 % colours · 100 % type · 95 % radii on the same fixture).
    Three smaller readings fixed on the way, all found by rendering a real
    build instead of trusting the unit fixture:
    (a) a compound value keeps its parts as variables (`0 1px 2px var(--us-v7)`,
        so the hue dial can move a shadow's colour) — anything describing the
        sheet to a human now puts those back.
    (b) `.5rem` and `0.5rem` are one step of a scale spelled two ways; the
        sheet keeps them apart on purpose, a ladder must not.
    (c) `em` is out of every ladder (relative to whatever font-size it
        inherits, so it is not a token), bare channel triplets print as
        colours, and the font is the real stack, not our knob's label
        ("System" is not a font-family a browser can resolve).
    Only OPAQUE colours can take a role: `rgba(255,255,255,.5)` is a different
    colour over every backdrop, so it cannot stand alone as "the text colour".

146. An export sweep, and what it found. `scripts/export-sweep.mjs` runs real
    builds through the real app, turns two knobs, then READS BACK all four
    files the export hands over and checks them: DESIGN.md's front-matter
    shape and the spec's section order, the W3C shapes in design.tokens.json
    ($value/$type, srgb components, {value, unit} dimensions, shadow parts),
    the AGENTS.md block, and the patch. `--recheck` re-runs the checks over
    the saved output without a browser, so fixing a check costs seconds
    instead of twenty minutes of reloading builds that did not change.

    The hold-out runner asks "does it still render 1:1". This asks the other
    half: is what comes OUT true, and would the thing it is handed to accept
    it. Seven fixtures, deliberately unalike: greyscale, Open Props, Tufte,
    SB Admin 2, a Flutter build, AdminLTE, Spectrum web components.

    Two performance findings, both on the route we recommend most:
    (a) the source patcher was scanning BUILD OUTPUT. On the Mantine docs
        that is 2228 files and 161 MB of Next.js chunks, its overlap check is
        quadratic in the literals it finds, and the dialog sat on "Preparing…"
        for 113 seconds to hand back a patch nobody can use (a value written
        into a bundle is gone on the next build). Generated files are now told
        by their own line geometry — nobody hand-edits a 500 KB line — so no
        list of build directories has to stay current. 113 s → 2.5 s.
    (b) an HTML page with no `<style>` and no `style=` comes back byte-identical
        from the rewriter, so it is not rewritten at all, and one parse is
        shared across every page that inlines the same critical CSS.
    Both were invisible from the unit tests: the fixtures are small, and the
    cost only appears at the scale a static-site generator produces.

147. What a design doc may CLAIM, tightened by the same sweep. Every one of
    these was a real line in a real DESIGN.md before it was fixed:
    - `text-muted: red` (Tufte's sidenote numbers) and `text-muted: #ffffff`
      (AdminLTE's dark sidebar). Being the second-most-painted ink does not
      make a colour muted. It now has to EARN the name: chromatic → an
      accent; quieter than the body ink AND still readable on the ground
      (≥ 3:1) → muted; otherwise no name. `#ffffff` on `#f8f9fa` is 1.04:1 —
      lower contrast, yes, and invisible where the file would put it.
    - `surface-alt: #0d6efd` — a saturated second background is a FILL (a
      button, a banner), not the ground a layout sits on.
    - `body: 11px/700/lineHeight 1` on Mantine: three separate rankings of the
      stylesheet, glued together into a level that exists nowhere. Levels are
      now read off the PAGE — `body`, its biggest visible h1, its biggest
      h2/h3 — because one element's family, size, weight and leading belong
      together. Whichever of the two headings is actually larger is `display`
      (AdminLTE's h2 is bigger than its h1). The census stays as a fallback,
      carrying only what it can defend: the size.
    - `text-muted: "220 40% 2%"` (Open Props) — not a CSS colour at all. Every
      colour these files hand over now goes through the one colour reader and
      comes back as plain CSS. A value the reader does not know (most CSS
      colour NAMES: the table holds hex, rgb, hsl, oklch and the Tailwind
      names) is left as written, earns no role, and is therefore absent from
      DESIGN.md and design.tokens.json alike — the two never disagree.
    - `small: .125rem` (2px, an icon trick) as a type level; `xs: -0.5rem` as a
      spacing step. Outside 8–200px it is a mechanism, not a level, and a
      negative margin is a technique, not a step.
    - "Headings are set in Inter" over a front matter that said `Times`: the
      prose was reading the knob's label while the tokens came off the screen.
    - `primary` and `text` could both vanish when the brand IS the body ink,
      because the dedupe ran on them too. Those two roles are structural: they
      appear even when they are the same colour.

148. The caching question, measured rather than reasoned. Nothing of a dropped
    build is kept: the Cache API is empty, there is no IndexedDB, and the
    service worker sets `no-store` on purpose (a cache keyed by URL would
    serve the rewritten sheet to the raw control and poison the 1:1 check).
    Every drop calls buildProject afresh — new id, every entry re-read, the
    sheet re-tokenised, the baseline re-derived.

    But the GUEST's own storage did survive. The sandbox is same-origin by
    design, which is what makes the frame writable and the 1:1 check possible,
    and it also means a dropped app can write to localStorage on uisandbox.org:
    `mantine-navbar-opened` was still there after the project was closed. Left
    alone it is wrong twice — a second drop of the same build looks cached
    because the app restores its own state, and one tenant's state carries into
    the next on an origin whose whole promise is that nothing of yours sticks
    around. `purgeGuestStorage()` runs on load and on close; ours (`us-`,
    `uicockpit.`) survive, theirs do not.

149. The CSS named colours, and how little they turned out to matter.
    `parseColor` knew hex, rgb, hsl, oklch and the Tailwind names, so `red`,
    `navy`, `grey`, `silver` and the rest returned null — and an unreadable
    colour lands in the `keep` family, frozen. On a page written in names the
    hue dial moved the hex colours and left the named ones where they were.
    Fixed at the one parser (CSS_NAMED in colorspace.mjs); `currentColor` stays
    unreadable on purpose, it has no value of its own.

    Then the measurement, which did not support the reason for doing it:
    across published classless sheets colour NAMES are rare — Tacit 0 of 43,
    MVP 0 of 20, new.css 0 of 18, github-markdown 0 of 126. Only Tufte (1 of 6,
    its `red` sidenote numbers), TodoMVC (2 of 209) and web-design-in-4-minutes
    (1 of 22) use any. Hand-written CSS in 2026 is written in hex like
    everything else. So this is a correctness fix with a small blast radius,
    not the step change the synthetic probe (7 of 11 unreadable) suggested.

    What plain CSS gets right already, checked at the same time: the shorthand
    is decomposed (`border: 1px solid grey` → a border-width AND a colour),
    `font-weight: bold` maps to 700 and `normal` to 400, `padding: 4px 8px`
    becomes two spacing entries. The keyword sizes (`font-size: medium`,
    `border-width: thin`) are NOT tokenised and stay as they are — a page built
    on them will not answer the size dials. Rare enough to leave, stated here
    rather than silently missing.

    Gate over the 52 s16 fixtures (the classless, hand-written population):
    48 ok · 2 differs · 1 refused · 1 no-load, no new rewriter gap. The one
    apparent regression, `s16-coloris`, is the fixture: its picker animates its
    own gradient, and on a re-run the CONTROL side changed too (rgb(224,210,82)
    → rgb(224,213,82)) — a frame we serve untouched, so nothing of ours can
    reach it. Recorded as a known `differs`, same class as chroma's random
    palettes.

150. The fear we had not designed for. Feedback from a first user, two fears,
    and only the first was one we had answered: (a) "you will have my files",
    and (b) "the changes will be written straight into my own code folder".
    (b) is not a trust problem, it is a MENTAL MODEL problem — he thought
    dropping a build opened a live connection to his project. And our own
    words feed it: "drop your built web app", "export the change as a patch",
    and above all `npx uisandbox-mcp open`, a CLI you point at a folder.

    Denying it in prose does not fix a picture problem, so the boundary is
    drawn instead (`.cross`, above the numbered steps): your folder on one
    side, this tab on the other, one arrow in ("a copy of your build"), one
    arrow out ("only when you press Export"), and a dashed rule between them
    saying nothing crosses on its own. It stacks on a phone so the story reads
    top to bottom.

    And one line inside the drop zone itself, for the reader who gets no
    further: "A copy is read into this tab. Your folder is never touched."
    (The two clauses are deliberately the same length; `text-wrap: balance`
    then breaks at the full stop instead of mid-clause.)

    Checked while writing it, because the claim has to hold for the MCP route
    too: `mcp/server.ts` imports `readFileSync, existsSync, statSync` and
    `mcp/zipdir.ts` imports `readdirSync, readFileSync, statSync`. No write
    function is imported anywhere in the package. That is a claim a sceptic
    can check in four import statements, which is the kind we prefer.

151. The headline stopped claiming and started explaining. "Play with your real
    app's design, live." had a word working against us: `live` means "instantly,
    no rebuild" to us and "connected to my repo, updating in real time" to a
    reader who is already nervous (see #150). Six rounds of alternatives, and
    what landed was not a better metaphor but a plainer structure:

      Play with your app's design in a safe sandbox.
      Drop your build, turn the knobs, export the code.

    The kicker ("Test your design on the real thing") is gone: above the
    headline it was a label nobody reads. The three beats took its place BELOW
    the headline, where they answer the only question a first visitor has. The
    paragraph then no longer has to restate the loop and spends its words on
    what the beats cannot say: where it runs, how faithful it is, that nothing
    is kept, and what comes out.

    Rolled through every place the line lives, because they drift apart the
    moment they are edited separately: the h1, the tab title, the meta
    description, the JSON-LD slogan and description, the web manifest, the OG
    image template, the release-note template, the README, both llms.txt files,
    the marketing copy, and the three published descriptions (npm, the MCP
    registry, the plugin) — those last three take effect on their next publish.
