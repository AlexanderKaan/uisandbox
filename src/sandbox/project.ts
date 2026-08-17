/**
 * A sandbox project: THEIR built site, as files, twice.
 *
 *   raw        every file exactly as it came — the CONTROL the 1:1 claim is
 *              measured against (`verify.ts`)
 *   rewritten  the same files with every stylesheet and every <style> / style=""
 *              run through `rewriteCss`, plus the sheet that came out of it
 *
 * The web root is found, not assumed: a repo zip carries `dist/` (Vite),
 * `build/` (CRA), `out/` (Next export) or a bare `index.html`; a dist zip is
 * the root itself. The shallowest folder holding an `index.html` wins, and a
 * name that says "built output" wins a tie — the visitor can override.
 *
 * Screens (sprint 1) are the HTML entries under the root: every `.html` file is
 * a page you can open. Routes of a single-page app live in its JS and are the
 * next step (see PROMPT.md, hard nut 2).
 */
import type { Archive, ZipEntry } from '../audit/intake/readZip'
import { rewriteCss, rewriteHtml, stripLinkIntegrity } from './rewrite'
import { SubstitutionTable } from './table'

export interface ServedFile {
  blob: Blob
  type: string
}

export interface Screen {
  /** Root-relative path, e.g. `index.html` or `about/index.html` — or a
   *  client-side ROUTE (`dashboard`) the worker answers with index.html. */
  path: string
  /** What the picker shows: `/`, `/about`. */
  label: string
  /** How it was found: an HTML file, a link on a rendered page, or pinned by hand. */
  source?: 'file' | 'link' | 'pinned'
}

export interface SandboxProject {
  id: string
  name: string
  root: string
  candidates: string[]
  screens: Screen[]
  raw: Map<string, ServedFile>
  rewritten: Map<string, ServedFile>
  table: SubstitutionTable
  /** How many bytes of stylesheet were rewritten — the sheet's coverage. */
  cssBytes: number
}

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', cjs: 'text/javascript; charset=utf-8',
  json: 'application/json', map: 'application/json', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml', wasm: 'application/wasm',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', pdf: 'application/pdf',
}
export const mimeOf = (path: string): string => MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

const BUILT_DIR = /^(dist|build|out|public|_site|www|docs|site|htdocs|export|release)$/i
const NOT_ROOT = /(^|\/)(node_modules|src|\.git|test|tests|__tests__|coverage|\.next|\.nuxt|storybook-static)(\/|$)/

/** Every folder that holds an index.html, best first. */
export function findRoots(paths: string[]): string[] {
  const roots = new Set<string>()
  for (const p of paths) {
    if (!/(^|\/)index\.html?$/i.test(p)) continue
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    if (NOT_ROOT.test(dir)) continue
    roots.add(dir)
  }
  const score = (dir: string) => {
    const depth = dir ? dir.split('/').length : 0
    const last = dir.split('/').pop() ?? ''
    // A named build folder beats a bare index at the same depth — a repo whose
    // root index.html is a Vite template is not the site; its dist/ is.
    return depth * 10 - (BUILT_DIR.test(last) ? 15 : 0)
  }
  return [...roots].sort((a, b) => score(a) - score(b) || a.localeCompare(b))
}

let seq = 0
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * Materialise a project from an archive: read every file under the root,
 * rewrite what is CSS, keep the rest as bytes.
 */
