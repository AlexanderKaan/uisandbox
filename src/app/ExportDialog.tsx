import { useMemo, useState } from 'react'
import { Bot, Braces, Check, ChevronLeft, Copy, Diff, Download, FileCode2, FileJson2, FileText, Replace, Smartphone, SwatchBook, Wind, Boxes, Apple, FolderTree, X } from 'lucide-react'
import type { Config } from '../tokens/types'
import type { SubstitutionTable } from '../sandbox/table'
import type { Anchors, PaintRoles } from '../sandbox/coverage'
import { genSheetCss, genSheetJson, genPatch, genPatchedFiles } from '../export/genSheet'
import type { ServedFile } from '../sandbox/project'
import { useEffect } from 'react'
import { genCss } from '../export/genCss'
import { genJson } from '../export/genJson'
import { genTailwind } from '../export/genTailwind'
import { genShadcn } from '../export/genShadcn'
import { genSwift, genAssetCatalog } from '../export/genSwift'
import { genAndroidColorsXml, genAndroidKotlin } from '../export/genAndroid'
import { genDesignMd } from '../export/genDesignMd'
import { genAgentsBlock } from '../export/genAgents'
import { genDtcg } from '../export/genDtcg'
import { genReadme } from '../export/genReadme'
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
  /** Where the readings came from; DESIGN.md carries them as provenance. */
  notes?: string[]
  /** Where the coverage walk saw each sheet entry, plus the page's own ink and
   *  ground. What the exports that DESCRIBE the design read their roles from —
   *  a stylesheet census alone calls Bootstrap's body ink a background. */
  painted?: Map<number, PaintRoles>
  anchors?: Anchors
  onClose: () => void
}


/** Tiny monochrome marks for the "plays well with" strip — currentColor, one
 *  visual weight, no brand colours shouting inside our quiet dialog. */
const M = {
  css: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4 3h16l-1.5 16.5L12 21l-6.5-1.5L4 3zm13 4H7.2l.2 2.2h9.4l-.6 6.8-4.2 1.2-4.2-1.2-.3-3h2.1l.15 1.5 2.25.6 2.25-.6.25-2.5H7l-.6-6.9h11l-.4 1.9z"/></svg>,
  tailwind: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.31.74 1.91 1.35.99 1 2.13 2.15 4.59 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.31-.74-1.91-1.35C15.6 7.15 14.46 6 12 6zM7 12c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.31.74 1.91 1.35 1 1 2.13 2.15 4.59 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.31-.74-1.91-1.35C10.6 13.15 9.46 12 7 12z"/></svg>,
  shadcn: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M20 4 4 20M15 4 4 15"/></svg>,
  claude: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/></svg>,
  figma: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8.5 2h3.5v5H8.5a2.5 2.5 0 0 1 0-5zm3.5 0h3.5a2.5 2.5 0 0 1 0 5H12V2zm3.5 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM8.5 8.5H12v5H8.5a2.5 2.5 0 0 1 0-5zm0 6.5H12v2.5a2.5 2.5 0 1 1-3.5-2.28V15z"/></svg>,
  cursor: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="M12 2.5 21 7.6v8.8L12 21.5 3 16.4V7.6l9-5.1zM3 7.6l9 5.1 9-5.1M12 12.7v8.8"/></svg>,
  html: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m8 6-6 6 6 6M16 6l6 6-6 6"/></svg>,
  json: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3.5A2.5 2.5 0 0 0 5.5 6v3A2.5 2.5 0 0 1 3 11.5 2.5 2.5 0 0 1 5.5 14v4A2.5 2.5 0 0 0 8 20.5M16 3.5A2.5 2.5 0 0 1 18.5 6v3a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5"/></svg>,
}

interface Item {
  id: string
  label: string
  sub?: string
  icon?: React.ReactNode
  file: string
  /** Two or three plain sentences: what this is and what to do with it. The
   *  dialog shows them above the code — a pane with a Copy button and no
   *  instructions only works for somebody who already knew. */
  how: string[]
  make: () => string
}

/**
 * Export answers one question — how do you want to apply this? — and the
 * destinations are the honest answers to it, in the order they serve people:
 *
 *   AGENT     DESIGN.md + the AGENTS.md line + W3C tokens. Their agent already
 *             reads these formats; nobody has to understand ours.
 *   SOURCE    their own files, patched. The complete, provable change.
 *   SHEET     every value we found, as a reference. NOT a drop-in stylesheet,
 *             and the copy says so — their CSS does not read our var names.
 *   SYSTEM    tokens seeded from these values. A different thing: a new system,
 *             not their app's own names, and labelled that way.
 *   NATIVE    Swift + Android.
 */
