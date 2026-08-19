import { Mark, DropGlyph } from './Mark'
import { useRef, useState } from 'react'
import { FileArchive, FolderOpen, GitBranch, Check } from 'lucide-react'
import { archiveFromFiles, isZip, openZip, type Archive } from '../audit/intake/readZip'
import { filesFromDrop } from '../audit/intake/readFiles'
import { STAGES, fmtBytes, type Progress } from './progress'
import { InstallLine } from './InstallLine'

interface IntakeProps {
  onArchive: (archive: Archive) => void
  /** A zip by URL — the repo route (App fetches, through the proxy when needed). */
  onUrl?: (url: string) => void
  /** A sample build shipped with the site (same origin) — for the visitor without a zip at hand. */
  onSample?: (path: string) => void
  busy: Progress | null
  error: string | null
}
type Way = 'zip' | 'folder' | 'repo'

/** Three real open-source builds (MIT) served from this origin — names people know, with colour everywhere the knobs reach. */
const SAMPLES = [
  { path: '/samples/bootstrap-docs.zip', label: 'Bootstrap docs', title: 'getbootstrap.com — the Bootstrap 5.3 docs build, 114 screens, 8 MB' },
  { path: '/samples/vitepress-site.zip', label: 'VitePress site', title: 'vitepress.dev — 259 screens, 5 MB' },
  { path: '/samples/sb-admin-dashboard.zip', label: 'Admin dashboard', title: 'Start Bootstrap SB Admin 2 — 13 screens, 6 MB' },
]

/**
 * The door. Three ways in — a zip of the build, a folder (build or source),
 * a public GitHub repo — and, while it works, the stages with their numbers.
 * Everything stays in the tab; the repo route says the one thing that does not.
 */
