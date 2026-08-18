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
import { detectPlatform, type Platform } from './platform'
import { detectScheme, type Scheme } from './scheme'

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
  /** The URL prefix the build was deployed under — Vite `base`, CRA `homepage`,
   *  a gh-pages project site: `vitepress` for pages that ask for
   *  `/vitepress/v1/assets/x.js` while the archive holds `v1/assets/x.js`.
   *  Screens are served UNDER it so a client router sees its own path
   *  (VitePress rendered its 404 at `/v1/` because its base is `/vitepress/`).
   *  '' when the build sits at the origin root. */
  base: string
  candidates: string[]
  screens: Screen[]
  raw: Map<string, ServedFile>
  rewritten: Map<string, ServedFile>
  table: SubstitutionTable
  /** How many bytes of stylesheet were rewritten — the sheet's coverage. */
  cssBytes: number
  /** What was dropped, and whether it renders. */
  platform: Platform
  /** The dark/light scheme hooks their CSS responds to (empty = no dark mode). */
  scheme: Scheme
  /** The archive itself, for files OUTSIDE the root a page reaches with `../`
   *  (three.js's examples import `../build/three.module.js`): read lazily,
   *  rewritten if CSS/HTML, then cached into `raw`/`rewritten` under the
   *  archive-relative path. */
  archive: Archive
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

const sortKey = (p: string) => p.replace(/(^|\/)index\.html?$/i, '$1\u0000')

/** One page's vote for the deploy prefix: every root-absolute script/stylesheet
 *  URL that the archive holds only once its leading segments are stripped
 *  (`/vitepress/v1/assets/x.js` → `v1/assets/x.js` ⇒ `vitepress`); a URL the
 *  archive holds as is votes for '' (deployed at the origin root). */
export function voteBase(html: string, underPaths: Set<string>, votes: Map<string, number>): void {
  for (const m of html.matchAll(/(?:src|href)=["'](\/[^"'?#]+\.(?:js|mjs|css))["']/gi)) {
    const abs = m[1]!.slice(1)
    if (underPaths.has(abs)) { votes.set('', (votes.get('') ?? 0) + 1); continue }
    const segs = abs.split('/')
    for (let k = 1; k < segs.length && k <= 3; k++) {
      if (underPaths.has(segs.slice(k).join('/'))) { const b = segs.slice(0, k).join('/'); votes.set(b, (votes.get(b) ?? 0) + 1); break }
    }
  }
}

let seq = 0
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * Materialise a project from an archive: read every file under the root,
 * rewrite what is CSS, keep the rest as bytes.
 */
