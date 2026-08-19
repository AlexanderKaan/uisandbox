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
  busy: Progress | null
  error: string | null
}
type Way = 'zip' | 'folder' | 'repo'

/**
 * The door. Three ways in — a zip of the build, a folder (build or source),
 * a public GitHub repo — and, while it works, the stages with their numbers.
 * Everything stays in the tab; the repo route says the one thing that does not.
 */
export function Intake({ onArchive, onUrl, busy, error }: IntakeProps) {
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

  const ways: Array<{ id: Way; label: string; icon: React.ReactNode }> = [
    { id: 'zip', label: 'Upload a zip', icon: <FileArchive size={14} strokeWidth={1.75} /> },
    { id: 'folder', label: 'Upload a codebase', icon: <FolderOpen size={14} strokeWidth={1.75} /> },
    { id: 'repo', label: 'Connect a repo', icon: <GitBranch size={14} strokeWidth={1.75} /> },
  ]

  return (
    <div className="intake">
      <div className="card intake__card">
        <div className="intake__mark"><Mark size={40} /></div>
        <h1>Test your design on the real thing.</h1>
        <p>Your <b>built</b> web app renders here 1:1 — measured, not promised — and every colour, radius, font, size and shadow in its CSS becomes a knob that moves <em>your</em> value. Export exactly what you see.</p>

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
                <svg className="intake__ants" aria-hidden="true"><rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="12" ry="12" /></svg>
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
            <input ref={zipRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeFiles([f]); e.target.value = '' }} />
            <input ref={dirRef} type="file" hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void takeFiles(fs); e.target.value = '' }} />
          </>
        )}
        {(error || localError) && <div className="intake__error">{error || localError}</div>}
        {!busy && <InstallLine />}
        <ul className="intake__how">
          <li>Vite / React / Vue / Svelte: <code>npm run build</code> → <code>dist/</code>. Next.js: <code>output: 'export'</code> → <code>out/</code>. Astro / Eleventy / plain HTML: the output folder.</li>
          <li>iOS and Android apps: no browser renders them — the knobs still export Swift and Android constants (Export → iOS / Android).</li>
          <li>Nothing leaves this tab: files are read here and served to the frame by a service worker on this origin.</li>
        </ul>
      </div>
    </div>
  )
}
