#!/usr/bin/env node
/**
 * UISandbox as an MCP server — the same engine the browser runs, no second
 * implementation (notes/lessons.md: one source, no mirror).
 *
 *   pnpm mcp                        stdio server (add to Claude/Cursor as a command)
 *   UISANDBOX_URL=http://localhost:5190 pnpm mcp    render tools against a local app
 *
 * Tools:
 *   load       { zipUrl | zipPath }         → project id, screens, values, the baseline (brand, fonts, families)
 *   screens    { id }                       → the screens
 *   set        { id, knobs }                → apply knobs (brand hex, dials, families, fonts, dark); what moved
 *   export     { id, format }               → sheet-css | sheet-json | patch | tokens-css | tokens-json | tailwind | shadcn | swift | android-xml | android-kotlin
 *   open       { id, screen? }              → THE SANDBOX ITSELF in the user's browser, served from 127.0.0.1 by this
 *                                             process (the web app ships in the package); what they turn flows back
 *   state      { id }                       → the knobs now, incl. what the user turned in the browser
 *   verify     { id, screen? }              → the 1:1 check in headless Chromium (raw vs identity), plus reach
 *   screenshot { id, screen?, width? }      → PNG (base64) of the screen with the current knobs
 *
 * `load`, `set`, `export` are pure Node over src/. `verify` and `screenshot`
 * drive the real app (UISANDBOX_URL, default https://uisandbox.org) with the
 * archive served from a route inside the headless browser — the same way the
 * hold-out runner measures, so the number an agent gets is the number a
 * visitor gets.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { basename, join, dirname, extname } from 'node:path'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { openZip, type Archive } from '../src/audit/intake/readZip'
import { buildProject, type SandboxProject } from '../src/sandbox/project'
import { deriveBaseline, type BaselineReport } from '../src/sandbox/baseline'
import { computeVars } from '../src/sandbox/mapping'
import { buildTokens } from '../src/tokens/buildTokens'
import { formatCssColor } from '../src/sandbox/cssColor'
import { encode } from '../src/state/hash'
import { DEFAULT_DIALS, type Dials } from '../src/sandbox/dials'
import { genSheetCss, genSheetJson, genPatch } from '../src/export/genSheet'
import { genCss } from '../src/export/genCss'
import { genJson } from '../src/export/genJson'
import { genTailwind } from '../src/export/genTailwind'
import { genShadcn } from '../src/export/genShadcn'
import { genSwift } from '../src/export/genSwift'
import { genAndroidColorsXml, genAndroidKotlin } from '../src/export/genAndroid'
import type { Config } from '../src/tokens/types'
import { refusalFor } from '../src/sandbox/platform'

const APP_ENV = process.env.UISANDBOX_URL?.replace(/\/$/, '')

interface Loaded { id: string; name: string; bytes: Uint8Array<ArrayBuffer>; project: SandboxProject; report: BaselineReport; cfg: Config; archive: Archive; touchedInBrowser?: number }
const projects = new Map<string, Loaded>()
let seq = 0

const summarise = (p: Loaded) => {
  const b = p.report.baseline
  const fam = b.families
  const centre = (k: keyof NonNullable<typeof fam>['centre']) => { const c = fam?.centre[k]; return c ? formatCssColor({ ...c, a: 1 }) : undefined }
  const vars = computeVars(p.project.table, b, p.cfg, buildTokens(p.cfg))
  const identity = p.project.table.identityVars()
  const moved = Object.keys(vars).filter((k) => vars[k] !== identity[k]).length
  return {
    id: p.id, name: p.name, root: p.project.root || '/', base: p.project.base || '', platform: p.project.platform.kind,
    screens: p.project.screens.length, values: p.project.table.entries.length, cssKB: Math.round(p.project.cssBytes / 1024),
    baseline: {
      brand: b.cfg.cPrimary, fontDisplay: b.cfg.fontDisplay, fontBody: b.cfg.fontBody,
      families: { secondary: centre('secondary'), accent: centre('accent'), success: centre('success'), warning: centre('warning'), danger: centre('danger'), info: centre('info') },
      palette: fam?.palette?.length ?? 0, canvas: fam?.canvas ? formatCssColor({ ...fam.canvas, a: 1 }) : undefined,
      darkMode: p.project.scheme.hooks.length > 0 || p.project.scheme.media,
    },
    knobs: { cPrimary: p.cfg.cPrimary, fontDisplay: p.cfg.fontDisplay, fontBody: p.cfg.fontBody, ...p.cfg.sb },
    moved,
    notes: p.report.notes,
  }
}

const INSTRUCTIONS = `UISandbox renders a BUILT web app 1:1 in a sandbox and turns every CSS literal into a knob that moves the app's own value; "1:1" is measured (a computed-style diff), not promised.

When to use it — and offer it without being asked:
- The user wants to LOOK at an app in a sandbox or PLAY with its design ("can I see this in a sandbox", "let me try some changes", "what would a different brand colour look like"): build the app if you are in its repo (npm run build / vite build / nuxi generate / next build with output: 'export'), zip the output folder (dist/, build/, out/ — never node_modules or source), \`load\` it, then \`open\`. The real, interactive sandbox opens in their browser from 127.0.0.1; nothing leaves the machine. Tell them it is open and that whatever they turn comes back here: when they return with "export this" / "what did I change" / "check it", call \`state\`, then \`export\` / \`verify\` / \`screenshot\`.
- The user wants ONE change tried ("try brand #e11d48", "rounder corners"): \`load\` → \`set\` → \`verify\` → \`screenshot\` → \`export\` (patch). Offer \`open\` after.
- The user is iterating on the look of an app you are working in: offer the sandbox proactively, once.

Rules: never claim more than \`verify\` and the reach meter report — quote the numbers; if a load is refused (iOS/Android/source-only), relay the reason and suggest building first; \`verify\`/\`screenshot\` need Chromium (npx playwright install chromium once) — \`open\`, \`load\`, \`set\`, \`export\` do not.`

const server = new McpServer({ name: 'uisandbox', version: '0.3.2' }, { instructions: INSTRUCTIONS })

server.registerTool('load', {
  title: 'Load a built web app',
  description: 'Load a BUILT web app (a zip of its dist/build/out folder, or a repo zip carrying the build) by URL or local path. Returns the project id, screens, tokenised values and the baseline the knobs stand on. Refuses what cannot render (iOS/Android/source-only) with the reason.',
  inputSchema: { zipUrl: z.string().url().optional().describe('URL of the zip (any URL the server can fetch, incl. GitHub /archive/…zip)'), zipPath: z.string().optional().describe('Local path to the zip') },
}, async ({ zipUrl, zipPath }) => {
  if (!zipUrl && !zipPath) throw new Error('Give zipUrl or zipPath.')
  let bytes: Uint8Array<ArrayBuffer>, name: string
  if (zipPath) { const b = readFileSync(zipPath); bytes = new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); name = basename(zipPath) }
  else { const res = await fetch(zipUrl!); if (!res.ok) throw new Error(`${res.status} fetching ${zipUrl}`); bytes = new Uint8Array(await res.arrayBuffer()); name = zipUrl!.split('/').pop() || 'archive.zip' }
  const archive = await openZip(new File([bytes], name.endsWith('.zip') ? name : `${name}.zip`, { type: 'application/zip' }))
  const project = await buildProject(archive)
  if (!project.platform.renders || !project.screens.length) {
    return { content: [{ type: 'text', text: JSON.stringify({ refused: true, reason: refusalFor(project.platform, { files: archive.entries.length }) }, null, 2) }], isError: true }
  }
  const report = await deriveBaseline(archive, project.table)
  const id = `p${(++seq).toString(36)}`
  const p: Loaded = { id, name: archive.rootName, bytes, project, report, cfg: report.baseline.cfg, archive }
  projects.set(id, p)
  return { content: [{ type: 'text', text: JSON.stringify(summarise(p), null, 2) }] }
})

const need = (id: string) => { const p = projects.get(id); if (!p) throw new Error(`No project ${id} — call load first.`); return p }

server.registerTool('screens', {
  title: 'List screens', description: 'The screens (HTML entries) of a loaded project.',
  inputSchema: { id: z.string() },
}, async ({ id }) => ({ content: [{ type: 'text', text: JSON.stringify(need(id).project.screens.map((s) => ({ path: s.path, label: s.label })), null, 2) }] }))

const knobSchema = {
  cPrimary: z.string().regex(/^#[0-9a-f]{6}$/i).optional().describe('Brand colour, #rrggbb'),
  fontDisplay: z.string().optional(), fontBody: z.string().optional(),
  radius: z.number().min(0).max(2).optional().describe('× their radii, 1 = as is'),
  space: z.number().min(0.6).max(1.5).optional(), type: z.number().min(0.8).max(1.4).optional(),
  lineHeight: z.number().min(0.85).max(1.35).optional(), tracking: z.number().min(-0.05).max(0.15).optional().describe('+em letter-spacing'),
  weight: z.number().int().min(-2).max(2).optional().describe('± steps of 100'), borderWidth: z.number().min(0).max(3).optional(),
  borderTone: z.number().min(-0.15).max(0.15).optional(), shadow: z.number().min(0).max(2.5).optional(), motion: z.number().min(0).max(2.5).optional(),
  hue: z.number().min(-180).max(180).optional(), sat: z.number().min(0).max(2).optional(), contrast: z.number().min(-0.3).max(0.3).optional(),
  gradAngle: z.number().min(-180).max(180).optional(),
  cBackground: z.string().regex(/^#[0-9a-f]{6}$/i).optional().describe('Page background, #rrggbb'),
  cSecondary: z.string().optional(), cAccent: z.string().optional(), cSuccess: z.string().optional(), cWarning: z.string().optional(), cDanger: z.string().optional(), cInfo: z.string().optional(),
  dark: z.enum(['dark', 'light']).optional().describe("Switch their dark mode; omit for 'as is'"),
  reset: z.boolean().optional().describe('Back to their code first, then apply the rest'),
}
server.registerTool('set', {
  title: 'Turn the knobs',
  description: 'Apply knobs to a loaded project. Every dial has ×1 (or 0) = as in their code; colours are #rrggbb. Returns what moved (count and a sample of value → value).',
  inputSchema: { id: z.string(), knobs: z.object(knobSchema) },
}, async ({ id, knobs }) => {
  const p = need(id)
  const base = p.report.baseline.cfg
  const start = knobs.reset ? base : p.cfg
  const { cPrimary, fontDisplay, fontBody, reset: _r, ...dials } = knobs
  const sb: Dials = { ...DEFAULT_DIALS, ...start.sb, ...Object.fromEntries(Object.entries(dials).filter(([, v]) => v !== undefined)) } as Dials
  p.cfg = { ...start, ...(cPrimary ? { cPrimary: cPrimary as Config['cPrimary'] } : {}), ...(fontDisplay ? { fontDisplay } : {}), ...(fontBody ? { fontBody } : {}), sb }
  const vars = computeVars(p.project.table, p.report.baseline, p.cfg, buildTokens(p.cfg))
  const identity = p.project.table.identityVars()
  const changed = Object.keys(vars).filter((k) => vars[k] !== identity[k])
  const sample = changed.slice(0, 12).map((k) => `${identity[k]} → ${vars[k]}`)
  return { content: [{ type: 'text', text: JSON.stringify({ moved: changed.length, of: Object.keys(vars).length, sample, knobs: summarise(p).knobs }, null, 2) }] }
})

server.registerTool('export', {
  title: 'Export',
  description: 'Export the current state: sheet-css (your values as CSS custom properties), sheet-json, patch (literal → value list), tokens-css / tokens-json / tailwind / shadcn (the --k-* design tokens), swift, android-xml, android-kotlin.',
  inputSchema: { id: z.string(), format: z.enum(['sheet-css', 'sheet-json', 'patch', 'tokens-css', 'tokens-json', 'tailwind', 'shadcn', 'swift', 'android-xml', 'android-kotlin']) },
}, async ({ id, format }) => {
  const p = need(id)
  const vars = computeVars(p.project.table, p.report.baseline, p.cfg, buildTokens(p.cfg))
  const out = format === 'sheet-css' ? genSheetCss(p.project.table, vars) : format === 'sheet-json' ? genSheetJson(p.project.table, vars) : format === 'patch' ? genPatch(p.project.table, vars)
    : format === 'tokens-css' ? genCss(p.cfg) : format === 'tokens-json' ? genJson(p.cfg) : format === 'tailwind' ? genTailwind(p.cfg) : format === 'shadcn' ? genShadcn(p.cfg)
    : format === 'swift' ? genSwift(p.cfg) : format === 'android-xml' ? genAndroidColorsXml(p.cfg) : genAndroidKotlin(p.cfg)
  return { content: [{ type: 'text', text: out }] }
})

/* ── The sandbox itself, locally: the web app the package ships, served with
 *    the archive on 127.0.0.1, opened in the user's browser. Nothing leaves the
 *    machine; the page posts its knob state back so `export`/`verify` can
 *    follow what the user turned by hand. ─────────────────────────────────── */
