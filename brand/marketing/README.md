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

Lines to use with them: *Play with your real app's design, live.* (the claim) · *Restyle your app without rebuilding it.* (second line) · kicker: *Test your design on the real thing.*

## Social preview (GitHub)

Repo → Settings → General → *Social preview* → Edit → upload `og-site-light.png` (1200×630; the same image the site's link card uses). Topics to set: `design-tokens`, `design-system`, `theming`, `css`, `sandbox`, `mcp`, `mcp-server`, `claude-code`.

Copy per channel: [`copy.md`](copy.md).

## The demo clip (gif/)

`demo-agency.gif|mp4` (the landing page — brand yellow → sky → ember, the whole hero follows) and `demo-metro.gif|mp4` (the docs site). ~8 s, 1200 px mp4 / 1000 px gif, looping, no audio. Recorded from the real app by `node scripts/og/demo-gif.mjs` (Playwright video, dev server on :5190), cut with ffmpeg: hero + click (1.4 s), then the stage at 1.2× from the moment it renders to the 1:1 card. PH gallery first slot, X (mp4), README header (gif).

`montage-10-sites.gif|mp4` — ten real builds in a row (Bootstrap docs, VitePress, SB Admin 2, Material Tailwind, visx, Agency, vue-element-admin, anime.js, Metro, NES.css): as loaded → a brand theme → Shuffle, 0.7/0.7/1.0 s per step, title card from the live hero at both ends, ~28 s. Stills by `node scripts/og/montage.mjs`, assembled with ffmpeg's concat demuxer (list.txt with durations) → mp4 1280 px, gif 960 px at 8 fps. For X use the mp4; PH takes the gif.
