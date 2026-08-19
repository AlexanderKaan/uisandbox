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

`verify` and `screenshot` need a browser: `npx playwright install chromium` once (playwright is an optional peer dependency — `load`/`set`/`export` work without it).

## Tools

| tool | input | returns |
|---|---|---|
| `load` | `zipUrl` or `zipPath` | project id, screens, values, the baseline (brand, fonts, families, palette, canvas, dark mode) — or a refusal with the reason |
| `screens` | `id` | the screens |
| `set` | `id`, `knobs` — `cPrimary`, `fontDisplay`, `fontBody`, dials (`radius`, `space`, `type`, `lineHeight`, `tracking`, `weight`, `borderWidth`, `borderTone`, `shadow`, `motion`, `hue`, `sat`, `contrast`, `gradAngle`), `cBackground`, family colours, `dark`, `reset` | what moved (count, sample) |
| `export` | `id`, `format` — `sheet-css` · `sheet-json` · `patch` · `tokens-css` · `tokens-json` · `tailwind` · `shadcn` · `swift` · `android-xml` · `android-kotlin` | text |
| `verify` | `id`, `screen?`, `width?` | the 1:1 check in headless Chromium (untouched vs. tokenised, computed styles per element) + reach |
| `screenshot` | `id`, `screen?`, `width?` | PNG of the screen with the current knobs |

`load`/`set`/`export` are pure Node. `verify`/`screenshot` drive the real app (`UISANDBOX_URL`, default `https://uisandbox.org`) with the archive served from a route inside the headless browser — the number an agent gets is the number a visitor gets.

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

> Test my design: load https://github.com/me/site/archive/refs/heads/gh-pages.zip in UISandbox, set the brand to #e11d48 and radius ×1.5, verify it is still 1:1, show me a screenshot, and give me the patch.
