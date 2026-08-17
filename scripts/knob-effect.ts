/* Measure, on real builds: for each knob, how many of THEIR sheet values move
 * and how far; and which CSS properties in their stylesheets carry literals we
 * do not tokenise yet. Runs on the fixture zips (node, no browser). */
import { readFileSync } from 'node:fs'
import { buildTokens } from '../src/tokens/buildTokens'
import { DEFAULT_CONFIG } from '../src/tokens/defaults'
import { COLOR_THEMES } from '../src/tokens/stylesAndThemes'
import { rewriteCss, rewriteHtml, scanDeclarations } from '../src/sandbox/rewrite'
import { SubstitutionTable } from '../src/sandbox/table'
import { computeVars } from '../src/sandbox/mapping'
import { brandDeclared, brandFromTable, radiusFromTable, bodySizeFromTable, fontsFromTable } from '../src/sandbox/baseline'
import type { Config } from '../src/tokens/types'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { mkdtempSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const zips = process.argv.slice(2)
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (/node_modules|\.git/.test(f) ? [] : walk(p)) : [p] })

const KNOBS: Array<[string, Partial<Config>]> = [
  ['brand→rose', { cPrimary: COLOR_THEMES.rose.cPrimary }],
  ['radius→none', { radius: 'none' }], ['radius→round', { radius: 'round' }],
  ['scale→compact', { scale: 'compact' }], ['scale→comfortable', { scale: 'comfortable' }],
  ['typeScale→xl', { typeScale: 'xl' }],
  ['fontBody→Manrope', { fontBody: 'Manrope' } as Partial<Config>], ['fontDisplay→Fraunces', { fontDisplay: 'Fraunces' } as Partial<Config>],
  ['elevation→flat', { surfaceDepth: 'flat' } as Partial<Config>], ['elevation→deep', { surfaceDepth: 'deep' } as Partial<Config>],
  ['neutral→neutral', { neutral: 'neutral' } as Partial<Config>],
  ['harmony→complement', { harmony: 'complement' } as Partial<Config>], ['spread→150', { spread: 150 } as Partial<Config>],
  ['conformance→aaa', { conformance: 'aaa' } as Partial<Config>],
  ['labelCase→caps', { labelCase: 'caps' } as Partial<Config>],
  ['surface→filled', { surface: 'filled' } as Partial<Config>], ['surface→flat', { surface: 'flat' } as Partial<Config>],
  ['canvas→white', { canvas: 'white' } as Partial<Config>], ['canvas→brand', { canvas: 'brand' } as Partial<Config>],
  ['borders→strong', { borders: 'strong' } as Partial<Config>], ['borders→faint', { borders: 'faint' } as Partial<Config>],
]
const UNTOKENISED: Record<string, number> = {}
const rows: string[] = []
const agg: Record<string, { moved: number; total: number }> = {}

for (const zip of zips) {
  const dir = mkdtempSync(join(tmpdir(), 'ke-'))
  execSync(`unzip -qo "${zip}" -d "${dir}"`)
  const files = walk(dir).filter((p) => /\.(css|html?)$/i.test(p) && !/node_modules/.test(p))
  const table = new SubstitutionTable()
  for (const f of files.sort()) {
    const text = readFileSync(f, 'utf8')
    if (extname(f) === '.css') rewriteCss(text, table, f)
    else rewriteHtml(text, table, f)
    // census of literal-bearing declarations we skip
    const css = extname(f) === '.css' ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
    for (const d of scanDeclarations(css)) {
      const v = css.slice(d.valueStart, d.valueEnd)
      if (/^(line-height|letter-spacing|border-width|border-top-width|font-weight|opacity|transition|transition-duration|animation-duration|min-height|height|width|max-width|gap|outline-width|stroke-width|text-transform)$/.test(d.prop) && /\d|bold|uppercase/.test(v) && !/var\(/.test(v)) UNTOKENISED[d.prop] = (UNTOKENISED[d.prop] ?? 0) + 1
    }
  }
  if (!table.entries.length) continue
  let cfg: Config = { ...DEFAULT_CONFIG }
  const brand = brandDeclared(table) ?? brandFromTable(table)
  if (brand) cfg = { ...cfg, cPrimary: brand as Config['cPrimary'] }
  const r = radiusFromTable(table); if (r) cfg = { ...cfg, radius: r }
  const t = bodySizeFromTable(table); if (t) cfg = { ...cfg, typeScale: t }
  const f = fontsFromTable(table); if (f.body) cfg = { ...cfg, fontBody: f.body, fontDisplay: f.display ?? f.body }
  const baseline = { cfg, tokens: buildTokens(cfg) }
  const id = table.identityVars()
  const line: string[] = [zip.split('/').pop()!.replace('.zip', '').padEnd(28) + String(table.entries.length).padStart(4)]
  for (const [name, patch] of KNOBS) {
    const c2 = { ...cfg, ...patch }
    const out = computeVars(table, baseline, c2, buildTokens(c2))
    const moved = Object.keys(out).filter((k) => out[k] !== id[k]).length
    agg[name] = agg[name] ?? { moved: 0, total: 0 }
    agg[name].moved += moved; agg[name].total += table.entries.length
    line.push(String(moved).padStart(4))
  }
  rows.push(line.join(' '))
}
console.log('fixture'.padEnd(28) + ' vals ' + KNOBS.map(([n]) => n.slice(0, 4)).join(' '))
for (const r of rows) console.log(r)
console.log('\nPer knob, share of sheet values that move (all fixtures):')
for (const [name, a] of Object.entries(agg).sort((x, y) => y[1].moved / y[1].total - x[1].moved / x[1].total)) console.log(name.padEnd(24), (100 * a.moved / a.total).toFixed(1).padStart(5) + '%', `(${a.moved}/${a.total})`)
console.log('\nLiteral-bearing declarations we do NOT tokenise (count across fixtures):')
for (const [p, n] of Object.entries(UNTOKENISED).sort((a, b) => b[1] - a[1])) console.log(p.padEnd(22), n)
