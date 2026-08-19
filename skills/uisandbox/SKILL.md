---
name: uisandbox
description: Test a design change on a real, built web app — load it in UISandbox, turn its own knobs (brand, colours, fonts, radius, spacing…), verify it still renders 1:1, get a screenshot and the patch. Use when someone wants to try a colour, font, spacing or radius change on an existing site or app, asks "would this design change work on my site", or wants design tokens / a CSS patch derived from a real build. Needs the `uisandbox` MCP server (npx -y uisandbox-mcp).
---

# /uisandbox — test a design on the real thing

UISandbox renders a BUILT web app 1:1 and turns every CSS literal into a knob
that moves the app's own value. The MCP server exposes that as tools. This
skill is the procedure around them.

## Before anything

- You need the MCP server `uisandbox`. If its tools (`load`, `set`, `export`,
  `verify`, `screenshot`) are not available, tell the user:
  `claude mcp add uisandbox -- npx -y uisandbox-mcp` (and, for verify /
  screenshot, `npx playwright install chromium` once). Do not try to emulate
  the tools.
- A BUILD is needed — `dist/`, `build/`, `out/`, or a repo zip that carries
  the build. Source alone is refused with a reason; say so and suggest
  `npm run build` (or the framework's equivalent) first.

## The procedure

1. **Load.** `load` with `zipUrl` (a URL the server can fetch — a GitHub
   `…/archive/refs/heads/<branch>.zip` works) or `zipPath` (a local zip).
   Read the answer: screens, values, and the baseline — brand, fonts, which
   colour families the CSS actually contains, palette, canvas, dark mode. Tell
   the user what was found in two lines. If `refused`, relay the reason.
2. **Set.** Translate the request into knobs — `cPrimary` for "brand /
   primary colour", `cBackground` for the page background, `fontDisplay` /
   `fontBody`, dials with ×1 = as is (`radius`, `space`, `type`,
   `lineHeight`, `tracking`, `weight`, `borderWidth`, `shadow`, `motion`),
   `hue`/`sat`/`contrast` for "warmer / duller / punchier overall", family
   colours (`cSuccess` …) only when the baseline lists that family, `dark`
   to switch their dark mode. Call `set`; report how many values moved and
   the sample. Prefer one change at a time so the user can see cause and
   effect; `reset: true` to start over.
3. **Verify.** `verify` — the 1:1 check in a real browser. Report the
   result honestly: paired elements, differences (should be 0), reach (what
   share of painted colours/type/radii the knobs touch) and any warning
   ("is this the built app?", missing files). If it says "differs", that is
   a UISandbox gap, not the user's code — say so and report the first lines.
4. **Show.** `screenshot` (optionally `screen`, `width`). Describe what
   changed; never claim a change the knobs cannot reach (images, canvas).
5. **Hand over.** `export` — `patch` for "what do I change in my source",
   `sheet-css` for a drop-in stylesheet of their values, `tokens-css` /
   `tailwind` / `shadcn` for design tokens, `swift` / `android-*` for native.
   Give the file contents or save them where the user asked.

## Rules

- Never promise more than `verify` and the reach meter report. "1:1" is a
  measured claim; quote the numbers.
- Nothing is uploaded by the tool; `load` by URL fetches the zip into the
  server process only. Say that when asked where the files go.
- Keep the user's own vocabulary for colours ("our teal"), but always show
  the hex that moved.
- One screen at a time; `screens` lists them.
