#!/usr/bin/env node
/**
 * The launch clip: four real builds, a different knob on each, then the 1:1
 * check and the export.
 *
 * Frames are CAPTURED one at a time rather than screen recorded, so every cut
 * is exact and the playback speed is a choice rather than whatever the machine
 * managed on the day.
 *
 * The builds were picked by MEASUREMENT, not by eye. Each was loaded and each
 * knob turned, and the share of stage pixels that moved was counted:
 *
 *   build                   brand    hue   dark  shape
 *   sb-admin-2              19.8%  20.3%   0.0%  11.9%   → brand
 *   material-dashboard       1.7%   3.2%  87.7%   7.2%   → dark mode
 *   vitepress                1.6%  15.4%  73.9%  25.5%   → hue, then the type
 *   agency                   0.3%   0.3%   0.0%  28.7%   → cut
 *
 * The first cut swept the BRAND on all three of vitepress, agency and
 * sb-admin-2, chosen by eye. Agency moves 0.3% under brand: two of the three
 * scenes were a still image of a page not changing.
 *
 * The measurement has its own limit, and agency shows that too. Its 28.7% on
 * `shape` is the highest number in the table, and the scene was unusable: most
 * of that is TEXT REFLOWING as spacing grows. Pixels moving is not the same as
 * a design visibly changing, so the table shortlists and the eye decides.
 *
 *   node scripts/launch-clip.mjs      → brand/marketing/launch.mp4 + launch.gif
 */
import { chromium } from 'playwright'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRAMES = join(root, '.holdouts', 'frames')
const OUT = join(root, 'brand', 'marketing')
if (existsSync(FRAMES)) rmSync(FRAMES, { recursive: true })
mkdirSync(FRAMES, { recursive: true })
mkdirSync(OUT, { recursive: true })

const FPS = 20
const W = 1280, H = 720
let n = 0

const port = 5229
const server = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no vite')), 30000)
  server.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); setTimeout(res, 900) } }) })

const browser = await chromium.launch()
// Shot at 2x and scaled down at the end: at 1x the panel's 11.5px captions go
// soft, and this clip is mostly small type beside a big picture.
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })

const shot = async (p) => { await p.screenshot({ path: join(FRAMES, `f${String(++n).padStart(5, '0')}.png`) }) }
const hold = async (p, frames) => { for (let i = 0; i < frames; i++) await shot(p) }
const set = async (p, patch) => p.evaluate((x) => {
  const u = window.__us, { sb = {}, ...rest } = x
  u.dispatch({ type: 'SET', patch: { ...rest, sb: { ...u.cfg.sb, ...sb } } })
}, patch)

/** A hue sweep at a fixed, believable saturation and lightness. */
const brandAt = (deg) => {
  const h = ((deg % 360) + 360) % 360, s = 0.72, l = 0.48
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
}

const open = async (fixture, { door = false } = {}) => {
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${port}/?load=${encodeURIComponent('/fixtures/' + fixture)}`, { waitUntil: 'domcontentloaded' })
  if (door) for (let i = 0; i < 22 && !(await page.$('.stage__foot')); i++) await shot(page)
  await page.waitForFunction(() => document.querySelector('.stage__foot'), null, { timeout: 120000 })
  await page.waitForTimeout(4500)
  // The read-out card covers the app. In a still it is the point; in a clip it
  // is a lid on the thing the clip is about.
  await page.evaluate(() => { for (const b of document.querySelectorAll('.popcard button')) if (/close/i.test(b.textContent)) b.click() })
  await page.waitForTimeout(700)
  return page
}

const sweep = async (page, frames, fn) => { for (let i = 0; i <= frames; i++) { await set(page, fn(i / frames)); await shot(page) } }

// 1 — a dashboard, from the door: the brand
const dash = await open('startbootstrap-sb-admin-2-master.zip', { door: true })
await hold(dash, 16)
await sweep(dash, 44, (t) => ({ cPrimary: brandAt(215 + t * 300) }))
await hold(dash, 18)

// 2 — their own dark mode, switched on their own hooks
let page = await open('s13-material-dashboard.zip')
await hold(page, 16)
await set(page, { sb: { dark: 'dark' } }); await page.waitForTimeout(500)
await hold(page, 26)
await page.close()

// 3 — hue: every colour, not just the brand's family. Then the type.
page = await open('s11-vitepress.zip')
await hold(page, 12)
await sweep(page, 42, (t) => ({ sb: { hue: t * 170 } }))
await hold(page, 10)
await set(page, { fontDisplay: 'Geist Mono', fontBody: 'Geist Mono' })
await page.waitForTimeout(2200)
await hold(page, 24)
await page.close()

// 5 — the check
await dash.bringToFront()
await hold(dash, 8)
await dash.evaluate(() => { for (const b of document.querySelectorAll('.stage__foot button')) if (/check/i.test(b.textContent)) b.click() })
for (let i = 0; i < 80; i++) {
  await shot(dash)
  const done = await dash.evaluate(() => { const v = document.querySelector('.verify'); return !!v && !/checking|running/i.test(v.textContent) })
  if (done && i > 20) break
}
await hold(dash, 26)

// 6 — and the code comes out
await dash.evaluate(() => { const v = document.querySelector('.verify button'); if (v) v.click() })
await dash.waitForTimeout(400)
await dash.click('button:has-text("Export")')
await dash.waitForSelector('.dialog', { timeout: 15000 })
await dash.waitForTimeout(1000)
await hold(dash, 34)

await browser.close(); server.kill()
console.log(`${n} frames · ${Math.round(n / FPS * 10) / 10}s at ${FPS}fps`)

const ff = (args) => { const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0) { console.error(String(r.stderr).split('\n').slice(-6).join('\n')); process.exit(1) } }
const src = join(FRAMES, 'f%05d.png')
ff(['-y', '-framerate', String(FPS), '-i', src, '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', join(OUT, 'launch.mp4')])
ff(['-y', '-framerate', String(FPS), '-i', src, '-vf', `fps=14,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=200[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`, join(OUT, 'launch.gif')])
for (const f of ['launch.mp4', 'launch.gif']) console.log(f, (statSync(join(OUT, f)).size / 1024 / 1024).toFixed(1) + ' MB')
