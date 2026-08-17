import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Info, PanelLeftOpen, Redo2, Undo2, X } from 'lucide-react'
import { SandboxPanel } from '../panel/SandboxPanel'
import type { Config } from '../tokens/types'
import { useConfig } from '../state/useConfig'
import { shuffle } from '../sandbox/shuffle'
import { openZip, type Archive } from '../audit/intake/readZip'
import { buildProject, discoverRoutes, type SandboxProject, type Screen } from '../sandbox/project'
import { refusalFor } from '../sandbox/platform'
import { deriveBaseline, refineFromDocument, refineFromTable, type BaselineReport } from '../sandbox/baseline'
import { buildTokens } from '../tokens/buildTokens'
import { computeVars, familiesOf } from '../sandbox/mapping'
import { disown, ensureWorker, own, onSheetGrow } from '../sandbox/host'
import { varsStyleTag } from '../sandbox/project'
import { observeFrame } from '../sandbox/live'
import { measureCoverage, type Coverage } from '../sandbox/coverage'
import { applyScheme } from '../sandbox/scheme'
import { googleFontsImport, isCustomFont, customFontFamily, SYSTEM_FONT } from '../tokens/fonts'
import { customFontUrl } from '../tokens/customFonts'
import { Intake } from './Intake'
import { Stage } from './Stage'
import { ExportDialog } from './ExportDialog'
import { genPatch, genPatchedFiles } from '../export/genSheet'

interface Loaded {
  project: SandboxProject
  report: BaselineReport
  screen: Screen
  /** Kept so a different root can be chosen without dropping the file again. */
  archive: Archive
  /** The rendered page has had its one chance to decide the brand. */
  brandSeen?: boolean
}

