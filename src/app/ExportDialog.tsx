import { useMemo, useState } from 'react'
import { Braces, Check, ChevronLeft, Copy, Diff, Download, FileCode2, FileJson2, Replace, Smartphone, SwatchBook, Wind, Boxes, Apple, FolderTree, X } from 'lucide-react'
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
  /** The stand of their code — the overview names what was turned, from → to. */
  base: Config
  cfg: Config
  table: SubstitutionTable
  vars: Record<string, string>
  projectName: string
  /** Their original files — the patched export writes the values into these. */
  files: Map<string, ServedFile>
  fontCss: string
  onClose: () => void
}


/** Tiny monochrome marks for the "plays well with" strip — currentColor, one
 *  visual weight, no brand colours shouting inside our quiet dialog. */
const M = {
  css: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4 3h16l-1.5 16.5L12 21l-6.5-1.5L4 3zm13 4H7.2l.2 2.2h9.4l-.6 6.8-4.2 1.2-4.2-1.2-.3-3h2.1l.15 1.5 2.25.6 2.25-.6.25-2.5H7l-.6-6.9h11l-.4 1.9z"/></svg>,
  tailwind: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.31.74 1.91 1.35.99 1 2.13 2.15 4.59 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.31-.74-1.91-1.35C15.6 7.15 14.46 6 12 6zM7 12c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.31.74 1.91 1.35 1 1 2.13 2.15 4.59 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.31-.74-1.91-1.35C10.6 13.15 9.46 12 7 12z"/></svg>,
  shadcn: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M20 4 4 20M15 4 4 15"/></svg>,
  claude: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/></svg>,
}

interface Item { id: string; group: string; label: string; sub?: string; icon?: React.ReactNode; file: string; make: () => string }

/**
 * Two things come out, and the dialog says which is which:
 *   YOUR VALUES  — the sheet: exactly what is in the sandbox right now, as
 *                  CSS variables, JSON, or a patch list per file
 *   THE TOKENS   — the --k-* system the knobs describe (CSS/JSON/Tailwind/
 *                  shadcn) and, for iOS, Swift constants + an asset catalog
 */
