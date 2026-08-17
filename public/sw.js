/* UISandbox service worker — serves THEIR site from the tab, nothing else.
 *
 * Their files never leave the machine: the page holds them, this worker asks
 * the page for each one over a MessageChannel and hands the bytes back as a
 * Response. Only requests for a sandbox are answered here; everything else
 * (our own app) passes straight to the network.
 *
 *   /__sb/<sid>/<path>          a sandbox file, by explicit prefix
 *   /assets/x.css  (from a sandbox client or referrer)
 *                               a ROOT-RELATIVE url their build wrote — resolved
 *                               to the sandbox the requesting document lives in
 *
 * Plain JS on purpose: no bundler step between the page and the worker, so a
 * dev server and a static deploy register the identical file at "/sw.js".
 */

const PREFIX = '/__sb/'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

/** `/__sb/<sid>/a/b.css` → { sid, path: 'a/b.css' } */
function splitSandboxUrl(pathname) {
  if (!pathname.startsWith(PREFIX)) return null
  const rest = pathname.slice(PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash < 0) return { sid: rest, path: '' }
  return { sid: rest.slice(0, slash), path: rest.slice(slash + 1) }
}

/* A sandbox document opened at its REAL path — `/projects?__sb=<sid>` — so a
 * client-side router (BrowserRouter, Next, SvelteKit) sees the pathname it was
 * deployed for. The worker BINDS the resulting client to the sandbox; every
 * later request from that client resolves without the parameter, and a
 * navigation inside that frame (a link click) is attributed by referrer, then
 * by the most recently bound sandbox for framed navigations. */
const boundClients = new Map() // clientId → sid
let lastBoundSid = null
const sidFromUrl = (u) => {
  try {
    const url = new URL(u)
    return url.searchParams.get('__sb') || splitSandboxUrl(url.pathname)?.sid || null
  } catch { return null }
}

/** Which sandbox does a request come from, when its URL does not say? */
async function sandboxOfRequester(event) {
  if (event.clientId && boundClients.has(event.clientId)) return boundClients.get(event.clientId)
  if (event.clientId) {
    const c = await self.clients.get(event.clientId)
    if (c) { const sid = sidFromUrl(c.url); if (sid) return sid }
  }
  if (event.request.referrer) { const sid = sidFromUrl(event.request.referrer); if (sid) return sid }
  // A navigation inside a sandboxed frame after the router moved on
  // (`/dashboard` → link click): the referrer no longer carries the id.
  // Our own app is a top-level document, never an iframe, and its only path
  // is `/` — anything else navigating in a frame is a sandbox.
  if (event.request.mode === 'navigate' && lastBoundSid) {
    if (event.request.destination === 'iframe') return lastBoundSid
    const ref = event.request.referrer ? new URL(event.request.referrer).pathname : ''
    if (ref && ref !== '/' && ref !== '/index.html') return lastBoundSid
  }
  return null
}

let seq = 0
/** Ask every window client until one owns the sandbox. */
async function askPage(sid, path) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  // The owner is our app, never a sandboxed document — skip those first.
  const ordered = clients.filter((c) => !c.url.includes(PREFIX)).concat(clients.filter((c) => c.url.includes(PREFIX)))
  for (const client of ordered) {
    const answer = await new Promise((resolve) => {
      const ch = new MessageChannel()
      const id = ++seq
      const timer = setTimeout(() => resolve(null), 4000)
      ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data) }
      client.postMessage({ type: 'us:fetch', id, sid, path }, [ch.port2])
    })
    if (answer && answer.found) return answer
    if (answer && answer.owner === false) continue
  }
  return null
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  const explicit = splitSandboxUrl(url.pathname)

  event.respondWith((async () => {
    const param = url.searchParams.get('__sb')
    let sid = explicit?.sid || param || null
    let path = explicit ? explicit.path : url.pathname.replace(/^\//, '')
    if (!sid) {
      sid = await sandboxOfRequester(event)
      if (!sid) return fetch(event.request)
    }
    if (event.request.mode === 'navigate') {
      if (event.resultingClientId) boundClients.set(event.resultingClientId, sid)
      lastBoundSid = sid
      if (boundClients.size > 200) boundClients.delete(boundClients.keys().next().value)
    }
    // A directory → its index; a route with no extension → the SPA's index.
    if (path === '' || path.endsWith('/')) path += 'index.html'
    const answer = await askPage(sid, path)
    if (!answer) {
      if (!/\.[a-z0-9]+$/i.test(path) && event.request.mode === 'navigate') {
        const idx = await askPage(sid, 'index.html')
        if (idx) return new Response(idx.body, { status: 200, headers: { 'content-type': idx.type } })
      }
      return new Response(`Not in sandbox: ${path}`, { status: 404, headers: { 'content-type': 'text/plain' } })
    }
    // NEVER cache: a root-relative URL (`/assets/x.css`) is the SAME URL for the
    // raw, the identity and the live sandbox of one project, and the browser's
    // cache is keyed by URL — a cached rewritten sheet served to the raw control
    // made it unstyled (measured on getbootstrap.com). Fresh from the page, always.
    return new Response(answer.body, {
      status: 200,
      headers: {
        'content-type': answer.type,
        'cache-control': 'no-store',
        // Their app may load itself in a frame; ours does, on this origin.
        'x-uisandbox': sid,
      },
    })
  })())
})
