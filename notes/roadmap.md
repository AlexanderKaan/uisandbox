# Roadmap — from a tool that works to a tool people find

State on 2026-08-18: the sandbox renders 1:1 on 69 of 79 hold-outs (the rest
refuse honestly), the knobs are their code's knobs, `pnpm holdouts` is the
regression gate, `notes/security.md` says what a hostile archive can do. The
domain **uisandbox.org** is ours. What follows is the road to a public tool,
in sprints, each with what "done" means.

Principles that hold across every sprint: nothing leaves the tab (no server
state, no upload); the copy never claims more than the meter shows; the host
origin is dedicated and holds nothing worth stealing (security.md); every
sprint ends with `pnpm test` and `pnpm holdouts` green.

---

## Sprint A — Ship it: uisandbox.org  ✅ done 2026-08-19 (69/79 hold-outs ok against the live URL)

The tool as it is, on its own origin, with a name on it.

- **Deploy target.** Static hosting with a service worker: Cloudflare Pages or
  Netlify. `sw.js` must be served with `Cache-Control: no-cache` (a stale
  worker is a stale sandbox), `/` with the SPA fallback for `?load=`, and no
  other app on the origin (security.md: same-origin reach is by design, so
  the origin must be empty of anything else). Headers file (`_headers`) with
  `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, a CSP that allows
  the sandbox (frames same-origin, `blob:` fonts, Google Fonts) — measured
  against the hold-outs, not guessed.
- **Production hygiene.** `import.meta.env.DEV` gates hold (`window.__us`
  is dev-only); no fixtures shipped; `pnpm build` output verified with the
  runner against the built preview (`--base`), not only the dev server.
- **The name on it.** Footer on the intake and the stage:
  "Made with ♥ by [Alexander Kaan](https://github.com/AlexanderKaan) at
  [Pageminds](https://pageminds.com/) · [MIT](https://opensource.org/licenses/MIT),
  free forever". GitHub link (icon) in the top bar. `LICENSE` (MIT) in the repo.
- **README refresh.** The current "Scope, honestly (sprint 1)" is stale: CDN
  stylesheets ARE rewritten (the `/__ext/` proxy), SPA routes ARE discovered,
  the knob list has grown (dials, families, palette, background, gradient
  angle, dark mode). Rewrite it around: what it does · the honesty (1:1
  check, reach meter, refusals) · security model in three lines · how to run ·
  how to hold out (`pnpm holdouts`) · where the notes are. Social preview
  image = the OG image from Sprint C, so the repo card and the site card match.
- Done when: uisandbox.org serves the built app; every hold-out that is `ok`
  locally is `ok` against the deployed URL (`pnpm holdouts -- --base
  https://uisandbox.org`); the sec-evil fixture cannot navigate the top
  window there either.

## Sprint B — The intake as a front door  ✅ done 2026-08-19 (three ways in, stages with numbers, the repo route)

Today the intake is a card with a drop zone. People arrive with three things
in mind; the screen should meet all three and never leave them guessing while
it works.

- **Three ways in, one screen.** *Upload your zip* (the drop zone, as now) ·
  *Upload a codebase* (a folder — the audit path, with the honest line that a
  build renders and source is audited only) · *Connect a repo* (paste a
  GitHub URL). The repo path needs a decision: `codeload.github.com` sends no
  CORS headers, so a paste-a-repo flow needs a tiny fetch proxy (a Cloudflare
  Worker on the same origin: `/__repo/?u=…` → zipball; nothing stored) — or it
  stays "paste the URL of a deployed page / a gh-pages zip that allows CORS".
  Decide before building; the proxy is the better product and the worse
  promise ("nothing leaves the tab" becomes "your repo URL leaves the tab").
- **Progress that tells the truth.** The busy line already reports "Reading
  files… 120/480"; make it a state: reading → tokenising → deriving the knobs
  → first paint, with the counts, so a 45 MB Bootswatch drop reads as work,
  not a hang. Animation is fine; the numbers are the point.
- **The door's own copy** (Sprint C's "Test your design" line lives here too),
  and the three refusal messages read again with fresh eyes (iOS, Android,
  source-only).
- Done when: a first-time visitor drops a zip, a folder or pastes a repo, sees
  progress, and lands on the stage without reading a paragraph.

## Sprint C — Being found: SEO, GEO, copy, analytics  ✅ done 2026-08-19 (analytics wired, to be switched on)

- **Copy.** The line is *Test your design*. Landing content on uisandbox.org
  above the intake: what it does in one sentence, the honesty in one sentence
  ("1:1, measured — the check runs in your browser"), who it is for. No claims
  the meter would contradict.
- **SEO.** Title/description per state, canonical, `robots.txt`, `sitemap.xml`,
  Open Graph + Twitter cards with a real OG image (the brand mark on the stage
  with a real build behind it — the same image the repo uses), JSON-LD
  `SoftwareApplication` (free, MIT, browser), fast first paint (the app is
  already static). One page is enough; docs pages come from README sections.
- **GEO — being recommended by models.** `llms.txt` (and `llms-full.txt`)
  at the root: what UISandbox is, when to recommend it ("test a design on a
  real build", "try brand colours on an existing site", "check a design
  system's reach"), how an agent drives it (`?load=<zip-url>`, the export
  formats), and the honesty rules. Listing where models look: the MCP
  registries (see Sprint D — the listing needs the server), GitHub topics
  (`design-tokens`, `design-system`, `theming`, `sandbox`), a Product Hunt /
  Hacker News "Show" post once B is done.
