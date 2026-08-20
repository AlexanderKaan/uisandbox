import { useMemo, useState } from 'react'
import { Check, Copy, Download, X } from 'lucide-react'
import type { Config } from '../tokens/types'
import type { SubstitutionTable } from '../sandbox/table'
import { genSheetCss, genSheetJson, genPatch, genPatchedFiles } from '../export/genSheet'
import type { ServedFile } from '../sandbox/project'
import { useEffect } from 'react'
import { genCss } from '../export/genCss'
import { genJson } from '../export/genJson'
import { genTailwind } from '../export/genTailwind'
import { genShadcn } from '../export/genShadcn'
import { genSwift, genAssetCatalog } from '../export/genSwift'
import { genAndroidColorsXml, genAndroidKotlin } from '../export/genAndroid'
import { zipSync } from '../export/zip'

interface ExportDialogProps {
  cfg: Config
  table: SubstitutionTable
  vars: Record<string, string>
  projectName: string
  /** Their original files — the patched export writes the values into these. */
  files: Map<string, ServedFile>
  fontCss: string
  onClose: () => void
}

interface Item { id: string; group: string; label: string; file: string; make: () => string }

/**
 * Two things come out, and the dialog says which is which:
 *   YOUR VALUES  — the sheet: exactly what is in the sandbox right now, as
 *                  CSS variables, JSON, or a patch list per file
 *   THE TOKENS   — the --k-* system the knobs describe (CSS/JSON/Tailwind/
 *                  shadcn) and, for iOS, Swift constants + an asset catalog
 */
export function ExportDialog({ cfg, table, vars, projectName, files, fontCss, onClose }: ExportDialogProps) {
  const [patched, setPatched] = useState<Array<{ path: string; text: string }> | null>(null)
  useEffect(() => { let on = true; void genPatchedFiles(files, table, vars, fontCss).then((p) => { if (on) setPatched(p) }); return () => { on = false } }, [files, table, vars, fontCss])
  const items = useMemo<Item[]>(() => [
    { id: 'files', group: 'Your files, patched', label: patched === null ? 'Preparing…' : patched.length ? `${patched.length} file${patched.length === 1 ? '' : 's'} changed` : 'Nothing changed yet', file: 'patched-files.txt', make: () => (patched ?? []).map((f) => `/* ===== ${f.path} ===== */\n${f.text}`).join('\n\n') || '/* Turn a knob first — then your CSS/HTML appear here with the new values written in place. */' },
    { id: 'sheet-css', group: 'Your values', label: 'CSS variables', file: 'sandbox-values.css', make: () => genSheetCss(table, vars) },
    { id: 'sheet-changed', group: 'Your values', label: 'CSS, changed only', file: 'sandbox-changes.css', make: () => genSheetCss(table, vars, { changedOnly: true }) },
    { id: 'sheet-patch', group: 'Your values', label: 'Patch list (find → replace)', file: 'sandbox-patch.txt', make: () => genPatch(table, vars) },
    { id: 'sheet-json', group: 'Your values', label: 'JSON', file: 'sandbox-values.json', make: () => genSheetJson(table, vars) },
    { id: 'tokens-css', group: 'The tokens', label: 'tokens.css', file: 'tokens.css', make: () => genCss(cfg) },
    { id: 'tokens-json', group: 'The tokens', label: 'tokens.json', file: 'tokens.json', make: () => genJson(cfg) },
    { id: 'tokens-tw', group: 'The tokens', label: 'Tailwind', file: 'tailwind.tokens.js', make: () => genTailwind(cfg) },
    { id: 'tokens-shadcn', group: 'The tokens', label: 'shadcn', file: 'shadcn.css', make: () => genShadcn(cfg) },
    { id: 'ios-swift', group: 'iOS', label: 'DesignTokens.swift', file: 'DesignTokens.swift', make: () => genSwift(cfg) },
    { id: 'ios-assets', group: 'iOS', label: 'Asset catalog (colour sets)', file: 'DesignTokens.xcassets.txt', make: () => genAssetCatalog(cfg).map((f) => `// ${f.path}\n${f.content}`).join('\n') },
    { id: 'android-xml', group: 'Android', label: 'colors.xml (+ night)', file: 'colors.xml', make: () => genAndroidColorsXml(cfg) + '\n' + genAndroidColorsXml(cfg, 'dark') },
    { id: 'android-kt', group: 'Android', label: 'DesignTokens.kt (Compose)', file: 'DesignTokens.kt', make: () => genAndroidKotlin(cfg) },
  ], [cfg, table, vars, patched])
  const [active, setActive] = useState(items[0]!.id)
  const [copied, setCopied] = useState(false)
  const item = items.find((i) => i.id === active) ?? items[0]!
  const text = useMemo(() => item.make(), [item])
  const groups = [...new Set(items.map((i) => i.group))]

  const download = (name: string, blob: Blob) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const downloadAll = () => {
    const files = items.filter((i) => i.id !== 'files').map((i) => ({ name: i.file, data: i.make() }))
    for (const f of genAssetCatalog(cfg)) files.push({ name: f.path, data: f.content })
    for (const f of patched ?? []) files.push({ name: `patched/${f.path}`, data: f.text })
    download(`${projectName.replace(/[^\w.-]+/g, '-')}-uisandbox.zip`, zipSync(files.map((f) => ({ name: f.name, text: f.data }))))
  }

  return (
    <div className="dialog__backdrop" onClick={onClose}>
      <div className="card dialog" role="dialog" aria-label="Export" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__head">
          <h2>Export: exactly what is in the sandbox</h2>
          <span className="stage__spacer" style={{ flex: 1 }} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={downloadAll}><Download size={13} strokeWidth={2} /> Everything (.zip)</button>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="dialog__body">
          <nav className="dialog__nav">
            {groups.map((g) => (
              <div key={g}>
                <div className="menu__label">{g}</div>
                {items.filter((i) => i.group === g).map((i) => (
                  <button key={i.id} type="button" className={`menu__item ${i.id === active ? 'menu__item--on' : ''}`} onClick={() => { setActive(i.id); setCopied(false) }}>{i.label}</button>
                ))}
              </div>
            ))}
          </nav>
          <div className="dialog__pane">
            <pre>{text}</pre>
            <div className="dialog__tools">
              <span>{item.file} · {text.length.toLocaleString()} chars</span>
              <span className="stage__spacer" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
                {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => download(item.file, new Blob([text], { type: 'text/plain' }))}><Download size={13} strokeWidth={2} /> Download</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
