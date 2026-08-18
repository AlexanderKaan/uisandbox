# UISandbox MCP server

The same engine the browser runs, as tools for an agent — no second implementation.

```bash
pnpm mcp                                   # stdio server (from a clone of the repo)
UISANDBOX_URL=http://localhost:5190 pnpm mcp   # render tools against a local app instead of uisandbox.org
npx tsx mcp/smoke.ts fixtures/x.zip        # load → set → export → verify → screenshot
```

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
    "uisandbox": {
      "command": "npx",
      "args": ["tsx", "/path/to/uisandbox/mcp/server.ts"]
    }
  }
}
```

Claude Code: `claude mcp add uisandbox -- npx tsx /path/to/uisandbox/mcp/server.ts`

## A prompt to paste

> Test my design: load https://github.com/me/site/archive/refs/heads/gh-pages.zip in UISandbox, set the brand to #e11d48 and radius ×1.5, verify it is still 1:1, show me a screenshot, and give me the patch.