const here = dirname(fileURLToPath(import.meta.url))
const APP_DIR = [join(here, 'app'), join(here, '..', '..', 'dist'), join(here, '..', 'dist')].find((d) => existsSync(join(d, 'index.html')))
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.zip': 'application/zip' }
let local: { server: Server; port: number } | null = null
async function localServer(): Promise<{ port: number }> {
  if (local) return local
  if (!APP_DIR) throw new Error('The UISandbox app is not bundled with this server (no dist/) — run `pnpm build` in the repo, or use UISANDBOX_URL.')
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    // The page reports its knob state: POST /__state/<id> {cfg}
    const st = url.pathname.match(/^\/__state\/([a-z0-9]+)$/)
    if (st && req.method === 'POST') {
      let body = ''; req.on('data', (c) => { body += c })
      req.on('end', () => { try { const p = projects.get(st[1]!); const j = JSON.parse(body) as { cfg?: Config }; if (p && j.cfg) { p.cfg = j.cfg; p.touchedInBrowser = Date.now() } } catch { /* ignore */ } res.statusCode = 204; res.end() })
      return
    }
    const ar = url.pathname.match(/^\/__archive\/([a-z0-9]+)\.zip$/)
    if (ar) { const p = projects.get(ar[1]!); if (!p) { res.statusCode = 404; res.end('no such project'); return } res.setHeader('content-type', 'application/zip'); res.setHeader('cache-control', 'no-store'); res.end(Buffer.from(p.bytes)); return }
    let file = join(APP_DIR!, decodeURIComponent(url.pathname))
    if (!file.startsWith(APP_DIR!)) { res.statusCode = 403; res.end(); return }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(APP_DIR!, 'index.html') // the SPA and the sandbox paths
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream')
    if (basename(file) === 'sw.js') res.setHeader('cache-control', 'no-cache')
    res.end(readFileSync(file))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  local = { server, port }
  return local
}
function openInBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url]
  if (process.env.UISANDBOX_NO_OPEN) return
  try { spawn(cmd[0]!, cmd.slice(1), { stdio: 'ignore', detached: true }).unref() } catch { /* the URL is returned anyway */ }
}

