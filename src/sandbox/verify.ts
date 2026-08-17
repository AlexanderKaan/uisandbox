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
  elements: number
  mismatches: Mismatch[]
}

const MAX_REPORT = 40

/** Elements of both documents in document order, paired by position. */
export function compareDocuments(raw: Document, sandbox: Document, props: readonly string[] = VERIFY_PROPS): VerifyResult {
  const a = Array.from(raw.querySelectorAll('body *')).filter((el) => !isOurs(el))
  const b = Array.from(sandbox.querySelectorAll('body *')).filter((el) => !isOurs(el))
  if (!a.length || !b.length) return { ok: false, refusal: 'One of the documents has no elements to compare.', elements: 0, mismatches: [] }
  if (a.length !== b.length) {
    return {
      ok: false,
      refusal: `The two documents differ in structure (${a.length} vs ${b.length} elements) — the page renders non-deterministically, so styles cannot be paired.`,
      elements: Math.min(a.length, b.length),
      mismatches: [],
    }
  }
  const wa = raw.defaultView!
  const wb = sandbox.defaultView!
  const mismatches: Mismatch[] = []
  for (let i = 0; i < a.length && mismatches.length < MAX_REPORT; i++) {
    const ea = a[i]!, eb = b[i]!
    const sa = wa.getComputedStyle(ea), sb = wb.getComputedStyle(eb)
    for (const p of props) {
      const va = sa.getPropertyValue(p), vb = sb.getPropertyValue(p)
      if (va !== vb) mismatches.push({ index: i, tag: ea.tagName.toLowerCase(), prop: p, raw: va, sandbox: vb })
    }
  }
  return { ok: mismatches.length === 0, elements: a.length, mismatches }
}

/** Our injected style block is not part of their page. */
const isOurs = (el: Element) => el.id === 'us-vars'

/** Load a URL in an invisible iframe, resolve with its document once fonts settled. */
export function loadHidden(url: string, parent: HTMLElement, width: number, height: number): Promise<{ frame: HTMLIFrameElement; doc: Document }> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;height:${height}px;visibility:hidden;border:0`
    frame.setAttribute('aria-hidden', 'true')
    frame.onload = async () => {
      try {
        const doc = frame.contentDocument
        if (!doc) throw new Error('no document')
        await doc.fonts?.ready
        await new Promise((r) => setTimeout(r, 150))
        resolve({ frame, doc })
      } catch (err) { reject(err) }
    }
    frame.onerror = () => reject(new Error('frame failed to load'))
    frame.src = url
    parent.appendChild(frame)
  })
}
