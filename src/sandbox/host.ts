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

interface Owned {
  project: SandboxProject
  variant: 'raw' | 'rewritten'
  /** The variable block to inject into HTML at fetch time — the CURRENT sheet. */
  vars: () => Record<string, string>
}

const owned = new Map<string, Owned>()
let ready: Promise<ServiceWorkerRegistration> | null = null

export const sandboxUrl = (sid: string, path: string) => `/__sb/${sid}/${path.replace(/^\//, '')}`
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
    const html = injectVars(await f.blob.text(), o.vars())
    body = new TextEncoder().encode(html).buffer as ArrayBuffer
  } else {
    body = await f.blob.arrayBuffer()
  }
  port.postMessage({ found: true, type: f.type, body }, [body])
}
