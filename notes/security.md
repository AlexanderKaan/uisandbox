# Security — what a dropped archive can and cannot do

UISandbox runs someone's BUILT web app inside the tool, and runs it for real:
its scripts execute. Everything below follows from one design fact — the
sandboxed frames are **same-origin** with the host page, because a service
worker only serves documents on its own origin and the worker is what turns
an archive into a site. Same origin means the frame's scripts can reach
`parent`. There is no flag that takes that away without also taking the
worker away (an opaque-origin `sandbox` frame is not controlled by it).

So the threat model is: **the archive is untrusted code running next to a
tool that holds nothing worth stealing.** The tool keeps that second half
true, and denies what can be denied.

## Measured with a hostile fixture (fixtures/sec-evil.zip, 2026-08-18)

A build whose scripts try, on load: navigate the top window; rewrite the
host's DOM; unregister the worker; register its own; read `parent.__us` and
`localStorage`; open a popup; plus zip-slip entry names (`../../x.html`,
`/abs/x.html`), a file named `<img src=x onerror=alert(1)>.html`, and 40 MB
of NUL bytes as a stylesheet.

| Attempt | Result | Why |
|---|---|---|
| `top.location = 'https://…'` | **denied** | every frame carries `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals …"` — no `allow-top-navigation`. Before this flag one line hijacked the whole app. |
| register its own service worker | denied, quietly | the guard script in every served document makes `register()` reject with a clear SecurityError |
| unregister ours | no effect | `unregister()` resolves `false` in every served document (raw control too — it paints nothing). Element Plus's docs did this by accident and the 1:1 check paired the host's own index against itself; the check now refuses any document without the guard. |
| `../../x.html`, `/abs/x.html` | normalised to `x.html`, `abs/x.html` | entry names are names, never locations (`safePath`): no screen above the root, and no zip-slip coming back out of an export |
| `<img onerror>` in a file name | rendered as text | the UI is React; there is no `innerHTML` anywhere in `src/` |
| 40 MB of NUL as CSS | served raw, not parsed | a stylesheet over 24 MB (a page over 8 MB) is not parsed into the tab; an archive over 2 GB unpacked or 60,000 files is refused at the door |
| `parent.document.title = 'PWNED'` | **works** | same origin, by design (above). Nothing in the host is worth it: no credentials, no cookies, no server; state is the archive the user just dropped and their knob positions. |
| `parent.__us` | works in dev only | the debug handle is `import.meta.env.DEV`-gated; a production build exposes nothing on `window` |
| `localStorage` | shared | the host stores nothing there (a session handoff of counts in `sessionStorage`); a hostile page could store its own junk on the origin — deploy the tool on an origin of its own (below) |
| `window.open('https://…')` | allowed | `allow-popups` stays: apps open `_blank` links; the popup inherits the sandbox and cannot navigate us |

The hold-out runner (`pnpm holdouts`) checks the host after every fixture:
same origin, own title, exactly one worker — a fixture that changes any of
those reads `host-tampered`.

## What is NOT covered, and what to do about it

- **Same-origin reach.** A hostile build can rewrite the tool's DOM, read the
  archive it was itself dropped from, and annoy. It cannot reach anything the
  tool does not have. Keep it that way: **deploy UISandbox on a dedicated
  origin** (its own (sub)domain, no cookies, no other app on it, no analytics
  that carries identity), and never add server-side state to it.
- **Cross-origin fetches from their scripts** happen with the user's browser
  and the tool's origin, credentials omitted — the same as any page the user
  opens. `/__ext/` (the CDN stylesheet proxy) is the browser fetching with
  CORS on the sandbox's behalf; it grants nothing the page could not fetch.
- **Popups to other sites** are allowed (see above). If a deployment wants
  none, drop `allow-popups` from `SANDBOX_FLAGS` — links with `target=_blank`
  then do nothing.
- **Their content in exports** is their content: a patched file is theirs
  with literals turned into `var()`; we do not scan it. The zip we hand back
  carries the normalised names only.
- **Prompt-injection into humans**: a page inside the frame can show any text
  it likes ("your session expired, log in here"). The stage frame is visibly
  the sandbox and the tool asks for nothing; there is no login to phish.
