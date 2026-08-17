/* Computed-style census of a document — run in the LIVE tab and in the sandbox
 * frame, then diff the two. Small on purpose: per property a value→count map
 * over every element in <body>, plus what failed to load. Paste into a console
 * or the browser tool: `census(document)` / `census(frame.contentDocument)`. */
function census(doc) {
  const PROPS = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'border-top-left-radius', 'padding-top', 'box-shadow', 'border-top-color', 'line-height']
  const win = doc.defaultView
  // Form controls are excluded: in the automation browser used for the
  // hold-outs their computed style is frozen at first paint (an inline
  // `!important` cannot move it, live or sandboxed) — an instrument limit,
  // not a finding. notes/traps.md #6.
  const els = Array.from(doc.querySelectorAll('body *')).filter((e) => e.id !== 'us-vars' && e.id !== 'us-fonts' && !/^(INPUT|TEXTAREA|SELECT|BUTTON|OPTION)$/.test(e.tagName))
  const props = {}
  for (const p of PROPS) props[p] = {}
  for (const el of els) {
    const cs = win.getComputedStyle(el)
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p)
      props[p][v] = (props[p][v] || 0) + 1
    }
  }
  const imgs = Array.from(doc.images)
  const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')).slice(0, 10)
  const sheets = Array.from(doc.styleSheets).map((s) => { try { return { href: s.href, rules: s.cssRules.length } } catch { return { href: s.href, rules: -1 } } })
  const fonts = Array.from(doc.fonts).map((f) => `${f.family}:${f.status}`)
  return { n: els.length, props, images: imgs.length, broken, sheets, fonts, w: win.innerWidth, h: win.innerHeight, title: doc.title }
}
/** Diff two censuses: per property, values only on one side (with counts). */
function diffCensus(a, b) {
  const out = { n: [a.n, b.n], props: {} }
  for (const p of Object.keys(a.props)) {
    const A = a.props[p], B = b.props[p] || {}
    const onlyA = Object.entries(A).filter(([v, c]) => (B[v] || 0) !== c).map(([v, c]) => `${v} (${c}→${B[v] || 0})`)
    const onlyB = Object.entries(B).filter(([v]) => !(v in A)).map(([v, c]) => `${v} (0→${c})`)
    if (onlyA.length || onlyB.length) out.props[p] = { changed: onlyA.slice(0, 12), new: onlyB.slice(0, 12) }
  }
  out.broken = [a.broken, b.broken]
  out.fonts = [a.fonts, b.fonts]
  return out
}
if (typeof module !== 'undefined') module.exports = { census, diffCensus }
