import { track } from '../analytics'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { ExternalLink, RefreshCw, ShieldCheck, Star } from 'lucide-react'
import { ScreenPicker } from './ScreenPicker'
import type { SandboxProject, Screen } from '../sandbox/project'
import { identitySid, rawSid, sandboxUrl } from '../sandbox/host'
import { compareDocuments, loadHidden, type VerifyResult } from '../sandbox/verify'
import { pct, type Coverage } from '../sandbox/coverage'

interface StageProps {
  project: SandboxProject
  screen: Screen
  onScreen: (s: Screen) => void
  frameRef: RefObject<HTMLIFrameElement | null>
  /** Called after each load so the live sheet can be (re)applied. */
  onLoaded: () => void
  /** Add the frame's current route to the screens. */
  onPin: () => void
  changedCount: number
  /** A doubt about the render worth saying out loud (a shell, not the app). */
  warning?: string | null
  /** The warning card's heading; default asks whether this is the built app. */
  warningTitle?: string
  /** How much of what is painted the knobs reach — measured on the frame. */
  coverage?: Coverage | null
  /** The "What we read from your code" card — shown in the top-right slot
   *  whenever the 1:1 check is not; one card at a time, never two on top of
   *  each other. */
  notes?: React.ReactNode
}

const WIDTHS: Array<{ id: string; label: string; w: number | null }> = [
  { id: 'fit', label: 'Fit', w: null },
  { id: 'desktop', label: '1280', w: 1280 },
  { id: 'tablet', label: '820', w: 820 },
  { id: 'phone', label: '390', w: 390 },
]

/** What a sandboxed document may do — everything a page needs, minus top navigation. */
export const SANDBOX_FLAGS = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock allow-orientation-lock'