export async function buildProject(archive: Archive, opts: { root?: string; onProgress?: (done: number, total: number, cssBytes: number) => void } = {}): Promise<SandboxProject> {
  const paths = archive.entries.map((e) => e.path)
  // A first look at the platform from the paths alone; a WordPress theme's
  // `templates/index.html` is a block template, not a page, and must not be
  // taken for a web root.
  const heads: Array<{ path: string; head: string }> = []
  for (const e of archive.entries) {
    if (/(^|\/)(package\.json|style\.css)$/.test(e.path) && e.size < 200000) {
      const t = await archive.readText(e)
      if (t) heads.push({ path: e.path, head: t.slice(0, 2000) })
    }
  }
  // Any page counts, not only index.html — JavaScript30's thirty mini-apps are
  // `index-START.html` / `index-FINISHED.html`; a folder of pages is a site.
  const anyPage = paths.some((p) => /\.html?$/i.test(p) && !/(^|\/)(node_modules|tests?|__tests__|mocks?)\//i.test(p))
  const early = detectPlatform(paths, anyPage, heads)
  const candidates = early.renders || early.kind === 'unknown' || early.kind === 'web-source' && !heads.some((h) => /Theme Name:/i.test(h.head)) ? findRoots(paths) : []
  // A folder with the only index.html is not the site when the archive holds
  // many more pages beside it (JavaScript30: sixty `index-START.html`s and one
  // video player with an index.html) — then the archive root is the site.
  const NOT_PAGE = /(^|\/)(node_modules|tests?|__tests__|mocks?|fixtures?)\//i
  const pagesUnder = (dir: string) => paths.filter((p) => /\.html?$/i.test(p) && !NOT_PAGE.test(p) && (dir === '' || p.startsWith(dir + '/'))).length
  const best = candidates[0]
  // A TOP-LEVEL dist/build is the site even when the repo has more pages
  // beside it (a Vite template index.html, docs); a dist/ buried four folders
  // deep (fullPage.js's browserify example: 1 of 60 pages) is one example's
  // build, not the archive's.
  const topBuild = best !== undefined && !best.includes('/') && /^(dist|build|out|_site|public)$/i.test(best)
  const wholeArchive = best !== undefined && best !== '' && pagesUnder('') >= 3 * Math.max(1, pagesUnder(best)) && !topBuild
  if (wholeArchive && !candidates.includes('')) candidates.unshift('')
  const root = opts.root ?? (wholeArchive ? '' : candidates[0]) ?? ''
  const prefix = root ? `${root}/` : ''
  const under = archive.entries.filter((e) => e.path.startsWith(prefix) && !/(^|\/)(node_modules|\.git)\//.test(e.path))

  const raw = new Map<string, ServedFile>()
  const rewritten = new Map<string, ServedFile>()
  const redirects = new Set<string>()
  const underPaths = new Set(under.map((e) => e.path.slice(prefix.length)))
  const baseVotes = new Map<string, number>()
  const table = new SubstitutionTable()
  const scheme: Scheme = { media: false, hooks: [] }
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
    opts.onProgress?.(done, sorted.length, cssBytes)
    if (!blob) continue
    const type = mimeOf(rel)
    raw.set(rel, { blob, type })
    // A single stylesheet past 24 MB is not a stylesheet anyone wrote (a
    // padded or hostile file): served as it is, not parsed into a tab's memory.
    if (/\.css$/i.test(rel) && blob.size <= 24 * 1024 * 1024) {
      const css = await blob.text()
      cssBytes += css.length
      detectScheme(css, scheme)
      rewritten.set(rel, { blob: new Blob([rewriteCss(css, table, rel)], { type }), type })
    } else if (/\.html?$/i.test(rel) && blob.size <= 8 * 1024 * 1024) {
      const html = await blob.text()
      // A page whose only job is to send you elsewhere is not a screen.
      if (/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/i.test(html) && html.length < 4000) redirects.add(rel)
      voteBase(html, underPaths, baseVotes)
      // Inlined <style> counts as stylesheet too (Astro, Next inline critical CSS).
      for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) { cssBytes += m[1]!.length; detectScheme(m[1]!, scheme) }
      // The control keeps every byte except <link integrity> — see stripLinkIntegrity.
      raw.set(rel, { blob: new Blob([stripLinkIntegrity(html)], { type }), type })
      rewritten.set(rel, { blob: new Blob([rewriteHtml(html, table, rel)], { type }), type })
    } else {
      rewritten.set(rel, { blob, type })
    }
  }

  // Error pages are not screens anyone wants to tune.
  const ERROR_PAGE = /(^|\/)(404|500|200|_not-found|_error|offline)(\.html?|\/index\.html?)$/i
  const NOT_A_SCREEN = /(^|\/)(tests?|__tests__|mocks?|fixtures?|spec|e2e|cypress|playwright|storybook-static|coverage)\//i
  const screens: Screen[] = [...raw.keys()]
    .filter((p) => /\.html?$/i.test(p) && !ERROR_PAGE.test(p) && !NOT_A_SCREEN.test(p) && !redirects.has(p))
    // An index sorts before its folder's siblings at EVERY level (v1/index.html
    // before v1/es/…), so the first screen is a home, not the deepest a-page.
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .map((p) => ({ path: p, label: '/' + p.replace(/(^|\/)index\.html?$/i, '').replace(/\.html?$/i, ''), source: 'file' as const }))
    .map((s) => ({ ...s, label: s.label === '/' ? '/' : s.label.replace(/\/$/, '') || '/' }))

  const platform = detectPlatform(paths, screens.length > 0 || anyPage, heads)
  // The deploy prefix: the one most root-absolute asset URLs agree on.
  const base = [...baseVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  return { id: newId(), name: archive.rootName, root, base, candidates, screens: platform.renders ? screens : [], raw, rewritten, table, cssBytes, platform, scheme, archive }
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
/** The service-worker guard, for EVERY sandboxed document — the raw control
 *  too (it touches no pixel): a page cannot register its own worker here, and
 *  cannot unregister ours. Element Plus's docs run a "clean up old service
 *  workers" snippet that unregistered the worker serving the sandbox; every
 *  navigation after that got the host's own index — and the 1:1 check paired
 *  our intake page against itself. */
export function guardScriptTag(): string {
  return `<script id="us-guard">(function(){try{var sw=navigator.serviceWorker;if(!sw)return;sw.register=function(){return Promise.reject(new DOMException('UISandbox: a page inside the sandbox cannot register its own service worker.','SecurityError'))};var R=window.ServiceWorkerRegistration;if(R&&R.prototype)R.prototype.unregister=function(){return Promise.resolve(false)}}catch(e){}})()</script>`
}
export function injectGuard(html: string): string {
  const tag = guardScriptTag()
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + `<head>${tag}</head>`)
  return tag + html
}

export function hookScriptTag(sid: string): string {
  // Polymer 1 (2015) resolves var() with its own shim and never sees ours; it
  // honours a settings object defined before it loads. Harmless elsewhere.
  // Their service worker: see guardScriptTag (injected into every document).
  return `<script id="us-hook">(function(){try{var SID=${JSON.stringify(sid)};if(!window.Polymer)window.Polymer={useNativeCSSProperties:true};var P=CSSStyleSheet.prototype;var rw=function(t){try{var f=window.parent&&window.parent.__usRewriteRule;return f?f(String(t),window,SID):t}catch(e){return t}};var ins=P.insertRule;P.insertRule=function(r,i){return ins.call(this,rw(r),i)};if(P.replaceSync){var rs=P.replaceSync;P.replaceSync=function(t){return rs.call(this,rw(t))}}if(P.replace){var rp=P.replace;P.replace=function(t){return rp.call(this,rw(t))}}}catch(e){}})()</script>`
}

/** Put the variables (and the CSSOM hook) into a served HTML document, before anything else in <head>. */
export function injectVars(html: string, vars: Record<string, string>, sid: string): string {
  const tag = guardScriptTag() + varsStyleTag(vars) + hookScriptTag(sid)
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

/**
 * A file the root does not contain but the archive does — reached by a page
 * with `../`. Read once, rewritten like the rest, cached under its
 * ARCHIVE-relative path (which is how the resolver's segment-stripping will
 * find it again). Returns null when the archive has no such file either.
 */
export async function loadOutsideRoot(project: SandboxProject, archivePath: string): Promise<boolean> {
  if (project.raw.has(archivePath)) return true
  const e = project.archive.entries.find((x) => x.path === archivePath)
  if (!e) return false
  const blob = await project.archive.readBlob(e)
  if (!blob) return false
  const type = mimeOf(archivePath)
  project.raw.set(archivePath, { blob, type })
  if (/\.css$/i.test(archivePath)) {
    const css = await blob.text()
    project.rewritten.set(archivePath, { blob: new Blob([rewriteCss(css, project.table, archivePath)], { type }), type })
  } else if (/\.html?$/i.test(archivePath)) {
    const html = await blob.text()
    project.raw.set(archivePath, { blob: new Blob([stripLinkIntegrity(html)], { type }), type })
    project.rewritten.set(archivePath, { blob: new Blob([rewriteHtml(html, project.table, archivePath)], { type }), type })
  } else {
    project.rewritten.set(archivePath, { blob, type })
  }
  return true
}