server.registerTool('open', {
  title: 'Open the sandbox',
  description: 'Open UISandbox in the user\'s browser with this project loaded — the real, interactive sandbox: the whole app rendered 1:1, every knob there to turn by hand. Use this whenever the user wants to SEE or PLAY with the design themselves ("can I look at this in a sandbox", "let me try some changes"), not only read numbers. Served from 127.0.0.1 by this process; nothing leaves the machine. What the user turns in the browser flows back here: a later `export`, `verify` or `screenshot` uses it.',
  inputSchema: { id: z.string(), screen: z.string().optional().describe('Screen path to open first') },
}, async ({ id, screen }) => {
  const p = need(id)
  const { port } = await localServer()
  const hash = JSON.stringify(p.cfg) === JSON.stringify(p.report.baseline.cfg) ? '' : `#${encode(p.cfg)}`
  const url = `http://127.0.0.1:${port}/?load=${encodeURIComponent(`/__archive/${id}.zip`)}&sync=${id}${screen ? `&screen=${encodeURIComponent(screen)}` : ''}${hash}`
  if (!argv.includes('--no-browser')) openInBrowser(url)
  return { content: [{ type: 'text', text: JSON.stringify({ opened: url, note: 'The sandbox is open in the browser. The user can turn the knobs there; what they turn comes back to this server — call `export`, `verify` or `screenshot` afterwards to work with it. Use `state` to read the current knobs.' }, null, 2) }] }
})