export function App() {
  const { cfg, tokens, dispatch, undo, redo, canUndo, canRedo } = useConfig()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const loadedRef = useRef(loaded)
  loadedRef.current = loaded
  // Bumped when the live observer adds entries to the sheet (runtime styles).
  const [sheetVersion, setSheetVersion] = useState(0)
  const stopObserver = useRef<(() => void) | null>(null)

  // The live sheet — pure function of (table, baseline, cfg). One source: the
  // iframe writer below, the HTML injector in host.ts and the export all read it.
  const vars = useMemo(
    () => (loaded ? computeVars(loaded.project.table, loaded.report.baseline, cfg, tokens) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, cfg, tokens, sheetVersion],
  )
  const varsRef = useRef(vars)
  varsRef.current = vars
  const fontCss = useMemo(() => {
    if (!loaded) return ''
    const base = loaded.report.baseline.cfg
    const chosen = [cfg.fontDisplay, cfg.fontBody].filter((f, i) => f !== (i === 0 ? base.fontDisplay : base.fontBody) && f !== SYSTEM_FONT)
    if (!chosen.length) return ''
    const google = chosen.filter((f) => !isCustomFont(f))
    const custom = chosen.filter(isCustomFont)
    const parts: string[] = []
    if (google.length) parts.push(googleFontsImport(google[0]!, google[1] ?? google[0]!))
    for (const f of custom) {
      const url = customFontUrl(f)
      if (url) parts.push(`@font-face{font-family:'${customFontFamily(f)}';src:url(${url});font-weight:100 900;font-display:swap}`)
    }
    // Display font: most apps set ONE family and let headings inherit it, so
    // there is no heading literal for the sheet to move. The knob therefore
    // speaks by SELECTOR — the one semantic override that is honest, because
    // "which face do headings use" is a real question in every app.
    if (cfg.fontDisplay !== base.fontDisplay) {
      const stack = String(buildTokens(cfg).vars['--k-font-display'])
      parts.push(`h1,h2,h3,h4,h5,h6,[class*="title"],[class*="heading"],[class*="hero"],[class*="display"]{font-family:${stack} !important}`)
    }
    return parts.join('\n')
  }, [cfg.fontDisplay, cfg.fontBody, loaded])
  const fontCssRef = useRef(fontCss)
  fontCssRef.current = fontCss
  // Debug/agent hook: the live state, readable from the console.
  useEffect(() => {
    ;(window as unknown as { __us?: unknown }).__us = loaded
      ? { project: loaded.project, baseline: loaded.report.baseline, cfg, vars, identity: loaded.project.table.identityVars(), dispatch, patch: () => genPatch(loaded.project.table, vars), patched: () => genPatchedFiles(loaded.project.raw, loaded.project.table, vars, fontCss) }
      : null
  }, [loaded, cfg, vars, dispatch, fontCss])
  const changedCount = useMemo(() => {
    if (!loaded) return 0
    const id = loaded.project.table.identityVars()
    return Object.keys(vars).filter((k) => vars[k] !== id[k]).length
  }, [vars, loaded])

  // Write the sheet into the frame's document on every change (same origin,
  // served by our worker) — the whole point: no reload, no flash, live.
  const applyVars = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    let el = doc.getElementById('us-vars')
    if (!el) {
      el = doc.createElement('style')
      el.id = 'us-vars'
      ;(doc.head ?? doc.documentElement).prepend(el)
    }
    const css = varsStyleTag(varsRef.current)
    const inner = css.slice(css.indexOf('>') + 1, css.lastIndexOf('<'))
    if (el.textContent !== inner) el.textContent = inner
    // A font the knob chose has to LOAD in their document: Google Fonts by
    // @import, an uploaded font by its blob URL (same origin, so it resolves).
    let fonts = doc.getElementById('us-fonts')
    if (!fonts) {
      fonts = doc.createElement('style')
      fonts.id = 'us-fonts'
      el.after(fonts)
    }
    const fcss = fontCssRef.current
    if (fonts.textContent !== fcss) fonts.textContent = fcss
    // Their dark mode, switched on their own hooks (sandbox/scheme.ts).
    const cur = loadedRef.current
    if (cur) { try { applyScheme(doc, cur.project.scheme, cfgRef.current.sb.dark ?? null) } catch { /* mid-navigation */ } }
  }, [])
  useEffect(() => { applyVars() }, [vars, fontCss, cfg.sb.dark, applyVars])

  // After each load: apply the sheet, then watch what their JS styles at runtime.
  /* Let the SCREEN and the GROWN sheet correct the baseline — but only while
     every knob still stands where the baseline put it. Runs after each load and
     after runtime rules arrived (styled-components inserts after `load` on a
     slow frame); a correction is idempotent, so running twice is harmless. */
  const refineBaseline = useCallback(() => {
    const cur = loadedRef.current
    const doc = frameRef.current?.contentDocument
    if (!cur || !doc || !doc.body) return
    const base = cur.report.baseline.cfg
    const untouched = (Object.keys(base) as (keyof Config)[]).every((k) => cfgRef.current[k] === base[k])
    if (!untouched) return
    const fromTable = refineFromTable(cur.project.table, base)
    const mid = { ...base, ...(fromTable ?? {}) }
    // The paint may decide the brand once per project, and never over a declared one.
    const brandFromPaint = !cur.report.brandDeclared && !cur.brandSeen
    cur.brandSeen = true
    const fromDoc = refineFromDocument(doc, mid, { brand: brandFromPaint })
    if (!fromTable && !fromDoc) return
    const cfg2 = { ...mid, ...(fromDoc ?? {}) }
    cur.report.baseline = { cfg: cfg2, tokens: buildTokens(cfg2), families: familiesOf(cur.project.table, cfg2.cPrimary) }
    if (fromTable) cur.report.notes.push(`Corrected from rules your JS inserted at runtime: ${Object.entries(fromTable).map(([k, v]) => `${k} ${v}`).join(', ')}.`)
    if (fromDoc) cur.report.notes.push(`Corrected from the rendered page: ${Object.entries(fromDoc).map(([k, v]) => `${k} ${v}`).join(', ')}.`)
    dispatch({ type: 'REPLACE', cfg: cfg2 })
    setLoaded({ ...cur })
  }, [dispatch])
  // Screens an SPA only reveals once rendered: its links. Merged into the picker.
  const discoverScreens = useCallback(() => {
    const cur = loadedRef.current
    const doc = frameRef.current?.contentDocument
    if (!cur || !doc?.body) return
    const found = discoverRoutes(doc, cur.project.screens)
    if (!found.length) return
    cur.project.screens = [...cur.project.screens, ...found]
    setLoaded({ ...cur })
  }, [])
  const pinCurrent = useCallback(() => {
    const cur = loadedRef.current
    const win = frameRef.current?.contentWindow
    if (!cur || !win) return
    const path = win.location.pathname.replace(/^\/__sb\/[^/]+\//, '/').replace(/\/+$/, '') || '/'
    if (cur.project.screens.some((s) => s.label === path)) return
    cur.project.screens = [...cur.project.screens, { path: path.replace(/^\//, ''), label: path, source: 'pinned' }]
    setLoaded({ ...cur })
  }, [])
  const [thin, setThin] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const coverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remeasure = useCallback(() => {
    if (coverTimer.current) clearTimeout(coverTimer.current)
    coverTimer.current = setTimeout(() => {
      const cur = loadedRef.current
      const doc = frameRef.current?.contentDocument
      if (!cur || !doc?.body) return
      try { setCoverage(measureCoverage(doc, cur.project.table, varsRef.current)) } catch { /* mid-navigation */ }
    }, 900)
  }, [])
  const onFrameLoaded = useCallback(() => {
    applyVars()
    stopObserver.current?.()
    const doc = frameRef.current?.contentDocument
    // A shell with nothing in it is not "your app": say so rather than let a
    // half-empty page pass for the real thing.
    if (doc?.body) {
      setTimeout(() => {
        const els = doc.body.querySelectorAll('*').length
        const rules = Array.from(doc.styleSheets).reduce((n, sh) => { try { return n + sh.cssRules.length } catch { return n } }, 0)
        const text = (doc.body.innerText ?? '').trim().length
        const media = doc.body.querySelectorAll('img, svg, canvas, video, picture').length
        // A canvas/WebGL page is three elements and no text — and not a shell.
        // No text is suspicious only on a small DOM: 172 animated <div>s (anime.js) are an app.
        const shell = media === 0 && (els < 6 || rules < 3 || (text < 20 && els < 40))
        setThin(shell ? `This screen rendered ${els} element${els === 1 ? '' : 's'}, ${rules} style rules and ${text} characters of visible text — it looks like a shell, not the app (a page the server fills in, a build that needs its API, or a folder without its CSS). What you see here is not what your users see.` : null)
      }, 1200)
    }
    if (doc && loaded) stopObserver.current = observeFrame(doc, loaded.project.table, () => { setSheetVersion((v) => v + 1); refineBaseline(); remeasure() })
    refineBaseline()
    discoverScreens()
    remeasure()
    // A router renders after load; look once more.
    setTimeout(discoverScreens, 800)
  }, [applyVars, loaded, refineBaseline, discoverScreens, remeasure])
  useEffect(() => () => { stopObserver.current?.() }, [])
  // Runtime rules (insertRule) that grew the sheet — coalesced, then re-map.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    return onSheetGrow(() => { if (t) clearTimeout(t); t = setTimeout(() => { setSheetVersion((v) => v + 1); refineBaseline() }, 80) })
  }, [refineBaseline])

  const onArchive = async (archive: Archive, root?: string) => {
    setError(null)
    try {
      setBusy('Registering the sandbox worker…')
      await ensureWorker()
      setBusy('Reading files…')
      const project = await buildProject(archive, {
        root,
        onProgress: (d, t) => { if (d % 25 === 0 || d === t) setBusy(`Reading files… ${d}/${t}`) },
      })
      // The door opens for what renders 1:1, and for nothing else.
      if (!project.platform.renders || !project.screens.length) throw new Error(refusalFor(project.platform, { files: archive.entries.length }))
      setBusy('Deriving the knobs from your code…')
      const report = await deriveBaseline(archive, project.table)
      if (loaded) disown(loaded.project)
      own(project, () => varsRef.current)
      dispatch({ type: 'REPLACE', cfg: report.baseline.cfg })
      setLoaded({ project, report, screen: project.screens[0]!, archive })
      setShowNotes(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // `?load=<url-to-zip>` opens an archive fetched from a URL (same-origin or
  // CORS-enabled) — for demos, tests and agents; the drop zone stays the door.
  const loadedFromUrl = useRef(false)
  useEffect(() => {
    if (loadedFromUrl.current) return
    const url = new URLSearchParams(location.search).get('load')
    if (!url) return
    loadedFromUrl.current = true
    ;(async () => {
      try {
        setBusy(`Fetching ${url}…`)
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
        const blob = await res.blob()
        const name = url.split('/').pop() || 'archive.zip'
        await onArchive(await openZip(new File([blob], name, { type: 'application/zip' })))
      } catch (err) { setError((err as Error).message); setBusy(null) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard: ⌘Z / ⇧⌘Z for the knobs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])


  return (
    <div className="app">
      <header className="app__topbar">
        <span className="app__brand"><span className="app__brand-mark" />UISandbox <small>your app, 1:1, then the knobs</small></span>
        <span className="app__spacer" />
        {loaded && (
          <>
            <button type="button" className="btn btn--ghost btn--icon" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)"><Undo2 size={15} /></button>
            <button type="button" className="btn btn--ghost btn--icon" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)"><Redo2 size={15} /></button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowNotes((v) => !v)} title="What we read from your code"><Info size={14} /> Read</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowExport(true)}><Download size={14} /> Export</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { disown(loaded.project); setLoaded(null) }} title="Close this project"><X size={14} /> Close</button>
          </>
        )}
      </header>
      <div className="app__body">
        {loaded && (
          <>
            {!panelOpen && (
              <button type="button" className="btn btn--ghost btn--icon" style={{ position: 'absolute', left: 8, top: 56, zIndex: 41 }} onClick={() => setPanelOpen(true)} title="Show the knobs"><PanelLeftOpen size={16} /></button>
            )}
            {panelOpen && (
              <SandboxPanel
                cfg={cfg}
                tokens={tokens}
                base={loaded.report.baseline.cfg}
                families={loaded.report.baseline.families}
                scheme={loaded.project.scheme}
                dispatch={dispatch}
                onCollapse={() => setPanelOpen(false)}
                onRandomize={() => dispatch({ type: 'REPLACE', cfg: shuffle(cfg, loaded.report.baseline) })}
                onReset={() => dispatch({ type: 'REPLACE', cfg: loaded.report.baseline.cfg })}
              />
            )}
            <Stage
              project={loaded.project}
              screen={loaded.screen}
              onScreen={(screen) => setLoaded({ ...loaded, screen })}
              frameRef={frameRef}
              onLoaded={onFrameLoaded}
              onPin={pinCurrent}
              changedCount={changedCount}
              warning={thin}
              coverage={coverage}
            />
            {showNotes && (
              <div className="card popcard" role="dialog" aria-label="What was read">
                <h3>What we read from your code</h3>
                <ul className="notes">
                  {loaded.report.notes.map((n, i) => <li key={i}>{n}</li>)}
                  <li>{loaded.project.table.entries.length} distinct values in {Math.round(loaded.project.cssBytes / 1024)} KB of CSS: {(['color', 'radius', 'font-size', 'font-family', 'space', 'shadow'] as const).map((k) => `${loaded.project.table.ofKind(k).length} ${k}`).join(' · ')}.</li>
                  {loaded.project.candidates.length > 1 && (
                    <li>Other roots in the archive:{' '}
                      {loaded.project.candidates.filter((c) => c !== loaded.project.root).slice(0, 6).map((c) => (
                        <button key={c} type="button" className="btn btn--secondary btn--sm" style={{ marginRight: 6, marginTop: 4 }} onClick={() => { const a = loaded.archive; disown(loaded.project); setLoaded(null); void onArchive(a, c) }}>{c || '/'}</button>
                      ))}
                    </li>
                  )}
                </ul>
                <div style={{ marginTop: 10 }}><button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowNotes(false)}>Close</button></div>
              </div>
            )}
          </>
        )}
        {!loaded && <Intake onArchive={onArchive} busy={busy} error={error} />}
      </div>
      {showExport && loaded && (
        <ExportDialog cfg={cfg} table={loaded.project.table} vars={vars} projectName={loaded.project.name} files={loaded.project.raw} fontCss={fontCss} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}
