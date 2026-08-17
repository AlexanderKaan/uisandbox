import { useEffect, useRef, useState, type RefObject } from 'react'
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import type { SandboxProject, Screen } from '../sandbox/project'
import { identitySid, rawSid, sandboxUrl } from '../sandbox/host'
import { compareDocuments, loadHidden, type VerifyResult } from '../sandbox/verify'

interface StageProps {
  project: SandboxProject
  screen: Screen
  onScreen: (s: Screen) => void
  frameRef: RefObject<HTMLIFrameElement | null>
  /** Called after each load so the live sheet can be (re)applied. */
  onLoaded: () => void
  changedCount: number
}

const WIDTHS: Array<{ id: string; label: string; w: number | null }> = [
  { id: 'fit', label: 'Fit', w: null },
  { id: 'desktop', label: '1280', w: 1280 },
  { id: 'tablet', label: '820', w: 820 },
  { id: 'phone', label: '390', w: 390 },
]

export function Stage({ project, screen, onScreen, frameRef, onLoaded, changedCount }: StageProps) {
  const [width, setWidth] = useState<string>('fit')
  const [verify, setVerify] = useState<VerifyResult | { busy: true } | null>(null)
  const [showVerify, setShowVerify] = useState(false)
  const hiddenHost = useRef<HTMLDivElement>(null)
  const w = WIDTHS.find((x) => x.id === width)?.w ?? null
  const src = sandboxUrl(project.id, screen.path)

  // A new project or screen invalidates the last measurement.
  useEffect(() => { setVerify(null) }, [project.id, screen.path])

  const runVerify = async () => {
    setVerify({ busy: true })
    setShowVerify(true)
    const host = hiddenHost.current!
    host.replaceChildren()
    const frame = frameRef.current
    const fw = frame?.clientWidth ?? 1200, fh = frame?.clientHeight ?? 800
    try {
      const [raw, idn] = await Promise.all([
        loadHidden(sandboxUrl(rawSid(project.id), screen.path), host, fw, fh),
        loadHidden(sandboxUrl(identitySid(project.id), screen.path), host, fw, fh),
      ])
      setVerify(compareDocuments(raw.doc, idn.doc))
    } catch (err) {
      setVerify({ ok: false, refusal: `Could not load both frames: ${(err as Error).message}`, elements: 0, unpaired: { raw: 0, sandbox: 0 }, mismatches: [] })
    } finally {
      host.replaceChildren()
    }
  }

  return (
    <section className="stage">
      <div className="stage__bar">
        <div className="stage__tabs" role="tablist" aria-label="Screens">
          {project.screens.map((s) => (
            <button key={s.path} role="tab" aria-selected={s.path === screen.path} className={`stage__tab ${s.path === screen.path ? 'stage__tab--on' : ''}`} onClick={() => onScreen(s)} title={s.path}>
              {s.label}
            </button>
          ))}
        </div>
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
          ref={frameRef}
          className="stage__iframe"
          title={`${project.name} — ${screen.label}`}
          src={src}
          style={w ? { width: w, maxWidth: '100%' } : undefined}
          onLoad={onLoaded}
        />
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
        {changedCount > 0 ? <span className="chip chip--warn"><span className="chip__dot" />{changedCount} value{changedCount === 1 ? '' : 's'} moved</span> : <span className="chip chip--ok"><span className="chip__dot" />identity — nothing turned</span>}
        <button type="button" className="chip" onClick={runVerify} title="Measure: compare the untouched page with the tokenised page, element by element">
          <ShieldCheck size={12} strokeWidth={2} /> {verify && !('busy' in verify) ? (verify.ok ? '1:1 verified' : verify.refusal ? '1:1 unmeasured' : '1:1 differs') : 'Check 1:1'}
        </button>
      </div>
    </section>
  )
}
