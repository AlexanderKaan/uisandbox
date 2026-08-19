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
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
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

const APP = (process.env.UISANDBOX_URL ?? 'https://uisandbox.org').replace(/\/$/, '')

interface Loaded { id: string; name: string; bytes: Uint8Array<ArrayBuffer>; project: SandboxProject; report: BaselineReport; cfg: Config; archive: Archive }
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

const server = new McpServer({ name: 'uisandbox', version: '0.1.0' })

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

/* ── Render tools: the real app in headless Chromium ─────────────────────── */
async function drive(p: Loaded, screenPath: string | undefined, width: number, fn: (page: import('playwright').Page) => Promise<unknown>) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const FIX = 'https://archive.uisandbox.invalid/a.zip'
    await context.route(FIX, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/zip', 'access-control-allow-origin': '*' }, body: Buffer.from(p.bytes) }))
    const page = await context.newPage()
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
    await page.evaluate(() => { const c = document.querySelectorAll('.stage__foot .chip'); (c[c.length - 1] as HTMLElement).click() })
    const text = await page.waitForFunction(() => { const v = document.querySelector('.verify[aria-label="1:1 check"]'); const t = v?.textContent || ''; return /✓|✗|⚠/.test(t) ? t : null }, null, { timeout: 180000 }).then((h) => h.jsonValue())
    const foot = await page.evaluate(() => (document.querySelector('.stage__foot')?.textContent || '').replace(/\s+/g, ' '))
    const warnings = await page.evaluate(() => Array.from(document.querySelectorAll('.popcard--low')).map((h) => (h.textContent || '').replace(/\s+/g, ' ').slice(0, 300)))
    return { ok: /✓/.test(text as string), result: (text as string).replace(/\s+/g, ' ').replace(/Run again.*$/, '').trim(), reach: (foot.match(/reach [^|]*?radii[^|]*/) || [''])[0].trim(), warnings }
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

const transport = new StdioServerTransport()
await server.connect(transport)
