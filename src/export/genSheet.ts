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
import { varName } from '../sandbox/table'

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
    const current = vars[varName(entry.id)] ?? entry.value
    return { entry, name: `--sb-${entry.kind}-${perKind[entry.kind]}`, current, changed: current !== entry.value }
  })
}

export function genSheetCss(table: SubstitutionTable, vars: Record<string, string>, opts: { changedOnly?: boolean } = {}): string {
  const rows = sheetRows(table, vars).filter((r) => !opts.changedOnly || r.changed)
  const lines = rows.map((r) => {
    const where = r.entry.sites.slice(0, 3).map((s) => `${s.file}${s.selector ? ` ${s.selector}` : ''} { ${s.prop} }`).join(' · ')
    const was = r.changed ? ` (was ${r.entry.value})` : ''
    return `  /* ×${r.entry.count}${was} — ${where}${r.entry.count > 3 ? ' …' : ''} */\n  ${r.name}: ${r.current};`
  })
  return `/* UISandbox — your values, as they stand in the sandbox.\n * ${rows.length} variables${opts.changedOnly ? ' (changed only)' : ''}; every one replaced a literal in your CSS.\n */\n:root {\n${lines.join('\n')}\n}\n`
}

export function genSheetJson(table: SubstitutionTable, vars: Record<string, string>): string {
  const rows = sheetRows(table, vars).map((r) => ({
    name: r.name,
    kind: r.entry.kind,
    original: r.entry.value,
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
      byFile.get(f)!.push({ from: r.entry.value, to: r.current, kind: r.entry.kind, count: r.entry.sites.filter((s) => s.file === f).length })
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
