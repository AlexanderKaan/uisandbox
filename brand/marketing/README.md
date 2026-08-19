# Marketing materials

All rendered from the real app (nothing drawn by hand) — regenerate after a design change.

| file | what | made by |
|---|---|---|
| `og-site-light.png` | **the OG image in use** (`public/og.png`): the live landing, hero + door, 1200×630 | `node scripts/og/og-from-site.mjs <outdir>` |
| `og-site-dark.png` | the same, dark scheme | idem |
| `og-panel-template.png` | the earlier template OG: knobs panel + "1:1 verified" chips — for a gallery slide that shows the work | `node scripts/og/render.mjs` |
| `site-hero-light-1440.png` | the clean hero, 1440 wide @2x — README header, Product Hunt gallery, X | `node scripts/og/site-shot.mjs <outdir>` |
| `stage-acme-brand-crimson.png` | a real build (our acme fixture) in the sandbox, Brand turned to crimson | `node scripts/og/shots.mjs` |
| `verify-card.png` | the 1:1 check card | idem |

Lines to use with them: *Restyle your app without rebuilding it.* · *Try a new look on your real app — in seconds.* · kicker: *Test your design on the real thing.*

## Social preview (GitHub)

Repo → Settings → General → *Social preview* → Edit → upload `og-site-light.png` (1200×630; the same image the site's link card uses). Topics to set: `design-tokens`, `design-system`, `theming`, `css`, `sandbox`, `mcp`, `mcp-server`, `claude-code`.

Copy per channel: [`copy.md`](copy.md).
