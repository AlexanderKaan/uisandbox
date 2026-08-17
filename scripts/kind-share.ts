/* Per kind: how many sheet values, and how many colour entries land in a family
 * a knob can reach (vs `keep`). The knob-effect % is bounded by these. */
import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { rewriteCss, rewriteHtml } from '../src/sandbox/rewrite'
import { SubstitutionTable } from '../src/sandbox/table'
import { familiesOf } from '../src/sandbox/mapping'
import { brandDeclared, brandFromTable } from '../src/sandbox/baseline'
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (/node_modules|\.git/.test(f) ? [] : walk(p)) : [p] })
const kinds: Record<string, number> = {}; const fams: Record<string, number> = {}; let total = 0
for (const zip of process.argv.slice(2)) {
  const dir = mkdtempSync(join(tmpdir(), 'ks-')); execSync(`unzip -qo "${zip}" -d "${dir}"`)
  const t = new SubstitutionTable()
  for (const f of walk(dir).filter((p) => /\.(css|html?)$/i.test(p)).sort()) { const x = readFileSync(f, 'utf8'); if (extname(f) === '.css') rewriteCss(x, t, f); else rewriteHtml(x, t, f) }
  const brand = brandDeclared(t) ?? brandFromTable(t) ?? '#0a84ff'
  const F = familiesOf(t, brand)
  for (const e of t.entries) { kinds[e.kind] = (kinds[e.kind] ?? 0) + 1; total++; if (e.kind === 'color') { const f = F.of.get(e.id) ?? '?'; fams[f] = (fams[f] ?? 0) + 1 } }
}
console.log('total values', total)
for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(15), String(n).padStart(5), (100 * n / total).toFixed(1) + '%')
console.log('\ncolour families:')
for (const [k, n] of Object.entries(fams).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(15), String(n).padStart(5), (100 * n / kinds.color!).toFixed(1) + '% of colours')
