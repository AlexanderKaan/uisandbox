/** The Cloudflare Worker: static assets (dist/) plus the one dynamic route. */
import { handleRepo } from './repo.mjs'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/__repo/' || url.pathname === '/__repo') return handleRepo(request)
    return env.ASSETS.fetch(request)
  },
}
