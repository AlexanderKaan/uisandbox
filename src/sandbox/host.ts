/**
 * The page side of the service worker: register it, own the sandboxes, answer
 * its file requests. One registry for the whole tab.
 *
 * Three sandbox ids per project:
 *   <id>       the rewritten site, with the LIVE variable block injected into
 *              every HTML response (so first paint already has the values —
 *              no flash of the original)
 *   <id>-id    the rewritten site with the IDENTITY sheet — what "1:1" claims
 *   <id>-raw   the untouched site: the CONTROL `verify.ts` measures against
 */
import { injectVars, type SandboxProject } from './project'
import { rewriteCss } from './rewrite'
import { defineNewVars } from './table'

interface Owned {
  project: SandboxProject
  variant: 'raw' | 'rewritten'
  /** The variable block to inject into HTML at fetch time — the CURRENT sheet. */
  vars: () => Record<string, string>
}

const owned = new Map<string, Owned>()
let ready: Promise<ServiceWorkerRegistration> | null = null
const growListeners = new Set<(project: SandboxProject) => void>()

/** Be told when a runtime rule added entries to a project's sheet. */
export function onSheetGrow(fn: (project: SandboxProject) => void): () => void {
  growListeners.add(fn)
  return () => growListeners.delete(fn)
}

/** `/__sb/<sid>/…` → sid, for a sandboxed window. */
const sidOfWindow = (win: Window): string | null => {
  try {
    return new URLSearchParams(win.location.search).get('__sb') || win.location.pathname.match(/^\/__sb\/([^/]+)\//)?.[1] || win.name.match(/^us:(\S+)$/)?.[1] || null
  } catch { return null }
}

/**
 * Called from the hook inside a sandboxed frame (project.ts hookScriptTag) for
 * every rule that goes through the CSSOM. Rewrites it against the project's
 * sheet; when the sheet grew, the new variables are defined in THAT frame at
 * once (identity values — the knob mapping follows on the next render), so the
 * rule never computes against an undefined variable.
 */
function rewriteRuleFor(rule: string, win: Window, sidHint?: string): string {
  const sid = sidHint || sidOfWindow(win)
  const o = sid ? owned.get(sid) : undefined
  if (!o || o.variant !== 'rewritten') return rule
  const table = o.project.table
  const before = table.entries.length
  const out = rewriteCss(rule, table, 'insertRule (runtime)')
  if (table.entries.length > before) {
    try { defineNewVars(win.document, table, before) } catch { /* mid-navigation; the next render writes the full block */ }
    for (const fn of growListeners) fn(o.project)
  }
  return out
}
if (typeof window !== 'undefined') (window as unknown as { __usRewriteRule?: typeof rewriteRuleFor }).__usRewriteRule = rewriteRuleFor

/** The REAL path plus the sandbox id: `/about/?__sb=<sid>` — a client-side
 *  router then sees the pathname it was deployed for (see public/sw.js). */
export const sandboxUrl = (sid: string, path: string) => {
  const p = path.replace(/^\//, '').replace(/(^|\/)index\.html?$/i, '$1')
  return `/${p}?__sb=${sid}`
}
export const rawSid = (id: string) => `${id}-raw`
export const identitySid = (id: string) => `${id}-id`

/** Register once; resolves when the worker controls this page. */
export function ensureWorker(): Promise<ServiceWorkerRegistration> {
  if (ready) return ready
  if (!('serviceWorker' in navigator)) {
    return Promise.reject(new Error('This browser has no service worker — the sandbox cannot serve your files here.'))
  }
  ready = (async () => {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      // First install: the page is not yet controlled. Wait for the claim.
      await new Promise<void>((resolve) => {
        const done = () => { navigator.serviceWorker.removeEventListener('controllerchange', done); resolve() }
        navigator.serviceWorker.addEventListener('controllerchange', done)
        setTimeout(done, 1500)
      })
    }
    return reg
  })()
  navigator.serviceWorker.addEventListener('message', onMessage)
  return ready
}

export function own(project: SandboxProject, vars: () => Record<string, string>): void {
  owned.set(project.id, { project, variant: 'rewritten', vars })
  owned.set(identitySid(project.id), { project, variant: 'rewritten', vars: () => project.table.identityVars() })
  owned.set(rawSid(project.id), { project, variant: 'raw', vars: () => ({}) })
}

export function disown(project: SandboxProject): void {
  owned.delete(project.id)
  owned.delete(identitySid(project.id))
  owned.delete(rawSid(project.id))
}

/**
 * A build deployed under a sub-path writes it into every URL — CRA's
 * `homepage`, Vite's `base`, a gh-pages project site: `/react-gh-pages/static/
 * js/main.js` for a file that sits at `static/js/main.js` in the archive. The
 * archive has no memory of the deploy path, so a miss is retried with leading
 * segments stripped, first match wins (measured on a CRA gh-pages build that
 * rendered blank).
 */
export function resolveFile<T>(files: Map<string, T>, path: string): T | undefined {
  const direct = files.get(path)
  if (direct) return direct
  const parts = path.split('/')
  for (let i = 1; i < parts.length && i <= 4; i++) {
    const hit = files.get(parts.slice(i).join('/'))
    if (hit) return hit
  }
  return undefined
}

async function onMessage(e: MessageEvent) {
  const data = e.data as { type?: string; sid?: string; path?: string } | undefined
  if (!data || data.type !== 'us:fetch' || !data.sid) return
  const port = e.ports[0]
  if (!port) return
  const o = owned.get(data.sid)
  if (!o) { port.postMessage({ found: false, owner: false }); return }
  const files = o.variant === 'raw' ? o.project.raw : o.project.rewritten
  const path = decodeURIComponent(data.path ?? '')
  const f = resolveFile(files, path)
  if (!f) { port.postMessage({ found: false, owner: true }); return }
  let body: ArrayBuffer
  if (o.variant === 'rewritten' && /\.html?$/i.test(path)) {
    const html = injectVars(await f.blob.text(), o.vars(), data.sid)
    body = new TextEncoder().encode(html).buffer as ArrayBuffer
  } else {
    body = await f.blob.arrayBuffer()
  }
  port.postMessage({ found: true, type: f.type, body }, [body])
}