export function Stage({ project, screen, onScreen, frameRef, onLoaded, onPin, changedCount, warning, warningTitle, coverage, notes }: StageProps) {
  const [showCov, setShowCov] = useState(false)
  const [width, setWidth] = useState<string>('fit')
  const [verify, setVerify] = useState<VerifyResult | { busy: true } | null>(null)
  const [showVerify, setShowVerify] = useState(false)
  const [leftSandbox, setLeftSandbox] = useState(false)
  const hiddenHost = useRef<HTMLDivElement>(null)
  const w = WIDTHS.find((x) => x.id === width)?.w ?? null
  const src = sandboxUrl(project.id, screen.path, project.base)

  // A new project or screen invalidates the last measurement.
  useEffect(() => { setVerify(null); setLeftSandbox(false) }, [project.id, screen.path])

  const runVerify = async () => {
    setVerify({ busy: true })
    setShowVerify(true)
    const host = hiddenHost.current!
    host.replaceChildren()
    const frame = frameRef.current
    const fw = frame?.clientWidth ?? 1200, fh = frame?.clientHeight ?? 800
    try {
      const [raw, idn] = await Promise.all([
        loadHidden(sandboxUrl(rawSid(project.id), screen.path, project.base), host, fw, fh),
        loadHidden(sandboxUrl(identitySid(project.id), screen.path, project.base), host, fw, fh),
      ])
      let res = compareDocuments(raw.doc, idn.doc)
      // A carousel mid-slide (jQuery animating margin-left, no CSS transition
      // to freeze) is two moments, not two stylesheets: when the only
      // differences are a few layout offsets, look again after a beat and keep
      // what persists.
      const LAYOUT = /^(margin|padding|gap)/
      if (!res.ok && !res.refusal && res.mismatches.length <= 4 && res.mismatches.every((m) => LAYOUT.test(m.prop))) {
        await new Promise((r) => setTimeout(r, 900))
        const again = compareDocuments(raw.doc, idn.doc)
        const persistent = res.mismatches.filter((m) => again.mismatches.some((n) => n.index === m.index && n.prop === m.prop))
        res = { ...again, mismatches: persistent, ok: persistent.length === 0 }
      }
      setVerify(res)
      track('verified', { ok: res.ok, refused: !!res.refusal })
    } catch (err) {
      setVerify({ ok: false, refusal: `Could not load both frames: ${(err as Error).message}`, elements: 0, unpaired: { raw: 0, sandbox: 0 }, mismatches: [] })
    } finally {
      host.replaceChildren()
    }
  }

  return (
    <section className="stage">
      <div className="stage__bar">
        <ScreenPicker screens={project.screens} current={screen} onPick={onScreen} onPin={onPin} />
        <div className="seg" role="group" aria-label="Viewport width">
          {WIDTHS.map((x) => (
            <button key={x.id} className={`seg__opt ${x.id === width ? 'seg__opt--on' : ''}`} onClick={() => setWidth(x.id)}>{x.label}</button>
          ))}
        </div>
        <span className="stage__spacer" style={{ flex: 1 }} />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { const f = frameRef.current; if (f) f.src = src }} title="Reload the screen">
          <RefreshCw size={13} strokeWidth={2} /> Reload
        </button>
        <a className="btn btn--ghost btn--sm" href={src} target="_blank" rel="noreferrer" title="Open this screen in a new tab (same sandbox)">
          <ExternalLink size={13} strokeWidth={2} /> Open
        </a>
      </div>
      <div className={`stage__frame ${w ? 'stage__frame--w' : ''}`}>
        <iframe
          key={project.id}
          name={`us:${project.id}`}
          ref={frameRef}
          className="stage__iframe"
          // Their scripts run same-origin (the worker serves them), so the one
          // thing the sandbox flag can still deny is worth denying: navigating
          // the TOP window (`top.location = …` in a hostile build hijacked the
          // whole app). No allow-top-navigation, no downloads.
          sandbox={SANDBOX_FLAGS}
          title={`${project.name} — ${screen.label}`}
          src={src}
          style={w ? { width: w, maxWidth: '100%' } : undefined}
          onLoad={() => {
            // A page that redirected to another origin is out of our hands.
            let away = false
            try { void frameRef.current?.contentDocument?.body } catch { away = true }
            if (!away && frameRef.current && !frameRef.current.contentDocument) away = true
            setLeftSandbox(away)
            if (!away) onLoaded()
          }}
        />
        {!showVerify && notes}
        <div className="stage__low">
        {showCov && coverage && (
          <div className="card popcard popcard--low verify" role="dialog" aria-label="Reach">
            <h3>What the knobs reach on this screen</h3>
            <div>Of {coverage.elements} visible elements: <b>{coverage.colours.hit}/{coverage.colours.total}</b> painted colours (text, backgrounds, borders), <b>{coverage.fonts.hit}/{coverage.fonts.total}</b> text families, <b>{coverage.sizes.hit}/{coverage.sizes.total}</b> text sizes and <b>{coverage.radii.hit}/{coverage.radii.total}</b> corner radii come from your CSS literals and follow the knobs.</div>
            <div style={{ marginTop: 6 }}>Outside any knob: {coverage.outside.images} image{coverage.outside.images === 1 ? '' : 's'}, {coverage.outside.canvas} canvas, {coverage.outside.video} video, {coverage.outside.backgroundImages} background image{coverage.outside.backgroundImages === 1 ? '' : 's'} — pixels no CSS value can move.</div>
            <div style={{ marginTop: 10 }}><button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowCov(false)}>Close</button></div>
          </div>
        )}
        {warning && !leftSandbox && (
          <div className="card popcard popcard--low verify" role="status"><h3>{warningTitle ?? 'Is this the built app?'}</h3><div>{warning}</div></div>
        )}
        {leftSandbox && (
          <div className="card popcard popcard--low verify" role="status">
            <h3>This screen left the sandbox</h3>
            <div>The page navigated to another origin (a redirect page, or a script that sends visitors elsewhere). Nothing there is yours to tune — pick another screen.</div>
          </div>
        )}
        </div>
        <div ref={hiddenHost} aria-hidden="true" />
        {showVerify && (
          <div className="card popcard verify" role="dialog" aria-label="1:1 check">
            <h3>1:1 check — untouched vs. tokenised, identity sheet</h3>
            {!verify || 'busy' in verify ? (
              <div>Loading both versions of this screen and comparing every element…</div>
            ) : verify.refusal ? (
              <div>⚠ {verify.refusal}</div>
            ) : verify.ok ? (
              <div>✓ <b>{verify.elements}</b> elements paired, <b>0</b> computed-style differences across 18 properties.{verify.unpaired.raw + verify.unpaired.sandbox > 0 ? ` ${verify.unpaired.raw + verify.unpaired.sandbox} elements differed between the two loads (ads, widgets) and were left out.` : ''} What you see is your CSS with its literals replaced by variables holding the very same values.</div>
            ) : (
              <div>
                ✗ {verify.mismatches.length}{verify.mismatches.length >= 40 ? '+' : ''} differences on {verify.elements} elements — a rewriter gap. Please report the first few:
                <ul className="verify__list">
                  {verify.mismatches.slice(0, 12).map((m, i) => (
                    <li key={i}>&lt;{m.tag}&gt;#{m.index} {m.prop}: {m.raw} → {m.sandbox}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn--secondary btn--sm" onClick={runVerify}>Run again</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowVerify(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
      <div className="stage__foot">
        <span><b>{project.name}</b>{project.root ? ` · root ${project.root}/` : ''} · {project.screens.length} screen{project.screens.length === 1 ? '' : 's'} · {project.table.entries.length} values tokenised from {Math.round(project.cssBytes / 1024)} KB of CSS</span>
        <span className="stage__spacer" />
        {coverage && (
          <button type="button" className={`chip ${pct(coverage.colours) < 80 ? 'chip--warn' : ''}`} onClick={() => setShowCov((v) => !v)} title="How much of what you see the knobs reach — measured on this screen">
            reach {pct(coverage.colours)}% colours · {pct(coverage.fonts)}% type · {pct(coverage.radii)}% radii{coverage.outside.images + coverage.outside.canvas + coverage.outside.backgroundImages ? ` · ${coverage.outside.images + coverage.outside.canvas + coverage.outside.backgroundImages} outside` : ''}
          </button>
        )}
        {changedCount > 0 ? <span className="chip chip--warn"><span className="chip__dot" />{changedCount} value{changedCount === 1 ? '' : 's'} moved</span> : <span className="chip chip--ok"><span className="chip__dot" />identity — nothing turned</span>}
        <button type="button" className="chip" onClick={runVerify} title="Measure: compare the untouched page with the tokenised page, element by element">
          <ShieldCheck size={12} strokeWidth={2} /> {verify && !('busy' in verify) ? (verify.ok ? '1:1 verified' : verify.refusal ? '1:1 unmeasured' : '1:1 differs') : 'Check 1:1'}
        </button>
        {/* The ask, at the moment it has earned it: once something was turned or the check passed. */}
        {(changedCount > 0 || (verify && !('busy' in verify) && verify.ok)) && (
          <a className="chip stage__star" href="https://github.com/AlexanderKaan/uisandbox" target="_blank" rel="noopener" title="Useful? A star on GitHub helps others find it"><Star size={12} strokeWidth={2} /> Useful? Star it</a>
        )}
      </div>
    </section>
  )
}
