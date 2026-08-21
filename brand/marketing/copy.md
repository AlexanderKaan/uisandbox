# Copy — the lines, per channel

The three lines, in this order of use: **Play with your app's design. Right in the browser.** (headline) · *Drop your build, turn the knobs, export the code.* (the three beats, straight under it) · *Restyle your app without rebuilding it.* (second line, for places that need one). Never claim more than the meter shows: "1:1" is measured, images/canvas are outside, iOS/Android do not render.

## X — the pinned post (with the GIF or `site-hero-light-1440.png`)

Play with your app's design. Right in the browser.

Drop your build, turn the knobs, export the code.

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
**Tagline (≤60):** Play with your app's design. Right in the browser
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

- Play with your app's design. Right in the browser. Your built web app, 1:1, with its own knobs, in your browser or via MCP. Free, MIT.
- Drop your build, turn the knobs, export the code. Nothing is sent to a server, and closing the tab undoes all of it.

## Sceptical comments, answered (HN/PH-ready, fellow-dev voice)

The register that works: agree with the true part first, give the measurement,
name the limit before they do, invite the build. Never "actually…", never a
feature list as a rebuttal.

**"It's a hosted site — 'your files never leave your browser' is a promise I
can't verify tomorrow. You could ship different JS next week."**
> Completely fair — a hosted page can't prove its own future. That's why the
> local path exists: `npx uisandbox-mcp open` runs the same app from npm on
> 127.0.0.1, or clone and `pnpm dev`. For the hosted one: it's static, the
> code is MIT on GitHub, and you can load the page, go offline and drop the
> zip — today's deployment provably phones nothing. For tomorrow's, pin the
> npm version. If you have a stricter setup in mind I'd genuinely like to
> hear it.

**"So it's… CSS variables. I can do this in DevTools."**
> The mechanism is exactly that, on purpose — no magic. What DevTools doesn't
> give you: every literal across (say) 118 KB of built CSS tokenised at once,
> byte-preserving; runtime styles hooked too (styled-components, Emotion,
> Ant's cssinjs insert rules at runtime); a diff that proves the tokenised
> page renders identical to the untouched one; and the change handed back as
> a patch/tokens instead of dying with the inspector. It's DevTools' idea,
> industrialised.

**"'1:1' — sure. My app will look broken."**
> Maybe! That's why the check is a button, not a promise: it loads your
> untouched build next to the tokenised one and diffs computed styles of
> every element, and it tells you the first differences verbatim. 91 of 109
> real builds pass with zero differences; the ones that don't say so on
> screen. If yours differs, I want the zip — every miss so far became a
> fixture and a fix.

**"My styling is all CSS-in-JS at runtime, this can't work."**
> It hooks the CSSOM before your bundle runs — insertRule/replaceSync get
> the same rewrite as static CSS. Measured on styled-components, Emotion,
> Lit and Ant's cssinjs (those are fixtures in the repo). What it can't do
> is inline `style=` written per-frame by JS animation — the observer
> catches normal runtime styles, not a 60fps loop.

**"You're executing arbitrary zip JS same-origin with your page. That's an
XSS playground."**
> Yes — same-origin is forced by the design (a service worker only serves
> its own origin), so the threat model starts there: the origin holds
> nothing. No server, no account, no cookies, no analytics, no storage worth
> reading. The frames drop allow-top-navigation, a guard makes worker
> takeover a no-op, zip-slip names are normalised, and there's a hostile
> fixture in CI that tries all of it. Full write-up: notes/security.md. If
> you find a way past it, that's a private advisory I'll act on fast.

**"The patch is against built output — my source is SCSS/tokens, so the
export is useless."**
> Half true. The patch is find→replace on literals, which survives into
> source wherever your literals do (plain CSS, Tailwind config values,
> CSS-vars themes). Where your build computes values (SCSS math, color
> functions), the patch tells you the from→to pairs and you apply them at
> the source of truth — and the tokens/Swift/Android exports give you the
> end state in formats that don't care how you got there. It's not a
> codemod; it doesn't pretend to be.

**"Figma exists."**
> Different moment. Figma is before the code exists; this is after — when
> the review ends with "can we see it on the real thing?". It doesn't
> replace the mockup; it replaces the rebuild you'd do just to try a colour.

**"It got my brand colour wrong."**
> The stand is a heuristic stack — declared variable beats cascade-order
> beats most-painted — and it's measured against 109 builds, but heuristics
> lose sometimes. Two clicks fix it in the panel; sending me the build fixes
> it for everyone after you.

**"Was this vibe-coded with AI?"**
> Built with Claude Code, yes — and held to account like any code: 344
> tests, a regression gate of 109 real builds that runs on every change,
> and a numbered decisions log in the repo (128+ entries, including every
> trap). Judge the gate, not the typist.

**"The repo connector sends my URL to your server — so something DOES leave."**
> Correct, and the UI says so next to the field: GitHub/GitLab won't serve
> archives to a browser, so that one route proxies the PUBLIC repo zip;
> nothing is stored. Drop a zip or folder instead and nothing leaves at all
> — that path works offline, which is the proof.

**"Your page loads Google Fonts, so 'nothing leaves' is already false."**
> The claim is about your files — they never leave. The tool's own UI pulls
> its two typefaces from Google Fonts, and font previews you pick do too;
> with the network off those fall back to system faces and everything else
> keeps working. If fonts-off matters to you, the local `npx` app serves
> everything from 127.0.0.1.

**"What about my app behind auth / hitting APIs?"**
> Static builds only, honestly: a page that needs its server renders as a
> shell here, and the tool says "this looks like a shell, not the app"
> rather than letting it pass. SSR/auth flows are out of scope — the knobs
> are about design, and design lives in the build's CSS.
