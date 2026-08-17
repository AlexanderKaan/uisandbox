/* Round-trip: apply the sandbox's values to the acme source (their files, in
 * place) exactly as the Export → "Your files, patched" does, and write
 * fixtures/acme-patched/ — the "next release". Loading THAT raw in the sandbox
 * and diffing its census against the knob-turned sandbox measures whether what
 * you see is what you get. Runtime styles set from app.js are patched by hand
 * per the patch list, as a developer would. */
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { buildTokens } from '../src/tokens/buildTokens'
import { rewriteCss, rewriteHtml } from '../src/sandbox/rewrite'
import { SubstitutionTable } from '../src/sandbox/table'
import { computeVars } from '../src/sandbox/mapping'
import { googleFontsImport } from '../src/tokens/fonts'
import type { Config } from '../src/tokens/types'

const base = JSON.parse(process.argv[2]!) as Config
const cfg = JSON.parse(process.argv[3]!) as Config
const src = 'fixtures/acme-dist', out = 'fixtures/acme-patched'
cpSync(src, out, { recursive: true })
const files = ['assets/index-a1b2c3.css', 'index.html', 'pricing.html', 'settings.html']
const table = new SubstitutionTable()
const texts = Object.fromEntries(files.map((f) => [f, readFileSync(`${src}/${f}`, 'utf8')]))
for (const f of files) (f.endsWith('.css') ? rewriteCss : rewriteHtml)(texts[f]!, table, f)
// app.js's runtime literals, registered the way the live observer would
table.add('color', 'rgb(79, 57, 246)', { file: 'inline (runtime)', prop: 'color' })
table.add('color', '#4338ca', { file: '<style> (runtime)', prop: 'color' })
const vars = computeVars(table, { cfg: base, tokens: buildTokens(base) }, cfg, buildTokens(cfg))
const fontCss = googleFontsImport(cfg.fontDisplay, cfg.fontBody)
mkdirSync(`${out}/assets`, { recursive: true })
for (const f of files) {
  let t = (f.endsWith('.css') ? rewriteCss : rewriteHtml)(texts[f]!, table, f, { mode: 'values', vars })
  if (f.endsWith('.css')) t = fontCss + '\n' + t
  writeFileSync(`${out}/${f}`, t)
}
// app.js by hand, per the patch list
const idOf = (kind: string, v: string) => table.find(kind as never, v)!.id
let js = readFileSync(`${src}/assets/app.js`, 'utf8')
js = js.replace('#4f39f6', vars[`--us-v${idOf('color', 'rgb(79, 57, 246)')}`]!).replace('#4338ca', vars[`--us-v${idOf('color', '#4338ca')}`]!)
writeFileSync(`${out}/assets/app.js`, js)
console.log('moved', Object.keys(vars).filter((k) => vars[k] !== table.identityVars()[k]).length, 'entries', table.entries.length)
