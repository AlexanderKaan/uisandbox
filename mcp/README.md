# UISandbox MCP server

The same engine the browser runs, as tools for an agent — no second implementation.

```bash
npx uisandbox-mcp                          # the published package (stdio); add it to your client as below
UISANDBOX_URL=http://localhost:5190 npx uisandbox-mcp   # render tools against a local app instead of uisandbox.org

# from a clone of the repo:
pnpm mcp                                   # stdio server straight from the sources (tsx)
pnpm mcp:build && pnpm mcp:pack            # bundle the engine into mcp/dist/server.mjs and pack uisandbox-mcp
npx tsx mcp/smoke.ts fixtures/x.zip        # load → set → export → verify → screenshot (MCP_CMD to point at a build)
```

`verify` and `screenshot` need Chromium: `npx playwright install chromium` once (Playwright ships with the package; only the browser is downloaded — `load`/`set`/`export`/`open` work without it).

## Tools

| tool | input | returns |
|---|---|---|
| `load` | `zipUrl` or `zipPath` | project id, screens, values, the baseline (brand, fonts, families, palette, canvas, dark mode) — or a refusal with the reason |
| `open` | `id`, `screen?` | **the sandbox itself** in the user's browser — the web app ships in the package and is served from 127.0.0.1 by this process with the archive; what the user turns flows back (`state`) |
| `state` | `id` | the knobs now, including what was turned by hand in an opened sandbox |
| `screens` | `id` | the screens |
| `set` | `id`, `knobs` — `cPrimary`, `fontDisplay`, `fontBody`, dials (`radius`, `space`, `type`, `lineHeight`, `tracking`, `weight`, `borderWidth`, `borderTone`, `shadow`, `motion`, `hue`, `sat`, `contrast`, `gradAngle`), `cBackground`, family colours, `dark`, `reset` | what moved (count, sample) |
| `export` | `id`, `format` — `sheet-css` · `sheet-json` · `patch` · `tokens-css` · `tokens-json` · `tailwind` · `shadcn` · `swift` · `android-xml` · `android-kotlin` | text |
| `verify` | `id`, `screen?`, `width?` | the 1:1 check in headless Chromium (untouched vs. tokenised, computed styles per element) + reach |
| `screenshot` | `id`, `screen?`, `width?` | PNG of the screen with the current knobs |

`load`/`set`/`export`/`state` are pure Node. `open` serves the bundled app on 127.0.0.1 and opens the browser — nothing leaves the machine. `verify`/`screenshot` drive the app in headless Chromium (the bundled one on 127.0.0.1; `UISANDBOX_URL` to point elsewhere) with the archive served from a route inside the browser — the number an agent gets is the number a visitor gets.

The conversation this is built for: *"Can I look at this app in a sandbox and change the design a bit?"* → the agent builds, `load`s, `open`s; you play in the real sandbox; *"export what I did"* → `state` → `export`.

## Without an agent

```bash
npx uisandbox-mcp open ./dist          # a folder or a zip: the sandbox opens in your browser, served from 127.0.0.1
```

## Slash commands

Where the client shows MCP prompts (Claude Desktop, Claude Code): `/uisandbox:open` (build the current repo, load, open the sandbox) and `/uisandbox:try <change>` (apply, verify 1:1, screenshot, patch). The server also sends `instructions` to the client, so the model knows when to offer the sandbox on its own.

## Claude Desktop / Claude Code / Cursor

```json
{
  "mcpServers": {
    "uisandbox": { "command": "npx", "args": ["-y", "uisandbox-mcp"] }
  }
}
```

Claude Code: `claude mcp add uisandbox -- npx -y uisandbox-mcp`

## Publishing (maintainer)

`pnpm mcp:pack` → `cd mcp && npm publish` (the `files` field ships `dist/server.mjs`, README, LICENSE only). `mcp/server.json` is the manifest for the official MCP registry (`mcp-publisher publish` from `mcp/`); the other directories (Smithery, PulseMCP, Glama, mcp.so) take the npm name.

## A prompt to paste

> Open this app in UISandbox so I can play with the design — build it first. (…later…) Export the patch for what I changed.

> Test my design: load https://github.com/me/site/archive/refs/heads/gh-pages.zip in UISandbox, set the brand to #e11d48 and radius ×1.5, verify it is still 1:1, show me a screenshot, and give me the patch.
