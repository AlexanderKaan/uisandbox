import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Info, PanelLeftOpen, Redo2, Undo2, X } from 'lucide-react'
import { SandboxPanel } from '../panel/SandboxPanel'
import type { Config } from '../tokens/types'
import { useConfig } from '../state/useConfig'
import { shuffle } from '../sandbox/shuffle'
import { openZip, type Archive } from '../audit/intake/readZip'
import { buildProject, discoverRoutes, type SandboxProject, type Screen } from '../sandbox/project'
import { refusalFor } from '../sandbox/platform'
import { Mark, GithubMark } from './Mark'
import { McpButton } from './McpButton'
import { Footer } from './Footer'
import type { Progress } from './progress'
import { track, needsConsent, setConsent } from '../analytics'
import { DEFAULT_CONFIG } from '../tokens/defaults'
import { varName } from '../sandbox/table'
import { codeFonts, deriveBaseline, refineFromDocument, refineFromTable, type BaselineReport } from '../sandbox/baseline'
import { buildTokens } from '../tokens/buildTokens'
import { computeVars, familiesOf } from '../sandbox/mapping'
import { disown, ensureWorker, own, onSheetGrow, onMissing, missingFor } from '../sandbox/host'
import { varsStyleTag } from '../sandbox/project'
import { observeFrame } from '../sandbox/live'
import { measureCoverage, type Coverage } from '../sandbox/coverage'
import { nestedDocs } from '../sandbox/verify'
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
  const { cfg, tokens, dispatch, undo, redo, reset, canUndo, canRedo } = useConfig()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusyRaw] = useState<Progress | null>(null)
  const fromUrlRef = useRef(false)
  const setBusy = (p: Progress | null) => setBusyRaw(p ? { ...p, fromUrl: fromUrlRef.current } : null)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [askConsent, setAskConsent] = useState(() => needsConsent())
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
  // Debug/agent hook: the live state, readable from the console — DEV only:
  // a sandboxed page runs same-origin and could reach `parent.__us`.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __us?: unknown }).__us = loaded
      ? { project: loaded.project, baseline: loaded.report.baseline, cfg, vars, identity: loaded.project.table.identityVars(), dispatch, patch: () => genPatch(loaded.project.table, vars), patched: () => genPatchedFiles(loaded.project.raw, loaded.project.table, vars, fontCss) }
      : null
  }, [loaded, cfg, vars, dispatch, fontCss])
  // The tab title says which project is open (a hostile page may rewrite it —
  // security.md — so it is set from here on every load, not trusted).
  useEffect(() => {
    document.title = loaded ? `UISandbox — ${loaded.project.name}` : 'UISandbox — Test your design on the real thing'
  }, [loaded])
  const changedCount = useMemo(() => {
    if (!loaded) return 0
    const id = loaded.project.table.identityVars()
    return Object.keys(vars).filter((k) => vars[k] !== id[k]).length
  }, [vars, loaded])

  // Write the sheet into the frame's document on every change (same origin,
  // served by our worker) — the whole point: no reload, no flash, live.
  const applyVars = useCallback(() => {
    const top = frameRef.current?.contentDocument
    if (!top) return
    // Their page may hold same-origin frames of its own (Storybook's manager
    // renders every story inside iframe.html): the sheet applies to each.
    for (const doc of [top, ...nestedDocs(top)]) applyTo(doc)
    function applyTo(doc: Document) {
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
    }
  }, [])
  useEffect(() => { applyVars() }, [vars, fontCss, cfg.sb.dark, applyVars])
  // Opened by the local MCP server (`&sync=<id>`): the knobs flow back to it,
  // so an agent can export/verify what the user turned by hand. Same origin,
  // 127.0.0.1, debounced; nothing else ever receives the state.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('sync')
    if (!id || !loaded || !/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return
    const t = setTimeout(() => { void fetch(`/__state/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cfg }) }).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [cfg, loaded])

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
    // The canvas the page PAINTS (html/body computed) corrects a body rule from
    // a shipped-but-inactive theme sheet.
    let paintedCanvas: string | undefined
    try {
      const w = doc.defaultView!
      const bodyBg = w.getComputedStyle(doc.body).backgroundColor, htmlBg = w.getComputedStyle(doc.documentElement).backgroundColor
      const pick = [bodyBg, htmlBg].find((c) => c && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(c))
      if (pick) paintedCanvas = pick
    } catch { /* mid-navigation */ }
    const cfg2 = { ...mid, ...(fromDoc ?? {}) }
    const fams2 = familiesOf(cur.project.table, cfg2.cPrimary, { paintedCanvas })
    const canvasMoved = fams2.canvasId !== cur.report.baseline.families?.canvasId
    if (!fromTable && !fromDoc && !canvasMoved) return
    cur.report.baseline = { cfg: cfg2, tokens: buildTokens(cfg2), families: fams2 }
    if (fromTable) cur.report.notes.push(`Corrected from rules your JS inserted at runtime: ${Object.entries(fromTable).map(([k, v]) => `${k} ${v}`).join(', ')}.`)
    if (fromDoc) cur.report.notes.push(`Corrected from the rendered page: ${Object.entries(fromDoc).map(([k, v]) => `${k} ${v}`).join(', ')}.`)
    // The refined baseline is still the starting point, not a step to undo.
    reset(cfg2)
    setLoaded({ ...cur })
  }, [reset])
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
    let path = win.location.pathname.replace(/^\/__sb\/[^/]+\//, '/').replace(/\/+$/, '') || '/'
    if (cur.project.base && path.startsWith('/' + cur.project.base)) path = path.slice(cur.project.base.length + 1) || '/'
    if (cur.project.screens.some((s) => s.label === path)) return
    cur.project.screens = [...cur.project.screens, { path: path.replace(/^\//, ''), label: path, source: 'pinned' }]
    setLoaded({ ...cur })
  }, [])
  const [thin, setThin] = useState<string | null>(null)
  const [missingFiles, setMissingFiles] = useState<string[]>([])
  useEffect(() => onMissing((project) => { if (loadedRef.current?.project.id === project.id) setMissingFiles(missingFor(project)) }), [])
  useEffect(() => { setMissingFiles(loaded ? missingFor(loaded.project) : []) }, [loaded])
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
      // Nested same-origin frames count as content (Storybook's manager is a
      // shell around iframe.html); a slow manager is empty at 1.2 s and full at
      // 4 s, so a shell verdict needs a second look before it is said.
      const measure = () => {
        const docs = [doc, ...nestedDocs(doc)]
        const els = docs.reduce((n, d) => n + d.body.querySelectorAll('*').length, 0)
        const rules = docs.reduce((n, d) => n + Array.from(d.styleSheets).reduce((m, sh) => { try { return m + sh.cssRules.length } catch { return m } }, 0), 0)
        const text = docs.reduce((n, d) => n + (d.body.innerText ?? '').trim().length, 0)
        const media = docs.reduce((n, d) => n + d.body.querySelectorAll('img, svg, canvas, video, picture').length, 0)
        // A canvas/WebGL page is three elements and no text — and not a shell.
        // No text is suspicious only on a small DOM: 172 animated <div>s (anime.js) are an app.
        const shell = media === 0 && (els < 6 || rules < 3 || (text < 20 && els < 40))
        return { shell, els, rules, text }
      }
      setTimeout(() => {
        const first = measure()
        if (!first.shell) { setThin(null); return }
        setTimeout(() => {
          const m = measure()
          setThin(m.shell ? `This screen rendered ${m.els} element${m.els === 1 ? '' : 's'}, ${m.rules} style rules and ${m.text} characters of visible text — it looks like a shell, not the app (a page the server fills in, a build that needs its API, or a folder without its CSS). What you see here is not what your users see.` : null)
        }, 2800)
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
    track('drop')
    if (!busy) fromUrlRef.current = false
    try {
      setBusy({ stage: 'read', done: 0, total: archive.entries.length, bytes: 0, what: archive.rootName })
      await ensureWorker()
      let lastAt = 0
      const project = await buildProject(archive, {
        root,
        onProgress: (d, t, css) => { const now = Date.now(); if (now - lastAt > 120 || d === t) { lastAt = now; setBusy({ stage: 'read', done: d, total: t, bytes: css, what: archive.rootName }) } },
      })
      // The door opens for what renders 1:1, and for nothing else.
      if (!project.platform.renders || !project.screens.length) throw new Error(refusalFor(project.platform, { files: archive.entries.length }))
      setBusy({ stage: 'derive', total: project.table.entries.length, what: archive.rootName })
      const report = await deriveBaseline(archive, project.table)
      setBusy({ stage: 'open', what: archive.rootName })
      if (loaded) disown(loaded.project)
      own(project, () => varsRef.current)
      // A fresh project is a fresh start: no history, no hash from the last one.
      reset(report.baseline.cfg)
      const wanted = new URLSearchParams(location.search).get('screen')
      const first = (wanted && project.screens.find((s) => s.path === wanted || s.label === wanted)) || project.screens[0]!
      setLoaded({ project, report, screen: first, archive })
      setShowNotes(true)
      track('loaded', { screens: project.screens.length, values: project.table.entries.length })
    } catch (err) {
      setError((err as Error).message)
      track('refused')
    } finally {
      setBusy(null)
    }
  }

  // `?load=<url-to-zip>` opens an archive fetched from a URL (same-origin or
  // CORS-enabled) — for demos, tests and agents; the drop zone stays the door.
  const loadedFromUrl = useRef(false)
  /** A zip by URL — `?load=` (same-origin or CORS) or the repo proxy. */
  const loadFromUrl = async (url: string) => {
    setError(null)
    fromUrlRef.current = true
    try {
      const host = (() => { try { const u = new URL(url, location.href); return u.pathname.startsWith('/__repo/') ? (new URL(u.searchParams.get('u') ?? '', location.href).host || 'github.com') : u.host } catch { return url } })()
      setBusy({ stage: 'fetch', what: host, bytes: 0 })
      const res = await fetch(url)
      if (!res.ok) throw new Error(res.status === 404 ? `Nothing at ${host} for that URL (${res.status}).` : `${res.status} fetching from ${host}.`)
      // Read the body in chunks so the door can count the megabytes coming in.
      const size = Number(res.headers.get('content-length') || 0) || undefined
      const chunks: BlobPart[] = []
      let got = 0
      const reader = res.body?.getReader()
      if (reader) {
        for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.byteLength; setBusy({ stage: 'fetch', what: host, bytes: got, size }) }
      }
      const blob = reader ? new Blob(chunks) : await res.blob()
      const name = decodeURIComponent((res.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1]) || url.split('/').pop() || 'archive.zip')
      await onArchive(await openZip(new File([blob], name.endsWith('.zip') ? name : `${name}.zip`, { type: 'application/zip' })))
    } catch (err) { setError((err as Error).message); setBusy(null) }
  }
  useEffect(() => {
    if (loadedFromUrl.current) return
    const url = new URLSearchParams(location.search).get('load')
    if (!url) return
    loadedFromUrl.current = true
    // A GitHub repository URL works too — `?load=https://github.com/user/repo[/tree/branch]`
    // goes through the repo route — so any agent can say a working link.
    const gh = url.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/i) && !/\.zip($|\?)/i.test(url) && !/\/archive\//i.test(url)
    void loadFromUrl(gh ? `/__repo/?u=${encodeURIComponent(url.startsWith('http') ? url : `https://${url}`)}` : url)
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
        <span className="app__brand"><span className="app__brand-mark"><Mark size={16} /></span>UISandbox <small>your app, 1:1, then the knobs</small></span>
        <span className="app__spacer" />
        <McpButton />
        <a className="btn btn--ghost btn--icon" href="https://github.com/AlexanderKaan/uisandbox" target="_blank" rel="noopener" title="Source on GitHub" aria-label="Source on GitHub"><GithubMark /></a>
        {loaded && (
          <>
            <button type="button" className="btn btn--ghost btn--icon" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)"><Undo2 size={15} /></button>
            <button type="button" className="btn btn--ghost btn--icon" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)"><Redo2 size={15} /></button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowNotes((v) => !v)} title="What we read from your code"><Info size={14} /> Read</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowExport(true)}><Download size={14} /> Export</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { disown(loaded.project); setLoaded(null); reset(DEFAULT_CONFIG) }} title="Close this project"><X size={14} /> Close</button>
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
                codeFonts={codeFonts(loaded.project.table)}
                hasGradients={loaded.project.table.ofKind('angle').length > 0}
                varNow={(id) => vars[varName(id)]}
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
              warning={thin ?? (missingFiles.length ? `${missingFiles.length === 1 ? 'A file' : `${missingFiles.length} files`} this page asked for ${missingFiles.length === 1 ? 'is' : 'are'} not in the archive — ${missingFiles.slice(0, 3).join(', ')}${missingFiles.length > 3 ? '…' : ''}. That usually means source, not the built output: parts of the page cannot run here.` : null)}
              coverage={coverage}
              notes={showNotes ? (
              <div className="card popcard" role="dialog" aria-label="What was read">
                <h3>What we read from your code</h3>
                <ul className="notes">
                  {loaded.report.notes.map((n, i) => <li key={i}>{n}</li>)}
                  <li>{loaded.project.table.entries.length} distinct values in {Math.round(loaded.project.cssBytes / 1024)} KB of CSS: {(['color', 'radius', 'font-size', 'font-family', 'space', 'shadow', 'angle'] as const).map((k) => `${loaded.project.table.ofKind(k).length} ${k === 'angle' ? 'gradient angle' : k}`).join(' · ')}.</li>
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
              ) : null}
            />
          </>
        )}
        {!loaded && <Intake onArchive={onArchive} onUrl={(u) => void loadFromUrl(`/__repo/?u=${encodeURIComponent(u)}`)} busy={busy} error={error} />}
        {askConsent && (
          <div className="consent" role="dialog" aria-label="Analytics">
            <span>We count visits with Google Analytics — no names, nothing about your files. OK?</span>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { setConsent(true); setAskConsent(false) }}>OK</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setConsent(false); setAskConsent(false) }}>No thanks</button>
          </div>
        )}
      </div>
      <Footer />
      {showExport && loaded && (
        <ExportDialog cfg={cfg} table={loaded.project.table} vars={vars} projectName={loaded.project.name} files={loaded.project.raw} fontCss={fontCss} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}