export function Intake({ onArchive, onUrl, onSample, busy, error }: IntakeProps) {
  const [way, setWay] = useState<Way>('zip')
  const [over, setOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [repo, setRepo] = useState('')
  const zipRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)

  const takeFiles = async (files: File[]) => {
    setLocalError(null)
    try {
      if (files.length === 1 && isZip(files[0]!)) onArchive(await openZip(files[0]!))
      else if (files.length) onArchive(archiveFromFiles(files))
    } catch (err) { setLocalError((err as Error).message) }
  }
  const submitRepo = () => {
    setLocalError(null)
    const m = repo.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|commits?)\/([\w./-]+))?\/?$/i)
    if (!m) { setLocalError('Paste a public GitHub repository URL, like https://github.com/user/repo (a branch path is fine).'); return }
    onUrl?.(`https://github.com/${m[1]}/${m[2]}${m[3] ? `/tree/${m[3]}` : ''}`)
  }

  const ways: Array<{ id: Way; label: React.ReactNode; icon: React.ReactNode }> = [
    { id: 'zip', label: <><span className="intake__way-long">Upload a </span>zip</>, icon: <FileArchive size={14} strokeWidth={1.75} /> },
    { id: 'folder', label: <><span className="intake__way-long">Upload a </span>codebase</>, icon: <FolderOpen size={14} strokeWidth={1.75} /> },
    { id: 'repo', label: <><span className="intake__way-long">Connect a </span>repo</>, icon: <GitBranch size={14} strokeWidth={1.75} /> },
  ]

  return (
    <div className="intake">
      <section className="hero">
        <div className="intake__mark"><Mark size={44} /></div>
        <div className="hero__kicker">Test your design on the real thing</div>
        <h1>Restyle your app<br />without rebuilding it.</h1>
        <p className="hero__sub">Try a new look on your real web app — in seconds. Drop the build; every colour, font, radius and spacing in its CSS becomes a knob. Turn them, watch the real app follow 1:1, and export the change as a patch or tokens.</p>
        <InstallLine compact />
        <ul className="hero__proof" aria-label="In short">
          <li><Check size={13} strokeWidth={2.5} /> Free</li>
          <li><Check size={13} strokeWidth={2.5} /> Open source <a href="https://github.com/AlexanderKaan/uisandbox/blob/main/LICENSE" target="_blank" rel="noopener license">(MIT)</a></li>
          <li><Check size={13} strokeWidth={2.5} /> Nothing leaves your tab</li>
        </ul>
      </section>
      <div className="door">
      <div className="card intake__card">

        {busy ? (
          <ol className="intake__stages" aria-live="polite">
            {STAGES.filter((s) => s.id !== 'fetch' || busy.fromUrl).map((s) => {
              const idx = STAGES.findIndex((x) => x.id === s.id), cur = STAGES.findIndex((x) => x.id === busy.stage)
              const state = idx < cur ? 'done' : idx === cur ? 'now' : 'next'
              let detail = ''
              if (state === 'now') {
                if (busy.stage === 'fetch') detail = busy.size ? `${fmtBytes(busy.bytes ?? 0)} of ${fmtBytes(busy.size)} from ${busy.what}` : `${fmtBytes(busy.bytes ?? 0)} from ${busy.what}`
                if (busy.stage === 'read') detail = `${busy.done ?? 0} / ${busy.total ?? 0} files · ${fmtBytes(busy.bytes ?? 0)} of CSS`
                if (busy.stage === 'derive') detail = `${busy.total ?? 0} values → the knobs on the stand of your code`
                if (busy.stage === 'open') detail = 'first paint…'
              }
              return (
                <li key={s.id} className={`intake__stage intake__stage--${state}`}>
                  <span className="intake__stage-dot" aria-hidden>{state === 'done' ? <Check size={11} strokeWidth={3} /> : null}</span>
                  <span className="intake__stage-label">{s.label}</span>
                  {detail && <span className="intake__stage-detail">{detail}</span>}
                </li>
              )
            })}
          </ol>
        ) : (
          <>
            <div className="intake__ways" role="tablist">
              {ways.map((w) => (
                <button key={w.id} type="button" role="tab" aria-selected={way === w.id} className={`intake__way ${way === w.id ? 'intake__way--on' : ''}`} onClick={() => { setWay(w.id); setLocalError(null) }}>{w.icon} {w.label}</button>
              ))}
            </div>
            {way !== 'repo' ? (
              <div
                className={`intake__drop ${over ? 'intake__drop--over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(true) }}
                onDragLeave={() => setOver(false)}
                onDrop={async (e) => {
                  e.preventDefault(); setOver(false)
                  const dropped = Array.from(e.dataTransfer.files || [])
                  if (dropped.length === 1 && isZip(dropped[0]!)) { void takeFiles(dropped); return }
                  const files = await filesFromDrop(e.dataTransfer.items)
                  void takeFiles(files.length ? files : dropped)
                }}
              >
                <svg className="intake__ants" aria-hidden="true">
                  <rect className="intake__ants-dash" x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="12" ry="12" />
                  {/* a light that travels the edge: pathLength normalises the dash to any size */}
                  <rect className="intake__glow intake__glow--halo" x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="12" ry="12" pathLength={1000} />
                  <rect className="intake__glow intake__glow--head" x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="12" ry="12" pathLength={1000} />
                </svg>
                <DropGlyph kind={way === 'zip' ? 'zip' : 'folder'} />
                {way === 'zip' ? (
                  <>
                    <div>Drop the <b>.zip</b> of your build here — its <code>dist/</code>, <code>build/</code> or <code>out/</code> folder, or a whole repo that carries the build inside</div>
                    <div className="intake__choices"><button type="button" className="btn btn--primary" onClick={() => zipRef.current?.click()}><FileArchive size={15} strokeWidth={1.75} /> Choose a zip</button></div>
                  </>
                ) : (
                  <>
                    <div>Drop a <b>folder</b> here — the build folder renders 1:1; a source folder is read for the knob stand only (a build is needed to render)</div>
                    <div className="intake__choices"><button type="button" className="btn btn--primary" onClick={() => dirRef.current?.click()}><FolderOpen size={15} strokeWidth={1.75} /> Choose a folder</button></div>
                  </>
                )}
              </div>
            ) : (
              <div className="intake__drop intake__drop--repo">
                <div>Paste a <b>public</b> GitHub repository — its default branch (or a <code>/tree/branch</code> URL) is fetched as a zip and loaded here</div>
                <form className="intake__repo" onSubmit={(e) => { e.preventDefault(); submitRepo() }}>
                  <input className="intake__input" type="url" placeholder="https://github.com/user/repo" value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="GitHub repository URL" spellCheck={false} />
                  <button type="submit" className="btn btn--primary"><GitBranch size={15} strokeWidth={1.75} /> Load</button>
                </form>
                <div className="intake__note">GitHub does not allow the browser to fetch a repo zip directly, so the URL goes through uisandbox.org to fetch it — public repos only, nothing stored. Everything else stays in this tab.</div>
              </div>
            )}
            {onSample && (
              <div className="intake__samples">
                <span>No build at hand? Try a sample:</span>
                {SAMPLES.map((x) => <button key={x.path} type="button" className="intake__sample" onClick={() => onSample(x.path)} title={x.title}>{x.label}</button>)}
              </div>
            )}
            <input ref={zipRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeFiles([f]); e.target.value = '' }} />
            <input ref={dirRef} type="file" hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void takeFiles(fs); e.target.value = '' }} />
          </>
        )}
        {(error || localError) && <div className="intake__error">{error || localError}</div>}
      </div>
      </div>
      {!busy && <Landing />}
    </div>
  )
}

/** The one-pager under the door: what it does, what moves, how it stays honest, for agents. Plain, black and white, no claims the meter would contradict. */
function Landing() {
  return (
    <div className="landing">
      <section className="landing__sec">
        <h2>How it works</h2>
        <ol className="steps">
          <li><b>Bring the build.</b> A zip of <code>dist/</code>, <code>build/</code> or <code>out/</code>, a folder, or a public GitHub repo. Files are read in this tab and served to the frame by a service worker — nothing is uploaded.</li>
          <li><b>See it 1:1.</b> Every CSS literal becomes a variable holding the very same value, so the page renders exactly as it was — runtime styles, CDN stylesheets and nested frames included.</li>
          <li><b>Turn the knobs.</b> Brand and the colour families your CSS actually contains, background, fonts, size, spacing, radius, elevation, motion, hue/saturation/contrast, your dark mode — every dial with <em>×1 = as in your code</em> at its centre.</li>
          <li><b>Export what you see.</b> Your values as CSS / JSON / a patch, your files patched in place, design tokens (CSS, Tailwind, shadcn), Swift and Android constants.</li>
        </ol>
      </section>
      <figure className="shot">
        <img src="/shot-stage.png" alt="UISandbox: a real app in the sandbox with the knobs panel beside it; the Brand knob opened and set to crimson, the page following" loading="lazy" width="1440" height="900" />
        <figcaption>A real build in the sandbox. Brand turned to crimson — five values moved, the page followed; <em>Back to your code</em> is one click.</figcaption>
      </figure>
      <section className="landing__sec landing__cols">
        <div>
          <h2>Honest by construction</h2>
          <p><b>"1:1" is measured.</b> <em>Check 1:1</em> loads the untouched build and the tokenised build side by side and diffs the computed styles of every element (18 properties, shadow roots and nested frames included). Zero differences, or it says what differs.</p>
          <p><b>A reach meter</b> says how much of what you see the knobs touch — painted colours, families, sizes, radii — and what lies outside (images, canvas, video).</p>
          <p><b>It refuses what it cannot show.</b> iOS and Android projects, WordPress themes and source without a build get a clear message at the door; a page that asks for files the archive does not hold says so.</p>
        </div>
        <figure className="shot shot--small">
          <img src="/shot-verify.png" alt="The 1:1 check card: elements paired, zero computed-style differences" loading="lazy" />
        </figure>
      </section>
      <section className="landing__sec">
        <h2>Nothing leaves your tab</h2>
        <p>There is no server behind the sandbox. Your files are read in the page and served to the frame by a service worker on this origin; the knobs are a URL hash; exports are generated here. The one exception is <em>Connect a repo</em>: a public GitHub URL goes through uisandbox.org to fetch the zip, because GitHub will not let a browser fetch it directly — nothing is stored. A hostile archive cannot navigate this page away, register its own worker, or smuggle a path out of an export. <a href="https://github.com/AlexanderKaan/uisandbox/blob/main/notes/security.md" target="_blank" rel="noopener">The full security note.</a></p>
      </section>
      <section className="landing__sec">
        <h2>From your terminal, or from your agent</h2>
        <p>The same engine runs as an MCP server, and as a <b>Claude Code skill</b> — <code>/uisandbox</code>. Say <em>"open this app in UISandbox"</em> and it builds, loads and opens the real sandbox in your browser; what you turn comes back, so <em>"export what I changed"</em> just works. The plugin installs the skill and the server in one step; any MCP client (Cursor, Claude Desktop, Codex) gets the server and its own <code>/uisandbox:open</code> prompt. Or <code>npx uisandbox-mcp open ./dist</code> without any agent.</p>
        <InstallLine />
      </section>
      <section className="landing__sec landing__sec--quiet">
        <h2>Who made this</h2>
        <p>UISandbox is made by <a href="https://github.com/AlexanderKaan" target="_blank" rel="noopener">Alexander Kaan</a> at <a href="https://pageminds.com/" target="_blank" rel="noopener">Pageminds</a>. MIT, free forever, <a href="https://github.com/AlexanderKaan/uisandbox" target="_blank" rel="noopener">open source</a>. Every decision that shaped it — and every trap it fell into — is written down in the repo's <a href="https://github.com/AlexanderKaan/uisandbox/blob/main/notes/decisions.md" target="_blank" rel="noopener">notes</a>.</p>
      </section>
    </div>
  )
}
