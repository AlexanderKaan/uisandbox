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
  const sweep = (root: ParentNode) => {
    if (root instanceof Element && root.hasAttribute('style')) rewriteStyleAttr(root)
    root.querySelectorAll?.('[style]').forEach(rewriteStyleAttr)
    if (root instanceof HTMLStyleElement) rewriteStyleEl(root)
    root.querySelectorAll?.('style').forEach((s) => rewriteStyleEl(s as HTMLStyleElement))
  }

  const mo = new MutationObserver((records) => {
    if (muted) return
    for (const r of records) {
      if (r.type === 'attributes' && r.target instanceof Element) rewriteStyleAttr(r.target)
      else if (r.type === 'childList') r.addedNodes.forEach((n) => { if (n instanceof Element) sweep(n) })
      else if (r.type === 'characterData' && r.target.parentElement instanceof HTMLStyleElement) rewriteStyleEl(r.target.parentElement)
    }
  })
  mo.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'], characterData: true })
  // What is already there — inline styles the static rewrite could not see
  // (an SVG chart drawn on load) or a <style> appended before we attached.
  sweep(doc.documentElement)
  return () => mo.disconnect()
}