export async function buildProject(archive: Archive, opts: { root?: string; onProgress?: (done: number, total: number) => void } = {}): Promise<SandboxProject> {
  const paths = archive.entries.map((e) => e.path)
  const candidates = findRoots(paths)
  const root = opts.root ?? candidates[0] ?? ''
  const prefix = root ? `${root}/` : ''
  const under = archive.entries.filter((e) => e.path.startsWith(prefix) && !/(^|\/)(node_modules|\.git)\//.test(e.path))

  const raw = new Map<string, ServedFile>()
  const rewritten = new Map<string, ServedFile>()
  const redirects = new Set<string>()
  const table = new SubstitutionTable()
  let cssBytes = 0
  let done = 0

  // Stylesheets FIRST so their variables get the low ids and HTML <style>
  // blocks share entries with them; order within a kind is by path so the
  // sheet is the same for the same zip however the entries were listed
  // (notes/lessons.md: the answer depended on FILE ORDER once).
  const order = (e: ZipEntry) => (/\.css$/i.test(e.path) ? 0 : /\.html?$/i.test(e.path) ? 1 : 2)
  const sorted = [...under].sort((a, b) => order(a) - order(b) || a.path.localeCompare(b.path))

  for (const e of sorted) {
    const rel = e.path.slice(prefix.length)
    const blob = await archive.readBlob(e)
    done++
    opts.onProgress?.(done, sorted.length)
    if (!blob) continue
    const type = mimeOf(rel)
    raw.set(rel, { blob, type })
    if (/\.css$/i.test(rel)) {
      const css = await blob.text()
      cssBytes += css.length
      rewritten.set(rel, { blob: new Blob([rewriteCss(css, table, rel)], { type }), type })
    } else if (/\.html?$/i.test(rel)) {
      const html = await blob.text()
      // A page whose only job is to send you elsewhere is not a screen.
      if (/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/i.test(html) && html.length < 4000) redirects.add(rel)
      // Inlined <style> counts as stylesheet too (Astro, Next inline critical CSS).
      for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) cssBytes += m[1]!.length
      // The control keeps every byte except <link integrity> — see stripLinkIntegrity.
      raw.set(rel, { blob: new Blob([stripLinkIntegrity(html)], { type }), type })
      rewritten.set(rel, { blob: new Blob([rewriteHtml(html, table, rel)], { type }), type })
    } else {
      rewritten.set(rel, { blob, type })
    }
  }

  // Error pages are not screens anyone wants to tune.
  const ERROR_PAGE = /(^|\/)(404|500|_not-found|_error|offline)(\.html?|\/index\.html?)$/i
  const screens: Screen[] = [...raw.keys()]
    .filter((p) => /\.html?$/i.test(p) && !ERROR_PAGE.test(p) && !redirects.has(p))
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)))
    .map((p) => ({ path: p, label: '/' + p.replace(/(^|\/)index\.html?$/i, '').replace(/\.html?$/i, ''), source: 'file' as const }))
    .map((s) => ({ ...s, label: s.label === '/' ? '/' : s.label.replace(/\/$/, '') || '/' }))

  return { id: newId(), name: archive.rootName, root, candidates, screens, raw, rewritten, table, cssBytes }
}

/** The `<style>` block that defines the sheet's variables, for injection into a page's head. */
export function varsStyleTag(vars: Record<string, string>): string {
  const body = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')
  return `<style id="us-vars">:root{${body}}</style>`
}

/**
 * The CSSOM hook, as inline script — installed BEFORE their bundle runs, so a
 * rule inserted through `CSSStyleSheet.insertRule` (styled-components and
 * Emotion in production "speedy" mode, Lit's adopted sheets via replaceSync)
 * passes through the SAME rewriter in the parent page. Rules with no text are
 * the one thing the MutationObserver in live.ts cannot see.
 */
export function hookScriptTag(sid: string): string {
  return `<script id="us-hook">(function(){try{var SID=${JSON.stringify(sid)};var P=CSSStyleSheet.prototype;var rw=function(t){try{var f=window.parent&&window.parent.__usRewriteRule;return f?f(String(t),window,SID):t}catch(e){return t}};var ins=P.insertRule;P.insertRule=function(r,i){return ins.call(this,rw(r),i)};if(P.replaceSync){var rs=P.replaceSync;P.replaceSync=function(t){return rs.call(this,rw(t))}}if(P.replace){var rp=P.replace;P.replace=function(t){return rp.call(this,rw(t))}}}catch(e){}})()</script>`
}

/** Put the variables (and the CSSOM hook) into a served HTML document, before anything else in <head>. */
export function injectVars(html: string, vars: Record<string, string>, sid: string): string {
  const tag = varsStyleTag(vars) + hookScriptTag(sid)
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + `<head>${tag}</head>`)
  return tag + html
}

/**
 * Routes a single-page app exposes as links: every same-origin, extension-less
 * `<a href>` on the rendered page (a router's <Link> renders exactly that). The
 * archive cannot list an SPA's routes; the page can. Returns screens not yet
 * known, sorted.
 */
export function discoverRoutes(doc: Document, known: Screen[]): Screen[] {
  const have = new Set(known.map((s) => s.label))
  const out = new Map<string, Screen>()
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') ?? ''
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue
    let url: URL
    try { url = new URL(href, doc.baseURI) } catch { continue }
    if (url.origin !== doc.location.origin) continue
    let path = url.pathname.replace(/^\/__sb\/[^/]+\//, '/')
    if (/\.[a-z0-9]{2,5}$/i.test(path)) continue // a file, not a route
    path = path.replace(/\/+$/, '') || '/'
    const label = path
    if (have.has(label) || out.has(label)) continue
    out.set(label, { path: path.replace(/^\//, ''), label, source: 'link' })
  }
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label))
}
