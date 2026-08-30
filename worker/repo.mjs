/**
 * The repo route: `/__repo/?u=https://github.com/owner/repo[/tree/branch]`
 * (or a gitlab.com project URL, `/-/tree/branch` optional) fetches the
 * repository zip the browser cannot fetch directly (neither host sends CORS
 * headers on archives) and streams it back. Public repos only, github.com and
 * gitlab.com only, same-origin callers only, nothing stored, a size cap. This
 * is the ONE thing that leaves the tab (notes/security.md, the intake says
 * so): the repo URL, and the bytes streaming through — never a token.
 *
 * Shared by the Cloudflare Worker (worker/index.mjs) and the Vite dev server
 * (vite.config.ts) so the door behaves the same in both.
 */
const MAX_BYTES = 200 * 1024 * 1024
const UA = 'uisandbox.org (repo zip fetch; https://github.com/Ideelab/uisandbox)'
// GitLab answers 406 to a non-browser fetch that accepts gzip (measured); the zip is compressed already.
const HEADERS = (host) => host === 'GitLab' ? { 'user-agent': UA, 'accept-encoding': 'identity' } : { 'user-agent': UA }

export function repoZipUrl(u) {
  const str = String(u || '').trim()
  const gh = str.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([\w./-]+))?\/?$/i)
  if (gh) {
    const [, owner, repo, branch] = gh
    // github.com/o/r/archive/… redirects to codeload; HEAD is the default branch.
    const ref = branch ? `refs/heads/${branch}` : 'HEAD'
    return { host: 'GitHub', owner, repo, branch: branch || 'HEAD', url: `https://github.com/${owner}/${repo}/archive/${ref}.zip` }
  }
  // GitLab: nested groups (group/sub/repo), an optional /-/tree/branch. The
  // API's archive endpoint takes the project path and an optional sha and
  // defaults to the default branch (the web archive URL answers 406 to a
  // non-browser fetch).
  const gl = str.match(/^https?:\/\/(?:www\.)?gitlab\.com\/([\w./-]+?)(?:\.git)?(?:\/-\/tree\/([\w./-]+))?\/?$/i)
  if (gl && /^[\w.-]+(\/[\w.-]+)+$/.test(gl[1]) && !/\/-(\/|$)/.test(gl[1])) {
    const path = gl[1].replace(/\/$/, ''); const branch = gl[2]
    const repo = path.split('/').pop(); const owner = path.split('/').slice(0, -1).join('/')
    const api = `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`
    // Without a sha the archive endpoint answers 406 to a non-browser fetch — so
    // the default branch is read from the project first.
    return { host: 'GitLab', owner, repo, branch: branch || 'HEAD', path, api, url: branch ? `${api}/repository/archive.zip?sha=${encodeURIComponent(branch)}` : null }
  }
  return null
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
  if (!target) return new Response('Pass a public GitHub or GitLab repository URL: ?u=https://github.com/owner/repo', { status: 400 })
  let upstream
  try {
    if (!target.url) {
      const meta = await fetch(target.api, { headers: HEADERS('GitLab') })
      if (meta.status === 404) return new Response(`GitLab has no public project ${target.path} — private projects cannot be fetched here.`, { status: 404 })
      if (!meta.ok) return new Response(`GitLab answered ${meta.status} for ${target.path}.`, { status: 502 })
      const def = (await meta.json()).default_branch
      if (!def) return new Response(`GitLab did not say which branch ${target.path} uses — add /-/tree/<branch> to the URL.`, { status: 502 })
      target.branch = def
      target.url = `${target.api}/repository/archive.zip?sha=${encodeURIComponent(def)}`
    }
    upstream = await fetch(target.url, { redirect: 'follow', headers: HEADERS(target.host) })
  } catch {
    return new Response(`Could not reach ${target.host} for ${target.owner}/${target.repo}.`, { status: 502 })
  }
  if (upstream.status === 404) return new Response(`${target.host} has no public repository ${target.owner}/${target.repo}${target.branch !== 'HEAD' ? ` with branch ${target.branch}` : ''} — private repos cannot be fetched here.`, { status: 404 })
  if (!upstream.ok || !upstream.body) return new Response(`${target.host} answered ${upstream.status} for ${target.owner}/${target.repo}.`, { status: 502 })
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
