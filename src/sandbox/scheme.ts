/**
 * Dark mode — THEIR dark mode, switched on.
 *
 * Nothing is redrawn. Two ways an app carries a scheme, both detected from its
 * own CSS and both toggled at runtime in the frame (same origin):
 *
 *   media   `@media (prefers-color-scheme: dark) { … }` — an iframe cannot be
 *           told what the OS prefers, but its stylesheets are ours to read:
 *           every such CSSMediaRule gets its `mediaText` forced to `all` /
 *           `not all` (and light-scheme blocks the reverse). Reversible.
 *   hooks   `[data-theme="dark"]`, `[data-bs-theme="dark"]`, `.dark`,
 *           `[data-mode="dark"]` … — set on <html>, exactly as their own
 *           theme switcher would.
 *
 * `color-scheme` on the root follows, so form controls and scrollbars agree.
 * The knob appears only when a scheme was found; "as is" restores everything.
 */
export interface Scheme {
  media: boolean
  /** Attribute hooks: `[attr, darkValue, lightValue|null]`; class hooks: `['class', 'dark', 'light'|null]`. */
  hooks: Array<[string, string, string | null]>
}

const HOOK_RX = [
  /\[(data-[\w-]*(?:theme|mode|scheme|color-mode|appearance)[\w-]*)\s*=\s*["']?dark["']?\]/gi,
  /\[(theme)\s*=\s*["']?dark["']?\]/gi,
]
const CLASS_RX = /(?:^|[\s,}])(?:html|body|:root)?\.(dark|theme-dark|dark-mode|dark-theme|is-dark)\b/gi

/** Read a stylesheet's text for the scheme hooks it responds to. */
export function detectScheme(css: string, into: Scheme): void {
  if (/prefers-color-scheme\s*:\s*dark/i.test(css)) into.media = true
  for (const rx of HOOK_RX) for (const m of css.matchAll(rx)) {
    const attr = m[1]!.toLowerCase()
    if (!into.hooks.some((h) => h[0] === attr)) {
      const light = new RegExp(`\\[${attr}\\s*=\\s*["']?light["']?\\]`, 'i').test(css) ? 'light' : null
      into.hooks.push([attr, 'dark', light])
    }
  }
  for (const m of css.matchAll(CLASS_RX)) {
    const cls = m[1]!
    if (!into.hooks.some((h) => h[0] === 'class' && h[1] === cls)) {
      const light = new RegExp(`\\.${cls.replace('dark', 'light')}\\b`).test(css) && cls !== 'dark' ? cls.replace('dark', 'light') : (cls === 'dark' && /\.light\b/.test(css) ? 'light' : null)
      into.hooks.push(['class', cls, light])
    }
  }
}

const ORIGINAL = new WeakMap<CSSMediaRule, string>()

/** Force a scheme in a document (`null` = as is). Idempotent, reversible. */
export function applyScheme(doc: Document, scheme: Scheme, want: 'dark' | 'light' | null): void {
  const root = doc.documentElement
  // 1) media rules
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      // Duck-typed: the frame's rules are instances of the FRAME's classes, so
      // `instanceof CSSMediaRule` from here is always false (cross-realm).
      if ((r as CSSMediaRule).media && typeof (r as CSSMediaRule).media.mediaText === 'string') {
        const mr = r as CSSMediaRule
        const orig = ORIGINAL.get(mr) ?? mr.media.mediaText
        if (/prefers-color-scheme/i.test(orig)) {
          if (!ORIGINAL.has(mr)) ORIGINAL.set(mr, orig)
          const isDark = /prefers-color-scheme\s*:\s*dark/i.test(orig)
          const next = want === null ? orig : (want === 'dark') === isDark ? 'all' : 'not all'
          if (mr.media.mediaText !== next) { try { mr.media.mediaText = next } catch { /* read-only sheet */ } }
        }
        try { walk(mr.cssRules) } catch { /* cross-origin */ }
      } else if ('cssRules' in r) {
        try { walk((r as CSSGroupingRule).cssRules) } catch { /* cross-origin */ }
      }
    }
  }
  for (const sh of Array.from(doc.styleSheets)) { try { walk(sh.cssRules) } catch { /* cross-origin */ } }
  // 2) hooks on <html>
  for (const [attr, dark, light] of scheme.hooks) {
    if (attr === 'class') {
      root.classList.remove(dark); if (light) root.classList.remove(light)
      if (want === 'dark') root.classList.add(dark)
      else if (want === 'light' && light) root.classList.add(light)
    } else {
      const prev = root.getAttribute(`data-us-prev-${attr}`)
      if (want === null) { if (prev !== null) { if (prev === '') root.removeAttribute(attr); else root.setAttribute(attr, prev); root.removeAttribute(`data-us-prev-${attr}`) } continue }
      if (prev === null) root.setAttribute(`data-us-prev-${attr}`, root.getAttribute(attr) ?? '')
      root.setAttribute(attr, want === 'dark' ? dark : (light ?? 'light'))
    }
  }
  // 3) UA colour scheme (form controls, scrollbars, canvas default text)
  root.style.colorScheme = want ?? ''
}
