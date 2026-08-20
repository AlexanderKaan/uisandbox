/**
 * "1:1" as a measurement, not a feeling (HANDOFF.md: if 1:1 is a feeling, it
 * is not a claim).
 *
 * The rewritten page and the RAW page — same files, no rewrite, served under
 * `<id>-raw` — are compared element by element on the properties the sheet can
 * touch. With the identity sheet the count of differences must be zero; any
 * difference is either a rewriter bug or a page whose JS is not deterministic
 * (which the report says, rather than averaging it away).
 *
 * The control this instrument carries (notes/traps.md #6): both documents are
 * read the same way, and a page with zero elements or a document that failed
 * to load is a REFUSAL, never a pass.
 */

export const VERIFY_PROPS = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-bottom-color',
  'border-top-left-radius', 'border-bottom-right-radius', 'font-family', 'font-size',
  'padding-top', 'padding-left', 'margin-top', 'margin-left', 'gap', 'box-shadow', 'outline-color', 'fill', 'stroke',
] as const

export interface Mismatch {
  index: number
  tag: string
  prop: string
  raw: string
  sandbox: string
}

export interface VerifyResult {
  ok: boolean
  /** A refusal explains itself; a pass has elements > 0 and mismatches = []. */
  refusal?: string
  /** Elements that could be PAIRED across the two documents. */
  elements: number
  /** Elements only in one document — ads, widgets, anything time-dependent. */
  unpaired: { raw: number; sandbox: number }
  mismatches: Mismatch[]
}

const MAX_REPORT = 40

/** Same-origin documents nested in `doc` (Storybook's iframe.html), depth-first. */
export function nestedDocs(doc: Document): Document[] {
  const out: Document[] = []
  for (const f of Array.from(doc.querySelectorAll('iframe'))) {
    let d: Document | null = null
    try { d = f.contentDocument } catch { d = null }
    if (d && d.body) { out.push(d, ...nestedDocs(d)) }
  }
  return out
}

/** Every element under a root, shadow roots included (Lit, web components),
 *  and — for a document body — the elements of same-origin frames inside it. */
export function allElements(root: ParentNode): Element[] {
  const out: Element[] = []
  const walk = (node: ParentNode) => {
    for (const el of Array.from(node.querySelectorAll('*'))) {
      out.push(el)
      if (el.shadowRoot) walk(el.shadowRoot)
      if (el.tagName === 'IFRAME') {
        let d: Document | null = null
        try { d = (el as HTMLIFrameElement).contentDocument } catch { d = null }
        if (d?.body) walk(d.body)
      }
    }
  }
  walk(root)
  return out
}

/** A stable address for an element: its path of tag#id.class:nth from <body>,
 *  crossing shadow boundaries as `host>#shadow>…`. */
function keyOf(el: Element, top: Document): string {
  const parts: string[] = []
  let e: Element | null = el
  // Stops at the TOP document's body; a nested document's body is crossed
  // into its <iframe> (`#frame`).
  while (e && !(e.tagName === 'BODY' && e.ownerDocument === top)) {
    const tag = e.tagName.toLowerCase()
    // …and a class with a digit (`apexchartska7c5jyi`, a hashed module class)
    // is dropped for the same reason; tag, plain classes and position remain.
    const cls = (e.getAttribute('class') ?? '').trim().split(/\s+/).filter((c) => c && !/\d/.test(c)).slice(0, 3).join('.')
    // Generated ids differ between two loads (ApexCharts `apexchartsq6xxr`,
    // SVG.js `SvgjsG1082`, React `:r2:`): an id with a digit or a colon is
    // not part of the address; the tag/class path still is.
    const id = e.id && !/[\d:]/.test(e.id) ? `#${e.id}` : ''
    let nth = 0
    let sib = e.previousElementSibling
    while (sib) { if (sib.tagName === e.tagName) nth++; sib = sib.previousElementSibling }
    parts.push(`${tag}${id}${cls ? '.' + cls : ''}:${nth}`)
    const parent: Element | null = e.parentElement
    if (!parent) {
      // Top of a shadow tree: continue at the host.
      const rootNode = e.getRootNode() as Node & { host?: Element; defaultView?: Window | null }
      // Cross-realm: the frame's ShadowRoot is not this window's — duck-type.
      if (rootNode.nodeType === 11 && rootNode.host) { parts.push('#shadow'); e = rootNode.host; continue }
      // Top of a nested document: continue at its <iframe>.
      if (rootNode.nodeType === 9) { let fe: Element | null = null; try { fe = rootNode.defaultView?.frameElement ?? null } catch { fe = null } if (fe) { parts.push('#frame'); e = fe; continue } }
    }
    e = parent
  }
  return parts.reverse().join('>')
}

