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
  [Ideelab](https://ideelab.nl/) · [MIT](https://opensource.org/licenses/MIT),
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

## Promotie — the two-stage launch (after A–D)

What is built is only half of being found. The plan is a SOFT launch for
substance and stars, then the broad one — because the two audiences judge
differently: HN readers forgive an empty repo and reward measured honesty;
PH visitors (and the listicles that mine PH) read social proof first — the
star count, the release, the activity. A repo that says 4 stars undercuts a
front-page launch; Show HN is the honest way to not be at 4. Never post both
the same day: answering comments all day IS half the result, and there is
one of us.

**Stage 0 — the understream (done or account-work, before anything posts):**

- **Assets** (done): the montage (ten builds, brand → shuffle) and the
  Agency demo clip, gif + mp4, in `brand/marketing/gif/`; stills and copy in
  `brand/marketing/`; OG from the live hero. Remaining: the montage GIF at
  the top of the README (wearing the first five seconds of a stranger's
  attention).
- **MCP directories** (registry done; forms are account-work): Smithery
  (one-click installs, real traffic), Glama (claim the auto-made card),
  PulseMCP. Each card links the repo — a steady drip of MCP-curious
  developers, star by star.
- **Awesome lists**: a one-line PR to `punkpeye/awesome-mcp-servers` (and
  `wong2/awesome-mcp-servers`) with the one-liner from
  `brand/marketing/copy.md`. Quiet, permanent, compounding.
- **Search Console + Bing** (account-work): domain property `uisandbox.org`
  via a DNS TXT in Cloudflare, submit `sitemap.xml`, Request indexing on the
  homepage; Bing Webmaster imports from GSC in one click (feeds Bing,
  DuckDuckGo and the AI browsers). "Couldn't fetch" right after submitting
  is a queue, not an error — verified reachable (200, valid XML, Googlebot
  UA passes).

**Stage 1 — Show HN, the soft launch (the star source):**

- Audience: developers. They star, fork and DROP THEIR OWN BUILDS — this is
  where hold-out reports and real-world bugs come from, and each becomes a
  fixture.
- Title "Show HN: UISandbox – restyle a built web app in the browser, 1:1,
  and export the patch". First comment from `brand/marketing/copy.md`: what
  it does, how "1:1" is measured, what it refuses and why, nothing leaves
  the tab, the MCP server, the honest limits. HN rewards the honesty
  paragraph more than the feature list; answer with measurements, not
  defence.
- No staging possible: title + first comment are everything; a Show HN that
  does not land may be reposted once after a few days.
- Support, same week, NOT same day: the pinned X post (the montage MP4, the
  written thread), and ONE niche channel where we genuinely answer
  (Tailwind/shadcn Discord showcase, r/SideProject) — one place, no spray.
- Between the stages: fix what HN's builds surface (each odd build is the
  next fixture), let the star count settle.

**Stage 2 — Product Hunt, the broad launch (a few days later):**

- Audience: makers, designers, marketers. They upvote, try the site and
  share; they barely star — which is why the stars must already be there.
- Everything is staged and ready in draft: tagline "Play with your real
  app's design, live", the 492-char description, gallery (hero still, the
  montage GIF, stage, the 1:1 card, the Agency clip), shoutouts (Cloudflare,
  Figma, Vite), maker comment with the "Try a sample" line and the limits
  paragraph. Launch Tuesday–Thursday, 00:01 PT, answer all day.
- What PH adds that HN does not: reach outside the dev bubble, the
  permalink/badge, and the listicles ("best design tools of …") that mine
  PH for months afterwards.

**Always-on, after both:**

- X follow-ups: one knob per post (Brand, Background, Dark mode, the reach
  meter), each a 6-second clip cut from the montage pipeline
  (`scripts/og/montage.mjs`, `scripts/og/demo-gif.mjs`).
- **Where designers ask** (not spam): one answer each, with the GIF, in
  threads that already exist — r/web_design, r/Frontend, Designer News. The
  question to answer is "how do I try a colour on my live site without
  rebuilding".
- GitHub stays looking lived-in: releases per MCP version are automatic
  (`.github/workflows/release.yml`); the hold-out counter in the README is
  the living proof line — keep it current.
- Done when: Show HN posted and answered, PH launched with the stars
  already on the counter, Smithery + Glama list the server, GSC indexes the
  claim, and analytics (once on) say where people came from.

## Sprint E — After launch (parked, in order of pull)

- The **performance ceiling**: measure CSS size vs. time to first paint
  (Bootswatch's 45 MB froze the tab) and say the limit at the door instead of
  freezing.
- **iOS render** via a simulator screenshot (the Swift export exists; the
  picture does not).
- **Reach beyond CSS**: raster logos through a colour map? Probably never —
  the meter says "outside" and that is the honest answer.
- Whatever the analytics say people drop and where they leave.