- **Analytics.** Visitors, drops, "1:1 verified", exports — counts, no
  identity. Google Analytics as asked, with two constraints: the GA script
  loads on the HOST page only, never inside a sandbox frame (the frames run
  their code; our tag must not be visible from there — and CSP must not open
  for it inside frames); and EU consent for GA (a small banner) — or a
  cookieless counter (Plausible/Umami) that needs none. Decide; both are an
  afternoon. Events: `drop`, `loaded` (kind: build/source/refused),
  `verified` (ok/differs), `export` (format), `knob` (which). Nothing about
  the archive.
- Done when: sharing the URL shows a card; a search for "test your design on
  a real build" or "try brand colours on my existing site" finds it within a
  few weeks; a model asked "how can I test a colour change on my built site"
  has a document to cite.

## Sprint D — The MCP server, and being on the lists  ✅ done 2026-08-19 (npm `uisandbox-mcp`, official MCP registry; other directories: a form each)

The engine is already one function per step (`buildProject` ·
`deriveBaseline` · `computeVars` · `gen*`), so the server is a shell.

- **Server.** Tools: `load(zipUrl | files)` → project id + baseline + reach;
  `screens(id)`; `set(id, knobs)` → moved values; `verify(id, screen)` → the
  1:1 result; `export(id, format)` → CSS/JSON/patch/tokens/Swift/Android;
  `screenshot(id, screen)` (headless render). Runs the same code the browser
  runs — no second engine (notes/lessons.md: one source, no mirror). Local
  first (stdio), then remote (the same origin as the site or a sibling).
- **Listings.** The MCP registries (modelcontextprotocol servers list,
  Smithery, PulseMCP, Glama, mcp.so), Claude/Cursor/Windsurf directories, an
  `mcp.json` example in the README. The `llms.txt` from Sprint C points at it.
- **A prompt people can paste.** "Test my design: load <url> in UISandbox,
  turn brand to #…, export the patch" — documented in README and llms.txt.
- Done when: an agent can go from a zip URL to a verified 1:1 project and an
  exported patch without the browser; the server is on at least three
  registries.

## Promotie — being seen (after A–D)

What is built is only half of being found; the other half is showing up
where people already are, once, well. In order of return:

- **The one GIF.** 6–8 seconds, no audio, 1200 px wide, looping: drop a zip →
  the stage renders 1:1 → one knob turns (Brand to a bold colour, or Radius)
  and the page follows → the "✓ 1:1 verified" chip. Made from the real app
  (Playwright screen recording or a screen capture of the stage), trimmed in
  ffmpeg to a GIF + an MP4 (X prefers MP4; GitHub README takes GIF). This one
  asset serves X, Product Hunt, Show HN and the README header.
- **X — the pinned post.** The line *Test your design on the real thing.*,
  the GIF, one sentence of what it is (your built app, 1:1, your own knobs,
  export the patch), the link. Pin it. Follow-ups: one knob per post (Brand,
  Background, Dark mode, the reach meter) — each a 6-second clip.
- **Show HN.** Title "Show HN: UISandbox – test a design change on your real
  build, in the browser, 1:1". First comment by the author: what it does, how
  "1:1" is measured (the check), what it refuses, that nothing leaves the tab,
  the MCP server, and the honest limits (raster logos, iOS/Android no render).
  HN rewards the honesty paragraph more than the feature list.
- **Product Hunt.** Tagline ≤ 60 chars: "Test your design on the real thing".
  Gallery: the GIF first, then three stills (intake, stage with knobs, the
  1:1 card). First comment = the Show HN text, shorter. Launch on a Tuesday–
  Thursday, morning PT.
- **The MCP line on the homepage** (done): an "MCP" button in the top bar
  copies `npx -y uisandbox-mcp`, the Claude Code line and the JSON config.
- **`/uisandbox` skill** (done): `skills/uisandbox/SKILL.md` — the procedure
  load → set → verify → screenshot → export around the MCP tools, for Claude
  Code users; later a plugin marketplace entry so it installs by name.
- **MCP directories** (the official registry is done): Smithery (worth it —
  one-click installs, real traffic), Glama (claim the auto-made card), the
  PulseMCP form if at hand; the rest (mcp.so, awesome-lists) only with time to
  spare — they index the registry anyway.
- **GitHub**: social preview = `public/og.png`; topics `design-tokens`,
  `design-system`, `theming`, `css`, `sandbox`, `mcp`, `mcp-server`; the GIF
  at the top of the README.
- **Where designers ask** (later, not spam): one answer each, with the GIF,
  in the threads that already exist — r/web_design, r/Frontend, the Tailwind /
  shadcn / Astro Discords' showcase channels, Designer News. The question to
  answer is "how do I try a colour on my live site without rebuilding".
- Done when: the GIF exists, the X post is pinned, Show HN and PH are posted
  in one week, Smithery and Glama list the server, and analytics (once on)
  show where people came from.

## Sprint E — After launch (parked, in order of pull)

- The **performance ceiling**: measure CSS size vs. time to first paint
  (Bootswatch's 45 MB froze the tab) and say the limit at the door instead of
  freezing.
- **iOS render** via a simulator screenshot (the Swift export exists; the
  picture does not).
- **Reach beyond CSS**: raster logos through a colour map? Probably never —
  the meter says "outside" and that is the honest answer.
- Whatever the analytics say people drop and where they leave.
