/**
 * Export what was IN the sandbox — their values, as they stand now.
 *
 * Three shapes of the same sheet (one source: `computeVars`):
 *   css     `:root { --sb-color-1: #e11d48; … }` + a comment per variable
 *           saying which literal it replaced and where
 *   json    entries with kind, original, current, count and sites
 *   patch   a per-file list of `original → current` — what a find-and-replace
 *           (or a codemod, or an agent) needs to apply the sandbox to the code
 *
 * Nothing here is derived a second time: the export reads the exact map the
 * iframe is painting with.
 */
import type { Entry, SubstitutionTable } from '../sandbox/table'
import { cssValue, varName } from '../sandbox/table'
import { rewriteCss, rewriteHtml } from '../sandbox/rewrite'
import { SOURCE_EXT, patchSourceFile } from '../sandbox/sourceScan'

export interface SheetRow {
  entry: Entry
  /** Stable, readable name for the exports: --sb-color-1, --sb-radius-2 … */
  name: string
  current: string
  changed: boolean
}

export function sheetRows(table: SubstitutionTable, vars: Record<string, string>): SheetRow[] {
  const perKind: Record<string, number> = {}
  return table.entries.map((entry) => {
    perKind[entry.kind] = (perKind[entry.kind] ?? 0) + 1
    const original = cssValue(entry.value)
    const current = vars[varName(entry.id)] ?? original
    return { entry, name: `--sb-${entry.kind}-${perKind[entry.kind]}`, current, changed: current !== original }
  })
}

export function genSheetCss(table: SubstitutionTable, vars: Record<string, string>, opts: { changedOnly?: boolean } = {}): string {
  const rows = sheetRows(table, vars).filter((r) => !opts.changedOnly || r.changed)
  const lines = rows.map((r) => {
    const where = r.entry.sites.slice(0, 3).map((s) => `${s.file}${s.selector ? ` ${s.selector}` : ''} { ${s.prop} }`).join(' · ')
    const was = r.changed ? ` (was ${cssValue(r.entry.value)})` : ''
    return `  /* ×${r.entry.count}${was} — ${where}${r.entry.count > 3 ? ' …' : ''} */\n  ${r.name}: ${r.current};`
  })
  return `/* UISandbox — your values, as they stand in the sandbox.\n * ${rows.length} variables${opts.changedOnly ? ' (changed only)' : ''}; every one replaced a literal in your CSS.\n */\n:root {\n${lines.join('\n')}\n}\n`
}

export function genSheetJson(table: SubstitutionTable, vars: Record<string, string>): string {
  const rows = sheetRows(table, vars).map((r) => ({
    name: r.name,
    kind: r.entry.kind,
    original: cssValue(r.entry.value),
    current: r.current,
    changed: r.changed,
    count: r.entry.count,
    sites: r.entry.sites,
  }))
  return JSON.stringify({ generator: 'uisandbox', variables: rows }, null, 2) + '\n'
}

/** `file → [original, current]` for everything that changed. */
export function genPatch(table: SubstitutionTable, vars: Record<string, string>): string {
  const rows = sheetRows(table, vars).filter((r) => r.changed)
  const byFile = new Map<string, Array<{ from: string; to: string; kind: string; count: number }>>()
  for (const r of rows) {
    const files = new Set(r.entry.sites.map((s) => s.file))
    for (const f of files) {
      if (!byFile.has(f)) byFile.set(f, [])
      byFile.get(f)!.push({ from: cssValue(r.entry.value), to: r.current, kind: r.entry.kind, count: r.entry.sites.filter((s) => s.file === f).length })
    }
  }
  if (!byFile.size) return '# Nothing changed — the sandbox is still 1:1 with your code.\n'
  const out: string[] = ['# UISandbox patch — replace these literals in your source to apply what you see.', '# One line per value: kind  original  →  current  (occurrences seen in the built CSS)', '']
  for (const [file, list] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`## ${file}`)
    for (const l of list) out.push(`${l.kind.padEnd(11)} ${l.from}  →  ${l.to}   (×${l.count})`)
    out.push('')
  }
  return out.join('\n')
}

/**
 * Generated output, not source. The source patcher exists for the real files
 * in an archive that also ships a build (`src/theme.ts` next to `dist/`) — but
 * on a plain web build the only things matching its extensions are bundles,
 * and a value written into a bundle is lost on the next build, while the scan
 * itself is quadratic in the literals it finds.
 *
 * Measured on the Mantine docs: 2228 matching files, 161 MB of Next.js chunks,
 * and the whole export sat on "Preparing…" for 113 seconds to hand back
 * nothing usable. The test is the file's own line geometry — nobody hand-edits
 * a 500 KB line — so it needs no list of build directories to stay current.
 */
export function isGenerated(path: string, text: string): boolean {
  if (/(^|\/)(node_modules|\.next|_next|\.nuxt|\.svelte-kit)\//.test(path)) return true
  if (/\.min\.[a-z]+$/i.test(path)) return true
  if (text.length < 20000) return false
  let lines = 1
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++
  return text.length / lines > 400
}

/**
 * Their stylesheets and pages with the sandbox's values written IN PLACE —
 * byte-precise, from the same scanner that tokenised them, so a `12px` that
 * was a radius becomes `0px` while the `12px` that was padding becomes `9px`.
 * A find-and-replace list cannot tell those apart; this can. Only files with
 * at least one change are returned.
 */
export async function genPatchedFiles(
  files: Map<string, { blob: Blob; type: string }>,
  table: SubstitutionTable,
  vars: Record<string, string>,
  /** `@import`/`@font-face` for a font the knobs chose — a patched sheet that
   *  names Manrope must also LOAD Manrope, or the site gets sans-serif. */
  fontCss = '',
): Promise<Array<{ path: string; text: string }>> {
  const out: Array<{ path: string; text: string }> = []
  // One parse per distinct stylesheet, not per file that carries it.
  const cache = new Map<string, string>()
  const families = [...fontCss.matchAll(/family=([^:&'"]+)|font-family:'([^']+)'/g)].map((m) => (m[1] ?? m[2] ?? '').replace(/\+/g, ' ')).filter(Boolean)
  for (const [path, f] of files) {
    if (/\.css$/i.test(path)) {
      const css = await f.blob.text()
      let patched = rewriteCss(css, table, path, { mode: 'values', vars, cache })
      if (patched !== css && fontCss && families.some((fam) => patched.includes(fam))) {
        // @import must precede every rule; keep an existing @charset first.
        const m = patched.match(/^@charset[^;]*;\s*/i)
        patched = m ? m[0] + fontCss + '\n' + patched.slice(m[0].length) : fontCss + '\n' + patched
      }
      if (patched !== css) out.push({ path, text: patched })
    } else if (/\.html?$/i.test(path)) {
      const html = await f.blob.text()
      // In `values` mode rewriteHtml only rewrites `<style>` blocks and
      // `style=` attributes, so a page with neither comes back byte-identical.
      // Measured on the Mantine docs (364 pre-rendered Next.js pages): the
      // whole pass took 113 s and the dialog sat on "Preparing…" for two
      // minutes to hand back the same bytes it was given.
      if (!/<style|\sstyle\s*=/i.test(html)) continue
      const patched = rewriteHtml(html, table, path, { mode: 'values', vars, cache })
      if (patched !== html) out.push({ path, text: patched })
    } else if (SOURCE_EXT.test(path)) {
      const text = await f.blob.text()
      if (isGenerated(path, text)) continue
      const patched = patchSourceFile(path, text, table, vars)
      if (patched !== text) out.push({ path, text: patched })
    }
  }
  return out
}
