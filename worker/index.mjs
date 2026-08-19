/** The Cloudflare Worker: static assets (dist/) plus the one dynamic route,
 *  with the canonical-origin rules: https only, apex only (www → apex). */
import { handleRepo } from './repo.mjs'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // One canonical origin: https://uisandbox.org — http and www redirect (301).
    if (url.hostname === 'uisandbox.org' || url.hostname.endsWith('.uisandbox.org')) {
      if (url.protocol !== 'https:' || url.hostname !== 'uisandbox.org') {
        url.protocol = 'https:'; url.hostname = 'uisandbox.org'
        return Response.redirect(url.toString(), 301)
      }
    }
    if (url.pathname === '/__repo/' || url.pathname === '/__repo') return handleRepo(request)
    return env.ASSETS.fetch(request)
  },
}
