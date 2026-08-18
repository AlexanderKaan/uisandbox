/**
 * The repo route: `/__repo/?u=https://github.com/owner/repo[/tree/branch]`
 * fetches the repository zip GitHub will not let a browser fetch directly
 * (codeload sends no CORS headers) and streams it back. Public repos only,
 * github.com only, same-origin callers only, nothing stored, a size cap. This
 * is the ONE thing that leaves the tab (notes/security.md, the intake says
 * so): the repo URL, and the bytes streaming through — never a token.
 *
 * Shared by the Cloudflare Worker (worker/index.mjs) and the Vite dev server
 * (vite.config.ts) so the door behaves the same in both.
 */
const MAX_BYTES = 200 * 1024 * 1024

export function repoZipUrl(u) {
  const m = String(u || '').trim().match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([\w./-]+))?\/?$/i)
  if (!m) return null
  const [, owner, repo, branch] = m
  // github.com/o/r/archive/… redirects to codeload; HEAD is the default branch.
  const ref = branch ? `refs/heads/${branch}` : 'HEAD'
  return { owner, repo, branch: branch || 'HEAD', url: `https://github.com/${owner}/${repo}/archive/${ref}.zip` }
}

/** @param {Request} request  @returns {Promise<Response>} */
export async function handleRepo(request) {
  const url = new URL(request.url)
  const origin = url.origin
  // Same-origin callers only: the app, not anyone's script.
  const from = request.headers.get('origin') || request.headers.get('referer') || ''
  const site = request.headers.get('sec-fetch-site')
  if (site ? site !== 'same-origin' : !from.startsWith(origin)) return new Response('The repo route serves uisandbox only.', { status: 403 })
  const target = repoZipUrl(url.searchParams.get('u'))
  if (!target) return new Response('Pass a public GitHub repository URL: ?u=https://github.com/owner/repo', { status: 400 })
  let upstream
  try {
    upstream = await fetch(target.url, { redirect: 'follow', headers: { 'user-agent': 'uisandbox.org (repo zip fetch; https://github.com/AlexanderKaan/uisandbox)' } })
  } catch {
    return new Response(`Could not reach GitHub for ${target.owner}/${target.repo}.`, { status: 502 })
  }
  if (upstream.status === 404) return new Response(`GitHub has no public repository ${target.owner}/${target.repo}${target.branch !== 'HEAD' ? ` with branch ${target.branch}` : ''} — private repos cannot be fetched here.`, { status: 404 })
  if (!upstream.ok || !upstream.body) return new Response(`GitHub answered ${upstream.status} for ${target.owner}/${target.repo}.`, { status: 502 })
  const len = Number(upstream.headers.get('content-length') || 0)
  if (len > MAX_BYTES) return new Response(`That repository zip is ${Math.round(len / 1024 / 1024)} MB — over the ${MAX_BYTES / 1024 / 1024} MB the route carries. Drop its build folder as a zip instead.`, { status: 413 })
  const headers = new Headers({
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${target.repo}-${target.branch.replace(/[^\w.-]+/g, '-')}.zip"`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  if (len) headers.set('content-length', String(len))
  return new Response(upstream.body, { status: 200, headers })
}