export function ExportDialog({ cfg, base, table, vars, projectName, files, fontCss, notes, painted, anchors, onClose }: ExportDialogProps) {
  const [patched, setPatched] = useState<Array<{ path: string; text: string }> | null>(null)
  useEffect(() => { let on = true; void genPatchedFiles(files, table, vars, fontCss).then((p) => { if (on) setPatched(p) }); return () => { on = false } }, [files, table, vars, fontCss])
  const movedCount = useMemo(() => { const id = table.identityVars(); return Object.keys(vars).filter((k) => vars[k] !== id[k]).length }, [table, vars])

  const items = useMemo<Item[]>(() => [
    {
      id: 'design-md', label: 'DESIGN.md', sub: 'your design system, as agents read it', icon: <FileText size={15} strokeWidth={1.75} />, file: 'DESIGN.md',
      how: [
        'Save this as DESIGN.md in the root of your repo.',
        'Add the AGENTS.md block (next tab) so your agent picks it up on every task.',
        'Then ask: apply DESIGN.md to the UI.',
      ],
      make: () => genDesignMd(table, vars, cfg, projectName, { notes, painted, anchors }),
    },
    {
      id: 'agents-md', label: 'AGENTS.md', sub: 'the one line that points at it', icon: <Bot size={15} strokeWidth={1.75} />, file: 'AGENTS.snippet.md',
      how: [
        'Append this to AGENTS.md in your repo root. No AGENTS.md yet? Make one with this in it.',
        'Claude Code reads CLAUDE.md instead. The same block works there, and in GEMINI.md or .cursorrules.',
        'It is a block to add, not a file to overwrite: your build and test instructions stay where they are.',
      ],
      make: () => genAgentsBlock(projectName, { moved: movedCount }),
    },
    {
      id: 'dtcg', label: 'Design tokens', sub: 'W3C format, for Figma and Style Dictionary', icon: <SwatchBook size={15} strokeWidth={1.75} />, file: 'design.tokens.json',
      how: [
        'Save as design.tokens.json. This is the W3C Design Tokens format (2025.10), not a format of ours.',
        'Import it in Tokens Studio for Figma, or point Style Dictionary at it to build for any platform.',
        'It describes the app we measured. Values we could not express in the format were left out rather than bent to fit.',
      ],
      make: () => genDtcg(table, vars, cfg, projectName, { painted, anchors }),
    },
    {
      id: 'files',
      label: patched === null ? 'Preparing…' : patched.length ? `${patched.length} file${patched.length === 1 ? '' : 's'} changed` : 'Nothing changed yet',
      sub: 'your CSS and HTML, new values in place', icon: <FileCode2 size={15} strokeWidth={1.75} />, file: 'patched-files.txt',
      how: [
        'Your own files, whole, with the new values written in place.',
        'Use Everything (.zip) at the top right to get them as real files in their original folders, ready to diff.',
        'This is the complete change: a find and replace cannot tell a 12px radius from 12px of padding, and this can.',
      ],
      make: () => (patched ?? []).map((f) => `/* ===== ${f.path} ===== */\n${f.text}`).join('\n\n') || '/* Turn a knob first, then your CSS and HTML appear here with the new values written in. */',
    },
    {
      id: 'sheet-patch', label: 'Find and replace', sub: 'one line per value, per file', icon: <Replace size={15} strokeWidth={1.75} />, file: 'sandbox-patch.txt',
      how: [
        'One line per value: what it was, what it is now, and the file it sits in.',
        'Hand it to an agent ("apply this patch list to my source"), or run the replacements yourself.',
        'Shorter to read than the patched files, but blind to context: check radius against padding before replacing.',
      ],
      make: () => genPatch(table, vars),
    },
    {
      id: 'sheet-changed', label: 'Changed only', sub: 'just what you turned', icon: <Diff size={15} strokeWidth={1.75} />, file: 'sandbox-changes.css',
      how: [
        'The values you turned, under names of our own making.',
        'A reference to read, diff or hand over as a spec. It is not a drop-in stylesheet: your CSS never mentions these names, so pasting it on its own changes nothing.',
        'To make the change land, use Patch your own files.',
      ],
      make: () => genSheetCss(table, vars, { changedOnly: true }),
    },
    {
      id: 'sheet-css', label: 'Every value', sub: 'the whole sheet, as a list', icon: <Braces size={15} strokeWidth={1.75} />, file: 'sandbox-values.css',
      how: [
        'Every design value we found in the build, with how often it is used and where.',
        'The census behind everything else in this dialog. Useful to read, not to paste.',
      ],
      make: () => genSheetCss(table, vars),
    },
    {
      id: 'sheet-json', label: 'JSON', sub: 'the same, machine-readable', icon: <FileJson2 size={15} strokeWidth={1.75} />, file: 'sandbox-values.json',
      how: [
        'Every value with its kind, its old value, its new one, and the places it is used.',
        'For scripts and codemods: this is the sheet in the shape a program wants.',
      ],
      make: () => genSheetJson(table, vars),
    },
    {
      id: 'tokens-tw', label: 'Tailwind', sub: 'theme block for your config', icon: <Wind size={15} strokeWidth={1.75} />, file: 'tailwind.tokens.js',
      how: ['Paste into the theme block of your tailwind.config.', 'Names are ours, not your app\'s. This starts a system rather than patching one.'],
      make: () => genTailwind(cfg),
    },
    {
      id: 'tokens-shadcn', label: 'shadcn', sub: '--background, --primary, …', icon: <Boxes size={15} strokeWidth={1.75} />, file: 'shadcn.css',
      how: ['Replace the :root and .dark blocks in your globals.css with these.', 'The variable names are the ones shadcn/ui components already read.'],
      make: () => genShadcn(cfg),
    },
    {
      id: 'tokens-css', label: 'tokens.css', sub: 'a full --k-* system', icon: <SwatchBook size={15} strokeWidth={1.75} />, file: 'tokens.css',
      how: [
        'A complete token system seeded from your values: colour ramps, a type scale, spacing, z-index, breakpoints.',
        'Link it before your own stylesheet and build against the variables.',
        'These are new names, not the ones your app uses. To change the app you already have, use Patch your own files instead.',
      ],
      make: () => genCss(cfg),
    },
    {
      id: 'tokens-json', label: 'tokens.json', sub: 'the same system, as JSON', icon: <FileJson2 size={15} strokeWidth={1.75} />, file: 'tokens.json',
      how: ['The same generated system in JSON, with the decisions that produced it.', 'For the W3C interchange format, use Design tokens under Hand it to your agent.'],
      make: () => genJson(cfg),
    },
    {
      id: 'ios-swift', label: 'Swift', sub: 'constants for SwiftUI and UIKit', icon: <Apple size={15} strokeWidth={1.75} />, file: 'DesignTokens.swift',
      how: ['Drop into your Xcode target and reference the constants from SwiftUI or UIKit.'],
      make: () => genSwift(cfg),
    },
    {
      id: 'ios-assets', label: 'Asset catalog', sub: 'colour sets, light and dark', icon: <FolderTree size={15} strokeWidth={1.75} />, file: 'DesignTokens.xcassets.txt',
      how: ['Colour sets with light and dark variants.', 'Everything (.zip) writes these out as a real .xcassets folder you can drag into Xcode.'],
      make: () => genAssetCatalog(cfg).map((f) => `// ${f.path}\n${f.content}`).join('\n'),
    },
    {
      id: 'android-xml', label: 'colors.xml', sub: 'resources, light and night', icon: <Smartphone size={15} strokeWidth={1.75} />, file: 'colors.xml',
      how: ['The first block goes in res/values/colors.xml, the second in res/values-night/colors.xml.'],
      make: () => genAndroidColorsXml(cfg) + '\n' + genAndroidColorsXml(cfg, 'dark'),
    },
    {
      id: 'android-kt', label: 'Compose', sub: 'Kotlin constants', icon: <Smartphone size={15} strokeWidth={1.75} />, file: 'DesignTokens.kt',
      how: ['Drop into your theme package and reference from your Compose theme.'],
      make: () => genAndroidKotlin(cfg),
    },
  ], [cfg, table, vars, patched, projectName, notes, painted, anchors, movedCount])

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

  // Six destinations; the formats are tabs INSIDE one, never a wall of files.
  // Each destination names what it LANDS IN, at its own foot. The marks are the
  // fastest way to answer "is this the box for me" — a strip under the whole
  // panel could only say "we work with things".
  const DESTS = [
    { title: 'Hand it to your agent', sub: 'DESIGN.md and one line in AGENTS.md, so Claude Code, Cursor or Codex builds in this look', icon: <Bot size={15} strokeWidth={1.75} />, ids: ['design-md', 'agents-md', 'dtcg'], reco: true,
      uses: [[M.claude, 'Claude Code'], [M.cursor, 'Cursor'], [null, 'Codex'], [M.figma, 'Figma']] },
    { title: 'Patch your own files', sub: 'your CSS and HTML with the new values written in, or a find and replace list', icon: <FileCode2 size={15} strokeWidth={1.75} />, ids: ['files', 'sheet-patch'],
      uses: [[M.css, 'CSS'], [M.html, 'HTML'], [null, 'any repo']] },
    { title: 'The raw sheet', sub: 'every value we found and what it is now. A reference to read, not a stylesheet to paste', icon: <Braces size={15} strokeWidth={1.75} />, ids: ['sheet-changed', 'sheet-css', 'sheet-json'],
      uses: [[M.css, 'CSS'], [M.json, 'JSON']] },
    { title: 'Tailwind or shadcn', sub: 'a theme block for your config, or the block shadcn/ui components already read', icon: <Wind size={15} strokeWidth={1.75} />, ids: ['tokens-tw', 'tokens-shadcn'],
      uses: [[M.tailwind, 'Tailwind'], [M.shadcn, 'shadcn/ui'], [null, 'Lovable']] },
    { title: 'A fresh token system', sub: 'a full set seeded from these values, under new names. For starting a system, not patching one', icon: <SwatchBook size={15} strokeWidth={1.75} />, ids: ['tokens-css', 'tokens-json'],
      uses: [[M.css, 'CSS'], [M.json, 'JSON'], [null, 'Style Dictionary']] },
    { title: 'Native apps', sub: 'Swift constants, an asset catalog, Android resources', icon: <Smartphone size={15} strokeWidth={1.75} />, ids: ['ios-swift', 'ios-assets', 'android-xml', 'android-kt'],
      uses: [[<Apple size={12} strokeWidth={1.9} />, 'SwiftUI'], [<Smartphone size={11} strokeWidth={1.9} />, 'Android']] },
  ]
  const [active, setActive] = useState('overview')
  const [copied, setCopied] = useState(false)
  const item = items.find((i) => i.id === active)
  const dest = item ? DESTS.find((d) => d.ids.includes(item.id)) : undefined
  const text = useMemo(() => item ? item.make() : '', [item])

  const download = (name: string, blob: Blob) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const downloadAll = () => {
    const out = items.filter((i) => i.id !== 'files').map((i) => ({ name: i.file, data: i.make() }))
    for (const f of genAssetCatalog(cfg)) out.push({ name: f.path, data: f.content })
    for (const f of patched ?? []) out.push({ name: `patched/${f.path}`, data: f.text })
    // A map of the folder, first in the list: thirteen files and no README is
    // a puzzle handed to somebody who came here to save time.
    out.unshift({
      name: 'README.md',
      data: genReadme(projectName, items.filter((i) => i.id !== 'files').map((i) => ({ name: i.file, what: i.sub ?? i.label })), {
        moved: movedCount, total: table.entries.length, changedFiles: patched?.length ?? 0,
      }),
    })
    download(`${projectName.replace(/[^\w.-]+/g, '-')}-uisandbox.zip`, zipSync(out.map((f) => ({ name: f.name, text: f.data }))))
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
              <span className="exp__ico exp__ico--lg">{dest?.icon}</span>
              <div><b>{dest?.title}</b><span className="exp__headsub">{dest?.sub}</span></div>
              <span className="stage__spacer" style={{ flex: 1 }} />
              <div className="exp__tabs" role="tablist">
                {(dest?.ids ?? []).map((id) => { const it = items.find((x) => x.id === id)!; return (
                  <button key={id} type="button" role="tab" aria-selected={id === active} className={`exp__tab ${id === active ? 'exp__tab--on' : ''}`} onClick={() => { setActive(id); setCopied(false) }}>{it.label}</button>
                ) })}
              </div>
            </div>
            <ol className="exp__how">
              {item.how.map((h, i) => <li key={i}>{h}</li>)}
            </ol>
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
              <div className="menu__label">How do you want to apply it?</div>
              <div className="exp__destgrid">
                {DESTS.map((d) => (
                  <button key={d.title} type="button" className="exp__card" onClick={() => { setActive(d.ids[0]!); setCopied(false) }}>
                    <span className="exp__ico">{d.icon}</span>
                    <span className="exp__text">
                      <span className="exp__label">{d.title}{d.reco && <em className="exp__reco">start here</em>}</span>
                      <span className="exp__sub2">{d.sub}</span>
                      <span className="exp__uses">
                        {d.uses.map(([mark, name]) => <span key={name as string} className="exp__use">{mark}{name}</span>)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
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
