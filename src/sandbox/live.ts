/**
 * The rewriter, live: what their JS styles AFTER load.
 *
 * A static rewrite covers stylesheets and the HTML as served. A React app then
 * sets `style={{ color: '#4f39f6' }}` on render, a Tailwind CDN or a CSS-in-JS
 * runtime appends `<style>` blocks, a chart library paints inline. Same origin,
 * so we watch the frame's document with a MutationObserver and run the SAME
 * rewriter on what appears — new literals join the same sheet, so the knobs
 * reach them too.
 *
 * Not covered (yet): rules inserted through `CSSStyleSheet.insertRule` with no
 * text (styled-components/Emotion in production "speedy" mode). Those live only
 * in the CSSOM; reaching them means wrapping insertRule inside the frame.
 */
import { rewriteCss, rewriteInlineStyle } from './rewrite'
import { defineNewVars, type SubstitutionTable } from './table'

/** Watch a document; call `onGrow` whenever the sheet gained entries. Returns a stop(). */
export function observeFrame(doc: Document, table: SubstitutionTable, onGrow: () => void): () => void {
  let muted = false
  const before = () => table.entries.length
  // The frame is ANOTHER realm: its nodes are not instances of this window's
  // Element/HTMLStyleElement, so `instanceof` here is always false — the
  // initial sweep (querySelectorAll) worked and every later mutation was
  // silently dropped (Mantine's hydrated Shiki spans: 909 raw `style` colours).
  // Duck-type by nodeType/tagName, never by constructor (traps.md: cross-realm).
  const isEl = (n: Node | null | undefined): n is Element => !!n && n.nodeType === 1
  const isStyleEl = (n: Node | null | undefined): n is HTMLStyleElement => isEl(n) && n.tagName === 'STYLE'

  const rewriteStyleAttr = (el: Element) => {
    const raw = el.getAttribute('style')
    if (!raw || !/[#\d]|rgb|hsl|oklch/i.test(raw) || /var\(--us-v/.test(raw)) return
    const n = before()
    const out = rewriteInlineStyle(raw, table, 'inline (runtime)')
    defineNewVars(doc, table, n)
    if (out !== raw) {
      muted = true
      el.setAttribute('style', out)
      muted = false
    }
    if (table.entries.length !== n) onGrow()
  }
  const rewriteStyleEl = (el: HTMLStyleElement) => {
    const css = el.textContent ?? ''
    if (!css.trim() || el.id === 'us-vars' || /var\(--us-v/.test(css)) return
    const n = before()
    const out = rewriteCss(css, table, '<style> (runtime)')
    defineNewVars(doc, table, n) // BEFORE the rewritten text lands
    if (out !== css) {
      muted = true
      el.textContent = out
      muted = false
    }
    if (table.entries.length !== n) onGrow()
  }
  /* Inline SVG paints with PRESENTATION ATTRIBUTES — `fill="#4f39f6"`,
     `stroke="#111"`, `stop-color` — which no stylesheet scan sees. A style
     property outranks the attribute, so `style="fill: var(--us-vN)"` on the
     same element puts the icon or logo under the knobs without touching the
     attribute (raw stays raw). currentColor / none / url(#…) are left alone. */
  const SVG_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color']
  const rewriteSvgAttrs = (el: Element) => {
    if (!(el.namespaceURI === 'http://www.w3.org/2000/svg')) return
    const style = (el as SVGElement).style
    const n = before()
    for (const a of SVG_ATTRS) {
      const v = el.getAttribute(a)
      if (!v || /^(none|currentcolor|inherit|transparent|url\(|context-)/i.test(v.trim())) continue
      if (style.getPropertyValue(a).includes('var(--us-v')) continue
      const ref = table.add('color', v, { file: 'inline svg', prop: `svg ${a}` })
      muted = true
      style.setProperty(a, ref)
      muted = false
    }
    if (table.entries.length !== n) { defineNewVars(doc, table, n); onGrow() }
  }
  const sweep = (root: ParentNode) => {
    if (isEl(root) && root.hasAttribute('style')) rewriteStyleAttr(root)
    root.querySelectorAll?.('[style]').forEach(rewriteStyleAttr)
    if (isEl(root) && root.namespaceURI === 'http://www.w3.org/2000/svg') rewriteSvgAttrs(root)
    root.querySelectorAll?.('svg, svg *').forEach(rewriteSvgAttrs)
    if (isStyleEl(root)) rewriteStyleEl(root)
    root.querySelectorAll?.('style').forEach((s) => rewriteStyleEl(s as HTMLStyleElement))
  }

  const mo = new MutationObserver((records) => {
    if (muted) return
    for (const r of records) {
      if (r.type === 'attributes' && isEl(r.target)) { if (r.attributeName === 'style') rewriteStyleAttr(r.target); else rewriteSvgAttrs(r.target) }
      else if (r.type === 'childList') r.addedNodes.forEach((n) => { if (isEl(n)) sweep(n) })
      else if (r.type === 'characterData' && isStyleEl(r.target.parentElement)) rewriteStyleEl(r.target.parentElement)
    }
  })
  mo.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'fill', 'stroke', 'stop-color'], characterData: true })
  // What is already there — inline styles the static rewrite could not see
  // (an SVG chart drawn on load) or a <style> appended before we attached.
  sweep(doc.documentElement)
  return () => mo.disconnect()
}