export function ExportDialog({ cfg, base, table, vars, projectName, files, fontCss, onClose }: ExportDialogProps) {
  const [patched, setPatched] = useState<Array<{ path: string; text: string }> | null>(null)
  useEffect(() => { let on = true; void genPatchedFiles(files, table, vars, fontCss).then((p) => { if (on) setPatched(p) }); return () => { on = false } }, [files, table, vars, fontCss])
  const items = useMemo<Item[]>(() => [
    { id: 'files', group: 'For your source', label: patched === null ? 'Preparing…' : patched.length ? `${patched.length} file${patched.length === 1 ? '' : 's'} changed` : 'Nothing changed yet', sub: 'your CSS/HTML, new values in place', icon: <FileCode2 size={15} strokeWidth={1.75} />, file: 'patched-files.txt', make: () => (patched ?? []).map((f) => `/* ===== ${f.path} ===== */\n${f.text}`).join('\n\n') || '/* Turn a knob first — then your CSS/HTML appear here with the new values written in place. */' },
    { id: 'sheet-patch', group: 'For your source', label: 'Patch list', sub: 'find → replace, for your source', icon: <Replace size={15} strokeWidth={1.75} />, file: 'sandbox-patch.txt', make: () => genPatch(table, vars) },
    { id: 'sheet-css', group: 'For the browser', label: 'CSS variables', sub: 'the whole sheet, drop-in', icon: <Braces size={15} strokeWidth={1.75} />, file: 'sandbox-values.css', make: () => genSheetCss(table, vars) },
    { id: 'sheet-changed', group: 'For the browser', label: 'CSS, changed only', sub: 'just what you turned', icon: <Diff size={15} strokeWidth={1.75} />, file: 'sandbox-changes.css', make: () => genSheetCss(table, vars, { changedOnly: true }) },
    { id: 'sheet-json', group: 'For the browser', label: 'JSON', sub: 'every value, machine-readable', icon: <FileJson2 size={15} strokeWidth={1.75} />, file: 'sandbox-values.json', make: () => genSheetJson(table, vars) },
    { id: 'tokens-css', group: 'For your design system', label: 'tokens.css', sub: 'the --k-* system as CSS', icon: <SwatchBook size={15} strokeWidth={1.75} />, file: 'tokens.css', make: () => genCss(cfg) },
    { id: 'tokens-json', group: 'For your design system', label: 'tokens.json', sub: 'the same, as JSON', icon: <FileJson2 size={15} strokeWidth={1.75} />, file: 'tokens.json', make: () => genJson(cfg) },
    { id: 'tokens-tw', group: 'For your design system', label: 'Tailwind', sub: 'theme block for your config', icon: <Wind size={15} strokeWidth={1.75} />, file: 'tailwind.tokens.js', make: () => genTailwind(cfg) },
    { id: 'tokens-shadcn', group: 'For your design system', label: 'shadcn', sub: '--background, --primary, …', icon: <Boxes size={15} strokeWidth={1.75} />, file: 'shadcn.css', make: () => genShadcn(cfg) },
    { id: 'ios-swift', group: 'For native apps', label: 'DesignTokens.swift', sub: 'constants for SwiftUI/UIKit', icon: <Apple size={15} strokeWidth={1.75} />, file: 'DesignTokens.swift', make: () => genSwift(cfg) },
    { id: 'ios-assets', group: 'For native apps', label: 'Asset catalog', sub: 'colour sets, light + dark', icon: <FolderTree size={15} strokeWidth={1.75} />, file: 'DesignTokens.xcassets.txt', make: () => genAssetCatalog(cfg).map((f) => `// ${f.path}\n${f.content}`).join('\n') },
    { id: 'android-xml', group: 'For native apps', label: 'colors.xml (+ night)', sub: 'resources, light + night', icon: <Smartphone size={15} strokeWidth={1.75} />, file: 'colors.xml', make: () => genAndroidColorsXml(cfg) + '\n' + genAndroidColorsXml(cfg, 'dark') },
    { id: 'android-kt', group: 'For native apps', label: 'DesignTokens.kt', sub: 'Compose constants', icon: <Smartphone size={15} strokeWidth={1.75} />, file: 'DesignTokens.kt', make: () => genAndroidKotlin(cfg) },
  ], [cfg, table, vars, patched])
  // The overview: which knobs stand off their code, from → to.
  const KNOB_LABELS: Array<[keyof Config, string]> = [
    ['cPrimary', 'Brand'], ['cBackground' as keyof Config, 'Background'], ['fontDisplay', 'Display font'], ['fontBody', 'Body font'],
    ['radius', 'Radius'], ['typeScale', 'Text size'], ['neutral', 'Grey tint'], ['colorTheme', 'Colour theme'],
  ]
  const turned = useMemo(() => {
    const out: Array<{ label: string; from: string; to: string; swatch?: boolean }> = []
    const all = new Set([...Object.keys(base), ...Object.keys(cfg)]) as Set<keyof Config>
    for (const k of all) {
      const a = (base as unknown as Record<string, unknown>)[k as string], b = (cfg as unknown as Record<string, unknown>)[k as string]
      if (JSON.stringify(a) === JSON.stringify(b)) continue
      if (k === 'sb') {
        const sa = (a ?? {}) as Record<string, unknown>, sb = (b ?? {}) as Record<string, unknown>
        for (const dk of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
          if (JSON.stringify(sa[dk]) === JSON.stringify(sb[dk])) continue
          const label = dk === 'cBackground' ? 'Background' : dk.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
          const fmt = (x: unknown) => x === undefined ? 'as is' : /^-?[\d.]+$/.test(String(x)) ? `×${x}` : String(x)
          out.push({ label, from: fmt(sa[dk]), to: fmt(sb[dk]), swatch: /^#/.test(String(sb[dk])) })
        }
        continue
      }
      const named = KNOB_LABELS.find(([kk]) => kk === k)
      out.push({ label: named ? named[1] : String(k), from: String(a), to: String(b), swatch: /^#/.test(String(b)) })
    }
    return out
  }, [cfg, base])
  const movedCount = useMemo(() => { const id = table.identityVars(); return Object.keys(vars).filter((k) => vars[k] !== id[k]).length }, [table, vars])

  // Four destinations; the formats are tabs INSIDE a destination, never a wall.
  const DESTS = [
    { title: 'Into your source', sub: 'your files patched in place, or a find → replace list', icon: <FileCode2 size={15} strokeWidth={1.75} />, ids: ['files', 'sheet-patch'], reco: true },
    { title: 'Into the browser', sub: 'CSS variables to drop in, whole or changed-only', icon: <Braces size={15} strokeWidth={1.75} />, ids: ['sheet-changed', 'sheet-css', 'sheet-json'] },
    { title: 'Into your design system', sub: 'tokens for CSS, Tailwind or shadcn', icon: <SwatchBook size={15} strokeWidth={1.75} />, ids: ['tokens-css', 'tokens-json', 'tokens-tw', 'tokens-shadcn'] },
    { title: 'Into a native app', sub: 'Swift constants and Android resources', icon: <Smartphone size={15} strokeWidth={1.75} />, ids: ['ios-swift', 'ios-assets', 'android-xml', 'android-kt'] },
  ]
  const [active, setActive] = useState('overview')
  const [copied, setCopied] = useState(false)
  const item = items.find((i) => i.id === active)
  const text = useMemo(() => item ? item.make() : '', [item])

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
      <div className="card dialog dialog--narrow" role="dialog" aria-label="Export" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__head">
          {item ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setActive('overview'); setCopied(false) }}><ChevronLeft size={14} /> Export</button>
          ) : (
            <h2>Export: exactly what is in the sandbox</h2>
          )}
          <span className="stage__spacer" style={{ flex: 1 }} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={downloadAll}><Download size={13} strokeWidth={2} /> Everything (.zip)</button>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        {item ? (
          <div className="dialog__pane">
            <div className="exp__head">
              <span className="exp__ico exp__ico--lg">{DESTS.find((d) => d.ids.includes(item.id))?.icon}</span>
              <div><b>{DESTS.find((d) => d.ids.includes(item.id))?.title}</b><span className="exp__headsub">{DESTS.find((d) => d.ids.includes(item.id))?.sub}</span></div>
              <span className="stage__spacer" style={{ flex: 1 }} />
              <div className="exp__tabs" role="tablist">
                {(DESTS.find((d) => d.ids.includes(item.id))?.ids ?? []).map((id) => { const it = items.find((x) => x.id === id)!; return (
                  <button key={id} type="button" role="tab" aria-selected={id === active} className={`exp__tab ${id === active ? 'exp__tab--on' : ''}`} onClick={() => { setActive(id); setCopied(false) }}>{it.label}</button>
                ) })}
              </div>
            </div>
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
        ) : (
          <div className="exp__overview">
            <div className="exp__stats">
              <div className="exp__stat"><b>{movedCount}</b><span>of {table.entries.length} values moved</span></div>
              <div className="exp__stat"><b>{patched?.length ?? 0}</b><span>file{(patched?.length ?? 0) === 1 ? '' : 's'} changed</span></div>
              <div className="exp__stat"><b>{turned.length}</b><span>knob{turned.length === 1 ? '' : 's'} turned</span></div>
            </div>
            <div className="exp__dest">
              <div className="menu__label">Where do you want it?</div>
              <div className="exp__destgrid">
                {DESTS.map((d) => (
                  <button key={d.title} type="button" className="exp__card" onClick={() => { setActive(d.ids[0]!); setCopied(false) }}>
                    <span className="exp__ico">{d.icon}</span>
                    <span className="exp__text"><span className="exp__label">{d.title}{d.reco && movedCount > 0 && <em className="exp__reco">start here</em>}</span><span className="exp__sub2">{d.sub}</span></span>
                  </button>
                ))}
              </div>
            </div>
            <div className="exp__with" aria-label="Plays well with">
              <span className="menu__label" style={{ padding: 0 }}>Plays well with</span>
              <span className="exp__withrow">
                <span className="exp__chip">{M.css} CSS</span>
                <span className="exp__chip">{M.tailwind} Tailwind</span>
                <span className="exp__chip">{M.shadcn} shadcn/ui</span>
                <span className="exp__chip"><Apple size={14} strokeWidth={1.9} /> SwiftUI</span>
                <span className="exp__chip"><Smartphone size={13} strokeWidth={1.9} /> Android</span>
                <span className="exp__chip">{M.claude} Claude Code</span>
                <span className="exp__chip">Cursor</span>
                <span className="exp__chip">Lovable</span>
                <span className="exp__chip">Codex</span>
              </span>
            </div>
            {turned.length ? (
              <div className="exp__turned">
                <div className="menu__label">Settings, from your code → the sandbox</div>
                {turned.map((t, i) => (
                  <div key={i} className="exp__row">
                    <span className="exp__rowlabel">{t.label}</span>
                    <span className="exp__from">{/^#/.test(t.from) && <span className="fmrow__dot" style={{ background: t.from, width: 10, height: 10 }} />}{t.from}</span>
                    <span className="exp__arrow">→</span>
                    <span className="exp__to">{t.swatch && <span className="fmrow__dot" style={{ background: t.to, width: 10, height: 10 }} />}{t.to}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="exp__none">Nothing turned yet: every export is your code's own stand (the identity). Turn a knob and this list says exactly what changed.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}