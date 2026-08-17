# UISandbox

Your existing app, 1:1, in a sandbox — then turn the knobs. Open source, MIT.

Drop the **built** site (`dist/`, `build/`, `out/`, or any folder with an `index.html`) as a zip or folder. Every colour, radius, font, size, spacing and shadow literal in its CSS becomes a variable holding the very same value — so the page renders exactly as it was — and the fourteen knobs (brand, neutrals, fonts, text size, scale, radius, elevation…) then move *your* values, live. Export what you see: your values as CSS/JSON/a patch list, the `--k-*` tokens for web, and Swift constants + an asset catalog for iOS.

Nothing leaves the tab: files are read in the page and served to the frame by a service worker on this origin.

```bash
pnpm install
pnpm dev        # http://localhost:5190
pnpm test       # vitest + node:test (audit engine)
pnpm build
```

Demo: `http://localhost:5190/?load=/fixtures/acme-dist.zip` (a small static site) — `?load=` accepts any same-origin/CORS zip URL, which is also the door an agent uses.

## How it works

```
src/
  sandbox/
    rewrite.ts   their CSS/HTML → literals replaced by var(--us-vN); byte-preserving
    table.ts     the substitution sheet: one entry per (kind, value), with sites
    mapping.ts   knob → their values, RELATIVE to the baseline (identity at rest)
    baseline.ts  the knobs on the stand of THEIR code (audit + the sheet itself)
    project.ts   root detection · screens (HTML entries) · raw + rewritten files
    host.ts      owns the sandboxes, answers the service worker; live vars injected into HTML
    verify.ts    the 1:1 check: raw vs identity, computed styles per element
    live.ts      MutationObserver: runtime style="" and <style> get the same rewrite
  public/sw.js   serves /__sb/<sid>/… (and root-relative URLs of a sandbox document) from the page
  tokens/ panel/ state/ export/ audit/   from UIcockpit — see HANDOFF.md
```

The claim "1:1" is measured, not felt: **Check 1:1** loads the untouched build and the tokenised build side by side and diffs the computed styles of every element (18 properties). Zero differences or it says what differs.

## Scope, honestly (sprint 1)

- **Web builds** render 1:1. Source repos are audited for the knob stand; rendering needs the build output inside the archive.
- **Screens** = the HTML entries under the root. Routes of a single-page app (the JS router) are not enumerated yet; the frame navigates, and the worker falls back to `index.html` for extension-less paths.
- **Runtime styles** are caught live: `style=""` set by JS and appended `<style>` by a MutationObserver; rules inserted through `CSSStyleSheet.insertRule`/`replaceSync` (styled-components, Emotion, Lit) by a hook installed before their bundle runs.
- **Cross-origin stylesheets** (a CDN `<link>`) cannot be rewritten by the worker; their literals stay literal.
- **iOS**: no browser renders SwiftUI. Export Swift constants + an asset catalog from the knobs; a simulator-screenshot render is a later step.
- **MCP**: not yet — the engine is one function per step (`buildProject` · `deriveBaseline` · `computeVars` · `gen*`), so the server is a thin shell over it.

Read `PROMPT.md` (the idea, the hard nuts), `HANDOFF.md` (what came from UIcockpit) and `notes/` (the traps that cost time) before changing the token plumbing.