/**
 * Elements of both documents paired by their stable path — NOT by position, so
 * an ad or a widget that renders differently between two loads (getbootstrap.com's
 * Carbon ads: 1192 vs 1181 elements) leaves the rest comparable and shows up as
 * "unpaired" instead of refusing the whole page.
 */
/** A paint-server reference by GENERATED id (svg.js: url("#SvgjsLinearGradient1296"),
 *  a fresh counter every load) names the same gradient in both documents; the
 *  digits are the load's, not the design's. */
const normRef = (v: string) => v.replace(/url\(("|')?#([A-Za-z_-]+)\d+\1?\)/g, 'url(#$2N)')

export function compareDocuments(raw: Document, sandbox: Document, props: readonly string[] = VERIFY_PROPS): VerifyResult {
  // Every document the sandbox serves carries the guard; a document without
  // it came from somewhere else (the host's own index after the worker was
  // lost) — comparing that would be the instrument measuring itself.
  if (!raw.getElementById('us-guard') || !sandbox.getElementById('us-guard')) {
    return { ok: false, refusal: 'The sandbox did not serve this screen (the worker is gone or the page left the sandbox) — nothing of yours was compared.', elements: 0, unpaired: { raw: 0, sandbox: 0 }, mismatches: [] }
  }
  const a = allElements(raw.body).filter((el) => !isOurs(el) && inFlatTree(el))
  const b = allElements(sandbox.body).filter((el) => !isOurs(el) && inFlatTree(el))
  if (!a.length || !b.length) return { ok: false, refusal: 'One of the documents has no elements to compare.', elements: 0, unpaired: { raw: a.length, sandbox: b.length }, mismatches: [] }
  const bByKey = new Map<string, Element>()
  for (const el of b) { const k = keyOf(el, sandbox); if (!bByKey.has(k)) bByKey.set(k, el) }
  const wa = raw.defaultView!
  const wb = sandbox.defaultView!
  const mismatches: Mismatch[] = []
  let paired = 0
  const seen = new Set<string>()
  a.forEach((ea, i) => {
    const k = keyOf(ea, raw)
    const eb = bByKey.get(k)
    if (!eb || seen.has(k)) return
    seen.add(k)
    paired++
    if (mismatches.length >= MAX_REPORT) return
    // An element of a nested frame is measured by its OWN window.
    const sa = (ea.ownerDocument.defaultView ?? wa).getComputedStyle(ea), sb = (eb.ownerDocument.defaultView ?? wb).getComputedStyle(eb)
    for (const p of props) {
      const va = sa.getPropertyValue(p), vb = sb.getPropertyValue(p)
      if (va !== vb && normRef(va) !== normRef(vb)) mismatches.push({ index: i, tag: ea.tagName.toLowerCase(), prop: p, raw: va, sandbox: vb })
    }
  })
  const unpaired = { raw: a.length - paired, sandbox: b.length - paired }
  if (paired < Math.min(a.length, b.length) * 0.5) {
    return { ok: false, refusal: `Only ${paired} of ${Math.min(a.length, b.length)} elements could be paired — the two loads render too differently to compare.`, elements: paired, unpaired, mismatches }
  }
  return { ok: mismatches.length === 0, elements: paired, unpaired, mismatches }
}

/** A light-DOM child of a shadow host that no <slot> took (Spectrum's docs
 *  keep a fallback `<a id="logo" slot="logo">` beside the rendered one) is not
 *  in the flat tree: never painted, and — the trap — computed WITHOUT inherited
 *  custom properties, so a `var()` reads as unset there while the literal it
 *  replaced reads fine. Not a difference anyone can see; not compared. */
export function inFlatTree(el: Element): boolean {
  let e: Element | null = el
  while (e) {
    const parent: Element | null = e.parentElement
    if (parent) {
      if (parent.shadowRoot && !e.assignedSlot) return false
      e = parent
      continue
    }
    const root = e.getRootNode() as Node & { host?: Element }
    e = root.nodeType === 11 && root.host ? root.host : null
  }
  return true
}

/** Our injected style block is not part of their page. */
const isOurs = (el: Element) => el.id === 'us-vars' || el.id === 'us-still' || el.id === 'us-fonts' || el.id === 'us-hook' || el.id === 'us-guard'
  // Images arrive on the network's clock and fade in on their own; their box
  // is "outside" the knobs anyway (coverage.ts counts them so). Not compared.
  || el.tagName === 'IMG'

/** Load a URL in an invisible iframe, resolve with its document once fonts settled. */
export function loadHidden(url: string, parent: HTMLElement, width: number, height: number): Promise<{ frame: HTMLIFrameElement; doc: Document }> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;height:${height}px;visibility:hidden;border:0`
    frame.setAttribute('aria-hidden', 'true')
    // Same flags as the stage: a hostile page must not navigate the top window from here either.
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock allow-orientation-lock')
    frame.onload = async () => {
      try {
        const doc = frame.contentDocument
        if (!doc) throw new Error('no document')
        // `load` can fire while a same-origin stylesheet served by the worker is
        // still pending; wait until every <link rel=stylesheet> has a sheet (or
        // 4s pass), then fonts, then a beat for layout.
        const t0 = Date.now()
        const pending = () => Array.from(doc.querySelectorAll('link[rel~="stylesheet"]')).some((l) => !(l as HTMLLinkElement).sheet)
        while (pending() && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100))
        await doc.fonts?.ready
        // …and let images land: a lazy-loader that flips a class per image
        // (NES.css docs) makes two loads differ by which images are in yet.
        const t1 = Date.now()
        while (Array.from(doc.images).some((i) => !i.complete) && Date.now() - t1 < 4000) await new Promise((r) => setTimeout(r, 100))
        // …and let the app finish rendering: a hydrating SPA (Element Plus's
        // docs) had 50 elements at `load` and 295 a moment later. Wait until
        // the element count holds still for 600 ms (6 s at most).
        const t2 = Date.now()
        let last = -1, stableSince = Date.now()
        while (Date.now() - t2 < 6000) {
          const n = doc.body ? allElements(doc.body).length : 0
          if (n !== last) { last = n; stableSince = Date.now() }
          else if (Date.now() - stableSince >= 600) break
          await new Promise((r) => setTimeout(r, 150))
        }
        // Freeze motion in BOTH frames before comparing: two loads are two
        // moments of the same fade (NES.css's lazy images: alpha .055 vs .098),
        // and a comparison of moments is not a comparison of stylesheets.
        const still = doc.createElement('style')
        still.id = 'us-still'
        still.textContent = '*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important}'
        ;(doc.head ?? doc.documentElement).appendChild(still)
        await new Promise((r) => setTimeout(r, 250))
        resolve({ frame, doc })
      } catch (err) { reject(err) }
    }
    frame.onerror = () => reject(new Error('frame failed to load'))
    // A dead CDN link (rawgit, a retired font host) can hold `load` for the
    // length of a DNS failure; after 15 s the document we have is the document
    // we measure — the check must not hang on someone else's outage.
    setTimeout(() => { const doc = frame.contentDocument; if (doc?.body) resolve({ frame, doc }) }, 15000)
    frame.src = url
    parent.appendChild(frame)
  })
}
