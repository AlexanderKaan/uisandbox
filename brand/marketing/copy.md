# Copy — the lines, per channel

The three lines, in this order of use: **Restyle your app without rebuilding it.** (headline) · *Try a new look on your real web app — in seconds.* (body) · *Test your design on the real thing.* (kicker/slogan). Never claim more than the meter shows: "1:1" is measured, images/canvas are outside, iOS/Android do not render.

## X — the pinned post (with the GIF or `site-hero-light-1440.png`)

Play with your real app's design, live.

Drop the build of your web app into UISandbox → it renders 1:1 (measured, not promised) → every colour, font, radius and spacing in its CSS becomes a knob → turn them, watch the real app follow, export the patch.

Your files never leave your browser. Free, MIT.
→ https://uisandbox.org

*Thread, one per post (each with a 6-s clip):*
1. "Brand" — the one knob everyone turns first. Your brand colour and every colour in its family move together; the rest stays.
2. "Check 1:1" — the untouched build and the tokenised build, side by side, computed styles of every element diffed. Zero differences, or it says what differs.
3. "Background" — page background as a colour, surfaces follow a step above.
4. "Dark mode" — switched on your own hooks, no theme rewrite.
5. Agents — `npx uisandbox-mcp`: "open this app in UISandbox" in Claude Code builds, loads and opens the real sandbox; "export what I changed" works after.

## Show HN

**Title:** Show HN: UISandbox – restyle a built web app in the browser, 1:1, and export the patch

**First comment (author):**
I built UISandbox because I kept wanting to see a colour or a font on the *actual* app before touching the code — not in Figma, not in a rebuilt fork.

You drop the built app (dist/, a folder, or a public GitHub repo). A service worker serves it inside the page, and every CSS literal is replaced by a variable holding the very same value — so it renders exactly as it was (runtime styles, CDN stylesheets and nested frames included). Then the knobs move *your* values: brand and the colour families your CSS actually contains, background, fonts, text size, line height, letter spacing, weight, spacing, radius, border width, elevation, motion, hue/saturation/contrast, your dark mode. Export: CSS, JSON, a patch list, your files patched, design tokens (CSS/Tailwind/shadcn), Swift and Android constants.

What I cared about most is honesty. "1:1" is measured: a check loads the untouched build and the tokenised one side by side and diffs computed styles of every element — zero differences or it says what differs. A reach meter says how much of what you see the knobs touch and what lies outside (images, canvas). It refuses what it cannot show (iOS/Android, source without a build) with a reason.

Your files never leave your browser — no server behind it. The one exception is "connect a repo" (GitHub sends no CORS on zips, so a same-origin route fetches it; nothing stored). A hostile archive cannot navigate the page away or unregister the worker; the security note is in the repo.

Limits, so you don't have to find them: it is for web apps — a native iOS or Android app does not render here (the door says so; the knobs still export Swift and Android constants); raster logos are outside any knob; very large builds (45 MB of CSS) are slow.

There is also an MCP server (`npx uisandbox-mcp`) — in Claude Code, "open this app in UISandbox" builds, loads and opens the real sandbox; what you turn comes back so "export what I changed" works — and a CLI: `npx uisandbox-mcp open ./dist`.

MIT. https://uisandbox.org · https://github.com/AlexanderKaan/uisandbox — happy to answer anything about the rewriter or the 1:1 check.

## Product Hunt

**Name:** UISandbox
**Tagline (≤60):** Play with your real app's design, live
**Description (≤260):** Drop your built web app, see it 1:1 in the browser, turn the knobs — brand, colours, fonts, spacing, radius — and export the change as a patch or tokens. Measured, not promised. Your files never leave your browser. Free, MIT. Also an MCP server for Claude/Cursor.
**Topics:** Design Tools · Developer Tools · Open Source · Artificial Intelligence
**Gallery order:** the GIF · `site-hero-light-1440.png` · `stage-acme-brand-crimson.png` · `verify-card.png` · `og-panel-template.png`
**First comment:** the Show HN comment, shorter: what it is (3 lines), the honesty paragraph, the MCP line, the limits, the ask ("tell me what build it refused").

## The security objection (the ready answer, HN/PH comments)

> Fair worry — don't take my word for it. There is no server behind it, no
> account, no cookies, no analytics (we stripped even the counter). Three ways
> to verify in a minute: (1) watch the network tab while you drop, turn knobs
> and export — no request carries your bytes; (2) load the page, switch your
> network off, then drop the zip — everything still works; (3) it's MIT, the
> file that serves your files is src/sandbox/host.ts and the threat model is
> notes/security.md. The one exception, said plainly: "Connect a repo" sends
> that public GitHub/GitLab URL through uisandbox.org (no CORS on archives);
> nothing is stored. Drop a zip or folder and not even that leaves your browser.

## LinkedIn / longer post

Same as X but with the "why": every design review ends with "can we see it on the real thing?" — that is the whole tool. One paragraph on the honesty (the check), one on the agent flow, the link.

## One-liners for directories / bios

- Play with your real app's design, live — your built web app, 1:1, with its own knobs, in your browser or via MCP. Free, MIT.
- Test your design on the real thing: drop a build, turn the knobs, export the patch.
