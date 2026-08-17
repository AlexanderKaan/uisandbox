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

/** Which sandbox does a request come from, when its URL does not say? */
async function sandboxOfRequester(event) {
  const fromUrl = (u) => {
    try { return splitSandboxUrl(new URL(u).pathname)?.sid || null } catch { return null }
  }
  if (event.clientId) {
    const c = await self.clients.get(event.clientId)
    if (c) { const sid = fromUrl(c.url); if (sid) return sid }
  }
  if (event.request.referrer) { const sid = fromUrl(event.request.referrer); if (sid) return sid }
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
    let sid = explicit?.sid || null
    let path = explicit ? explicit.path : url.pathname.replace(/^\//, '')
    if (!sid) {
      sid = await sandboxOfRequester(event)
      if (!sid) return fetch(event.request)
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