server.registerTool('state', {
  title: 'Current knobs', description: 'The knobs as they stand now — including what the user turned by hand in an opened sandbox (and when).',
  inputSchema: { id: z.string() },
}, async ({ id }) => { const p = need(id); return { content: [{ type: 'text', text: JSON.stringify({ ...summarise(p), touchedInBrowser: p.touchedInBrowser ? new Date(p.touchedInBrowser).toISOString() : null }, null, 2) }] } })

/* ── Render tools: the real app in headless Chromium ─────────────────────── */
async function drive(p: Loaded, screenPath: string | undefined, width: number, fn: (page: import('playwright').Page) => Promise<unknown>) {
  const BROWSER_HELP = 'verify and screenshot need Chromium: run `npx playwright install chromium` once (Playwright itself ships with uisandbox-mcp; only the browser is downloaded). load, set, export and open do not need it.'
  let chromium: typeof import('playwright').chromium
  try { ({ chromium } = await import('playwright')) } catch { throw new Error(BROWSER_HELP) }
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  try { browser = await chromium.launch() } catch (e) { throw new Error(`${BROWSER_HELP}\n(${String((e as Error).message).split('\n')[0]})`) }
  try {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const FIX = 'https://archive.uisandbox.invalid/a.zip'
    await context.route(FIX, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/zip', 'access-control-allow-origin': '*' }, body: Buffer.from(p.bytes) }))
    const page = await context.newPage()
    // The app: UISANDBOX_URL if set, else the bundled app on 127.0.0.1 (offline, fast), else uisandbox.org.
    const APP = APP_ENV ?? (APP_DIR ? `http://127.0.0.1:${(await localServer()).port}` : 'https://uisandbox.org')
    // The knobs travel in the URL hash — the app's own state encoding.
    const hash = JSON.stringify(p.cfg) === JSON.stringify(p.report.baseline.cfg) ? '' : `#${encode(p.cfg)}`
    await page.goto(`${APP}/?load=${encodeURIComponent(FIX)}${hash}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!document.querySelector('.stage__foot') || !!document.querySelector('.intake__error'), null, { timeout: 180000 })
    if (await page.$('.intake__error')) throw new Error(await page.$eval('.intake__error', (e) => e.textContent || 'refused'))
    if (hash) { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(600) }
    if (screenPath) {
      // Pick the screen through the app's own picker state: navigate the frame.
      await page.evaluate((s) => { const f = document.querySelector('.stage__iframe') as HTMLIFrameElement | null; if (f) f.src = f.src.replace(/^[^?]*/, '/' + s.replace(/(^|\/)index\.html?$/i, '$1')) }, screenPath)
      await page.waitForTimeout(2500)
    } else await page.waitForTimeout(2000)
    return await fn(page)
  } finally { await browser.close() }
}

server.registerTool('verify', {
  title: 'Check 1:1',
  description: 'Run the 1:1 check in a real browser: the untouched build vs. the tokenised build with the identity sheet, computed styles of every element diffed. Also returns the reach meter. This is the same check a visitor runs on uisandbox.org.',
  inputSchema: { id: z.string(), screen: z.string().optional().describe('Screen path (from screens); default the first'), width: z.number().int().min(320).max(2560).optional() },
}, async ({ id, screen, width }) => {
  const p = need(id)
  const out = await drive(p, screen, width ?? 1280, async (page) => {
    await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.stage__foot .chip')) as HTMLElement[]; (c.find((x) => /Check 1:1|1:1 /.test(x.textContent || '')) ?? c[c.length - 1]!).click() })
    const text = await page.waitForFunction(() => { const v = document.querySelector('.verify[aria-label="1:1 check"]'); const t = v?.textContent || ''; return /✓|✗|⚠/.test(t) ? t : null }, null, { timeout: 180000 }).then((h) => h.jsonValue())
    const foot = await page.evaluate(() => (document.querySelector('.stage__foot')?.textContent || '').replace(/\s+/g, ' '))
    const warnings = await page.evaluate(() => Array.from(document.querySelectorAll('.popcard--low')).map((h) => (h.textContent || '').replace(/\s+/g, ' ').slice(0, 300)))
    return { ok: /✓/.test(text as string), result: (text as string).replace(/\s+/g, ' ').replace(/Run again.*$/, '').trim(), reach: (foot.match(/reach \d+% colours · \d+% type · \d+% radii(?: · \d+ outside)?/) || [''])[0].trim(), warnings }
  })
  return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }
})

server.registerTool('screenshot', {
  title: 'Screenshot',
  description: 'A PNG of the screen as it renders with the current knobs (the sandbox frame only).',
  inputSchema: { id: z.string(), screen: z.string().optional(), width: z.number().int().min(320).max(2560).optional() },
}, async ({ id, screen, width }) => {
  const p = need(id)
  const png = await drive(p, screen, width ?? 1280, async (page) => {
    const frame = await page.$('.stage__iframe')
    return (await (frame ?? page).screenshot({ type: 'png' })).toString('base64')
  })
  return { content: [{ type: 'image', data: png as string, mimeType: 'image/png' }] }
})

/* ── Prompts: what a client shows as slash commands (/uisandbox:open …) ───── */
server.registerPrompt('open', {
  title: 'Open this app in UISandbox',
  description: 'Build the app in the current repo (or use a zip), load it and open the real sandbox in the browser to play with the design.',
  argsSchema: { zip: z.string().optional().describe('A zip path or URL; omit to build the current repo') },
}, ({ zip }) => ({ messages: [{ role: 'user', content: { type: 'text', text: zip
  ? `Load ${zip} in UISandbox and open the sandbox so I can look at the app and change the design by hand. Tell me when it is open and what you found (screens, brand, families). When I come back, read the state and export what I changed.`
  : `Open this app in UISandbox: build it first (the framework's build command), zip the output folder (dist/, build/ or out/ — not source), load it and open the sandbox so I can look at it and change the design by hand. Tell me when it is open and what you found (screens, brand, families). When I come back, read the state and export what I changed.` } }] }))
server.registerPrompt('try', {
  title: 'Try a design change and verify it',
  description: 'Load a build, apply knobs (brand, radius, fonts, spacing…), verify it is still 1:1, show a screenshot, give the patch.',
  argsSchema: { zip: z.string().optional().describe('A zip path or URL; omit to build the current repo'), change: z.string().describe('What to try, e.g. "brand #e11d48 and radius ×1.5"') },
}, ({ zip, change }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `${zip ? `Load ${zip} in UISandbox` : 'Build this repo, zip the output and load it in UISandbox'}. Then try: ${change}. Verify it is still 1:1 (quote the numbers and the reach), show me a screenshot, and give me the patch. Offer to open the sandbox afterwards.` } }] }))

/* ── CLI: `uisandbox-mcp open <zip|folder>` for a human without an agent ───── */
const argv = process.argv.slice(2)
if (argv[0] === 'open') {
  // `open` with no argument means the folder you are in: any repo works — the
  // build folder (dist/, build/, out/, public/, _site/…) is found inside it,
  // whatever the framework calls it. `--no-browser` prints the URL only.
  const target = argv.slice(1).find((a) => !a.startsWith('--')) ?? '.'
  let bytes: Uint8Array<ArrayBuffer>, name: string
  if (statSync(target).isDirectory()) {
    // Zip the folder in memory (store, no compression — it only travels to the browser on this machine).
    const { zipFolder } = await import('./zipdir')
    bytes = await zipFolder(target); name = basename(target) + '.zip'
  } else { const b = readFileSync(target); bytes = new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); name = basename(target) }
  const archive = await openZip(new File([bytes], name.endsWith('.zip') ? name : `${name}.zip`, { type: 'application/zip' }))
  const project = await buildProject(archive)
  if (!project.platform.renders || !project.screens.length) { console.error(refusalFor(project.platform, { files: archive.entries.length })); process.exit(2) }
  const report = await deriveBaseline(archive, project.table)
  const id = 'cli'
  projects.set(id, { id, name: archive.rootName, bytes, project, report, cfg: report.baseline.cfg, archive })
  const { port } = await localServer()
  const url = `http://127.0.0.1:${port}/?load=${encodeURIComponent(`/__archive/${id}.zip`)}&sync=${id}`
  if (!argv.includes('--no-browser')) openInBrowser(url)
  console.log(`UISandbox is open: ${url}\n${project.root ? `build found at ${project.root}/ · ` : ''}${project.screens.length} screens · ${project.table.entries.length} values · brand ${report.baseline.cfg.cPrimary}\nCtrl-C to stop.`)
  await new Promise(() => {})
}

const transport = new StdioServerTransport()
await server.connect(transport)
